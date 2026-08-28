import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border backdrop-blur-md transition-all duration-200",
  {
    variants: {
      variant: {
        default: "border-slate-700/80 bg-slate-800/80 text-slate-200 ring-1 ring-inset ring-slate-600/20",
        green: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30",
        yellow: "border-amber-500/40 bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30",
        red: "border-red-500/40 bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/30",
        blue: "border-sky-500/40 bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-500/30",
        slate: "border-slate-700/80 bg-slate-800/60 text-slate-300 ring-1 ring-inset ring-slate-700/30",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };