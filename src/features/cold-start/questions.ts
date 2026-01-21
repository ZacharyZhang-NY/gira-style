export type ColdStartQuestionId = "q1" | "q2" | "q3" | "q4";

export type ColdStartAnswers = {
  q1: string[];
  q2: string[];
  q3: string[];
  q4: string;
  zipCode: string;
  location?: {
    latitude?: number;
    longitude?: number;
    source?: "geolocation" | "manual";
  };
  styleNote: string;
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
    title: 'To start curating your studio, which of these style universes feels most like "home" to you?',
    hint: "Select all that apply.",
    multi: true,
    options: [
      {
        value: "Effortless & Minimalist",
        title: "Effortless & Minimalist",
        description: "Tailored, neutral, structured, architectural.",
      },
      {
        value: "Romantic & Whimsical",
        title: "Romantic & Whimsical",
        description: "Vintage-inspired, soft drapes, floral, feminine.",
      },
      {
        value: "Sporty & Street-Forward",
        title: "Sporty & Street-Forward",
        description: "Athleisure, fleece, oversized, technical.",
      },
      {
        value: "Bold & Trend-Driven",
        title: "Bold & Trend-Driven",
        description: "Playful cuts, crop tops, high-fashion experiments.",
      },
    ],
  },
  {
    id: "q2",
    title: "If we opened your closet right now, which color palette would dominate?",
    hint: "Select all that apply.",
    multi: true,
    options: [
      {
        value: "The Modern Neutrals",
        title: "The Modern Neutrals",
        description:
          "Black, White, Grey, and Navy. Agent mode: Monochromatic Chic. Focus on texture differences rather than color contrast.",
      },
      {
        value: "Warm & Earthy",
        title: "Warm & Earthy",
        description:
          'Creams, Browns, Rusts, and Olives. Agent mode: Tonal Layering. Prioritize the "Wilfred" aesthetic and warm-tone lighting in generated images.',
      },
      {
        value: "Vibrant & Playful",
        title: "Vibrant & Playful",
        description:
          'Bright pops of color, pastels, or prints. Agent mode: Statement Styling. Prioritize "Seasonal" colors and "Sunday Best" prints.',
      },
    ],
  },
  {
    id: "q3",
    title: "When adding a new piece to your closet, what is the absolute non-negotiable?",
    hint: "Select all that apply.",
    multi: true,
    options: [
      {
        value: "Quality & Longevity",
        title: "Quality & Longevity",
        description:
          "Profile: The Investment Shopper. Strategy: Recommend higher price-point natural fibers (wool, silk, cashmere). Highlight durability.",
      },
      {
        value: "Fit & Comfort",
        title: "Fit & Comfort",
        description:
          'Profile: The Fit-Critical Shopper (High Return Risk). Strategy: Filter out rigid fabrics. Prioritize items with "True to Size" reviews and stretch/adjustable features to reduce return rates.',
      },
      {
        value: "Trend & Novelty",
        title: "Trend & Novelty",
        description:
          'Profile: The Impulse Shopper. Strategy: Highlight scarcity ("Selling fast") and social proof ("As seen on TikTok"). Lower price sensitivity if the item is "hot."',
      },
    ],
  },
  {
    id: "q4",
    title: "When styling an outfit, which feature do you love to highlight most?",
    hint: "Pick the detail you want the outfit to emphasize.",
    options: [
      {
        value: "Waist & Silhouette",
        title: "Waist & Silhouette",
        description: "Recs: Belted coats, high-waisted trousers, bodysuits.",
      },
      {
        value: "Legs",
        title: "Legs",
        description: "Recs: Mini skirts, split-hem leggings, shorts.",
      },
      {
        value: "Comfort & Coverage",
        title: "Comfort & Coverage",
        description: "Recs: Oversized hoodies, wide-leg pants, flowy midi dresses.",
      },
    ],
  },
];

export const EMPTY_COLD_START_ANSWERS: ColdStartAnswers = {
  q1: [],
  q2: [],
  q3: [],
  q4: "",
  zipCode: "",
  location: {},
  styleNote: "",
};

export const COLD_START_Q4_OPTION_VALUES = new Set(
  COLD_START_QUESTIONS.find((question) => question.id === "q4")?.options.map((option) => option.value) ?? [],
);

export function isColdStartQ4Option(value: string) {
  return Boolean(value) && COLD_START_Q4_OPTION_VALUES.has(value);
}
