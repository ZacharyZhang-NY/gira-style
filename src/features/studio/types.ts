export type StageState = "pending" | "loading" | "done" | "error";

export type StageErrors = {
  a?: string;
  b?: string;
  c?: string;
};

export type RecommendationItem = {
  item_name?: string;
  sku?: string;
  color?: string;
  link?: string;
  reason?: string;
  image?: string;
  image_url?: string;
  imageUrl?: string;
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
  stageErrors?: StageErrors;
  recommendation?: RecommendationPayload;
  videoPreviewEnabled?: boolean;
  generatedImage?: string;
  generatedVideo?: string;
};

export type StudioState = {
  versions: StudioVersion[];
  selectedIndex: number;
  updatedAt: string;
};

export type CommunityLook = {
  sessionId: string;
  turnIndex: number;
  imageUrl: string;
  feedback: "" | "up" | "down";
  upVotes?: number;
  downVotes?: number;
  viewerFeedback?: "" | "up" | "down";
};
