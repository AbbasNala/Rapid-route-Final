import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

export function Panel({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-line bg-panel", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  icon,
  title,
  right,
}: {
  icon?: ReactNode;
  title: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted">
        {icon}
        {title}
      </div>
      {right}
    </div>
  );
}
