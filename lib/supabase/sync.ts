import type { AppState } from "@/types";
import { supabase, isSupabaseConfigured } from "./client";

type Row = Record<string, any>;
let lastMirrorAt = 0;
const lastMirroredPos = new Map<string, string>();

export function toAmbulanceRow(a: AppState["ambulances"][number]): Row {
  return {
    id: a.id,
    ambulance_number: a.number,
    driver_name: a.driverName,
    status: a.status,
    current_latitude: a.lat,
    current_longitude: a.lng,
    destination_hospital_id: a.selectedHospitalId,
    active_route_id: a.activeJourneyId,
  };
}
export function toJunctionRow(j: AppState["junctions"][number]): Row {
  return {
    id: j.id,
    name: j.name,
    latitude: j.lat,
    longitude: j.lng,
    radius: j.alertRadius,
    status: j.status,
    traffic: j.traffic,
    officer: j.officer,
    officer_phone: j.officerPhone,
  };
}
export function toJourneyRow(j: AppState["journeys"][number]): Row {
  return {
    id: j.id,
    ambulance_id: j.ambulanceId,
    destination_hospital_id: j.hospitalId,
    route_geometry: {
      type: "LineString",
      coordinates: j.route.map((c) => [c[1], c[0]]),
    },
    route_source: j.routeSource,
    route_length_m: Math.round(j.routeLengthM),
    traveled_m: Math.round(j.traveledM),
    milestones: j.milestones,
    driver_name: j.driverName,
    ambulance_number: j.ambulanceNumber,
    status: j.status,
    started_at: new Date(j.startedAt).toISOString(),
    completed_at: j.completedAt ? new Date(j.completedAt).toISOString() : null,
  };
}
export function toAlertRow(a: AppState["alerts"][number]): Row {
  return {
    id: a.id,
    journey_id: a.journeyId,
    ambulance_id: a.ambulanceId,
    junction_id: a.junctionId,
    alert_type: "approach",
    eta_seconds: Math.round(a.etaSec),
    status: a.status,
    officer: a.officer ?? null,
    created_at: new Date(a.createdAt).toISOString(),
    acknowledged_at: a.acknowledgedAt
      ? new Date(a.acknowledgedAt).toISOString()
      : null,
    cleared_at: a.clearedAt ? new Date(a.clearedAt).toISOString() : null,
  };
}

/** Best-effort persistence mirror. Throttled; every failure degrades silently to local mode. */
export async function mirrorState(
  state: AppState,
  force = false,
): Promise<void> {
  if (!supabase) return;
  const t = Date.now();
  if (!force && t - lastMirrorAt < 1500) return;
  lastMirrorAt = t;
  try {
    if (force) {
      await supabase.from("hospitals").upsert(
        state.hospitals.map((h) => ({
          id: h.id,
          name: h.name,
          latitude: h.lat,
          longitude: h.lng,
          address: h.address,
        })),
        { onConflict: "id" },
      );
      await supabase
        .from("junctions")
        .upsert(state.junctions.map(toJunctionRow), { onConflict: "id" });
    }
    await supabase
      .from("ambulances")
      .upsert(state.ambulances.map(toAmbulanceRow), { onConflict: "id" });
    await supabase
      .from("journeys")
      .upsert(state.journeys.map(toJourneyRow), { onConflict: "id" });
    await supabase
      .from("alerts")
      .upsert(state.alerts.map(toAlertRow), { onConflict: "id" });

    for (const j of state.journeys) {
      if (j.status !== "active") continue;
      const amb = state.ambulances.find((a) => a.id === j.ambulanceId);
      if (!amb) continue;
      const key = `${amb.lat.toFixed(5)},${amb.lng.toFixed(5)}`;
      if (lastMirroredPos.get(j.id) === key) continue;
      lastMirroredPos.set(j.id, key);
      await supabase
        .from("location_updates")
        .insert({
          id: crypto.randomUUID(),
          journey_id: j.id,
          latitude: amb.lat,
          longitude: amb.lng,
        });
    }
  } catch {
    // mirror failures must never break the local demo
  }
}

type ApplyRow = (table: string, row: Row) => void;

/** Subscribe to Supabase Realtime changes and forward rows into the local store. */
export function subscribeRemote(
  applyRow: ApplyRow,
  onStatus: (s: "connecting" | "connected" | "error") => void,
): void {
  if (!supabase || !isSupabaseConfigured) return;
  onStatus("connecting");
  const channel = supabase.channel("rapidroute-ops");
  for (const table of ["ambulances", "junctions", "journeys", "alerts"]) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      (payload) => {
        const row = (payload as any).new;
        if (row && typeof row === "object") applyRow(table, row);
      },
    );
  }
  channel.subscribe((status: string) => {
    if (status === "SUBSCRIBED") onStatus("connected");
    else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
      onStatus("error");
  });
}
