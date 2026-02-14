import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { CatalogItemOut, VennResponse } from "../api/types";
import { HttpError } from "../api/client";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../hooks/useAuth";
import { useIsMobile } from "../hooks/useIsMobile";

interface RegionSpec {
  mask: number;
  label: string;
  cx: number;
  cy: number;
  radius: number;
}

const classicRegions: RegionSpec[] = [
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

const edwardsRegions: RegionSpec[] = [
  { mask: 1, label: "A", cx: 120, cy: 140, radius: 38 },
  { mask: 2, label: "B", cx: 520, cy: 140, radius: 38 },
  { mask: 4, label: "C", cx: 120, cy: 280, radius: 38 },
  { mask: 8, label: "D", cx: 520, cy: 280, radius: 38 },
  { mask: 3, label: "A∩B", cx: 320, cy: 100, radius: 32 },
  { mask: 5, label: "A∩C", cx: 170, cy: 210, radius: 32 },
  { mask: 9, label: "A∩D", cx: 250, cy: 292, radius: 30 },
  { mask: 6, label: "B∩C", cx: 390, cy: 128, radius: 30 },
  { mask: 10, label: "B∩D", cx: 470, cy: 210, radius: 32 },
  { mask: 12, label: "C∩D", cx: 320, cy: 320, radius: 32 },
  { mask: 7, label: "ABC", cx: 250, cy: 170, radius: 24 },
  { mask: 11, label: "ABD", cx: 320, cy: 170, radius: 24 },
  { mask: 13, label: "ACD", cx: 320, cy: 250, radius: 24 },
  { mask: 14, label: "BCD", cx: 390, cy: 250, radius: 24 },
  { mask: 15, label: "ABCD", cx: 320, cy: 210, radius: 18 },
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
const svgLogoSize = 24;
const svgLogoGap = 6;
const avatarChipClassName = "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-slate-900";
const MAX_CHIPS_PER_SECTION = 4;
const CATALOG_PAGE_SIZE = 25;
const ALL_MASKS = Array.from({ length: 15 }, (_, idx) => idx + 1);
const BUILTIN_LABELS: Record<string, string> = {
  music: "Music",
  movies: "Movies",
  tv_shows: "TV Shows",
  hobbies: "Hobbies",
};

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
  const { groupId: groupIdParam, categoryKey, categoryId: categoryIdParam } = useParams();
  const [searchParams] = useSearchParams();
  const routeGroupId = Number(groupIdParam);
  const queryGroupId = Number(searchParams.get("groupId") ?? "");
  const groupId = routeGroupId || queryGroupId;
  const categoryId = Number(categoryIdParam);
  const isGroupKeyRoute = Boolean(routeGroupId && categoryKey);
  const isMobile = useIsMobile();
  const { session } = useAuth();

  const [venn, setVenn] = useState<VennResponse>({});
  const [selectedMask, setSelectedMask] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [groupMemberLimit, setGroupMemberLimit] = useState<number | null>(null);
  const [deletingItemIds, setDeletingItemIds] = useState<number[]>([]);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogSearchTerm, setCatalogSearchTerm] = useState("");
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogResults, setCatalogResults] = useState<CatalogItemOut[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogActionInFlight, setCatalogActionInFlight] = useState<string | null>(null);
  const catalogDebounceTimerRef = useRef<number | null>(null);
  const catalogRequestIdRef = useRef(0);

  const builtinKey = isGroupKeyRoute && categoryKey ? categoryKey : null;

  const refresh = useCallback(async () => {
    if (!isGroupKeyRoute && !categoryId) {
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = isGroupKeyRoute && categoryKey
        ? await api.getGroupVenn(groupId, categoryKey)
        : await api.getVenn(categoryId);
      setVenn(data);
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Failed to load venn");
    } finally {
      setLoading(false);
    }
  }, [api, categoryId, categoryKey, groupId, isGroupKeyRoute]);

  useEffect(() => {
    if (!isGroupKeyRoute && !categoryId) {
      return;
    }
    void refresh();
  }, [categoryId, isGroupKeyRoute, refresh]);

  useEffect(() => {
    if (!groupId) {
      setGroupMemberLimit(null);
      return;
    }
    let active = true;
    api
      .listGroups()
      .then((groups) => {
        if (!active) {
          return;
        }
        const group = groups.find((item) => item.id === groupId);
        setGroupMemberLimit(group?.member_limit ?? null);
      })
      .catch(() => {
        if (active) {
          setGroupMemberLimit(null);
        }
      });
    return () => {
      active = false;
    };
  }, [api, groupId]);

  const handleDeleteItem = useCallback(
    async (item: (VennResponse[string]["items"])[number]) => {
      setError(null);
      setDeletingItemIds((prev) => [...prev, item.id]);
      try {
        if (builtinKey && item.provider && item.provider_id) {
          await api.unlikeCatalogItem(builtinKey, item.provider, item.provider_id);
        } else {
          await api.deleteItem(item.id);
        }
        await refresh();
      } catch (err) {
        setError(err instanceof HttpError ? err.message : "Failed to remove item");
      } finally {
        setDeletingItemIds((prev) => prev.filter((id) => id !== item.id));
      }
    },
    [api, builtinKey, refresh]
  );

  const fetchCatalogItems = useCallback(async () => {
    if (!builtinKey) {
      setCatalogResults([]);
      return;
    }
    const requestId = ++catalogRequestIdRef.current;
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const results = await api.listCatalogItems(builtinKey, catalogSearchTerm, catalogPage, CATALOG_PAGE_SIZE);
      if (requestId === catalogRequestIdRef.current) {
        setCatalogResults(results);
      }
    } catch (err) {
      if (requestId === catalogRequestIdRef.current) {
        setCatalogError(err instanceof HttpError ? err.message : "Failed to load catalog items");
      }
    } finally {
      if (requestId === catalogRequestIdRef.current) {
        setCatalogLoading(false);
      }
    }
  }, [api, builtinKey, catalogPage, catalogSearchTerm]);

  useEffect(() => {
    void fetchCatalogItems();
  }, [fetchCatalogItems]);

  useEffect(() => {
    setCatalogPage(1);
  }, [builtinKey]);

  useEffect(() => {
    if (catalogDebounceTimerRef.current) {
      clearTimeout(catalogDebounceTimerRef.current);
    }
    const timer = window.setTimeout(() => {
      setCatalogPage(1);
      setCatalogSearchTerm(catalogQuery);
      catalogDebounceTimerRef.current = null;
    }, 250);
    catalogDebounceTimerRef.current = timer;
    return () => {
      if (catalogDebounceTimerRef.current === timer) {
        clearTimeout(timer);
        catalogDebounceTimerRef.current = null;
      }
    };
  }, [catalogQuery]);

  function handleCatalogSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (catalogDebounceTimerRef.current) {
      clearTimeout(catalogDebounceTimerRef.current);
      catalogDebounceTimerRef.current = null;
    }
    setCatalogPage(1);
    setCatalogSearchTerm(catalogQuery);
  }

  const handleCatalogLikeToggle = useCallback(
    async (item: CatalogItemOut) => {
      if (!builtinKey) {
        return;
      }
      setCatalogActionInFlight(`${item.provider}-${item.provider_id}`);
      setCatalogError(null);
      try {
        if (item.liked_by_user) {
          await api.unlikeCatalogItem(builtinKey, item.provider, item.provider_id);
        } else {
          await api.likeCatalogItem(builtinKey, item.provider, item.provider_id);
        }
        void fetchCatalogItems();
        void refresh();
      } catch (err) {
        setCatalogError(err instanceof HttpError ? err.message : "Failed to update like");
      } finally {
        setCatalogActionInFlight(null);
      }
    },
    [api, builtinKey, fetchCatalogItems, refresh]
  );

  const selectedSection = venn[String(selectedMask)];
  const allMembers = useMemo(() => gatherUniqueMembers(venn), [venn]);
  const legendMembers = allMembers;
  const memberIndexById = useMemo(() => {
    const map = new Map<number, number>();
    allMembers.forEach((member, idx) => map.set(member.id, idx));
    return map;
  }, [allMembers]);
  const useEdwardsFourSet = !isMobile && (allMembers.length === 4 || groupMemberLimit === 4);
  const displayRegions = useEdwardsFourSet ? edwardsRegions : classicRegions;
  const chipsByMask = useMemo(() => {
    const map = new Map<number, AvatarChip[]>();
    displayRegions.forEach((region) => {
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
  }, [displayRegions, venn, memberIndexById]);

  const categoriesLink = groupId ? `/groups/${groupId}/categories` : "/groups";
  const catalogLabel = builtinKey ? BUILTIN_LABELS[builtinKey] ?? builtinKey : null;
  const canGoToPreviousCatalogPage = catalogPage > 1;
  const canGoToNextCatalogPage = catalogResults.length === CATALOG_PAGE_SIZE;

  if (!isGroupKeyRoute && !categoryId) {
    return <p className="text-sm text-rose-700">Invalid group or category lens.</p>;
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
          <svg viewBox={useEdwardsFourSet ? "0 0 640 420" : "0 0 410 360"} className="w-full">
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
              <linearGradient id="edwardsSurface" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#f8fafc" />
                <stop offset="100%" stopColor="#e2e8f0" />
              </linearGradient>
            </defs>

              {useEdwardsFourSet ? (
                <>
                  <rect x="0" y="0" width="640" height="420" rx="16" fill="url(#edwardsSurface)" />
                  <ellipse cx="260" cy="170" rx="190" ry="110" transform="rotate(-25 260 170)" fill="url(#softA)" />
                  <ellipse cx="380" cy="170" rx="190" ry="110" transform="rotate(25 380 170)" fill="url(#softB)" />
                  <ellipse cx="260" cy="250" rx="190" ry="110" transform="rotate(25 260 250)" fill="url(#softC)" />
                  <ellipse cx="380" cy="250" rx="190" ry="110" transform="rotate(-25 380 250)" fill="url(#softD)" />
                </>
              ) : (
                <>
                  <circle cx="145" cy="180" r="95" fill="url(#softA)" />
                  <circle cx="255" cy="180" r="95" fill="url(#softB)" />
                  <circle cx="200" cy="124" r="95" fill="url(#softC)" />
                  <circle cx="200" cy="236" r="95" fill="url(#softD)" />
                </>
              )}

              {displayRegions.map((region) => {
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
                const logos = (section?.items ?? [])
                  .filter((item): item is typeof item & { logo_url: string } => Boolean(item.logo_url))
                  .slice(0, 2);
                const logoTotalWidth =
                  logos.length * svgLogoSize + Math.max(logos.length - 1, 0) * svgLogoGap;
                const logoStartX = region.cx - logoTotalWidth / 2 + svgLogoSize / 2;
                const logoY = region.cy + region.radius + 8;

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
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedMask(region.mask);
                        }
                      }}
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
                    {logos.map((item, logoIndex) => {
                      const logoCx = logoStartX + logoIndex * (svgLogoSize + svgLogoGap);
                      return (
                        <image
                          key={`logo-${region.mask}-${logoIndex}`}
                          href={item.logo_url}
                          x={logoCx - svgLogoSize / 2}
                          y={logoY - svgLogoSize / 2}
                          width={svgLogoSize}
                          height={svgLogoSize}
                          preserveAspectRatio="xMidYMid slice"
                          aria-label={item.text}
                        />
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
        <ul className="mt-3 space-y-3">
          {(selectedSection?.items ?? []).map((item) => {
            const currentUserId = Number(session?.claims?.sub);
            const isBuiltinItem = Boolean(builtinKey && item.provider && item.provider_id);
            const canUnlikeBuiltin = Number.isFinite(currentUserId) && item.member_ids.includes(currentUserId);
            const isOwner = item.owner_user_id === currentUserId;
            const canManageCustom = Boolean(session?.claims?.is_admin || isOwner);
            const canManage = isBuiltinItem ? canUnlikeBuiltin : canManageCustom;
            const isDeleting = deletingItemIds.includes(item.id);
            return (
              <li key={`${item.id}-${item.text}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start gap-3">
                  {item.logo_url ? (
                    <img
                      src={item.logo_url}
                      alt={`${item.text} logo`}
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-200 text-xs font-semibold uppercase text-slate-600">
                      {item.text.charAt(0) || "?"}
                    </span>
                  )}
                  <div className="flex-1 space-y-1 text-sm">
                    <p className="text-sm font-semibold text-slate-900">{item.text}</p>
                    {item.subtitle && <p className="text-xs text-slate-500">{item.subtitle}</p>}
                    {item.owner_user_id === null ? (
                      <p className="text-xs text-slate-500">Global catalog entry</p>
                    ) : (
                      <p className="text-xs text-slate-500">Owner user id: {item.owner_user_id}</p>
                    )}
                    {item.member_ids.length > 0 && (
                      <p className="text-xs text-slate-500">Members: {item.member_ids.join(", ")}</p>
                    )}
                    {canManage && (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleDeleteItem(item)}
                          disabled={isDeleting}
                          data-testid={`venn-item-delete-${item.id}`}
                          className="rounded-md border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isDeleting ? "Deleting…" : isBuiltinItem ? "Unlike" : "Delete"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          {(selectedSection?.items ?? []).length === 0 && (
            <li className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
              No items in this section yet.
            </li>
          )}
        </ul>
      </section>

      {builtinKey && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Browse {catalogLabel ?? "Catalog"}</h2>
              <p className="text-sm text-slate-500">
                Search the shared catalog and like what your crew values.
              </p>
            </div>
            <form
              onSubmit={handleCatalogSearch}
              className="flex flex-col gap-2 md:flex-row md:items-center md:ml-auto"
            >
              <input
                value={catalogQuery}
                onChange={(event) => setCatalogQuery(event.target.value)}
                placeholder="Search title or ID"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none md:w-64"
              />
              <button
                type="submit"
                disabled={catalogLoading}
                className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 transition hover:border-teal-400 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {catalogLoading ? "Searching…" : "Search"}
              </button>
            </form>
          </div>
          {catalogError && (
            <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{catalogError}</p>
          )}
          <div className="mt-4 space-y-3">
            {catalogResults.length === 0 && !catalogLoading ? (
              <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
                No entries yet. Try a different search.
              </p>
            ) : (
              catalogResults.map((item) => (
                <article
                  key={`${item.provider}-${item.provider_id}`}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:flex-row md:items-center"
                >
                  <div className="flex-none">
                    <img
                      src={item.logo_url}
                      alt={`${item.title} logo`}
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  </div>
                  <div className="flex-1 space-y-1 text-sm">
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    {item.subtitle && <p className="text-xs text-slate-500">{item.subtitle}</p>}
                    <p className="text-xs text-slate-500">{item.like_count.toLocaleString()} likes</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCatalogLikeToggle(item)}
                    disabled={catalogActionInFlight === `${item.provider}-${item.provider_id}`}
                    className="flex-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {item.liked_by_user ? "Unlike" : "Like"}
                  </button>
                </article>
              ))
            )}
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-slate-500">Page {catalogPage}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCatalogPage((prev) => Math.max(1, prev - 1))}
                  disabled={!canGoToPreviousCatalogPage || catalogLoading}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setCatalogPage((prev) => prev + 1)}
                  disabled={!canGoToNextCatalogPage || catalogLoading}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
