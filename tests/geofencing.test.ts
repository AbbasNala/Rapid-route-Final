import { describe, expect, it } from "vitest";
import { haversineMeters, bearingDegrees } from "@/lib/geofencing/haversine";

describe("haversineMeters", () => {
  it("computes distance along the equator (1° longitude ≈ 111.19 km)", () => {
    expect(
      haversineMeters(
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 1 },
      ),
    ).toBeCloseTo(111195, -2);
  });

  it("computes distance along a meridian (1° latitude ≈ 111.19 km)", () => {
    expect(
      haversineMeters(
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 0 },
      ),
    ).toBeCloseTo(111195, -2);
  });

  it("returns 0 for identical points", () => {
    expect(
      haversineMeters(
        { latitude: 6.9147, longitude: 79.8776 },
        { latitude: 6.9147, longitude: 79.8776 },
      ),
    ).toBe(0);
  });

  it("shrinks with latitude (longitude degrees are shorter away from the equator)", () => {
    const at50 = haversineMeters(
      { latitude: 50, longitude: 0 },
      { latitude: 50, longitude: 1 },
    );
    expect(at50).toBeLessThan(111195);
    expect(at50).toBeCloseTo(71472, -2);
  });

  it("computes north bearing as 0° and east as 90°", () => {
    const o = { latitude: 0, longitude: 0 };
    expect(bearingDegrees(o, { latitude: 1, longitude: 0 })).toBeCloseTo(0, 0);
    expect(bearingDegrees(o, { latitude: 0, longitude: 1 })).toBeCloseTo(90, 0);
  });
});
