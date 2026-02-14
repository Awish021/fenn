import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useRef, type ChangeEvent } from "react";
import { useAuth } from "../hooks/useAuth";

function navClass(isActive: boolean): string {
  const base =
    "rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 transition-colors";
  return isActive ? `${base} bg-brand-500 text-white shadow-glow` : `${base} text-slate-700 hover:bg-white/70`;
}

export function AppLayout() {
  const { session, logout, api, currentUser, refreshCurrentUser } = useAuth();
  const navigate = useNavigate();

  const avatarInputRef = useRef<HTMLInputElement>(null);

  const avatarLabel = currentUser?.username ?? session?.claims.username ?? "user";

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      await api.uploadAvatar(file);
      await refreshCurrentUser();
    } catch (error) {
      console.error("Failed to upload avatar", error);
    } finally {
      event.target.value = "";
    }
  }

  async function handleAvatarRemove(): Promise<void> {
    try {
      await api.deleteAvatar();
      await refreshCurrentUser();
    } catch (error) {
      console.error("Failed to remove avatar", error);
    }
  }

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
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                Signed in as <span className="font-bold text-slate-900">{session?.claims.username}</span>
                {session?.claims.is_admin ? " (admin)" : ""}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
                >
                  {currentUser?.avatar_data_url ? (
                    <img
                      src={currentUser.avatar_data_url}
                      alt={`${avatarLabel}'s avatar`}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-semibold uppercase text-slate-700">
                      {avatarLabel.charAt(0).toUpperCase()}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleAvatarRemove}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400"
                >
                  Remove avatar
                </button>
              </div>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
        <Outlet />
      </main>
    </div>
  );
}
