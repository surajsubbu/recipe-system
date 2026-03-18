"""
/shopping-list  — manage a user's active shopping list.

GET  /shopping-list                     → user's current list (created on demand)
POST /shopping-list/items               → add a manual item
POST /shopping-list/generate/{recipe_id}→ bulk-add recipe ingredients
PATCH /shopping-list/items/{item_id}    → update / check / uncheck an item
DELETE /shopping-list/items/{item_id}   → remove one item
DELETE /shopping-list/clear-checked     → remove all checked items

One active list per user — we always operate on the most recent one and
create it automatically if it doesn't exist.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models import Ingredient, Recipe, ShoppingItem, ShoppingList, User
from app.schemas import (
    ShoppingItemCreate,
    ShoppingItemOut,
    ShoppingItemUpdate,
    ShoppingListOut,
)

router = APIRouter()


# ─── Pluralization helper ──────────────────────────────────────────────────────

def _singularize(name: str) -> str:
    """Strip common English plural suffixes to normalize ingredient names for merging."""
    lower = name.lower().strip()
    if lower.endswith("ies") and len(lower) > 4:
        return lower[:-3] + "y"  # berries -> berry
    if lower.endswith("ves") and len(lower) > 4:
        return lower[:-3] + "f"  # halves -> half
    if lower.endswith("ses") or lower.endswith("ches") or lower.endswith("shes") or lower.endswith("xes") or lower.endswith("zes"):
        return lower[:-2]  # tomatoes stays, but addresses -> address, etc.
    if lower.endswith("oes") and len(lower) > 4:
        return lower[:-2]  # tomatoes -> tomato, potatoes -> potato
    if lower.endswith("s") and not lower.endswith("ss") and len(lower) > 3:
        return lower[:-1]  # onions -> onion
    return lower


# ─── Helper: get-or-create the user's active shopping list ───────────────────

async def _get_or_create_list(user: User, db: AsyncSession) -> ShoppingList:
    result = await db.execute(
        select(ShoppingList)
        .where(ShoppingList.owner_id == user.id)
        .options(selectinload(ShoppingList.items))
        .order_by(ShoppingList.created_at.desc())
        .limit(1)
    )
    shopping_list = result.scalar_one_or_none()
    if not shopping_list:
        shopping_list = ShoppingList(owner_id=user.id)
        db.add(shopping_list)
        await db.flush()
        # Reload with eager-loaded items to avoid lazy-load in async context
        result = await db.execute(
            select(ShoppingList)
            .where(ShoppingList.id == shopping_list.id)
            .options(selectinload(ShoppingList.items))
        )
        shopping_list = result.scalar_one()
    return shopping_list


async def _get_item_or_404(item_id: int, user: User, db: AsyncSession) -> ShoppingItem:
    result = await db.execute(
        select(ShoppingItem)
        .join(ShoppingList)
        .where(ShoppingItem.id == item_id, ShoppingList.owner_id == user.id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Shopping item not found")
    return item


# ─── GET /shopping-list ───────────────────────────────────────────────────────

@router.get("", response_model=ShoppingListOut)
async def get_shopping_list(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return (or auto-create) the user's active shopping list."""
    return await _get_or_create_list(current_user, db)


# ─── POST /shopping-list/items ────────────────────────────────────────────────

@router.post(
    "/items",
    response_model=ShoppingItemOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_item(
    data: ShoppingItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually add a single item to the shopping list."""
    shopping_list = await _get_or_create_list(current_user, db)
    item = ShoppingItem(
        list_id=shopping_list.id,
        name=data.name,
        amount=data.amount,
        unit=data.unit,
        category=data.category,
        checked=False,
    )
    db.add(item)
    await db.flush()
    return item


# ─── POST /shopping-list/generate/{recipe_id} ────────────────────────────────

@router.post(
    "/generate/{recipe_id}",
    response_model=ShoppingListOut,
    status_code=status.HTTP_201_CREATED,
)
async def generate_from_recipe(
    recipe_id: int,
    exclude_ids: list[int] = Query(default=[]),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Bulk-add all ingredients from a recipe to the shopping list.
    Uses the normalized name and AI-assigned category from ingestion.
    """
    result = await db.execute(
        select(Recipe)
        .where(Recipe.id == recipe_id)
        .options(selectinload(Recipe.ingredients))
    )
    recipe = result.scalar_one_or_none()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    shopping_list = await _get_or_create_list(current_user, db)

    # Build lookup for merging: (singularized_name, unit_lower) → existing item
    existing_lookup: dict[tuple, ShoppingItem] = {}
    for existing_item in shopping_list.items:
        key = (_singularize(existing_item.name), (existing_item.unit or "").lower())
        existing_lookup[key] = existing_item

    exclude_set = set(exclude_ids)
    for ing in recipe.ingredients:
        if ing.id in exclude_set:
            continue
        ing_name = ing.normalized_name or ing.name
        key = (_singularize(ing_name), (ing.unit or "").lower())
        match = existing_lookup.get(key)
        if match is not None:
            # Merge amounts when both are numeric; otherwise leave as-is
            if match.amount is not None and ing.amount is not None:
                match.amount = round(match.amount + ing.amount, 4)
        else:
            item = ShoppingItem(
                list_id=shopping_list.id,
                name=ing_name,
                amount=ing.amount,
                unit=ing.unit,
                checked=False,
                category=ing.category or "other",
                recipe_id=recipe.id,
            )
            db.add(item)
            existing_lookup[key] = item

    await db.flush()

    # Reload list with fresh items
    result = await db.execute(
        select(ShoppingList)
        .where(ShoppingList.id == shopping_list.id)
        .options(selectinload(ShoppingList.items))
    )
    return result.scalar_one()


# ─── PATCH /shopping-list/items/{item_id} ─────────────────────────────────────

@router.patch("/items/{item_id}", response_model=ShoppingItemOut)
async def update_item(
    item_id: int,
    data: ShoppingItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check/uncheck an item, or update its details."""
    item = await _get_item_or_404(item_id, current_user, db)

    if data.checked is not None:
        item.checked = data.checked
    if data.name is not None:
        item.name = data.name
    if data.amount is not None:
        item.amount = data.amount
    if data.unit is not None:
        item.unit = data.unit
    if data.category is not None:
        item.category = data.category

    await db.flush()
    return item


# ─── DELETE /shopping-list/items/{item_id} ────────────────────────────────────

@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = await _get_item_or_404(item_id, current_user, db)
    await db.delete(item)


# ─── DELETE /shopping-list/clear-checked ─────────────────────────────────────

@router.delete("/clear-checked", status_code=status.HTTP_204_NO_CONTENT)
async def clear_checked_items(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove all checked items from the user's active list."""
    shopping_list = await _get_or_create_list(current_user, db)
    for item in list(shopping_list.items):
        if item.checked:
            await db.delete(item)


# ─── DELETE /shopping-list/clear ─────────────────────────────────────────────

@router.delete("/clear", status_code=status.HTTP_204_NO_CONTENT)
async def clear_all_items(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove all items from the user's active shopping list."""
    shopping_list = await _get_or_create_list(current_user, db)
    for item in list(shopping_list.items):
        await db.delete(item)
