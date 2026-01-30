type ChipCategory = {
  id: string;
  questions: string[];
};

const SEED_CHIP_CATEGORIES: ChipCategory[] = [
  {
    id: "occasion",
    questions: [
      "Find me an outfit for a party",
      "What should I wear often to work?",
      "Date night inspiration",
      "Formal event dressing",
      "Casual weekend vibes",
    ],
  },
  {
    id: "style-preference",
    questions: [
      "Minimalist chic",
      "Bohemian flair",
      "Sporty and comfortable",
      "Classic and elegant",
      "Trend-focused suggestions",
    ],
  },
  {
    id: "body-focus",
    questions: [
      "Highlight my waist",
      "Find the perfect jeans",
      "Flattering fits for my shape",
      "elongate my silhouette",
      "Best outfits for my height",
    ],
  },
  {
    id: "budget-experimentation",
    questions: [
      "Budget-friendly finds",
      "Try a new style!",
      "Step out of my comfort zone",
      "Surprise me with a bold look",
      "Experiment with trends",
    ],
  },
];

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function getRandomSeedChips(count = 3) {
  const total = SEED_CHIP_CATEGORIES.length;
  const target = Math.max(0, Math.min(count, total));
  const categories = shuffle(SEED_CHIP_CATEGORIES).slice(0, target);
  return categories.map((category) => {
    const options = category.questions;
    return options[Math.floor(Math.random() * options.length)];
  });
}
