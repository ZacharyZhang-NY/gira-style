"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { luxTween } from "@/lib/motion";

import { VideoToggle } from "./video-toggle";

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
  disableComposer: boolean;
  disableVideoToggle: boolean;
  videoEnabled: boolean;
  messages: ChatMessage[];
  onSubmitRequest: (value: string) => void;
  onToggleVideo: (value: boolean) => void;
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
  disableComposer,
  disableVideoToggle,
  videoEnabled,
  messages,
  onSubmitRequest,
  onToggleVideo,
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
          <div className="flex items-center justify-between rounded-full px-4 py-2 ui-glass-subtle">
            <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
              <span>Video</span>
              <span
                className={cn(
                  "rounded-full px-2 py-1 text-[10px] font-semibold tracking-[0.24em]",
                  videoEnabled ? "text-text" : "text-muted/70",
                )}
              >
                {videoEnabled ? "On" : "Off"}
              </span>
            </div>
            <VideoToggle enabled={videoEnabled} disabled={disableVideoToggle} onToggle={onToggleVideo} />
          </div>
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
              rows={1}
              className={cn(
                "h-12 flex-1 py-3",
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
