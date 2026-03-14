"""
/collections  — personal recipe cookbooks (CRUD + recipe membership).

Permissions:
  GET  — any authenticated user (own collections only)
  POST/PUT/DELETE — owner only
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models import Collection, CollectionRecipe, Recipe, User
from app.schemas import (
    CollectionCreate,
    CollectionOut,
    CollectionUpdate,
    PaginatedCollections,
    PaginatedRecipes,
    RecipeOut,
)

router = APIRouter()


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _get_collection_or_404(
    collection_id: int, user: User, db: AsyncSession
) -> Collection:
    result = await db.execute(
        select(Collection).where(
            Collection.id == collection_id,
            Collection.owner_id == user.id,
        )
    )
    col = result.scalar_one_or_none()
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")
    return col


async def _recipe_count(collection_id: int, db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count()).where(CollectionRecipe.collection_id == collection_id)
    )
    return result.scalar() or 0


def _col_to_out(col: Collection, recipe_count: int) -> CollectionOut:
    return CollectionOut(
        id=col.id,
        name=col.name,
        description=col.description,
        cover_image_url=col.cover_image_url,
        created_at=col.created_at,
        recipe_count=recipe_count,
    )


# ─── GET /collections ─────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedCollections)
async def list_collections(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base = select(Collection).where(Collection.owner_id == current_user.id)

    total: int = await db.scalar(
        select(func.count()).select_from(base.subquery())
    ) or 0

    result = await db.execute(
        base.order_by(Collection.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    cols = result.scalars().all()

    items: List[CollectionOut] = []
    for col in cols:
        count = await _recipe_count(col.id, db)
        items.append(_col_to_out(col, count))

    return PaginatedCollections(total=total, page=page, page_size=page_size, items=items)


# ─── POST /collections ────────────────────────────────────────────────────────

@router.post("", response_model=CollectionOut, status_code=status.HTTP_201_CREATED)
async def create_collection(
    data: CollectionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    col = Collection(
        owner_id=current_user.id,
        name=data.name,
        description=data.description,
        cover_image_url=data.cover_image_url,
    )
    db.add(col)
    await db.flush()
    return _col_to_out(col, 0)


# ─── GET /collections/{id} ────────────────────────────────────────────────────

@router.get("/{collection_id}", response_model=CollectionOut)
async def get_collection(
    collection_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    col = await _get_collection_or_404(collection_id, current_user, db)
    count = await _recipe_count(col.id, db)
    return _col_to_out(col, count)


# ─── PUT /collections/{id} ────────────────────────────────────────────────────

@router.put("/{collection_id}", response_model=CollectionOut)
async def update_collection(
    collection_id: int,
    data: CollectionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    col = await _get_collection_or_404(collection_id, current_user, db)
    if data.name is not None:
        col.name = data.name
    if data.description is not None:
        col.description = data.description
    if data.cover_image_url is not None:
        col.cover_image_url = data.cover_image_url
    await db.flush()
    count = await _recipe_count(col.id, db)
    return _col_to_out(col, count)


# ─── DELETE /collections/{id} ─────────────────────────────────────────────────

@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collection(
    collection_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    col = await _get_collection_or_404(collection_id, current_user, db)
    await db.delete(col)


# ─── POST /collections/{id}/recipes/{recipe_id} ───────────────────────────────

@router.post(
    "/{collection_id}/recipes/{recipe_id}",
    status_code=status.HTTP_201_CREATED,
)
async def add_recipe_to_collection(
    collection_id: int,
    recipe_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_collection_or_404(collection_id, current_user, db)

    # Check recipe exists
    result = await db.execute(select(Recipe).where(Recipe.id == recipe_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Recipe not found")

    # Idempotent — ignore if already added
    existing = await db.execute(
        select(CollectionRecipe).where(
            CollectionRecipe.collection_id == collection_id,
            CollectionRecipe.recipe_id == recipe_id,
        )
    )
    if not existing.scalar_one_or_none():
        db.add(CollectionRecipe(collection_id=collection_id, recipe_id=recipe_id))
        await db.flush()

    return {"collection_id": collection_id, "recipe_id": recipe_id}


# ─── DELETE /collections/{id}/recipes/{recipe_id} ────────────────────────────

@router.delete(
    "/{collection_id}/recipes/{recipe_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_recipe_from_collection(
    collection_id: int,
    recipe_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_collection_or_404(collection_id, current_user, db)
    result = await db.execute(
        select(CollectionRecipe).where(
            CollectionRecipe.collection_id == collection_id,
            CollectionRecipe.recipe_id == recipe_id,
        )
    )
    entry = result.scalar_one_or_none()
    if entry:
        await db.delete(entry)


# ─── GET /collections/{id}/recipes ───────────────────────────────────────────

@router.get("/{collection_id}/recipes", response_model=PaginatedRecipes)
async def list_collection_recipes(
    collection_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_collection_or_404(collection_id, current_user, db)

    base = (
        select(Recipe)
        .join(CollectionRecipe, CollectionRecipe.recipe_id == Recipe.id)
        .where(CollectionRecipe.collection_id == collection_id)
        .options(selectinload(Recipe.tags))
    )

    total: int = await db.scalar(
        select(func.count()).select_from(base.subquery())
    ) or 0

    result = await db.execute(
        base.order_by(CollectionRecipe.added_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    recipes = result.scalars().unique().all()

    return PaginatedRecipes(
        total=total, page=page, page_size=page_size, items=list(recipes)
    )
