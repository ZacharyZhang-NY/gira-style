"use client";

import type { ColdStartAnswers } from "@/features/cold-start/questions";
import type { CommunityLook, RecommendationItem, RecommendationPayload } from "./types";
import { getItemImage } from "./item";
import { readLocalStorageJson } from "@/lib/storage";
import { STORAGE_KEYS } from "@/lib/storageKeys";

type ConversationTurn = {
  user: string;
  assistant: RecommendationPayload;
};

type RecommendationRequest = {
  requestText: string;
  conversationHistory: ConversationTurn[];
  sessionId?: string;
};

type ClientTimeContext = {
  localDateTime: string;
  timezone?: string;
  locale?: string;
};

type ClientLocationContext = {
  zipCode?: string;
  latitude?: number;
  longitude?: number;
};

type VideoResponse = {
  videoData?: string;
  videoUri?: string;
};

type CreateSessionRequest = {
  sessionId: string;
  preferences: ColdStartAnswers;
  systemPrompt?: string;
  userAgent?: string;
  locale?: string;
  timezone?: string;
};

type CreateSessionResponse = {
  success?: boolean;
  sessionId?: string;
  error?: string;
};

type LogSessionTurnRequest = {
  turnIndex: number;
  userMessage: string;
  assistantResponse: RecommendationPayload;
  imageData?: string | null;
  videoData?: string | null;
  videoUri?: string | null;
  feedback?: "up" | "down" | "";
};

type LogSessionTurnResponse = {
  success?: boolean;
  error?: string;
};

type CommunityLooksResponse = {
  looks?: CommunityLook[];
  error?: string;
};

type SessionTurnResponse = {
  success?: boolean;
  assistantResponse?: RecommendationPayload;
  error?: string;
};

type ChipsResponse = {
  chips?: string[];
  error?: string;
};

type RequestOptions = {
  signal?: AbortSignal;
};

const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const DEFAULT_REMOTE_BACKEND_BASE_URL = "https://api.girastyleai.com";
const LOCAL_BACKEND_BASE_URL = "http://127.0.0.1:5001";

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatLocalDateTimeWithOffset(value: Date) {
  const year = value.getFullYear();
  const month = pad2(value.getMonth() + 1);
  const day = pad2(value.getDate());
  const hour = pad2(value.getHours());
  const minute = pad2(value.getMinutes());
  const second = pad2(value.getSeconds());

  const offsetMinutes = -value.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const offsetHour = pad2(Math.floor(abs / 60));
  const offsetMinute = pad2(abs % 60);

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${offsetHour}:${offsetMinute}`;
}

function getClientTimeContext(): ClientTimeContext {
  const now = new Date();
  let timezone: string | undefined;
  let locale: string | undefined;

  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    timezone = undefined;
  }

  try {
    locale = typeof navigator !== "undefined" ? navigator.language : undefined;
  } catch {
    locale = undefined;
  }

  return {
    localDateTime: formatLocalDateTimeWithOffset(now),
    timezone,
    locale,
  };
}

function getClientLocationContext(): ClientLocationContext | undefined {
  if (typeof window === "undefined") return undefined;
  const stored = readLocalStorageJson<{ answers?: Partial<ColdStartAnswers> }>(
    STORAGE_KEYS.coldStart,
  );
  const answers = stored?.answers;
  const zipCode = typeof answers?.zipCode === "string" ? answers.zipCode.trim() : "";
  const latitude =
    typeof answers?.location?.latitude === "number" ? answers.location.latitude : undefined;
  const longitude =
    typeof answers?.location?.longitude === "number" ? answers.location.longitude : undefined;

  if (!zipCode && latitude == null && longitude == null) return undefined;

  return {
    zipCode: zipCode || undefined,
    latitude,
    longitude,
  };
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeBaseUrl(value: string) {
  // Fix common typo like http:/host -> http://host
  if (/^https?:\/[^/]/.test(value)) {
    return value.replace(/^https?:\//, (m) => `${m}/`);
  }
  return value;
}

function getBackendBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) return stripTrailingSlash(normalizeBaseUrl(configured));

  if (typeof window === "undefined") return "";

  const { hostname } = window.location;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return LOCAL_BACKEND_BASE_URL;
  }

  if (hostname === "aura-style-agent.vercel.app" || hostname.endsWith(".vercel.app")) {
    return DEFAULT_REMOTE_BACKEND_BASE_URL;
  }

  const codespacePattern = /-(\d+)\.app\.github\.dev$/;
  const match = hostname.match(codespacePattern);
  if (match) {
    const currentPort = match[1];
    if (currentPort !== "5001") {
      const newHostname = hostname.replace(codespacePattern, "-5001.app.github.dev");
      return `https://${newHostname}`;
    }
  }

  return "";
}

function buildApiUrl(path: string) {
  const base = getBackendBaseUrl();
  if (!base) return path;
  return `${base}${path}`;
}

function extractJsonFromText(rawText: string) {
  let cleaned = rawText.replace(/^\uFEFF/, "").trim();
  if (!cleaned) throw new Error("Empty response from recommendation service.");

  if (cleaned.includes("[ERROR]")) {
    throw new Error(cleaned.replace(/\[ERROR\]/g, "").trim());
  }

  cleaned = cleaned.replace(/tool_code/g, "").trim();
  cleaned = cleaned.replace(/^```json\s*/i, "");
  cleaned = cleaned.replace(/^```\s*/i, "");
  cleaned = cleaned.replace(/```\s*$/g, "");

  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
  }

  return cleaned.trim();
}

function formatError(prefix: string, error: unknown) {
  if (error instanceof Error && error.message) return `${prefix} ${error.message}`;
  if (typeof error === "string" && error.trim()) return `${prefix} ${error}`;
  return prefix;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function convertImageBlobToPngDataUrl(blob: Blob) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Unable to render image.");
    }
    ctx.drawImage(bitmap, 0, 0);
    return canvas.toDataURL("image/png");
  }

  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Unable to render image."));
        return;
      }
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };
    img.src = objectUrl;
  });
}

async function fetchImageAsBase64(url: string, options: RequestOptions = {}) {
  try {
    const response = await fetch(url, { signal: options.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (SUPPORTED_IMAGE_TYPES.has(blob.type)) {
      return await blobToDataUrl(blob);
    }
    return await convertImageBlobToPngDataUrl(blob);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    return null;
  }
}

async function requestJson<T>(path: string, body: unknown, options: RequestOptions = {}) {
  const response = await fetch(buildApiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

async function requestGet<T>(path: string, options: RequestOptions = {}) {
  const response = await fetch(buildApiUrl(path), {
    method: "GET",
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

export async function fetchRecommendation(
  request: RecommendationRequest,
  options: RequestOptions = {},
): Promise<RecommendationPayload> {
  const response = await fetch(buildApiUrl("/api/recommend"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userInput: request.requestText,
      conversationHistory: request.conversationHistory,
      sessionId: request.sessionId,
      clientTime: getClientTimeContext(),
      clientLocation: getClientLocationContext(),
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Recommendation request failed (${response.status}).`);
  }

  const rawText = await response.text();
  try {
    const payload = extractJsonFromText(rawText);
    return JSON.parse(payload) as RecommendationPayload;
  } catch (error) {
    throw new Error(formatError("Unable to parse recommendation.", error));
  }
}

export async function generateImage(
  outfitItems: RecommendationItem[],
  options: RequestOptions = {},
): Promise<string | null> {
  if (!outfitItems.length) {
    return null;
  }

  const normalizedItems = outfitItems
    .map((item) => {
      const image = getItemImage(item);
      return image ? { ...item, image } : item;
    })
    .filter((item) => Boolean(getItemImage(item)) && Boolean(item.item_name))
    .slice(0, 4);

  if (!normalizedItems.length) {
    return null;
  }

  const itemsWithBase64 = await Promise.all(
    normalizedItems.map(async (item) => {
      const image = getItemImage(item);
      const image_base64 = image ? await fetchImageAsBase64(image, options) : null;
      return { item_name: item.item_name, sku: item.sku, image_base64 };
    }),
  );

  const successfulItems = itemsWithBase64.filter((item) => item.image_base64);
  if (!successfulItems.length) {
    return null;
  }

  const payload = await requestJson<{ success?: boolean; image_data?: string; error?: string }>(
    "/api/generate-image",
    {
      outfit_items: successfulItems,
    },
    options,
  );

  if (!payload?.success) {
    throw new Error(payload?.error || "Image generation failed.");
  }

  if (typeof payload.image_data !== "string" || !payload.image_data) {
    return null;
  }

  return payload.image_data;
}

export async function generateVideo(
  imageData: string,
  outfitItems: RecommendationItem[],
  options: RequestOptions = {},
): Promise<VideoResponse> {
  if (!imageData) throw new Error("Missing image data for video generation.");

  const payload = await requestJson<{
    success?: boolean;
    video_data?: string;
    video_uri?: string;
    error?: string;
  }>("/api/generate-video", {
    image_data: imageData,
    outfit_items: outfitItems,
  }, options);

  if (!payload?.success) {
    throw new Error(payload?.error || "Video generation failed.");
  }

  return {
    videoData: payload.video_data,
    videoUri: payload.video_uri,
  };
}

export async function createSession(request: CreateSessionRequest, options: RequestOptions = {}) {
  const payload = await requestJson<CreateSessionResponse>("/api/sessions", request, options);
  if (!payload?.success || !payload.sessionId) {
    throw new Error(payload?.error || "Session creation failed.");
  }
  return payload.sessionId;
}

export async function logSessionTurn(sessionId: string, request: LogSessionTurnRequest, options: RequestOptions = {}) {
  const payload = await requestJson<LogSessionTurnResponse>(`/api/sessions/${sessionId}/turns`, request, options);
  if (!payload?.success) {
    throw new Error(payload?.error || "Session logging failed.");
  }
}

export async function generateSessionChips(
  sessionId: string,
  turnIndex: number,
  conversationHistory: ConversationTurn[],
  options: RequestOptions = {},
) {
  const payload = await requestJson<ChipsResponse>(
    `/api/sessions/${sessionId}/chips`,
    {
      turnIndex,
      conversationHistory,
      clientTime: getClientTimeContext(),
      clientLocation: getClientLocationContext(),
    },
    options,
  );

  if (!payload?.chips) {
    throw new Error(payload?.error || "Chips unavailable.");
  }

  return payload.chips;
}

type CommunityLooksOptions = RequestOptions & {
  voterId?: string;
};

export async function fetchCommunityLooks(options: CommunityLooksOptions = {}) {
  const { voterId, ...requestOptions } = options;
  const query = voterId ? `?voterId=${encodeURIComponent(voterId)}` : "";
  const payload = await requestGet<CommunityLooksResponse>(
    `/api/community/looks${query}`,
    requestOptions,
  );
  if (!payload?.looks) {
    throw new Error(payload?.error || "Community looks unavailable.");
  }
  return payload.looks;
}

export async function fetchSessionTurnRecommendation(
  sessionId: string,
  turnIndex: number,
  options: RequestOptions = {},
): Promise<RecommendationPayload> {
  const payload = await requestGet<SessionTurnResponse>(
    `/api/sessions/${encodeURIComponent(sessionId)}/turns/${turnIndex}`,
    options,
  );
  if (!payload?.success || !payload.assistantResponse) {
    throw new Error(payload?.error || "SKU unavailable.");
  }
  return payload.assistantResponse;
}

export async function updateCommunityFeedback(
  sessionId: string,
  turnIndex: number,
  feedback: "up" | "down",
  voterId: string,
  options: RequestOptions = {},
) {
  const payload = await requestJson<{
    success?: boolean;
    error?: string;
    upVotes?: number;
    downVotes?: number;
    viewerFeedback?: "" | "up" | "down";
  }>(
    `/api/sessions/${sessionId}/turns/${turnIndex}/feedback`,
    { feedback, voterId },
    options,
  );
  if (!payload?.success) {
    throw new Error(payload?.error || "Feedback update failed.");
  }
  return {
    upVotes: payload.upVotes,
    downVotes: payload.downVotes,
    viewerFeedback: payload.viewerFeedback,
  };
}
