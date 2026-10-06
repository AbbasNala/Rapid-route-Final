// First-run admin claim: promotes the signed-in user to admin only if
// (a) ADMIN_BOOTSTRAP_CODE is configured on the server, (b) the code matches,
// and (c) no admin exists yet. Uses the service-role key (server-only).
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ code: z.string().min(1).max(200) });

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Enter a bootstrap code." },
      { status: 400 },
    );

  const expected = process.env.ADMIN_BOOTSTRAP_CODE;
  if (!expected) {
    return NextResponse.json(
      {
        error:
          "Admin bootstrap is disabled — set ADMIN_BOOTSTRAP_CODE in the server environment.",
      },
      { status: 501 },
    );
  }
  if (parsed.data.code !== expected) {
    return NextResponse.json(
      { error: "Incorrect bootstrap code." },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  const { count } = await admin
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          "An administrator already exists. Ask an admin to grant roles from /admin.",
      },
      { status: 409 },
    );
  }
  const { error } = await admin
    .from("users")
    .update({ role: "admin" })
    .eq("id", user.id);
  if (error) {
    return NextResponse.json(
      { error: "Could not update role: " + error.message },
      { status: 500 },
    );
  }
  await admin
    .from("audit_log")
    .insert({
      actor: user.id,
      action: "admin.bootstrap",
      details: { email: user.email },
    });
  return NextResponse.json({ ok: true });
}
