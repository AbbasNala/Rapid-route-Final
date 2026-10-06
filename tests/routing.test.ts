import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenRouteServiceProvider } from "@/lib/routing/openRouteService";
import { createOsrmDemoProvider } from "@/lib/routing/osrmRoute";
import { getRoutingProvider, RoutingError } from "@/lib/routing/routingProvider";

const ORS_OK = {
  ok: true,
  status: 200,
  json: async () => ({
    features: [{
      geometry: { coordinates: [[79.86, 6.91], [79.865, 6.915], [79.87, 6.92]] },
      properties: { summary: { distance: 1520.4, duration: 183.2 } },
    }],
  }),
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENROUTESERVICE_API_KEY;
});

describe("openrouteservice provider", () => {
  it("returns a normalized route with [lat, lng] geometry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ORS_OK));
    const route = await createOpenRouteServiceProvider("test-key")
      .getRoute({ latitude: 6.91, longitude: 79.86 }, { latitude: 6.92, longitude: 79.87 });
    expect(route.geometry).toEqual([[6.91, 79.86], [6.915, 79.865], [6.92, 79.87]]);
    expect(route.distanceM).toBeCloseTo(1520.4);
    expect(route.durationS).toBeCloseTo(183.2);
    expect(route.provider).toBe("openrouteservice");
  });

  it("sends the API key in the Authorization header", async () => {
    const fetchMock = vi.fn(async () => ORS_OK);
    vi.stubGlobal("fetch", fetchMock);
    await createOpenRouteServiceProvider("secret-key")
      .getRoute({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 1 });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("secret-key");
  });

  it("surfaces rate-limit errors (HTTP 429) as API errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })));
    await expect(
      createOpenRouteServiceProvider("k").getRoute({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })
    ).rejects.toMatchObject({ code: "API_ERROR" });
  });

  it("reports NO_ROUTE when the API returns no features", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ features: [] }) })));
    await expect(
      createOpenRouteServiceProvider("k").getRoute({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })
    ).rejects.toMatchObject({ code: "NO_ROUTE" });
  });

  it("wraps network failures as API errors with a friendly message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(
      createOpenRouteServiceProvider("k").getRoute({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })
    ).rejects.toMatchObject({ code: "API_ERROR", message: expect.stringContaining("unreachable") });
  });

  it("rejects invalid coordinates before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createOpenRouteServiceProvider("k").getRoute({ latitude: 200, longitude: 0 }, { latitude: 1, longitude: 0 })
    ).rejects.toBeInstanceOf(RoutingError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("OSRM demo fallback provider", () => {
  it("normalizes OSRM GeoJSON geometry to [lat, lng]", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        code: "Ok",
        routes: [{ distance: 900, duration: 120, geometry: { coordinates: [[79.86, 6.91], [79.87, 6.92]] } }],
      }),
    })));
    const route = await createOsrmDemoProvider()
      .getRoute({ latitude: 6.91, longitude: 79.86 }, { latitude: 6.92, longitude: 79.87 });
    expect(route.geometry).toEqual([[6.91, 79.86], [6.92, 79.87]]);
    expect(route.warning).toBeTruthy(); // must be flagged as test-only
  });

  it("reports NO_ROUTE for non-Ok OSRM codes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ code: "NoRoute", routes: [] }) })));
    await expect(
      createOsrmDemoProvider().getRoute({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })
    ).rejects.toMatchObject({ code: "NO_ROUTE" });
  });
});

describe("getRoutingProvider selection", () => {
  it("uses openrouteservice when a key is configured", () => {
    process.env.OPENROUTESERVICE_API_KEY = "k";
    expect(getRoutingProvider().name).toBe("openrouteservice");
  });

  it("falls back to the OSRM demo provider without a key", () => {
    expect(getRoutingProvider().name).toBe("osrm-demo");
  });
});