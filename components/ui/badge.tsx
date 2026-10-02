import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tone = "neutral" | "green" | "amber" | "red" | "blue";

const tones: Record<Tone, string> = {
  neutral: "bg-white/5 text-muted border-line",
  green: "bg-success/10 text-success border-success/40",
  amber: "bg-amber/10 text-amber border-amber/40",
  red: "bg-emergency/10 text-emergency border-emergency/40",
  blue: "bg-route/10 text-route border-route/30",
};

export function Chip({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusDot({
  tone = "green",
  pulse,
}: {
  tone?: "green" | "amber" | "red" | "gray";
  pulse?: boolean;
}) {
  const color = {
    green: "bg-success",
    amber: "bg-amber",
    red: "bg-emergency",
    gray: "bg-muted",
  }[tone];
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        color,
        pulse && "animate-pulse",
      )}
    />
  );
}
