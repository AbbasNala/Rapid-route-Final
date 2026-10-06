// Geocoding abstraction, separate from routing. Used only for occasional,
// explicit lookups (e.g. admin adding a hospital by address) — never for
// high-frequency autocomplete. Hospital selection reads the local database.
export interface GeocodeResult {
  label: string;
  latitude: number;
  longitude: number;
}

export class GeocodingError extends Error {}

export interface GeocodingProvider {
  readonly name: string;
  search(query: string): Promise<GeocodeResult[]>;
}

export function getGeocodingProvider(): GeocodingProvider {
  const { createOsmGeocoder } = require("./osmGeocoder") as {
    createOsmGeocoder: () => GeocodingProvider;
  };
  return createOsmGeocoder();
}
