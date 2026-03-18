"""
Pydantic v2 schemas — request bodies, response models, and paginated wrappers.
All ORM models are mapped with model_config = {"from_attributes": True}.
"""
from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, field_validator

from app.models import MealType, UserRole


# ─── Tags ─────────────────────────────────────────────────────────────────────

class TagOut(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


# ─── Ingredients ──────────────────────────────────────────────────────────────

class IngredientBase(BaseModel):
    name: str
    amount: Optional[float] = None
    unit: Optional[str] = None
    section: Optional[str] = None


class IngredientCreate(IngredientBase):
    pass


class IngredientOut(IngredientBase):
    id: int
    normalized_name: Optional[str] = None
    category: Optional[str] = None

    model_config = {"from_attributes": True}


# ─── Steps ────────────────────────────────────────────────────────────────────

class StepBase(BaseModel):
    order: int
    instruction: str
    timer_seconds: Optional[int] = None
    video_timestamp_seconds: Optional[int] = None
    section: Optional[str] = None


class StepCreate(StepBase):
    pass


class StepOut(StepBase):
    id: int

    model_config = {"from_attributes": True}


# ─── Recipes ──────────────────────────────────────────────────────────────────

class RecipeBase(BaseModel):
    title: str
    description: Optional[str] = None
    source_url: Optional[str] = None
    secondary_source_url: Optional[str] = None
    image_url: Optional[str] = None
    cook_time_minutes: Optional[int] = None
    prep_time_minutes: Optional[int] = None
    servings: Optional[int] = None
    calories_per_serving: Optional[int] = None
    cuisine: Optional[str] = None
    difficulty: Optional[str] = None


class RecipeCreate(RecipeBase):
    ingredients: List[IngredientCreate] = []
    steps: List[StepCreate] = []
    tags: List[str] = []


class RecipeUpdate(BaseModel):
    """All fields optional — only supplied fields are changed."""
    title: Optional[str] = None
    description: Optional[str] = None
    source_url: Optional[str] = None
    secondary_source_url: Optional[str] = None
    image_url: Optional[str] = None
    cook_time_minutes: Optional[int] = None
    prep_time_minutes: Optional[int] = None
    servings: Optional[int] = None
    calories_per_serving: Optional[int] = None
    cuisine: Optional[str] = None
    difficulty: Optional[str] = None
    ingredients: Optional[List[IngredientCreate]] = None
    steps: Optional[List[StepCreate]] = None
    tags: Optional[List[str]] = None


class RecipeSummary(RecipeBase):
    """Lightweight representation used in list / search results."""
    id: int
    created_at: datetime
    tags: List[TagOut] = []

    model_config = {"from_attributes": True}


class RecipeOut(RecipeBase):
    """Full detail view with all nested children."""
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    transcript: Optional[str] = None
    ingredients: List[IngredientOut] = []
    steps: List[StepOut] = []
    tags: List[TagOut] = []

    model_config = {"from_attributes": True}


class PaginatedRecipes(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[RecipeSummary]


# ─── Ingest jobs ──────────────────────────────────────────────────────────────

class IngestRequest(BaseModel):
    url: str

    @field_validator("url")
    @classmethod
    def url_must_be_non_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("url must not be empty")
        return v


class IngestJobOut(BaseModel):
    job_id: str
    status: str           # pending | running | done | failed
    progress: Optional[str] = None  # human-readable step label
    recipe_id: Optional[int] = None
    error: Optional[str] = None


# ─── Shopping list ────────────────────────────────────────────────────────────

class ShoppingItemCreate(BaseModel):
    name: str
    amount: Optional[float] = None
    unit: Optional[str] = None
    category: Optional[str] = None


class ShoppingItemUpdate(BaseModel):
    checked: Optional[bool] = None
    name: Optional[str] = None
    amount: Optional[float] = None
    unit: Optional[str] = None
    category: Optional[str] = None


class ShoppingItemOut(BaseModel):
    id: int
    name: str
    amount: Optional[float] = None
    unit: Optional[str] = None
    checked: bool
    category: Optional[str] = None
    recipe_id: Optional[int] = None

    model_config = {"from_attributes": True}


class ShoppingListOut(BaseModel):
    id: int
    created_at: datetime
    items: List[ShoppingItemOut] = []

    model_config = {"from_attributes": True}


# ─── Meal plan ────────────────────────────────────────────────────────────────

class MealPlanCreate(BaseModel):
    recipe_id: int
    planned_date: date
    meal_type: MealType


class MealPlanOut(BaseModel):
    id: int
    recipe_id: int
    planned_date: date
    meal_type: MealType
    recipe: Optional[RecipeSummary] = None

    model_config = {"from_attributes": True}


class WeekMealPlan(BaseModel):
    """Mon–Sun view returned by GET /meal-plan."""
    week_start: date
    week_end: date
    entries: List[MealPlanOut]


# ─── Users ────────────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    id: int
    clerk_id: str
    email: str
    role: UserRole

    model_config = {"from_attributes": True}


class UserRoleUpdate(BaseModel):
    role: UserRole


# ─── Collections ──────────────────────────────────────────────────────────────

class CollectionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    cover_image_url: Optional[str] = None


class CollectionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    cover_image_url: Optional[str] = None


class CollectionOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    cover_image_url: Optional[str] = None
    created_at: datetime
    recipe_count: int

    model_config = {"from_attributes": True}


class PaginatedCollections(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[CollectionOut]


# ─── Pantry Items ─────────────────────────────────────────────────────────────

class PantryItemCreate(BaseModel):
    normalized_name: str
    quantity: Optional[float] = None
    unit: Optional[str] = None
    category: Optional[str] = None
    expires_on: Optional[date] = None


class PantryItemUpdate(BaseModel):
    quantity: Optional[float] = None
    unit: Optional[str] = None
    category: Optional[str] = None
    expires_on: Optional[date] = None


class PantryItemOut(BaseModel):
    id: int
    normalized_name: str
    quantity: Optional[float] = None
    unit: Optional[str] = None
    category: Optional[str] = None
    expires_on: Optional[date] = None
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─── Cook from Pantry ─────────────────────────────────────────────────────────

class CookableRecipe(RecipeSummary):
    match_percentage: float       # 0.0–1.0
    matched_ingredients: int
    total_ingredients: int


# ─── Webhooks ─────────────────────────────────────────────────────────────────

class HAWebhookPayload(BaseModel):
    """Home Assistant webhook payload — extend as needed."""
    event: str
    data: Optional[dict] = None
