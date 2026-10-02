import type { Coord, RouteSource } from "@/types";
import { cumulative, densify, haversineM, lerpCoord } from "./geofencing";
import { DEMO_ROUTE_BASE, DEMO_ROUTE_WAYPOINTS } from "./seed";

export interface RouteResult {
  coords: Coord[];
  distanceM: number;
  durationSec: number;
  source: RouteSource;
  speedMps: number;
}

const ORS_URL =
  "https://api.openrouteservice.org/v2/directions/driving-car/geojson";

/**
 * Driving route via openrouteservice. If no API key is configured, or the call
 * fails / times out, we return a clearly-labelled demo route so the app keeps working.
 */
export async function fetchDrivingRoute(
  start: Coord,
  end: Coord,
  demoHospitalId?: string,
): Promise<RouteResult> {
  const key = process.env.NEXT_PUBLIC_ORS_API_KEY?.trim();
  if (key) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 7000);
      const res = await fetch(ORS_URL, {
        method: "POST",
        headers: {
          Authorization: key,
          "Content-Type": "application/json",
          Accept: "application/geo+json",
        },
        body: JSON.stringify({
          coordinates: [
            [start[1], start[0]],
            [end[1], end[0]],
          ],
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const geo = await res.json();
        const line = geo?.features?.[0]?.geometry?.coordinates as
          | [number, number][]
          | undefined;
        if (Array.isArray(line) && line.length > 1) {
          const coords: Coord[] = line.map((c) => [c[1], c[0]]);
          const cum = cumulative(coords);
          const distanceM: number =
            geo?.features?.[0]?.properties?.summary?.distance ??
            cum[cum.length - 1];
          const durationSec: number =
            geo?.features?.[0]?.properties?.summary?.duration ??
            distanceM / 11.1;
          return {
            coords,
            distanceM,
            durationSec,
            source: "ors",
            speedMps: distanceM / Math.max(1, durationSec),
          };
        }
      }
    } catch {
      // network / timeout / malformed response → demo fallback
    }
  }
  return demoRoute(start, end, demoHospitalId);
}

function demoRoute(start: Coord, end: Coord, hospitalId?: string): RouteResult {
  let waypoints: Coord[];
  const authored = hospitalId ? DEMO_ROUTE_WAYPOINTS[hospitalId] : undefined;
  if (authored && haversineM(start, DEMO_ROUTE_BASE) < 600) {
    // predefined Bengaluru demo corridor (passes through the seeded junctions)
    waypoints = [start, ...authored.slice(1)];
  } else {
    // generic bendy fallback between any two points
    const dLat = end[0] - start[0];
    const dLng = end[1] - start[1];
    const p1: Coord = [
      start[0] + 0.35 * dLat + 0.25 * dLng,
      start[1] + 0.35 * dLng - 0.25 * dLat,
    ];
    const p2: Coord = [
      start[0] + 0.72 * dLat - 0.15 * dLng,
      start[1] + 0.72 * dLng + 0.15 * dLat,
    ];
    waypoints = [start, p1, p2, lerpCoord(end, end, 1)];
    waypoints[3] = end;
  }
  const coords = densify(waypoints);
  const cum = cumulative(coords);
  const distanceM = cum[cum.length - 1];
  const durationSec = distanceM / 11.1; // ~40 km/h nominal
  return { coords, distanceM, durationSec, source: "demo", speedMps: 11.1 };
}
