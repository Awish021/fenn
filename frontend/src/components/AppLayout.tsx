import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

function navClass(isActive: boolean): string {
  const base =
    "rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 transition-colors";
  return isActive ? `${base} bg-brand-500 text-white shadow-glow` : `${base} text-slate-700 hover:bg-white/70`;
}

export function AppLayout() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();

  function onLogout(): void {
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f8fcff,_#e6eef9_50%,_#dce7f6)] text-slate-900">
      <header className="border-b border-brand-100/70 bg-white/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 md:px-6">
          <Link to="/groups" className="text-xl font-black tracking-tight text-brand-900">
            Fenn Studio
          </Link>
          <nav className="flex items-center gap-2">
            <NavLink to="/groups" className={({ isActive }) => navClass(isActive)}>
              Groups
            </NavLink>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm font-semibold text-brand-900 transition hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              Logout
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <div className="mb-6 rounded-xl border border-brand-100 bg-white/75 px-4 py-3 text-sm text-slate-600 shadow-sm">
          Signed in as <span className="font-bold text-slate-900">{session?.claims.username}</span>
          {session?.claims.is_admin ? " (admin)" : ""}
        </div>
        <Outlet />
      </main>
    </div>
  );
}
