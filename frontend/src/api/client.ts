import { toSession, type AuthSession } from "./authStore";
import type {
  CatalogItemOut,
  CatalogLikeResponse,
  CategoryOut,
  GroupMemberOut,
  GroupOut,
  ItemOut,
  TokenResponse,
  UserOut,
  VennResponse,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

type Method = "GET" | "POST" | "PUT" | "DELETE";

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface SessionAdapter {
  getSession: () => AuthSession | null;
  setSession: (session: AuthSession | null) => void;
}

class ApiClient {
  private adapter: SessionAdapter;
  private refreshInFlight: Promise<AuthSession | null> | null = null;

  constructor(adapter: SessionAdapter) {
    this.adapter = adapter;
  }

  private async request<T>(path: string, method: Method, body?: unknown, allowRefresh = true): Promise<T> {
    const session = this.adapter.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.accessToken) {
      headers.Authorization = `Bearer ${session.accessToken}`;
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401 && allowRefresh && session?.refreshToken && path !== "/auth/refresh") {
      const refreshedSession = await this.refreshSession(session.refreshToken);
      if (!refreshedSession) {
        throw new HttpError(401, "Session expired");
      }
      return this.request(path, method, body, false);
    }

    if (!response.ok) {
      const message = await this.readError(response);
      throw new HttpError(response.status, message);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private async requestMultipart<T>(
    path: string,
    method: Method,
    formData: FormData,
    allowRefresh = true,
  ): Promise<T> {
    const session = this.adapter.getSession();
    const headers: Record<string, string> = {};
    if (session?.accessToken) {
      headers.Authorization = `Bearer ${session.accessToken}`;
    }
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: formData,
    });

    if (
      response.status === 401 &&
      allowRefresh &&
      session?.refreshToken &&
      path !== "/auth/refresh"
    ) {
      const refreshedSession = await this.refreshSession(session.refreshToken);
      if (!refreshedSession) {
        throw new HttpError(401, "Session expired");
      }
      return this.requestMultipart<T>(path, method, formData, false);
    }

    if (!response.ok) {
      const message = await this.readError(response);
      throw new HttpError(response.status, message);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private async readError(response: Response): Promise<string> {
    try {
      const data = (await response.json()) as { detail?: string };
      return data.detail ?? `Request failed (${response.status})`;
    } catch {
      return `Request failed (${response.status})`;
    }
  }

  private async refreshSession(refreshToken: string): Promise<AuthSession | null> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.request<TokenResponse>(
        "/auth/refresh",
        "POST",
        { refresh_token: refreshToken },
        false
      )
        .then((tokens) => {
          const session = toSession(tokens);
          this.adapter.setSession(session);
          return session;
        })
        .catch(() => {
          this.adapter.setSession(null);
          return null;
        })
        .finally(() => {
          this.refreshInFlight = null;
        });
    }

    return this.refreshInFlight;
  }

  login(username: string, password: string): Promise<TokenResponse> {
    return this.request<TokenResponse>("/auth/login", "POST", { username, password }, false);
  }

  listGroups(): Promise<GroupOut[]> {
    return this.request<GroupOut[]>("/groups", "GET");
  }

  createGroup(name: string, memberLimit: number): Promise<GroupOut> {
    return this.request<GroupOut>("/groups", "POST", { name, member_limit: memberLimit });
  }

  deleteGroup(groupId: number): Promise<void> {
    return this.request<void>(`/groups/${groupId}`, "DELETE");
  }

  listGroupMembers(groupId: number): Promise<GroupMemberOut[]> {
    return this.request<GroupMemberOut[]>(`/groups/${groupId}/members`, "GET");
  }

  addGroupMember(groupId: number, userId: number): Promise<{ status: string }> {
    return this.request<{ status: string }>(`/groups/${groupId}/members`, "POST", { user_id: userId });
  }

  listUsers(): Promise<UserOut[]> {
    return this.request<UserOut[]>("/admin/users", "GET");
  }

  createUser(username: string, password: string, isAdmin = false): Promise<UserOut> {
    return this.request<UserOut>("/admin/users", "POST", {
      username,
      password,
      is_admin: isAdmin,
    });
  }

  listCategories(groupId: number): Promise<CategoryOut[]> {
    return this.request<CategoryOut[]>(`/categories?group_id=${groupId}`, "GET");
  }

  createCategory(groupId: number, name: string): Promise<CategoryOut> {
    return this.request<CategoryOut>("/categories", "POST", { group_id: groupId, name });
  }

  updateCategory(categoryId: number, name: string): Promise<CategoryOut> {
    return this.request<CategoryOut>(`/categories/${categoryId}`, "PUT", { name });
  }

  deleteCategory(categoryId: number): Promise<void> {
    return this.request<void>(`/categories/${categoryId}`, "DELETE");
  }

  listItems(categoryId: number): Promise<ItemOut[]> {
    return this.request<ItemOut[]>(`/categories/${categoryId}/items`, "GET");
  }

  createItem(categoryId: number, text: string, memberIds: number[]): Promise<ItemOut> {
    return this.request<ItemOut>(`/categories/${categoryId}/items`, "POST", {
      text,
      member_ids: memberIds,
    });
  }

  updateItem(itemId: number, text: string, memberIds: number[]): Promise<ItemOut> {
    return this.request<ItemOut>(`/items/${itemId}`, "PUT", {
      text,
      member_ids: memberIds,
    });
  }

  deleteItem(itemId: number): Promise<void> {
    return this.request<void>(`/items/${itemId}`, "DELETE");
  }

  getVenn(categoryId: number): Promise<VennResponse> {
    return this.request<VennResponse>(`/categories/${categoryId}/venn`, "GET");
  }

  listCatalogItems(
    categoryKey: string,
    query?: string,
    limit = 25
  ): Promise<CatalogItemOut[]> {
    const params = new URLSearchParams();
    if (query) {
      params.set("q", query);
    }
    params.set("limit", limit.toString());
    const queryString = params.toString();
    const path = queryString
      ? `/catalog/${encodeURIComponent(categoryKey)}/items?${queryString}`
      : `/catalog/${encodeURIComponent(categoryKey)}/items`;
    return this.request<CatalogItemOut[]>(path, "GET");
  }

  likeCatalogItem(
    categoryKey: string,
    provider: string,
    providerId: string
  ): Promise<CatalogLikeResponse> {
    const encodedProvider = encodeURIComponent(provider);
    const encodedProviderId = encodeURIComponent(providerId);
    return this.request<CatalogLikeResponse>(
      `/catalog/${encodeURIComponent(
        categoryKey
      )}/items/${encodedProvider}/${encodedProviderId}/likes`,
      "POST"
    );
  }

  unlikeCatalogItem(
    categoryKey: string,
    provider: string,
    providerId: string
  ): Promise<CatalogLikeResponse> {
    const encodedProvider = encodeURIComponent(provider);
    const encodedProviderId = encodeURIComponent(providerId);
    return this.request<CatalogLikeResponse>(
      `/catalog/${encodeURIComponent(
        categoryKey
      )}/items/${encodedProvider}/${encodedProviderId}/likes`,
      "DELETE"
    );
  }

  getMe(): Promise<UserOut> {
    return this.request<UserOut>("/users/me", "GET");
  }

  uploadAvatar(file: File): Promise<UserOut> {
    const formData = new FormData();
    formData.append("avatar", file);
    return this.requestMultipart<UserOut>("/users/me/avatar", "POST", formData);
  }

  deleteAvatar(): Promise<UserOut> {
    return this.request<UserOut>("/users/me/avatar", "DELETE");
  }
}

export { ApiClient, HttpError };
