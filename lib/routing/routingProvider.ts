// Routing abstraction. The rest of the app talks to this interface only —
// providers (openrouteservice, OSRM demo, future GraphHopper/Valhalla self-host)
// are swappable without touching feature code.
export interface LatLngInput {
  latitude: number;
  longitude: number;
}

export interface DrivingRoute {
  geometry: [number, number][]; // [lat, lng] — Leaflet order
  distanceM: number;
  durationS: number;
  provider: string;
  warning?: string;
}

export type RoutingErrorCode = "INVALID_INPUT" | "API_ERROR" | "NO_ROUTE";

export class RoutingError extends Error {
  constructor(
    public code: RoutingErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface RoutingProvider {
  readonly name: string;
  getRoute(
    origin: LatLngInput,
    destination: LatLngInput,
  ): Promise<DrivingRoute>;
}

export function validateEndpoints(
  origin: LatLngInput,
  destination: LatLngInput,
): void {
  for (const [label, p] of [
    ["origin", origin],
    ["destination", destination],
  ] as const) {
    if (
      !Number.isFinite(p.latitude) ||
      !Number.isFinite(p.longitude) ||
      p.latitude < -90 ||
      p.latitude > 90 ||
      p.longitude < -180 ||
      p.longitude > 180
    ) {
      throw new RoutingError("INVALID_INPUT", `Invalid ${label} coordinates.`);
    }
  }
}

/**
 * Server-side factory: uses openrouteservice when OPENROUTESERVICE_API_KEY is set,
 * otherwise the free public OSRM demo server (clearly flagged as test-only).
 */
export function getRoutingProvider(): RoutingProvider {
  const key = process.env.OPENROUTESERVICE_API_KEY;
  if (key) {
    const { createOpenRouteServiceProvider } =
      require("./openRouteService") as {
        createOpenRouteServiceProvider: (k: string) => RoutingProvider;
      };
    return createOpenRouteServiceProvider(key);
  }
  const { createOsrmDemoProvider } = require("./osrmRoute") as {
    createOsrmDemoProvider: () => RoutingProvider;
  };
  return createOsrmDemoProvider();
}
