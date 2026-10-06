import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
  {
    variants: {
      variant: {
        neutral: "border-ops-600 bg-ops-800 text-ops-300",
        emergency: "border-emergency/50 bg-emergency/15 text-emergency-bright",
        warn: "border-warn/50 bg-warn/15 text-warn",
        ok: "border-ok/50 bg-ok/15 text-ok",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
