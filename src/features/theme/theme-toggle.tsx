"use client";

import { motion, useReducedMotion } from "framer-motion";
import * as React from "react";

import { cn } from "@/lib/cn";
import { luxTween } from "@/lib/motion";
import { useTheme } from "./theme";

export function ThemeToggle({ className }: { className?: string }) {
  const shouldReduceMotion = useReducedMotion();
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  const transition = luxTween(shouldReduceMotion, 0.7);

  return (
    <div
      className={cn(
        "relative inline-flex items-center rounded-full p-1",
        "ui-glass-subtle",
        className,
      )}
    >
      <span className="sr-only">Theme</span>

      <button
        type="button"
        aria-pressed={!isDark}
        onClick={() => setTheme("light")}
        className={cn(
          "relative z-10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em]",
          "transition-colors duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          !isDark ? "text-text" : "text-muted hover:text-text",
        )}
      >
        Light
        {!isDark ? (
          shouldReduceMotion ? (
            <span
              className={cn(
                "absolute inset-0 -z-10 rounded-full",
                "bg-glass-highlight/30",
                "shadow-lux-md",
              )}
              aria-hidden="true"
            />
          ) : (
            <motion.span
              layoutId="theme-pill"
              className={cn(
                "absolute inset-0 -z-10 rounded-full",
                "bg-glass-highlight/30",
                "shadow-lux-md",
              )}
              transition={transition}
              aria-hidden="true"
            />
          )
        ) : null}
      </button>

      <button
        type="button"
        aria-pressed={isDark}
        onClick={() => setTheme("dark")}
        className={cn(
          "relative z-10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em]",
          "transition-colors duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          isDark ? "text-text" : "text-muted hover:text-text",
        )}
      >
        Night
        {isDark ? (
          shouldReduceMotion ? (
            <span
              className={cn(
                "absolute inset-0 -z-10 rounded-full",
                "bg-glass-highlight/30",
                "shadow-lux-md",
              )}
              aria-hidden="true"
            />
          ) : (
            <motion.span
              layoutId="theme-pill"
              className={cn(
                "absolute inset-0 -z-10 rounded-full",
                "bg-glass-highlight/30",
                "shadow-lux-md",
              )}
              transition={transition}
              aria-hidden="true"
            />
          )
        ) : null}
      </button>
    </div>
  );
}
