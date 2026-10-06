// Traffic-risk recommendation abstraction. The default provider is a
// deterministic rules engine — no AI API key required. An LLM-backed provider
// can be swapped in later behind this same interface (AI_API_KEY is reserved
// for that). Recommendations are decision support ONLY; they never control
// traffic and officers remain responsible for traffic management.
import { fmtDuration } from "@/lib/utils";

export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export interface RiskInput {
  etaSeconds: number | null;
  distanceM: number | null;
  activeIncidentsNearby: number;
  acknowledged: boolean;
  context: { junctionName?: string; ambulance?: string };
}

export interface RiskAssessment {
  level: RiskLevel;
  headline: string;
  recommendation: string;
}

export interface RiskProvider {
  readonly name: string;
  assess(input: RiskInput): RiskAssessment;
}

export function getRiskProvider(): RiskProvider {
  const { rulesRiskProvider } = require("./rulesRiskProvider") as {
    rulesRiskProvider: RiskProvider;
  };
  return rulesRiskProvider;
}

export function riskLevelLabel(level: RiskLevel): string {
  return {
    LOW: "Low risk",
    MODERATE: "Moderate priority",
    HIGH: "High priority",
    CRITICAL: "Critical priority",
  }[level];
}

export function describeEta(seconds: number | null): string {
  return seconds != null && Number.isFinite(seconds)
    ? `in about ${fmtDuration(seconds)}`
    : "shortly";
}
