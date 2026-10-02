export type Role = "ambulance_driver" | "traffic_police";
export type Coord = [number, number]; // [lat, lng]

export type JourneyStatus = "active" | "completed" | "cancelled";
export type AlertStatus = "pending" | "acknowledged" | "cleared";
export type JunctionStatus = "monitoring" | "preparing" | "cleared";
export type TrafficLevel = "low" | "medium" | "high";
export type RouteSource = "ors" | "demo";
export type RoadblockType =
  | "accident"
  | "road_blocked"
  | "congestion"
  | "other";

export interface Session {
  role: Role;
  name: string;
  ambulanceId?: string;
  zone?: string;
}

export interface Hospital {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
}

export interface Junction {
  id: string;
  name: string;
  lat: number;
  lng: number;
  alertRadius: number; // geofence radius in metres
  status: JunctionStatus;
  traffic: TrafficLevel;
  officer: string;
  officerPhone: string;
}

export interface JunctionMilestone {
  junctionId: string;
  atM: number; // distance along the route where the junction sits
}

export interface PreviewRoute {
  coords: Coord[];
  distanceM: number;
  durationSec: number;
  source: RouteSource;
  milestones: JunctionMilestone[];
  speedMps: number;
}

export interface Ambulance {
  id: string;
  number: string;
  driverName: string;
  status: "available" | "enroute";
  lat: number;
  lng: number;
  heading?: number;
  activeJourneyId: string | null;
  selectedHospitalId: string | null;
  previewRoute: PreviewRoute | null;
  previewLoading: boolean;
  lastCompletedJourneyId: string | null;
}

export interface Journey {
  id: string;
  ambulanceId: string;
  ambulanceNumber: string;
  driverName: string;
  hospitalId: string;
  hospitalName: string;
  route: Coord[];
  routeSource: RouteSource;
  routeLengthM: number;
  traveledM: number;
  speedMps: number; // metres/sec used for ETA math (real-world estimate)
  milestones: JunctionMilestone[];
  status: JourneyStatus;
  startedAt: number;
  completedAt?: number;
  durationSec?: number;
}

export interface Alert {
  id: string;
  journeyId: string;
  ambulanceId: string;
  ambulanceNumber: string;
  junctionId: string;
  junctionName: string;
  hospitalName: string;
  driverName: string;
  etaSec: number;
  status: AlertStatus;
  traffic: TrafficLevel;
  createdAt: number;
  acknowledgedAt?: number;
  clearedAt?: number;
  officer?: string;
}

export interface RoadblockReport {
  id: string;
  ambulanceId: string;
  ambulanceNumber: string;
  type: RoadblockType;
  note?: string;
  lat: number;
  lng: number;
  createdAt: number;
  junctionId?: string;
}

export interface AppState {
  session: Session | null;
  hospitals: Hospital[];
  junctions: Junction[];
  ambulances: Ambulance[];
  journeys: Journey[];
  alerts: Alert[];
  roadblocks: RoadblockReport[];
  completedToday: number;
  live: boolean; // ← add
  hospitalsLoading: boolean; // ← add
  sim: {
    active: boolean;
    speed: number;
    lastTick: number;
    ownerTab: string | null;
  };
  connection: {
    mode: "local" | "supabase";
    status: "offline" | "connecting" | "connected";
  };
}
