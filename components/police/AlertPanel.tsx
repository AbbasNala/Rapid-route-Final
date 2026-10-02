"use client";

import {
  CheckCircle2,
  Phone,
  Route as RouteIcon,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { Panel, SectionTitle } from "@/components/ui/card";
import { getAlertLiveEta } from "@/lib/selectors";
import { fmtEta } from "@/lib/format";
import type { AppState, Alert } from "@/types";

export function AlertPanel({
  state,
  officerName,
  onAcknowledge,
  onViewRoute,
  onContact,
}: {
  state: AppState;
  officerName: string;
  onAcknowledge: (id: string) => void;
  onViewRoute: (ambulanceId: string) => void;
  onContact: (alert: Alert) => void;
}) {
  const pending = state.alerts
    .filter((a) => a.status === "pending")
    .sort((a, b) => a.createdAt - b.createdAt);
  const acknowledged = state.alerts
    .filter((a) => a.status === "acknowledged")
    .sort((a, b) => b.createdAt - a.createdAt);
  const cleared = state.alerts
    .filter((a) => a.status === "cleared")
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);
  const ordered = [...pending, ...acknowledged, ...cleared];

  return (
    <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <SectionTitle
        icon={<Siren size={14} />}
        title="Emergency alerts"
        right={
          pending.length > 0 ? (
            <Chip tone="red">{pending.length} PENDING</Chip>
          ) : (
            <Chip tone="green">ALL CLEAR</Chip>
          )
        }
      />
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3 pt-1">
        {ordered.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-ink p-6 text-center">
            <CheckCircle2 size={22} className="text-success" />
            <div className="text-sm font-semibold text-slate-200">
              No active alerts
            </div>
            <div className="text-xs text-muted">
              Junction geofences are armed — alerts appear here automatically.
            </div>
          </div>
        )}
        {ordered.map((alert) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            liveEta={getAlertLiveEta(state, alert)}
            officerName={officerName}
            onAcknowledge={onAcknowledge}
            onViewRoute={onViewRoute}
            onContact={onContact}
          />
        ))}
      </div>
    </Panel>
  );
}

function AlertCard({
  alert,
  liveEta,
  officerName,
  onAcknowledge,
  onViewRoute,
  onContact,
}: {
  alert: Alert;
  liveEta: number | null;
  officerName: string;
  onAcknowledge: (id: string) => void;
  onViewRoute: (ambulanceId: string) => void;
  onContact: (a: Alert) => void;
}) {
  const eta = liveEta ?? alert.etaSec;
  return (
    <div className={cnAlert(alert.status)}>
      {alert.status === "pending" && (
        <div className="flex items-center gap-2 text-emergency">
          <Siren size={16} />
          <span className="text-sm font-extrabold tracking-wide">
            AMBULANCE APPROACHING
          </span>
        </div>
      )}
      {alert.status === "acknowledged" && (
        <div className="flex items-center gap-2 text-success">
          <ShieldCheck size={16} />
          <span className="text-sm font-extrabold tracking-wide">
            TRAFFIC TEAM NOTIFIED
          </span>
        </div>
      )}
      {alert.status === "cleared" && (
        <div className="flex items-center gap-2 text-muted">
          <CheckCircle2 size={16} className="text-success" />
          <span className="text-sm font-extrabold tracking-wide">
            JUNCTION CLEARED
          </span>
        </div>
      )}

      <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-xs uppercase tracking-wide text-muted">
          Ambulance
        </dt>
        <dd className="font-mono font-semibold">{alert.ambulanceNumber}</dd>
        <dt className="text-xs uppercase tracking-wide text-muted">Junction</dt>
        <dd>{alert.junctionName}</dd>
        <dt className="text-xs uppercase tracking-wide text-muted">ETA</dt>
        <dd className="font-mono font-semibold text-slate-100">
          {fmtEta(eta)}
        </dd>
        <dt className="text-xs uppercase tracking-wide text-muted">
          Destination
        </dt>
        <dd>{alert.hospitalName}</dd>
        <dt className="text-xs uppercase tracking-wide text-muted">Traffic</dt>
        <dd>
          <Chip
            tone={
              alert.traffic === "high"
                ? "amber"
                : alert.traffic === "low"
                  ? "green"
                  : "neutral"
            }
          >
            {alert.traffic}
          </Chip>
        </dd>
        {alert.officer && (
          <>
            <dt className="text-xs uppercase tracking-wide text-muted">
              Officer
            </dt>
            <dd className="text-xs">{alert.officer}</dd>
          </>
        )}
      </dl>

      {alert.status === "pending" && (
        <Button
          variant="primary"
          size="md"
          className="mt-3 w-full"
          onClick={() => onAcknowledge(alert.id)}
        >
          <ShieldCheck size={16} /> ACKNOWLEDGE ALERT
        </Button>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewRoute(alert.ambulanceId)}
        >
          <RouteIcon size={14} /> VIEW ROUTE
        </Button>
        <Button variant="outline" size="sm" onClick={() => onContact(alert)}>
          <Phone size={14} /> CONTACT OFFICER
        </Button>
      </div>
      <div className="mt-2 text-right text-[10px] uppercase tracking-wide text-muted">
        raised{" "}
        {new Date(alert.createdAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
        {officerName ? "" : ""}
      </div>
    </div>
  );
}

function cnAlert(status: Alert["status"]) {
  const base = "rounded-xl border bg-ink p-3.5";
  if (status === "pending")
    return `${base} border-emergency/60 border-l-4 border-l-emergency`;
  if (status === "acknowledged")
    return `${base} border-success/40 border-l-4 border-l-success`;
  return `${base} border-line opacity-80`;
}
