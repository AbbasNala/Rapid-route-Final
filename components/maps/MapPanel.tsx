"use client";

import dynamic from "next/dynamic";
import type { RouteMapProps } from "./RouteMap";

const RouteMap = dynamic(() => import("./RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-ink text-sm text-muted">
      Loading map…
    </div>
  ),
});

export default function MapPanel(props: RouteMapProps) {
  return <RouteMap {...props} />;
}
