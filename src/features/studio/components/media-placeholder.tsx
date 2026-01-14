"use client";

import { useReducedMotion } from "framer-motion";

import Novatrix from "@/components/eldoraui/novatrix-background";
import { cn } from "@/lib/cn";

type MediaPlaceholderProps = {
  variant: "loading" | "mock";
  className?: string;
};

export function MediaPlaceholder({ variant, className }: MediaPlaceholderProps) {
  const shouldReduceMotion = useReducedMotion();
  const showLoading = variant === "loading";
  const showFlow = showLoading && !shouldReduceMotion;
  const showStatic = variant === "mock";
  const baseBackground =
    "bg-[radial-gradient(760px_520px_at_18%_20%,rgba(255,236,196,0.18),transparent_62%),radial-gradient(620px_460px_at_82%_80%,rgba(255,255,255,0.98),transparent_70%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,255,255,0.84))]";

  return (
    <div
      className={cn("pointer-events-none absolute inset-0", className)}
      aria-hidden="true"
    >
      <div className="absolute inset-0">
        <div className={cn("absolute inset-0", baseBackground)} />
        {showFlow ? (
          <Novatrix
            color={[1, 1, 1]}
            speed={0.5}
            amplitude={0.08}
            className="absolute inset-0 opacity-26 [filter:grayscale(1)_sepia(0.12)_saturate(1.01)_brightness(1.06)]"
            aria-hidden="true"
          />
        ) : null}
        {showStatic ? (
          <Novatrix
            color={[1, 1, 1]}
            speed={0.5}
            amplitude={0.08}
            paused
            time={2.6}
            className="absolute inset-0 opacity-26 [filter:grayscale(1)_sepia(0.12)_saturate(1.01)_brightness(1.06)]"
            aria-hidden="true"
          />
        ) : null}
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.26),rgba(255,255,255,0.08)_48%,rgba(255,255,255,0.22))]" />
      </div>
    </div>
  );
}
