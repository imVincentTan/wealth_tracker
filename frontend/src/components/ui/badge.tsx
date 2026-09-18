import * as React from "react";

import { cn } from "@/lib/utils";

const Badge = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "outline" | "transfer" | "income" | "expense" }>(
  ({ className, variant = "default", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variant === "default" && "bg-stone-100 text-stone-700",
        variant === "outline" && "border border-stone-300 text-stone-700",
        variant === "transfer" && "bg-slate-100 text-slate-700",
        variant === "income" && "bg-teal-50 text-teal-800",
        variant === "expense" && "bg-orange-50 text-orange-800",
        className,
      )}
      {...props}
    />
  ),
);
Badge.displayName = "Badge";

export { Badge };
