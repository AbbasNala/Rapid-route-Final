// Route geometry helpers: local projection onto a polyline, remaining distance,
// interpolated ETA, route-corridor junction detection, and GeoJSON conversion.
import { haversineMeters, type LatLon } from "@/lib/geofencing/haversine";

/** Internal route representation: [latitude, longitude] pairs (Leaflet order). */
export type RoutePoint = [number, number];

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Equirectangular local frame: metres of `to` relative to `from`. City-scale accurate. */
function localMeters(from: RoutePoint, to: RoutePoint): [number, number] {
  const latRef = rad((from[0] + to[0]) / 2);
  return [
    rad(to[1] - from[1]) * Math.cos(latRef) * R,
    rad(to[0] - from[0]) * R,
  ];
}

export interface RouteProgress {
  alongM: number;
  totalM: number;
  fromRouteM: number;
}

export function routeProgress(
  route: RoutePoint[],
  point: RoutePoint,
): RouteProgress {
  if (route.length < 2) return { alongM: 0, totalM: 0, fromRouteM: Infinity };
  let cumulative = 0,
    bestAlong = 0,
    bestFrom = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i],
      b = route[i + 1];
    const [bx, by] = localMeters(a, b);
    const [px, py] = localMeters(a, point);
    const len2 = bx * bx + by * by;
    const t =
      len2 > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0;
    const fromM = Math.hypot(px - t * bx, py - t * by);
    const segLen = Math.sqrt(len2);
    if (fromM < bestFrom) {
      bestFrom = fromM;
      bestAlong = cumulative + t * segLen;
    }
    cumulative += segLen;
  }
  return { alongM: bestAlong, totalM: cumulative, fromRouteM: bestFrom };
}

/** Remaining distance + interpolated ETA + distance off the planned polyline. */
export function routeEta(
  route: RoutePoint[],
  point: RoutePoint,
  totalDurationS: number | null,
): { remainingM: number | null; etaS: number | null; fromRouteM: number } {
  if (route.length < 2)
    return { remainingM: null, etaS: null, fromRouteM: Infinity };
  const p = routeProgress(route, point);
  const remainingM = Math.max(0, p.totalM - p.alongM);
  const etaS =
    totalDurationS != null && p.totalM > 0
      ? Math.max(0, totalDurationS * (1 - p.alongM / p.totalM))
      : null;
  return { remainingM, etaS, fromRouteM: p.fromRouteM };
}

/** Junctions lying within `corridorM` of the route, ordered along the route. */
export function junctionsWithRouteDistance<T extends LatLon & { id: string }>(
  route: RoutePoint[],
  junctions: T[],
  corridorM = 300,
): Array<{ junction: T; alongM: number; fromRouteM: number }> {
  return junctions
    .map((j) => {
      const p = routeProgress(route, [j.latitude, j.longitude]);
      return { junction: j, alongM: p.alongM, fromRouteM: p.fromRouteM };
    })
    .filter((x) => x.fromRouteM <= corridorM)
    .sort((a, b) => a.alongM - b.alongM);
}

/** [lat,lng][] → GeoJSON LineString ([lng,lat] per GeoJSON spec). */
export function toGeoJson(route: RoutePoint[]): {
  type: "LineString";
  coordinates: [number, number][];
} {
  return {
    type: "LineString",
    coordinates: route.map(([lat, lng]) => [lng, lat]),
  };
}

/** GeoJSON ([lng,lat]) → Leaflet order ([lat,lng]). Invalid input yields []. */
export function fromGeoJson(g: unknown): RoutePoint[] {
  const geo = g as { type?: string; coordinates?: unknown } | null;
  if (!geo || geo.type !== "LineString" || !Array.isArray(geo.coordinates))
    return [];
  return geo.coordinates
    .filter((c): c is [number, number] => Array.isArray(c) && c.length >= 2)
    .map(([lng, lat]) => [lat, lng] as RoutePoint);
}

/** Straight-line distance helper for list ordering (never used for routing). */
export function nearestDistance(
  junctions: LatLon[],
  point: LatLon,
): number | null {
  if (!junctions.length) return null;
  return Math.min(...junctions.map((j) => haversineMeters(point, j)));
}
