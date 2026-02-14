import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { CategoryOut } from "../api/types";
import { HttpError } from "../api/client";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../hooks/useAuth";

export function CategoriesPage() {
  const api = useApi();
  const { groupId: groupIdParam } = useParams();
  const groupId = Number(groupIdParam);

  const { session } = useAuth();
  const isAdmin = session?.claims.is_admin;

  const [categories, setCategories] = useState<CategoryOut[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingCategoryIds, setDeletingCategoryIds] = useState<number[]>([]);

  useEffect(() => {
    if (!groupId) {
      return;
    }
    void loadCategories();
  }, [groupId]);

  async function loadCategories(): Promise<void> {
    setLoading(true);
    try {
      const data = await api.listCategories(groupId);
      setCategories(data);
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }

  async function onDeleteCategory(categoryId: number): Promise<void> {
    setError(null);
    setDeletingCategoryIds((prev) => [...prev, categoryId]);
    try {
      await api.deleteCategory(categoryId);
      setCategories((prev) => prev.filter((category) => category.id !== categoryId));
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Failed to delete category");
    } finally {
      setDeletingCategoryIds((prev) => prev.filter((id) => id !== categoryId));
    }
  }

  if (!groupId) {
    return <p className="text-sm text-rose-600">Invalid group selected.</p>;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-brand-900">Categories</h1>
          <Link to="/groups" className="text-sm font-semibold text-brand-700 hover:text-brand-900">
            Back to Groups
          </Link>
        </div>
        <p className="mt-1 text-sm text-slate-600">Built-in categories are read-only and use the shared catalog.</p>
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
                  {category.builtin_key ? "Built-in" : "Custom"}
                </p>
              </div>
              <div className="ml-auto flex gap-2">
                <Link
                  to={`/categories/${category.id}/venn?groupId=${groupId}`}
                  data-testid={`category-venn-${category.id}`}
                  className="rounded-md border border-teal-300 px-3 py-2 text-xs font-semibold text-teal-800"
                >
                  Open Venn
                </Link>
                {isAdmin && !category.builtin_key && (
                  <button
                    type="button"
                    onClick={() => void onDeleteCategory(category.id)}
                    disabled={deletingCategoryIds.includes(category.id)}
                    className="rounded-md border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-70"
                    data-testid={`category-delete-${category.id}`}
                  >
                    {deletingCategoryIds.includes(category.id) ? "Deleting…" : "Delete"}
                  </button>
                )}
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {category.builtin_key
                ? "Likes are shared across groups for built-in categories."
                : "Custom categories can be managed by admins."}
            </p>
          </li>
        ))}
        {categories.length === 0 && !loading && (
          <li className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
            No categories yet. Refresh to ensure the Music category is provisioned for this group.
          </li>
        )}
      </ul>
    </div>
  );
}
