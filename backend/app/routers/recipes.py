"""
/recipes  — CRUD + paginated search with tag filtering.

Permissions:
  GET  — any authenticated user
  POST — any authenticated user (becomes owner)
  PUT  — owner or admin
  DELETE — owner or admin
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models import Ingredient, Recipe, Step, Tag, User, UserRole
from app.schemas import (
    PaginatedRecipes,
    RecipeCreate,
    RecipeOut,
    RecipeSummary,
    RecipeUpdate,
    TagOut,
)

router = APIRouter()


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _get_recipe_or_404(recipe_id: int, db: AsyncSession) -> Recipe:
    result = await db.execute(
        select(Recipe)
        .where(Recipe.id == recipe_id)
        .options(
            selectinload(Recipe.ingredients),
            selectinload(Recipe.steps),
            selectinload(Recipe.tags),
        )
    )
    recipe = result.scalar_one_or_none()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe


def _assert_can_modify(recipe: Recipe, user: User) -> None:
    if recipe.owner_id != user.id and user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to modify this recipe",
        )


async def _resolve_tags(tag_names: List[str], db: AsyncSession) -> List[Tag]:
    tags: List[Tag] = []
    for raw_name in tag_names:
        name = raw_name.strip().lower()
        if not name:
            continue
        result = await db.execute(select(Tag).where(Tag.name == name))
        tag = result.scalar_one_or_none()
        if not tag:
            tag = Tag(name=name)
            db.add(tag)
            await db.flush()
        tags.append(tag)
    return tags


# ─── GET /recipes ─────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedRecipes)
async def list_recipes(
    page: int = Query(1, ge=1, description="1-based page number"),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, description="Full-text search on title and description"),
    tags: Optional[List[str]] = Query(None, description="Filter by tag names (AND logic)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return a paginated list of recipes, optionally filtered by search text and tags."""
    # ── build base query ──
    base = select(Recipe).options(selectinload(Recipe.tags))

    if search:
        term = f"%{search.strip()}%"
        base = base.where(
            or_(
                Recipe.title.ilike(term),
                Recipe.description.ilike(term),
            )
        )

    if tags:
        # Each tag must match (successive inner joins act as AND)
        for tag_name in tags:
            tag_alias = Tag.__table__.alias()
            base = (
                base
                .join(Recipe.tags)
                .where(Tag.name == tag_name.strip().lower())
                .distinct()
            )

    # ── count ──
    count_q = select(func.count()).select_from(base.subquery())
    total: int = await db.scalar(count_q) or 0

    # ── fetch page ──
    paged = (
        base
        .order_by(Recipe.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(paged)
    recipes = result.scalars().unique().all()

    return PaginatedRecipes(total=total, page=page, page_size=page_size, items=list(recipes))


# ─── GET /recipes/tags ────────────────────────────────────────────────────────

@router.get("/tags", response_model=List[TagOut])
async def list_tags(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all tags (for filter UI)."""
    result = await db.execute(select(Tag).order_by(Tag.name))
    return result.scalars().all()


# ─── GET /recipes/{id} ────────────────────────────────────────────────────────

@router.get("/{recipe_id}", response_model=RecipeOut)
async def get_recipe(
    recipe_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_recipe_or_404(recipe_id, db)


# ─── POST /recipes ────────────────────────────────────────────────────────────

@router.post("", response_model=RecipeOut, status_code=status.HTTP_201_CREATED)
async def create_recipe(
    data: RecipeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recipe = Recipe(
        title=data.title,
        description=data.description,
        source_url=data.source_url,
        image_url=data.image_url,
        cook_time_minutes=data.cook_time_minutes,
        prep_time_minutes=data.prep_time_minutes,
        servings=data.servings,
        calories_per_serving=data.calories_per_serving,
        cuisine=data.cuisine,
        difficulty=data.difficulty,
        owner_id=current_user.id,
    )
    db.add(recipe)
    await db.flush()  # get recipe.id before adding children

    for ing in data.ingredients:
        db.add(Ingredient(recipe_id=recipe.id, **ing.model_dump()))

    for step in data.steps:
        db.add(Step(recipe_id=recipe.id, **step.model_dump()))

    recipe.tags = await _resolve_tags(data.tags, db)

    await db.flush()
    return await _get_recipe_or_404(recipe.id, db)


# ─── PUT /recipes/{id} ────────────────────────────────────────────────────────

@router.put("/{recipe_id}", response_model=RecipeOut)
async def update_recipe(
    recipe_id: int,
    data: RecipeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recipe = await _get_recipe_or_404(recipe_id, db)
    _assert_can_modify(recipe, current_user)

    # Update scalar fields (skip None — partial update)
    scalar_fields = ["title", "description", "source_url", "image_url",
                     "cook_time_minutes", "prep_time_minutes", "servings",
                     "calories_per_serving", "cuisine", "difficulty"]
    for field in scalar_fields:
        value = getattr(data, field)
        if value is not None:
            setattr(recipe, field, value)

    # Replace ingredient list
    if data.ingredients is not None:
        for ing in list(recipe.ingredients):
            await db.delete(ing)
        await db.flush()
        for ing in data.ingredients:
            db.add(Ingredient(recipe_id=recipe.id, **ing.model_dump()))

    # Replace step list
    if data.steps is not None:
        for step in list(recipe.steps):
            await db.delete(step)
        await db.flush()
        for step in data.steps:
            db.add(Step(recipe_id=recipe.id, **step.model_dump()))

    # Replace tag list
    if data.tags is not None:
        recipe.tags = await _resolve_tags(data.tags, db)

    await db.flush()
    return await _get_recipe_or_404(recipe_id, db)


# ─── DELETE /recipes/{id} ─────────────────────────────────────────────────────

@router.delete("/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recipe(
    recipe_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Recipe).where(Recipe.id == recipe_id))
    recipe = result.scalar_one_or_none()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    _assert_can_modify(recipe, current_user)
    await db.delete(recipe)
