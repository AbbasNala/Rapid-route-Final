import { redirect } from "next/navigation";
import { getAuthenticatedProfile, createClient } from "@/lib/supabase/server";
import { canAccessPath, ROLE_HOME } from "@/lib/auth/guards";
import { PoliceConsole } from "@/components/police/PoliceConsole";
import type {
  AlertsRow,
  AmbulancesRow,
  HospitalsRow,
  JunctionsRow,
  JourneysRow,
  LocationUpdateRow,
  RoadIncidentsRow,
} from "@/types/database";

export default async function PolicePage() {
  const auth = await getAuthenticatedProfile();
  if (!auth) redirect("/login");
  if (!canAccessPath(auth.profile.role, "/police"))
    redirect(ROLE_HOME[auth.profile.role]);

  const supabase = createClient();
  const [
    { data: ambulances },
    { data: hospitals },
    { data: junctions },
    { data: journeys },
  ] = await Promise.all([
    supabase.from("ambulances").select("*"),
    supabase.from("hospitals").select("*").order("name"),
    supabase.from("junctions").select("*").order("name"),
    supabase.from("journeys").select("*").eq("status", "ACTIVE"),
  ]);

  const activeJourneys = (journeys ?? []) as JourneysRow[];
  const ids = activeJourneys.map((j) => j.id);
  const fixesQuery = ids.length
    ? supabase
        .from("location_updates")
        .select("*")
        .in("journey_id", ids)
        .order("timestamp", { ascending: false })
        .limit(400)
    : Promise.resolve({ data: [] as never[] });
  const [{ data: fixRows }, { data: alerts }, { data: incidents }] =
    await Promise.all([
      fixesQuery,
      supabase
        .from("alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(60),
      supabase
        .from("road_incidents")
        .select("*")
        .eq("status", "ACTIVE")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

  const latestFixes: Record<string, LocationUpdateRow> = {};
  for (const row of (fixRows ?? []) as LocationUpdateRow[]) {
    if (!latestFixes[row.journey_id]) latestFixes[row.journey_id] = row;
  }

  return (
    <PoliceConsole
      viewerId={auth.userId}
      initial={{
        ambulances: (ambulances ?? []) as AmbulancesRow[],
        hospitals: (hospitals ?? []) as HospitalsRow[],
        junctions: (junctions ?? []) as JunctionsRow[],
        journeys: activeJourneys,
        latestFixes,
        alerts: (alerts ?? []) as AlertsRow[],
        incidents: (incidents ?? []) as RoadIncidentsRow[],
      }}
    />
  );
}
