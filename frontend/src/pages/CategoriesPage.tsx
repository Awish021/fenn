import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { CategoryOut } from "../api/types";
import { HttpError } from "../api/client";
import { useApi } from "../hooks/useApi";

export function CategoriesPage() {
  const api = useApi();
  const { groupId: groupIdParam } = useParams();
  const groupId = Number(groupIdParam);

  const [categories, setCategories] = useState<CategoryOut[]>([]);
  const [newName, setNewName] = useState("");
  const [editValues, setEditValues] = useState<Record<number, string>>({});
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
      const data = await api.listCategories(groupId);
      setCategories(data);
      const nextEditValues: Record<number, string> = {};
      for (const category of data) {
        nextEditValues[category.id] = category.name;
      }
      setEditValues(nextEditValues);
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }

  async function onCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      const created = await api.createCategory(groupId, newName);
      setCategories((prev) => [...prev, created]);
      setEditValues((prev) => ({ ...prev, [created.id]: created.name }));
      setNewName("");
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Failed to create category");
    }
  }

  async function onUpdate(categoryId: number): Promise<void> {
    setError(null);
    try {
      const updated = await api.updateCategory(categoryId, editValues[categoryId]);
      setCategories((prev) => prev.map((category) => (category.id === categoryId ? updated : category)));
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Failed to update category");
    }
  }

  async function onDelete(categoryId: number): Promise<void> {
    setError(null);
    try {
      await api.deleteCategory(categoryId);
      setCategories((prev) => prev.filter((category) => category.id !== categoryId));
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Failed to delete category");
    }
  }

  if (!groupId) {
    return <p className="text-sm text-rose-600">Invalid group selected.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-brand-900">Categories</h1>
          <Link to="/groups" className="text-sm font-semibold text-brand-700 hover:text-brand-900">
            Back to Groups
          </Link>
        </div>
        <p className="mt-1 text-sm text-slate-600">Group ID: {groupId}</p>

        <form className="mt-4 flex gap-2" onSubmit={onCreate}>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            data-testid="category-name-input"
            placeholder="New category name"
            className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm"
            required
          />
          <button data-testid="category-create-button" className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Create
          </button>
        </form>
        {loading && (
          <p className="mt-3 text-sm text-slate-500" role="status" aria-live="polite">
            Loading categories…
          </p>
        )}
        {error && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </div>

      <ul className="space-y-3">
        {categories.map((category) => (
          <li key={category.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
              <div className="flex gap-2">
                <input
                  value={editValues[category.id] ?? ""}
                  onChange={(event) => setEditValues((prev) => ({ ...prev, [category.id]: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => onUpdate(category.id)}
                  className="rounded-lg border border-brand-300 px-3 py-2 text-sm font-semibold text-brand-900 hover:bg-brand-50"
                >
                  Save
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  to={`/categories/${category.id}/items?groupId=${groupId}`}
                  data-testid={`category-items-${category.id}`}
                  className="rounded-md border border-brand-200 px-3 py-2 text-xs font-semibold text-brand-800"
                >
                  Items
                </Link>
                <Link
                  to={`/categories/${category.id}/venn?groupId=${groupId}`}
                  data-testid={`category-venn-${category.id}`}
                  className="rounded-md border border-teal-300 px-3 py-2 text-xs font-semibold text-teal-800"
                >
                  Venn
                </Link>
                <button
                  type="button"
                  onClick={() => onDelete(category.id)}
                  className="rounded-md border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
