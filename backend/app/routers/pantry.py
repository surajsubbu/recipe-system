"""
/pantry  — user's pantry inventory (CRUD + shopping-list import).

Permissions: all endpoints scoped to current_user.
"""
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import PantryItem, ShoppingItem, ShoppingList, User
from app.schemas import PantryItemCreate, PantryItemOut, PantryItemUpdate

router = APIRouter()


# ─── GET /pantry ──────────────────────────────────────────────────────────────

@router.get("", response_model=Dict[str, List[PantryItemOut]])
async def get_pantry(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all pantry items grouped by category."""
    result = await db.execute(
        select(PantryItem)
        .where(PantryItem.owner_id == current_user.id)
        .order_by(PantryItem.category.nullslast(), PantryItem.normalized_name)
    )
    items = result.scalars().all()

    grouped: Dict[str, List[PantryItemOut]] = {}
    for item in items:
        cat = item.category or "other"
        grouped.setdefault(cat, []).append(PantryItemOut.model_validate(item))
    return grouped


# ─── POST /pantry/items ───────────────────────────────────────────────────────

@router.post("/items", response_model=PantryItemOut, status_code=status.HTTP_201_CREATED)
async def add_pantry_item(
    data: PantryItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.agents.normalizer_agent import _keyword_categorize  # noqa: PLC0415

    name = data.normalized_name.strip().lower()
    category = data.category
    # If no category provided or it's "other", try keyword lookup
    if not category or category == "other":
        category = _keyword_categorize(name)

    item = PantryItem(
        owner_id=current_user.id,
        normalized_name=name,
        quantity=data.quantity,
        unit=data.unit,
        category=category,
        expires_on=data.expires_on,
    )
    db.add(item)
    await db.flush()
    return PantryItemOut.model_validate(item)


# ─── PATCH /pantry/items/{id} ─────────────────────────────────────────────────

@router.patch("/items/{item_id}", response_model=PantryItemOut)
async def update_pantry_item(
    item_id: int,
    data: PantryItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PantryItem).where(
            PantryItem.id == item_id,
            PantryItem.owner_id == current_user.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Pantry item not found")

    for field in ("quantity", "unit", "category", "expires_on"):
        value = getattr(data, field)
        if value is not None:
            setattr(item, field, value)

    await db.flush()
    return PantryItemOut.model_validate(item)


# ─── DELETE /pantry/items/{id} ────────────────────────────────────────────────

@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pantry_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PantryItem).where(
            PantryItem.id == item_id,
            PantryItem.owner_id == current_user.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Pantry item not found")
    await db.delete(item)


# ─── DELETE /pantry/clear ─────────────────────────────────────────────────────

@router.delete("/clear", status_code=status.HTTP_204_NO_CONTENT)
async def clear_pantry(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PantryItem).where(PantryItem.owner_id == current_user.id)
    )
    for item in result.scalars().all():
        await db.delete(item)


# ─── POST /pantry/import-shopping-list ───────────────────────────────────────

@router.post("/import-shopping-list", response_model=List[PantryItemOut])
async def import_from_shopping_list(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk-import checked shopping list items into the pantry."""
    # Get the user's current shopping list
    sl_result = await db.execute(
        select(ShoppingList).where(ShoppingList.owner_id == current_user.id)
    )
    shopping_list = sl_result.scalar_one_or_none()
    if not shopping_list:
        return []

    # Get checked items
    items_result = await db.execute(
        select(ShoppingItem).where(
            ShoppingItem.list_id == shopping_list.id,
            ShoppingItem.checked == True,  # noqa: E712
        )
    )
    checked_items = items_result.scalars().all()

    added: List[PantryItemOut] = []
    for si in checked_items:
        # Use normalized_name if available, fallback to name
        name = (si.name or "").strip().lower()
        if not name:
            continue

        # Check if already in pantry
        existing = await db.execute(
            select(PantryItem).where(
                PantryItem.owner_id == current_user.id,
                PantryItem.normalized_name == name,
            )
        )
        pantry_item = existing.scalar_one_or_none()
        if pantry_item:
            # Update quantity
            if si.amount and pantry_item.quantity:
                pantry_item.quantity = (pantry_item.quantity or 0) + si.amount
            elif si.amount:
                pantry_item.quantity = si.amount
        else:
            pantry_item = PantryItem(
                owner_id=current_user.id,
                normalized_name=name,
                quantity=si.amount,
                unit=si.unit,
                category=si.category,
            )
            db.add(pantry_item)

        await db.flush()
        added.append(PantryItemOut.model_validate(pantry_item))

    return added
