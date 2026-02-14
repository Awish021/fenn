import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { HttpError } from "../api/client";
import type { ItemOut } from "../api/types";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../hooks/useAuth";

interface MemberRef {
  id: number;
  username: string;
}

function gatherMembersFromVenn(venn: Record<string, { members: MemberRef[] }>): MemberRef[] {
  const byId = new Map<number, MemberRef>();
  Object.values(venn).forEach((section) => {
    section.members.forEach((member) => byId.set(member.id, member));
  });
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

export function ItemsPage() {
  const { session } = useAuth();
  const api = useApi();
  const { categoryId: categoryIdParam } = useParams();
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get("groupId") ?? "";
  const categoryId = Number(categoryIdParam);

  const [items, setItems] = useState<ItemOut[]>([]);
  const [members, setMembers] = useState<MemberRef[]>([]);
  const [text, setText] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editText, setEditText] = useState<Record<number, string>>({});
  const [editMembers, setEditMembers] = useState<Record<number, number[]>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!categoryId) {
      return;
    }
    void loadData();
  }, [categoryId]);

  async function loadData(): Promise<void> {
    setLoading(true);
    try {
      const [nextItems, venn] = await Promise.all([api.listItems(categoryId), api.getVenn(categoryId)]);
      setItems(nextItems);
      setMembers(gatherMembersFromVenn(venn));
      const textMap: Record<number, string> = {};
      const membersMap: Record<number, number[]> = {};
      nextItems.forEach((item) => {
        textMap[item.id] = item.text;
        membersMap[item.id] = item.member_ids;
      });
      setEditText(textMap);
      setEditMembers(membersMap);
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Failed to load items");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelection(value: number, source: number[], setter: (next: number[]) => void): void {
    if (source.includes(value)) {
      setter(source.filter((id) => id !== value));
      return;
    }
    setter([...source, value]);
  }

  async function onCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      const created = await api.createItem(categoryId, text, selectedMemberIds);
      setItems((prev) => [...prev, created]);
      setEditText((prev) => ({ ...prev, [created.id]: created.text }));
      setEditMembers((prev) => ({ ...prev, [created.id]: created.member_ids }));
      setText("");
      setSelectedMemberIds([]);
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Failed to create item");
    }
  }

  async function onUpdate(itemId: number): Promise<void> {
    setError(null);
    try {
      const updated = await api.updateItem(itemId, editText[itemId], editMembers[itemId] ?? []);
      setItems((prev) => prev.map((item) => (item.id === itemId ? updated : item)));
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Failed to update item");
    }
  }

  async function onDelete(itemId: number): Promise<void> {
    setError(null);
    try {
      await api.deleteItem(itemId);
      setItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Failed to delete item");
    }
  }

  const memberLabelById = useMemo(
    () => Object.fromEntries(members.map((member) => [member.id, member.username])),
    [members]
  );

  if (!categoryId) {
    return <p className="text-sm text-rose-700">Invalid category.</p>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black text-brand-900">Items</h1>
          <Link to={`/groups/${groupId}/categories`} className="ml-auto text-sm font-semibold text-brand-700">
            Back to Categories
          </Link>
          <Link
            to={`/categories/${categoryId}/venn?groupId=${groupId}`}
            className="rounded-md border border-teal-300 px-3 py-2 text-xs font-semibold text-teal-800"
          >
            Open Venn
          </Link>
        </div>

        <form className="mt-4 space-y-3" onSubmit={onCreate}>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            data-testid="item-text-input"
            placeholder="Item text"
            className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm"
            required
          />

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {members.map((member) => (
              <label key={member.id} className="flex items-center gap-2 rounded-md bg-slate-100 px-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={selectedMemberIds.includes(member.id)}
                  data-testid={`item-member-${member.id}`}
                  disabled={loading}
                  onChange={() => toggleSelection(member.id, selectedMemberIds, setSelectedMemberIds)}
                />
                {member.username}
              </label>
            ))}
          </div>

          <button
            data-testid="item-create-button"
            disabled={loading}
            className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Add Item
          </button>
        </form>
        {loading && (
          <p className="mt-3 text-sm text-slate-500" role="status" aria-live="polite">
            Loading items…
          </p>
        )}
        {error && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </section>

      <ul className="space-y-3">
          {items.map((item) => {
            const isOwner = item.owner_user_id === Number(session?.claims.sub);
            const canManage = session?.claims.is_admin || isOwner;
            const chosenMembers = editMembers[item.id] ?? [];

            return (
              <li key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500">Owner user id: {item.owner_user_id}</p>

                <input
                  value={editText[item.id] ?? ""}
                  onChange={(event) => setEditText((prev) => ({ ...prev, [item.id]: event.target.value }))}
                  disabled={!canManage}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100"
                />

                <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                  {members.map((member) => (
                    <label key={member.id} className="flex items-center gap-2 rounded-md bg-slate-100 px-2 py-1 text-sm">
                      <input
                        type="checkbox"
                        checked={chosenMembers.includes(member.id)}
                        disabled={!canManage}
                        onChange={() =>
                          toggleSelection(member.id, chosenMembers, (next) =>
                            setEditMembers((prev) => ({
                              ...prev,
                              [item.id]: next,
                            }))
                          )
                        }
                      />
                      {member.username}
                    </label>
                  ))}
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  Members: {item.member_ids.map((id) => memberLabelById[id] ?? id).join(", ")}
                </p>

                {canManage && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => onUpdate(item.id)}
                      className="rounded-md border border-brand-300 px-3 py-2 text-xs font-semibold text-brand-900"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      className="rounded-md border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
    </div>
  );
}
