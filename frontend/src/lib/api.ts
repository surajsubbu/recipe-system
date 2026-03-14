/**
 * Typed API client for the Recipe System backend.
 *
 * Client-side only — use apiFetch() with a Clerk JWT from useAuth().getToken().
 * Throws ApiError on non-2xx responses.
 */

import type {
  Recipe,
  RecipeCreate,
  RecipeUpdate,
  PaginatedRecipes,
  CookableRecipe,
  Tag,
  IngestJobOut,
  IngestRequest,
  ShoppingList,
  ShoppingItem,
  ShoppingItemUpdate,
  MealPlan,
  MealPlanCreate,
  WeekMealPlan,
  User,
  UserRoleUpdate,
  InviteRequest,
  DetailedHealth,
  Collection,
  CollectionCreate,
  CollectionUpdate,
  PaginatedCollections,
  PantryItem,
  PantryItemCreate,
  PantryItemUpdate,
} from "./types";

// ─── Config ───────────────────────────────────────────────────────────────────

const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

// ─── Error class ──────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Core fetchers ────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) {
    // 204 No Content — return null cast to T
    if (res.status === 204) return null as unknown as T;
    return res.json() as Promise<T>;
  }
  let message = res.statusText;
  try {
    const body = await res.json();
    message = body?.detail ?? message;
  } catch {
    // ignore parse error
  }
  throw new ApiError(res.status, message);
}

/**
 * Client-side fetch — pass the Clerk token obtained via `useAuth().getToken()`.
 */
export async function apiFetch<T>(
  path: string,
  token: string | null,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BACKEND}${path}`, { ...options, headers });
  return handleResponse<T>(res);
}

// ─── Recipes ──────────────────────────────────────────────────────────────────

export const recipesApi = {
  list: (
    params: {
      page?: number;
      page_size?: number;
      search?: string;
      tag?: string;
    },
    token: string | null
  ): Promise<PaginatedRecipes> => {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.page_size) qs.set("page_size", String(params.page_size));
    if (params.search) qs.set("search", params.search);
    if (params.tag) qs.append("tags", params.tag);  // backend expects "tags" query param
    return apiFetch<PaginatedRecipes>(
      `/recipes${qs.toString() ? `?${qs}` : ""}`,
      token
    );
  },

  get: (id: number, token: string | null): Promise<Recipe> =>
    apiFetch<Recipe>(`/recipes/${id}`, token),

  tags: (token: string | null): Promise<Tag[]> =>
    apiFetch<Tag[]>("/recipes/tags", token),

  create: (data: RecipeCreate, token: string | null): Promise<Recipe> =>
    apiFetch<Recipe>("/recipes", token, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (
    id: number,
    data: RecipeUpdate,
    token: string | null
  ): Promise<Recipe> =>
    apiFetch<Recipe>(`/recipes/${id}`, token, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id: number, token: string | null): Promise<void> =>
    apiFetch<void>(`/recipes/${id}`, token, { method: "DELETE" }),

  cookable: (token: string | null, limit = 30): Promise<CookableRecipe[]> =>
    apiFetch<CookableRecipe[]>(`/recipes/cookable?limit=${limit}`, token),
};

// ─── Ingest ───────────────────────────────────────────────────────────────────

export const ingestApi = {
  start: (data: IngestRequest, token: string | null): Promise<IngestJobOut> =>
    apiFetch<IngestJobOut>("/ingest", token, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  status: (jobId: string, token: string | null): Promise<IngestJobOut> =>
    apiFetch<IngestJobOut>(`/ingest/${jobId}`, token),
};

// ─── Shopping List ────────────────────────────────────────────────────────────

export const shoppingApi = {
  get: (token: string | null): Promise<ShoppingList> =>
    apiFetch<ShoppingList>("/shopping-list", token),

  generateFromRecipe: (
    recipeId: number,
    token: string | null
  ): Promise<ShoppingList> =>
    apiFetch<ShoppingList>(`/shopping-list/generate/${recipeId}`, token, {
      method: "POST",
    }),

  updateItem: (
    itemId: number,
    data: ShoppingItemUpdate,
    token: string | null
  ): Promise<ShoppingItem> =>
    apiFetch<ShoppingItem>(`/shopping-list/items/${itemId}`, token, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  removeItem: (itemId: number, token: string | null): Promise<void> =>
    apiFetch<void>(`/shopping-list/items/${itemId}`, token, {
      method: "DELETE",
    }),

  clearChecked: (token: string | null): Promise<ShoppingList> =>
    apiFetch<ShoppingList>("/shopping-list/clear-checked", token, {
      method: "DELETE",
    }),
};

// ─── Meal Plan ────────────────────────────────────────────────────────────────

export const mealPlanApi = {
  getWeek: (weekOf: string, token: string | null): Promise<WeekMealPlan> =>
    apiFetch<WeekMealPlan>(`/meal-plan?week_of=${weekOf}`, token),

  add: (data: MealPlanCreate, token: string | null): Promise<MealPlan> =>
    apiFetch<MealPlan>("/meal-plan", token, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  remove: (id: number, token: string | null): Promise<void> =>
    apiFetch<void>(`/meal-plan/${id}`, token, { method: "DELETE" }),

  generateShoppingList: (
    startDate: string,
    endDate: string,
    token: string | null
  ): Promise<ShoppingList> =>
    apiFetch<ShoppingList>(
      `/meal-plan/shopping-list?start_date=${startDate}&end_date=${endDate}`,
      token,
      { method: "POST" }
    ),
};

// ─── Users (admin) ────────────────────────────────────────────────────────────

export const usersApi = {
  list: (token: string | null): Promise<User[]> =>
    apiFetch<User[]>("/users", token),

  updateRole: (
    userId: number,
    data: UserRoleUpdate,
    token: string | null
  ): Promise<User> =>
    apiFetch<User>(`/users/${userId}/role`, token, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  invite: (data: InviteRequest, token: string | null): Promise<void> =>
    apiFetch<void>("/users/invite", token, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ─── Collections ──────────────────────────────────────────────────────────────

export const collectionsApi = {
  list: (
    token: string | null,
    page: number = 1,
    pageSize: number = 20
  ): Promise<PaginatedCollections> =>
    apiFetch<PaginatedCollections>(
      `/collections?page=${page}&page_size=${pageSize}`,
      token
    ),

  get: (id: number, token: string | null): Promise<Collection> =>
    apiFetch<Collection>(`/collections/${id}`, token),

  create: (data: CollectionCreate, token: string | null): Promise<Collection> =>
    apiFetch<Collection>("/collections", token, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (
    id: number,
    data: CollectionUpdate,
    token: string | null
  ): Promise<Collection> =>
    apiFetch<Collection>(`/collections/${id}`, token, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id: number, token: string | null): Promise<void> =>
    apiFetch<void>(`/collections/${id}`, token, {
      method: "DELETE",
    }),

  listRecipes: (
    id: number,
    token: string | null,
    page: number = 1,
    pageSize: number = 20
  ): Promise<PaginatedRecipes> =>
    apiFetch<PaginatedRecipes>(
      `/collections/${id}/recipes?page=${page}&page_size=${pageSize}`,
      token
    ),

  addRecipe: (
    collectionId: number,
    recipeId: number,
    token: string | null
  ): Promise<void> =>
    apiFetch<void>(`/collections/${collectionId}/recipes/${recipeId}`, token, {
      method: "POST",
    }),

  removeRecipe: (
    collectionId: number,
    recipeId: number,
    token: string | null
  ): Promise<void> =>
    apiFetch<void>(`/collections/${collectionId}/recipes/${recipeId}`, token, {
      method: "DELETE",
    }),
};

// ─── Pantry Items ─────────────────────────────────────────────────────────────

export const pantryApi = {
  list: (token: string | null): Promise<Record<string, PantryItem[]>> =>
    apiFetch<Record<string, PantryItem[]>>("/pantry", token),

  create: (data: PantryItemCreate, token: string | null): Promise<PantryItem> =>
    apiFetch<PantryItem>("/pantry/items", token, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (
    id: number,
    data: PantryItemUpdate,
    token: string | null
  ): Promise<PantryItem> =>
    apiFetch<PantryItem>(`/pantry/items/${id}`, token, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: (id: number, token: string | null): Promise<void> =>
    apiFetch<void>(`/pantry/items/${id}`, token, {
      method: "DELETE",
    }),

  clear: (token: string | null): Promise<void> =>
    apiFetch<void>("/pantry/clear", token, {
      method: "DELETE",
    }),

  importFromShoppingList: (
    token: string | null
  ): Promise<PantryItem[]> =>
    apiFetch<PantryItem[]>("/pantry/import-shopping-list", token, {
      method: "POST",
    }),
};

// ─── Health ───────────────────────────────────────────────────────────────────

export const healthApi = {
  detailed: (): Promise<DetailedHealth> =>
    fetch(`${BACKEND}/health/detailed`).then((r) =>
      handleResponse<DetailedHealth>(r)
    ),
};
