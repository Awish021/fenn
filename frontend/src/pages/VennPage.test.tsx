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
const mockGetGroupVenn = vi.fn();
const mockDeleteItem = vi.fn();
const mockLikeCatalogItem = vi.fn();
const mockUnlikeCatalogItem = vi.fn();

const mockApi: Pick<
  ApiClient,
  | "deleteItem"
  | "getGroupVenn"
  | "listCatalogItems"
  | "listGroups"
  | "likeCatalogItem"
  | "unlikeCatalogItem"
> = {
  deleteItem: mockDeleteItem,
  getGroupVenn: mockGetGroupVenn,
  listCatalogItems: mockListCatalogItems,
  listGroups: mockListGroups,
  likeCatalogItem: mockLikeCatalogItem,
  unlikeCatalogItem: mockUnlikeCatalogItem,
};

const mockedUseApi = vi.mocked(useApi);
const mockedUseAuth = vi.mocked(useAuth);
const mockedUseIsMobile = vi.mocked(useIsMobile);

function renderVennPage() {
  return render(
    <MemoryRouter initialEntries={["/groups/1/venn/movies"]}>
      <Routes>
        <Route path="/groups/:groupId/venn/:categoryKey" element={<VennPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  mockGetGroupVenn.mockResolvedValue({});
  mockListGroups.mockResolvedValue([{ id: 1, member_limit: 8 }]);
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
  it("loads venn data using group and category route params", async () => {
    renderVennPage();
    await waitFor(() => expect(mockGetGroupVenn).toHaveBeenCalledWith(1, "movies"));
  });

  it("debounces typing before fetching catalog results", async () => {
    renderVennPage();
    await waitFor(() => expect(mockListCatalogItems).toHaveBeenCalledTimes(1));
    const input = screen.getByPlaceholderText("Search title or ID");
    fireEvent.change(input, { target: { value: "sun" } });
    expect(mockListCatalogItems).toHaveBeenCalledTimes(1);
    await pause(250);
    await waitFor(() => expect(mockListCatalogItems).toHaveBeenCalledTimes(2));
    expect(mockListCatalogItems).toHaveBeenLastCalledWith("movies", "sun", 1, 25);
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
    expect(mockListCatalogItems).toHaveBeenLastCalledWith("movies", "folk", 1, 25);
    await pause(250);
    expect(mockListCatalogItems).toHaveBeenCalledTimes(2);
  });

  it("moves across pages and resets to page one for a new search", async () => {
    mockListCatalogItems.mockImplementation(
      async (_categoryKey: string, _query?: string, page = 1, limit = 25) => {
        if (page === 1) {
          return Array.from({ length: limit }, (_, index) => ({
            category_key: "movies",
            provider: "test",
            provider_id: `item-${index + 1}`,
            title: `Movie ${index + 1}`,
            subtitle: null,
            logo_url: "https://cdn.example.com/logo.png",
            attribution: null,
            provider_url: null,
            popularity_score: 0,
            like_count: 0,
            liked_by_user: false,
          }));
        }
        if (page === 2) {
          return [
            {
              category_key: "movies",
              provider: "test",
              provider_id: "item-26",
              title: "Movie 26",
              subtitle: null,
              logo_url: "https://cdn.example.com/logo.png",
              attribution: null,
              provider_url: null,
              popularity_score: 0,
              like_count: 0,
              liked_by_user: false,
            },
          ];
        }
        return [];
      }
    );

    renderVennPage();
    await waitFor(() => expect(mockListCatalogItems).toHaveBeenCalledWith("movies", "", 1, 25));

    const nextButton = screen.getByRole("button", { name: "Next" });
    fireEvent.click(nextButton);
    await waitFor(() => expect(mockListCatalogItems).toHaveBeenCalledWith("movies", "", 2, 25));

    const input = screen.getByPlaceholderText("Search title or ID");
    fireEvent.change(input, { target: { value: "matrix" } });
    await pause(250);
    await waitFor(() => expect(mockListCatalogItems).toHaveBeenLastCalledWith("movies", "matrix", 1, 25));
  });
});
