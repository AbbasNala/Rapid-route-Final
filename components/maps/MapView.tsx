"use client";
// Leaflet + React Leaflet map with OSM-data tiles (CARTO dark rendering — free
// tier, properly attributed). Swap TILE_URL to the standard OSM raster tiles
// (comment below) if you prefer the light basemap or want to avoid CARTO.
import { useEffect, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { cn } from "@/lib/utils";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

export type JunctionMapState =
  | "monitoring"
  | "approaching"
  | "notified"
  | "cleared";
const JUNCTION_COLORS: Record<JunctionMapState, string> = {
  monitoring: "#FFB224",
  approaching: "#FF5757",
  notified: "#FFB224",
  cleared: "#3DD68C",
};
const JUNCTION_LABELS: Record<JunctionMapState, string> = {
  monitoring: "Monitoring",
  approaching: "Ambulance approaching",
  notified: "Traffic team notified",
  cleared: "Recently cleared",
};

export interface MapAmbulance {
  id: string;
  position: [number, number];
  heading?: number | null;
  label: string;
  active: boolean;
  speedKmh?: number | null;
  lastUpdateMs?: number;
  destination?: string;
}
export interface MapJunction {
  id: string;
  position: [number, number];
  radiusM: number;
  label: string;
  state: JunctionMapState;
}
export interface MapHospital {
  id: string;
  position: [number, number];
  label: string;
}
export interface MapIncident {
  id: string;
  position: [number, number];
  label: string;
}
export interface MapRouteLayer {
  id: string;
  points: [number, number][];
  highlight?: boolean;
}

export interface MapViewProps {
  className?: string;
  ambulances?: MapAmbulance[];
  junctions?: MapJunction[];
  hospitals?: MapHospital[];
  incidents?: MapIncident[];
  routes?: MapRouteLayer[];
  followId?: string | null;
  fit?: { token: number; bounds: [number, number][] } | null;
  onMapClick?: (lat: number, lng: number) => void;
}

function ambulanceIcon(
  heading: number | null | undefined,
  active: boolean,
): L.DivIcon {
  return L.divIcon({
    className: "rr-amb-icon",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<div style="width:36px;height:36px;border-radius:10px;background:${active ? "#E5484D" : "#3A4C61"};border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center">
      <div style="transform:rotate(${heading ?? 0}deg);line-height:0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l7 14H5z" fill="rgba(255,255,255,.15)"/></svg>
      </div></div>`,
  });
}
function hospitalIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<div style="width:26px;height:26px;border-radius:50%;background:#fff;border:2px solid #3DD68C;display:flex;align-items:center;justify-content:center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#0F7B4C"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></svg></div>`,
  });
}
function incidentIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<div style="width:26px;height:26px;display:flex;align-items:center;justify-content:center">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="#FFB224" stroke="#0D131B" stroke-width="1"><path d="M12 3L1 21h22z"/><text x="12" y="18" text-anchor="middle" font-size="11" font-weight="bold" fill="#0D131B">!</text></svg></div>`,
  });
}

function Follow({
  id,
  ambulances,
}: {
  id: string;
  ambulances: MapAmbulance[];
}) {
  const map = useMap();
  const t = ambulances.find((a) => a.id === id);
  const lat = t?.position[0],
    lng = t?.position[1];
  useEffect(() => {
    if (t && lat != null && lng != null) {
      map.setView([lat, lng], Math.max(map.getZoom(), 15), { animate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);
  return null;
}

function Fitter({ fit }: { fit: NonNullable<MapViewProps["fit"]> }) {
  const map = useMap();
  const { token, bounds } = fit;
  useEffect(() => {
    if (bounds.length > 0)
      map.fitBounds(L.latLngBounds(bounds), { padding: [36, 36] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return null;
}

function ClickCatcher({
  onMapClick,
}: {
  onMapClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function MapView({
  className,
  ambulances = [],
  junctions = [],
  hospitals = [],
  incidents = [],
  routes = [],
  followId = null,
  fit = null,
  onMapClick,
}: MapViewProps) {
  const center = useMemo<[number, number]>(() => {
    const c = ambulances[0]?.position ??
      routes[0]?.points?.[0] ??
      junctions[0]?.position ??
      hospitals[0]?.position ?? [12.9716, 77.5946];

    return [c[0], c[1]];
  }, [ambulances, routes, junctions, hospitals]);

  return (
    <MapContainer
      center={center}
      zoom={13}
      className={cn("h-full w-full", className)}
      scrollWheelZoom
    >
      <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />

      {routes.map((r) =>
        r.points.length > 1 ? (
          <Polyline
            key={`${r.id}-casing`}
            positions={r.points}
            pathOptions={{ color: "#0B1117", weight: 8, opacity: 0.9 }}
          />
        ) : null,
      )}
      {routes.map((r) =>
        r.points.length > 1 ? (
          <Polyline
            key={`${r.id}-line`}
            positions={r.points}
            pathOptions={{
              color: r.highlight ? "#FFB224" : "#8A6B2F",
              weight: r.highlight ? 5 : 4,
              opacity: 0.95,
            }}
          />
        ) : null,
      )}

      {junctions.map((j) => (
        <div key={j.id}>
          {" "}
          {/* Fragment not supported as direct child; wrapper divs are ignored by react-leaflet layers */}
          <Circle
            center={j.position}
            radius={j.radiusM}
            pathOptions={{
              color: JUNCTION_COLORS[j.state],
              weight: 1,
              opacity: 0.7,
              fillOpacity: 0.05,
              dashArray: "4 8",
            }}
          />
          <CircleMarker
            center={j.position}
            radius={5}
            pathOptions={{
              color: "#0B1117",
              weight: 2,
              fillColor: JUNCTION_COLORS[j.state],
              fillOpacity: 1,
            }}
          >
            <Popup>
              <strong>{j.label}</strong>
              <br />
              Geofence {j.radiusM} m — {JUNCTION_LABELS[j.state]}
            </Popup>
          </CircleMarker>
        </div>
      ))}

      {hospitals.map((h) => (
        <Marker key={h.id} position={h.position} icon={hospitalIcon()}>
          <Popup>
            <strong>{h.label}</strong>
            <br />
            Hospital
          </Popup>
        </Marker>
      ))}

      {incidents.map((i) => (
        <Marker key={i.id} position={i.position} icon={incidentIcon()}>
          <Popup>
            <strong>{i.label}</strong>
            <br />
            Reported road incident
          </Popup>
        </Marker>
      ))}

      {ambulances.map((a) => (
        <Marker
          key={a.id}
          position={a.position}
          icon={ambulanceIcon(a.heading, a.active)}
          zIndexOffset={500}
        >
          <Popup>
            <strong>{a.label}</strong>
            <br />
            {a.active ? "ON EMERGENCY" : "Standing by"}
            <br />
            {a.speedKmh != null && (
              <>
                Speed: {a.speedKmh}
                <br />
              </>
            )}
            {a.destination && (
              <>
                Destination: {a.destination}
                <br />
              </>
            )}
            {a.lastUpdateMs != null && (
              <>Updated: {new Date(a.lastUpdateMs).toLocaleTimeString()}</>
            )}
          </Popup>
        </Marker>
      ))}

      {followId && <Follow id={followId} ambulances={ambulances} />}
      {fit && fit.bounds.length > 0 && <Fitter fit={fit} />}
      {onMapClick && <ClickCatcher onMapClick={onMapClick} />}
    </MapContainer>
  );
}
