import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { UsersRow } from "@/types/database";

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[],
        ) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            /* Server Component — middleware refreshes sessions. */
          }
        },
      },
    },
  );
}

/** Returns the session user + their profile row, or null (also null if the
 *  profile trigger has not run yet — callers redirect to /login in that case). */
export async function getAuthenticatedProfile(): Promise<{
  userId: string;
  profile: UsersRow;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();
  const profile = data as UsersRow | null;
  if (!profile) return null;
  return { userId: user.id, profile };
}
