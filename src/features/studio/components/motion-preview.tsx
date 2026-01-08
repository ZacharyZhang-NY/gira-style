"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Play } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/cn";
import { luxTween, LUX_DURATION } from "@/lib/motion";

import type { StageState } from "../types";

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return value.startsWith("http://") || value.startsWith("https://");
}

type MotionPreviewProps = {
  state: StageState;
  image?: string;
  video?: string;
};

export function MotionPreview({ state, image, video }: MotionPreviewProps) {
  const shouldReduceMotion = useReducedMotion();
  const transition = luxTween(shouldReduceMotion, LUX_DURATION.base);

  const [isPlaying, setIsPlaying] = React.useState(false);

  React.useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setTimeout(() => setIsPlaying(false), 3000);
    return () => window.clearTimeout(timer);
  }, [isPlaying]);

  const videoSrc = isHttpUrl(video) ? video : undefined;
  const hasImage = typeof image === "string" && image.length > 0;
  const canPlay = !shouldReduceMotion && state === "done" && (videoSrc || hasImage);

  const showLoading = state === "loading";

  return (
    <div className="relative h-[420px] w-full overflow-hidden sm:h-[500px]">
      <div
        className={cn(
          "absolute inset-0",
          "bg-[radial-gradient(520px_340px_at_22%_18%,rgba(212,175,55,0.18),transparent_62%),radial-gradient(420px_320px_at_82%_12%,rgba(152,187,210,0.14),transparent_58%),linear-gradient(180deg,rgba(255,255,255,0.28),rgba(255,255,255,0.10))]",
          showLoading && "motion-safe:animate-pulse",
        )}
        aria-hidden="true"
      />

      {state === "done" && videoSrc ? (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={videoSrc}
          muted
          loop
          playsInline
          autoPlay={!shouldReduceMotion}
        />
      ) : state === "done" && hasImage ? (
        <motion.img
          src={image}
          alt="Motion preview"
          className="absolute inset-0 h-full w-full object-contain p-4 filter grayscale"
          animate={
            canPlay && isPlaying
              ? { y: [0, -6, 0], scale: [1, 1.02, 1], filter: ["grayscale(100%)", "grayscale(0%)", "grayscale(100%)"] }
              : { y: 0, scale: 1 }
          }
          transition={
            canPlay && isPlaying
              ? { duration: 3, ease: [0.16, 1, 0.3, 1] }
              : transition
          }
        />
      ) : null}

      {!shouldReduceMotion ? (
        <motion.div
          className="pointer-events-none absolute -left-48 top-0 h-full w-72 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.34),transparent)] opacity-0 mix-blend-overlay"
          animate={canPlay && isPlaying ? { x: [0, 920], opacity: [0, 0.9, 0] } : { opacity: 0 }}
          transition={canPlay && isPlaying ? { duration: 3, ease: [0.16, 1, 0.3, 1] } : transition}
          aria-hidden="true"
        />
      ) : null}

      <div className="absolute left-4 top-4 flex items-center gap-3">
        <div className="rounded-full bg-glass-highlight/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-text">
          Motion preview
        </div>
      </div>

      <div className="absolute bottom-4 right-4 flex items-center gap-3">
        <motion.button
          type="button"
          onClick={() => setIsPlaying(true)}
          disabled={!canPlay || isPlaying}
          className={cn(
            "group grid h-12 w-12 place-items-center rounded-full",
            "ui-glass-subtle shadow-lux-md",
            "transition-[transform,box-shadow,opacity] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
            "disabled:cursor-not-allowed disabled:opacity-50",
            !canPlay && "opacity-50",
          )}
          whileHover={shouldReduceMotion || !canPlay ? undefined : { y: -1, scale: 1.02 }}
          whileTap={shouldReduceMotion || !canPlay ? undefined : { scale: 0.98, y: 0 }}
          transition={transition}
          aria-label={canPlay ? "Play motion preview" : "Motion preview unavailable"}
        >
          <Play className="h-4 w-4 text-text" aria-hidden="true" />
        </motion.button>
      </div>
    </div>
  );
}
