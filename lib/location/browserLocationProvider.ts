import type {
  LocationError,
  LocationFix,
  LocationProvider,
} from "./locationProvider";

function mapError(err: GeolocationPositionError): LocationError {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return {
        code: "PERMISSION_DENIED",
        message:
          "Location permission denied — enable GPS access for this site in your browser settings.",
      };
    case err.POSITION_UNAVAILABLE:
      return {
        code: "POSITION_UNAVAILABLE",
        message:
          "Location unavailable — check that GPS/location services are enabled on the device.",
      };
    case err.TIMEOUT:
      return {
        code: "TIMEOUT",
        message: "GPS timed out — the system keeps retrying automatically.",
      };
    default:
      return {
        code: "POSITION_UNAVAILABLE",
        message: err.message || "Unknown geolocation error.",
      };
  }
}

export function createBrowserLocationProvider(): LocationProvider {
  let watchId: number | null = null;
  return {
    name: "browser-geolocation",
    isSupported: () =>
      typeof navigator !== "undefined" && "geolocation" in navigator,
    watch(onFix, onError) {
      watchId = navigator.geolocation.watchPosition(
        (pos) =>
          onFix({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? 0,
            speed: pos.coords.speed ?? null,
            heading: pos.coords.heading ?? null,
            timestamp: pos.timestamp,
          }),
        (err) => onError(mapError(err)),
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
      );
    },
    clear() {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
    },
  };
}
