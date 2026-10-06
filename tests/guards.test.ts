import { describe, expect, it } from "vitest";
import { canAccessPath, ROLE_HOME } from "@/lib/auth/guards";

// Role enforcement also exists at the database level (RLS policies in
// supabase/migrations/0002_rls.sql). These tests cover the route guard used
// by the dashboard pages; unauthenticated users are stopped by middleware +
// page-level redirects before any role check runs.

describe("canAccessPath — role-based route protection", () => {
  it("allows the ambulance driver only on /ambulance", () => {
    expect(canAccessPath("ambulance_driver", "/ambulance")).toBe(true);
    expect(canAccessPath("ambulance_driver", "/police")).toBe(false);
    expect(canAccessPath("ambulance_driver", "/admin")).toBe(false);
  });

  it("allows traffic police on /police but not police operations on other dashboards", () => {
    expect(canAccessPath("traffic_police", "/police")).toBe(true);
    expect(canAccessPath("traffic_police", "/ambulance")).toBe(false);
    expect(canAccessPath("traffic_police", "/admin")).toBe(false);
  });

  it("allows admin on /admin and /police, but not on the driver console", () => {
    expect(canAccessPath("admin", "/admin")).toBe(true);
    expect(canAccessPath("admin", "/police")).toBe(true);
    expect(canAccessPath("admin", "/ambulance")).toBe(false);
  });

  it("guards sub-paths too", () => {
    expect(canAccessPath("ambulance_driver", "/police/junctions")).toBe(false);
    expect(canAccessPath("traffic_police", "/admin/users")).toBe(false);
  });

  it("maps each role to its home dashboard", () => {
    expect(ROLE_HOME.ambulance_driver).toBe("/ambulance");
    expect(ROLE_HOME.traffic_police).toBe("/police");
    expect(ROLE_HOME.admin).toBe("/admin");
  });
});
