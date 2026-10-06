export interface LatLon {
  latitude: number;
  longitude: number;
}

const R = 6371000; // mean Earth radius, metres
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres between two coordinates. */
export function haversineMeters(a: LatLon, b: LatLon): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Initial bearing from a → b, degrees clockwise from true north (0–360). */
export function bearingDegrees(a: LatLon, b: LatLon): number {
  const φ1 = rad(a.latitude),
    φ2 = rad(b.latitude),
    Δλ = rad(b.longitude - a.longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}
