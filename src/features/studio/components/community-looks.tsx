"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/cn";

import type { CommunityLook } from "../types";
import type { RecommendationItem } from "../types";
import { fetchSessionTurnRecommendation } from "../api";
import { OutfitPreview } from "./outfit-preview";
import { ProductGrid } from "./product-grid";

type CommunityLooksProps = {
  looks: CommunityLook[];
  onFeedback: (look: CommunityLook, value: "up" | "down") => void;
  className?: string;
};

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return value.startsWith("http://") || value.startsWith("https://");
}

function buildAritziaSearchUrl(sku: string) {
  return `https://www.aritzia.com/us/en/search?q=${encodeURIComponent(sku)}`;
}

export function CommunityLooks({
  looks,
  onFeedback,
  className,
}: CommunityLooksProps) {
  const [skuModalOpen, setSkuModalOpen] = React.useState(false);
  const [skuLoading, setSkuLoading] = React.useState(false);
  const [skuError, setSkuError] = React.useState("");
  const [skuItems, setSkuItems] = React.useState<RecommendationItem[]>([]);
  const abortRef = React.useRef<AbortController | null>(null);

  const closeSkuModal = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSkuModalOpen(false);
    setSkuLoading(false);
    setSkuError("");
    setSkuItems([]);
  }, []);

  React.useEffect(() => {
    if (!skuModalOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeSkuModal();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closeSkuModal, skuModalOpen]);

  const openSkuModal = React.useCallback(
    (look: CommunityLook) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSkuModalOpen(true);
      setSkuLoading(true);
      setSkuError("");
      setSkuItems([]);

      fetchSessionTurnRecommendation(look.sessionId, look.turnIndex, {
        signal: controller.signal,
      })
        .then((recommendation) => {
          const outfit = Array.isArray(recommendation.outfit)
            ? recommendation.outfit
            : [];
          const accessories = Array.isArray(recommendation.accessories)
            ? recommendation.accessories
            : [];
          const items = [...outfit, ...accessories]
            .map((item) => {
              const sku = typeof item.sku === "string" ? item.sku.trim() : "";
              const link = isHttpUrl(item.link)
                ? item.link
                : sku
                  ? buildAritziaSearchUrl(sku)
                  : undefined;
              return { ...item, link };
            })
            .filter((item) => typeof item.sku === "string" && item.sku.trim().length > 0);
          setSkuItems(items);
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setSkuError(
            err instanceof Error && err.message ? err.message : "SKU unavailable.",
          );
        })
        .finally(() => {
          setSkuLoading(false);
        });
    },
    [],
  );

  if (!looks.length) return null;

  return (
    <section className={cn("space-y-4", className)} aria-label="Most loved looks">
      <h2 className="sr-only">Most loved looks</h2>
      <div
        className={cn(
          "flex gap-4 overflow-x-auto pb-2 no-scrollbar",
          "snap-x snap-mandatory",
          "lg:grid lg:grid-cols-3 lg:grid-rows-2 lg:justify-items-center lg:gap-6 lg:overflow-visible lg:pb-0 lg:snap-none",
        )}
      >
        {looks.map((look) => (
          <Surface
            key={`${look.sessionId}-${look.turnIndex}`}
            className={cn(
              "w-full overflow-hidden p-0",
              "min-w-[220px] max-w-[220px] snap-start",
              "sm:min-w-[240px] sm:max-w-[240px]",
              "lg:min-w-0 lg:max-w-[240px]",
            )}
          >
            <OutfitPreview
              state="done"
              image={look.imageUrl}
              feedback={look.viewerFeedback ?? ""}
              upCount={look.upVotes}
              downCount={look.downVotes}
              onFeedback={(value) => onFeedback(look, value)}
              onPreviewClick={() => openSkuModal(look)}
            />
          </Surface>
        ))}
      </div>

      {skuModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center px-6">
          <button
            type="button"
            aria-label="Close"
            onClick={closeSkuModal}
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
          />
          <Surface
            role="dialog"
            aria-modal="true"
            className={cn(
              "relative w-full max-w-5xl p-6 sm:p-8",
              "max-h-[min(640px,calc(100vh-96px))] overflow-auto",
            )}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                SKUs
              </div>
              <Button tone="ghost" onClick={closeSkuModal} className="h-9 px-3 text-xs">
                Close
              </Button>
            </div>

            <div className="mt-6">
              {skuLoading ? (
                <div className="space-y-2">
                  <div className="h-3 w-10/12 rounded-full bg-[linear-gradient(90deg,rgb(var(--glass-border)_/_0.18)_25%,rgb(var(--glass-border)_/_0.32)_37%,rgb(var(--glass-border)_/_0.18)_63%)] bg-[length:400%_100%] motion-safe:animate-shimmer" />
                  <div className="h-3 w-8/12 rounded-full bg-[linear-gradient(90deg,rgb(var(--glass-border)_/_0.18)_25%,rgb(var(--glass-border)_/_0.32)_37%,rgb(var(--glass-border)_/_0.18)_63%)] bg-[length:400%_100%] motion-safe:animate-shimmer" />
                  <div className="h-3 w-9/12 rounded-full bg-[linear-gradient(90deg,rgb(var(--glass-border)_/_0.18)_25%,rgb(var(--glass-border)_/_0.32)_37%,rgb(var(--glass-border)_/_0.18)_63%)] bg-[length:400%_100%] motion-safe:animate-shimmer" />
                </div>
              ) : skuError ? (
                <p className="text-sm leading-relaxed text-muted">{skuError}</p>
              ) : skuItems.length ? (
                <ProductGrid items={skuItems} className="lg:grid-cols-2" />
              ) : (
                <p className="text-sm leading-relaxed text-muted">No SKU available.</p>
              )}
            </div>
          </Surface>
        </div>
      ) : null}
    </section>
  );
}
