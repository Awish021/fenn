import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { CategoryOut } from "../api/types";
import { HttpError } from "../api/client";
import { useApi } from "../hooks/useApi";

export function CategoriesPage() {
  const api = useApi();
  const { groupId: groupIdParam } = useParams();
  const groupId = Number(groupIdParam);

  const [categories, setCategories] = useState<CategoryOut[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!groupId) {
      return;
    }
    void loadCategories();
  }, [groupId]);

  async function loadCategories(): Promise<void> {
    setLoading(true);
    try {
      const data = await api.listCategories();
      setCategories(data.filter((category) => Boolean(category.builtin_key)));
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }

  if (!groupId) {
    return <p className="text-sm text-rose-600">Invalid group selected.</p>;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-brand-900">Comparison Lenses</h1>
          <Link to="/groups" className="text-sm font-semibold text-brand-700 hover:text-brand-900">
            Back to Groups
          </Link>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          These shared lenses are not owned by this group. Your likes stay with your user account.
        </p>
        {loading && (
          <p className="mt-3 text-sm text-slate-500" role="status" aria-live="polite">
            Loading categories…
          </p>
        )}
        {error && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </section>

      <ul className="space-y-3">
        {categories.map((category) => (
          <li key={category.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="text-lg font-semibold text-slate-900">{category.name}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Shared lens
                </p>
              </div>
              <div className="ml-auto flex gap-2">
                <Link
                  to={`/groups/${groupId}/venn/${category.builtin_key}`}
                  data-testid={`category-venn-${category.builtin_key}`}
                  className="rounded-md border border-teal-300 px-3 py-2 text-xs font-semibold text-teal-800"
                >
                  Open Group Venn
                </Link>
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Likes are user-scoped; this group is only the comparison context for the Venn chart.
            </p>
          </li>
        ))}
        {categories.length === 0 && !loading && (
          <li className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
            No shared lenses are available right now.
          </li>
        )}
      </ul>
    </div>
  );
}
