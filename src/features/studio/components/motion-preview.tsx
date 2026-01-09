"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";
import { luxTween, LUX_DURATION } from "@/lib/motion";

import type { StageState } from "../types";
import { MediaPlaceholder } from "./media-placeholder";

function isVideoSrc(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:video/")
  );
}

type MotionPreviewProps = {
  state: StageState;
  image?: string;
  video?: string;
  videoEnabled: boolean;
};

export function MotionPreview({ state, image, video, videoEnabled }: MotionPreviewProps) {
  const shouldReduceMotion = useReducedMotion();
  const transition = luxTween(shouldReduceMotion, LUX_DURATION.base);

  const videoSrc = isVideoSrc(video) ? video : undefined;
  const hasImage = typeof image === "string" && image.length > 0;
  const showLoading = state === "loading";
  const showMock = !videoEnabled;
  const showVideo = !showMock && state === "done" && Boolean(videoSrc);
  const showImage = !showMock && state === "done" && !videoSrc && hasImage;

  return (
    <div className="relative aspect-[9/16] w-full overflow-hidden">
      <div
        className={cn(
          "absolute inset-0",
          "bg-[radial-gradient(520px_340px_at_22%_18%,rgba(212,175,55,0.18),transparent_62%),radial-gradient(420px_320px_at_82%_12%,rgba(152,187,210,0.14),transparent_58%),linear-gradient(180deg,rgba(255,255,255,0.28),rgba(255,255,255,0.10))]",
          showLoading && "motion-safe:animate-pulse",
        )}
        aria-hidden="true"
      />

      {showLoading ? (
        <MediaPlaceholder variant="loading" />
      ) : showMock ? (
        <MediaPlaceholder variant="mock" />
      ) : null}

      {showVideo ? (
        <video
          className="absolute inset-0 h-full w-full origin-center object-cover scale-[1.34]"
          src={videoSrc}
          muted
          loop
          playsInline
          autoPlay={!shouldReduceMotion}
        />
      ) : showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt="Motion preview"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}

      {!shouldReduceMotion ? (
        <motion.div
          className="pointer-events-none absolute -left-48 top-0 h-full w-72 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.34),transparent)] opacity-0 mix-blend-overlay"
          animate={showLoading ? { x: [0, 920], opacity: [0, 0.9, 0] } : { opacity: 0 }}
          transition={showLoading ? { duration: 2.6, ease: [0.16, 1, 0.3, 1] } : transition}
          aria-hidden="true"
        />
      ) : null}

      <div className="absolute left-4 top-4 flex items-center gap-3">
        <div className="rounded-full bg-glass-highlight/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-text">
          Motion preview
        </div>
      </div>
    </div>
  );
}
