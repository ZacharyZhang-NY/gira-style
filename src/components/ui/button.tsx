"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import type * as React from "react";

import { cn } from "@/lib/cn";
import { luxTween, LUX_DURATION } from "@/lib/motion";

type ButtonTone = "primary" | "outline" | "ghost";

type ButtonProps = Omit<HTMLMotionProps<"button">, "ref" | "children"> & {
  tone?: ButtonTone;
  isLoading?: boolean;
  children?: React.ReactNode;
};

export function Button({
  className,
  tone = "primary",
  isLoading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const shouldReduceMotion = useReducedMotion();
  const isDisabled = disabled || isLoading;
  const transition = luxTween(shouldReduceMotion);

  return (
    <motion.button
      whileHover={shouldReduceMotion ? undefined : { y: -1, scale: 1.01 }}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.99, y: 0 }}
      transition={transition}
      className={cn(
        "group relative isolate inline-flex select-none items-center justify-center gap-2",
        "rounded-full px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.22em]",
        "transition-[color,background,box-shadow,transform,border-color] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        tone === "primary" && [
          "bg-text text-bg shadow-lux-md",
          "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-full",
          "before:bg-[linear-gradient(135deg,rgba(255,255,255,0.18),rgba(255,255,255,0)_42%)]",
          "before:opacity-0 before:transition-opacity before:duration-700 before:ease-[cubic-bezier(0.16,1,0.3,1)]",
          "group-hover:before:opacity-100",
          "after:pointer-events-none after:absolute after:inset-[-2px] after:-z-20 after:rounded-full",
          "after:bg-[radial-gradient(180px_140px_at_18%_0%,rgba(212,175,55,0.30),transparent_65%)]",
          "after:opacity-80",
        ],
        tone === "outline" && [
          "ui-glass-subtle",
          "border border-border/12 text-text shadow-lux-md",
          "hover:border-border/20",
          "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-full",
          "before:bg-[radial-gradient(180px_140px_at_16%_0%,rgba(255,255,255,0.34),transparent_62%)]",
          "before:opacity-0 before:transition-opacity before:duration-700 before:ease-[cubic-bezier(0.16,1,0.3,1)]",
          "group-hover:before:opacity-100",
        ],
        tone === "ghost" && [
          "bg-transparent text-text",
          "hover:bg-glass/35 hover:shadow-lux-md",
        ],
        className,
      )}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? (
        <span className="relative inline-flex h-4 w-4">
          <span
            className={cn(
              "absolute inset-0 border motion-safe:animate-spin",
              "border-glass-border/35",
              tone === "primary" ? "border-bg/35 border-t-bg" : "border-text/20 border-t-text",
              shouldReduceMotion ? "animate-none" : "animate-spin",
            )}
            style={shouldReduceMotion ? { animationDuration: "0ms" } : { animationDuration: `${LUX_DURATION.slow}s` }}
          />
        </span>
      ) : null}
      <span className={cn(isLoading && "opacity-80")}>{children}</span>
    </motion.button>
  );
}
