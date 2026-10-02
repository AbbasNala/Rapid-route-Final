import type { Alert, AppState, Journey, Junction } from "@/types";

export function getActiveJourneyFor(
  state: AppState,
  ambulanceId: string,
): Journey | undefined {
  const amb = state.ambulances.find((a) => a.id === ambulanceId);
  return state.journeys.find(
    (j) => j.id === amb?.activeJourneyId && j.status === "active",
  );
}

export function getJourneyStats(journey: Journey): {
  remainingM: number;
  etaSec: number;
} {
  const remainingM = Math.max(0, journey.routeLengthM - journey.traveledM);
  return { remainingM, etaSec: remainingM / (journey.speedMps || 11.1) };
}

export function getUpcomingJunctions(
  state: AppState,
  journey: Journey,
  count = 2,
): Array<{ junction: Junction; etaSec: number; distanceM: number }> {
  const out = [];
  for (const ms of journey.milestones) {
    if (ms.atM <= journey.traveledM + 60) continue;
    const junction = state.junctions.find((j) => j.id === ms.junctionId);
    if (!junction) continue;
    const distanceM = Math.max(0, ms.atM - journey.traveledM);
    out.push({
      junction,
      distanceM,
      etaSec: distanceM / (journey.speedMps || 11.1),
    });
    if (out.length >= count) break;
  }
  return out;
}

export function getNextJunction(state: AppState, journey: Journey) {
  return getUpcomingJunctions(state, journey, 1)[0] ?? null;
}

/** Live (recomputed) ETA for an alert's ambulance to its junction, or null if unknown. */
export function getAlertLiveEta(state: AppState, alert: Alert): number | null {
  const journey = state.journeys.find((j) => j.id === alert.journeyId);
  if (!journey || journey.status !== "active") return null;
  const ms = journey.milestones.find((m) => m.junctionId === alert.junctionId);
  if (!ms) return null;
  return Math.max(0, (ms.atM - journey.traveledM) / (journey.speedMps || 11.1));
}

export function getAlertForJourneyJunction(
  state: AppState,
  journeyId: string,
  junctionId: string,
): Alert | undefined {
  return state.alerts.find(
    (a) => a.journeyId === journeyId && a.junctionId === junctionId,
  );
}
