"use client";

import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/cn";
import { luxTween } from "@/lib/motion";

import type { RecommendationItem } from "../types";
import { getItemImage } from "../item";

function isImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:image/");
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return value.startsWith("http://") || value.startsWith("https://");
}

function ItemMeta({ color }: { color?: string }) {
  if (!color) return null;
  return (
    <div className="mt-2 inline-flex rounded-full bg-glass-highlight/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
      {color}
    </div>
  );
}

export function ProductGrid({
  items,
  className,
}: {
  items: RecommendationItem[];
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const hoverTransition = luxTween(shouldReduceMotion);

  return (
    <div className={cn("grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {items.map((item, idx) => {
        const imageUrl = getItemImage(item);
        const hasImage = isImageUrl(imageUrl);
        const href = isHttpUrl(item.link) ? item.link : undefined;
        return (
          <motion.a
            key={`${item.sku || item.item_name || "item"}-${idx}`}
            href={href}
            target={href ? "_blank" : undefined}
            rel={href ? "noreferrer" : undefined}
            aria-disabled={!href}
            onClick={(e) => {
              if (href) return;
              e.preventDefault();
            }}
            className={cn(
              "group relative h-full overflow-hidden rounded-2xl ui-glass-subtle p-4 text-left",
              href ? "cursor-pointer" : "cursor-default opacity-70",
            )}
            whileHover={shouldReduceMotion ? undefined : { y: -6 }}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.99, y: 0 }}
            transition={hoverTransition}
          >
            <div
              className={cn(
                "relative h-60 w-full overflow-hidden rounded-xl bg-transparent",
                "transition-[transform,filter,box-shadow] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                shouldReduceMotion ? "duration-0" : "duration-[1800ms]",
                "filter grayscale-0",
                "will-change-transform",
                "group-hover:shadow-lux-md",
                "group-hover:scale-[1.02] motion-reduce:transform-none",
              )}
            >
              {hasImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl!}
                  alt={item.item_name ? `${item.item_name} product image` : "Recommended product image"}
                  className={cn(
                    "absolute inset-0 h-full w-full object-contain p-3",
                    "transition-opacity ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                    shouldReduceMotion ? "duration-0" : "duration-[900ms]",
                    "opacity-100",
                  )}
                />
              ) : null}
            </div>

            <div className="mt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="truncate font-display text-xl leading-tight tracking-tight text-text">
                    {item.item_name || "Item"}
                  </div>
                  <ItemMeta color={item.color} />
                </div>
              </div>
            </div>
          </motion.a>
        );
      })}
    </div>
  );
}
