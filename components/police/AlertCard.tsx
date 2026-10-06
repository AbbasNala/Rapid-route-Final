"use client";
import { CheckCircle2, ShieldCheck, Siren } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDistance, fmtDuration, timeAgo } from "@/lib/utils";
import { riskLevelLabel, type RiskAssessment } from "@/lib/ai/riskProvider";
import type { AlertsRow } from "@/types/database";

export interface EnrichedAlert {
  alert: AlertsRow;
  ambulance: string;
  junction: string;
  hospital: string;
  risk: RiskAssessment | null;
}

export function AlertCard({
  item,
  onAcknowledge,
  onViewRoute,
  busy,
}: {
  item: EnrichedAlert;
  onAcknowledge: (a: AlertsRow) => void;
  onViewRoute: (a: AlertsRow) => void;
  busy: boolean;
}) {
  const { alert, risk } = item;
  const pending = alert.status === "PENDING";

  return (
    <article
      aria-live="polite"
      className={
        alert.status === "PENDING"
          ? "rounded-xl border-l-4 border-l-emergency border-ops-600 bg-ops-900 p-4"
          : alert.status === "ACKNOWLEDGED"
            ? "rounded-xl border-l-4 border-l-warn border-ops-700 bg-ops-900 p-4"
            : "rounded-xl border-l-4 border-l-ok border-ops-800 bg-ops-900/60 p-4"
      }
    >
      <div className="flex items-center justify-between gap-2">
        {alert.status === "PENDING" && (
          <p className="flex items-center gap-1.5 font-display text-base font-bold uppercase tracking-wide text-emergency-bright">
            <Siren className="h-4 w-4" aria-hidden="true" /> Ambulance
            approaching
          </p>
        )}
        {alert.status === "ACKNOWLEDGED" && (
          <p className="flex items-center gap-1.5 font-display text-base font-bold uppercase tracking-wide text-warn">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Traffic team
            notified
          </p>
        )}
        {alert.status === "CLEARED" && (
          <p className="flex items-center gap-1.5 font-display text-base font-bold uppercase tracking-wide text-ok">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Junction
            cleared
          </p>
        )}
        <time className="font-mono text-[11px] text-ops-400">
          {timeAgo(alert.created_at)}
        </time>
      </div>

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        <dt className="text-ops-400">Ambulance</dt>
        <dd className="font-semibold">{item.ambulance}</dd>
        <dt className="text-ops-400">Junction</dt>
        <dd className="font-semibold">{item.junction}</dd>
        <dt className="text-ops-400">ETA</dt>
        <dd className="font-mono tabular">{fmtDuration(alert.eta_seconds)}</dd>
        <dt className="text-ops-400">Distance</dt>
        <dd className="font-mono tabular">{fmtDistance(alert.distance_m)}</dd>
        <dt className="text-ops-400">Destination</dt>
        <dd>{item.hospital}</dd>
      </dl>

      {risk && (
        <div className="mt-3 rounded-lg border border-ops-700 bg-ops-850 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ops-400">
              Traffic risk recommendation
            </p>
            <Badge
              variant={
                risk.level === "CRITICAL" || risk.level === "HIGH"
                  ? "emergency"
                  : risk.level === "MODERATE"
                    ? "warn"
                    : "ok"
              }
            >
              {riskLevelLabel(risk.level)}
            </Badge>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-ops-300">
            {risk.recommendation}
          </p>
        </div>
      )}

      {pending && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            variant="ok"
            onClick={() => onAcknowledge(alert)}
            disabled={busy}
          >
            Acknowledge
          </Button>
          <Button variant="outline" onClick={() => onViewRoute(alert)}>
            View route
          </Button>
        </div>
      )}
      {alert.status === "ACKNOWLEDGED" && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full"
          onClick={() => onViewRoute(alert)}
        >
          View route
        </Button>
      )}
    </article>
  );
}
