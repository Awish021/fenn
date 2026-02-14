import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { GroupMemberOut, GroupOut, UserOut } from "../api/types";
import { HttpError } from "../api/client";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../hooks/useAuth";

export function GroupsPage() {
  const api = useApi();
  const { session } = useAuth();
  const [groups, setGroups] = useState<GroupOut[]>([]);
  const [name, setName] = useState("");
  const [memberLimit, setMemberLimit] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [deletingGroupIds, setDeletingGroupIds] = useState<number[]>([]);

  const [members, setMembers] = useState<GroupMemberOut[]>([]);
  const [users, setUsers] = useState<UserOut[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    void loadGroups();
  }, []);

  useEffect(() => {
    if (!session?.claims.is_admin || !selectedGroupId) {
      return;
    }
    void loadAdminData(selectedGroupId);
  }, [selectedGroupId, session?.claims.is_admin]);

  async function loadGroups(): Promise<void> {
    setLoading(true);
    try {
      const nextGroups = await api.listGroups();
      setGroups(nextGroups);
      if (!selectedGroupId && nextGroups.length > 0) {
        setSelectedGroupId(nextGroups[0].id);
      }
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Failed to load groups");
    } finally {
      setLoading(false);
    }
  }

  async function loadAdminData(groupId: number): Promise<void> {
    try {
      const [nextMembers, nextUsers] = await Promise.all([api.listGroupMembers(groupId), api.listUsers()]);
      setMembers(nextMembers);
      setUsers(nextUsers);
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Failed to load admin data");
    }
  }

  async function onCreateGroup(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      const created = await api.createGroup(name, memberLimit);
      setGroups((prev) => [...prev, created]);
      setName("");
      setMemberLimit(4);
      setSelectedGroupId(created.id);
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Failed to create group");
    }
  }

  async function onCreateUser(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      await api.createUser(newUsername, newPassword, false);
      setNewUsername("");
      setNewPassword("");
      if (selectedGroupId) {
        await loadAdminData(selectedGroupId);
      }
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Failed to create user");
    }
  }

  async function onAddMember(): Promise<void> {
    if (!selectedGroupId || !selectedUserId) {
      return;
    }
    setError(null);
    try {
      await api.addGroupMember(selectedGroupId, selectedUserId);
      await loadAdminData(selectedGroupId);
      setSelectedUserId(null);
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Failed to add member");
    }
  }

  async function onDeleteGroup(groupId: number): Promise<void> {
    if (!session?.claims.is_admin) {
      return;
    }
    setError(null);
    setDeletingGroupIds((prev) => [...prev, groupId]);
    try {
      await api.deleteGroup(groupId);
      setGroups((prevGroups) => {
        const nextGroups = prevGroups.filter((group) => group.id !== groupId);
        setSelectedGroupId((current) => {
          if (current !== groupId) {
            return current;
          }
          return nextGroups[0]?.id ?? null;
        });
        return nextGroups;
      });
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Failed to delete group");
    } finally {
      setDeletingGroupIds((prev) => prev.filter((id) => id !== groupId));
    }
  }

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;
  const availableUsers = useMemo(() => {
    const memberIds = new Set(members.map((member) => member.user_id));
    return users.filter((user) => !memberIds.has(user.id));
  }, [members, users]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-black text-brand-900">Groups</h1>
        <p className="mt-1 text-sm text-slate-600">Create collaboration spaces with up to four members.</p>
        <form className="mt-4 grid gap-3 md:grid-cols-[1fr_140px_140px]" onSubmit={onCreateGroup}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            data-testid="group-name-input"
            placeholder="Group name"
            className="rounded-lg border border-brand-100 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            required
          />
          <select
            value={memberLimit}
            onChange={(event) => setMemberLimit(Number(event.target.value))}
            data-testid="group-member-limit"
            className="rounded-lg border border-brand-100 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          >
            <option value={2}>2 members</option>
            <option value={3}>3 members</option>
            <option value={4}>4 members</option>
          </select>
          <button data-testid="group-create-button" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700">
            Create Group
          </button>
        </form>
        {loading && (
          <p className="mt-3 text-sm text-slate-500" role="status" aria-live="polite">
            Refreshing groups…
          </p>
        )}
        {error && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-brand-900">Your Groups</h2>
          <ul className="mt-4 space-y-3">
            {groups.map((group) => (
              <li
                key={group.id}
                className={`rounded-xl border p-3 ${
                  selectedGroupId === group.id ? "border-brand-400 bg-brand-50" : "border-slate-200"
                }`}
              >
                <button type="button" onClick={() => setSelectedGroupId(group.id)} className="w-full text-left">
                  <p className="font-semibold text-slate-900">{group.name}</p>
                  <p className="text-sm text-slate-500">Limit: {group.member_limit}</p>
                </button>
                <div className="mt-3 flex gap-2">
                  <Link
                    to={`/groups/${group.id}/categories`}
                    data-testid={`group-open-${group.id}`}
                    className="rounded-md border border-brand-200 px-2 py-1 text-xs font-semibold text-brand-800 hover:bg-brand-50"
                  >
                    Open Categories
                  </Link>
                  {session?.claims.is_admin && (
                    <button
                      type="button"
                      onClick={() => void onDeleteGroup(group.id)}
                      disabled={deletingGroupIds.includes(group.id)}
                      data-testid={`group-delete-${group.id}`}
                      className="rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {deletingGroupIds.includes(group.id) ? "Deleting…" : "Delete"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {session?.claims.is_admin && selectedGroup ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-brand-900">Member Management</h2>
              <p className="mt-1 text-sm text-slate-600">Group: {selectedGroup.name}</p>

              <div className="mt-3 flex gap-2">
                <select
                  value={selectedUserId ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSelectedUserId(value ? Number(value) : null);
                  }}
                  data-testid="member-user-select"
                  className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                >
                  <option value="">Select user to add</option>
                  {availableUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.username}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={onAddMember}
                  data-testid="member-add-button"
                  className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Add
                </button>
              </div>

              <ul className="mt-3 grid grid-cols-2 gap-2">
                {members.map((member) => (
                  <li key={member.user_id} className="rounded-md bg-slate-100 px-2 py-1 text-sm text-slate-700">
                    {member.username}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
              <h3 className="font-bold text-brand-900">Create User (Admin)</h3>
              <form className="mt-3 space-y-2" onSubmit={onCreateUser}>
                <input
                  value={newUsername}
                  onChange={(event) => setNewUsername(event.target.value)}
                  data-testid="new-user-username"
                  placeholder="Username"
                  className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm"
                  required
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  data-testid="new-user-password"
                  placeholder="Password"
                  className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm"
                  required
                />
                <button
                  className="rounded-lg border border-brand-300 px-3 py-2 text-sm font-semibold text-brand-900 hover:bg-brand-50"
                  data-testid="new-user-submit"
                >
                  Create User
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-brand-100 bg-white p-5 text-sm text-slate-600 shadow-sm">
            Select a group to continue to categories.
          </div>
        )}
      </section>
    </div>
  );
}
