"use client";

import { useReducedMotion } from "framer-motion";
import * as React from "react";

export function LiquidPointer() {
  const shouldReduceMotion = useReducedMotion();

  React.useEffect(() => {
    if (shouldReduceMotion) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(pointer: coarse)").matches) return;

    let raf = 0;
    const root = document.documentElement;

    const update = (x: number, y: number) => {
      root.style.setProperty("--mx", `${Math.round(x * 100)}%`);
      root.style.setProperty("--my", `${Math.round(y * 100)}%`);
    };

    const onMove = (event: PointerEvent) => {
      const nextX = event.clientX / Math.max(1, window.innerWidth);
      const nextY = event.clientY / Math.max(1, window.innerHeight);

      cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => update(nextX, nextY));
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [shouldReduceMotion]);

  return null;
}

