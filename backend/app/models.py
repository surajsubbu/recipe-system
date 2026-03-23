"""
SQLAlchemy ORM models for the recipe management system.
Uses SQLAlchemy 2.0 Column-style declarations with __allow_unmapped__ = True
so that plain List[]/Optional[] annotations on relationships are accepted.
"""
from datetime import datetime, date
from enum import Enum as PyEnum
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.sql import func


# ─── Base ─────────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    # Allow plain List[]/Optional[] annotations on relationships without
    # requiring the SQLAlchemy 2.0 Mapped[] wrapper.
    __allow_unmapped__ = True


# ─── Enums ────────────────────────────────────────────────────────────────────

class UserRole(str, PyEnum):
    admin  = "admin"
    user   = "user"


class MealType(str, PyEnum):
    breakfast = "breakfast"
    lunch     = "lunch"
    dinner    = "dinner"
    snack     = "snack"


# ─── Association tables ───────────────────────────────────────────────────────

recipe_tag = Table(
    "recipe_tag",
    Base.metadata,
    Column("recipe_id", Integer, ForeignKey("recipes.id",  ondelete="CASCADE"), primary_key=True),
    Column("tag_id",    Integer, ForeignKey("tags.id",     ondelete="CASCADE"), primary_key=True),
)

# collection_recipe is defined as a model below (not a simple Table) since it has extra columns


# ─── Models ───────────────────────────────────────────────────────────────────

class User(Base):
    """Mirrors a Clerk user; auto-created on first authenticated request."""

    __tablename__ = "users"

    id           = Column(Integer, primary_key=True, index=True)
    clerk_id     = Column(String(255), unique=True, nullable=False, index=True)
    email        = Column(String(255), unique=True, nullable=False)
    display_name = Column(String(255), nullable=True)
    role         = Column(SAEnum(UserRole), default=UserRole.user, nullable=False)
    created_at   = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    recipes:        List["Recipe"]       = relationship("Recipe",       back_populates="owner",    foreign_keys="Recipe.owner_id")
    shopping_lists: List["ShoppingList"] = relationship("ShoppingList", back_populates="owner")
    meal_plans:     List["MealPlan"]     = relationship("MealPlan",     back_populates="owner")


class Recipe(Base):
    __tablename__ = "recipes"

    id                   = Column(Integer, primary_key=True, index=True)
    title                = Column(String(500), nullable=False, index=True)
    description          = Column(Text)
    source_url           = Column(String(2048))
    secondary_source_url = Column(String(2048), nullable=True)  # e.g. blog link from YouTube description
    image_url            = Column(String(2048))
    prep_time_minutes    = Column(Integer)
    cook_time_minutes    = Column(Integer)
    servings             = Column(Integer)
    calories_per_serving = Column(Integer)
    cuisine              = Column(String(100))
    difficulty           = Column(String(50))   # "easy" | "medium" | "hard"
    transcript           = Column(Text, nullable=True)  # video transcript (YouTube recipes)
    owner_id             = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at           = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at           = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    owner:               Optional["User"]            = relationship("User",              back_populates="recipes",     foreign_keys=[owner_id])
    ingredients:         List["Ingredient"]          = relationship("Ingredient",        back_populates="recipe",      cascade="all, delete-orphan")
    steps:               List["Step"]                = relationship("Step",             back_populates="recipe",      cascade="all, delete-orphan", order_by="Step.order")
    tags:                List["Tag"]                 = relationship("Tag",              secondary=recipe_tag,         back_populates="recipes")
    meal_plans:          List["MealPlan"]            = relationship("MealPlan",         back_populates="recipe")
    collection_recipes:  List["CollectionRecipe"]    = relationship("CollectionRecipe",  back_populates="recipe")


class Ingredient(Base):
    __tablename__ = "ingredients"

    id              = Column(Integer, primary_key=True, index=True)
    recipe_id       = Column(Integer, ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False, index=True)
    name            = Column(String(500), nullable=False)
    amount          = Column(Float)
    unit            = Column(String(100))
    normalized_name = Column(String(500))
    category        = Column(String(100))   # grocery category (produce, dairy, …)
    section         = Column(String(255), nullable=True)  # recipe section (e.g. "For the Crust")

    recipe: Optional["Recipe"] = relationship("Recipe", back_populates="ingredients")


class Step(Base):
    __tablename__ = "steps"

    id                      = Column(Integer, primary_key=True, index=True)
    recipe_id               = Column(Integer, ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False, index=True)
    order                   = Column(Integer, nullable=False)
    instruction             = Column(Text, nullable=False)
    timer_seconds           = Column(Integer)
    video_timestamp_seconds = Column(Integer, nullable=True)
    section                 = Column(String(255), nullable=True)  # recipe section (e.g. "For the Crust")

    recipe: Optional["Recipe"] = relationship("Recipe", back_populates="steps")


class Tag(Base):
    __tablename__ = "tags"

    id   = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)

    recipes: List["Recipe"] = relationship("Recipe", secondary=recipe_tag, back_populates="tags")


class ShoppingList(Base):
    __tablename__ = "shopping_lists"

    id         = Column(Integer, primary_key=True, index=True)
    owner_id   = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    owner: Optional["User"]    = relationship("User",         back_populates="shopping_lists")
    items: List["ShoppingItem"] = relationship("ShoppingItem", back_populates="shopping_list", cascade="all, delete-orphan")


class ShoppingItem(Base):
    __tablename__ = "shopping_items"

    id            = Column(Integer, primary_key=True, index=True)
    list_id       = Column(Integer, ForeignKey("shopping_lists.id", ondelete="CASCADE"), nullable=False, index=True)
    recipe_id     = Column(Integer, ForeignKey("recipes.id",         ondelete="SET NULL"), nullable=True)
    name          = Column(String(500), nullable=False)
    amount        = Column(Float)
    unit          = Column(String(100))
    category      = Column(String(100))
    checked       = Column(Boolean, default=False, nullable=False)

    shopping_list: Optional["ShoppingList"] = relationship("ShoppingList", back_populates="items")


class MealPlan(Base):
    __tablename__ = "meal_plans"

    id           = Column(Integer, primary_key=True, index=True)
    owner_id     = Column(Integer, ForeignKey("users.id",    ondelete="CASCADE"), nullable=False, index=True)
    recipe_id    = Column(Integer, ForeignKey("recipes.id",  ondelete="CASCADE"), nullable=False, index=True)
    planned_date = Column(Date, nullable=False)
    meal_type    = Column(SAEnum(MealType), nullable=False)

    __table_args__ = (
        UniqueConstraint("owner_id", "planned_date", "meal_type", name="uq_meal_plan_slot"),
    )

    owner:  Optional["User"]   = relationship("User",   back_populates="meal_plans")
    recipe: Optional["Recipe"] = relationship("Recipe", back_populates="meal_plans")


# ─── Collections ──────────────────────────────────────────────────────────────

class Collection(Base):
    """Personal recipe cookbook."""

    __tablename__ = "collections"

    id              = Column(Integer, primary_key=True, index=True)
    owner_id        = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name            = Column(String(255), nullable=False)
    description     = Column(Text, nullable=True)
    cover_image_url = Column(String(2048), nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    owner: Optional["User"]        = relationship("User")
    collection_recipes: List["CollectionRecipe"] = relationship("CollectionRecipe", back_populates="collection", cascade="all, delete-orphan")


class PantryItem(Base):
    """User's pantry inventory items."""

    __tablename__ = "pantry_items"

    id              = Column(Integer, primary_key=True, index=True)
    owner_id        = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    normalized_name = Column(String(500), nullable=False)
    quantity        = Column(Float, nullable=True)
    unit            = Column(String(100), nullable=True)
    category        = Column(String(100), nullable=True)
    expires_on      = Column(Date, nullable=True)
    updated_at      = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    owner: Optional["User"] = relationship("User")


class CollectionRecipe(Base):
    """Association between collections and recipes with timestamps."""

    __tablename__ = "collection_recipes"

    collection_id = Column(Integer, ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True)
    recipe_id     = Column(Integer, ForeignKey("recipes.id",     ondelete="CASCADE"), primary_key=True)
    added_at      = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    collection: Optional["Collection"] = relationship("Collection", back_populates="collection_recipes")
    recipe:     Optional["Recipe"]     = relationship("Recipe",     back_populates="collection_recipes")
