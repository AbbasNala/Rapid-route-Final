import type { UserRole } from "@/types/database";

export const ROLE_HOME: Record<UserRole, string> = {
  ambulance_driver: "/ambulance",
  traffic_police: "/police",
  admin: "/admin",
  police: "/police",
};

export const ROLE_LABEL: Record<UserRole, string> = {
  ambulance_driver: "Ambulance driver",
  traffic_police: "Traffic police",
  admin: "Administrator",
};

/** Pure role→path guard used by the dashboard pages. */
export function canAccessPath(role: UserRole, path: string): boolean {
  if (path === "/ambulance" || path.startsWith("/ambulance/"))
    return role === "ambulance_driver";
  if (path === "/police" || path.startsWith("/police/"))
    return role === "traffic_police" || role === "admin";
  if (path === "/admin" || path.startsWith("/admin/")) return role === "admin";
  return false;
}
