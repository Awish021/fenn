import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ApiClient } from "../api/client";
import { VennPage } from "./VennPage";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../hooks/useAuth";
import { useIsMobile } from "../hooks/useIsMobile";

vi.mock("../hooks/useApi", () => ({ useApi: vi.fn() }));
vi.mock("../hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../hooks/useIsMobile", () => ({ useIsMobile: vi.fn() }));

const mockListCatalogItems = vi.fn();
const mockListGroups = vi.fn();
const mockListCategories = vi.fn();
const mockGetVenn = vi.fn();
const mockDeleteItem = vi.fn();
const mockLikeCatalogItem = vi.fn();
const mockUnlikeCatalogItem = vi.fn();

const mockApi: Pick<
  ApiClient,
  | "deleteItem"
  | "getVenn"
  | "listCatalogItems"
  | "listCategories"
  | "listGroups"
  | "likeCatalogItem"
  | "unlikeCatalogItem"
> = {
  deleteItem: mockDeleteItem,
  getVenn: mockGetVenn,
  listCatalogItems: mockListCatalogItems,
  listCategories: mockListCategories,
  listGroups: mockListGroups,
  likeCatalogItem: mockLikeCatalogItem,
  unlikeCatalogItem: mockUnlikeCatalogItem,
};

const mockedUseApi = vi.mocked(useApi);
const mockedUseAuth = vi.mocked(useAuth);
const mockedUseIsMobile = vi.mocked(useIsMobile);

function renderVennPage() {
  return render(
    <MemoryRouter initialEntries={["/categories/3/venn?groupId=1"]}>
      <Routes>
        <Route path="/categories/:categoryId/venn" element={<VennPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  mockGetVenn.mockResolvedValue({});
  mockListGroups.mockResolvedValue([{ id: 1, member_limit: 8 }]);
  mockListCategories.mockResolvedValue([{ id: 3, builtin_key: "movies" }]);
  mockListCatalogItems.mockResolvedValue([]);
  mockDeleteItem.mockResolvedValue(undefined);
  mockLikeCatalogItem.mockResolvedValue({ like_count: 0, liked_by_user: false });
  mockUnlikeCatalogItem.mockResolvedValue({ like_count: 0, liked_by_user: false });
  mockedUseApi.mockReturnValue(mockApi as ApiClient);
  mockedUseAuth.mockReturnValue({ session: null });
  mockedUseIsMobile.mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("VennPage catalog search", () => {
  it("debounces typing before fetching catalog results", async () => {
    renderVennPage();
    await waitFor(() => expect(mockListCatalogItems).toHaveBeenCalledTimes(1));
    const input = screen.getByPlaceholderText("Search title or ID");
    fireEvent.change(input, { target: { value: "sun" } });
    expect(mockListCatalogItems).toHaveBeenCalledTimes(1);
    await pause(250);
    await waitFor(() => expect(mockListCatalogItems).toHaveBeenCalledTimes(2));
    expect(mockListCatalogItems).toHaveBeenLastCalledWith("movies", "sun");
  });

  it("runs a search immediately when the button is clicked", async () => {
    renderVennPage();
    await waitFor(() => expect(mockListCatalogItems).toHaveBeenCalledTimes(1));
    const input = screen.getByPlaceholderText("Search title or ID");
    const button = screen.getByRole("button", { name: /search/i });
    fireEvent.change(input, { target: { value: "folk" } });
    await pause(100);
    fireEvent.click(button);
    await waitFor(() => expect(mockListCatalogItems).toHaveBeenCalledTimes(2));
    expect(mockListCatalogItems).toHaveBeenLastCalledWith("movies", "folk");
    await pause(250);
    expect(mockListCatalogItems).toHaveBeenCalledTimes(2);
  });
});
