"use client";

import { CheckCircle2, Flag, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, StatusDot } from "@/components/ui/badge";
import { Panel, SectionTitle } from "@/components/ui/card";
import { getAlertLiveEta } from "@/lib/selectors";
import { fmtEta } from "@/lib/format";
import type { AppState } from "@/types";

const TYPE_LABEL: Record<string, string> = {
  accident: "Accident",
  road_blocked: "Road blocked",
  congestion: "Heavy congestion",
  other: "Other",
};

export function JunctionPanel({
  state,
  selectedJunctionId,
  onPrepare,
  onClear,
  onSelectJunction,
}: {
  state: AppState;
  selectedJunctionId?: string;
  onPrepare: (id: string) => void;
  onClear: (id: string) => void;
  onSelectJunction: (id: string) => void;
}) {
  return (
    <Panel>
      <SectionTitle
        title={`Junctions monitoring — ${state.junctions.length}`}
        icon={<Flag size={13} />}
      />
      <div className="space-y-2 p-3 pt-1">
        {state.junctions.length === 0 && (
          <div className="rounded-xl bg-ink p-4 text-center text-xs text-muted">
            No junctions monitored yet. Real junctions are detected along the
            route once an emergency journey is plotted.
          </div>
        )}
        {state.junctions.map((j) => {
          const approach = state.alerts.find(
            (a) => a.junctionId === j.id && a.status !== "cleared",
          );
          const liveEta = approach ? getAlertLiveEta(state, approach) : null;
          return (
            <div
              key={j.id}
              className={`rounded-xl border p-3 ${selectedJunctionId === j.id ? "border-white bg-panel-2" : "border-line bg-ink"}`}
            >
              <button
                className="flex w-full items-center gap-2 text-left"
                onClick={() => onSelectJunction(j.id)}
              >
                <StatusDot
                  tone={
                    j.status === "preparing"
                      ? "red"
                      : j.status === "cleared"
                        ? "green"
                        : "amber"
                  }
                  pulse={j.status === "preparing"}
                />
                <span className="text-sm font-bold">{j.name}</span>
                <Chip
                  tone={
                    j.traffic === "high"
                      ? "amber"
                      : j.traffic === "low"
                        ? "green"
                        : "neutral"
                  }
                  className="ml-auto"
                >
                  {j.traffic} traffic
                </Chip>
              </button>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                <span className="font-mono">{j.officer}</span>
                <span>geofence {j.alertRadius} m</span>
                {approach && (
                  <span className="font-semibold text-emergency">
                    {approach.ambulanceNumber} approaching · ETA{" "}
                    {fmtEta(liveEta ?? approach.etaSec)}
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {j.status === "monitoring"
                    ? "Monitoring"
                    : j.status === "preparing"
                      ? "Preparing"
                      : "Cleared"}
                </span>
                <div className="ml-auto flex gap-1.5">
                  {j.status === "monitoring" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onPrepare(j.id)}
                    >
                      <ShieldCheck size={13} /> MARK PREPARED
                    </Button>
                  )}
                  {j.status === "preparing" && (
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => onClear(j.id)}
                    >
                      <CheckCircle2 size={13} /> MARK CLEARED
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {state.roadblocks.length > 0 && (
          <div className="pt-2">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
              Field reports
            </div>
            <div className="space-y-1.5">
              {state.roadblocks.slice(0, 5).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 rounded-lg border border-amber/30 bg-amber/5 p-2 text-xs"
                >
                  <Flag size={13} className="shrink-0 text-amber" />
                  <span className="font-mono font-semibold">
                    {r.ambulanceNumber}
                  </span>
                  <span className="text-slate-200">
                    {TYPE_LABEL[r.type] ?? r.type}
                  </span>
                  <span className="ml-auto text-muted">
                    {new Date(r.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
