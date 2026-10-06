"use client";
// Police operations console — desktop-first. Everything updates live over
// Supabase Realtime (location updates, alerts, journeys, incidents); no refresh.
// Decision support only: this system never controls traffic signals.
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  LogOut,
  Radio,
  ShieldCheck,
  Siren,
  TrafficCone,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { DynamicMap, type MapViewProps } from "@/components/maps/DynamicMap";
import { AlertCard, type EnrichedAlert } from "@/components/police/AlertCard";
import { createClient } from "@/lib/supabase/client";
import { getRiskProvider } from "@/lib/ai/riskProvider";
import { haversineMeters } from "@/lib/geofencing/haversine";
import { fromGeoJson, routeEta } from "@/lib/routing/routeGeometry";
import {
  createBrowserNotifier,
  playAlertSound,
} from "@/lib/notifications/browserNotifications";
import { useNow } from "@/lib/hooks";
import { cn, fmtDistance, fmtDuration, fmtSpeed, timeAgo } from "@/lib/utils";
import type {
  AlertsRow,
  AmbulancesRow,
  HospitalsRow,
  JunctionsRow,
  JourneysRow,
  LocationUpdateRow,
  RoadIncidentsRow,
} from "@/types/database";

interface InitialData {
  ambulances: AmbulancesRow[];
  hospitals: HospitalsRow[];
  junctions: JunctionsRow[];
  journeys: JourneysRow[];
  latestFixes: Record<string, LocationUpdateRow>;
  alerts: AlertsRow[];
  incidents: RoadIncidentsRow[];
}

const INCIDENT_LABELS: Record<string, string> = {
  ACCIDENT: "Accident",
  ROAD_BLOCKED: "Road blocked",
  HEAVY_TRAFFIC: "Heavy traffic",
  CONSTRUCTION: "Construction",
  OTHER: "Other",
};

export function PoliceConsole({
  viewerId,
  initial,
}: {
  viewerId: string;
  initial: InitialData;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const toast = useToast();
  const router = useRouter();
  const now = useNow(1000);
  const riskProvider = React.useMemo(() => getRiskProvider(), []);

  const [ambulances, setAmbulances] = React.useState(initial.ambulances);
  const [fixes, setFixes] = React.useState(initial.latestFixes);
  const [journeys, setJourneys] = React.useState(initial.journeys);
  const [alerts, setAlerts] = React.useState(initial.alerts);
  const [incidents, setIncidents] = React.useState(initial.incidents);
  const [realtime, setRealtime] = React.useState("connecting");
  const [selectedJourneyId, setSelectedJourneyId] = React.useState<
    string | null
  >(null);
  const [alertFilter, setAlertFilter] = React.useState<
    "PENDING" | "ACKNOWLEDGED" | "CLEARED" | "ALL"
  >("PENDING");
  const [muted, setMuted] = React.useState(false);
  const [notifReady, setNotifReady] = React.useState(false);
  const [bannerId, setBannerId] = React.useState<string | null>(null);
  const [ackBusy, setAckBusy] = React.useState<string | null>(null);
  const [fit, setFit] = React.useState(() => ({
    token: 1,
    bounds: initial.junctions.map(
      (j) => [j.latitude, j.longitude] as [number, number],
    ),
  }));

  const notifier = React.useMemo(() => createBrowserNotifier(), []);
  const ambById = React.useMemo(
    () => Object.fromEntries(ambulances.map((a) => [a.id, a])),
    [ambulances],
  );
  const hosById = React.useMemo(
    () => Object.fromEntries(initial.hospitals.map((h) => [h.id, h])),
    [initial.hospitals],
  );
  const jctById = React.useMemo(
    () => Object.fromEntries(initial.junctions.map((j) => [j.id, j])),
    [initial.junctions],
  );

  /* ── Realtime: one channel drives the whole dashboard ───────────────── */
  React.useEffect(() => {
    const channel = supabase
      .channel("police-ops")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "location_updates" },
        ({ new: u }) => {
          if (!u) return;
          setFixes((prev) => ({
            ...prev,
            [u.journey_id]: u as LocationUpdateRow,
          }));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "journeys" },
        ({ new: j }) => {
          if (!j) return;
          setJourneys((prev) =>
            prev.some((x) => x.id === j.id)
              ? prev
              : [...prev, j as JourneysRow],
          );
          toast.info("New emergency journey started.");
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "journeys" },
        ({ new: j }) => {
          if (!j) return;
          setJourneys((prev) =>
            prev.map((x) => (x.id === j.id ? (j as JourneysRow) : x)),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        (payload) => {
          const row = payload.new as AlertsRow | null;
          if (!row) return;
          setAlerts((prev) => {
            const i = prev.findIndex((a) => a.id === row.id);
            if (i === -1) return [row, ...prev];
            const copy = [...prev];
            copy[i] = row;
            return copy;
          });
          if (payload.eventType === "INSERT" && row.status === "PENDING")
            raiseAlarm(row);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "road_incidents" },
        ({ new: i }) => {
          if (!i) return;
          setIncidents((prev) => [i as RoadIncidentsRow, ...prev]);
          const amb = ambById[(i as RoadIncidentsRow).reported_by] ?? null;
          toast.info(
            `Road incident reported: ${INCIDENT_LABELS[(i as RoadIncidentsRow).type] ?? "Other"}`,
          );
          void amb;
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "road_incidents" },
        ({ new: i }) => {
          if (!i) return;
          setIncidents((prev) =>
            prev.map((x) => (x.id === i.id ? (i as RoadIncidentsRow) : x)),
          );
        },
      )
      .subscribe((status) => setRealtime(status));

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function raiseAlarm(a: AlertsRow) {
    if (!muted) playAlertSound();
    notifier.notify({
      title: "AMBULANCE APPROACHING",
      body: `${ambById[a.ambulance_id]?.vehicle_number ?? "Ambulance"} → ${jctById[a.junction_id]?.name ?? "junction"}${a.eta_seconds ? ` · ETA ${fmtDuration(a.eta_seconds)}` : ""}`,
      tag: a.id,
    });
    setBannerId(a.id);
  }

  async function acknowledge(a: AlertsRow) {
    setAckBusy(a.id);
    const { error } = await supabase
      .from("alerts")
      .update({
        status: "ACKNOWLEDGED",
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: viewerId,
      })
      .eq("id", a.id)
      .eq("status", "PENDING"); // guard against double-ack races
    setAckBusy(null);
    if (error) {
      toast.error("Acknowledgement failed: " + error.message);
      return;
    }
    void supabase.from("audit_log").insert({
      actor: viewerId,
      action: "alert.acknowledge",
      details: { alert_id: a.id },
    });
  }

  async function resolveIncident(i: RoadIncidentsRow) {
    const { error } = await supabase
      .from("road_incidents")
      .update({ status: "RESOLVED" })
      .eq("id", i.id);
    if (error) {
      toast.error("Could not resolve incident: " + error.message);
      return;
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  /* ── Derived ────────────────────────────────────────────────────────── */
  const activeJourneys = journeys.filter((j) => j.status === "ACTIVE");

  const cards = activeJourneys.map((j) => {
    const amb = ambById[j.ambulance_id];
    const hos = hosById[j.destination_hospital_id];
    const fix = fixes[j.id];
    const pts = fromGeoJson(j.route_geometry);
    const est =
      fix && pts.length >= 2
        ? routeEta(pts, [fix.latitude, fix.longitude], j.estimated_duration)
        : { remainingM: j.distance, etaS: j.estimated_duration, fromRouteM: 0 };
    const nearestJunction = fix
      ? (initial.junctions
          .map((jct) => ({ jct, d: haversineMeters(fix, jct) }))
          .sort((a, b) => a.d - b.d)[0] ?? null)
      : null;
    return { journey: j, amb, hos, fix, ...est, nearestJunction };
  });

  const enrichedAlerts: EnrichedAlert[] = alerts.map((a) => {
    const junction = jctById[a.junction_id];
    const activeIncidentsNearby = incidents.filter(
      (i) =>
        junction &&
        i.status === "ACTIVE" &&
        haversineMeters(i, junction) < 1000,
    ).length;
    return {
      alert: a,
      ambulance: ambById[a.ambulance_id]?.vehicle_number ?? "Unknown vehicle",
      junction: junction?.name ?? "Unknown junction",
      hospital:
        hosById[
          journeys.find((j) => j.id === a.journey_id)
            ?.destination_hospital_id ?? ""
        ]?.name ?? "—",
      risk: riskProvider.assess({
        etaSeconds: a.eta_seconds,
        distanceM: a.distance_m,
        activeIncidentsNearby,
        acknowledged: a.status !== "PENDING",
        context: {
          junctionName: junction?.name,
          ambulance: ambById[a.ambulance_id]?.vehicle_number,
        },
      }),
    };
  });

  const filteredAlerts = enrichedAlerts.filter((e) =>
    alertFilter === "ALL" ? true : e.alert.status === alertFilter,
  );

  const banner = bannerId
    ? (enrichedAlerts.find(
        (e) => e.alert.id === bannerId && e.alert.status === "PENDING",
      ) ?? null)
    : null;

  type JunctionState = "approaching" | "notified" | "monitoring" | "cleared";
  const junctionStates = initial.junctions
    .map((j) => {
      const active = alerts.filter(
        (a) => a.junction_id === j.id && a.status !== "CLEARED",
      );

      const state: JunctionState = active.some((a) => a.status === "PENDING")
        ? "approaching"
        : active.some((a) => a.status === "ACKNOWLEDGED")
          ? "notified"
          : alerts.some(
                (a) =>
                  a.junction_id === j.id &&
                  a.status === "CLEARED" &&
                  a.cleared_at !== null &&
                  Date.now() - Date.parse(a.cleared_at) < 10 * 60_000,
              )
            ? "cleared"
            : "monitoring";

      return {
        junction: j,
        state,
        activeCount: active.length,
      };
    })
    .sort((a, b) => {
      const rank: Record<JunctionState, number> = {
        approaching: 0,
        notified: 1,
        monitoring: 2,
        cleared: 3,
      };

      return rank[a.state] - rank[b.state];
    });

  const mapProps: MapViewProps = {
    className: "h-full w-full",
    ambulances: cards
      .filter((c) => c.fix)
      .map((c) => ({
        id: c.journey.id,
        position: [c.fix!.latitude, c.fix!.longitude],
        heading: c.fix!.heading,
        label: c.amb?.vehicle_number ?? "Ambulance",
        active: true,
        speedKmh: c.fix!.speed != null ? Math.round(c.fix!.speed * 3.6) : null,
        lastUpdateMs: Date.parse(c.fix!.timestamp),
        destination: c.hos?.name,
      })),
    junctions: junctionStates.map((j) => ({
      id: j.junction.id,
      position: [j.junction.latitude, j.junction.longitude],
      radiusM: j.junction.geofence_radius,
      label: j.junction.name,
      state: j.state,
    })),
    hospitals: initial.hospitals.map((h) => ({
      id: h.id,
      position: [h.latitude, h.longitude],
      label: h.name,
    })),
    incidents: incidents
      .filter((i) => i.status === "ACTIVE")
      .map((i) => ({
        id: i.id,
        position: [i.latitude, i.longitude],
        label: INCIDENT_LABELS[i.type] ?? "Incident",
      })),
    routes: activeJourneys.map((j) => ({
      id: j.id,
      points: fromGeoJson(j.route_geometry),
      highlight: j.id === selectedJourneyId,
    })),
    fit,
  };

  const online = realtime === "SUBSCRIBED";

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ops-700 bg-ops-900 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-emergency"
            aria-hidden="true"
          >
            <Siren className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold uppercase leading-none tracking-wide">
              RapidRoute
            </h1>
            <p className="text-[10px] uppercase tracking-[0.22em] text-ops-400">
              Traffic operations
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "hidden items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider sm:flex",
              online ? "text-ok" : "text-warn",
            )}
          >
            <Radio className="h-4 w-4" aria-hidden="true" />
            {online
              ? "Realtime online"
              : realtime === "connecting"
                ? "Connecting…"
                : "Reconnecting…"}
          </span>
          <span className="hidden font-mono text-xs text-ops-300 tabular md:block">
            {new Date(now).toLocaleTimeString()}
          </span>
          {!notifReady && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () =>
                setNotifReady(await notifier.requestPermission())
              }
            >
              Enable alerts
            </Button>
          )}
          <button
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "Unmute alert sound" : "Mute alert sound"}
            className="rounded-lg p-2 text-ops-400 hover:bg-ops-800 hover:text-white"
          >
            {muted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={signOut}
            aria-label="Sign out"
            className="rounded-lg p-2 text-ops-400 hover:bg-ops-800 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Prominent new-alert banner */}
      {banner && (
        <div
          role="alert"
          className="shrink-0 border-b border-emergency/60 bg-emergency/15 px-4 py-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-emergency-bright">
              <Siren className="h-5 w-5" aria-hidden="true" />
              Ambulance approaching — {banner.ambulance} → {banner.junction}
              <span className="font-mono text-sm font-semibold text-ops-200">
                ETA {fmtDuration(banner.alert.eta_seconds)}
              </span>
            </p>
            <div className="flex gap-2">
              <Button
                variant="ok"
                size="sm"
                onClick={() => acknowledge(banner.alert)}
                disabled={ackBusy === banner.alert.id}
              >
                Acknowledge
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedJourneyId(banner.alert.journey_id);
                  const j = journeys.find(
                    (x) => x.id === banner.alert.journey_id,
                  );
                  if (j)
                    setFit({
                      token: Date.now(),
                      bounds: fromGeoJson(j.route_geometry),
                    });
                  setBannerId(null);
                }}
              >
                View route
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBannerId(null)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[300px_1fr_360px] lg:overflow-hidden">
        {/* Left: ambulances + junction status */}
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto">
          <section
            aria-label="Active ambulances"
            className="rounded-xl border border-ops-700 bg-ops-900"
          >
            <h2 className="border-b border-ops-700 px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-[0.14em] text-ops-300">
              Active ambulances ({cards.length})
            </h2>
            <div className="divide-y divide-ops-800">
              {cards.length === 0 && (
                <p className="px-4 py-6 text-sm text-ops-400">
                  No active ambulances — system standing by.
                </p>
              )}
              {cards.map((c) => (
                <button
                  key={c.journey.id}
                  onClick={() => {
                    setSelectedJourneyId(c.journey.id);
                    const pts = fromGeoJson(c.journey.route_geometry);
                    if (pts.length) setFit({ token: Date.now(), bounds: pts });
                  }}
                  className={cn(
                    "w-full px-4 py-3 text-left hover:bg-ops-850 focus-visible:outline focus-visible:outline-2 focus-visible:outline-warn",
                    selectedJourneyId === c.journey.id && "bg-ops-850",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-lg font-bold uppercase">
                      {c.amb?.vehicle_number ?? "—"}
                    </span>
                    <Badge variant="emergency">Emergency</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ops-300">
                    To {c.hos?.name ?? "—"}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-3 font-mono text-[11px] text-ops-300 tabular">
                    <span>ETA {fmtDuration(c.etaS)}</span>
                    <span>{fmtDistance(c.remainingM)}</span>
                    {c.fix?.speed != null && (
                      <span>{fmtSpeed(c.fix.speed)}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ops-400">
                    {c.nearestJunction && c.nearestJunction.d < 1500 ? (
                      <>
                        Near {c.nearestJunction.jct.name} ·{" "}
                        {fmtDistance(c.nearestJunction.d)} ·{" "}
                      </>
                    ) : null}
                    updated {c.fix ? timeAgo(c.fix.timestamp, now) : "never"}
                  </p>
                </button>
              ))}
            </div>
          </section>

          <section
            aria-label="Junction status"
            className="rounded-xl border border-ops-700 bg-ops-900"
          >
            <h2 className="border-b border-ops-700 px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-[0.14em] text-ops-300">
              Junction status
            </h2>
            <ul className="divide-y divide-ops-800">
              {junctionStates.map(({ junction: j, state, activeCount }) => (
                <li
                  key={j.id}
                  className="flex items-center justify-between gap-2 px-4 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {j.name}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] font-medium",
                        state === "approaching" && "text-emergency-bright",
                        state === "notified" && "text-warn",
                        state === "cleared" && "text-ok",
                        state === "monitoring" && "text-ops-400",
                      )}
                    >
                      {state === "approaching" && "Ambulance approaching"}
                      {state === "notified" && "Traffic team notified"}
                      {state === "cleared" && "Recently cleared"}
                      {state === "monitoring" && "Monitoring"}
                      {activeCount > 0 && ` (${activeCount})`}
                    </span>
                  </span>
                  <span
                    className="font-mono text-[10px] text-ops-500"
                    aria-hidden="true"
                  >
                    {state === "approaching"
                      ? "●"
                      : state === "notified"
                        ? "●"
                        : state === "cleared"
                          ? "●"
                          : "○"}
                  </span>
                </li>
              ))}
              {junctionStates.length === 0 && (
                <li className="px-4 py-6 text-sm text-ops-400">
                  No junctions configured.
                </li>
              )}
            </ul>
          </section>
        </div>

        {/* Center: map */}
        <section
          aria-label="Operations map"
          className="min-h-[50vh] rounded-xl border border-ops-700 bg-ops-900 lg:min-h-0"
        >
          <DynamicMap {...mapProps} />
        </section>

        {/* Right: alerts + incidents */}
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-hidden">
          <section
            aria-label="Alerts"
            className="flex min-h-0 flex-1 flex-col rounded-xl border border-ops-700 bg-ops-900"
          >
            <div
              className="flex shrink-0 gap-1 border-b border-ops-700 p-2"
              role="tablist"
              aria-label="Alert filters"
            >
              {(["PENDING", "ACKNOWLEDGED", "CLEARED", "ALL"] as const).map(
                (f) => (
                  <button
                    key={f}
                    role="tab"
                    aria-selected={alertFilter === f}
                    onClick={() => setAlertFilter(f)}
                    className={cn(
                      "h-8 flex-1 rounded-md text-[11px] font-bold uppercase tracking-wider focus-visible:outline focus-visible:outline-2 focus-visible:outline-warn",
                      alertFilter === f
                        ? "bg-ops-700 text-white"
                        : "text-ops-400 hover:text-ops-300",
                    )}
                  >
                    {f === "PENDING"
                      ? `New (${alerts.filter((a) => a.status === "PENDING").length})`
                      : f === "ACKNOWLEDGED"
                        ? `Ack (${alerts.filter((a) => a.status === "ACKNOWLEDGED").length})`
                        : f === "CLEARED"
                          ? `Cleared (${alerts.filter((a) => a.status === "CLEARED").length})`
                          : "All"}
                  </button>
                ),
              )}
            </div>
            <div
              className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2"
              aria-live="polite"
            >
              {filteredAlerts.length === 0 && (
                <p className="p-4 text-sm text-ops-400">
                  {alertFilter === "PENDING"
                    ? "No new alerts. Junction geofences are being monitored."
                    : "No alerts in this state."}
                </p>
              )}
              {filteredAlerts.map((e) => (
                <AlertCard
                  key={e.alert.id}
                  item={e}
                  busy={ackBusy === e.alert.id}
                  onAcknowledge={acknowledge}
                  onViewRoute={(a) => {
                    setSelectedJourneyId(a.journey_id);
                    const j = journeys.find((x) => x.id === a.journey_id);
                    if (j)
                      setFit({
                        token: Date.now(),
                        bounds: fromGeoJson(j.route_geometry),
                      });
                  }}
                />
              ))}
            </div>
          </section>

          <section
            aria-label="Reported incidents"
            className="max-h-56 shrink-0 overflow-y-auto rounded-xl border border-ops-700 bg-ops-900"
          >
            <h2 className="border-b border-ops-700 px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-[0.14em] text-ops-300">
              Road incidents (
              {incidents.filter((i) => i.status === "ACTIVE").length} active)
            </h2>
            <ul className="divide-y divide-ops-800">
              {incidents.filter((i) => i.status === "ACTIVE").length === 0 && (
                <li className="px-4 py-4 text-sm text-ops-400">
                  No active road incidents reported.
                </li>
              )}
              {incidents
                .filter((i) => i.status === "ACTIVE")
                .map((i) => (
                  <li
                    key={i.id}
                    className="flex items-center justify-between gap-2 px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-warn">
                        <TrafficCone
                          className="h-3.5 w-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        {INCIDENT_LABELS[i.type] ?? "Other"}
                      </p>
                      <p className="truncate text-[11px] text-ops-400">
                        {i.description || "No description"} ·{" "}
                        {timeAgo(i.created_at, now)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => resolveIncident(i)}
                    >
                      <CheckCircle2
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />{" "}
                      Resolve
                    </Button>
                  </li>
                ))}
            </ul>
          </section>
        </div>
      </div>

      <footer className="shrink-0 border-t border-ops-700 bg-ops-900 px-4 py-1.5 text-center text-[10px] uppercase tracking-wider text-ops-500">
        <span className="flex items-center justify-center gap-1.5">
          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
          Decision support only — traffic signals are never controlled by this
          system. Officers remain responsible for traffic management.
        </span>
      </footer>
    </main>
  );
}
