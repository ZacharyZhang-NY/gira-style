"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import {
  EMPTY_COLD_START_ANSWERS,
  isColdStartQ4Option,
  type ColdStartAnswers,
} from "@/features/cold-start/questions";
import { ThemeToggle } from "@/features/theme/theme-toggle";
import { cn } from "@/lib/cn";
import {
  readLocalStorageJson,
  removeLocalStorageItem,
  writeLocalStorageJson,
} from "@/lib/storage";
import { STORAGE_KEYS } from "@/lib/storageKeys";

import {
  createSession,
  fetchCommunityLooks,
  fetchRecommendation,
  generateSessionChips,
  generateImage,
  generateVideo,
  logSessionTurn,
  updateCommunityFeedback,
} from "./api";
import { getRandomSeedChips } from "./seed-chips";
import { CommunityLooks } from "./components/community-looks";
import { MotionPreview } from "./components/motion-preview";
import { OutfitPreview } from "./components/outfit-preview";
import { ProductGrid } from "./components/product-grid";
import { ChatPanel } from "./components/chat-panel";
import type {
  CommunityLook,
  RecommendationItem,
  RecommendationPayload,
  StudioState,
  StudioVersion,
} from "./types";

type StoredColdStart = {
  answers: ColdStartAnswers;
  updatedAt: string;
  sessionId?: string;
};
type StoredCommunityVoter = {
  id: string;
  updatedAt: string;
};

const EMPTY_STUDIO_STATE: StudioState = {
  versions: [],
  selectedIndex: 0,
  updatedAt: "",
};
const GENERIC_API_ERROR_MESSAGE =
  "Gira is a bit busy right now due to high demand. Please wait a moment and try again!";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function nowId() {
  return `v_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getPrimaryShopItems(payload: RecommendationPayload, max = 4) {
  const outfit = Array.isArray(payload.outfit) ? payload.outfit : [];
  const accessories = Array.isArray(payload.accessories)
    ? payload.accessories
    : [];
  return [...outfit, ...accessories].slice(0, max);
}

function getOutfitItems(payload: RecommendationPayload) {
  const items: RecommendationItem[] = [];
  if (Array.isArray(payload.outfit) && payload.outfit.length) {
    items.push(...payload.outfit);
  }
  if (Array.isArray(payload.accessories)) {
    items.push(...payload.accessories);
  }
  return items;
}

function mergeCommunityLooks(
  prev: CommunityLook[],
  next: CommunityLook[],
): CommunityLook[] {
  if (!prev.length) return next;
  const prevMap = new Map(
    prev.map((item) => [`${item.sessionId}:${item.turnIndex}`, item]),
  );
  const nextMap = new Map(
    next.map((item) => [`${item.sessionId}:${item.turnIndex}`, item]),
  );

  const mergeItem = (item: CommunityLook) => {
    const key = `${item.sessionId}:${item.turnIndex}`;
    const existing = prevMap.get(key);
    if (!existing) return item;
    return {
      ...item,
      imageUrl: existing.imageUrl || item.imageUrl,
      viewerFeedback: item.viewerFeedback ?? existing.viewerFeedback ?? "",
    };
  };

  const merged = prev.map((item) => {
    const key = `${item.sessionId}:${item.turnIndex}`;
    return mergeItem(nextMap.get(key) ?? item);
  });

  if (merged.length >= 6) return merged;

  for (const item of next) {
    const key = `${item.sessionId}:${item.turnIndex}`;
    if (prevMap.has(key)) continue;
    merged.push(item);
    if (merged.length >= 6) break;
  }

  return merged;
}

function normalizeMultiSelect(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    );
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function normalizeSingleSelect(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    const first = value.find(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    );
    return first?.trim() ?? "";
  }
  return "";
}

function normalizeColdStartAnswers(raw: unknown): ColdStartAnswers {
  if (!raw || typeof raw !== "object") return EMPTY_COLD_START_ANSWERS;
  const candidate = raw as Partial<ColdStartAnswers> & {
    q1?: unknown;
    q2?: unknown;
    q3?: unknown;
    q4?: unknown;
    zipCode?: unknown;
    zip_code?: unknown;
    location?: unknown;
    styleNote?: unknown;
  };
  const q4Candidate = normalizeSingleSelect(candidate.q4);
  const q4IsOption = isColdStartQ4Option(q4Candidate);
  const styleNoteCandidate =
    typeof candidate.styleNote === "string" ? candidate.styleNote.trim() : "";
  const zipCandidateRaw =
    typeof candidate.zipCode === "string"
      ? candidate.zipCode
      : typeof candidate.zip_code === "string"
        ? candidate.zip_code
        : "";
  const zipCodeCandidate = zipCandidateRaw.trim();

  const locationCandidate =
    candidate.location && typeof candidate.location === "object"
      ? (candidate.location as {
          latitude?: unknown;
          longitude?: unknown;
          source?: unknown;
        })
      : null;
  const latitudeCandidate =
    locationCandidate && typeof locationCandidate.latitude === "number"
      ? locationCandidate.latitude
      : undefined;
  const longitudeCandidate =
    locationCandidate && typeof locationCandidate.longitude === "number"
      ? locationCandidate.longitude
      : undefined;
  const sourceRaw =
    locationCandidate && typeof locationCandidate.source === "string"
      ? locationCandidate.source
      : "";
  const sourceCandidate =
    sourceRaw === "geolocation" || sourceRaw === "manual" ? sourceRaw : undefined;
  return {
    q1: normalizeMultiSelect(candidate.q1),
    q2: normalizeMultiSelect(candidate.q2),
    q3: normalizeMultiSelect(candidate.q3),
    q4: q4IsOption ? q4Candidate : "",
    zipCode: zipCodeCandidate,
    location: {
      latitude: latitudeCandidate,
      longitude: longitudeCandidate,
      source: sourceCandidate,
    },
    styleNote: styleNoteCandidate || (!q4IsOption ? q4Candidate : ""),
  };
}

function createLocalSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function createLocalVoterId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `voter_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getCommunityVoterId() {
  const stored = readLocalStorageJson<StoredCommunityVoter>(
    STORAGE_KEYS.communityVoter,
  );
  if (stored?.id) return stored.id;
  const id = createLocalVoterId();
  writeLocalStorageJson(STORAGE_KEYS.communityVoter, {
    id,
    updatedAt: new Date().toISOString(),
  });
  return id;
}

function formatError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}

function normalizeStudioState(raw: unknown): StudioState {
  if (!raw || typeof raw !== "object") return EMPTY_STUDIO_STATE;
  const candidate = raw as Partial<StudioState>;
  const versions = Array.isArray(candidate.versions)
    ? (candidate.versions as StudioVersion[])
    : [];
  const selectedIndex = Number.isInteger(candidate.selectedIndex)
    ? (candidate.selectedIndex as number)
    : 0;
  const boundedIndex = versions.length
    ? clamp(selectedIndex, 0, versions.length - 1)
    : 0;
  return {
    versions,
    selectedIndex: boundedIndex,
    updatedAt:
      typeof candidate.updatedAt === "string" ? candidate.updatedAt : "",
  };
}

type VersionOutputProps = {
  version: StudioVersion;
  onFeedback: (id: string, value: "up" | "down") => void;
};

function VersionOutput({
  version,
  onFeedback,
}: VersionOutputProps) {
  const shopItems = version.recommendation
    ? getPrimaryShopItems(version.recommendation, 4)
    : [];
  const skuItems = shopItems.filter(
    (item) => typeof item.sku === "string" && item.sku.trim().length > 0,
  );
  const otherRecommendation =
    typeof version.recommendation?.other_recommendation === "string"
      ? version.recommendation.other_recommendation.trim()
      : "";
  const showLoadingSkeleton = version.versionNumber === 1 && version.stages.a === "loading";
  const showRecommendationCard =
    showLoadingSkeleton ||
    version.stages.a === "error" ||
    (!version.recommendation && version.stages.a !== "loading") ||
    (Boolean(version.recommendation) && (skuItems.length > 0 || Boolean(otherRecommendation)));
  const previewWidth = "w-full lg:max-w-[320px]";
  const videoPreviewEnabled = version.videoPreviewEnabled ?? true;
  const hasGeneratedImage =
    typeof version.generatedImage === "string" &&
    version.generatedImage.trim().length > 0;
  const hasGeneratedVideo =
    typeof version.generatedVideo === "string" &&
    version.generatedVideo.trim().length > 0;
  const showOutfitPreview = version.stages.b === "loading" || hasGeneratedImage;
  const showMotionPreview =
    videoPreviewEnabled &&
    (version.stages.c === "loading" ||
      hasGeneratedVideo ||
      (version.stages.c === "done" && hasGeneratedImage));
  const showPreviewGrid = showOutfitPreview || showMotionPreview;
  const splitPreview = showOutfitPreview && showMotionPreview;

  return (
    <div className="space-y-8">
      {showRecommendationCard ? (
        <Surface className="p-8 sm:p-10">
          {version.stages.a === "loading" ? (
            <div className="space-y-4">
              <div className="h-3 w-11/12 rounded-full bg-[linear-gradient(90deg,rgb(var(--glass-border)_/_0.18)_25%,rgb(var(--glass-border)_/_0.32)_37%,rgb(var(--glass-border)_/_0.18)_63%)] bg-[length:400%_100%] motion-safe:animate-shimmer" />
              <div className="h-3 w-10/12 rounded-full bg-[linear-gradient(90deg,rgb(var(--glass-border)_/_0.18)_25%,rgb(var(--glass-border)_/_0.32)_37%,rgb(var(--glass-border)_/_0.18)_63%)] bg-[length:400%_100%] motion-safe:animate-shimmer" />
              <div className="h-3 w-9/12 rounded-full bg-[linear-gradient(90deg,rgb(var(--glass-border)_/_0.18)_25%,rgb(var(--glass-border)_/_0.32)_37%,rgb(var(--glass-border)_/_0.18)_63%)] bg-[length:400%_100%] motion-safe:animate-shimmer" />
              <div className="grid grid-cols-2 gap-6 pt-4">
                <div className="h-44 rounded-2xl ui-glass-subtle motion-safe:animate-pulse" />
                <div className="h-44 rounded-2xl ui-glass-subtle motion-safe:animate-pulse" />
              </div>
            </div>
          ) : version.recommendation ? (
            <div className="space-y-10">
              {skuItems.length ? <ProductGrid items={skuItems} /> : null}

              {otherRecommendation ? (
                <div className="flex items-start gap-2 text-sm leading-relaxed text-muted">
                  <Star
                    className="mt-0.5 h-4 w-4 shrink-0 text-gold"
                    aria-hidden="true"
                  />
                  <p className="min-w-0">{otherRecommendation}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted">
              {version.stageErrors?.a || "No recommendation available yet."}
            </p>
          )}
        </Surface>
      ) : null}

      {showPreviewGrid ? (
        <div className="mx-auto w-full max-w-6xl">
          <div
            className={cn(
              "grid gap-6 lg:justify-items-center",
              splitPreview ? "lg:grid-cols-2" : "lg:grid-cols-1",
            )}
          >
            {showOutfitPreview ? (
              <Surface className={cn("overflow-hidden p-0", previewWidth)}>
                <OutfitPreview
                  state={version.stages.b ?? "pending"}
                  image={version.generatedImage}
                  feedback={version.feedback}
                  onFeedback={(value) => onFeedback(version.id, value)}
                />
              </Surface>
            ) : null}

            {showMotionPreview ? (
              <Surface className={cn("overflow-hidden p-0", previewWidth)}>
                <MotionPreview
                  state={version.stages.c ?? "pending"}
                  image={version.generatedImage}
                  video={version.generatedVideo}
                  videoEnabled={videoPreviewEnabled}
                />
              </Surface>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

type ConversationTurn = {
  user: string;
  assistant: RecommendationPayload;
};

function buildConversationHistory(versions: StudioVersion[]): ConversationTurn[] {
  return versions
    .filter(
      (v): v is StudioVersion & { recommendation: RecommendationPayload } =>
        Boolean(v.recommendation),
    )
    .map((v) => ({ user: v.request, assistant: v.recommendation }));
}

export function Studio() {
  const router = useRouter();

  const [hydrated, setHydrated] = React.useState(false);
  const [, setColdStart] = React.useState<ColdStartAnswers | null>(null);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [sessionReady, setSessionReady] = React.useState(false);
  const [state, setState] = React.useState<StudioState>(EMPTY_STUDIO_STATE);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [videoEnabled, setVideoEnabled] = React.useState(true);
  const [communityLooks, setCommunityLooks] = React.useState<CommunityLook[]>([]);
  const [communityVoterId, setCommunityVoterId] = React.useState<string | null>(
    null,
  );
  const [chips, setChips] = React.useState<string[]>([]);
  const [chipsHidden, setChipsHidden] = React.useState(false);
  const videoEnabledRef = React.useRef(videoEnabled);
  const runTokenRef = React.useRef(0);
  const abortRef = React.useRef<AbortController | null>(null);

  const versionsRef = React.useRef<StudioVersion[]>([]);
  const outputEndRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    versionsRef.current = state.versions;
  }, [state.versions]);
  React.useEffect(() => {
    videoEnabledRef.current = videoEnabled;
  }, [videoEnabled]);

  React.useEffect(() => {
    const storedColdStart = readLocalStorageJson<StoredColdStart>(
      STORAGE_KEYS.coldStart,
    );
    const normalizedAnswers = storedColdStart?.answers
      ? normalizeColdStartAnswers(storedColdStart.answers)
      : null;
    setColdStart(normalizedAnswers);
    if (storedColdStart?.sessionId) {
      setSessionId(storedColdStart.sessionId);
      setSessionReady(true);
    } else if (normalizedAnswers) {
      const hasRequired = Boolean(
        normalizedAnswers.q1.length &&
        normalizedAnswers.q2.length &&
        normalizedAnswers.q3.length &&
        normalizedAnswers.q4.trim(),
      );
      if (hasRequired) {
        const nextSessionId = createLocalSessionId();
        writeLocalStorageJson(STORAGE_KEYS.coldStart, {
          ...(storedColdStart || {
            answers: normalizedAnswers,
            updatedAt: new Date().toISOString(),
          }),
          sessionId: nextSessionId,
        });
        setSessionId(nextSessionId);
        setSessionReady(false);
        void createSession({
          sessionId: nextSessionId,
          preferences: normalizedAnswers,
          userAgent: navigator.userAgent,
          locale: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
          .then(() => {
            setSessionReady(true);
          })
          .catch((error) => {
            console.warn("Session creation failed:", error);
          });
      }
    }

    const storedStudio = readLocalStorageJson<StudioState>(
      STORAGE_KEYS.studioVersions,
    );
    if (storedStudio) setState(normalizeStudioState(storedStudio));

    const storedVideo = readLocalStorageJson<boolean>(
      STORAGE_KEYS.videoPreview,
    );
    if (typeof storedVideo === "boolean") setVideoEnabled(storedVideo);

    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    setCommunityVoterId(getCommunityVoterId());
  }, [hydrated]);

  React.useEffect(() => {
    if (!communityVoterId) return;
    const controller = new AbortController();
    fetchCommunityLooks({ signal: controller.signal, voterId: communityVoterId })
      .then((looks) =>
        setCommunityLooks((prev) => mergeCommunityLooks(prev, looks)),
      )
      .catch(() => {});
    return () => controller.abort();
  }, [communityVoterId]);

  React.useEffect(() => {
    if (!hydrated || !sessionReady || !sessionId) return;
    const history = buildConversationHistory(versionsRef.current);
    const turnIndex = history.length ? history.length : 0;
    if (!history.length) {
      setChips(getRandomSeedChips());
      return;
    }
    const controller = new AbortController();
    generateSessionChips(sessionId, turnIndex, history, {
      signal: controller.signal,
    })
      .then((nextChips) => setChips(nextChips))
      .catch(() => {});
    return () => controller.abort();
  }, [hydrated, sessionReady, sessionId]);

  React.useEffect(() => {
    if (!state.versions.length) {
      setChipsHidden(false);
      return;
    }
    const latest = state.versions[state.versions.length - 1];
    const hasImage =
      latest.stages.a === "done" && latest.stages.b === "done";
    if (!isGenerating || hasImage) {
      setChipsHidden(false);
    }
  }, [isGenerating, state.versions]);

  React.useEffect(() => {
    if (!hydrated) return;
    const payload: StudioState = {
      ...state,
      updatedAt: new Date().toISOString(),
    };
    writeLocalStorageJson(STORAGE_KEYS.studioVersions, payload);
  }, [hydrated, state]);

  React.useEffect(() => {
    if (!hydrated) return;
    writeLocalStorageJson(STORAGE_KEYS.videoPreview, videoEnabled);
  }, [hydrated, videoEnabled]);

  const setStageError = React.useCallback(
    (id: string, stage: "a" | "b" | "c", error: unknown) => {
      const fallback =
        stage === "a"
          ? "Recommendation failed. Please try again."
          : stage === "b"
            ? "Image generation failed. Please try again."
            : "Video generation failed. Please try again.";
      const message = formatError(error, fallback);
      setState((prev) => ({
        ...prev,
        versions: prev.versions.map((v) => {
          if (v.id !== id) return v;
          return {
            ...v,
            stages: { ...v.stages, [stage]: "error" },
            stageErrors: { ...(v.stageErrors || {}), [stage]: message },
          };
        }),
      }));
    },
    [],
  );

  const handleToggleVideo = React.useCallback((value: boolean) => {
    videoEnabledRef.current = value;
    setVideoEnabled(value);
    setState((prev) => {
      if (!prev.versions.length) return prev;
      const versions = [...prev.versions];
      const lastIndex = versions.length - 1;
      const current = versions[lastIndex];
      versions[lastIndex] = { ...current, videoPreviewEnabled: value };
      return { ...prev, versions };
    });
  }, []);

  const interruptGeneration = React.useCallback(() => {
    runTokenRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGenerating(false);

    setState((prev) => {
      if (!prev.versions.length) return prev;
      const lastIndex = prev.versions.length - 1;
      const current = prev.versions[lastIndex];
      const stage =
        current.stages.c === "loading"
          ? "c"
          : current.stages.b === "loading"
            ? "b"
            : current.stages.a === "loading"
              ? "a"
              : null;

      if (!stage) return prev;

      const message =
        stage === "a"
          ? "Recommendation interrupted."
          : stage === "b"
            ? "Image generation interrupted."
            : "Video generation interrupted.";

      const next = {
        ...current,
        stages: { ...current.stages, [stage]: "error" },
        stageErrors: { ...(current.stageErrors || {}), [stage]: message },
      };
      const versions = [...prev.versions];
      versions[lastIndex] = next;
      return { ...prev, versions };
    });
  }, []);

  const runSequence = React.useCallback(
    async (requestText: string) => {
      const trimmed = requestText.trim();
      if (!trimmed) return;

      runTokenRef.current += 1;
      const runToken = runTokenRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsGenerating(true);

      const previous = versionsRef.current;
      const versionNumber = previous.length + 1;
      const id = nowId();

      const newVersion: StudioVersion = {
        id,
        versionNumber,
        request: trimmed,
        createdAt: new Date().toISOString(),
        feedback: "",
        stages: { a: "loading", b: "pending", c: "pending" },
        stageErrors: {},
        videoPreviewEnabled: videoEnabled,
      };

      setState({
        versions: [...previous, newVersion],
        selectedIndex: previous.length,
        updatedAt: new Date().toISOString(),
      });

      const history = buildConversationHistory(previous);

      let stage: "a" | "b" | "c" = "a";
      const isStale = () => runTokenRef.current !== runToken;

      try {
        const recommendation = await fetchRecommendation(
          {
            requestText: trimmed,
            conversationHistory: history,
            sessionId: sessionId ?? undefined,
          },
          { signal: controller.signal },
        );

        if (isStale()) return;

        const outfitItems = getOutfitItems(recommendation);
        const shouldGenerateImage = outfitItems.some((item) => {
          const hasName =
            typeof item.item_name === "string" && item.item_name.trim().length > 0;
          const hasImage =
            (typeof item.image === "string" && item.image.length > 0) ||
            (typeof item.image_url === "string" && item.image_url.length > 0) ||
            (typeof item.imageUrl === "string" && item.imageUrl.length > 0);
          return hasName && hasImage;
        });

        setState((prev) => ({
          ...prev,
          versions: prev.versions.map((v) =>
            v.id === id
              ? {
                  ...v,
                  stages: {
                    ...v.stages,
                    a: "done",
                    b: shouldGenerateImage ? "loading" : "done",
                    c: shouldGenerateImage ? v.stages.c : "done",
                  },
                  recommendation,
                }
              : v,
          ),
        }));

        if (sessionReady && sessionId) {
          const nextHistory = [
            ...history,
            { user: trimmed, assistant: recommendation },
          ];
          void logSessionTurn(sessionId, {
            turnIndex: versionNumber,
            userMessage: trimmed,
            assistantResponse: recommendation,
            imageData: null,
            videoData: null,
            videoUri: null,
          })
            .then(() =>
              generateSessionChips(sessionId, versionNumber, nextHistory),
            )
            .then((nextChips) => setChips(nextChips))
            .catch((error) => {
              console.warn("Session logging failed:", error);
            });
        }

        if (!shouldGenerateImage) return;

        stage = "b";
        const imageData = await generateImage(outfitItems, {
          signal: controller.signal,
        });

        if (isStale()) return;

        if (!imageData) {
          setState((prev) => ({
            ...prev,
            versions: prev.versions.map((v) =>
              v.id === id
                ? {
                    ...v,
                    stages: { ...v.stages, b: "done", c: "done" },
                    generatedImage: undefined,
                    generatedVideo: undefined,
                  }
                : v,
            ),
          }));
          return;
        }

        const shouldGenerateVideo = videoEnabledRef.current;

        setState((prev) => ({
          ...prev,
          versions: prev.versions.map((v) =>
            v.id === id
              ? {
                  ...v,
                  stages: {
                    ...v.stages,
                    b: "done",
                    c: shouldGenerateVideo ? "loading" : "done",
                  },
                  generatedImage: imageData,
                  videoPreviewEnabled: shouldGenerateVideo,
                }
              : v,
          ),
        }));

        if (sessionReady && sessionId) {
          void logSessionTurn(sessionId, {
            turnIndex: versionNumber,
            userMessage: trimmed,
            assistantResponse: recommendation,
            imageData,
            videoData: null,
            videoUri: null,
          }).catch((error) => {
            console.warn("Session logging failed:", error);
          });
        }

        if (!shouldGenerateVideo) return;

        stage = "c";
        const video = await generateVideo(imageData, outfitItems, {
          signal: controller.signal,
        });
        const videoSource = video.videoData || video.videoUri;

        if (isStale()) return;

        setState((prev) => ({
          ...prev,
          versions: prev.versions.map((v) =>
            v.id === id
              ? {
                  ...v,
                  stages: { ...v.stages, c: "done" },
                  generatedVideo: videoSource,
                }
              : v,
          ),
        }));

        if (sessionReady && sessionId) {
          void logSessionTurn(sessionId, {
            turnIndex: versionNumber,
            userMessage: trimmed,
            assistantResponse: recommendation,
            imageData: null,
            videoData: video.videoData ?? null,
            videoUri: video.videoUri ?? null,
          }).catch((error) => {
            console.warn("Session logging failed:", error);
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setStageError(id, stage, error);
      } finally {
        if (runTokenRef.current === runToken) {
          setIsGenerating(false);
          abortRef.current = null;
        }
      }
    },
    [setStageError, sessionId, sessionReady, videoEnabled],
  );

  const versions = state.versions;
  const latestVersionId = versions.length
    ? versions[versions.length - 1]?.id
    : null;

  function startOver() {
    runTokenRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;

    removeLocalStorageItem(STORAGE_KEYS.coldStart);
    removeLocalStorageItem(STORAGE_KEYS.studioVersions);

    setSessionId(null);
    setSessionReady(false);
    setColdStart(null);
    setState(EMPTY_STUDIO_STATE);
    setIsGenerating(false);

    router.push("/start");
  }

  function updateVersion(
    id: string,
    updater: (v: StudioVersion) => StudioVersion,
  ) {
    setState((prev) => ({
      ...prev,
      versions: prev.versions.map((v) => (v.id === id ? updater(v) : v)),
    }));
  }

  function recordFeedback(id: string, value: "up" | "down") {
    updateVersion(id, (v) => ({ ...v, feedback: value }));
    const version = versionsRef.current.find((v) => v.id === id);
    if (!version || !version.recommendation || !sessionReady || !sessionId)
      return;
    void logSessionTurn(sessionId, {
      turnIndex: version.versionNumber,
      userMessage: version.request,
      assistantResponse: version.recommendation,
      feedback: value,
    }).catch(() => {});
  }

  const handleCommunityFeedback = React.useCallback(
    (look: CommunityLook, value: "up" | "down") => {
      const voterId = communityVoterId ?? getCommunityVoterId();
      setCommunityLooks((prev) =>
        prev.map((item) => {
          if (
            item.sessionId !== look.sessionId ||
            item.turnIndex !== look.turnIndex
          ) {
            return item;
          }
          const previous = item.viewerFeedback ?? "";
          let upVotes = item.upVotes ?? 0;
          let downVotes = item.downVotes ?? 0;
          if (previous === "up") upVotes = Math.max(0, upVotes - 1);
          if (previous === "down") downVotes = Math.max(0, downVotes - 1);
          if (value === "up") upVotes += 1;
          if (value === "down") downVotes += 1;
          return { ...item, viewerFeedback: value, upVotes, downVotes };
        }),
      );
      void updateCommunityFeedback(look.sessionId, look.turnIndex, value, voterId)
        .then((payload) => {
          if (!payload) return;
          setCommunityLooks((prev) =>
            prev.map((item) => {
              if (
                item.sessionId !== look.sessionId ||
                item.turnIndex !== look.turnIndex
              ) {
                return item;
              }
              return {
                ...item,
                viewerFeedback: payload.viewerFeedback ?? item.viewerFeedback ?? "",
                upVotes: payload.upVotes ?? item.upVotes ?? 0,
                downVotes: payload.downVotes ?? item.downVotes ?? 0,
              };
            }),
          );
        })
        .catch(() => {});
    },
    [communityVoterId],
  );

  const messages = React.useMemo(() => {
    const base = [
      {
        id: "intro",
        role: "assistant" as const,
        heading: "",
        text: "Hi! I'm Gira. Ready to refresh your look? Tell me what can I help you style today?\n\nPro tip: Take a look at the gallery on the left to see what’s trending with others right now.",
        highlight: !versions.length && !isGenerating,
      },
    ];

    const versionMessages = versions.flatMap((v) => {
      const isSelected = latestVersionId ? v.id === latestVersionId : false;
      const formattedResponse = v.recommendation?.formatted_response?.trim();
      const description = v.recommendation?.description?.trim();
      const reason = v.recommendation?.reason?.trim();
      const responseText = formattedResponse
        ? formattedResponse
        : [description, reason].filter(Boolean).join("\n\n");

      const nonInterruptErrorStages = (["a", "b", "c"] as const).filter(
        (stage) => {
          const message = v.stageErrors?.[stage];
          if (!message) return false;
          return !message.toLowerCase().includes("interrupted");
        },
      );
      const hasNonInterruptRecommendationError = nonInterruptErrorStages.includes("a");
      const hasNonInterruptMediaError =
        nonInterruptErrorStages.includes("b") || nonInterruptErrorStages.includes("c");

      const assistantMessages: Array<{
        id: string;
        role: "assistant";
        heading?: string;
        text: string;
        highlight?: boolean;
      }> = [];

      if (v.stages.a === "done") {
        assistantMessages.push({
          id: `${v.id}-assistant`,
          role: "assistant",
          heading: "",
          text: responseText || "I’m ready when you are.",
        });
      } else if (v.stages.a === "error" && hasNonInterruptRecommendationError) {
        assistantMessages.push({
          id: `${v.id}-assistant`,
          role: "assistant",
          heading: "",
          text: GENERIC_API_ERROR_MESSAGE,
        });
      }

      if (hasNonInterruptMediaError) {
        assistantMessages.push({
          id: `${v.id}-assistant-media-error`,
          role: "assistant",
          heading: "",
          text: GENERIC_API_ERROR_MESSAGE,
        });
      }

      const activeAssistantId = assistantMessages.length
        ? assistantMessages[assistantMessages.length - 1]?.id
        : null;

      const highlightedAssistantMessages = assistantMessages.map((msg) => ({
        ...msg,
        highlight: isSelected && msg.id === activeAssistantId,
      }));

      return [
        {
          id: `${v.id}-user`,
          role: "user" as const,
          text: v.request,
          highlight: isSelected,
        },
        ...highlightedAssistantMessages,
      ];
    });

    return [...base, ...versionMessages];
  }, [isGenerating, latestVersionId, versions]);

  React.useEffect(() => {
    if (!versions.length) return;
    requestAnimationFrame(() => {
      outputEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, [versions.length]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30">
        <div className="mx-auto max-w-7xl px-6 pt-5">
          <div className="flex items-center justify-between gap-4 rounded-full px-4 py-3 ui-glass-liquid">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="font-display text-base leading-none tracking-tight text-text sm:text-lg">
                GiraStyle
              </span>
            </Link>

            <div className="flex items-center gap-3">
              <ThemeToggle className="[&_button]:px-3 [&_button]:py-1.5 [&_button]:text-[10px] [&_button]:tracking-[0.2em] sm:[&_button]:px-4 sm:[&_button]:py-2 sm:[&_button]:text-[11px] sm:[&_button]:tracking-[0.22em]" />
              <Button
                tone="outline"
                onClick={startOver}
                className="px-4 py-2 text-[11px] sm:px-5 sm:py-2.5 sm:text-sm"
              >
                Start over
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-16 pt-10 max-lg:px-0 max-lg:pb-0 max-lg:pt-4">
        <div className="grid grid-cols-12 items-start gap-10 max-lg:gap-0">
          <div className="col-span-12 lg:col-span-8 hidden lg:block">
            <div className="space-y-10">
              {!versions.length ? (
                <CommunityLooks
                  looks={communityLooks}
                  onFeedback={handleCommunityFeedback}
                />
              ) : (
                versions.map((version, index) => {
                  const isLast = index === versions.length - 1;
                  return (
                    <div key={version.id} ref={isLast ? outputEndRef : undefined}>
                      <VersionOutput
                        version={version}
                        onFeedback={recordFeedback}
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4 lg:sticky lg:top-28">
            <ChatPanel
              isBusy={isGenerating}
              disableComposer={isGenerating || !hydrated}
              disableVideoToggle={isGenerating || !hydrated}
              videoEnabled={videoEnabled}
              messages={messages}
              chips={chips}
              chipsVisible={!chipsHidden && chips.length > 0}
              mobileOutputs={Object.fromEntries(
                versions.map((version) => [
                  version.id,
                  <VersionOutput
                    key={`mobile-${version.id}`}
                    version={version}
                    onFeedback={recordFeedback}
                  />,
                ]),
              )}
              onChipSelect={() => setChipsHidden(true)}
              mobileIntroContent={
                !versions.length ? (
                  <CommunityLooks
                    looks={communityLooks}
                    onFeedback={handleCommunityFeedback}
                  />
                ) : null
              }
              onSubmitRequest={runSequence}
              onInterrupt={interruptGeneration}
              onToggleVideo={handleToggleVideo}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
