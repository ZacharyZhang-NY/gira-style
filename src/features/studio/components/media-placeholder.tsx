"use client";

import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/cn";

type MediaPlaceholderProps = {
  variant: "loading" | "mock";
  className?: string;
};

export function MediaPlaceholder({ variant, className }: MediaPlaceholderProps) {
  const shouldReduceMotion = useReducedMotion();
  const showLoading = variant === "loading";

  return (
    <div
      className={cn("pointer-events-none absolute inset-0 flex items-center justify-center", className)}
      aria-hidden="true"
    >
      <div
        className={cn(
          "relative h-[82%] w-[70%] rounded-[32px] border border-glass-border/45",
          showLoading && "motion-safe:animate-pulse",
        )}
      >
        <svg
          viewBox="0 0 200 320"
          aria-hidden="true"
          className={cn(
            "absolute inset-0 h-full w-full",
            variant === "mock" ? "text-muted/45" : "text-muted/35",
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="14" y="14" width="172" height="292" rx="30" />
          <circle cx="100" cy="70" r="20" />
          <rect
            x="60"
            y="104"
            width="80"
            height="138"
            rx="28"
            fill={variant === "mock" ? "currentColor" : "none"}
            fillOpacity={variant === "mock" ? 0.12 : 0}
          />
          <rect
            x="70"
            y="246"
            width="60"
            height="36"
            rx="18"
            fill={variant === "mock" ? "currentColor" : "none"}
            fillOpacity={variant === "mock" ? 0.1 : 0}
          />
        </svg>

        {!shouldReduceMotion && showLoading ? (
          <motion.div
            className="absolute inset-0 rounded-[32px] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)] opacity-0"
            animate={{ x: ["-45%", "45%"], opacity: [0, 0.8, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: [0.16, 1, 0.3, 1] }}
          />
        ) : null}
      </div>
    </div>
  );
}
