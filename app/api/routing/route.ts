// Server-side routing proxy — the openrouteservice key never reaches the browser.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getRoutingProvider,
  RoutingError,
} from "@/lib/routing/routingProvider";
import { rateLimit } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";

const latLng = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
const bodySchema = z.object({ origin: latLng, destination: latLng });

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  if (!rateLimit(`routing:${user.id}`, 10, 60_000)) {
    return NextResponse.json(
      {
        error:
          "Routing rate limit reached (10 requests/minute). Try again shortly.",
      },
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
      { error: "Invalid origin or destination coordinates." },
      { status: 400 },
    );
  }

  try {
    const route = await getRoutingProvider().getRoute(
      parsed.data.origin,
      parsed.data.destination,
    );
    return NextResponse.json(route);
  } catch (err) {
    if (err instanceof RoutingError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: "Unexpected routing failure." },
      { status: 500 },
    );
  }
}
