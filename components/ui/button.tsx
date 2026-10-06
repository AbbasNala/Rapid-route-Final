import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warn disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-ops-600 text-white hover:bg-ops-500",
        emergency: "bg-emergency text-white hover:bg-emergency-bright",
        warn: "bg-warn text-ops-950 hover:bg-[#FFC24A]",
        ok: "bg-ok text-ops-950 hover:bg-[#5CE2A2]",
        outline:
          "border border-ops-600 bg-transparent text-slate-100 hover:bg-ops-800",
        ghost: "text-ops-300 hover:bg-ops-800 hover:text-white",
      },
      size: {
        sm: "h-9 px-3 text-xs",
        md: "h-11 px-4 text-sm",
        lg: "h-13 px-5 text-base",
        xl: "h-16 px-6 text-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
