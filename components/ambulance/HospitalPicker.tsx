"use client";

import { useMemo, useState } from "react";
import {
  ChevronRight,
  Hospital,
  LocateFixed,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { haversineM } from "@/lib/geofencing";
import { fmtDistance } from "@/lib/format";
import type { Hospital } from "@/types";

export function HospitalPicker({
  ambulanceLat,
  ambulanceLng,
  hospitals,
  live,
  loading,
  onSelect,
  onNearMe,
  onRetry,
}: {
  ambulanceLat: number;
  ambulanceLng: number;
  hospitals: Hospital[];
  live: boolean;
  loading: boolean;
  onSelect: (hospitalId: string) => void;
  onNearMe: () => void;
  onRetry: () => void;
}) {
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const withDist = hospitals.map((h) => ({
      h,
      d: haversineM([ambulanceLat, ambulanceLng], [h.lat, h.lng]),
    }));
    withDist.sort((a, b) => a.d - b.d);
    const needle = q.trim().toLowerCase();
    return needle
      ? withDist.filter((x) => x.h.name.toLowerCase().includes(needle))
      : withDist;
  }, [hospitals, q, ambulanceLat, ambulanceLng]);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold leading-tight">
          Where are you going?
        </h2>
        <Chip tone={live ? "green" : "neutral"}>
          {live ? "LIVE · OSM" : "DEMO LIST"}
        </Chip>
      </div>

      <div className="relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search hospital name…"
          className="h-12 w-full rounded-xl border border-line bg-ink pl-10 pr-4 text-base outline-none focus:border-slate-400"
        />
      </div>

      <Button variant="outline" size="lg" className="w-full" onClick={onNearMe}>
        <LocateFixed size={18} /> FIND HOSPITALS NEAR ME
      </Button>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[76px] animate-pulse rounded-xl border border-line bg-ink/60"
            />
          ))}
          <p className="text-center text-xs text-muted">
            Searching nearby hospitals on OpenStreetMap…
          </p>
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-line bg-ink p-5 text-center">
          <p className="text-sm font-semibold text-slate-200">
            {q ? `No hospitals match “${q}”` : "No hospitals found nearby"}
          </p>
          <Button
            variant="outline"
            size="md"
            className="mt-3"
            onClick={onRetry}
          >
            <RefreshCw size={14} /> RETRY LIVE SEARCH
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">
            <span>
              {list.length} hospital{list.length === 1 ? "" : "s"} · nearest{" "}
              {fmtDistance(list[0].d)}
            </span>
            {!live && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1 text-route hover:underline"
              >
                <RefreshCw size={11} /> load live data
              </button>
            )}
          </div>
          <div className="space-y-2">
            {list.map(({ h, d }) => (
              <button
                key={h.id}
                onClick={() => onSelect(h.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-ink p-4 text-left transition-colors hover:border-slate-500 active:bg-panel-2"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-panel text-success">
                  <Hospital size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold leading-tight">
                    {h.name}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {h.address}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-mono text-sm font-semibold text-slate-200">
                    {fmtDistance(d)}
                  </span>
                  <ChevronRight size={16} className="text-muted" />
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
