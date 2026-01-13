"use client";

import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/cn";
import { luxTween } from "@/lib/motion";

type VideoToggleProps = {
  enabled: boolean;
  disabled: boolean;
  onToggle: (value: boolean) => void;
};

export function VideoToggle({ enabled, disabled, onToggle }: VideoToggleProps) {
  const shouldReduceMotion = useReducedMotion();
  const transition = luxTween(shouldReduceMotion, 0.22);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? "Video preview on" : "Video preview off"}
      onClick={() => onToggle(!enabled)}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-9 w-[74px] items-center rounded-full p-1",
        "border border-glass-border/35 ui-glass-subtle",
        "transition-[box-shadow,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        "hover:shadow-lux-md motion-safe:hover:-translate-y-0.5",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      <motion.span
        className={cn(
          "absolute left-1 top-1 h-7 w-7 rounded-full",
          "bg-[linear-gradient(150deg,rgba(255,255,255,0.92),rgba(210,210,210,0.85))]",
          "shadow-[0_6px_16px_rgba(15,15,15,0.12)]",
        )}
        animate={{ x: enabled ? 34 : 0 }}
        transition={transition}
      />
      <span className="sr-only">Toggle video preview</span>
    </button>
  );
}
