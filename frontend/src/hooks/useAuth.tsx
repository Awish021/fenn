import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { UserOut } from "../api/types";
import { toSession, readStoredSession, storeSession, type AuthSession } from "../api/authStore";
import { ApiClient } from "../api/client";

interface AuthContextValue {
  session: AuthSession | null;
  api: ApiClient;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  currentUser: UserOut | null;
  refreshCurrentUser: () => Promise<UserOut | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => readStoredSession());
  const sessionRef = useRef<AuthSession | null>(session);
  const [currentUser, setCurrentUser] = useState<UserOut | null>(null);

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

  const refreshCurrentUser = useCallback(async (): Promise<UserOut | null> => {
    if (!session) {
      setCurrentUser(null);
      return null;
    }
    try {
      const me = await api.getMe();
      setCurrentUser(me);
      return me;
    } catch {
      setCurrentUser(null);
      return null;
    }
  }, [api, session]);

  useEffect(() => {
    if (!session) {
      setCurrentUser(null);
      return;
    }
    let canceled = false;
    void (async () => {
      try {
        const me = await api.getMe();
        if (!canceled) {
          setCurrentUser(me);
        }
      } catch {
        if (!canceled) {
          setCurrentUser(null);
        }
      }
    })();
    return () => {
      canceled = true;
    };
  }, [api, session]);

  return (
    <AuthContext.Provider
      value={{
        session,
        api,
        login,
        logout,
        currentUser,
        refreshCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
