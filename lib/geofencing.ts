import type { Coord, Junction, JunctionMilestone } from "@/types";

const R_EARTH_M = 6371000;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres (Haversine). */
export function haversineM(a: Coord, b: Coord): number {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearingDeg(a: Coord, b: Coord): number {
  const f1 = rad(a[0]);
  const f2 = rad(b[0]);
  const dl = rad(b[1] - a[1]);
  const y = Math.sin(dl) * Math.cos(f2);
  const x =
    Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return (Math.atan2(y, x) * 180) / Math.PI + (360 % 360);
}

export function lerpCoord(a: Coord, b: Coord, t: number): Coord {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Interpolate extra points so the polyline has a point roughly every `stepM`. */
export function densify(waypoints: Coord[], stepM = 70): Coord[] {
  if (waypoints.length < 2) return [...waypoints];
  const out: Coord[] = [waypoints[0]];
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    const seg = haversineM(a, b);
    const n = Math.max(1, Math.ceil(seg / stepM));
    for (let k = 1; k <= n; k++) out.push(lerpCoord(a, b, k / n));
  }
  return out;
}

export function cumulative(coords: Coord[]): number[] {
  const cum = [0];
  for (let i = 1; i < coords.length; i++)
    cum.push(cum[i - 1] + haversineM(coords[i - 1], coords[i]));
  return cum;
}

export function pointAtDistance(
  coords: Coord[],
  cum: number[],
  dist: number,
): { coord: Coord; heading: number } {
  const total = cum[cum.length - 1] || 0;
  const d = Math.min(Math.max(dist, 0), total);
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const segLen = cum[i] - cum[i - 1] || 1;
  const t = (d - cum[i - 1]) / segLen;
  return {
    coord: lerpCoord(coords[i - 1], coords[i], t),
    heading: bearingDeg(coords[i - 1], coords[i]),
  };
}

/** Distance-along-route of the vertex nearest to an arbitrary point (GPS projection). */
export function nearestOnRoute(
  coords: Coord[],
  cum: number[],
  p: Coord,
): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = haversineM(coords[i], p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return cum[best];
}

/** Junctions that sit within a 300 m corridor of the route, keyed by distance along it. */
export function computeMilestones(
  route: Coord[],
  junctions: Junction[],
): JunctionMilestone[] {
  const cum = cumulative(route);
  const list: JunctionMilestone[] = [];
  for (const j of junctions) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < route.length; i++) {
      const d = haversineM(route[i], [j.lat, j.lng]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0 && bestD <= 300)
      list.push({ junctionId: j.id, atM: cum[best] });
  }
  return list.sort((a, b) => a.atM - b.atM);
}
