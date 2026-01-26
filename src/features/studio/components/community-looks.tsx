"use client";

import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/cn";

import type { CommunityLook } from "../types";
import { OutfitPreview } from "./outfit-preview";

type CommunityLooksProps = {
  looks: CommunityLook[];
  onFeedback: (look: CommunityLook, value: "up" | "down") => void;
  className?: string;
};

export function CommunityLooks({
  looks,
  onFeedback,
  className,
}: CommunityLooksProps) {
  if (!looks.length) return null;

  return (
    <section className={cn("space-y-4", className)} aria-label="Most loved looks">
      <h2 className="sr-only">Most loved looks</h2>
      <div
        className={cn(
          "flex gap-4 overflow-x-auto pb-2 no-scrollbar",
          "snap-x snap-mandatory",
          "lg:grid lg:grid-cols-3 lg:grid-rows-2 lg:justify-items-center lg:gap-6 lg:overflow-visible lg:pb-0 lg:snap-none",
        )}
      >
        {looks.map((look) => (
          <Surface
            key={`${look.sessionId}-${look.turnIndex}`}
            className={cn(
              "w-full overflow-hidden p-0",
              "min-w-[220px] max-w-[220px] snap-start",
              "sm:min-w-[240px] sm:max-w-[240px]",
              "lg:min-w-0 lg:max-w-[240px]",
            )}
          >
            <OutfitPreview
              state="done"
              image={look.imageUrl}
              feedback={look.viewerFeedback ?? ""}
              upCount={look.upVotes}
              downCount={look.downVotes}
              onFeedback={(value) => onFeedback(look, value)}
            />
          </Surface>
        ))}
      </div>
    </section>
  );
}
