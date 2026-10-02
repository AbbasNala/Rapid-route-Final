import { haversineM } from "./geofencing";
import { fmtEta } from "./format";
import type { Alert, AppState } from "@/types";

export interface RiskAssessment {
  level: "low" | "medium" | "high";
  score: number;
  message: string;
  factors: string[];
}

/**
 * Deterministic local risk engine — the "AI Traffic Risk Assistant" demo brain.
 * Rule-based so it works with zero external AI calls; a real LLM could be swapped
 * in behind this same interface later. Output is decision support only.
 */
export function assessApproachRisk(
  state: AppState,
  alert: Alert,
): RiskAssessment {
  const junction = state.junctions.find((j) => j.id === alert.junctionId);
  const factors: string[] = [];
  let score = 0;

  const traffic = junction?.traffic ?? "medium";
  if (traffic === "high") {
    score += 2;
    factors.push("High reported traffic at junction");
  } else if (traffic === "medium") {
    score += 1;
    factors.push("Moderate traffic at junction");
  } else {
    factors.push("Low reported traffic at junction");
  }

  if (alert.etaSec <= 120) {
    score += 2;
    factors.push(
      `Approach in ~${fmtEta(alert.etaSec)} — limited preparation time`,
    );
  } else if (alert.etaSec <= 300) {
    score += 1;
    factors.push(`Approach in ~${Math.round(alert.etaSec / 60)} min`);
  } else {
    factors.push(`Approach in ~${Math.round(alert.etaSec / 60)} min`);
  }

  if (junction) {
    const nearbyBlocks = state.roadblocks.filter(
      (r) => haversineM([r.lat, r.lng], [junction.lat, junction.lng]) < 1200,
    );
    if (nearbyBlocks.length) {
      score += Math.min(3, nearbyBlocks.length * 2);
      factors.push(`${nearbyBlocks.length} roadblock report(s) within 1.2 km`);
    }
    const otherAmb = state.ambulances.filter(
      (a) =>
        a.status === "enroute" &&
        a.id !== alert.ambulanceId &&
        haversineM([a.lat, a.lng], [junction.lat, junction.lng]) < 1500,
    );
    if (otherAmb.length) {
      score += 1;
      factors.push(
        `${otherAmb.length} other active ambulance(s) within 1.5 km`,
      );
    }
  }

  const level = score >= 4 ? "high" : score >= 2 ? "medium" : "low";
  const eta = fmtEta(alert.etaSec);
  const name = junction?.name ?? alert.junctionName;
  const message =
    level === "high"
      ? `High congestion risk at ${name}. Ambulance ${alert.ambulanceNumber} arriving in about ${eta}. Traffic coordination recommended.`
      : level === "medium"
        ? `Moderate risk at ${name}. Ambulance ${alert.ambulanceNumber} arriving in about ${eta}. Keep the junction under observation.`
        : `Low congestion risk at ${name}. Ambulance ${alert.ambulanceNumber} arriving in about ${eta}. Current approach appears manageable.`;

  return { level, score, message, factors };
}
