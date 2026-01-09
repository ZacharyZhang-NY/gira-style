"use client";

import type { RecommendationItem, RecommendationPayload } from "./types";
import { getItemImage } from "./item";

type ConversationTurn = {
  user: string;
  assistant: RecommendationPayload;
};

type RecommendationRequest = {
  requestText: string;
  conversationHistory: ConversationTurn[];
};

type VideoResponse = {
  videoData?: string;
  videoUri?: string;
};

type RequestOptions = {
  signal?: AbortSignal;
};

const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getBackendBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) return stripTrailingSlash(configured);

  if (typeof window === "undefined") return "";

  const { hostname, port } = window.location;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    if (port && port !== "5001") {
      return `http://${hostname}:5001`;
    }
  }

  if (hostname === "aura-style-agent.vercel.app" || hostname.endsWith(".vercel.app")) {
    return `https://${hostname}`;
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

export async function generateImage(outfitItems: RecommendationItem[], options: RequestOptions = {}) {
  if (!outfitItems.length) {
    throw new Error("No outfit items available for image generation.");
  }

  const normalizedItems = outfitItems
    .map((item) => {
      const image = getItemImage(item);
      return image ? { ...item, image } : item;
    })
    .filter((item) => Boolean(getItemImage(item)) && Boolean(item.item_name))
    .slice(0, 4);

  if (!normalizedItems.length) {
    throw new Error("No product images were returned for this recommendation.");
  }

  const itemsWithBase64 = await Promise.all(
    normalizedItems.map(async (item) => {
      const image = getItemImage(item);
      const image_base64 = image ? await fetchImageAsBase64(image, options) : null;
      return { item_name: item.item_name, image_base64 };
    }),
  );

  const successfulItems = itemsWithBase64.filter((item) => item.image_base64);
  if (!successfulItems.length) {
    throw new Error("Could not fetch any product images from the browser.");
  }

  const payload = await requestJson<{ success?: boolean; image_data?: string; error?: string }>(
    "/api/generate-image",
    {
      outfit_items: successfulItems,
    },
    options,
  );

  if (!payload?.success || !payload.image_data) {
    throw new Error(payload?.error || "Image generation failed.");
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
