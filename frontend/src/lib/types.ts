// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole = "admin" | "user";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type IngestStatus = "pending" | "running" | "done" | "failed";

export type IngredientCategory =
  | "produce"
  | "dairy"
  | "meat"
  | "seafood"
  | "pantry"
  | "spices"
  | "bakery"
  | "frozen"
  | "beverages"
  | "condiments"
  | "other";

// ─── Core Models ──────────────────────────────────────────────────────────────

export interface Tag {
  id: number;
  name: string;
}

export interface Ingredient {
  id: number;
  name: string;
  amount: number | null;
  unit: string | null;
  normalized_name: string | null;
  category: IngredientCategory | null;
}

export interface Step {
  id: number;
  order: number;
  instruction: string;
  timer_seconds: number | null;
}

export interface Recipe {
  id: number;
  title: string;
  description: string | null;
  source_url: string | null;
  image_url: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number | null;
  calories_per_serving: number | null;
  cuisine: string | null;
  difficulty: string | null;
  transcript: string | null;
  owner_id: number;
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
  ingredients: Ingredient[];
  steps: Step[];
  tags: Tag[];
}

export interface RecipeSummary {
  id: number;
  title: string;
  description: string | null;
  image_url: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number | null;
  cuisine: string | null;
  difficulty: string | null;
  tags: Tag[];
  created_at: string;
}

export interface PaginatedRecipes {
  items: RecipeSummary[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

// ─── Create / Update payloads ─────────────────────────────────────────────────

export interface IngredientCreate {
  name: string;
  amount?: number | null;
  unit?: string | null;
}

export interface StepCreate {
  order: number;
  instruction: string;
  timer_seconds?: number | null;
}

export interface RecipeCreate {
  title: string;
  description?: string | null;
  source_url?: string | null;
  image_url?: string | null;
  prep_time_minutes?: number | null;
  cook_time_minutes?: number | null;
  servings?: number | null;
  calories_per_serving?: number | null;
  cuisine?: string | null;
  difficulty?: string | null;
  ingredients?: IngredientCreate[];
  steps?: StepCreate[];
  tags?: string[]; // tag names
}

export type RecipeUpdate = Partial<RecipeCreate>;

// ─── Ingest ───────────────────────────────────────────────────────────────────

export interface IngestJobOut {
  job_id: string;
  status: IngestStatus;
  progress: string | null;
  recipe_id: number | null;
  error: string | null;
}

export interface IngestRequest {
  url: string;
}

// ─── Shopping List ────────────────────────────────────────────────────────────

export interface ShoppingItem {
  id: number;
  name: string;
  amount: number | null;
  unit: string | null;
  category: IngredientCategory | null;
  checked: boolean;
  recipe_id: number | null;
}

export interface ShoppingList {
  id: number;
  owner_id: number;
  created_at: string;
  items: ShoppingItem[];
}

export interface ShoppingItemUpdate {
  checked?: boolean;
  name?: string;
  amount?: number | null;
  unit?: string | null;
}

// ─── Meal Plan ────────────────────────────────────────────────────────────────

export interface MealPlan {
  id: number;
  planned_date: string; // ISO date "YYYY-MM-DD"
  meal_type: MealType;
  recipe_id: number;
  recipe: RecipeSummary;
  owner_id: number;
}

export interface MealPlanCreate {
  planned_date: string; // "YYYY-MM-DD"
  meal_type: MealType;
  recipe_id: number;
}

export interface WeekMealPlan {
  week_of: string; // "YYYY-MM-DD" Monday of the week
  entries: MealPlan[];
}

// ─── Users ────────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  clerk_id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  created_at: string;
}

export interface UserRoleUpdate {
  role: UserRole;
}

export interface InviteRequest {
  email: string;
}

// ─── Health ───────────────────────────────────────────────────────────────────

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface ServiceHealth {
  status: HealthStatus;
  latency_ms: number | null;
  detail: string | null;
}

export interface DetailedHealth {
  overall: HealthStatus;
  services: {
    postgres: ServiceHealth;
    redis: ServiceHealth;
    celery: ServiceHealth;
    ollama: ServiceHealth;
    whisper: ServiceHealth;
  };
}

// ─── API error ────────────────────────────────────────────────────────────────

export interface ApiError {
  detail: string;
  status: number;
}
