import polyline from "@mapbox/polyline";

import {
  validateEndpoints,
  RoutingError,
  type DrivingRoute,
  type LatLngInput,
  type RoutingProvider,
} from "./routingProvider";

interface OrsRoute {
  summary?: {
    distance?: number;
    duration?: number;
  };
  geometry?: string;
}

interface OrsResponse {
  routes?: OrsRoute[];
}

export function createOpenRouteServiceProvider(
  apiKey: string,
): RoutingProvider {
  return {
    name: "openrouteservice",

    async getRoute(
      origin: LatLngInput,
      destination: LatLngInput,
    ): Promise<DrivingRoute> {
      validateEndpoints(origin, destination);

      let res: Response;

      try {
        res = await fetch(
          "https://api.heigit.org/openrouteservice/v2/directions/driving-car",
          {
            method: "POST",
            headers: {
              Authorization: apiKey,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              coordinates: [
                [origin.longitude, origin.latitude],
                [destination.longitude, destination.latitude],
              ],
            }),
            signal: AbortSignal.timeout(10000),
          },
        );
      } catch {
        throw new RoutingError(
          "API_ERROR",
          "Routing service unreachable — check network connectivity.",
        );
      }

      if (res.status === 401 || res.status === 403) {
        throw new RoutingError(
          "API_ERROR",
          "openrouteservice rejected the API key. Check OPENROUTESERVICE_API_KEY.",
        );
      }

      if (res.status === 429) {
        throw new RoutingError(
          "API_ERROR",
          "openrouteservice free-tier rate limit reached. Try again in a moment.",
        );
      }

      if (!res.ok) {
        const body = await res.text();

        throw new RoutingError(
          "API_ERROR",
          `ORS HTTP ${res.status} | URL: ${res.url} | BODY: ${body}`,
        );
      }

      const data = (await res.json()) as OrsResponse;
      const route = data.routes?.[0];

      if (
        !route ||
        !route.geometry ||
        !route.summary ||
        route.summary.distance === undefined ||
        route.summary.duration === undefined
      ) {
        throw new RoutingError(
          "NO_ROUTE",
          "No driving route found between these points.",
        );
      }

      let coordinates: [number, number][];

      try {
        coordinates = polyline
          .decode(route.geometry, 5)
          .map(([lat, lng]) => [lat, lng]);
      } catch {
        throw new RoutingError(
          "NO_ROUTE",
          "Unable to decode the route geometry.",
        );
      }

      return {
        geometry: coordinates,
        distanceM: route.summary.distance,
        durationS: route.summary.duration,
        provider: "openrouteservice",
      };
    },
  };
}
