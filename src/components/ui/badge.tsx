import type * as React from "react";

import { cn } from "@/lib/cn";

type BadgeTone = "neutral" | "gold" | "danger";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]",
        "ui-glass-subtle",
        tone === "neutral" && "text-muted",
        tone === "gold" && "text-text",
        tone === "danger" && "text-red-700",
        className,
      )}
      {...props}
    />
  );
}
