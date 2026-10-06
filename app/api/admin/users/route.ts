// Admin-only user provisioning (uses the service-role key — server-only).
// This is the ONLY path that can create police/admin accounts.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rateLimit";

const roleEnum = z.enum(["ambulance_driver", "traffic_police", "admin"]);
const postSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  password: z.string().min(8).max(72),
  role: roleEnum,
});
const patchSchema = z.object({ id: z.string().uuid(), role: roleEnum });

async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((data as { role?: string } | null)?.role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Administrator access required." },
        { status: 403 },
      ),
    };
  }
  return { admin: createAdminClient(), actorId: user.id };
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  if (!rateLimit(`admin-users:${guard.actorId}`, 20, 60_000)) {
    return NextResponse.json(
      { error: "Rate limit reached. Try again shortly." },
      { status: 429 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }
  const { name, email, password, role } = parsed.data;
  const { data: created, error } = await guard.admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error || !created.user) {
    return NextResponse.json(
      { error: error?.message ?? "User creation failed." },
      { status: 409 },
    );
  }
  const { error: profileError } = await guard
    .admin!.from("users")
    .update({
      name,
      email,
      role,
    })
    .eq("id", created.user.id);

  if (profileError) {
    return NextResponse.json(
      { error: "Profile update failed: " + profileError.message },
      { status: 500 },
    );
  }
  // if (insertError) {
  //   return NextResponse.json(
  //     { error: "Profile insert failed: " + insertError.message },
  //     { status: 500 },
  //   );
  // }
  await guard.admin!.from("audit_log").insert({
    actor: guard.actorId,
    action: "admin.user.create",
    details: { email, role },
  });
  return NextResponse.json({ ok: true, id: created.user.id });
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid user id or role." },
      { status: 400 },
    );
  }
  const { id, role } = parsed.data;

  // Never allow demoting the only administrator.
  if (role !== "admin") {
    const { data: target } = await guard
      .admin!.from("users")
      .select("role")
      .eq("id", id)
      .single();
    if ((target as { role?: string } | null)?.role === "admin") {
      const { count } = await guard
        .admin!.from("users")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: "Cannot demote the only administrator." },
          { status: 409 },
        );
      }
    }
  }
  const { error } = await guard
    .admin!.from("users")
    .update({ role })
    .eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  await guard.admin!.from("audit_log").insert({
    actor: guard.actorId,
    action: "admin.user.role_change",
    details: { target: id, role },
  });
  return NextResponse.json({ ok: true });
}
