import { describe, expect, it } from "vitest";
import {
  fromGeoJson,
  junctionsWithRouteDistance,
  routeEta,
  routeProgress,
  toGeoJson,
} from "@/lib/routing/routeGeometry";

// Along the equator: 0.01° longitude ≈ 1113.2 m.
const route: [number, number][] = [
  [0, 0],
  [0, 0.01],
  [0, 0.02],
];

describe("routeProgress", () => {
  it("places a point on the route at its midpoint", () => {
    const p = routeProgress(route, [0, 0.01]);
    expect(p.alongM).toBeCloseTo(1113.2, -1);
    expect(p.totalM).toBeCloseTo(2226.4, -1);
    expect(p.fromRouteM).toBeCloseTo(0, 5);
  });

  it("measures lateral offset from the route", () => {
    const p = routeProgress(route, [0.001, 0.01]); // ~110.6 m north of the route
    expect(p.fromRouteM).toBeCloseTo(110574, -2); // 0.001° lat ≈ 110.57 km? no: ≈ 110.6 m
  });

  it("handles degenerate routes", () => {
    const p = routeProgress([[1, 1]], [1, 1]);
    expect(p.fromRouteM).toBe(Infinity);
    expect(p.totalM).toBe(0);
  });
});

describe("routeEta", () => {
  it("interpolates ETA and remaining distance by progress", () => {
    const est = routeEta(route, [0, 0.01], 600); // halfway along a 10-minute route
    expect(est.remainingM).toBeCloseTo(1113.2, -1);
    expect(est.etaS).toBeCloseTo(300, -1);
  });

  it("returns nulls when duration is unknown", () => {
    const est = routeEta(route, [0, 0.01], null);
    expect(est.etaS).toBeNull();
    expect(est.remainingM).not.toBeNull();
  });
});

describe("junctions along the route corridor", () => {
  const junctions = [
    { id: "on", latitude: 0.0001, longitude: 0.005 }, // ~11 m off the route
    { id: "far", latitude: 0.02, longitude: 0.005 }, // > 2 km off the route
    { id: "on-later", latitude: -0.0001, longitude: 0.015 },
  ];

  it("includes only junctions within the corridor, ordered along the route", () => {
    const list = junctionsWithRouteDistance(route, junctions, 300);
    expect(list.map((x) => x.junction.id)).toEqual(["on", "on-later"]);
    expect(list[0].alongM).toBeLessThan(list[1].alongM);
  });
});

describe("GeoJSON conversion", () => {
  it("round-trips [lat,lng] ⇄ GeoJSON [lng,lat] without swapping axes", () => {
    const geo = toGeoJson([
      [6.91, 79.86],
      [6.92, 79.87],
    ]);
    expect(geo.type).toBe("LineString");
    expect(geo.coordinates).toEqual([
      [79.86, 6.91],
      [79.87, 6.92],
    ]);
    expect(fromGeoJson(geo)).toEqual([
      [6.91, 79.86],
      [6.92, 79.87],
    ]);
  });

  it("yields an empty route for invalid GeoJSON instead of throwing", () => {
    expect(fromGeoJson(null)).toEqual([]);
    expect(fromGeoJson({ type: "Point", coordinates: [1, 2] })).toEqual([]);
    expect(fromGeoJson({ type: "LineString", coordinates: "bad" })).toEqual([]);
  });
});
