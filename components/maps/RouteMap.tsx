"use client";

import { useEffect } from "react";
import L from "leaflet";
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
  ZoomControl,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  ambulanceIcon,
  hospitalIcon,
  junctionIcon,
  roadblockIcon,
} from "./icons";
import type {
  Ambulance,
  Coord,
  Hospital,
  Junction,
  RoadblockReport,
} from "@/types";

export interface RouteLine {
  key: string;
  coords: Coord[];
  kind: "active" | "preview" | "secondary";
}

export interface RouteMapProps {
  center: Coord;
  zoom?: number;
  ambulances: Array<
    Pick<
      Ambulance,
      "id" | "number" | "lat" | "lng" | "heading" | "status" | "activeJourneyId"
    >
  >;
  junctions: Junction[];
  hospitals: Hospital[];
  routes: RouteLine[];
  roadblocks?: RoadblockReport[];
  follow?: Coord | null;
  fitKey?: string;
  fitCoords?: Coord[] | null;
  selected?: { ambulanceId?: string; junctionId?: string; hospitalId?: string };
  alertedJunctionIds?: string[];
  recenterSignal?: number;
  onSelectAmbulance?: (id: string) => void;
  onSelectJunction?: (id: string) => void;
  onSelectHospital?: (id: string) => void;
}

/* Tiles: no key → official OpenStreetMap (free forever, no watermark, darkened via CSS).
   Optional real MapTiler key → native dark basemap. A wrong/placeholder key shows error
   tiles, so leave the variable empty unless you have a genuine key from cloud.maptiler.com. */
const mapTilerKey = process.env.NEXT_PUBLIC_MAP_TILER_KEY?.trim();
const TILES = mapTilerKey
  ? {
      url: `https://api.maptiler.com/maps/darkmatter/256/{z}/{x}/{y}.png?key=${mapTilerKey}`,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://www.maptiler.com/">MapTiler</a>',
      className: undefined as string | undefined,
    }
  : {
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      className: "osm-dark-tiles",
    };

function Follow({
  target,
  enabled,
}: {
  target: Coord | null;
  enabled: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (!enabled || !target) return;
    const inner = map.getBounds().pad(-0.28);
    if (!inner.contains({ lat: target[0], lng: target[1] })) {
      map.panTo(target, { animate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.[0], target?.[1], enabled]);
  return null;
}

function FitBounds({
  coords,
  fitKey,
}: {
  coords: Coord[] | null;
  fitKey?: string;
}) {
  const map = useMap();
  useEffect(() => {
    if (!coords || coords.length < 2) return;
    const bounds = L.latLngBounds(
      coords.map((c) => [c[0], c[1]] as [number, number]),
    );
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
  return null;
}

function Recenter({
  target,
  signal,
}: {
  target: Coord | null;
  signal?: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (signal && target) map.setView(target, 15, { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal]);
  return null;
}

const routeStyle: Record<
  RouteLine["kind"],
  { casing: string; color: string; weight: number; dashArray?: string }
> = {
  active: { casing: "#0A1B30", color: "#5FB2FF", weight: 5 },
  preview: { casing: "#0A1B30", color: "#9DB6D6", weight: 4, dashArray: "6 8" },
  secondary: { casing: "#0A1B30", color: "#3C5A80", weight: 4 },
};

export default function RouteMap({
  center,
  zoom = 13,
  ambulances,
  junctions,
  hospitals,
  routes,
  roadblocks = [],
  follow = null,
  fitKey,
  fitCoords = null,
  selected = {},
  alertedJunctionIds = [],
  recenterSignal,
  onSelectAmbulance,
  onSelectJunction,
  onSelectHospital,
}: RouteMapProps) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      zoomControl={false}
      className="h-full w-full"
    >
      <TileLayer
        url={TILES.url}
        attribution={TILES.attribution}
        maxZoom={19}
        className={TILES.className}
      />
      <ZoomControl position="bottomright" />
      <FitBounds coords={fitCoords} fitKey={fitKey} />
      <Follow target={follow ?? center} enabled={Boolean(follow)} />
      <Recenter target={follow ?? center} signal={recenterSignal} />

      {routes.map((r) => (
        <Polyline
          key={`${r.key}-case`}
          positions={r.coords}
          pathOptions={{
            color: routeStyle[r.kind].casing,
            weight: routeStyle[r.kind].weight + 4,
            opacity: 0.9,
          }}
        />
      ))}
      {routes.map((r) => (
        <Polyline
          key={r.key}
          positions={r.coords}
          pathOptions={{
            color: routeStyle[r.kind].color,
            weight: routeStyle[r.kind].weight,
            dashArray: routeStyle[r.kind].dashArray,
          }}
        />
      ))}

      {junctions.map((j) => {
        const isSelected = selected.junctionId === j.id;
        const showFence = isSelected || alertedJunctionIds.includes(j.id);
        const fenceColor =
          j.status === "preparing"
            ? "#E5484D"
            : j.status === "cleared"
              ? "#2CC471"
              : "#8FA3BF";
        return (
          <div key={j.id}>
            {showFence && (
              <Circle
                center={[j.lat, j.lng]}
                radius={j.alertRadius}
                pathOptions={{
                  color: fenceColor,
                  weight: 1,
                  dashArray: "4 6",
                  fillOpacity: 0.04,
                }}
              />
            )}
            <Marker
              position={[j.lat, j.lng]}
              icon={junctionIcon(j, isSelected)}
              eventHandlers={{ click: () => onSelectJunction?.(j.id) }}
            />
          </div>
        );
      })}

      {hospitals.map((h) => (
        <Marker
          key={h.id}
          position={[h.lat, h.lng]}
          icon={hospitalIcon(h, selected.hospitalId === h.id)}
          eventHandlers={{ click: () => onSelectHospital?.(h.id) }}
        />
      ))}

      {roadblocks.map((r) => (
        <Marker key={r.id} position={[r.lat, r.lng]} icon={roadblockIcon()} />
      ))}

      {ambulances.map((a) => (
        <Marker
          key={a.id}
          position={[a.lat, a.lng]}
          icon={ambulanceIcon(a, selected.ambulanceId === a.id)}
          zIndexOffset={a.activeJourneyId ? 1000 : 400}
          eventHandlers={{ click: () => onSelectAmbulance?.(a.id) }}
        />
      ))}
    </MapContainer>
  );
}
