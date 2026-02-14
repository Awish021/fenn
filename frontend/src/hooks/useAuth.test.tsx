import { act, render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SessionAdapter } from "../api/client";
import type { AuthSession } from "../api/authStore";
import { AuthProvider, useAuth } from "./useAuth";

const adapters: SessionAdapter[] = [];

vi.mock("../api/client", () => {
  class MockApiClient {
    adapter: SessionAdapter;

    constructor(adapter: SessionAdapter) {
      adapters.push(adapter);
      this.adapter = adapter;
    }

    login(): Promise<{ access_token: string; refresh_token: string; token_type: string }> {
      return Promise.resolve({
        access_token: "header.payload.signature",
        refresh_token: "refresh-token",
        token_type: "bearer",
      });
    }
  }

  return {
    ApiClient: MockApiClient,
    HttpError: class HttpError extends Error {
      status: number;

      constructor(status: number, message: string) {
        super(message);
        this.status = status;
      }
    },
  };
});

describe("useAuth", () => {
  beforeEach(() => {
    adapters.length = 0;
    localStorage.clear();
  });

  it("keeps a single client and keeps getSession in sync", () => {
    let contextValue: ReturnType<typeof useAuth> | null = null;

    function Reader() {
      contextValue = useAuth();
      return null;
    }

    render(
      <AuthProvider>
        <Reader />
      </AuthProvider>
    );

    const adapter = adapters[0];
    expect(adapter).toBeDefined();
    const stableApi = contextValue!.api;

    const sessionA: AuthSession = {
      accessToken: "access-A",
      refreshToken: "refresh-A",
      claims: {
        sub: "1",
        username: "alice",
        is_admin: false,
        exp: 9999999999,
        iat: 1,
        type: "access",
      },
    };

    act(() => {
      adapter.setSession(sessionA);
    });

    expect(adapter.getSession()).toBe(sessionA);
    expect(contextValue!.api).toBe(stableApi);

    const sessionB: AuthSession = {
      accessToken: "access-B",
      refreshToken: "refresh-B",
      claims: {
        sub: "2",
        username: "bob",
        is_admin: true,
        exp: 9999999999,
        iat: 1,
        type: "access",
      },
    };

    act(() => {
      adapter.setSession(sessionB);
    });

    expect(adapter.getSession()).toBe(sessionB);
    expect(contextValue!.api).toBe(stableApi);
  });
});
