"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ambulance,
  CheckCircle2,
  ChevronLeft,
  Hospital,
  LocateFixed,
  LogOut,
  Pause,
  Play,
  Route as RouteIcon,
  ShieldCheck,
  Siren,
  TriangleAlert,
} from "lucide-react";
import MapPanel from "@/components/maps/MapPanel";
import { RoadblockSheet } from "./RoadblockSheet";
import { HospitalPicker } from "./HospitalPicker";
import { Button } from "@/components/ui/button";
import { Chip, StatusDot } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Toast } from "@/components/ui/toast";
import { Splash } from "@/components/Splash";
import { store, useAppState, useHydrated } from "@/lib/store";
import {
  getActiveJourneyFor,
  getJourneyStats,
  getUpcomingJunctions,
  getAlertForJourneyJunction,
} from "@/lib/selectors";
import { fmtDistance, fmtEta } from "@/lib/format";
import { cn } from "@/lib/utils";

const SPEEDS = [2, 6, 12];

export default function AmbulanceConsole() {
  const state = useAppState();
  const hydrated = useHydrated();
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [roadblockOpen, setRoadblockOpen] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const [gpsOn, setGpsOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [recenter, setRecenter] = useState(0);

  const session = state.session;
  const amb = state.ambulances.find((a) => a.id === session?.ambulanceId);

  useEffect(() => {
    if (hydrated && (!session || session.role !== "ambulance_driver" || !amb))
      router.replace("/");
  }, [hydrated, session, amb, router]);

  // keep the simulation alive / take it over if the driving tab was refreshed
  useEffect(() => {
    store.init();
    const t = setInterval(() => store.heartbeat(), 5000);
    return () => clearInterval(t);
  }, []);

  // switch to live OpenStreetMap data on load
  useEffect(() => {
    if (!hydrated || !session?.ambulanceId) return;
    const a = store
      .getState()
      .ambulances.find((x) => x.id === session.ambulanceId);
    if (a) void store.loadHospitals([a.lat, a.lng]);
  }, [hydrated, session?.ambulanceId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function handleNearMe() {
    if (!amb) return;
    if (!navigator.geolocation) {
      setToast("Geolocation is not supported here");
      return;
    }
    setToast("Locating you…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        store.relocateAmbulance(
          amb.id,
          pos.coords.latitude,
          pos.coords.longitude,
        );
        void store.loadHospitals([pos.coords.latitude, pos.coords.longitude], {
          force: true,
        });
        setToast("Found you — searching nearby hospitals");
      },
      () => setToast("Location permission denied"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const journey = amb ? getActiveJourneyFor(state, amb.id) : undefined;
  const completedJourney = useMemo(
    () =>
      state.journeys.find(
        (j) => j.id === amb?.lastCompletedJourneyId && j.status === "completed",
      ),
    [state.journeys, amb?.lastCompletedJourneyId],
  );
  const selectedHospital = state.hospitals.find(
    (h) => h.id === amb?.selectedHospitalId,
  );
  const preview = amb?.previewRoute ?? null;
  const stats = journey ? getJourneyStats(journey) : null;
  const upcoming = journey ? getUpcomingJunctions(state, journey, 2) : [];
  const next = upcoming[0] ?? null;
  const nextAlert =
    journey && next
      ? getAlertForJourneyJunction(state, journey.id, next.junction.id)
      : undefined;

  if (!hydrated || !amb || !session)
    return <Splash label="RapidRoute — Driver" />;

  const picking = !journey && !completedJourney && !selectedHospital;

  const routes = journey
    ? [{ key: journey.id, coords: journey.route, kind: "active" as const }]
    : preview
      ? [
          {
            key: `preview-${amb.selectedHospitalId}`,
            coords: preview.coords,
            kind: "preview" as const,
          },
        ]
      : [];

  async function handleStart() {
    setStarting(true);
    try {
      await store.startJourney(amb!.id);
    } finally {
      setStarting(false);
    }
  }

  function toggleGps() {
    if (gpsOn) {
      store.detachGps();
      setGpsOn(false);
      setToast("Device GPS disabled — demo drive available");
    } else {
      store.attachGps(amb!.id, (msg) => {
        setToast(msg);
        setGpsOn(false);
      });
      setGpsOn(true);
      setToast("Requesting GPS permission…");
      if (state.sim.active) store.stopSim();
    }
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      {/* ---------- header ---------- */}
      <header
        className={cn(
          "flex h-14 shrink-0 items-center gap-2.5 border-b px-4",
          journey
            ? "border-emergency/40 bg-emergency/15"
            : "border-line bg-panel",
        )}
      >
        <Ambulance size={22} />
        <span className="text-lg font-extrabold tracking-wider">
          RAPIDROUTE
        </span>
        <span className="ml-auto" />
        {journey ? (
          <Chip tone="red">
            <StatusDot tone="red" pulse /> EMERGENCY ACTIVE
          </Chip>
        ) : (
          <Chip tone="green">
            <StatusDot tone="green" /> SYSTEM ONLINE
          </Chip>
        )}
        <Chip tone="neutral" className="font-mono">
          {amb.number}
        </Chip>
        <button
          onClick={toggleGps}
          aria-label="Toggle device GPS"
          className={cn(
            "rounded-lg p-2 transition-colors",
            gpsOn
              ? "bg-route/15 text-route"
              : "text-muted hover:bg-panel-2 hover:text-slate-100",
          )}
        >
          <LocateFixed size={18} />
        </button>
        <button
          onClick={() => {
            store.signOut();
            router.replace("/");
          }}
          aria-label="Sign out"
          className="rounded-lg p-2 text-muted hover:bg-panel-2 hover:text-slate-100"
        >
          <LogOut size={18} />
        </button>
      </header>

      {/* ---------- map ---------- */}
      <div
        className={cn(
          "relative min-h-0 flex-1",
          picking ? "min-h-[28dvh]" : "min-h-[35dvh]",
        )}
      >
        <MapPanel
          center={[amb.lat, amb.lng]}
          zoom={14}
          ambulances={[amb]}
          junctions={state.junctions}
          hospitals={state.hospitals}
          routes={routes}
          roadblocks={state.roadblocks.filter((r) => r.ambulanceId === amb.id)}
          follow={journey ? [amb.lat, amb.lng] : null}
          fitKey={
            journey?.id ?? (preview ? `p-${amb.selectedHospitalId}` : "none")
          }
          fitCoords={journey?.route ?? preview?.coords ?? null}
          selected={{
            hospitalId:
              journey?.hospitalId ?? amb.selectedHospitalId ?? undefined,
          }}
          alertedJunctionIds={state.alerts
            .filter(
              (a) => a.journeyId === journey?.id && a.status !== "cleared",
            )
            .map((a) => a.junctionId)}
          recenterSignal={recenter}
        />
        <div className="absolute left-3 top-3 z-[500] flex flex-col gap-2">
          {(state.sim.active || gpsOn) && (
            <Chip tone={gpsOn ? "blue" : "amber"} className="shadow-lg">
              {gpsOn ? "LIVE GPS" : "DEMO MODE — SIMULATED MOVEMENT"}
            </Chip>
          )}
          {routes.length > 0 && (
            <Chip tone="neutral" className="shadow-lg">
              {routes[0].kind === "preview" ? "ROUTE PREVIEW" : "ACTIVE ROUTE"}{" "}
              ·{" "}
              {(journey?.routeSource ?? preview?.source) === "ors"
                ? "ORS LIVE"
                : "DEMO FALLBACK"}
            </Chip>
          )}
        </div>
        <button
          onClick={() => setRecenter((n) => n + 1)}
          aria-label="Recenter on ambulance"
          className="absolute bottom-[70px] right-3 z-[500] rounded-xl border border-line bg-ink/90 p-2.5 text-slate-100 shadow-lg backdrop-blur"
        >
          <LocateFixed size={18} />
        </button>
      </div>

      {/* ---------- bottom sheet ---------- */}
      <div
        className={cn(
          "shrink-0 overflow-y-auto border-t border-line bg-panel pb-safe",
          picking ? "h-[64dvh]" : "max-h-[60dvh]",
        )}
      >
        {journey && stats ? (
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-success">
                  <Hospital size={20} />
                </span>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                    Destination
                  </div>
                  <div className="text-lg font-bold leading-tight">
                    {journey.hospitalName}
                  </div>
                </div>
              </div>
              <Chip tone={journey.routeSource === "ors" ? "blue" : "neutral"}>
                <RouteIcon size={12} />{" "}
                {journey.routeSource === "ors" ? "ORS" : "DEMO"} ROUTE
              </Chip>
            </div>

            <div className="mt-4 flex items-end gap-6">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                  ETA
                </div>
                <div className="font-mono text-5xl font-semibold leading-none">
                  {fmtEta(stats.etaSec)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                  Distance
                </div>
                <div className="font-mono text-2xl font-medium leading-none text-slate-200">
                  {fmtDistance(stats.remainingM)}
                </div>
              </div>
              {journey.routeLengthM > 0 && (
                <div className="mb-1.5 ml-auto w-24">
                  <div className="h-1.5 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-route"
                      style={{
                        width: `${Math.min(100, (journey.traveledM / journey.routeLengthM) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 rounded-xl border-l-4 border-amber bg-amber/10 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber">
                    Next junction
                  </div>
                  <div className="text-lg font-bold leading-tight">
                    {next ? next.junction.name : "Approaching destination"}
                  </div>
                </div>
                {next && (
                  <div className="text-right">
                    <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber">
                      Junction ETA
                    </div>
                    <div className="font-mono text-xl font-semibold text-amber">
                      {fmtEta(next.etaSec)}
                    </div>
                  </div>
                )}
              </div>
              {upcoming[1] && (
                <div className="mt-2 text-xs text-muted">
                  Then: {upcoming[1].junction.name.replace(" Junction", " Jn")}{" "}
                  · {fmtEta(upcoming[1].etaSec)}
                </div>
              )}
              {nextAlert && (
                <div className="mt-2">
                  {nextAlert.status === "pending" && (
                    <Chip tone="amber">
                      <Siren size={12} /> ALERT SENT TO POLICE
                    </Chip>
                  )}
                  {nextAlert.status === "acknowledged" && (
                    <Chip tone="green">
                      <ShieldCheck size={12} /> POLICE ACKNOWLEDGED
                    </Chip>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button
                variant="amber"
                size="lg"
                onClick={() => setRoadblockOpen(true)}
              >
                <TriangleAlert size={18} /> REPORT ROADBLOCK
              </Button>
              <Button
                variant="dangerOutline"
                size="lg"
                onClick={() => setEndConfirm(true)}
              >
                END JOURNEY
              </Button>
            </div>

            <div className="mt-4 flex items-center gap-2">
              {!gpsOn && (
                <>
                  <Button
                    variant={state.sim.active ? "outline" : "primary"}
                    size="md"
                    className="flex-1"
                    onClick={() =>
                      state.sim.active ? store.stopSim() : store.startSim()
                    }
                  >
                    {state.sim.active ? (
                      <Pause size={16} />
                    ) : (
                      <Play size={16} />
                    )}
                    {state.sim.active ? "PAUSE DEMO DRIVE" : "START DEMO DRIVE"}
                  </Button>
                  <div className="flex overflow-hidden rounded-xl border border-line">
                    {SPEEDS.map((s) => (
                      <button
                        key={s}
                        onClick={() => store.setSimSpeed(s)}
                        className={cn(
                          "h-11 w-11 font-mono text-sm font-semibold transition-colors",
                          state.sim.speed === s
                            ? "bg-white text-ink"
                            : "bg-panel text-muted hover:bg-panel-2",
                        )}
                      >
                        {s}×
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              {gpsOn
                ? "Using device GPS — real position, simulated for demo when off-route."
                : "Simulated movement along the route — not real GPS. ETA figures are real-world estimates."}
            </p>
          </div>
        ) : completedJourney ? (
          <div className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success/15 text-success">
                <CheckCircle2 size={26} />
              </span>
              <div>
                <div className="text-xl font-extrabold text-success">
                  JOURNEY COMPLETED
                </div>
                <div className="text-sm text-muted">
                  {completedJourney.hospitalName} ·{" "}
                  {fmtDistance(completedJourney.routeLengthM)} ·{" "}
                  {completedJourney.durationSec
                    ? fmtEta(completedJourney.durationSec)
                    : "—"}{" "}
                  elapsed
                </div>
              </div>
            </div>
            <Button
              variant="primary"
              size="xl"
              className="mt-5 w-full"
              onClick={() => store.dismissCompletion(amb.id)}
            >
              START NEW JOURNEY
            </Button>
          </div>
        ) : selectedHospital ? (
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-success">
                  <Hospital size={20} />
                </span>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                    Destination selected
                  </div>
                  <div className="text-lg font-bold leading-tight">
                    {selectedHospital.name}
                  </div>
                </div>
              </div>
              <button
                onClick={() => store.clearHospitalSelection(amb.id)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-panel-2 hover:text-slate-100"
              >
                <ChevronLeft size={14} /> Change
              </button>
            </div>

            {preview ? (
              <div className="mt-3 flex items-center gap-4 rounded-xl border border-line bg-ink p-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                    Distance
                  </div>
                  <div className="font-mono text-2xl font-medium">
                    {fmtDistance(preview.distanceM)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                    Drive time
                  </div>
                  <div className="font-mono text-2xl font-medium">
                    {fmtEta(preview.durationSec)}
                  </div>
                </div>
                <Chip
                  tone={preview.source === "ors" ? "blue" : "neutral"}
                  className="ml-auto"
                >
                  {preview.source === "ors" ? "ORS LIVE ROUTE" : "DEMO ROUTE"}
                </Chip>
              </div>
            ) : (
              <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-line bg-ink p-4 text-sm text-muted">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-slate-100" />
                {amb.previewLoading ? "Calculating route…" : "Route ready"}
              </div>
            )}

            <Button
              variant="emergency"
              size="xl"
              className="mt-4 w-full"
              onClick={handleStart}
              disabled={!preview || starting}
            >
              <Siren size={22} />
              {starting ? "STARTING…" : "START EMERGENCY ROUTE"}
            </Button>
          </div>
        ) : (
          <HospitalPicker
            ambulanceLat={amb.lat}
            ambulanceLng={amb.lng}
            hospitals={state.hospitals}
            live={state.live}
            loading={state.hospitalsLoading}
            onSelect={(hospitalId) =>
              void store.previewRoute(amb.id, hospitalId)
            }
            onNearMe={handleNearMe}
            onRetry={() =>
              void store.loadHospitals([amb.lat, amb.lng], { force: true })
            }
          />
        )}
      </div>

      {/* ---------- overlays ---------- */}
      <RoadblockSheet
        open={roadblockOpen}
        onClose={() => setRoadblockOpen(false)}
        onSubmit={(type, note) => {
          store.reportRoadblock(amb.id, type, note);
          setToast("Traffic authorities have been notified.");
        }}
      />

      <Modal
        open={endConfirm}
        onClose={() => setEndConfirm(false)}
        title="End journey?"
        footer={
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setEndConfirm(false)}
            >
              CANCEL
            </Button>
            <Button
              variant="emergency"
              size="lg"
              onClick={() => {
                store.endJourney(amb.id, false);
                setEndConfirm(false);
                setToast("Journey completed");
              }}
            >
              END JOURNEY
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-muted">
          The active emergency route to{" "}
          {journey?.hospitalName ?? "your destination"} will be closed and
          traffic police will see this journey as completed.
        </p>
      </Modal>

      {toast && <Toast message={toast} />}
    </div>
  );
}
