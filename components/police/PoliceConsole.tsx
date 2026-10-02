"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  LogOut,
  Pause,
  Play,
  RefreshCw,
  Shield,
  Radio,
} from "lucide-react";
import MapPanel from "@/components/maps/MapPanel";
import { FleetPanel } from "./FleetPanel";
import { AlertPanel } from "./AlertPanel";
import { JunctionPanel } from "./JunctionPanel";
import { AiPanel } from "./AiPanel";
import { Button } from "@/components/ui/button";
import { Chip, StatusDot } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Toast } from "@/components/ui/toast";
import { Splash } from "@/components/Splash";
import { store, useAppState, useHydrated } from "@/lib/store";
import { getActiveJourneyFor, getAlertLiveEta } from "@/lib/selectors";
import { fmtEta } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Alert } from "@/types";

const SPEEDS = [2, 6, 12];

export default function PoliceConsole() {
  const state = useAppState();
  const hydrated = useHydrated();
  const router = useRouter();
  const [selected, setSelected] = useState<{
    ambulanceId?: string;
    junctionId?: string;
  }>({});
  const [contactAlert, setContactAlert] = useState<Alert | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [clock, setClock] = useState<Date | null>(null);

  const session = state.session;

  useEffect(() => {
    if (hydrated && (!session || session.role !== "traffic_police"))
      router.replace("/");
  }, [hydrated, session, router]);

  useEffect(() => {
    store.init();
    const a0 = store.getState().ambulances[0];
    if (a0) void store.loadHospitals([a0.lat, a0.lng]);
    const tick = setInterval(() => setClock(new Date()), 1000);
    const beat = setInterval(() => store.heartbeat(), 5000);
    return () => {
      clearInterval(tick);
      clearInterval(beat);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!hydrated || !session)
    return <Splash label="RapidRoute — Traffic Control" />;

  const activeAmbulances = state.ambulances.filter(
    (a) => a.status === "enroute",
  );
  const pendingAlerts = state.alerts.filter((a) => a.status === "pending");
  const alertedJunctionIds = state.alerts
    .filter((a) => a.status !== "cleared")
    .map((a) => a.junctionId);

  const selectedJourney = selected.ambulanceId
    ? getActiveJourneyFor(state, selected.ambulanceId)
    : undefined;
  const routes = state.journeys
    .filter((j) => j.status === "active")
    .map((j) => ({
      key: j.id,
      coords: j.route,
      kind: (selected.ambulanceId === j.ambulanceId
        ? "active"
        : "secondary") as "active" | "secondary",
    }));
  const selectedJunction = state.junctions.find(
    (j) => j.id === selected.junctionId,
  );

  function focusAmbulance(id: string) {
    setSelected({ ambulanceId: id });
  }

  const contactJunction = contactAlert
    ? state.junctions.find((j) => j.id === contactAlert.junctionId)
    : undefined;
  const contactLiveEta = contactAlert
    ? (getAlertLiveEta(state, contactAlert) ?? contactAlert.etaSec)
    : 0;
  const dispatchMessage = contactAlert
    ? `RapidRoute dispatch — Ambulance ${contactAlert.ambulanceNumber} (${contactAlert.driverName}) approaching ${contactAlert.junctionName}, ETA ${fmtEta(contactLiveEta)}, destination ${contactAlert.hospitalName}. Request traffic clearing support.`
    : "";

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      {/* ---------- header ---------- */}
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
        <Shield size={22} />
        <div>
          <div className="text-base font-extrabold leading-tight tracking-wider">
            RAPIDROUTE — TRAFFIC CONTROL
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            <StatusDot
              tone={
                state.connection.status === "connected" ||
                state.connection.mode === "local"
                  ? "green"
                  : "amber"
              }
            />
            {state.connection.mode === "supabase"
              ? `SUPABASE REALTIME · ${state.connection.status.toUpperCase()}`
              : "ONLINE · LOCAL SYNC"}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {state.sim.active && (
            <Chip tone="amber">
              DEMO MODE{" "}
              {state.live && <Chip tone="green">LIVE · OSM DATA</Chip>} —
              SIMULATED MOVEMENT
            </Chip>
          )}
          <Button
            variant={state.sim.active ? "outline" : "primary"}
            size="md"
            onClick={() =>
              state.sim.active ? store.stopSim() : store.startSim()
            }
          >
            {state.sim.active ? <Pause size={15} /> : <Play size={15} />}
            {state.sim.active ? "STOP SIMULATION" : "START DEMO SIMULATION"}
          </Button>
          <div className="hidden overflow-hidden rounded-xl border border-line sm:flex">
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
          <Button
            variant="ghost"
            size="md"
            onClick={() => setResetConfirm(true)}
            aria-label="Reset demo"
          >
            <RefreshCw size={16} />
          </Button>
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              store.signOut();
              router.replace("/");
            }}
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </Button>
          <span className="hidden font-mono text-sm text-muted md:inline">
            {clock ? clock.toLocaleTimeString() : "--:--:--"}
          </span>
        </div>
      </header>

      {/* ---------- metrics bar ---------- */}
      <div className="grid shrink-0 grid-cols-2 border-b border-line bg-panel md:grid-cols-4">
        <Metric value={activeAmbulances.length} label="Active ambulances" />
        <Metric
          value={pendingAlerts.length}
          label="Pending alerts"
          accent={pendingAlerts.length > 0 ? "emergency" : undefined}
        />
        <Metric value={state.junctions.length} label="Junctions monitoring" />
        <Metric value={state.completedToday} label="Completed today" />
      </div>

      {/* ---------- body ---------- */}
      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[290px_minmax(0,1fr)_340px]">
        <aside className="order-2 min-h-0 overflow-y-auto border-line p-3 lg:order-1 lg:p-3 lg:pr-0">
          <FleetPanel
            state={state}
            selectedId={selected.ambulanceId}
            onSelect={focusAmbulance}
          />
        </aside>

        <main className="relative order-1 h-[46vh] min-h-0 border-x border-line lg:order-2 lg:h-full">
          <MapPanel
            center={[12.955, 77.598]}
            zoom={12}
            ambulances={state.ambulances}
            junctions={state.junctions}
            hospitals={state.hospitals}
            routes={routes}
            roadblocks={state.roadblocks}
            fitKey={selected.ambulanceId ?? "none"}
            fitCoords={selectedJourney?.route ?? null}
            selected={{
              ambulanceId: selected.ambulanceId,
              junctionId: selected.junctionId,
              hospitalId: selectedJourney?.hospitalId,
            }}
            alertedJunctionIds={alertedJunctionIds}
            onSelectAmbulance={(id) => setSelected({ ambulanceId: id })}
            onSelectJunction={(id) => setSelected({ junctionId: id })}
          />
          {/* map legend */}
          <div className="absolute left-3 top-3 z-[500] rounded-xl border border-line bg-ink/85 px-3 py-2 text-[10px] leading-relaxed text-muted backdrop-blur">
            <LegendRow
              swatch={
                <span
                  className="rr-body"
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    borderWidth: 1,
                    borderColor: "#E5484D",
                  }}
                />
              }
              label="Ambulance (active)"
            />
            <LegendRow
              swatch={
                <span
                  className="rr-sig"
                  style={{ width: 7, height: 13, borderWidth: 1 }}
                >
                  <i />
                  <i />
                  <i />
                </span>
              }
              label="Junction"
            />
            <LegendRow
              swatch={
                <span
                  className="rr-body round"
                  style={{
                    width: 12,
                    height: 12,
                    borderWidth: 1,
                    borderColor: "#2CC471",
                  }}
                />
              }
              label="Hospital"
            />
            <LegendRow
              swatch={<span className="h-0.5 w-4 rounded bg-route" />}
              label="Active route"
            />
          </div>

          {/* selected entity detail */}
          {(selectedJourney || selectedJunction) && (
            <div className="absolute bottom-3 left-3 z-[500] w-[calc(100%-24px)] max-w-sm rounded-xl border border-line bg-ink/92 p-4 text-sm shadow-2xl backdrop-blur">
              <button
                className="absolute right-2.5 top-2.5 rounded-lg px-2 py-1 text-[11px] font-semibold text-muted hover:text-slate-100"
                onClick={() => setSelected({})}
              >
                CLOSE
              </button>
              {selectedJourney &&
                (() => {
                  const amb = state.ambulances.find(
                    (a) => a.id === selectedJourney.ambulanceId,
                  );
                  return (
                    <div>
                      <div className="font-mono text-base font-bold">
                        {selectedJourney.ambulanceNumber}{" "}
                        <span className="text-muted">
                          · {selectedJourney.driverName}
                        </span>
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <dt className="text-muted">Destination</dt>
                        <dd>{selectedJourney.hospitalName}</dd>
                        <dt className="text-muted">Remaining</dt>
                        <dd className="font-mono">
                          {(
                            (selectedJourney.routeLengthM -
                              selectedJourney.traveledM) /
                            1000
                          ).toFixed(1)}{" "}
                          km
                        </dd>
                        <dt className="text-muted">Status</dt>
                        <dd className="text-emergency font-semibold">
                          EMERGENCY ENROUTE
                        </dd>
                        <dt className="text-muted">Route</dt>
                        <dd>
                          {selectedJourney.routeSource === "ors"
                            ? "openrouteservice (live)"
                            : "Demo fallback route"}
                        </dd>
                      </dl>
                      {amb && (
                        <div className="mt-1 text-[11px] text-muted">
                          Driver contact handled via dispatch — {amb.driverName}
                        </div>
                      )}
                    </div>
                  );
                })()}
              {!selectedJourney && selectedJunction && (
                <div>
                  <div className="text-base font-bold">
                    {selectedJunction.name}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <dt className="text-muted">Status</dt>
                    <dd className="capitalize">{selectedJunction.status}</dd>
                    <dt className="text-muted">Traffic</dt>
                    <dd className="capitalize">{selectedJunction.traffic}</dd>
                    <dt className="text-muted">Officer</dt>
                    <dd>{selectedJunction.officer}</dd>
                    <dt className="text-muted">Geofence</dt>
                    <dd className="font-mono">
                      {selectedJunction.alertRadius} m
                    </dd>
                  </dl>
                  {(() => {
                    const approach = state.alerts.find(
                      (a) =>
                        a.junctionId === selectedJunction.id &&
                        a.status !== "cleared",
                    );
                    return approach ? (
                      <div className="mt-2 rounded-lg bg-emergency/10 p-2 text-xs text-emergency">
                        {approach.ambulanceNumber} approaching · ETA{" "}
                        {fmtEta(
                          getAlertLiveEta(state, approach) ?? approach.etaSec,
                        )}
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </div>
          )}
        </main>

        <aside className="order-3 flex min-h-0 flex-col gap-4 overflow-y-auto p-3 lg:p-3 lg:pl-0">
          <AlertPanel
            state={state}
            officerName={session.name}
            onAcknowledge={(id) => {
              store.acknowledgeAlert(id, session.name);
              setToast("Traffic team notified");
            }}
            onViewRoute={(id) => {
              setSelected({ ambulanceId: id });
              setToast("Focused on route");
            }}
            onContact={setContactAlert}
          />
          <AiPanel state={state} />
          <JunctionPanel
            state={state}
            selectedJunctionId={selected.junctionId}
            onPrepare={(id) => {
              store.markJunctionPrepared(id);
              setToast("Junction marked as prepared");
            }}
            onClear={(id) => {
              store.markJunctionCleared(id);
              setToast("Junction marked as cleared");
            }}
            onSelectJunction={(id) => setSelected({ junctionId: id })}
          />
        </aside>
      </div>

      {/* ---------- footer ---------- */}
      <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-panel px-4 py-2 text-[10px] text-muted">
        <span>
          Coordination &amp; information platform — does not control traffic
          signals.
        </span>
        <span className="ml-auto">
          Map data © OpenStreetMap contributors · CARTO · demo locations
        </span>
      </footer>

      {/* ---------- modals ---------- */}
      <Modal
        open={Boolean(contactAlert)}
        onClose={() => setContactAlert(null)}
        title="Contact nearby officer"
        footer={
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(dispatchMessage)
                  .then(() => setToast("Dispatch message copied"));
              }}
            >
              <Copy size={16} /> COPY MESSAGE
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                setToast(
                  `Radio call logged — ${contactJunction?.officer ?? "officer"} dispatched to ${contactAlert?.junctionName}`,
                );
                setContactAlert(null);
              }}
            >
              <Radio size={16} /> SIMULATE RADIO CALL
            </Button>
          </div>
        }
      >
        {contactJunction && (
          <div className="space-y-3">
            <div className="rounded-xl border border-line bg-ink p-3">
              <div className="text-sm font-bold">{contactJunction.officer}</div>
              <div className="text-xs text-muted">
                {contactJunction.name} · {contactJunction.officerPhone}
              </div>
            </div>
            <p className="rounded-xl bg-ink p-3 text-xs leading-relaxed text-slate-200">
              {dispatchMessage}
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={resetConfirm}
        onClose={() => setResetConfirm(false)}
        title="Reset demo data?"
        footer={
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setResetConfirm(false)}
            >
              CANCEL
            </Button>
            <Button
              variant="emergency"
              size="lg"
              onClick={() => {
                store.resetDemo();
                setResetConfirm(false);
                setToast("Demo data reset");
              }}
            >
              RESET
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-muted">
          Restores the seeded ambulances, junctions and history. Active journeys
          and alerts are discarded.
        </p>
      </Modal>

      {toast && <Toast message={toast} />}
    </div>
  );
}

function Metric({
  value,
  label,
  accent,
}: {
  value: number;
  label: string;
  accent?: "emergency";
}) {
  return (
    <div className="flex flex-col justify-center border-line px-5 py-3 md:border-l md:first:border-l-0">
      <span
        className={cn(
          "font-mono text-3xl font-semibold leading-none",
          accent === "emergency" && "text-emergency",
        )}
      >
        {value}
      </span>
      <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
    </div>
  );
}

function LegendRow({
  swatch,
  label,
}: {
  swatch: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex" style={{ display: "inline-flex" }}>
        {swatch}
      </span>
      {label}
    </div>
  );
}
