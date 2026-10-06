import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

export function fmtDistance(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return "—";
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toFixed(1)} km`;
}

export function fmtSpeed(mps: number | null | undefined): string {
  if (mps == null || !Number.isFinite(mps) || mps < 0) return "—";
  return `${Math.round(mps * 3.6)} km/h`;
}

export function timeAgo(
  at: string | number | null | undefined,
  now = Date.now(),
): string {
  if (at == null) return "—";
  const t = typeof at === "number" ? at : Date.parse(at);
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 3) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
