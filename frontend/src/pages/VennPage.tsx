import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { VennResponse } from "../api/types";
import { HttpError } from "../api/client";
import { useApi } from "../hooks/useApi";
import { useIsMobile } from "../hooks/useIsMobile";

interface RegionSpec {
  mask: number;
  label: string;
  cx: number;
  cy: number;
  radius: number;
}

const regions: RegionSpec[] = [
  { mask: 1, label: "A", cx: 120, cy: 180, radius: 48 },
  { mask: 2, label: "B", cx: 290, cy: 180, radius: 48 },
  { mask: 4, label: "C", cx: 200, cy: 84, radius: 42 },
  { mask: 8, label: "D", cx: 200, cy: 280, radius: 42 },
  { mask: 3, label: "A∩B", cx: 200, cy: 180, radius: 36 },
  { mask: 5, label: "A∩C", cx: 150, cy: 124, radius: 32 },
  { mask: 9, label: "A∩D", cx: 150, cy: 236, radius: 32 },
  { mask: 6, label: "B∩C", cx: 250, cy: 124, radius: 32 },
  { mask: 10, label: "B∩D", cx: 250, cy: 236, radius: 32 },
  { mask: 12, label: "C∩D", cx: 200, cy: 240, radius: 32 },
  { mask: 7, label: "ABC", cx: 176, cy: 145, radius: 24 },
  { mask: 11, label: "ABD", cx: 176, cy: 215, radius: 24 },
  { mask: 13, label: "ACD", cx: 160, cy: 180, radius: 24 },
  { mask: 14, label: "BCD", cx: 240, cy: 180, radius: 24 },
  { mask: 15, label: "ABCD", cx: 200, cy: 180, radius: 16 },
];

interface MemberRef {
  id: number;
  username: string;
  avatar_data_url?: string;
}

interface AvatarChip {
  id: string;
  initial: string;
  color: string;
  label: string;
  imageUrl?: string;
}

const avatarChipPalette = ["#c7d2fe", "#6ee7b7", "#fde68a", "#fb7185"];
const placeholderChipColor = "#94a3b8";
const svgChipDiameter = 18;
const svgChipGap = 4;
const avatarChipClassName = "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-slate-900";
const MAX_CHIPS_PER_SECTION = 4;
const ALL_MASKS = Array.from({ length: 15 }, (_, idx) => idx + 1);

function gatherUniqueMembers(venn: VennResponse): MemberRef[] {
  const membersById = new Map<number, MemberRef>();
  Object.values(venn).forEach((section) => {
    (section.members ?? []).forEach((member) => membersById.set(member.id, member));
  });
  return [...membersById.values()].sort((a, b) => a.id - b.id);
}

function getAvatarInitial(username?: string): string {
  const text = username?.trim();
  if (!text) {
    return "?";
  }
  return text.charAt(0).toUpperCase();
}

function getAvatarColor(index: number): string {
  if (index < avatarChipPalette.length) {
    return avatarChipPalette[index];
  }
  const hue = (index * 67) % 360;
  return `hsl(${hue}, 70%, 80%)`;
}

function buildAvatarChip(member: MemberRef, paletteIndex: number): AvatarChip {
  return {
    id: `member-${member.id}`,
    initial: getAvatarInitial(member.username),
    color: getAvatarColor(paletteIndex),
    label: member.username,
    imageUrl: member.avatar_data_url,
  };
}

function sectionMembers(venn: VennResponse, mask: number): string {
  return (venn[String(mask)]?.members ?? []).map((member) => member.username).join(", ");
}

export function VennPage() {
  const api = useApi();
  const { categoryId: categoryIdParam } = useParams();
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get("groupId") ?? "";
  const categoryId = Number(categoryIdParam);
  const isMobile = useIsMobile();

  const [venn, setVenn] = useState<VennResponse>({});
  const [selectedMask, setSelectedMask] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await api.getVenn(categoryId);
      setVenn(data);
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Failed to load venn");
    } finally {
      setLoading(false);
    }
  }, [api, categoryId]);

  useEffect(() => {
    if (!categoryId) {
      return;
    }
    void refresh();
  }, [categoryId, refresh]);

  const selectedSection = venn[String(selectedMask)];
  const allMembers = useMemo(() => gatherUniqueMembers(venn), [venn]);
  const legendMembers = allMembers;
  const memberIndexById = useMemo(() => {
    const map = new Map<number, number>();
    allMembers.forEach((member, idx) => map.set(member.id, idx));
    return map;
  }, [allMembers]);
  const chipsByMask = useMemo(() => {
    const map = new Map<number, AvatarChip[]>();
    regions.forEach((region) => {
      const mask = region.mask;
      const section = venn[String(mask)];
      const members = section?.members ?? [];
      if (members.length === 0) {
        map.set(mask, [
          {
            id: `placeholder-${mask}`,
            initial: "?",
            color: placeholderChipColor,
            label: "No members yet",
          },
        ]);
        return;
      }
      const chips = members.slice(0, MAX_CHIPS_PER_SECTION).map((member) => {
        const memberIdx = memberIndexById.get(member.id) ?? 0;
        return buildAvatarChip(member, memberIdx);
      });
      if (members.length > MAX_CHIPS_PER_SECTION) {
        chips.push({
          id: `overflow-${mask}`,
          initial: `+${members.length - MAX_CHIPS_PER_SECTION}`,
          color: placeholderChipColor,
          label: `${members.length - MAX_CHIPS_PER_SECTION} more members`,
        });
      }
      map.set(mask, chips);
    });
    return map;
  }, [venn, memberIndexById]);

  const categoriesLink = groupId ? `/groups/${groupId}/categories` : "/groups";

  if (!categoryId) {
    return <p className="text-sm text-rose-700">Invalid category.</p>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-teal-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black text-teal-900">Venn</h1>
          <div className="ml-auto flex items-center gap-3">
            <Link to={categoriesLink} className="text-sm font-semibold text-teal-700">
              Back to Categories
            </Link>
            {loading && (
              <span className="text-sm text-slate-500" role="status" aria-live="polite">
                Loading sections…
              </span>
            )}
            <button
              type="button"
              onClick={() => void refresh()}
              data-testid="venn-refresh"
              disabled={loading}
              className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Refresh
            </button>
          </div>
        </div>
        <p className="mt-1 text-sm text-slate-600">Click a section to inspect its items.</p>
        {error && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </section>

      {!isMobile ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <svg viewBox="0 0 410 360" className="w-full">
            <defs>
              <radialGradient id="softA" cx="50%" cy="50%" r="60%">
                <stop offset="0%" stopColor="#66c2ff" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#1f78b4" stopOpacity="0.12" />
              </radialGradient>
              <radialGradient id="softB" cx="50%" cy="50%" r="60%">
                <stop offset="0%" stopColor="#f8c56d" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#d97706" stopOpacity="0.12" />
              </radialGradient>
              <radialGradient id="softC" cx="50%" cy="50%" r="60%">
                <stop offset="0%" stopColor="#9ce7d8" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#0f766e" stopOpacity="0.12" />
              </radialGradient>
              <radialGradient id="softD" cx="50%" cy="50%" r="60%">
                <stop offset="0%" stopColor="#f6a8b8" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#be185d" stopOpacity="0.12" />
              </radialGradient>
            </defs>

            <circle cx="145" cy="180" r="95" fill="url(#softA)" />
            <circle cx="255" cy="180" r="95" fill="url(#softB)" />
            <circle cx="200" cy="124" r="95" fill="url(#softC)" />
            <circle cx="200" cy="236" r="95" fill="url(#softD)" />

            {regions.map((region) => {
              const section = venn[String(region.mask)];
              const selected = selectedMask === region.mask;
              const chips = chipsByMask.get(region.mask) ?? [
                {
                  id: `placeholder-${region.mask}`,
                  initial: "?",
                  color: placeholderChipColor,
                  label: "No members yet",
                },
              ];
              const sectionLabel = sectionMembers(venn, region.mask) || "No members yet";
              const ariaLabel = `Section ${region.mask}. ${sectionLabel}`;
              const count = section?.items?.length ?? 0;
              const fill = selected ? "rgba(15, 23, 42, 0.70)" : "rgba(15, 23, 42, 0.16)";
              const chipTotalWidth =
                chips.length * svgChipDiameter + Math.max(chips.length - 1, 0) * svgChipGap;
              const chipRadius = svgChipDiameter / 2;
              const chipStartX = region.cx - chipTotalWidth / 2 + chipRadius;
              const chipCenterY = region.cy - 8;

              return (
                <g key={region.mask}>
                  <title>{ariaLabel}</title>
                  <circle
                    cx={region.cx}
                    cy={region.cy}
                    r={region.radius}
                    fill={fill}
                    stroke={selected ? "#ffffff" : "rgba(255,255,255,0.5)"}
                    strokeWidth={selected ? 2 : 1}
                    data-testid={`venn-region-${region.mask}`}
                    className="cursor-pointer transition-all hover:fill-slate-700/60"
                    onClick={() => setSelectedMask(region.mask)}
                    role="button"
                    aria-pressed={selected}
                    aria-label={ariaLabel}
                  />
                  {chips.map((chip, chipIndex) => {
                    const chipCx = chipStartX + chipIndex * (svgChipDiameter + svgChipGap);
                    const clipPathId = `chip-clip-${region.mask}-${chip.id}`;
                    return (
                      <g key={`${region.mask}-${chip.id}`}>
                        <title>{chip.label}</title>
                        <defs>
                          <clipPath id={clipPathId}>
                            <circle cx={chipCx} cy={chipCenterY} r={chipRadius} />
                          </clipPath>
                        </defs>
                        <circle cx={chipCx} cy={chipCenterY} r={chipRadius} fill={chip.color} aria-hidden="true" />
                        {chip.imageUrl ? (
                          <image
                            href={chip.imageUrl}
                            x={chipCx - chipRadius}
                            y={chipCenterY - chipRadius}
                            width={svgChipDiameter}
                            height={svgChipDiameter}
                            clipPath={`url(#${clipPathId})`}
                            preserveAspectRatio="xMidYMid slice"
                            aria-label={chip.label}
                          />
                        ) : (
                          <text
                            x={chipCx}
                            y={chipCenterY + 3}
                            textAnchor="middle"
                            className="pointer-events-none select-none fill-slate-900 text-[10px] font-semibold"
                            aria-hidden="true"
                          >
                            {chip.initial}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  <text
                    x={region.cx}
                    y={region.cy + 10}
                    textAnchor="middle"
                    className="pointer-events-none select-none fill-white text-[10px]"
                  >
                    {count}
                  </text>
                </g>
              );
            })}
          </svg>
        </section>
      ) : (
        <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">Sections (mobile fallback)</h2>
          {ALL_MASKS.map((mask) => {
            const section = venn[String(mask)];
            const selected = selectedMask === mask;
            const chips =
              chipsByMask.get(mask) ?? [
                {
                  id: `placeholder-${mask}`,
                  initial: "?",
                  color: placeholderChipColor,
                  label: "No members yet",
                },
              ];
            const sectionLabel = sectionMembers(venn, mask) || "No members yet";
            return (
              <button
                type="button"
                key={mask}
                onClick={() => setSelectedMask(mask)}
                data-testid={`venn-mobile-section-${mask}`}
                className={`w-full rounded-lg border px-3 py-2 text-left ${
                  selected ? "border-teal-400 bg-teal-50" : "border-slate-200 bg-white"
                }`}
                aria-pressed={selected}
                aria-label={`Section ${mask}. ${sectionLabel}`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    {chips.map((chip) =>
                      chip.imageUrl ? (
                        <img
                          key={`mobile-${mask}-${chip.id}`}
                          src={chip.imageUrl}
                          alt={chip.label}
                          className="h-6 w-6 rounded-full object-cover"
                        />
                      ) : (
                        <span
                          key={`mobile-${mask}-${chip.id}`}
                          className={avatarChipClassName}
                          style={{ backgroundColor: chip.color }}
                          title={chip.label}
                          aria-label={chip.label}
                        >
                          {chip.initial}
                        </span>
                      )
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Section {mask}</p>
                    <p className="text-xs text-slate-600">{section?.items?.length ?? 0} items</p>
                  </div>
                </div>
              </button>
            );
          })}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Legend</h2>
          <p className="text-xs uppercase tracking-wide text-slate-500">Avatar mapping</p>
        </div>
        {legendMembers.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No members have joined this category yet.</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {legendMembers.map((member) => {
              const memberIdx = memberIndexById.get(member.id) ?? 0;
              const chipColor = getAvatarColor(memberIdx);
              return (
                <div
                  key={member.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  {member.avatar_data_url ? (
                    <img
                      src={member.avatar_data_url}
                      alt={member.username}
                      className="h-6 w-6 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      className={avatarChipClassName}
                      style={{ backgroundColor: chipColor }}
                      title={member.username}
                      aria-label={member.username}
                    >
                      {getAvatarInitial(member.username)}
                    </span>
                  )}
                  <p className="text-sm font-semibold text-slate-900">{member.username}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Section {selectedMask}</h2>
        <p className="mt-1 text-sm text-slate-600">Members: {sectionMembers(venn, selectedMask) || "None"}</p>
        <ul className="mt-3 space-y-2">
          {(selectedSection?.items ?? []).map((item) => (
            <li key={item.id} className="rounded-lg bg-slate-100 px-3 py-2">
              <p className="text-sm font-semibold text-slate-900">{item.text}</p>
              <p className="text-xs text-slate-600">Owner user id: {item.owner_user_id}</p>
            </li>
          ))}
          {(selectedSection?.items ?? []).length === 0 && (
            <li className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
              No items in this section yet.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
