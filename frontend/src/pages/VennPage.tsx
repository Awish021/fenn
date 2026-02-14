import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    if (!categoryId) {
      return;
    }
    void refresh();
  }, [categoryId]);

  async function refresh(): Promise<void> {
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
  }

  const selectedSection = venn[String(selectedMask)];
  const sortedMasks = useMemo(() => Array.from({ length: 15 }, (_, idx) => idx + 1), []);

  if (!categoryId) {
    return <p className="text-sm text-rose-700">Invalid category.</p>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-teal-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black text-teal-900">Venn</h1>
          <div className="ml-auto flex items-center gap-3">
            <Link to={`/groups/${groupId}/categories`} className="text-sm font-semibold text-teal-700">
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
              const count = section?.items.length ?? 0;
              const selected = selectedMask === region.mask;
              const fill = selected ? "rgba(15, 23, 42, 0.70)" : "rgba(15, 23, 42, 0.16)";

              return (
                <g key={region.mask}>
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
                  />
                  <text
                    x={region.cx}
                    y={region.cy - 4}
                    textAnchor="middle"
                    className="pointer-events-none select-none fill-white text-[10px] font-semibold"
                  >
                    {region.label}
                  </text>
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
          {sortedMasks.map((mask) => {
            const section = venn[String(mask)];
            const selected = selectedMask === mask;
            return (
              <button
                type="button"
                key={mask}
                onClick={() => setSelectedMask(mask)}
                data-testid={`venn-mobile-section-${mask}`}
                className={`w-full rounded-lg border px-3 py-2 text-left ${
                  selected ? "border-teal-400 bg-teal-50" : "border-slate-200 bg-white"
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">Section {mask}</p>
                <p className="text-xs text-slate-600">{section?.items.length ?? 0} items</p>
              </button>
            );
          })}
        </section>
      )}

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
