import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant =
  | "primary"
  | "emergency"
  | "amber"
  | "success"
  | "outline"
  | "ghost"
  | "dangerOutline";
type Size = "sm" | "md" | "lg" | "xl";

const variants: Record<Variant, string> = {
  primary: "bg-white text-ink hover:bg-slate-200",
  emergency: "bg-emergency text-white hover:bg-emergency-bright",
  amber: "bg-amber text-ink hover:brightness-110",
  success: "bg-success text-ink hover:brightness-110",
  outline: "border border-line bg-panel text-slate-100 hover:bg-panel-2",
  ghost: "text-muted hover:bg-panel-2 hover:text-slate-100",
  dangerOutline:
    "border border-emergency/50 bg-panel text-emergency hover:bg-emergency/10",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-14 px-5 text-base",
  xl: "h-16 px-6 text-lg",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
}) {
  return (
    <button
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold tracking-wide",
        "transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-route",
        "disabled:pointer-events-none disabled:opacity-40",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
