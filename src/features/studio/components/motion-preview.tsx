"use client";

import * as React from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";

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

  const videoSrc = isVideoSrc(video) ? video : undefined;
  const hasImage = typeof image === "string" && image.length > 0;
  const showLoading = state === "loading";
  const showMock = !videoEnabled;
  const showVideo = !showMock && state === "done" && Boolean(videoSrc);
  const showImage = !showMock && state === "done" && !videoSrc && hasImage;
  const [videoReady, setVideoReady] = React.useState(false);
  const [imageReady, setImageReady] = React.useState(false);

  React.useEffect(() => {
    setVideoReady(false);
  }, [videoSrc]);

  React.useEffect(() => {
    setImageReady(false);
  }, [image]);

  const flowActive =
    showLoading ||
    (showVideo && !videoReady) ||
    (showImage && !imageReady) ||
    (!showVideo && !showImage && !showMock);
  const showPlaceholder =
    showLoading ||
    showMock ||
    (!showVideo && !showImage) ||
    (showVideo && !videoReady) ||
    (showImage && !imageReady);
  const placeholderVariant = flowActive ? "loading" : "mock";

  const handleVideoReady = React.useCallback(() => {
    if (shouldReduceMotion) {
      setVideoReady(true);
      return;
    }
    requestAnimationFrame(() => setVideoReady(true));
  }, [shouldReduceMotion]);

  const handleImageReady = React.useCallback(() => {
    if (shouldReduceMotion) {
      setImageReady(true);
      return;
    }
    requestAnimationFrame(() => setImageReady(true));
  }, [shouldReduceMotion]);

  return (
    <div className="relative aspect-[9/16] w-full overflow-hidden">
      <MediaPlaceholder
        variant={placeholderVariant}
        className={cn(
          "transition-opacity duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
          showPlaceholder ? "opacity-100" : "opacity-0",
        )}
      />

      {showVideo ? (
        <video
          className={cn(
            "absolute inset-0 h-full w-full origin-center object-cover scale-[1.34]",
            "transition-opacity duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
            videoReady ? "opacity-100" : "opacity-0",
          )}
          src={videoSrc}
          muted
          loop
          playsInline
          autoPlay={!shouldReduceMotion}
          onLoadedData={handleVideoReady}
          onCanPlay={handleVideoReady}
        />
      ) : showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt="Motion preview"
          onLoad={handleImageReady}
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            "transition-opacity duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
            imageReady ? "opacity-100" : "opacity-0",
          )}
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
