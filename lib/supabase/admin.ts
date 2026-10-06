// SERVER-ONLY client using the service-role key. Used exclusively in API routes
// (user provisioning, admin bootstrap). Never import from a client component.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error(
      "createAdminClient must never run in the browser (service-role key).",
    );
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured on the server.",
    );
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
