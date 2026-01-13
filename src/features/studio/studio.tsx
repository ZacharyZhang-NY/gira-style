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
import { readLocalStorageJson, removeLocalStorageItem, writeLocalStorageJson } from "@/lib/storage";
import { STORAGE_KEYS } from "@/lib/storageKeys";

import { createSession, fetchRecommendation, generateImage, generateVideo, logSessionTurn } from "./api";
import { MediaPlaceholder } from "./components/media-placeholder";
import { MotionPreview } from "./components/motion-preview";
import { OutfitPreview } from "./components/outfit-preview";
import { ProductGrid } from "./components/product-grid";
import { ChatPanel } from "./components/chat-panel";
import type { RecommendationPayload, StudioState, StudioVersion } from "./types";

type StoredColdStart = {
  answers: ColdStartAnswers;
  updatedAt: string;
  sessionId?: string;
};

const EMPTY_STUDIO_STATE: StudioState = {
  versions: [],
  selectedIndex: 0,
  updatedAt: "",
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function nowId() {
  return `v_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getPrimaryShopItems(payload: RecommendationPayload, max = 4) {
  const outfit = Array.isArray(payload.outfit) ? payload.outfit : [];
  if (outfit.length) return outfit.slice(0, max);
  const accessories = Array.isArray(payload.accessories) ? payload.accessories : [];
  return accessories.slice(0, max);
}

function getOutfitItems(payload: RecommendationPayload) {
  if (Array.isArray(payload.outfit) && payload.outfit.length) return payload.outfit;
  if (Array.isArray(payload.accessories)) return payload.accessories;
  return [];
}

function normalizeMultiSelect(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function normalizeSingleSelect(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    const first = value.find((item): item is string => typeof item === "string" && item.trim().length > 0);
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
    styleNote?: unknown;
  };
  const q4Candidate = normalizeSingleSelect(candidate.q4);
  const q4IsOption = isColdStartQ4Option(q4Candidate);
  const styleNoteCandidate = typeof candidate.styleNote === "string" ? candidate.styleNote.trim() : "";
  return {
    q1: normalizeMultiSelect(candidate.q1),
    q2: normalizeSingleSelect(candidate.q2),
    q3: normalizeSingleSelect(candidate.q3),
    q4: q4IsOption ? q4Candidate : "",
    styleNote: styleNoteCandidate || (!q4IsOption ? q4Candidate : ""),
  };
}

function createLocalSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getPaletteGuidance(palette: string) {
  switch (palette) {
    case "The Modern Neutrals":
      return "Agent mode: Monochromatic Chic. Focus on texture differences rather than color contrast.";
    case "Warm & Earthy":
      return 'Agent mode: Tonal Layering. Prioritize the "Wilfred" aesthetic and warm-tone lighting in generated images.';
    case "Vibrant & Playful":
      return 'Agent mode: Statement Styling. Prioritize "Seasonal" colors and "Sunday Best" prints.';
    default:
      return "";
  }
}

function getPriorityGuidance(priority: string) {
  switch (priority) {
    case "Quality & Longevity":
      return "Profile: The Investment Shopper. Emphasize natural fibers (wool, silk, cashmere) and durability.";
    case "Fit & Comfort":
      return 'Profile: The Fit-Critical Shopper (high return risk). Filter out rigid fabrics; prioritize "True to Size" reviews and stretch/adjustable features to reduce return rates.';
    case "Trend & Novelty":
      return 'Profile: The Impulse Shopper. Highlight scarcity ("Selling fast") and social proof ("As seen on TikTok"). Lower price sensitivity if the item is "hot."';
    default:
      return "";
  }
}

function getHighlightGuidance(focus: string) {
  switch (focus) {
    case "Waist & Silhouette":
      return "Highlight waist definition with belted coats, high-waisted trousers, and bodysuits.";
    case "Legs":
      return "Highlight legs with shorter hemlines, split-hem leggings, or elongated fits.";
    case "Comfort & Coverage":
      return "Prioritize relaxed coverage with oversized hoodies, wide-leg pants, and flowy midi dresses.";
    default:
      return "";
  }
}

function buildSystemPrompt(answers: ColdStartAnswers | null) {
  if (!answers) return "";
  const parts = [
    answers.q1.length ? `Style universes: ${answers.q1.join(", ")}.` : "",
    answers.q2.trim() ? `Color palette: ${answers.q2.trim()}.` : "",
    answers.q3.trim() ? `Non-negotiable: ${answers.q3.trim()}.` : "",
    answers.q4.trim() ? `Highlight focus: ${answers.q4.trim()}.` : "",
    answers.styleNote.trim() ? `Self-described style: ${answers.styleNote.trim()}.` : "",
  ].filter(Boolean);

  const guidance = [
    getPaletteGuidance(answers.q2),
    getPriorityGuidance(answers.q3),
    getHighlightGuidance(answers.q4),
  ].filter(Boolean);

  if (!parts.length && !guidance.length) return "";

  const lines = ["User style preferences (from onboarding):", ...parts.map((part) => `- ${part}`)];
  if (guidance.length) {
    lines.push("", "Personalization instructions:", ...guidance.map((item) => `- ${item}`));
  }
  lines.push("", "Use these preferences as defaults when selecting items and writing styling tips.");

  return lines.join("\n");
}

function formatError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}

function normalizeStudioState(raw: unknown): StudioState {
  if (!raw || typeof raw !== "object") return EMPTY_STUDIO_STATE;
  const candidate = raw as Partial<StudioState>;
  const versions = Array.isArray(candidate.versions) ? (candidate.versions as StudioVersion[]) : [];
  const selectedIndex = Number.isInteger(candidate.selectedIndex) ? (candidate.selectedIndex as number) : 0;
  const boundedIndex = versions.length ? clamp(selectedIndex, 0, versions.length - 1) : 0;
  return {
    versions,
    selectedIndex: boundedIndex,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : "",
  };
}

export function Studio() {
  const router = useRouter();

  const [hydrated, setHydrated] = React.useState(false);
  const [coldStart, setColdStart] = React.useState<ColdStartAnswers | null>(null);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [sessionReady, setSessionReady] = React.useState(false);
  const [state, setState] = React.useState<StudioState>(EMPTY_STUDIO_STATE);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [videoEnabled, setVideoEnabled] = React.useState(true);
  const runTokenRef = React.useRef(0);
  const abortRef = React.useRef<AbortController | null>(null);

  const versionsRef = React.useRef<StudioVersion[]>([]);
  React.useEffect(() => {
    versionsRef.current = state.versions;
  }, [state.versions]);

  React.useEffect(() => {
    const storedColdStart = readLocalStorageJson<StoredColdStart>(STORAGE_KEYS.coldStart);
    const normalizedAnswers = storedColdStart?.answers ? normalizeColdStartAnswers(storedColdStart.answers) : null;
    setColdStart(normalizedAnswers);
    if (storedColdStart?.sessionId) {
      setSessionId(storedColdStart.sessionId);
      setSessionReady(true);
    } else if (normalizedAnswers) {
      const hasRequired = Boolean(
        normalizedAnswers.q1.length
          && normalizedAnswers.q2.trim()
          && normalizedAnswers.q3.trim()
          && normalizedAnswers.q4.trim(),
      );
      if (hasRequired) {
        const nextSessionId = createLocalSessionId();
        writeLocalStorageJson(STORAGE_KEYS.coldStart, {
          ...(storedColdStart || { answers: normalizedAnswers, updatedAt: new Date().toISOString() }),
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

    const storedStudio = readLocalStorageJson<StudioState>(STORAGE_KEYS.studioVersions);
    if (storedStudio) setState(normalizeStudioState(storedStudio));

    const storedVideo = readLocalStorageJson<boolean>(STORAGE_KEYS.videoPreview);
    if (typeof storedVideo === "boolean") setVideoEnabled(storedVideo);

    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    const payload: StudioState = { ...state, updatedAt: new Date().toISOString() };
    writeLocalStorageJson(STORAGE_KEYS.studioVersions, payload);
  }, [hydrated, state]);

  React.useEffect(() => {
    if (!hydrated) return;
    writeLocalStorageJson(STORAGE_KEYS.videoPreview, videoEnabled);
  }, [hydrated, videoEnabled]);

  const setStageError = React.useCallback((id: string, stage: "a" | "b" | "c", error: unknown) => {
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
      };

      setState({
        versions: [...previous, newVersion],
        selectedIndex: previous.length,
        updatedAt: new Date().toISOString(),
      });

      const history = previous
        .filter(
          (v): v is StudioVersion & { recommendation: RecommendationPayload } => Boolean(v.recommendation),
        )
        .map((v) => ({ user: v.request, assistant: v.recommendation }));

      const systemPrompt = buildSystemPrompt(coldStart);

      let stage: "a" | "b" | "c" = "a";
      const isStale = () => runTokenRef.current !== runToken;

      try {
        const recommendation = await fetchRecommendation({
          requestText: trimmed,
          conversationHistory: history,
          systemPrompt,
        }, { signal: controller.signal });

        if (isStale()) return;

        setState((prev) => ({
          ...prev,
          versions: prev.versions.map((v) =>
            v.id === id
              ? { ...v, stages: { ...v.stages, a: "done", b: "loading" }, recommendation }
              : v,
          ),
        }));

        if (sessionReady && sessionId) {
          void logSessionTurn(sessionId, {
            turnIndex: versionNumber,
            userMessage: trimmed,
            assistantResponse: recommendation,
            imageData: null,
            videoData: null,
            videoUri: null,
          }).catch((error) => {
            console.warn("Session logging failed:", error);
          });
        }

        stage = "b";
        const outfitItems = getOutfitItems(recommendation);
        const imageData = await generateImage(outfitItems, { signal: controller.signal });

        if (isStale()) return;

        setState((prev) => ({
          ...prev,
          versions: prev.versions.map((v) =>
            v.id === id
              ? {
                  ...v,
                  stages: { ...v.stages, b: "done", c: videoEnabled ? "loading" : "done" },
                  generatedImage: imageData,
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

        if (!videoEnabled) return;

        stage = "c";
        const video = await generateVideo(imageData, outfitItems, { signal: controller.signal });
        const videoSource = video.videoData || video.videoUri;

        if (isStale()) return;

        setState((prev) => ({
          ...prev,
          versions: prev.versions.map((v) =>
            v.id === id ? { ...v, stages: { ...v.stages, c: "done" }, generatedVideo: videoSource } : v,
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
    [coldStart, setStageError, sessionId, sessionReady, videoEnabled],
  );

  const versions = state.versions;
  const latestVersionId = versions.length ? versions[versions.length - 1]?.id : null;

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

  function updateVersion(id: string, updater: (v: StudioVersion) => StudioVersion) {
    setState((prev) => ({
      ...prev,
      versions: prev.versions.map((v) => (v.id === id ? updater(v) : v)),
    }));
  }

  function recordFeedback(id: string, value: "up" | "down") {
    updateVersion(id, (v) => ({ ...v, feedback: value }));
  }

  const messages = React.useMemo(() => {
    const base = [
      {
        id: "intro",
        role: "assistant" as const,
        heading: "GiraStyle",
        text: "Tell me what you’re dressing for, and I’ll build a full look—then we’ll refine it together.",
        highlight: !versions.length && !isGenerating,
      },
    ];

    const versionMessages = versions.flatMap((v) => {
      const isSelected = latestVersionId ? v.id === latestVersionId : false;
      const formattedResponse = v.recommendation?.formatted_response?.trim();
      const description = v.recommendation?.description?.trim();
      const reason = v.recommendation?.reason?.trim();
      const preferenceText = formattedResponse
        ? formattedResponse
        : [description, reason].filter(Boolean).join("\n\n");
      const baseText =
        v.stages.a === "loading"
          ? "Give me a moment—I’m pulling pieces that match your vibe."
          : preferenceText
            ? `${preferenceText}\n\nWant it sharper, softer, darker, or more relaxed? Tell me.`
            : "I’m ready when you are.";

      const errorNotes = [
        v.stageErrors?.a ? `Recommendation issue: ${v.stageErrors.a}` : "",
        v.stageErrors?.b ? `Image generation issue: ${v.stageErrors.b}` : "",
        v.stageErrors?.c ? `Video preview issue: ${v.stageErrors.c}` : "",
      ].filter(Boolean);

      const assistantText = errorNotes.length ? `${baseText}\n\n${errorNotes.join("\n")}` : baseText;

      return [
        {
          id: `${v.id}-user`,
          role: "user" as const,
          heading: "You",
          text: v.request,
          highlight: isSelected,
        },
        {
          id: `${v.id}-assistant`,
          role: "assistant" as const,
          heading: "GiraStyle",
          text: assistantText,
          highlight: isSelected,
        },
      ];
    });

    return [...base, ...versionMessages];
  }, [isGenerating, latestVersionId, versions]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30">
        <div className="mx-auto max-w-7xl px-6 pt-5">
          <div className="flex items-center justify-between gap-4 rounded-full px-4 py-3 ui-glass-liquid">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="font-display text-lg leading-none tracking-tight text-text">GiraStyle</span>
              <span className="hidden text-[11px] font-semibold uppercase tracking-[0.22em] text-muted sm:inline">
                Studio
              </span>
            </Link>

            <div className="flex items-center gap-3">
              <ThemeToggle className="hidden sm:inline-flex" />
              <Button tone="outline" onClick={startOver} className="px-5">
                Start over
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-16 pt-10">
        <div className="grid grid-cols-12 items-start gap-10">
          <div className="col-span-12 lg:col-span-8">
            <div className="space-y-10">
              {!versions.length ? (
                <Surface className="p-8 sm:p-10">
                  <p className="text-sm leading-relaxed text-muted">
                    Ask for a look in the chat, and your versions will appear here.
                  </p>
                </Surface>
              ) : (
                versions.map((version) => {
                  const shopItems = version.recommendation ? getPrimaryShopItems(version.recommendation, 4) : [];
                  const hasImage = Boolean(version.generatedImage);

                  return (
                    <div key={version.id} className="space-y-8">
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
                            {shopItems.length ? <ProductGrid items={shopItems} /> : null}

                            {version.recommendation.other_recommendation ? (
                              <div className="flex items-start gap-2 text-sm leading-relaxed text-muted">
                                <Star className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                                <p className="min-w-0">{version.recommendation.other_recommendation}</p>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-sm leading-relaxed text-muted">
                            {version.stageErrors?.a || "No recommendation available yet."}
                          </p>
                        )}
                      </Surface>

                      <div className="mx-auto w-full max-w-6xl">
                        <div className="grid gap-6 lg:grid-cols-2">
                          <Surface className="overflow-hidden p-0">
                            <OutfitPreview
                              state={version.stages.b ?? "pending"}
                              image={version.generatedImage}
                              feedback={version.feedback}
                              onFeedback={(value) => recordFeedback(version.id, value)}
                            />
                          </Surface>

                          <Surface className="overflow-hidden p-0">
                            <MotionPreview
                              state={version.stages.c ?? "pending"}
                              image={version.generatedImage}
                              video={version.generatedVideo}
                              videoEnabled={videoEnabled}
                            />
                          </Surface>
                        </div>
                      </div>
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
              onSubmitRequest={runSequence}
              onToggleVideo={(value) => setVideoEnabled(value)}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
