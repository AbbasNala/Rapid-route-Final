import { describe, expect, it } from "vitest";
import {
  estimateEtaSeconds,
  evaluateJunctionAlert,
  FALLBACK_SPEED_MPS,
} from "@/lib/geofencing/alertRules";

const state = (
  distanceM: number,
  radiusM = 500,
  speedMps: number | null = 10,
) => ({ distanceM, radiusM, speedMps });

describe("evaluateJunctionAlert — geofence boundary", () => {
  it("generates an alert when inside the radius", () => {
    expect(evaluateJunctionAlert(state(400), null)).toEqual({
      action: "CREATE",
      etaSeconds: 40,
    });
  });

  it("treats the exact boundary (distance == radius) as inside", () => {
    expect(evaluateJunctionAlert(state(500), null).action).toBe("CREATE");
  });

  it("does nothing when clearly outside", () => {
    expect(evaluateJunctionAlert(state(900), null).action).toBe("NONE");
  });
});

describe("evaluateJunctionAlert — duplicates & lifecycle", () => {
  it("prevents duplicate alerts while one is active (updates ETA instead)", () => {
    const decision = evaluateJunctionAlert(state(300), { status: "PENDING" });
    expect(decision.action).toBe("UPDATE");
    expect(decision).toEqual({ action: "UPDATE", etaSeconds: 30 });
  });

  it("also updates acknowledged alerts instead of creating new ones", () => {
    expect(
      evaluateJunctionAlert(state(300), { status: "ACKNOWLEDGED" }).action,
    ).toBe("UPDATE");
  });

  it("does not clear an alert just outside the boundary (hysteresis)", () => {
    expect(
      evaluateJunctionAlert(state(560), { status: "PENDING" }).action,
    ).toBe("NONE");
  });

  it("clears the alert once beyond 1.25× the radius", () => {
    expect(
      evaluateJunctionAlert(state(650), { status: "PENDING" }).action,
    ).toBe("CLEAR");
    expect(
      evaluateJunctionAlert(state(650), { status: "ACKNOWLEDGED" }).action,
    ).toBe("CLEAR");
  });

  it("creates a fresh alert on re-entry after a previous clear", () => {
    expect(
      evaluateJunctionAlert(state(400), { status: "CLEARED" }).action,
    ).toBe("CREATE");
  });
});

describe("estimateEtaSeconds", () => {
  it("falls back to the default urban speed when GPS speed is missing or zero", () => {
    expect(estimateEtaSeconds(400, null)).toBe(400 / FALLBACK_SPEED_MPS);
    expect(estimateEtaSeconds(400, 0)).toBe(400 / FALLBACK_SPEED_MPS);
  });

  it("uses real GPS speed when available", () => {
    expect(estimateEtaSeconds(400, 20)).toBe(20);
  });
});
