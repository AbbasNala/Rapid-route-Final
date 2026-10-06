// Pure decision logic for junction alerting. Mirrors the SQL trigger
// public.process_location_update() so both sides follow identical rules.
import type { AlertStatus } from "@/types/database";

/** Fallback urban ambulance speed (m/s ≈ 29 km/h) when GPS speed is missing. */
export const FALLBACK_SPEED_MPS = 8;

export interface JunctionAlertState {
  distanceM: number;
  radiusM: number;
  speedMps: number | null;
}
export interface ExistingAlert {
  status: AlertStatus;
}

export type AlertDecision =
  | { action: "CREATE"; etaSeconds: number }
  | { action: "UPDATE"; etaSeconds: number }
  | { action: "CLEAR" }
  | { action: "NONE" };

export function estimateEtaSeconds(
  distanceM: number,
  speedMps: number | null,
): number {
  return distanceM / Math.max(speedMps ?? 0, FALLBACK_SPEED_MPS);
}

/**
 * Rules:
 *  - inside geofence (distance <= radius) with no active alert → CREATE
 *  - inside geofence with an active alert → UPDATE (refresh ETA, never duplicate)
 *  - outside geofence beyond 1.25× radius (hysteresis) with active alert → CLEAR
 *  - just outside the boundary → NONE (prevents GPS-jitter flapping)
 */
export function evaluateJunctionAlert(
  state: JunctionAlertState,
  existing: ExistingAlert | null,
): AlertDecision {
  const inside = state.distanceM <= state.radiusM;
  const active =
    existing &&
    (existing.status === "PENDING" || existing.status === "ACKNOWLEDGED")
      ? existing
      : null;

  if (inside) {
    const eta = estimateEtaSeconds(state.distanceM, state.speedMps);
    return active
      ? { action: "UPDATE", etaSeconds: eta }
      : { action: "CREATE", etaSeconds: eta };
  }
  if (active && state.distanceM > state.radiusM * 1.25)
    return { action: "CLEAR" };
  return { action: "NONE" };
}
