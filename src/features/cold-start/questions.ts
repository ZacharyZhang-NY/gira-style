export type ColdStartQuestionId = "q1" | "q2" | "q3";

export type ColdStartAnswers = {
  q1: string;
  q2: string[];
  q3: string[];
  q4: string;
};

export type ColdStartQuestion = {
  id: ColdStartQuestionId;
  title: string;
  hint: string;
  multi?: boolean;
  options: Array<{
    value: string;
    title: string;
    description: string;
  }>;
};

export const COLD_START_QUESTIONS: ColdStartQuestion[] = [
  {
    id: "q1",
    title: "First, what kind of vibe feels most like you?",
    hint: "This helps me learn your taste—so the first look lands closer to home.",
    options: [
      {
        value: "Minimalist Chic",
        title: "Minimalist Chic",
        description: "Clean lines, quiet confidence, and sharp proportions.",
      },
      {
        value: "Soft Romantic",
        title: "Soft Romantic",
        description: "Gentle shapes, polished softness, and a touch of ease.",
      },
      {
        value: "Experimental Edge",
        title: "Experimental Edge",
        description: "Contrast, structure, and a little “don’t play it safe.”",
      },
      {
        value: "Vintage Preppy",
        title: "Vintage Preppy",
        description: "Classic codes, crisp details, and texture that reads premium.",
      },
    ],
  },
  {
    id: "q2",
    title: "Where do you need outfits the most?",
    hint: "We’ll optimize for the moments you repeat—not the one-off fantasy. (Select all that apply.)",
    multi: true,
    options: [
      {
        value: "Everyday",
        title: "Everyday, but elevated",
        description: "Comfortable, effortless, and still looks intentional.",
      },
      {
        value: "Work-ready",
        title: "Work-ready",
        description: "Put-together, modern, and never boring.",
      },
      {
        value: "Date night",
        title: "Date night",
        description: "Flattering, confident, and not trying too hard.",
      },
      {
        value: "Event / Dress Code",
        title: "Event / Dress code",
        description: "Respect the rules—then add your signature.",
      },
    ],
  },
  {
    id: "q3",
    title: "Last one: what matters most when you get dressed?",
    hint: "This sets your default trade-offs (comfort vs. silhouette vs. texture). (Select all that apply.)",
    multi: true,
    options: [
      {
        value: "Comfort first",
        title: "Comfort first",
        description: "Soft, breathable, and wearable for hours.",
      },
      {
        value: "Crisp silhouette",
        title: "Crisp silhouette",
        description: "Clean shape, sharper lines, and an “awake” look.",
      },
      {
        value: "Layering & texture",
        title: "Layering & texture",
        description: "Depth, fabric contrast, and styling nuance.",
      },
      {
        value: "Easy to mix & match",
        title: "Easy to mix & match",
        description: "High re-wear, easy pairings, and reliable formulas.",
      },
    ],
  },
];

export const EMPTY_COLD_START_ANSWERS: ColdStartAnswers = {
  q1: "",
  q2: [],
  q3: [],
  q4: "",
};
