"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type {
  Alert,
  Ambulance,
  AppState,
  Coord,
  Junction,
  RoadblockType,
  Session,
} from "@/types";
import {
  computeMilestones,
  cumulative,
  haversineM,
  nearestOnRoute,
} from "./geofencing";
import { fetchDrivingRoute } from "./routing";
import { fetchNearbyHospitals, fetchRouteJunctions } from "./places";
import {
  BASE_SPEED_MPS,
  BrowserGeolocationProvider,
  SimulationLocationProvider,
} from "./simulation";
import { createSeedState } from "./seed";
import {
  isSupabaseConfigured,
  mirrorState,
  subscribeRemote,
} from "./supabase/sync";

const STORAGE_KEY = "rapidroute-state-v1";
const SESSION_KEY = "rapidroute-session-v1";
const GEOFENCE_EXIT_MARGIN_M = 250;
const JUNCTION_REVERT_MS = 20000;

const SERVER_SEED = createSeedState();
const getServerSnapshot = () => SERVER_SEED;

class RapidStore {
  private state: AppState = createSeedState();
  private listeners = new Set<() => void>();
  private channel: BroadcastChannel | null = null;
  private readonly tabId = Math.random().toString(36).slice(2);
  private simProviders = new Map<string, SimulationLocationProvider>();
  private gps: BrowserGeolocationProvider | null = null;
  private applyingRemote = false;
  private revertTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private inited = false;
  private hospitalsReqInFlight = false;

  /* ---------------------------------------------------------- lifecycle */

  init() {
    if (this.inited || typeof window === "undefined") return;
    this.inited = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.state = this.mergeSaved(JSON.parse(raw));
      const sess = sessionStorage.getItem(SESSION_KEY);
      if (sess) this.state.session = JSON.parse(sess);
    } catch {
      this.state = createSeedState();
    }
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel("rapidroute-sync");
      this.channel.onmessage = (ev: MessageEvent) => {
        const data = ev.data as {
          type?: string;
          from?: string;
          state?: AppState;
        } | null;
        if (data?.type === "state" && data.from !== this.tabId && data.state)
          this.applyRemote(data.state);
      };
    }
    if (isSupabaseConfigured) {
      this.state.connection = { mode: "supabase", status: "connecting" };
      subscribeRemote(
        (table, row) => this.applyRemoteRow(table, row),
        (status) => {
          this.state.connection = { mode: "supabase", status };
          this.touch();
          this.notifyOnly();
        },
      );
    }
  }

  private mergeSaved(saved: Partial<AppState>): AppState {
    const fresh = createSeedState();
    return {
      ...fresh,
      ...saved,
      session: saved.session ?? null,
      sim: {
        ...fresh.sim,
        ...(saved.sim ?? {}),
        active: saved.sim?.active ?? false,
      },
      connection: fresh.connection,
      live: saved.live ?? false,
      hospitalsLoading: false,
    };
  }

  subscribe = (cb: () => void) => {
    this.init();
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
  getState = () => this.state;

  /** New root object so useSyncExternalStore always sees a changed snapshot. */
  private touch() {
    this.state = { ...this.state };
  }
  private notifyOnly() {
    this.listeners.forEach((l) => l());
  }

  private commit(forceMirror = false) {
    if (this.applyingRemote) {
      this.notifyOnly();
      return;
    }
    this.touch();
    this.notifyOnly();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      /* quota */
    }
    this.channel?.postMessage({
      type: "state",
      state: this.state,
      from: this.tabId,
    });
    void mirrorState(this.state, forceMirror);
  }

  private applyRemote(next: AppState) {
    this.applyingRemote = true;
    this.state = {
      ...next,
      session: this.state.session,
      connection: this.state.connection,
    };
    this.pruneProviders();
    this.notifyOnly();
    this.applyingRemote = false;
  }

  private applyRemoteRow(table: string, row: Record<string, any>) {
    const ts = (v: unknown) =>
      v ? new Date(v as string).getTime() : undefined;
    let changed = false;
    if (table === "ambulances") {
      this.state.ambulances = this.state.ambulances.map((a) =>
        a.id === row.id &&
        (a.status !== row.status ||
          a.lat !== row.current_latitude ||
          a.activeJourneyId !== row.active_route_id)
          ? ((changed = true),
            {
              ...a,
              status: row.status,
              lat: row.current_latitude,
              lng: row.current_longitude,
              activeJourneyId: row.active_route_id,
              selectedHospitalId:
                row.destination_hospital_id ?? a.selectedHospitalId,
            })
          : a,
      );
    } else if (table === "junctions") {
      this.state.junctions = this.state.junctions.map((j) =>
        j.id === row.id && j.status !== row.status
          ? ((changed = true), { ...j, status: row.status })
          : j,
      );
    } else if (table === "journeys") {
      this.state.journeys = this.state.journeys.map((j) =>
        j.id === row.id &&
        (j.status !== row.status ||
          Math.abs(j.traveledM - (row.traveled_m ?? j.traveledM)) > 1)
          ? ((changed = true),
            {
              ...j,
              status: row.status,
              traveledM: row.traveled_m ?? j.traveledM,
              completedAt: ts(row.completed_at) ?? j.completedAt,
            })
          : j,
      );
    } else if (table === "alerts") {
      this.state.alerts = this.state.alerts.map((a) =>
        a.id === row.id && a.status !== row.status
          ? ((changed = true),
            {
              ...a,
              status: row.status,
              officer: row.officer ?? a.officer,
              acknowledgedAt: ts(row.acknowledged_at) ?? a.acknowledgedAt,
              clearedAt: ts(row.cleared_at) ?? a.clearedAt,
            })
          : a,
      );
    }
    if (changed) {
      this.touch();
      this.notifyOnly();
    }
  }

  /* ---------------------------------------------------------- live (real) data */

  /** Switches the app from demo seed data to live OpenStreetMap data when reachable. */
  async loadHospitals(around: Coord, opts?: { force?: boolean }) {
    this.init();
    if (this.hospitalsReqInFlight) return;
    if (this.state.live && !opts?.force) return;
    this.hospitalsReqInFlight = true;
    this.state.hospitalsLoading = true;
    this.touch();
    this.notifyOnly();

    const hospitals = await fetchNearbyHospitals(around[0], around[1]);
    this.hospitalsReqInFlight = false;
    this.state.hospitalsLoading = false;

    if (hospitals.length === 0) {
      // Overpass unreachable — keep the built-in list so the app stays usable
      this.touch();
      this.notifyOnly();
      return;
    }

    const realActive = this.state.journeys.filter(
      (j) =>
        j.status === "active" &&
        j.id !== "jn-107" &&
        !j.id.startsWith("jn-hist"),
    );
    if (!this.state.live && realActive.length === 0) {
      // go live: clear the seeded demo ops picture
      this.state.live = true;
      this.state.junctions = []; // real junctions are detected per route
      this.state.journeys = [];
      this.state.alerts = [];
      this.state.roadblocks = [];
      this.state.completedToday = 0;
      this.state.ambulances = this.state.ambulances.map((a) =>
        a.id === "a-107"
          ? {
              ...a,
              status: "available" as const,
              activeJourneyId: null,
              selectedHospitalId: null,
              previewRoute: null,
              previewLoading: false,
            }
          : a,
      );
    }
    this.state.hospitals = hospitals;
    this.commit(true);
  }

  /** Move the ambulance to a real GPS position (used by "Find hospitals near me"). */
  relocateAmbulance(ambulanceId: string, lat: number, lng: number) {
    this.state.ambulances = this.state.ambulances.map((a) =>
      a.id === ambulanceId
        ? {
            ...a,
            lat,
            lng,
            selectedHospitalId: null,
            previewRoute: null,
            previewLoading: false,
          }
        : a,
    );
    this.commit();
  }

  /* ---------------------------------------------------------- session */

  setSession(session: Session | null) {
    this.state.session = session;
    try {
      if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* private mode */
    }
    this.commit(true);
  }

  signOut() {
    this.setSession(null);
  }

  /* ---------------------------------------------------------- driver flow */

  async previewRoute(ambulanceId: string, hospitalId: string) {
    const amb = this.state.ambulances.find((a) => a.id === ambulanceId);
    const hospital = this.state.hospitals.find((h) => h.id === hospitalId);
    if (!amb || !hospital) return;
    this.state.ambulances = this.state.ambulances.map((a) =>
      a.id === ambulanceId
        ? {
            ...a,
            selectedHospitalId: hospitalId,
            previewRoute: null,
            previewLoading: true,
          }
        : a,
    );
    this.commit();

    const res = await fetchDrivingRoute(
      [amb.lat, amb.lng],
      [hospital.lat, hospital.lng],
      hospitalId,
    );
    const current = this.state.ambulances.find((a) => a.id === ambulanceId);
    if (current?.selectedHospitalId !== hospitalId) return; // selection changed meanwhile

    // live mode: detect real traffic-signal junctions along this route
    if (this.state.live) {
      const junctions = await fetchRouteJunctions(res.coords);
      if (junctions.length > 0) this.state.junctions = junctions;
    }
    const milestones = computeMilestones(res.coords, this.state.junctions);

    this.state.ambulances = this.state.ambulances.map((a) =>
      a.id === ambulanceId
        ? {
            ...a,
            previewLoading: false,
            previewRoute: {
              coords: res.coords,
              distanceM: res.distanceM,
              durationSec: res.durationSec,
              source: res.source,
              speedMps: res.speedMps,
              milestones,
            },
          }
        : a,
    );
    this.commit();
  }

  clearHospitalSelection(ambulanceId: string) {
    this.state.ambulances = this.state.ambulances.map((a) =>
      a.id === ambulanceId
        ? {
            ...a,
            selectedHospitalId: null,
            previewRoute: null,
            previewLoading: false,
          }
        : a,
    );
    this.commit();
  }

  async startJourney(ambulanceId: string): Promise<void> {
    const amb = this.state.ambulances.find((a) => a.id === ambulanceId);
    if (!amb || !amb.selectedHospitalId) return;
    const hospital = this.state.hospitals.find(
      (h) => h.id === amb.selectedHospitalId,
    )!;
    let route = amb.previewRoute;
    if (!route) {
      const res = await fetchDrivingRoute(
        [amb.lat, amb.lng],
        [hospital.lat, hospital.lng],
        hospital.id,
      );
      if (this.state.live) {
        const junctions = await fetchRouteJunctions(res.coords);
        if (junctions.length > 0) this.state.junctions = junctions;
      }
      route = {
        coords: res.coords,
        distanceM: res.distanceM,
        durationSec: res.durationSec,
        source: res.source,
        speedMps: res.speedMps,
        milestones: computeMilestones(res.coords, this.state.junctions),
      };
    }
    const journey: AppState["journeys"][number] = {
      id: `jn-${Date.now().toString(36)}-${this.tabId.slice(0, 4)}`,
      ambulanceId,
      ambulanceNumber: amb.number,
      driverName: amb.driverName,
      hospitalId: hospital.id,
      hospitalName: hospital.name,
      route: route.coords,
      routeSource: route.source,
      routeLengthM: route.distanceM,
      traveledM: 0,
      speedMps: route.speedMps,
      milestones: route.milestones,
      status: "active",
      startedAt: Date.now(),
    };
    this.state.journeys = [...this.state.journeys, journey];
    this.state.ambulances = this.state.ambulances.map((a) =>
      a.id === ambulanceId
        ? {
            ...a,
            status: "enroute",
            activeJourneyId: journey.id,
            previewRoute: null,
          }
        : a,
    );
    if (this.state.sim.active) this.ensureProvider(journey.id);
    this.commit(true);
  }

  endJourney(ambulanceId: string, reachedDestination: boolean) {
    const amb = this.state.ambulances.find((a) => a.id === ambulanceId);
    const journey = this.state.journeys.find(
      (j) => j.id === amb?.activeJourneyId && j.status === "active",
    );
    if (!amb || !journey) return;
    const completedAt = Date.now();
    if (reachedDestination) {
      const end = journey.route[journey.route.length - 1];
      this.state.ambulances = this.state.ambulances.map((a) =>
        a.id === amb.id ? { ...a, lat: end[0], lng: end[1] } : a,
      );
    }
    this.state.journeys = this.state.journeys.map((j) =>
      j.id === journey.id
        ? {
            ...j,
            status: "completed",
            completedAt,
            durationSec: (completedAt - j.startedAt) / 1000,
          }
        : j,
    );
    this.state.ambulances = this.state.ambulances.map((a) =>
      a.id === amb.id
        ? {
            ...a,
            status: "available",
            activeJourneyId: null,
            selectedHospitalId: null,
            previewRoute: null,
            previewLoading: false,
            lastCompletedJourneyId: journey.id,
          }
        : a,
    );
    const touchedJunctionIds = new Set(
      this.state.alerts
        .filter((al) => al.journeyId === journey.id)
        .map((al) => al.junctionId),
    );
    this.state.alerts = this.state.alerts.map((al) =>
      al.journeyId === journey.id && al.status !== "cleared"
        ? { ...al, status: "cleared", clearedAt: completedAt }
        : al,
    );
    this.state.junctions = this.state.junctions.map((j) =>
      touchedJunctionIds.has(j.id) && j.status !== "monitoring"
        ? { ...j, status: "monitoring" }
        : j,
    );
    touchedJunctionIds.forEach((id) => this.clearRevertTimer(id));
    this.state.completedToday += 1;
    this.dropProvider(journey.id);
    this.commit(true);
  }

  dismissCompletion(ambulanceId: string) {
    this.state.ambulances = this.state.ambulances.map((a) =>
      a.id === ambulanceId ? { ...a, lastCompletedJourneyId: null } : a,
    );
    this.commit();
  }

  /* ---------------------------------------------------------- simulation / GPS */

  startSim() {
    this.init();
    this.state.sim = {
      ...this.state.sim,
      active: true,
      ownerTab: this.tabId,
      lastTick: Date.now(),
    };
    this.state.journeys
      .filter((j) => j.status === "active")
      .forEach((j) => this.ensureProvider(j.id));
    this.commit(true);
  }

  stopSim() {
    this.state.sim = { ...this.state.sim, active: false };
    this.simProviders.forEach((p) => p.stop());
    this.simProviders.clear();
    this.commit(true);
  }

  setSimSpeed(speed: number) {
    this.state.sim = { ...this.state.sim, speed };
    this.commit();
  }

  heartbeat() {
    if (!this.inited) return;
    const sim = this.state.sim;
    if (!sim.active) return;
    const stale = Date.now() - (sim.lastTick || 0) > 6000;
    if (sim.ownerTab !== this.tabId && stale) {
      this.state.sim = { ...sim, ownerTab: this.tabId, lastTick: Date.now() };
      this.state.journeys
        .filter((j) => j.status === "active")
        .forEach((j) => this.ensureProvider(j.id));
      this.commit();
    } else if (sim.ownerTab === this.tabId) {
      this.state.journeys
        .filter((j) => j.status === "active")
        .forEach((j) => this.ensureProvider(j.id));
    }
  }

  private ensureProvider(journeyId: string) {
    if (typeof window === "undefined" || this.simProviders.has(journeyId))
      return;
    const provider = new SimulationLocationProvider({
      getJourney: () => this.state.journeys.find((j) => j.id === journeyId),
      isRunning: () => this.state.sim.active,
      speedMultiplier: () => this.state.sim.speed,
      onPosition: (lat, lng, traveledM, heading) =>
        this.pushLocation(journeyId, lat, lng, traveledM, heading),
      onFinished: () => this.dropProvider(journeyId),
    });
    provider.start();
    this.simProviders.set(journeyId, provider);
  }

  private dropProvider(journeyId: string) {
    const p = this.simProviders.get(journeyId);
    if (p) {
      p.stop();
      this.simProviders.delete(journeyId);
    }
  }

  private pruneProviders() {
    for (const id of [...this.simProviders.keys()]) {
      const j = this.state.journeys.find((x) => x.id === id);
      if (!j || j.status !== "active" || !this.state.sim.active)
        this.dropProvider(id);
    }
  }

  attachGps(ambulanceId: string, onError: (msg: string) => void) {
    this.init();
    this.detachGps();
    this.gps = new BrowserGeolocationProvider({
      onUpdate: (lat, lng, heading) =>
        this.pushGpsPosition(ambulanceId, lat, lng, heading),
      onError,
    });
    this.gps.start();
  }

  detachGps() {
    this.gps?.stop();
    this.gps = null;
  }

  private pushGpsPosition(
    ambulanceId: string,
    lat: number,
    lng: number,
    heading: number | null,
  ) {
    const amb = this.state.ambulances.find((a) => a.id === ambulanceId);
    if (!amb) return;
    const journey = this.state.journeys.find(
      (j) => j.id === amb.activeJourneyId && j.status === "active",
    );
    if (!journey) {
      this.state.ambulances = this.state.ambulances.map((a) =>
        a.id === ambulanceId
          ? { ...a, lat, lng, heading: heading ?? a.heading }
          : a,
      );
      this.commit();
      return;
    }
    const cum = cumulative(journey.route);
    const traveled = nearestOnRoute(journey.route, cum, [lat, lng]);
    this.pushLocation(journey.id, lat, lng, traveled, heading ?? undefined);
  }

  /* ---------------------------------------------------------- location + geofencing */

  private pushLocation(
    journeyId: string,
    lat: number,
    lng: number,
    traveledM?: number,
    heading?: number,
  ) {
    const journey = this.state.journeys.find((j) => j.id === journeyId);
    if (!journey || journey.status !== "active") return;
    const amb = this.state.ambulances.find((a) => a.id === journey.ambulanceId);
    if (!amb) return;
    const traveled = Math.min(
      traveledM ?? journey.traveledM,
      journey.routeLengthM,
    );
    this.state.journeys = this.state.journeys.map((j) =>
      j.id === journeyId ? { ...j, traveledM: traveled } : j,
    );
    this.state.ambulances = this.state.ambulances.map((a) =>
      a.id === amb.id ? { ...a, lat, lng, heading: heading ?? a.heading } : a,
    );
    this.state.sim = { ...this.state.sim, lastTick: Date.now() };
    if (traveled >= journey.routeLengthM - 20) {
      this.endJourney(journey.ambulanceId, true);
      return;
    }
    this.checkGeofence(journey, lat, lng, traveled);
    this.commit();
  }

  private checkGeofence(
    journey: AppState["journeys"][number],
    lat: number,
    lng: number,
    traveled: number,
  ) {
    const pos: Coord = [lat, lng];
    for (const j of this.state.junctions) {
      const d = haversineM(pos, [j.lat, j.lng]);
      const existing = this.state.alerts.find(
        (a) => a.journeyId === journey.id && a.junctionId === j.id,
      );
      if (!existing && d <= j.alertRadius) {
        const ms = journey.milestones.find((m) => m.junctionId === j.id);
        const etaSec = Math.max(
          5,
          Math.round(
            (ms ? Math.max(0, ms.atM - traveled) : d) /
              (journey.speedMps || BASE_SPEED_MPS),
          ),
        );
        const alert: Alert = {
          id: `al-${Date.now().toString(36)}-${j.id}`,
          journeyId: journey.id,
          ambulanceId: journey.ambulanceId,
          ambulanceNumber: journey.ambulanceNumber,
          junctionId: j.id,
          junctionName: j.name,
          hospitalName: journey.hospitalName,
          driverName: journey.driverName,
          etaSec,
          status: "pending",
          traffic: j.traffic,
          createdAt: Date.now(),
        };
        this.state.alerts = [alert, ...this.state.alerts];
      } else if (
        existing &&
        existing.status !== "cleared" &&
        d > j.alertRadius + GEOFENCE_EXIT_MARGIN_M
      ) {
        const clearedAt = Date.now();
        this.state.alerts = this.state.alerts.map((a) =>
          a.id === existing.id ? { ...a, status: "cleared", clearedAt } : a,
        );
        this.setJunctionStatus(j.id, "cleared");
        this.scheduleJunctionRevert(j.id);
      }
    }
  }

  /* ---------------------------------------------------------- police actions */

  acknowledgeAlert(alertId: string, officer: string) {
    const alert = this.state.alerts.find((a) => a.id === alertId);
    if (!alert || alert.status !== "pending") return;
    this.state.alerts = this.state.alerts.map((a) =>
      a.id === alertId
        ? { ...a, status: "acknowledged", acknowledgedAt: Date.now(), officer }
        : a,
    );
    this.setJunctionStatus(alert.junctionId, "preparing");
    this.commit(true);
  }

  markJunctionPrepared(junctionId: string) {
    this.setJunctionStatus(junctionId, "preparing");
    this.commit(true);
  }

  markJunctionCleared(junctionId: string) {
    this.setJunctionStatus(junctionId, "cleared");
    this.scheduleJunctionRevert(junctionId);
    this.commit(true);
  }

  private setJunctionStatus(junctionId: string, status: Junction["status"]) {
    this.state.junctions = this.state.junctions.map((j) =>
      j.id === junctionId ? { ...j, status } : j,
    );
  }

  private scheduleJunctionRevert(junctionId: string) {
    this.clearRevertTimer(junctionId);
    this.revertTimers.set(
      junctionId,
      setTimeout(() => {
        const j = this.state.junctions.find((x) => x.id === junctionId);
        const stillActive = this.state.alerts.some(
          (a) => a.junctionId === junctionId && a.status !== "cleared",
        );
        if (j?.status === "cleared" && !stillActive) {
          this.setJunctionStatus(junctionId, "monitoring");
          this.commit();
        }
        this.revertTimers.delete(junctionId);
      }, JUNCTION_REVERT_MS),
    );
  }

  private clearRevertTimer(junctionId: string) {
    const t = this.revertTimers.get(junctionId);
    if (t) {
      clearTimeout(t);
      this.revertTimers.delete(junctionId);
    }
  }

  /* ---------------------------------------------------------- roadblocks + reset */

  reportRoadblock(ambulanceId: string, type: RoadblockType, note?: string) {
    const amb = this.state.ambulances.find((a) => a.id === ambulanceId);
    if (!amb) return;
    let nearest: Junction | undefined;
    let nearestD = Infinity;
    for (const j of this.state.junctions) {
      const d = haversineM([amb.lat, amb.lng], [j.lat, j.lng]);
      if (d < nearestD) {
        nearestD = d;
        nearest = j;
      }
    }
    this.state.roadblocks = [
      {
        id: `rb-${Date.now().toString(36)}`,
        ambulanceId,
        ambulanceNumber: amb.number,
        type,
        note,
        lat: amb.lat,
        lng: amb.lng,
        createdAt: Date.now(),
        junctionId: nearest?.id,
      },
      ...this.state.roadblocks,
    ];
    if (
      nearest &&
      (type === "road_blocked" || type === "congestion") &&
      nearest.traffic !== "high"
    ) {
      this.state.junctions = this.state.junctions.map((j) =>
        j.id === nearest.id ? { ...j, traffic: "high" } : j,
      );
    }
    this.commit(true);
  }

  resetDemo() {
    this.simProviders.forEach((p) => p.stop());
    this.simProviders.clear();
    this.detachGps();
    this.revertTimers.forEach((t) => clearTimeout(t));
    this.revertTimers.clear();
    const session = this.state.session;
    this.state = { ...createSeedState(), session };
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.commit(true);
  }
}

export const store = new RapidStore();

/* ---------------------------------------------------------- react bindings */

export function useAppState(): AppState {
  return useSyncExternalStore(
    store.subscribe,
    store.getState,
    getServerSnapshot,
  );
}

export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    store.init();
    setHydrated(true);
  }, []);
  return hydrated;
}
