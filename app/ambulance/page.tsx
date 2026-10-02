import type { Metadata } from "next";
import AmbulanceConsole from "@/components/ambulance/AmbulanceConsole";

export const metadata: Metadata = { title: "RapidRoute — Ambulance Driver" };

export default function Page() {
  return <AmbulanceConsole />;
}
