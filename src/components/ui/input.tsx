import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "flex h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy/35",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";
