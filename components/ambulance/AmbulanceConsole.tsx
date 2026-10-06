"use client";
// Driver console — mobile-first, minimal interaction while driving.
// SELECT → PREVIEW → ACTIVE. Real GPS via LocationTracker (throttled writes),
// real routing via /api/routing, real alerts loop back from the police through
// Supabase Realtime (journey-scoped channel).
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Cross,
  Gauge,
  LogOut,
  Navigation,
  Radio,
  Route as RouteIcon,
  Search,
  Siren,
  Satellite,
  TrafficCone,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { DynamicMap, type MapViewProps } from "@/components/maps/DynamicMap";
import { createClient } from "@/lib/supabase/client";
import {
  LocationTracker,
  type TrackerState,
} from "@/lib/location/locationTracker";
import { createBrowserLocationProvider } from "@/lib/location/browserLocationProvider";
import type { LocationFix } from "@/lib/location/locationProvider";
import { haversineMeters } from "@/lib/geofencing/haversine";
import { estimateEtaSeconds } from "@/lib/geofencing/alertRules";
import {
  fromGeoJson,
  junctionsWithRouteDistance,
  routeEta,
  toGeoJson,
  type RoutePoint,
} from "@/lib/routing/routeGeometry";
import type { DrivingRoute } from "@/lib/routing/routingProvider";
import { useNow } from "@/lib/hooks";
import { cn, fmtDistance, fmtDuration, fmtSpeed, timeAgo } from "@/lib/utils";
import type {
  AlertsRow,
  AmbulancesRow,
  HospitalsRow,
  IncidentType,
  JunctionsRow,
} from "@/types/database";

type Phase = "SELECT" | "PREVIEW" | "ACTIVE";
const INCIDENT_TYPES: Array<{ value: IncidentType; label: string }> = [
  { value: "ACCIDENT", label: "Accident" },
  { value: "ROAD_BLOCKED", label: "Road blocked" },
  { value: "HEAVY_TRAFFIC", label: "Heavy traffic" },
  { value: "CONSTRUCTION", label: "Construction" },
  { value: "OTHER", label: "Other" },
];

interface Props {
  driverId: string;
  ambulances: AmbulancesRow[];
  hospitals: HospitalsRow[];
  junctions: JunctionsRow[];
}

export function AmbulanceConsole({
  driverId,
  ambulances,
  hospitals,
  junctions,
}: Props) {
  const supabase = React.useMemo(() => createClient(), []);
  const toast = useToast();
  const router = useRouter();
  const now = useNow(1000);

  const [phase, setPhase] = React.useState<Phase>("SELECT");
  const [vehicleId, setVehicleId] = React.useState(ambulances[0]?.id ?? null);
  const [hospitalId, setHospitalId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [route, setRoute] = React.useState<DrivingRoute | null>(null);
  const [routing, setRouting] = React.useState(false);
  const [journeyId, setJourneyId] = React.useState<string | null>(null);
  const [fix, setFix] = React.useState<LocationFix | null>(null);
  const [trk, setTrk] = React.useState<TrackerState | null>(null);
  const [etaS, setEtaS] = React.useState<number | null>(null);
  const [remainingM, setRemainingM] = React.useState<number | null>(null);
  const [fromRouteM, setFromRouteM] = React.useState(0);
  const [alerts, setAlerts] = React.useState<AlertsRow[]>([]);
  const [netStatus, setNetStatus] = React.useState<string>("connecting");
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [fitToken, setFitToken] = React.useState(0);

  const routeRef = React.useRef<RoutePoint[]>([]);
  const journeyIdRef = React.useRef<string | null>(null);
  const acceptedRef = React.useRef<
    (f: LocationFix, meta: { computedHeading: number | null }) => void
  >(() => {});

  const vehicle = ambulances.find((a) => a.id === vehicleId) ?? null;
  const hospital = hospitals.find((h) => h.id === hospitalId) ?? null;

  /* ── GPS tracking (real Geolocation API, throttled) ─────────────────── */
  React.useEffect(() => {
    const provider = createBrowserLocationProvider();
    const tracker = new LocationTracker(
      provider,
      {
        minIntervalMs: Number(
          process.env.NEXT_PUBLIC_GPS_MIN_INTERVAL_MS ?? 5000,
        ),
        minDistanceM: Number(process.env.NEXT_PUBLIC_GPS_MIN_DISTANCE_M ?? 15),
      },
      (f, meta) => acceptedRef.current(f, meta),
    );
    const unsub = tracker.subscribe(setTrk);
    tracker.start();
    return () => {
      unsub();
      tracker.stop();
    };
  }, []);

  const onAccepted = React.useCallback(
    (f: LocationFix, meta: { computedHeading: number | null }) => {
      const headed = { ...f, heading: f.heading ?? meta.computedHeading };
      setFix(headed);
      const pts = routeRef.current;
      const jid = journeyIdRef.current;
      if (!jid || pts.length < 2) return;

      const est = routeEta(
        pts,
        [headed.latitude, headed.longitude],
        route?.durationS ?? null,
      );
      setRemainingM(est.remainingM);
      setEtaS(est.etaS);
      setFromRouteM(est.fromRouteM);

      void supabase
        .from("location_updates")
        .insert({
          journey_id: jid,
          latitude: headed.latitude,
          longitude: headed.longitude,
          speed: headed.speed,
          heading: headed.heading,
          accuracy: headed.accuracy,
        })
        .then(({ error }) => {
          if (error)
            toast.error("Failed to send location update: " + error.message);
        });
    },
    [supabase, toast, route?.durationS],
  );
  React.useEffect(() => {
    acceptedRef.current = onAccepted;
  }, [onAccepted]);

  /* ── Resume an ACTIVE journey after a page refresh ──────────────────── */
  React.useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("journeys")
        .select("*")
        .eq("status", "ACTIVE")
        .order("created_at", { ascending: false })
        .limit(5);
      const rows = (data ?? []) as Array<{
        id: string;
        ambulance_id: string;
        destination_hospital_id: string;
        route_geometry: unknown;
        distance: number | null;
        estimated_duration: number | null;
      }>;
      const mine = rows.find((j) =>
        ambulances.some((a) => a.id === j.ambulance_id),
      );
      if (!mine) return;
      const pts = fromGeoJson(mine.route_geometry);
      routeRef.current = pts;
      journeyIdRef.current = mine.id;
      setJourneyId(mine.id);
      setVehicleId(mine.ambulance_id);
      setHospitalId(mine.destination_hospital_id);
      setRoute({
        geometry: pts,
        distanceM: mine.distance ?? 0,
        durationS: mine.estimated_duration ?? 0,
        provider: "restored",
      });
      setPhase("ACTIVE");
      subscribeJourney(mine.id);
      toast.info("Active emergency journey resumed.");
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function subscribeJourney(id: string) {
    const channel = supabase
      .channel(`journey-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "alerts",
          filter: `journey_id=eq.${id}`,
        },
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
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "road_incidents",
          filter: `journey_id=eq.${id}`,
        },
        () => toast.success("Roadblock report delivered to police."),
      )
      .subscribe((status) => setNetStatus(status));
    return () => {
      void supabase.removeChannel(channel);
    };
  }

  /* ── Actions ────────────────────────────────────────────────────────── */
  async function fetchRoute(): Promise<DrivingRoute | null> {
    if (!fix) {
      toast.error("Waiting for a GPS fix before calculating a route.");
      return null;
    }
    if (!hospital) {
      toast.error("Select a destination hospital first.");
      return null;
    }
    setRouting(true);
    try {
      const res = await fetch("/api/routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { latitude: fix.latitude, longitude: fix.longitude },
          destination: {
            latitude: hospital.latitude,
            longitude: hospital.longitude,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Routing failed.");
        return null;
      }
      return data as DrivingRoute;
    } catch {
      toast.error("Routing service unreachable — check your connection.");
      return null;
    } finally {
      setRouting(false);
    }
  }

  async function getRoute() {
    const r = await fetchRoute();
    if (!r) return;
    routeRef.current = r.geometry;
    setRoute(r);
    setFitToken((t) => t + 1);
    setPhase("PREVIEW");
  }

  async function startJourney() {
    if (!route || !vehicleId || !hospitalId) return;
    const { data, error } = await supabase
      .from("journeys")
      .insert({
        ambulance_id: vehicleId,
        destination_hospital_id: hospitalId,
        status: "ACTIVE",
        route_geometry: toGeoJson(route.geometry),
        distance: route.distanceM,
        estimated_duration: route.durationS,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) {
      toast.error("Could not start journey: " + error.message);
      return;
    }
    journeyIdRef.current = (data as { id: string }).id;
    setJourneyId((data as { id: string }).id);
    setAlerts([]);
    setPhase("ACTIVE");
    subscribeJourney((data as { id: string }).id);
  }

  async function endJourney() {
    const id = journeyIdRef.current;
    if (!id) return;
    const { error } = await supabase
      .from("journeys")
      .update({ status: "COMPLETED", completed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("Could not end journey: " + error.message);
      return;
    }
    // DB trigger resets ambulance status + clears pending alerts.
    journeyIdRef.current = null;
    routeRef.current = [];
    setJourneyId(null);
    setRoute(null);
    setPhase("SELECT");
    setEtaS(null);
    setRemainingM(null);
    setAlerts([]);
    setHospitalId(null);
    setSearch("");
  }

  async function recalculate() {
    const r = await fetchRoute();
    const id = journeyIdRef.current;
    if (!r || !id) return;
    routeRef.current = r.geometry;
    setRoute(r);
    setFitToken((t) => t + 1);
    await supabase
      .from("journeys")
      .update({
        route_geometry: toGeoJson(r.geometry),
        distance: r.distanceM,
        estimated_duration: r.durationS,
      })
      .eq("id", id);
    toast.success("Route recalculated.");
  }

  async function reportIncident(type: IncidentType, description: string) {
    if (!fix) {
      toast.error("No GPS fix — cannot report location.");
      return;
    }
    const { error } = await supabase.from("road_incidents").insert({
      journey_id: journeyIdRef.current,
      reported_by: driverId,
      type,
      description,
      latitude: fix.latitude,
      longitude: fix.longitude,
    });
    if (error) {
      toast.error("Report failed: " + error.message);
      return;
    }
    toast.success("Roadblock reported to traffic police.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  /* ── Derived ────────────────────────────────────────────────────────── */
  const hospitalOptions = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return hospitals
      .filter(
        (h) =>
          !q ||
          h.name.toLowerCase().includes(q) ||
          h.address.toLowerCase().includes(q),
      )
      .map((h) => ({
        hospital: h,
        distanceM: fix ? haversineMeters(fix, h) : null,
      }))
      .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity));
  }, [hospitals, search, fix]);

  const corridor = React.useMemo(
    () =>
      route ? junctionsWithRouteDistance(route.geometry, junctions, 400) : [],
    [route, junctions],
  );

  const nextJunction = React.useMemo(() => {
    if (!route || !fix || corridor.length === 0) return null;
    const prog = routeEta(route.geometry, [fix.latitude, fix.longitude], null);
    if (prog.remainingM == null) return null;
    const along = route.geometry.length
      ? routeProgressAlong(route.geometry, [fix.latitude, fix.longitude])
      : 0;
    const upcoming = corridor.find((c) => c.alongM > along + 30);
    if (!upcoming) return null;
    const j = junctions.find((x) => x.id === upcoming.junction.id);
    if (!j) return null;
    const dist = haversineMeters(fix, j);
    const alert =
      alerts.find((a) => a.junction_id === j.id && a.status !== "CLEARED") ??
      null;
    return {
      junction: j,
      distanceM: dist,
      eta: estimateEtaSeconds(dist, fix.speed),
      alert,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, fix, corridor, junctions, alerts]);

  const gpsOk = trk?.status === "tracking" || trk?.status === "waiting";
  const netOk = netStatus === "SUBSCRIBED";
  const offRoute = phase === "ACTIVE" && fromRouteM > 60;

  const mapProps: MapViewProps = {
    className: "h-full w-full",
    ambulances: fix
      ? [
          {
            id: "self",
            position: [fix.latitude, fix.longitude],
            heading: fix.heading,
            label: vehicle?.vehicle_number ?? "This ambulance",
            active: phase === "ACTIVE",
            speedKmh: fix.speed != null ? Math.round(fix.speed * 3.6) : null,
            destination: hospital?.name,
          },
        ]
      : [],
    junctions: junctions.map((j) => ({
      id: j.id,
      position: [j.latitude, j.longitude],
      radiusM: j.geofence_radius,
      label: j.name,
      state: nextJunction?.junction.id === j.id ? "approaching" : "monitoring",
    })),
    hospitals: hospital
      ? [
          {
            id: hospital.id,
            position: [hospital.latitude, hospital.longitude],
            label: hospital.name,
          },
        ]
      : [],
    routes: route ? [{ id: "self", points: route.geometry }] : [],
    followId: phase === "ACTIVE" && fix ? "self" : null,
    fit: fitToken ? { token: fitToken, bounds: route?.geometry ?? [] } : null,
  };

  /* ── Empty states ───────────────────────────────────────────────────── */
  if (ambulances.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-warn/40 bg-ops-900 p-6">
          <h1 className="font-display text-xl font-semibold uppercase tracking-wide text-warn">
            No ambulance assigned
          </h1>
          <p className="mt-2 text-sm text-ops-300">
            Your account is not linked to a vehicle yet. An administrator must
            assign an ambulance to you from the admin dashboard before you can
            start a journey.
          </p>
        </div>
      </main>
    );
  }

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col">
      {/* Status strip */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-ops-700 bg-ops-900/95 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2">
          <Siren
            className={cn(
              "h-5 w-5",
              phase === "ACTIVE" ? "text-emergency-bright" : "text-ops-400",
            )}
            aria-hidden="true"
          />
          <span className="font-display text-lg font-bold uppercase tracking-wide">
            {vehicle?.vehicle_number}
          </span>
          {phase === "ACTIVE" ? (
            <Badge variant="emergency">Emergency active</Badge>
          ) : (
            <Badge variant="neutral">Standby</Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider">
          <span
            className={cn(
              "flex items-center gap-1",
              gpsOk ? "text-ok" : "text-warn",
            )}
            title={trk?.lastError?.message}
          >
            <Satellite className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">GPS </span>
            {trk?.status === "tracking"
              ? "GPS"
              : trk?.status === "waiting"
                ? "GPS…"
                : "GPS!"}
          </span>
          <span
            className={cn(
              "flex items-center gap-1",
              phase !== "ACTIVE" || netOk ? "text-ok" : "text-warn",
            )}
          >
            <Radio className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Network </span>NET
          </span>
          <button
            onClick={signOut}
            aria-label="Sign out"
            className="text-ops-400 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* GPS problem banner — never pretend a location exists */}
      {trk?.status === "error" && (
        <div
          role="alert"
          className="m-3 flex items-start gap-2 rounded-lg border border-emergency/50 bg-emergency/10 p-3 text-sm text-emergency-bright"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span>
            {trk.lastError?.message ??
              "Location temporarily unavailable. Please check GPS permission."}
          </span>
        </div>
      )}

      <div className="flex-1 space-y-4 p-4 pb-36">
        {/* Telemetry line */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-ops-400">
          {fix ? (
            <>
              <span>±{Math.round(fix.accuracy)} m</span>
              <span className="tabular">
                {fix.latitude.toFixed(5)}, {fix.longitude.toFixed(5)}
              </span>
              <span>{fmtSpeed(fix.speed)}</span>
              <span>update {timeAgo(trk?.lastAcceptedAt ?? null, now)}</span>
            </>
          ) : (
            <span>
              {trk?.status === "waiting"
                ? "Acquiring GPS signal…"
                : "No GPS fix yet."}
            </span>
          )}
        </div>

        {phase === "SELECT" && (
          <>
            {ambulances.length > 1 && (
              <div>
                <Label htmlFor="vehicle">Vehicle</Label>
                <select
                  id="vehicle"
                  value={vehicleId ?? ""}
                  onChange={(e) => setVehicleId(e.target.value)}
                  className="h-12 w-full rounded-lg border border-ops-600 bg-ops-850 px-3 text-base text-slate-100"
                >
                  {ambulances.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.vehicle_number}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <Label htmlFor="hospital-search">Destination hospital</Label>
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ops-400"
                  aria-hidden="true"
                />
                <Input
                  id="hospital-search"
                  className="h-12 pl-9 text-base"
                  placeholder="Search hospitals…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            {hospitals.length === 0 ? (
              <p className="rounded-lg border border-ops-700 bg-ops-900 p-4 text-sm text-ops-300">
                No hospitals configured yet. An administrator must add hospitals
                before journeys can be planned.
              </p>
            ) : (
              <ul
                className="max-h-[42vh] space-y-2 overflow-y-auto"
                role="listbox"
                aria-label="Hospitals"
              >
                {hospitalOptions.map(({ hospital: h, distanceM }) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={hospitalId === h.id}
                      onClick={() => setHospitalId(h.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-warn",
                        hospitalId === h.id
                          ? "border-warn bg-warn/10"
                          : "border-ops-700 bg-ops-900 hover:border-ops-600",
                      )}
                    >
                      <Cross
                        className="h-5 w-5 shrink-0 text-ok"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-lg font-semibold uppercase leading-tight">
                          {h.name}
                        </span>
                        <span className="block truncate text-xs text-ops-400">
                          {h.address}
                        </span>
                      </span>
                      {distanceM != null && (
                        <span className="font-mono text-xs text-ops-300">
                          {fmtDistance(distanceM)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
                {hospitalOptions.length === 0 && (
                  <li className="rounded-lg border border-ops-700 p-4 text-sm text-ops-400">
                    No hospitals match your search.
                  </li>
                )}
              </ul>
            )}
          </>
        )}

        {phase === "PREVIEW" && route && hospital && (
          <>
            <div className="rounded-xl border border-ops-700 bg-ops-900 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-ops-400">
                Route to {hospital.name}
              </p>
              <div className="mt-2 flex items-end gap-6">
                <div>
                  <p className="font-display text-5xl font-bold leading-none tabular">
                    {fmtDuration(route.durationS)}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-wider text-ops-400">
                    Estimated time
                  </p>
                </div>
                <div>
                  <p className="font-display text-5xl font-bold leading-none tabular">
                    {fmtDistance(route.distanceM)}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-wider text-ops-400">
                    Distance
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-ops-400">
                Estimate from{" "}
                {route.provider === "osrm-demo"
                  ? "OSRM demo server (testing only)"
                  : route.provider}{" "}
                routing — no live traffic data.
                {route.warning ? ` ${route.warning}` : ""}
              </p>
            </div>
            <div className="h-[38vh] min-h-64">
              <DynamicMap {...mapProps} />
            </div>
          </>
        )}

        {phase === "ACTIVE" && (
          <>
            <div className="rounded-xl border border-emergency/40 bg-ops-900 p-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ops-400">
                ETA to {hospital?.name ?? "hospital"}
              </p>
              <p className="font-display text-7xl font-bold leading-none tabular text-white">
                {fmtDuration(etaS ?? route?.durationS ?? null)}
              </p>
              <div className="mt-2 flex items-center justify-center gap-6 text-sm text-ops-300">
                <span className="flex items-center gap-1.5">
                  <RouteIcon className="h-4 w-4" aria-hidden="true" />
                  {fmtDistance(remainingM)} left
                </span>
                <span className="flex items-center gap-1.5">
                  <Gauge className="h-4 w-4" aria-hidden="true" />
                  {fmtSpeed(fix?.speed ?? null)}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-ops-400">
                Routing estimate — no live traffic data.
              </p>
            </div>

            {/* Next junction + police coordination loop */}
            <div className="rounded-xl border border-ops-700 bg-ops-900 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ops-400">
                Next junction
              </p>
              {nextJunction ? (
                <>
                  <p className="font-display text-3xl font-semibold uppercase leading-tight">
                    {nextJunction.junction.name}
                  </p>
                  <p className="mt-1 font-mono text-sm text-ops-300 tabular">
                    {fmtDistance(nextJunction.distanceM)} · ETA{" "}
                    {fmtDuration(nextJunction.eta)}
                  </p>
                  <p className="mt-2 flex items-center gap-1.5 text-sm">
                    {nextJunction.alert?.status === "ACKNOWLEDGED" ? (
                      <span className="flex items-center gap-1.5 text-ok">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />{" "}
                        Traffic team notified
                      </span>
                    ) : nextJunction.alert ? (
                      <span className="flex items-center gap-1.5 text-warn">
                        <Siren className="h-4 w-4" aria-hidden="true" /> Alert
                        sent — awaiting police acknowledgment
                      </span>
                    ) : (
                      <span className="text-ops-400">
                        No alert yet — geofence triggers automatically on
                        approach.
                      </span>
                    )}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-ops-400">
                  No monitored junction ahead on this route.
                </p>
              )}
            </div>

            {offRoute && (
              <div
                role="alert"
                className="flex items-center justify-between gap-3 rounded-xl border border-warn/50 bg-warn/10 p-4"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-warn">
                  <Navigation className="h-4 w-4" aria-hidden="true" /> Off the
                  planned route
                </span>
                <Button size="sm" variant="warn" onClick={recalculate}>
                  Recalculate
                </Button>
              </div>
            )}

            <div className="h-[34vh] min-h-56">
              <DynamicMap {...mapProps} />
            </div>
          </>
        )}
      </div>

      {/* Bottom action bar — large, driving-safe controls */}
      <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-lg -translate-x-1/2 space-y-2 border-t border-ops-700 bg-ops-900/95 p-3 backdrop-blur">
        {phase === "SELECT" && (
          <Button
            size="xl"
            className="w-full"
            disabled={!fix || !hospitalId || routing}
            onClick={getRoute}
          >
            {routing ? "Calculating route…" : "Get route"}
          </Button>
        )}
        {phase === "PREVIEW" && (
          <>
            <Button
              size="xl"
              variant="emergency"
              className="w-full"
              onClick={startJourney}
            >
              <Siren className="h-6 w-6" aria-hidden="true" /> Start emergency
              journey
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setPhase("SELECT");
                setRoute(null);
                routeRef.current = [];
              }}
            >
              Change destination
            </Button>
          </>
        )}
        {phase === "ACTIVE" && (
          <div className="grid grid-cols-2 gap-2">
            <Button size="xl" variant="warn" onClick={() => setSheetOpen(true)}>
              <TrafficCone className="h-5 w-5" aria-hidden="true" /> Report
              roadblock
            </Button>
            <Button size="xl" variant="emergency" onClick={endJourney}>
              End journey
            </Button>
          </div>
        )}
      </div>

      {sheetOpen && (
        <RoadblockSheet
          hasFix={!!fix}
          onClose={() => setSheetOpen(false)}
          onSubmit={async (type, description) => {
            await reportIncident(type, description);
            setSheetOpen(false);
          }}
        />
      )}
    </main>
  );
}

function routeProgressAlong(route: RoutePoint[], point: RoutePoint): number {
  const prog = routeEta(route, point, 0);
  void prog;
  // Use raw progress (routeEta needs duration); compute directly:
  const p = routeProgress(route, point);
  return p.alongM;
}
// Minimal re-export to keep the import list honest (routeProgress used above).
import { routeProgress } from "@/lib/routing/routeGeometry";

function RoadblockSheet({
  hasFix,
  onClose,
  onSubmit,
}: {
  hasFix: boolean;
  onClose: () => void;
  onSubmit: (type: IncidentType, description: string) => Promise<void>;
}) {
  const [type, setType] = React.useState<IncidentType>("ROAD_BLOCKED");
  const [description, setDescription] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Report roadblock"
    >
      <div className="mx-auto w-full max-w-lg rounded-t-2xl border-t border-ops-600 bg-ops-900 p-5 pb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold uppercase">
            Report roadblock
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-ops-400 hover:bg-ops-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {INCIDENT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              aria-pressed={type === t.value}
              className={cn(
                "h-14 rounded-xl border text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-warn",
                type === t.value
                  ? "border-warn bg-warn/15 text-warn"
                  : "border-ops-700 bg-ops-850 text-ops-300",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Label htmlFor="incident-desc">Description (optional)</Label>
        <Textarea
          id="incident-desc"
          value={description}
          maxLength={400}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Lane closed near the flyover"
        />
        <p className="mt-2 text-xs text-ops-400">
          {hasFix
            ? "Your current GPS position will be attached."
            : "No GPS fix — reporting is disabled until location is available."}
        </p>
        <Button
          size="xl"
          variant="warn"
          className="mt-4 w-full"
          disabled={!hasFix || busy}
          onClick={async () => {
            setBusy(true);
            await onSubmit(type, description.trim());
            setBusy(false);
          }}
        >
          {busy ? "Sending…" : "Send report to police"}
        </Button>
      </div>
    </div>
  );
}
