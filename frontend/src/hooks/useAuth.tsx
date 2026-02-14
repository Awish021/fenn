import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { toSession, readStoredSession, storeSession, type AuthSession } from "../api/authStore";
import { ApiClient } from "../api/client";

interface AuthContextValue {
  session: AuthSession | null;
  api: ApiClient;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => readStoredSession());
  const sessionRef = useRef<AuthSession | null>(session);

  const persistSession = useCallback((nextSession: AuthSession | null) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
    storeSession(nextSession);
  }, []);

  const api = useMemo(
    () =>
      new ApiClient({
        getSession: () => sessionRef.current,
        setSession: persistSession,
      }),
    [persistSession]
  );

  async function login(username: string, password: string): Promise<void> {
    const tokens = await api.login(username, password);
    const nextSession = toSession(tokens);
    persistSession(nextSession);
  }

  function logout(): void {
    persistSession(null);
  }

  return <AuthContext.Provider value={{ session, api, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
