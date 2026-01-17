import type { ColdStartAnswers } from "@/features/cold-start/questions";

function normalizeMultiSelect(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export function buildStyleDnaLabel(answers: Partial<ColdStartAnswers> | null | undefined) {
  if (!answers) return "";
  const q1 = normalizeMultiSelect(answers.q1).join(", ");
  const q2 = normalizeMultiSelect(answers.q2).join(", ");
  const q3 = normalizeMultiSelect(answers.q3).join(", ");
  const q4 = typeof answers.q4 === "string" ? answers.q4 : "";
  return [q1, q2, q3, q4].filter(Boolean).join(" · ");
}

export function buildPersonaSummary(answers: Partial<ColdStartAnswers> | null | undefined) {
  const q1 = normalizeMultiSelect(answers?.q1);
  const q2 = normalizeMultiSelect(answers?.q2);
  const q3 = normalizeMultiSelect(answers?.q3);
  const q4 = typeof answers?.q4 === "string" ? answers.q4 : "";
  const palette = q2[0] ?? "";
  const priorityValue = q3[0] ?? "";

  const vibe = q1.length
    ? q1.length === 1
      ? `You feel most at home in ${q1[0]}.`
      : `You blend ${q1.slice(0, -1).join(", ")} and ${q1[q1.length - 1]}.`
    : "";

  const context =
    palette === "The Modern Neutrals"
      ? "Your palette is anchored in modern neutrals."
      : palette === "Warm & Earthy"
        ? "You lean into warm, earthy tones."
        : palette === "Vibrant & Playful"
          ? "You like playful color and prints."
          : "";

  const priority =
    priorityValue === "Quality & Longevity"
      ? "You prioritize investment pieces and longevity."
      : priorityValue === "Fit & Comfort"
        ? "Fit and comfort are non-negotiable."
        : priorityValue === "Trend & Novelty"
          ? "You want the it piece of the season."
          : "";

  const focus =
    q4 === "Waist & Silhouette"
      ? "You like waist definition and sculpted shapes."
      : q4 === "Legs"
        ? "You enjoy shorter hemlines or long, leg-lengthening lines."
        : q4 === "Comfort & Coverage"
          ? "You prefer relaxed fits with coverage."
          : "";

  const sentence = [vibe, context, priority, focus].filter(Boolean).join(" ");
  return sentence || "We’ll learn your taste as we go—one great look at a time.";
}
