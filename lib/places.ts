import type { Coord, Hospital, Junction } from "@/types";
import { cumulative, haversineM } from "./geofencing";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter", // mirror fallback
];

async function overpass(query: string): Promise<any[] | null> {
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const json = await res.json();
      if (Array.isArray(json?.elements)) return json.elements;
    } catch {
      // try the next mirror
    }
  }
  return null;
}

/** Real nearby hospitals from OpenStreetMap (Overpass — free, no key, hospitals only). */
export async function fetchNearbyHospitals(
  lat: number,
  lng: number,
  radiusM = 7000,
): Promise<Hospital[]> {
  const q = `[out:json][timeout:20];(node["amenity"="hospital"](around:${radiusM},${lat},${lng});way["amenity"="hospital"](around:${radiusM},${lat},${lng}););out center tags;`;
  const elements = await overpass(q);
  if (!elements) return [];
  const out: Hospital[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags["name"] || tags["name:en"];
    if (!name) continue; // skip unnamed entries
    const elLat = el.lat ?? el.center?.lat;
    const elLng = el.lon ?? el.center?.lon;
    if (typeof elLat !== "number" || typeof elLng !== "number") continue;
    const addressParts = [
      tags["addr:housenumber"],
      tags["addr:street"],
      tags["addr:suburb"],
    ].filter(Boolean);
    out.push({
      id: `osm-${el.type}-${el.id}`,
      name,
      lat: elLat,
      lng: elLng,
      address: addressParts.join(", ") || "OpenStreetMap · amenity: hospital",
    });
  }
  out.sort(
    (a, b) =>
      haversineM([lat, lng], [a.lat, a.lng]) -
      haversineM([lat, lng], [b.lat, b.lng]),
  );
  return out.slice(0, 25);
}

/** Real traffic-signal junctions that sit on the route (Overpass — free, no key). */
export async function fetchRouteJunctions(
  route: Coord[],
  maxCount = 8,
): Promise<Junction[]> {
  if (route.length < 2) return [];
  let s = 90,
    w = 180,
    n = -90,
    e = -180;
  for (const [la, ln] of route) {
    s = Math.min(s, la);
    n = Math.max(n, la);
    w = Math.min(w, ln);
    e = Math.max(e, ln);
  }
  const pad = 0.004;
  const q = `[out:json][timeout:25];node["highway"="traffic_signals"](${s - pad},${w - pad},${n + pad},${e + pad});out;`;
  const elements = await overpass(q);
  if (!elements) return [];

  const cum = cumulative(route);
  type Cand = { atM: number; el: any };
  const cands: Cand[] = [];
  for (const el of elements) {
    if (typeof el.lat !== "number" || typeof el.lon !== "number") continue;
    let best = -1,
      bestD = Infinity;
    for (let i = 0; i < route.length; i++) {
      const d = haversineM(route[i], [el.lat, el.lon]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (bestD > 400) continue; // must sit on/near the route
    cands.push({ atM: cum[best], el });
  }
  cands.sort((a, b) => a.atM - b.atM);

  const kept: Cand[] = [];
  for (const c of cands) {
    if (kept.length && c.atM - kept[kept.length - 1].atM < 1000) continue; // space alerts out
    kept.push(c);
    if (kept.length >= maxCount) break;
  }
  return kept.map((c, i) => {
    const tags = c.el.tags ?? {};
    return {
      id: `osm-j-${c.el.id}`,
      name: tags["name"] || tags["name:en"] || `Signal ${i + 1}`,
      lat: c.el.lat,
      lng: c.el.lon,
      alertRadius: 500,
      status: "monitoring" as const,
      traffic: "medium" as const,
      officer: "Zone duty officer",
      officerPhone: "Control room",
    };
  });
}
