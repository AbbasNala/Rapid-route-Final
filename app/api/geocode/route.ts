// Occasional address → coordinate lookup (admin hospital form).
// Rate-limited per user to respect the Nominatim usage policy (max 1 req/s, no autocomplete).
import { NextResponse, type NextRequest } from "next/server";
import { getGeocodingProvider } from "@/lib/geocoding/geocodingProvider";
import { rateLimit } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return NextResponse.json({ results: [] });

  if (!rateLimit(`geocode:${user.id}`, 6, 60_000)) {
    return NextResponse.json(
      {
        error:
          "Geocoding rate limit reached — try again in a minute, or enter coordinates manually.",
      },
      { status: 429 },
    );
  }
  try {
    const results = await getGeocodingProvider().search(q);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: "Geocoding service unavailable. Enter coordinates manually." },
      { status: 502 },
    );
  }
}
