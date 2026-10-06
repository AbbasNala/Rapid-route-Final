import { redirect } from "next/navigation";
import { getAuthenticatedProfile } from "@/lib/supabase/server";
import { canAccessPath, ROLE_HOME } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { AmbulanceConsole } from "@/components/ambulance/AmbulanceConsole";
import type {
  AmbulancesRow,
  HospitalsRow,
  JunctionsRow,
} from "@/types/database";

export default async function AmbulancePage() {
  const auth = await getAuthenticatedProfile();
  if (!auth) redirect("/login");
  if (!canAccessPath(auth.profile.role, "/ambulance"))
    redirect(ROLE_HOME[auth.profile.role]);

  const supabase = createClient();
  const [{ data: ambulances }, { data: hospitals }, { data: junctions }] =
    await Promise.all([
      supabase.from("ambulances").select("*").eq("driver_id", auth.userId),
      supabase.from("hospitals").select("*").order("name"),
      supabase.from("junctions").select("*").order("name"),
    ]);

  return (
    <AmbulanceConsole
      driverId={auth.userId}
      ambulances={(ambulances ?? []) as AmbulancesRow[]}
      hospitals={(hospitals ?? []) as HospitalsRow[]}
      junctions={(junctions ?? []) as JunctionsRow[]}
    />
  );
}
