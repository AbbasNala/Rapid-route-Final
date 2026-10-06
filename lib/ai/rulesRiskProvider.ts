// Deterministic rules engine (the default RiskProvider). Scoring:
//   ETA ≤ 60s → +2, ETA ≤ 180s → +1; unacknowledged & ETA ≤ 180s → +1;
//   any active incident near the junction → +1.
//   ≥4 → CRITICAL, 3 → HIGH, 1–2 → MODERATE, 0 → LOW.
import {
  describeEta,
  type RiskAssessment,
  type RiskInput,
  type RiskProvider,
} from "./riskProvider";

function assess(input: RiskInput): RiskAssessment {
  const eta = input.etaSeconds ?? Number.POSITIVE_INFINITY;
  const junction = input.context.junctionName ?? "the junction";
  const ambulance = input.context.ambulance ?? "The ambulance";
  const where = `${ambulance} approaching ${junction} ${describeEta(input.etaSeconds)}`;

  let score = 0;
  if (eta <= 60) score += 2;
  else if (eta <= 180) score += 1;
  if (!input.acknowledged && eta <= 180) score += 1;
  if (input.activeIncidentsNearby > 0) score += 1;

  if (score >= 4) {
    return {
      level: "CRITICAL",
      headline: `Critical coordination priority — ${where}.`,
      recommendation:
        `${input.activeIncidentsNearby} active road incident(s) reported near this junction and the alert is not yet acknowledged. ` +
        `Confirm traffic control readiness immediately.`,
    };
  }
  if (score === 3) {
    return {
      level: "HIGH",
      headline: `High coordination priority — ${where}.`,
      recommendation:
        "Prepare the junction for passage and acknowledge the alert so the crew sees confirmation.",
    };
  }
  if (score >= 1) {
    return {
      level: "MODERATE",
      headline: `Moderate priority — ${where}.`,
      recommendation:
        "No active incidents reported near this junction. Continue monitoring.",
    };
  }
  return {
    level: "LOW",
    headline: "Low risk.",
    recommendation:
      "No active incidents reported along the upcoming route. Continue monitoring.",
  };
}

export const rulesRiskProvider: RiskProvider = { name: "rules-engine", assess };
