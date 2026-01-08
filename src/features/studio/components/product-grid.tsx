"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { luxTween, LUX_DURATION } from "@/lib/motion";

import type { RecommendationItem } from "../types";
import { makeSwatchStyle } from "../swatch";

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

type QuickViewProps = {
  isOpen: boolean;
  item: RecommendationItem | null;
  index: number;
  onClose: () => void;
};

function QuickView({ isOpen, item, index, onClose }: QuickViewProps) {
  const shouldReduceMotion = useReducedMotion();
  const transition = luxTween(shouldReduceMotion, LUX_DURATION.base);

  React.useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const href = isHttpUrl(item?.link) ? item?.link : undefined;
  const hasImage = isHttpUrl(item?.image);
  const swatchSeed = [item?.item_name, item?.color, String(index)].filter(Boolean).join(" · ");

  return (
    <AnimatePresence>
      {isOpen && item ? (
        <motion.div
          className="fixed inset-0 z-50"
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
          transition={transition}
        >
          <button
            type="button"
            aria-label="Close product details"
            onClick={onClose}
            className="absolute inset-0 bg-text/55"
          />

          <div className="relative mx-auto mt-16 w-full max-w-2xl px-5 pb-10">
            <motion.div
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 16, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 12, scale: 0.99 }}
              transition={transition}
            >
              <Surface className="p-6 sm:p-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Details</div>
                    <h3 className="mt-2 font-display text-3xl leading-[1.08] tracking-tight text-text">
                      {item.item_name || "Item"}
                    </h3>
                    <ItemMeta color={item.color} />
                  </div>

                  <div className="flex items-center gap-2">
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex"
                      >
                        <Button tone="outline" className="px-5">
                          Open store
                        </Button>
                      </a>
                    ) : null}
                    <Button tone="ghost" onClick={onClose} className="px-5">
                      Close
                    </Button>
                  </div>
                </div>

                <div className="mt-6 grid gap-6 md:grid-cols-2">
                  <div
                    className={cn(
                      "relative h-56 w-full overflow-hidden rounded-2xl",
                      "shadow-lux-md",
                      "bg-[linear-gradient(135deg,rgb(var(--glass-border)_/_0.10),rgb(var(--glass-border)_/_0.04))]",
                    )}
                  >
                    <div className="absolute inset-0" style={makeSwatchStyle(swatchSeed)} aria-hidden="true" />
                    {hasImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image!}
                        alt={item.item_name ? `${item.item_name} product image` : "Recommended product image"}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : null}
                    <div
                      className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_rgb(var(--glass-border)_/_0.24)]"
                      aria-hidden="true"
                    />
                  </div>

                  <div className="space-y-4">
                    {item.reason ? (
                      <p className="text-sm leading-relaxed text-text">{item.reason}</p>
                    ) : (
                      <p className="text-sm leading-relaxed text-muted">
                        A refined pick—clean lines, premium finish, and easy to wear.
                      </p>
                    )}

                    {item.sku ? (
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                        SKU <span className="text-text">{item.sku}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </Surface>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function ProductGrid({ items }: { items: RecommendationItem[] }) {
  const shouldReduceMotion = useReducedMotion();
  const hoverTransition = luxTween(shouldReduceMotion);

  const [openIndex, setOpenIndex] = React.useState<number | null>(null);
  const activeItem = openIndex === null ? null : items[openIndex] || null;

  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, idx) => {
          const hasImage = isHttpUrl(item.image);
          const swatchSeed = [item.item_name, item.color, String(idx)].filter(Boolean).join(" · ");

          return (
            <motion.button
              key={`${item.sku || item.item_name || "item"}-${idx}`}
              type="button"
              onClick={() => setOpenIndex(idx)}
              className={cn(
                "group relative h-full overflow-hidden rounded-2xl ui-glass-subtle p-4 text-left",
                "cursor-pointer",
              )}
              whileHover={shouldReduceMotion ? undefined : { y: -6 }}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.99, y: 0 }}
              transition={hoverTransition}
            >
              <div
                className={cn(
                  "relative h-52 w-full overflow-hidden rounded-xl",
                  "transition-[transform,filter,box-shadow] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                  shouldReduceMotion ? "duration-0" : "duration-[1800ms]",
                  "filter grayscale group-hover:grayscale-0",
                  "will-change-transform",
                  "group-hover:shadow-lux-md",
                  "group-hover:scale-[1.02] motion-reduce:transform-none",
                )}
                style={makeSwatchStyle(swatchSeed)}
              >
                {hasImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image!}
                    alt={item.item_name ? `${item.item_name} product image` : "Recommended product image"}
                    className={cn(
                      "absolute inset-0 h-full w-full object-cover",
                      "opacity-0 transition-opacity ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                      shouldReduceMotion ? "duration-0" : "duration-[1800ms]",
                      "group-hover:opacity-100",
                    )}
                  />
                ) : null}
                <div
                  className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_rgb(var(--glass-border)_/_0.28)]"
                  aria-hidden="true"
                />
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

              <p className={cn("mt-3 text-sm leading-relaxed text-muted ui-clamp-2", "min-h-[3.25rem]")}>
                {item.reason || ""}
              </p>
            </motion.button>
          );
        })}
      </div>

      <QuickView isOpen={openIndex !== null} item={activeItem} index={openIndex ?? 0} onClose={() => setOpenIndex(null)} />
    </>
  );
}
