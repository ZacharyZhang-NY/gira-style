"use client";

import type { RecommendationItem } from "./types";

export function getItemImage(item?: RecommendationItem | null) {
  if (!item) return undefined;
  const candidates = [item.image, item.image_url, item.imageUrl];
  return candidates.find((value) => typeof value === "string" && value.length > 0);
}
