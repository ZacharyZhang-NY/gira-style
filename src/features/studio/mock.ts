import type { ColdStartAnswers } from "@/features/cold-start/questions";

import type { RecommendationPayload } from "./types";

function normalizeMultiSelect(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export function mockRecommendation(args: {
  requestText: string;
  answers: Partial<ColdStartAnswers> | null;
  versionNumber: number;
}): RecommendationPayload {
  const vibeSelections = normalizeMultiSelect(args.answers?.q1);
  const palette = typeof args.answers?.q2 === "string" ? args.answers.q2 : "";
  const priority = typeof args.answers?.q3 === "string" ? args.answers.q3 : "";
  const focus = typeof args.answers?.q4 === "string" ? args.answers.q4 : "";

  const tone =
    vibeSelections.includes("Effortless & Minimalist")
      ? "clean and tailored"
      : vibeSelections.includes("Romantic & Whimsical")
        ? "soft with polish"
        : vibeSelections.includes("Sporty & Street-Forward")
          ? "sporty with ease"
          : vibeSelections.includes("Bold & Trend-Driven")
            ? "bold with contrast"
            : "polished and modern";

  const comfortNote =
    priority === "Quality & Longevity"
      ? "Investment fabrics with longevity in mind."
      : priority === "Fit & Comfort"
        ? "Easy movement and forgiving fits."
        : priority === "Trend & Novelty"
          ? "Season-right pieces with a little hype."
          : "Balanced, wearable, polished.";

  const description =
    args.requestText.trim() ||
    "A refined look that feels like you—polished, modern, and easy to wear.";

  const baseSku = 128000 + args.versionNumber * 11;
  const baseColor =
    palette === "Warm & Earthy"
      ? "Warm Sand"
      : palette === "Vibrant & Playful"
        ? "Poppy"
        : "Deep Charcoal";
  const bottomItem =
    focus === "Legs"
      ? "Split-Hem Legging"
      : focus === "Comfort & Coverage"
        ? "Wide-Leg Pant"
        : "High-Waist Trouser";

  return {
    description,
    outfit: [
      {
        item_name: vibeSelections.includes("Bold & Trend-Driven") ? "Cropped Leather Jacket" : "Tailored Blazer",
        sku: String(baseSku + 1),
        color: baseColor,
        link: "#",
        reason: `Frames the silhouette—${tone}.`,
        image: "",
      },
      {
        item_name: "Contour Tank",
        sku: String(baseSku + 2),
        color: palette === "Warm & Earthy" ? "Cream" : "Ivory",
        link: "#",
        reason: "A clean base layer that makes everything look intentional.",
        image: "",
      },
      {
        item_name: focus === "Waist & Silhouette" ? "Belted Midi Skirt" : bottomItem,
        sku: String(baseSku + 3),
        color: palette === "Warm & Earthy" ? "Espresso" : "Black",
        link: "#",
        reason: focus ? `Leans into your focus on ${focus.toLowerCase()}.` : "Anchors the outfit while keeping proportions modern.",
        image: "",
      },
      {
        item_name: vibeSelections.includes("Sporty & Street-Forward") ? "Tech Sneaker" : "Sleek Ankle Boot",
        sku: String(baseSku + 4),
        color: "Oxblood",
        link: "#",
        reason: "Finishes the look with a subtle, premium edge.",
        image: "",
      },
    ],
    accessories: [
      {
        item_name: "Minimal gold hoops",
        sku: String(baseSku + 9),
        color: "Gold",
        link: "#",
        reason: "Warm light near the face—small detail, big impact.",
        image: "",
      },
    ],
    other_recommendation:
      "If you want to push it: add a structured bag, a subtle scent, and one piece of intentional jewelry—then stop.",
    reason: `Quietly ${tone}. ${comfortNote}`,
  };
}
