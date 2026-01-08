export type StageState = "pending" | "loading" | "done" | "error";

export type RecommendationItem = {
  item_name?: string;
  sku?: string;
  color?: string;
  link?: string;
  reason?: string;
  image?: string;
};

export type RecommendationPayload = {
  description?: string;
  outfit?: RecommendationItem[];
  accessories?: RecommendationItem[];
  other_recommendation?: string;
  reason?: string;
  formatted_response?: string;
};

export type StudioVersion = {
  id: string;
  versionNumber: number;
  request: string;
  createdAt: string;
  feedback: "" | "up" | "down";
  stages: {
    a: StageState;
    b: StageState;
    c: StageState;
  };
  recommendation?: RecommendationPayload;
  generatedImage?: string;
  generatedVideo?: string;
};

export type StudioState = {
  versions: StudioVersion[];
  selectedIndex: number;
  updatedAt: string;
};

