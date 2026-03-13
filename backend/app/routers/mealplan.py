"""
/meal-plan  — weekly calendar of planned meals.

GET  /meal-plan                 → Mon–Sun view (defaults to current week)
POST /meal-plan                 → assign a recipe to a date + meal_type
DELETE /meal-plan/{id}          → remove an entry
POST /meal-plan/shopping-list   → generate shopping list for a date range
"""
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models import MealPlan, Recipe, ShoppingItem, ShoppingList, User
from app.schemas import MealPlanCreate, MealPlanOut, WeekMealPlan

router = APIRouter()


# ─── Helper ───────────────────────────────────────────────────────────────────

def _week_bounds(reference: date) -> tuple[date, date]:
    """Return (Monday, Sunday) of the ISO week containing `reference`."""
    monday = reference - timedelta(days=reference.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


# ─── GET /meal-plan ───────────────────────────────────────────────────────────

@router.get("", response_model=WeekMealPlan)
async def get_meal_plan(
    week_of: Optional[date] = Query(
        None,
        description="Any date in the target ISO week (defaults to today)",
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all meal-plan entries for the week containing `week_of`."""
    ref = week_of or date.today()
    monday, sunday = _week_bounds(ref)

    result = await db.execute(
        select(MealPlan)
        .where(
            and_(
                MealPlan.owner_id == current_user.id,
                MealPlan.planned_date >= monday,
                MealPlan.planned_date <= sunday,
            )
        )
        .options(
            selectinload(MealPlan.recipe).selectinload(Recipe.tags)
        )
        .order_by(MealPlan.planned_date, MealPlan.meal_type)
    )
    entries = result.scalars().all()

    return WeekMealPlan(week_start=monday, week_end=sunday, entries=list(entries))


# ─── POST /meal-plan ──────────────────────────────────────────────────────────

@router.post("", response_model=MealPlanOut, status_code=status.HTTP_201_CREATED)
async def create_meal_plan_entry(
    data: MealPlanCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Assign a recipe to a specific date and meal slot.
    Only one entry per (user, date, meal_type) — attempting to create a
    duplicate replaces the existing entry.
    """
    # Verify recipe exists
    result = await db.execute(select(Recipe).where(Recipe.id == data.recipe_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Recipe not found")

    # Upsert: delete existing entry for same slot if present
    existing = await db.execute(
        select(MealPlan).where(
            and_(
                MealPlan.owner_id == current_user.id,
                MealPlan.planned_date == data.planned_date,
                MealPlan.meal_type == data.meal_type,
            )
        )
    )
    old = existing.scalar_one_or_none()
    if old:
        await db.delete(old)
        await db.flush()

    entry = MealPlan(
        owner_id=current_user.id,
        recipe_id=data.recipe_id,
        planned_date=data.planned_date,
        meal_type=data.meal_type,
    )
    db.add(entry)
    await db.flush()

    # Reload with recipe relationship
    result = await db.execute(
        select(MealPlan)
        .where(MealPlan.id == entry.id)
        .options(selectinload(MealPlan.recipe).selectinload(Recipe.tags))
    )
    return result.scalar_one()


# ─── DELETE /meal-plan/{id} ───────────────────────────────────────────────────

@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meal_plan_entry(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MealPlan).where(
            MealPlan.id == entry_id,
            MealPlan.owner_id == current_user.id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Meal plan entry not found")
    await db.delete(entry)


# ─── POST /meal-plan/shopping-list ────────────────────────────────────────────

@router.post(
    "/shopping-list",
    status_code=status.HTTP_201_CREATED,
    summary="Generate a shopping list for a date range",
)
async def generate_shopping_list_for_range(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Collect all ingredients from meal-plan entries between start_date and
    end_date, then append them to the user's active shopping list.
    """
    if end_date < start_date:
        raise HTTPException(
            status_code=400,
            detail="end_date must be >= start_date",
        )

    result = await db.execute(
        select(MealPlan)
        .where(
            and_(
                MealPlan.owner_id == current_user.id,
                MealPlan.planned_date >= start_date,
                MealPlan.planned_date <= end_date,
            )
        )
        .options(
            selectinload(MealPlan.recipe).selectinload(Recipe.ingredients)
        )
    )
    entries = result.scalars().all()

    if not entries:
        return {"added": 0, "message": "No meal plan entries found for that range"}

    # Get or create the user's shopping list
    sl_result = await db.execute(
        select(ShoppingList)
        .where(ShoppingList.owner_id == current_user.id)
        .order_by(ShoppingList.created_at.desc())
        .limit(1)
    )
    shopping_list = sl_result.scalar_one_or_none()
    if not shopping_list:
        shopping_list = ShoppingList(owner_id=current_user.id)
        db.add(shopping_list)
        await db.flush()

    added = 0
    for entry in entries:
        for ing in entry.recipe.ingredients:
            db.add(
                ShoppingItem(
                    list_id=shopping_list.id,
                    name=ing.normalized_name or ing.name,
                    amount=ing.amount,
                    unit=ing.unit,
                    category=ing.category or "other",
                    recipe_id=entry.recipe.id,
                    checked=False,
                )
            )
            added += 1

    return {"added": added, "shopping_list_id": shopping_list.id}
