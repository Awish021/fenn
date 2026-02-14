import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppLayout } from "./AppLayout";
import { useAuth } from "../hooks/useAuth";
import type { AuthSession } from "../api/authStore";

vi.mock("../hooks/useAuth", () => ({ useAuth: vi.fn() }));

const mockDeleteAvatar = vi.fn();
const mockRefreshCurrentUser = vi.fn();
const mockLogout = vi.fn();

const mockedUseAuth = vi.mocked(useAuth);

const mockSession: AuthSession = {
  accessToken: "token",
  refreshToken: "refresh",
  claims: {
    sub: "1",
    username: "alice",
    is_admin: false,
    exp: 9999999999,
    iat: 1,
    type: "access",
  },
};

function mockAuth(avatarDataUrl?: string) {
  mockedUseAuth.mockReturnValue({
    session: mockSession,
    logout: mockLogout,
    api: {
      deleteAvatar: mockDeleteAvatar,
    },
    currentUser: {
      id: 1,
      username: "alice",
      is_admin: false,
      avatar_data_url: avatarDataUrl,
    },
    refreshCurrentUser: mockRefreshCurrentUser,
    login: vi.fn(),
  });
}

function renderAppLayout() {
  return render(
    <MemoryRouter initialEntries={["/groups"]}>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route path="groups" element={<div>Groups</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockDeleteAvatar.mockReset();
  mockDeleteAvatar.mockResolvedValue(undefined);
  mockRefreshCurrentUser.mockReset();
  mockRefreshCurrentUser.mockResolvedValue(null);
  mockLogout.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AppLayout avatar controls", () => {
  it("disables remove avatar when no avatar exists", () => {
    mockAuth();

    renderAppLayout();

    expect(screen.getByRole("button", { name: "Remove avatar" })).toHaveProperty("disabled", true);
  });

  it("keeps remove avatar enabled when avatar exists", () => {
    mockAuth("data:image/png;base64,abc");

    renderAppLayout();

    expect(screen.getByRole("button", { name: "Remove avatar" })).toHaveProperty("disabled", false);
  });

  it("does not call delete when remove avatar is disabled", () => {
    mockAuth();

    renderAppLayout();

    fireEvent.click(screen.getByRole("button", { name: "Remove avatar" }));

    expect(mockDeleteAvatar).not.toHaveBeenCalled();
    expect(mockRefreshCurrentUser).not.toHaveBeenCalled();
  });
});
