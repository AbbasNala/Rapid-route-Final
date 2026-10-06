// Location provider abstraction. The browser implementation uses the Geolocation
// API; a native mobile GPS provider (e.g. Capacitor/Expo plugin) can implement
// this interface later without touching feature code.
export interface LocationFix {
  latitude: number;
  longitude: number;
  accuracy: number; // metres (68% confidence)
  speed: number | null; // m/s
  heading: number | null; // degrees from true north
  timestamp: number; // epoch ms
}

export type LocationErrorCode =
  | "PERMISSION_DENIED"
  | "POSITION_UNAVAILABLE"
  | "TIMEOUT"
  | "NOT_SUPPORTED";

export interface LocationError {
  code: LocationErrorCode;
  message: string;
}

export interface LocationProvider {
  readonly name: string;
  isSupported(): boolean;
  watch(
    onFix: (fix: LocationFix) => void,
    onError: (error: LocationError) => void,
  ): void;
  clear(): void;
}
