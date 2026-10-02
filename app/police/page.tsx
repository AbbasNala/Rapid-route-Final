import type { Metadata } from "next";
import PoliceConsole from "@/components/police/PoliceConsole";

export const metadata: Metadata = { title: "RapidRoute — Traffic Control" };

export default function Page() {
  return <PoliceConsole />;
}
