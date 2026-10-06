import { redirect } from "next/navigation";
import { getAuthenticatedProfile } from "@/lib/supabase/server";
import { ROLE_HOME } from "@/lib/auth/guards";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage() {
  const auth = await getAuthenticatedProfile();
  if (auth) redirect(ROLE_HOME[auth.profile.role]);
  return <LoginForm />;
}
