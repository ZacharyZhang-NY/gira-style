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
  heading?: string;
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
  mobileOutputs?: Record<string, React.ReactNode>;
  onSubmitRequest: (value: string) => void;
  onInterrupt?: () => void;
  onToggleVideo: (value: boolean) => void;
};

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const shouldReduceMotion = useReducedMotion();
  const transition = luxTween(shouldReduceMotion);
  const isUser = msg.role === "user";
  const isAssistant = msg.role === "assistant";
  const hasHeader = Boolean(msg.heading?.trim() || msg.meta);

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
          isAssistant && [
            "max-lg:!bg-white max-lg:!bg-none max-lg:!border max-lg:!border-black/10 max-lg:!shadow-none",
            "max-lg:text-black",
          ],
          isUser && [
            "!bg-text/80 !bg-none !border-0 !shadow-lux-md",
            "text-bg",
            "max-w-[85%] ml-auto",
          ],
        )}
      >
        {hasHeader ? (
          <div
            className={cn(
              "flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted",
              isAssistant && "max-lg:text-black",
              isUser && "text-bg",
            )}
          >
            <span>{msg.heading}</span>
            {msg.meta ? (
              <span
                className={cn(
                  "text-muted/70",
                  isAssistant && "max-lg:text-black",
                  isUser && "text-bg/80",
                )}
              >
                {msg.meta}
              </span>
            ) : null}
          </div>
        ) : null}
        <div
          className={cn(
            "whitespace-pre-wrap text-sm leading-relaxed text-text",
            hasHeader && "mt-2",
            isAssistant && "max-lg:text-black",
            isUser && "text-bg",
          )}
        >
          {msg.text}
        </div>
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
  mobileOutputs,
  onSubmitRequest,
  onInterrupt,
  onToggleVideo,
}: ChatPanelProps) {
  const shouldReduceMotion = useReducedMotion();
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const scrollToBottom = React.useCallback(
    (behavior: ScrollBehavior = "auto") => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior,
      });
    },
    [],
  );

  React.useEffect(() => {
    requestAnimationFrame(() => scrollToBottom("smooth"));
  }, [messages.length, scrollToBottom]);

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Type a request first—one sentence is enough.");
      return;
    }
    setError("");
    setValue("");
    onSubmitRequest(trimmed);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    handleSubmit();
  }
  return (
    <Surface
      tone="flush"
      className={cn(
        "flex h-[min(720px,calc(100vh-140px))] min-h-[520px] flex-col overflow-hidden",
        "lg:ui-glass",
        "max-lg:!h-[calc(100vh-140px)] max-lg:!min-h-0 max-lg:!rounded-none",
      )}
    >
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        <AnimatePresence initial={false}>
          <div className="flex flex-col gap-3">
            {messages.map((msg) => {
              const outputKey =
                msg.role === "assistant" && msg.id.endsWith("-assistant")
                  ? msg.id.replace(/-assistant$/, "")
                  : null;
              const output = outputKey ? mobileOutputs?.[outputKey] : null;

              return (
                <div key={msg.id} className="flex flex-col">
                  <ChatBubble msg={msg} />
                  {output ? (
                    <div className="mt-4 lg:hidden">{output}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </AnimatePresence>
      </div>

      <div className="px-6 py-5 max-lg:sticky max-lg:bottom-0 max-lg:z-10">
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
            <VideoToggle
              enabled={videoEnabled}
              disabled={disableVideoToggle}
              onToggle={onToggleVideo}
            />
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
              onKeyDown={(e) => {
                if (
                  e.key !== "Enter" ||
                  e.shiftKey ||
                  e.nativeEvent.isComposing
                ) {
                  return;
                }
                e.preventDefault();
                handleSubmit();
              }}
              rows={1}
              className={cn(
                "h-12 flex-1 py-3",
                "disabled:cursor-not-allowed disabled:opacity-50",
                error && "border-gold",
              )}
              disabled={disableComposer}
            />

            {isBusy && onInterrupt ? (
              <Button
                type="button"
                tone="outline"
                onClick={onInterrupt}
                className="px-4"
              >
                Stop
              </Button>
            ) : null}

            <Button
              type="submit"
              isLoading={isBusy}
              disabled={disableComposer}
              className="px-5"
            >
              Send
            </Button>
          </div>

          <AnimatePresence>
            {error ? (
              <motion.p
                role="alert"
                initial={
                  shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={
                  shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }
                }
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
