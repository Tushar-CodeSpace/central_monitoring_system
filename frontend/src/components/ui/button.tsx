import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-900/40 hover:from-emerald-400 hover:to-emerald-600 active:scale-[0.98]",
        destructive: "bg-red-600 text-white hover:bg-red-500 active:scale-[0.98]",
        outline:
          "border border-slate-700 bg-slate-900/40 text-slate-200 hover:border-slate-500 hover:bg-slate-800",
        ghost: "text-slate-400 hover:bg-slate-800 hover:text-slate-100",
        secondary: "bg-slate-800 text-slate-100 hover:bg-slate-700",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-lg px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { Button, buttonVariants };