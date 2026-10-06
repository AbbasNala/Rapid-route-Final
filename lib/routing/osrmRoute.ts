// Keyless fallback: the public OSRM demo server (router.project-osrm.org).
// Intended for local testing only — no SLA, may be rate limited. The UI labels
// this provider explicitly so it is never mistaken for production routing.
import {
  validateEndpoints,
  RoutingError,
  type DrivingRoute,
  type LatLngInput,
  type RoutingProvider,
} from "./routingProvider";

interface OsrmResponse {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: { coordinates?: [number, number][] };
  }>;
}

export function createOsrmDemoProvider(): RoutingProvider {
  return {
    name: "osrm-demo",
    async getRoute(
      origin: LatLngInput,
      destination: LatLngInput,
    ): Promise<DrivingRoute> {
      validateEndpoints(origin, destination);
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}` +
        `?overview=full&geometries=geojson`;
      let res: Response;
      try {
        res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      } catch {
        throw new RoutingError(
          "API_ERROR",
          "Routing service unreachable — check network connectivity.",
        );
      }
      if (!res.ok)
        throw new RoutingError(
          "API_ERROR",
          `Routing service error (HTTP ${res.status}).`,
        );
      const data = (await res.json()) as OsrmResponse;
      const route = data.routes?.[0];
      const coords = route?.geometry?.coordinates;
      if (
        data.code !== "Ok" ||
        !coords ||
        coords.length < 2 ||
        !Number.isFinite(route!.distance)
      ) {
        throw new RoutingError(
          "NO_ROUTE",
          "No driving route found between these points.",
        );
      }
      return {
        geometry: coords.map(([lng, lat]) => [lat, lng]),
        distanceM: route!.distance!,
        durationS: route!.duration ?? 0,
        provider: "osrm-demo",
        warning:
          "Public OSRM demo server (no API key configured) — testing only.",
      };
    },
  };
}
