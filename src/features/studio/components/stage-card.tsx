import type * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { StageState } from "../types";

function labelFor(state: StageState) {
  if (state === "pending") return "Waiting";
  if (state === "loading") return "Sketching";
  if (state === "done") return "Ready";
  return "Needs attention";
}

function toneFor(state: StageState): React.ComponentProps<typeof Badge>["tone"] {
  if (state === "error") return "danger";
  if (state === "loading") return "gold";
  if (state === "done") return "gold";
  return "neutral";
}

type StageCardProps = {
  title: string;
  subtitle: string;
  state: StageState;
  children: React.ReactNode;
  rightSlot?: React.ReactNode;
  className?: string;
};

export function StageCard({ title, subtitle, state, children, rightSlot, className }: StageCardProps) {
  return (
    <section className={cn("rounded-2xl ui-glass-subtle p-6", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">{title}</div>
          <p className="mt-3 text-sm leading-relaxed text-muted">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {rightSlot}
          <Badge tone={toneFor(state)}>{labelFor(state)}</Badge>
        </div>
      </div>

      <div className="mt-7">{children}</div>
    </section>
  );
}
