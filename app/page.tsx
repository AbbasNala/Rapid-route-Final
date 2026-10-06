import { redirect } from "next/navigation";
import { getAuthenticatedProfile } from "@/lib/supabase/server";
import { ROLE_HOME } from "@/lib/auth/guards";

export default async function Home() {
  const auth = await getAuthenticatedProfile();
  if (!auth) redirect("/login");
  redirect(ROLE_HOME[auth.profile.role]);
}
