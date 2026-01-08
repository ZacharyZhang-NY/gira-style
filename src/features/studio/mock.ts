import type { ColdStartAnswers } from "@/features/cold-start/questions";

import type { RecommendationPayload } from "./types";

export function mockRecommendation(args: {
  requestText: string;
  answers: Partial<ColdStartAnswers> | null;
  versionNumber: number;
}): RecommendationPayload {
  const vibe = args.answers?.q1 || "";
  const priority = args.answers?.q3 || "";

  const tone =
    vibe === "Experimental Edge"
      ? "structured with contrast"
      : vibe === "Soft Romantic"
        ? "soft with polish"
        : vibe === "Vintage Preppy"
          ? "classic with crisp details"
          : "clean and tailored";

  const comfortNote =
    priority === "Comfort first"
      ? "Breathable layers, easy movement."
      : priority === "Crisp silhouette"
        ? "Crisp lines, clean proportions."
        : priority === "Layering & texture"
          ? "Texture-forward, softly layered."
          : priority === "Easy to mix & match"
            ? "High re-wear, effortless pairing."
            : "Balanced, wearable, polished.";

  const description =
    args.requestText.trim() ||
    "A refined look that feels like you—polished, modern, and easy to wear.";

  const baseSku = 128000 + args.versionNumber * 11;

  return {
    description,
    outfit: [
      {
        item_name: vibe === "Experimental Edge" ? "Cropped Leather Jacket" : "Tailored Blazer",
        sku: String(baseSku + 1),
        color: "Deep Charcoal",
        link: "#",
        reason: `Frames the silhouette—${tone}.`,
        image: "",
      },
      {
        item_name: "Contour Tank",
        sku: String(baseSku + 2),
        color: "Ivory",
        link: "#",
        reason: "A clean base layer that makes everything look intentional.",
        image: "",
      },
      {
        item_name: vibe === "Soft Romantic" ? "Bias Midi Skirt" : "Straight-Leg Trouser",
        sku: String(baseSku + 3),
        color: vibe === "Vintage Preppy" ? "Espresso" : "Black",
        link: "#",
        reason: "Anchors the outfit while keeping proportions modern.",
        image: "",
      },
      {
        item_name: vibe === "Vintage Preppy" ? "Leather Loafer" : "Sleek Ankle Boot",
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
