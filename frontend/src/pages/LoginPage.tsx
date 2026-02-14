import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { HttpError } from "../api/client";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const { session, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) {
      navigate("/groups", { replace: true });
    }
  }, [navigate, session]);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await login(username, password);
      const target = (location.state as { from?: string } | null)?.from ?? "/groups";
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Failed to login");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(130deg,_#081f38,_#14518f_45%,_#2f91d1)] px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-white/20 bg-slate-900/80 p-8 shadow-2xl backdrop-blur">
        <h1 className="text-3xl font-black tracking-tight text-sky-100">Fenn</h1>
        <p className="mt-2 text-sm text-sky-200/80">Sign in to map ideas across your overlap sections.</p>

        <form onSubmit={onSubmit} className="mt-7 space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-sky-200">Username</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              data-testid="login-username"
              className="w-full rounded-lg border border-sky-300/35 bg-sky-950/60 px-3 py-2 text-sm text-white placeholder:text-sky-300/40 focus:border-sky-300 focus:outline-none"
              placeholder="Enter username"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-sky-200">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              data-testid="login-password"
              className="w-full rounded-lg border border-sky-300/35 bg-sky-950/60 px-3 py-2 text-sm text-white placeholder:text-sky-300/40 focus:border-sky-300 focus:outline-none"
              placeholder="Enter password"
            />
          </label>

          {error && <p className="rounded-lg bg-rose-500/20 px-3 py-2 text-sm text-rose-200">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            data-testid="login-submit"
            className="w-full rounded-lg bg-sky-400 px-4 py-2 text-sm font-bold text-slate-900 transition hover:bg-sky-300 disabled:opacity-60"
          >
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
