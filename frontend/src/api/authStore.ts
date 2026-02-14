import type { TokenResponse, UserClaims } from "./types";

const STORAGE_KEY = "fenn.auth";

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  claims: UserClaims;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

export function decodeClaims(accessToken: string): UserClaims {
  const parts = accessToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }
  const payload = JSON.parse(decodeBase64Url(parts[1])) as UserClaims;
  if (payload.type !== "access") {
    throw new Error("Invalid token type");
  }
  return payload;
}

export function toSession(tokens: TokenResponse): AuthSession {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    claims: decodeClaims(tokens.access_token),
  };
}

export function readStoredSession(): AuthSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed.accessToken || !parsed.refreshToken) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      claims: decodeClaims(parsed.accessToken),
    };
  } catch {
    return null;
  }
}

export function storeSession(session: AuthSession | null): void {
  if (!session) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}
