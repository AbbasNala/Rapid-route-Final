"use client";
import dynamic from "next/dynamic";

export const DynamicMap = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-xl border border-ops-700 bg-ops-900 text-sm text-ops-400">
      Loading map…
    </div>
  ),
});

export type {
  MapViewProps,
  MapAmbulance,
  MapJunction,
  MapHospital,
  MapIncident,
  MapRouteLayer,
  JunctionMapState,
} from "./MapView";
