"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ThumbsDown, ThumbsUp } from "lucide-react";

import { cn } from "@/lib/cn";

import type { StageState } from "../types";
import { MediaPlaceholder } from "./media-placeholder";

type OutfitPreviewProps = {
  state: StageState;
  image?: string;
  feedback?: "up" | "down" | "";
  onFeedback: (value: "up" | "down") => void;
};

export function OutfitPreview({ state, image, feedback, onFeedback }: OutfitPreviewProps) {
  const shouldReduceMotion = useReducedMotion();
  const [imageReady, setImageReady] = React.useState(false);
  const showLoading = state === "loading";
  const hasImage = typeof image === "string" && image.length > 0;
  const selectedEase: [number, number, number, number] = [0.16, 1, 0.3, 1];
  const selectedTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: selectedEase };

  React.useEffect(() => {
    setImageReady(false);
  }, [image, showLoading]);

  const flowActive = showLoading || (hasImage && !imageReady);
  const showPlaceholder = showLoading || !hasImage || !imageReady;
  const placeholderVariant = flowActive ? "loading" : "mock";

  const handleImageLoad = React.useCallback(() => {
    if (shouldReduceMotion) {
      setImageReady(true);
      return;
    }
    requestAnimationFrame(() => setImageReady(true));
  }, [shouldReduceMotion]);

  return (
    <div className="relative aspect-[9/16] w-full">
      <MediaPlaceholder
        variant={placeholderVariant}
        className={cn(
          "transition-opacity duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
          showPlaceholder ? "opacity-100" : "opacity-0",
        )}
      />
      {hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt="Outfit preview"
          onLoad={handleImageLoad}
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            "transition-opacity duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
            imageReady ? "opacity-100" : "opacity-0",
          )}
        />
      ) : null}

      <div className="absolute left-4 top-4 flex items-center gap-3">
        <div className="rounded-full bg-glass-highlight/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-text">
          Outfit preview
        </div>
      </div>

      {hasImage ? (
        <div className="absolute bottom-4 right-4 flex items-center gap-2">
          <motion.button
            type="button"
            aria-label="Keep this look"
            aria-pressed={feedback === "up"}
            onClick={() => onFeedback("up")}
            initial={false}
            animate={feedback === "up" ? { scale: [1, 1.07, 1] } : { scale: 1 }}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
            transition={selectedTransition}
            className={cn(
              "relative grid h-10 w-10 place-items-center rounded-full text-text",
              "ui-glass-subtle",
              "transition-[transform,box-shadow] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
              "hover:shadow-lux-md motion-safe:hover:-translate-y-0.5",
              feedback === "up" && "!bg-text !text-bg !bg-none shadow-lux-md",
            )}
          >
            <ThumbsUp className="h-4 w-4" aria-hidden="true" />
          </motion.button>
          <motion.button
            type="button"
            aria-label="Refine this look"
            aria-pressed={feedback === "down"}
            onClick={() => onFeedback("down")}
            initial={false}
            animate={feedback === "down" ? { scale: [1, 1.07, 1] } : { scale: 1 }}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
            transition={selectedTransition}
            className={cn(
              "relative grid h-10 w-10 place-items-center rounded-full text-text",
              "ui-glass-subtle",
              "transition-[transform,box-shadow] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
              "hover:shadow-lux-md motion-safe:hover:-translate-y-0.5",
              feedback === "down" && "!bg-text !text-bg !bg-none shadow-lux-md",
            )}
          >
            <ThumbsDown className="h-4 w-4" aria-hidden="true" />
          </motion.button>
        </div>
      ) : null}
    </div>
  );
}
