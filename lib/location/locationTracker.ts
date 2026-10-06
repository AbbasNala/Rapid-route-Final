// Throttling layer over a LocationProvider: a fix is only accepted when the
// time-based OR distance-based threshold is exceeded (first fix always passes).
// Thresholds come from env (NEXT_PUBLIC_GPS_MIN_INTERVAL_MS / _MIN_DISTANCE_M).
import { bearingDegrees, haversineMeters } from "@/lib/geofencing/haversine";
import type {
  LocationError,
  LocationFix,
  LocationProvider,
} from "./locationProvider";

export interface TrackerConfig {
  minIntervalMs?: number;
  minDistanceM?: number;
}
export type TrackerStatus = "idle" | "waiting" | "tracking" | "error";

export interface TrackerState {
  status: TrackerStatus;
  lastFix: LocationFix | null;
  lastAcceptedAt: number | null;
  lastError: LocationError | null;
  acceptedCount: number;
}

export interface TrackerMeta {
  computedHeading: number | null;
  sincePrevMs: number | null;
}

const DEFAULTS: Required<TrackerConfig> = {
  minIntervalMs: 5000,
  minDistanceM: 15,
};

export class LocationTracker {
  private cfg: Required<TrackerConfig>;
  private state: TrackerState = {
    status: "idle",
    lastFix: null,
    lastAcceptedAt: null,
    lastError: null,
    acceptedCount: 0,
  };
  private listeners = new Set<(s: TrackerState) => void>();
  private lastAccepted: LocationFix | null = null;
  private running = false;

  constructor(
    private provider: LocationProvider,
    config: TrackerConfig,
    private onAccepted: (fix: LocationFix, meta: TrackerMeta) => void,
  ) {
    this.cfg = { ...DEFAULTS, ...config };
  }

  subscribe(fn: (s: TrackerState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => {
      this.listeners.delete(fn);
    };
  }

  getState(): TrackerState {
    return this.state;
  }

  private set(patch: Partial<TrackerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  start() {
    if (this.running) return;
    if (!this.provider.isSupported()) {
      this.set({
        status: "error",
        lastError: {
          code: "NOT_SUPPORTED",
          message: "Geolocation is not supported by this browser.",
        },
      });
      return;
    }
    this.running = true;
    this.set({ status: "waiting" });
    this.provider.watch(
      (fix) => this.handleFix(fix),
      (err) => this.set({ status: "error", lastError: err }),
    );
  }

  stop() {
    this.running = false;
    this.provider.clear();
    this.set({ status: "idle" });
  }

  private handleFix(fix: LocationFix) {
    this.set({ lastFix: fix, lastError: null, status: "tracking" });
    const last = this.lastAccepted;
    const since = this.state.lastAcceptedAt
      ? fix.timestamp - this.state.lastAcceptedAt
      : Infinity;
    const moved = last ? haversineMeters(last, fix) : Infinity;
    const first = this.state.acceptedCount === 0;
    if (
      !first &&
      since < this.cfg.minIntervalMs &&
      moved < this.cfg.minDistanceM
    )
      return;

    const computedHeading =
      fix.heading == null && last ? bearingDegrees(last, fix) : null;
    this.lastAccepted = fix;
    this.set({
      lastAcceptedAt: fix.timestamp,
      acceptedCount: this.state.acceptedCount + 1,
    });
    this.onAccepted(fix, {
      computedHeading,
      sincePrevMs: Number.isFinite(since) ? since : null,
    });
  }
}
