"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { luxTween, LUX_DURATION } from "@/lib/motion";

type IntentModalProps = {
  isOpen: boolean;
  defaultValue?: string;
  onSubmit: (requestText: string) => void;
};

export function IntentModal({ isOpen, defaultValue = "", onSubmit }: IntentModalProps) {
  const shouldReduceMotion = useReducedMotion();
  const transition = luxTween(shouldReduceMotion, LUX_DURATION.base);
  const [value, setValue] = React.useState(defaultValue);
  const [error, setError] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    setValue(defaultValue);
    setError("");
  }, [defaultValue, isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Give me one sentence—where are you headed, and how do you want to feel?");
      return;
    }
    setError("");
    onSubmit(trimmed);
  }

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-50"
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
          transition={transition}
        >
          <div className="absolute inset-0 bg-text/65" aria-hidden="true" />

          <div className="relative mx-auto mt-20 w-full max-w-xl px-5">
            <motion.div
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10, scale: 0.98 }}
              transition={transition}
            >
              <Surface
                role="dialog"
                aria-modal="true"
                aria-labelledby="intentTitle"
                className="p-8 sm:p-10"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 id="intentTitle" className="font-display text-2xl leading-[1.1] tracking-tight text-text sm:text-3xl">
                      Tell me where you&apos;re headed.
                    </h3>
                    <p className="mt-4 text-sm leading-relaxed text-muted">
                      Time, place, weather—and how you want to feel. One sentence is plenty.
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  <label
                    htmlFor="intentText"
                    className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted"
                  >
                    Your request <span className="text-muted">(required)</span>
                  </label>
                  <Textarea
                    ref={textareaRef}
                    id="intentText"
                    value={value}
                    onChange={(e) => {
                      setValue(e.target.value);
                      setError("");
                    }}
                    rows={4}
                    placeholder="Dinner date, cool weather. Refined, modern, a little dramatic—nothing fussy."
                    className={cn(error && "border-gold")}
                  />
                  {error ? (
                    <p role="alert" className="text-sm text-text">
                      {error}
                    </p>
                  ) : null}
                </div>

                <div className="mt-5 flex items-center justify-end">
                  <Button onClick={submit} className="min-w-44">
                    Look at what you&apos;ve got
                  </Button>
                </div>
              </Surface>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
