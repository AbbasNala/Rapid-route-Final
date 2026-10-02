"use client";

import { useMemo, useState } from "react";
import { BrainCircuit, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { Panel, SectionTitle } from "@/components/ui/card";
import { assessApproachRisk } from "@/lib/risk";
import type { AppState } from "@/types";

export function AiPanel({ state }: { state: AppState }) {
  const [nonce, setNonce] = useState(0);

  const assessment = useMemo(() => {
    const target =
      state.alerts.find((a) => a.status === "pending") ??
      state.alerts.find((a) => a.status === "acknowledged");
    if (!target) return null;
    return { alert: target, risk: assessApproachRisk(state, target) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.alerts,
    state.roadblocks,
    state.junctions,
    state.ambulances,
    nonce,
  ]);

  const tone =
    assessment?.risk.level === "high"
      ? "red"
      : assessment?.risk.level === "medium"
        ? "amber"
        : "green";

  return (
    <Panel>
      <SectionTitle
        icon={<BrainCircuit size={14} />}
        title="AI Traffic Risk Assistant"
        right={<Chip tone="neutral">LOCAL ENGINE</Chip>}
      />
      <div className="p-3 pt-1">
        {!assessment ? (
          <p className="rounded-xl bg-ink p-4 text-sm text-muted">
            No approaching ambulance right now. The assistant evaluates the next
            junction approach automatically.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Chip tone={tone as "red" | "amber" | "green"}>
                {assessment.risk.level} risk
              </Chip>
              <span className="text-xs text-muted">
                {assessment.alert.ambulanceNumber} →{" "}
                {assessment.alert.junctionName}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 w-7 p-0"
                onClick={() => setNonce((n) => n + 1)}
                aria-label="Reassess"
              >
                <RefreshCw size={13} />
              </Button>
            </div>
            <p className="mt-2.5 rounded-xl bg-ink p-3.5 text-sm leading-relaxed text-slate-100">
              {assessment.risk.message}
            </p>
            <ul className="mt-2 space-y-1">
              {assessment.risk.factors.map((f, i) => (
                <li
                  key={i}
                  className="flex items-start gap-1.5 text-[11px] leading-snug text-muted"
                >
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted" />
                  {f}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-3 border-t border-line pt-2.5 text-[10px] leading-relaxed text-muted">
          Decision-support recommendation from a deterministic local rule
          engine. It does not control traffic signals, does not make medical
          decisions, and does not guarantee arrival times. Officer judgement
          prevails.
        </p>
      </div>
    </Panel>
  );
}
