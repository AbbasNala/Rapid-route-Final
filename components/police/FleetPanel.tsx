"use client";

import { CheckCircle2, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { Panel, SectionTitle } from "@/components/ui/card";
import {
  getActiveJourneyFor,
  getJourneyStats,
  getNextJunction,
} from "@/lib/selectors";
import { fmtClock, fmtDistance, fmtEta } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppState } from "@/types";

export function FleetPanel({
  state,
  selectedId,
  onSelect,
}: {
  state: AppState;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const completed = state.journeys
    .filter((j) => j.status === "completed")
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    .slice(0, 6);

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-3 lg:p-0">
      <Panel>
        <SectionTitle title={`Fleet — ${state.ambulances.length} units`} />
        <div className="space-y-2 p-3 pt-1">
          {state.ambulances.map((a) => {
            const j = getActiveJourneyFor(state, a.id);
            const stats = j ? getJourneyStats(j) : null;
            const next = j ? getNextJunction(state, j) : null;
            const selected = selectedId === a.id;
            return (
              <button
                key={a.id}
                onClick={() => onSelect(a.id)}
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition-colors",
                  selected
                    ? "border-white bg-panel-2"
                    : "border-line bg-ink hover:border-slate-500",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold">
                    {a.number}
                  </span>
                  {a.status === "enroute" ? (
                    <Chip tone="red">ENROUTE</Chip>
                  ) : (
                    <Chip tone="neutral">STANDBY</Chip>
                  )}
                </div>
                <div className="mt-1 text-xs text-muted">{a.driverName}</div>
                {j && stats ? (
                  <div className="mt-2 space-y-1.5 border-t border-line pt-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-200">{j.hospitalName}</span>
                      <span className="font-mono text-slate-100">
                        {fmtEta(stats.etaSec)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-muted">
                      <span>{fmtDistance(stats.remainingM)} remaining</span>
                      {next && (
                        <span>
                          next: {next.junction.name.replace(" Junction", " Jn")}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-end">
                      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted">
                        <Navigation size={10} />{" "}
                        {j.routeSource === "ors" ? "ORS route" : "demo route"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 border-t border-line pt-2 text-xs text-muted">
                    Standing by at base
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel>
        <SectionTitle
          title={`Completed today — ${state.completedToday}`}
          right={<Chip tone="green">{state.completedToday}</Chip>}
        />
        <div className="space-y-1.5 p-3 pt-1">
          {completed.length === 0 && (
            <EmptyRow text="No completed journeys yet." />
          )}
          {completed.map((j) => (
            <div
              key={j.id}
              className="flex items-center gap-2.5 rounded-lg bg-ink p-2.5 text-xs"
            >
              <CheckCircle2 size={14} className="shrink-0 text-success" />
              <span className="font-mono font-semibold">
                {j.ambulanceNumber}
              </span>
              <span className="truncate text-muted">→ {j.hospitalName}</span>
              <span className="ml-auto shrink-0 text-muted">
                {j.completedAt ? fmtClock(j.completedAt) : ""} ·{" "}
                {j.durationSec ? fmtEta(j.durationSec) : ""}
              </span>
            </div>
          ))}
          {completed.length > 0 && state.completedToday > completed.length && (
            <div className="pt-1 text-center text-[11px] text-muted">
              + {state.completedToday - completed.length} earlier today
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-lg bg-ink p-3 text-center text-xs text-muted">
      {text}
    </div>
  );
}
