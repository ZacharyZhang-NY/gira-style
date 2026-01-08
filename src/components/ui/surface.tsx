import type * as React from "react";

import { cn } from "@/lib/cn";

type SurfaceProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: "glass" | "subtle" | "solid" | "flush";
};

export function Surface({ className, tone = "glass", ...props }: SurfaceProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl text-text",
        "transition-[box-shadow,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        tone === "glass" && "ui-glass",
        tone === "subtle" && "ui-glass-subtle",
        tone === "solid" && ["bg-surface shadow-lux-md"],
        tone === "flush" && "bg-transparent shadow-none",
        className,
      )}
      {...props}
    />
  );
}
