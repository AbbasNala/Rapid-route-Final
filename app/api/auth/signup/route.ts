// Public self-signup. Always creates an ambulance_driver profile — the DB
// trigger ignores any client-supplied role. Police/admin accounts are
// provisioned by an administrator (see /api/admin/users).
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rateLimit";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  password: z.string().min(8).max(72),
});

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`signup:${ip}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many sign-up attempts. Try again later." },
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
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }
  const { name, email, password } = parsed.data;
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (error) {
    const message = error.message.includes("already registered")
      ? "An account with this email already exists. Try signing in instead."
      : error.message;
    return NextResponse.json({ error: message }, { status: 409 });
  }
  // If email confirmation is enabled in Supabase, no session is returned yet.
  return NextResponse.json({ ok: true, needsConfirmation: !data.session });
}
