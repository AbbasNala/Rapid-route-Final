// Domain types mirroring the Supabase schema (see supabase/migrations).
export type UserRole = "ambulance_driver" | "traffic_police" | "admin";
export type AmbulanceStatus = "AVAILABLE" | "ON_EMERGENCY" | "MAINTENANCE";
export type JourneyStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";
export type AlertStatus = "PENDING" | "ACKNOWLEDGED" | "CLEARED";
export type IncidentType =
  | "ACCIDENT"
  | "ROAD_BLOCKED"
  | "HEAVY_TRAFFIC"
  | "CONSTRUCTION"
  | "OTHER";
export type IncidentStatus = "ACTIVE" | "RESOLVED";

/** GeoJSON LineString — GeoJSON convention: coordinates are [lng, lat]. */
export interface GeoJsonLineString {
  type: "LineString";
  coordinates: [number, number][];
}

export interface UsersRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
}
export interface AmbulancesRow {
  id: string;
  vehicle_number: string;
  driver_id: string | null;
  status: AmbulanceStatus;
  created_at: string;
}
export interface HospitalsRow {
  id: string;
  name: string;
  address: string;
  phone: string;
  emergency_capability: string | null;
  latitude: number;
  longitude: number;
  created_at: string;
}
export interface JunctionsRow {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  geofence_radius: number;
  created_at: string;
}
export interface JourneysRow {
  id: string;
  ambulance_id: string;
  destination_hospital_id: string;
  status: JourneyStatus;
  route_geometry: GeoJsonLineString | null;
  distance: number | null;
  estimated_duration: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}
export interface LocationUpdateRow {
  id: number;
  journey_id: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  timestamp: string;
}
export interface AlertsRow {
  id: string;
  journey_id: string;
  ambulance_id: string;
  junction_id: string;
  alert_type: string;
  status: AlertStatus;
  eta_seconds: number | null;
  distance_m: number | null;
  created_at: string;
  acknowledged_at: string | null;
  cleared_at: string | null;
  acknowledged_by: string | null;
}
export interface RoadIncidentsRow {
  id: string;
  journey_id: string | null;
  reported_by: string;
  type: IncidentType;
  description: string;
  latitude: number;
  longitude: number;
  status: IncidentStatus;
  created_at: string;
}
export interface AuditLogRow {
  id: number;
  actor: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}
