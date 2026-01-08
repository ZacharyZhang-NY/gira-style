"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { luxTween } from "@/lib/motion";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  heading: string;
  meta?: string;
  text: string;
  highlight?: boolean;
};

type ChatPanelProps = {
  isBusy: boolean;
  versionLabel: string;
  disablePrev: boolean;
  disableNext: boolean;
  disableComposer: boolean;
  feedback: "" | "up" | "down";
  messages: ChatMessage[];
  onPrevVersion: () => void;
  onNextVersion: () => void;
  onFeedback: (value: "up" | "down") => void;
  onSubmitRequest: (value: string) => void;
};

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const shouldReduceMotion = useReducedMotion();
  const transition = luxTween(shouldReduceMotion);

  return (
    <motion.div
      layout={!shouldReduceMotion}
      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
      transition={transition}
      className="w-full"
    >
      <Surface
        tone="subtle"
        className={cn(
          "w-full px-5 py-4",
          msg.highlight && "shadow-lux-md ui-glass-press",
        )}
      >
        <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
          <span>{msg.heading}</span>
          {msg.meta ? <span className="text-muted/70">{msg.meta}</span> : null}
        </div>
        <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-text">{msg.text}</div>
      </Surface>
    </motion.div>
  );
}

export function ChatPanel({
  isBusy,
  versionLabel,
  disablePrev,
  disableNext,
  disableComposer,
  feedback,
  messages,
  onPrevVersion,
  onNextVersion,
  onFeedback,
  onSubmitRequest,
}: ChatPanelProps) {
  const shouldReduceMotion = useReducedMotion();
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Type a request first—one sentence is enough.");
      return;
    }
    setError("");
    setValue("");
    onSubmitRequest(trimmed);
  }

  return (
    <Surface className="flex h-[min(720px,calc(100vh-140px))] min-h-[520px] flex-col overflow-hidden">
      <div className="px-6 py-6">
        <Surface tone="subtle" className="flex flex-wrap items-center justify-between gap-4 p-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous version"
              onClick={onPrevVersion}
              disabled={disablePrev}
              className={cn(
                "grid h-10 w-10 place-items-center rounded-full text-text",
                "ui-glass-subtle",
                "transition-[transform,box-shadow] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                "hover:shadow-lux-md motion-safe:hover:-translate-y-0.5",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="min-w-24 text-center text-sm font-semibold text-text">
              <span className="inline-flex rounded-full bg-glass-highlight/20 px-3 py-2">{versionLabel}</span>
            </div>
            <button
              type="button"
              aria-label="Next version"
              onClick={onNextVersion}
              disabled={disableNext}
              className={cn(
                "grid h-10 w-10 place-items-center rounded-full text-text",
                "ui-glass-subtle",
                "transition-[transform,box-shadow] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                "hover:shadow-lux-md motion-safe:hover:-translate-y-0.5",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              tone={feedback === "up" ? "primary" : "outline"}
              onClick={() => onFeedback("up")}
              disabled={disableComposer}
              className="px-3"
            >
              Keep
            </Button>
            <Button
              tone={feedback === "down" ? "primary" : "outline"}
              onClick={() => onFeedback("down")}
              disabled={disableComposer}
              className="px-3"
            >
              Refine
            </Button>
          </div>
        </Surface>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        <AnimatePresence initial={false}>
          <div className="flex flex-col gap-3">
            {messages.map((msg) => (
              <ChatBubble key={msg.id} msg={msg} />
            ))}
          </div>
        </AnimatePresence>
      </div>

      <div className="px-6 py-5">
        <form onSubmit={submit} className="space-y-2">
          <div className="flex items-end gap-4">
            <label htmlFor="refineInput" className="sr-only">
              New request
            </label>
            <Textarea
              id="refineInput"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError("");
              }}
              rows={2}
              placeholder="More formal. Sharper silhouette. Keep it warm."
              className={cn(
                "min-h-[44px] flex-1",
                "disabled:cursor-not-allowed disabled:opacity-50",
                error && "border-gold",
              )}
              disabled={disableComposer}
            />

            <Button
              type="submit"
              isLoading={isBusy}
              disabled={disableComposer}
              className="px-5"
            >
              Refine
            </Button>
          </div>

          <AnimatePresence>
            {error ? (
              <motion.p
                role="alert"
                initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
                transition={luxTween(shouldReduceMotion, 0.35)}
                className="text-sm text-text"
              >
                {error}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </form>
      </div>
    </Surface>
  );
}
