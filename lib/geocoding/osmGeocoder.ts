// Server-side Nominatim wrapper. Usage policy: max 1 req/s, no autocomplete,
// a descriptive User-Agent is required. We enforce per-user rate limits at
// the API route layer (/api/geocode).
import {
  GeocodingError,
  type GeocodeResult,
  type GeocodingProvider,
} from "./geocodingProvider";

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

export function createOsmGeocoder(): GeocodingProvider {
  return {
    name: "nominatim",
    async search(query: string): Promise<GeocodeResult[]> {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", query);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "5");
      let res: Response;
      try {
        res = await fetch(url, {
          headers: {
            "User-Agent": "RapidRoute-MVP/1.0 (emergency coordination demo)",
          },
          signal: AbortSignal.timeout(8000),
        });
      } catch {
        throw new GeocodingError("Geocoding service unreachable.");
      }
      if (!res.ok)
        throw new GeocodingError(
          `Geocoding service error (HTTP ${res.status}).`,
        );
      const rows = (await res.json()) as NominatimResult[];
      return rows
        .map((r) => ({
          label: r.display_name,
          latitude: Number(r.lat),
          longitude: Number(r.lon),
        }))
        .filter(
          (r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude),
        );
    },
  };
}
