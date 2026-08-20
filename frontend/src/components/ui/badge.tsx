import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border backdrop-blur",
  {
    variants: {
      variant: {
        default: "border-slate-700 bg-slate-800 text-slate-200",
        green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        yellow: "border-amber-500/30 bg-amber-500/10 text-amber-300",
        red: "border-red-500/30 bg-red-500/10 text-red-300",
        blue: "border-sky-500/30 bg-sky-500/10 text-sky-300",
        slate: "border-slate-700 bg-slate-800/60 text-slate-300",
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