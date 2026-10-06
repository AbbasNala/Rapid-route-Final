import { redirect } from "next/navigation";
import { getAuthenticatedProfile, createClient } from "@/lib/supabase/server";
import { canAccessPath, ROLE_HOME } from "@/lib/auth/guards";
import { AdminConsole } from "@/components/admin/AdminConsole";
import type {
  AmbulancesRow,
  HospitalsRow,
  JunctionsRow,
  UsersRow,
} from "@/types/database";

export default async function AdminPage() {
  const auth = await getAuthenticatedProfile();
  if (!auth) redirect("/login");
  if (!canAccessPath(auth.profile.role, "/admin"))
    redirect(ROLE_HOME[auth.profile.role]);

  const supabase = createClient();
  const [
    { data: ambulances },
    { data: hospitals },
    { data: junctions },
    { data: users },
  ] = await Promise.all([
    supabase.from("ambulances").select("*").order("vehicle_number"),
    supabase.from("hospitals").select("*").order("name"),
    supabase.from("junctions").select("*").order("name"),
    supabase.from("users").select("*").order("created_at"),
  ]);

  return (
    <AdminConsole
      viewer={auth.profile}
      ambulances={(ambulances ?? []) as AmbulancesRow[]}
      hospitals={(hospitals ?? []) as HospitalsRow[]}
      junctions={(junctions ?? []) as JunctionsRow[]}
      users={(users ?? []) as UsersRow[]}
    />
  );
}
