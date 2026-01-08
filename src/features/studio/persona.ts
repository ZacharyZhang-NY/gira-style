import type { ColdStartAnswers } from "@/features/cold-start/questions";

export function buildStyleDnaLabel(answers: Partial<ColdStartAnswers> | null | undefined) {
  if (!answers) return "";
  return [answers.q1, answers.q2, answers.q3].filter(Boolean).join(" · ");
}

export function buildPersonaSummary(answers: Partial<ColdStartAnswers> | null | undefined) {
  const q1 = answers?.q1 || "";
  const q2 = answers?.q2 || "";
  const q3 = answers?.q3 || "";

  const vibe =
    q1 === "Minimalist Chic"
      ? "Clean lines and quiet confidence."
      : q1 === "Soft Romantic"
        ? "Softness, polish, and an easy elegance."
        : q1 === "Experimental Edge"
          ? "Contrast, structure, and a little bite."
          : q1 === "Vintage Preppy"
            ? "Classic codes with modern restraint."
            : "";

  const context =
    q2 === "Everyday"
      ? "You want repeatable formulas that still feel intentional."
      : q2 === "Work-ready"
        ? "You like to look sharp, modern, and fully in control."
        : q2 === "Date night"
          ? "You want confidence that reads effortless, not loud."
          : q2 === "Event / Dress Code"
            ? "You want to respect the rules—then make them yours."
            : "";

  const priority =
    q3 === "Comfort first"
      ? "Comfort stays non-negotiable."
      : q3 === "Crisp silhouette"
        ? "Silhouette comes first—everything else follows."
        : q3 === "Layering & texture"
          ? "Texture and layering are your signature moves."
          : q3 === "Easy to mix & match"
            ? "You value high re-wear and easy pairings."
            : "";

  const sentence = [vibe, context, priority].filter(Boolean).join(" ");
  return sentence || "We’ll learn your taste as we go—one great look at a time.";
}

