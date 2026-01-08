"use client";

import * as React from "react";

import { cn } from "@/lib/cn";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  tone?: "default" | "muted";
};

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, tone = "default", rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        "w-full resize-none rounded-xl px-4 py-3 text-sm leading-relaxed text-text",
        "ui-glass-subtle",
        "placeholder:text-muted/70",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-0",
        "transition-[box-shadow,background,border-color] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        tone === "muted" && "text-muted",
        className,
      )}
      {...props}
    />
  );
});
