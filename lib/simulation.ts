import { bearingDeg, cumulative, pointAtDistance } from "./geofencing";
import type { Journey } from "@/types";

/** Real-world reference speed used for ETA math (~40 km/h). */
export const BASE_SPEED_MPS = 11.1;

export interface LocationProvider {
  readonly name: string;
  start(): void;
  stop(): void;
}

export interface SimProviderOptions {
  getJourney: () => Journey | undefined;
  isRunning: () => boolean;
  speedMultiplier: () => number;
  onPosition: (
    lat: number,
    lng: number,
    traveledM: number,
    heading: number,
  ) => void;
  onFinished: () => void;
}

/**
 * Drives an ambulance along its route at BASE_SPEED × multiplier.
 * Movement is simulated; ETA figures stay in real-world time.
 */
export class SimulationLocationProvider implements LocationProvider {
  readonly name = "simulation";
  private timer: ReturnType<typeof setInterval> | null = null;
  private cum: number[] | null = null;

  constructor(private opts: SimProviderOptions) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick() {
    if (!this.opts.isRunning()) {
      this.stop();
      this.opts.onFinished();
      return;
    }
    const journey = this.opts.getJourney();
    if (!journey || journey.status !== "active") {
      this.stop();
      this.opts.onFinished();
      return;
    }
    if (!this.cum || this.cum.length !== journey.route.length)
      this.cum = cumulative(journey.route);
    const next =
      journey.traveledM + BASE_SPEED_MPS * this.opts.speedMultiplier();
    if (next >= journey.routeLengthM - 20) {
      const end = journey.route[journey.route.length - 1];
      const prev = journey.route[Math.max(0, journey.route.length - 2)];
      this.opts.onPosition(
        end[0],
        end[1],
        journey.routeLengthM,
        bearingDeg(prev, end),
      );
      this.stop();
      this.opts.onFinished();
      return;
    }
    const p = pointAtDistance(journey.route, this.cum, next);
    this.opts.onPosition(p.coord[0], p.coord[1], next, p.heading);
  }
}

export interface GpsProviderOptions {
  onUpdate: (lat: number, lng: number, heading: number | null) => void;
  onError: (message: string) => void;
}

/** Real device GPS — replaces simulation when permission is granted. */
export class BrowserGeolocationProvider implements LocationProvider {
  readonly name = "browser-gps";
  private watchId: number | null = null;

  constructor(private opts: GpsProviderOptions) {}

  start() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      this.opts.onError("Geolocation is not supported in this browser");
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (pos) =>
        this.opts.onUpdate(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.heading ?? null,
        ),
      (err) =>
        this.opts.onError(
          err.code === 1 ? "GPS permission denied" : "GPS signal unavailable",
        ),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 12000 },
    );
  }

  stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
}
