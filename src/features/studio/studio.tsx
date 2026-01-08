"use client";

import { useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import type { ColdStartAnswers } from "@/features/cold-start/questions";
import { ThemeToggle } from "@/features/theme/theme-toggle";
import { readLocalStorageJson, removeLocalStorageItem, writeLocalStorageJson } from "@/lib/storage";
import { STORAGE_KEYS } from "@/lib/storageKeys";

import { MotionPreview } from "./components/motion-preview";
import { ProductGrid } from "./components/product-grid";
import { ChatPanel } from "./components/chat-panel";
import { createLookboardDataUri } from "./lookboard";
import { mockRecommendation } from "./mock";
import type { RecommendationPayload, StudioState, StudioVersion } from "./types";

type StoredColdStart = {
  answers: ColdStartAnswers;
  updatedAt: string;
};

type StoredIntentDraft = {
  text: string;
  updatedAt: string;
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
  const shouldReduceMotion = useReducedMotion();

  const [hydrated, setHydrated] = React.useState(false);
  const [coldStart, setColdStart] = React.useState<ColdStartAnswers | null>(null);
  const [state, setState] = React.useState<StudioState>(EMPTY_STUDIO_STATE);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const autoRequestRef = React.useRef<string | null>(null);
  const hasAutoRunRef = React.useRef(false);

  const versionsRef = React.useRef<StudioVersion[]>([]);
  React.useEffect(() => {
    versionsRef.current = state.versions;
  }, [state.versions]);

  React.useEffect(() => {
    const storedColdStart = readLocalStorageJson<StoredColdStart>(STORAGE_KEYS.coldStart);
    setColdStart(storedColdStart?.answers || null);

    const storedDraft = readLocalStorageJson<StoredIntentDraft>(STORAGE_KEYS.intentDraft);
    if (storedDraft?.text) autoRequestRef.current = storedDraft.text;

    const storedStudio = readLocalStorageJson<StudioState>(STORAGE_KEYS.studioVersions);
    if (storedStudio) setState(normalizeStudioState(storedStudio));

    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    const payload: StudioState = { ...state, updatedAt: new Date().toISOString() };
    writeLocalStorageJson(STORAGE_KEYS.studioVersions, payload);
  }, [hydrated, state]);

  const runSequence = React.useCallback(
    async (requestText: string) => {
      const trimmed = requestText.trim();
      if (!trimmed) return;

      removeLocalStorageItem(STORAGE_KEYS.intentDraft);
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
      };

      setState({
        versions: [...previous, newVersion],
        selectedIndex: previous.length,
        updatedAt: new Date().toISOString(),
      });

      const history = previous
        .filter((v) => v.recommendation)
        .map((v) => ({ user: v.request, assistant: v.recommendation }));

      void history;

      if (!shouldReduceMotion) await new Promise((r) => setTimeout(r, 900));
      const recommendation = mockRecommendation({ requestText: trimmed, answers: coldStart, versionNumber });

      setState((prev) => ({
        ...prev,
        versions: prev.versions.map((v) =>
          v.id === id
            ? { ...v, stages: { ...v.stages, a: "done", b: "loading" }, recommendation }
            : v,
        ),
      }));

      if (!shouldReduceMotion) await new Promise((r) => setTimeout(r, 1100));
      const lookboard = createLookboardDataUri({ items: getPrimaryShopItems(recommendation, 4) });
      setState((prev) => ({
        ...prev,
        versions: prev.versions.map((v) =>
          v.id === id ? { ...v, stages: { ...v.stages, b: "done", c: "loading" }, generatedImage: lookboard } : v,
        ),
      }));

      if (!shouldReduceMotion) await new Promise((r) => setTimeout(r, 700));
      setState((prev) => ({
        ...prev,
        versions: prev.versions.map((v) => (v.id === id ? { ...v, stages: { ...v.stages, c: "done" } } : v)),
      }));

      setIsGenerating(false);
    },
    [coldStart, shouldReduceMotion],
  );

  React.useEffect(() => {
    if (!hydrated) return;
    if (hasAutoRunRef.current) return;
    if (isGenerating || state.versions.length) return;
    const initial = autoRequestRef.current?.trim();
    if (!initial) return;

    hasAutoRunRef.current = true;
    void runSequence(initial);
  }, [hydrated, isGenerating, runSequence, state.versions.length]);

  const versions = state.versions;
  const selectedIndex = versions.length ? clamp(state.selectedIndex, 0, versions.length - 1) : 0;
  const active = versions[selectedIndex] || null;

  const versionLabel = versions.length ? `${selectedIndex + 1} / ${versions.length}` : "— / —";
  const disablePrev = isGenerating || selectedIndex <= 0;
  const disableNext = isGenerating || selectedIndex >= versions.length - 1;

  function startOver() {
    removeLocalStorageItem(STORAGE_KEYS.coldStart);
    removeLocalStorageItem(STORAGE_KEYS.studioVersions);
    removeLocalStorageItem(STORAGE_KEYS.intentDraft);

    setColdStart(null);
    setState(EMPTY_STUDIO_STATE);
    autoRequestRef.current = null;
    hasAutoRunRef.current = false;

    router.push("/start");
  }

  function updateVersion(id: string, updater: (v: StudioVersion) => StudioVersion) {
    setState((prev) => ({
      ...prev,
      versions: prev.versions.map((v) => (v.id === id ? updater(v) : v)),
    }));
  }

  function selectVersion(nextIndex: number) {
    if (!versions.length) return;
    if (isGenerating) return;
    setState((prev) => ({ ...prev, selectedIndex: clamp(nextIndex, 0, prev.versions.length - 1) }));
  }

  function recordFeedback(value: "up" | "down") {
    if (!active) return;
    if (isGenerating) return;

    updateVersion(active.id, (v) => ({ ...v, feedback: value }));
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

    const versionMessages = versions.flatMap((v, idx) => {
      const isSelected = idx === selectedIndex;
      const assistantText = v.recommendation?.description
        ? `Here’s the direction:\n${v.recommendation.description}\n\nWant it sharper, softer, darker, or more relaxed? Tell me.`
        : v.stages.a === "loading"
          ? "Give me a moment—I’m pulling pieces that match your vibe."
          : "I’m ready when you are.";

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
  }, [isGenerating, selectedIndex, versions]);

  const shopItems = active?.recommendation ? getPrimaryShopItems(active.recommendation, 4) : [];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30">
        <div className="mx-auto max-w-7xl px-6 pt-5">
          <div className="flex items-center justify-between gap-4 rounded-full px-4 py-3 ui-glass-subtle">
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
            <div className="space-y-8">
              <Surface className="p-8 sm:p-10">
                {!active ? null : active.stages.a === "loading" ? (
                  <div className="space-y-4">
                    <div className="h-3 w-11/12 rounded-full bg-[linear-gradient(90deg,rgb(var(--glass-border)_/_0.18)_25%,rgb(var(--glass-border)_/_0.32)_37%,rgb(var(--glass-border)_/_0.18)_63%)] bg-[length:400%_100%] motion-safe:animate-shimmer" />
                    <div className="h-3 w-10/12 rounded-full bg-[linear-gradient(90deg,rgb(var(--glass-border)_/_0.18)_25%,rgb(var(--glass-border)_/_0.32)_37%,rgb(var(--glass-border)_/_0.18)_63%)] bg-[length:400%_100%] motion-safe:animate-shimmer" />
                    <div className="h-3 w-9/12 rounded-full bg-[linear-gradient(90deg,rgb(var(--glass-border)_/_0.18)_25%,rgb(var(--glass-border)_/_0.32)_37%,rgb(var(--glass-border)_/_0.18)_63%)] bg-[length:400%_100%] motion-safe:animate-shimmer" />
                    <div className="grid grid-cols-2 gap-6 pt-4">
                      <div className="h-44 rounded-2xl ui-glass-subtle motion-safe:animate-pulse" />
                      <div className="h-44 rounded-2xl ui-glass-subtle motion-safe:animate-pulse" />
                    </div>
                  </div>
                ) : active.recommendation ? (
                  <div className="space-y-10">
                    <div className="grid gap-8 lg:grid-cols-2">
                      <p className="text-sm leading-relaxed text-text">
                        {active.recommendation.description || "A complete look, tailored to your intent."}
                      </p>
                      <p className="text-sm leading-relaxed text-muted">
                        {active.recommendation.reason || "Balanced proportions, deliberate texture, and an easy finish."}
                      </p>
                    </div>

                    {shopItems.length ? <ProductGrid items={shopItems} /> : null}

                    {active.recommendation.other_recommendation ? (
                      <p className="text-sm leading-relaxed text-muted">{active.recommendation.other_recommendation}</p>
                    ) : null}
                  </div>
                ) : null}
              </Surface>

              <div className="space-y-8">
                <div className="mx-auto w-full max-w-4xl">
                  <Surface className="overflow-hidden p-0">
                    {!active ? (
                      <div className="h-[420px] w-full sm:h-[500px]" />
                    ) : active.stages.b === "loading" ? (
                      <div className="h-[420px] w-full motion-safe:animate-pulse sm:h-[500px]" />
                    ) : active.generatedImage ? (
                      <div className="group relative h-[420px] w-full overflow-hidden sm:h-[500px]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={active.generatedImage}
                          alt="Outfit visualization"
                          className="absolute inset-0 h-full w-full object-contain p-4 filter grayscale transition-[filter,transform] duration-[1800ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none group-hover:grayscale-0 group-hover:scale-[1.01] motion-reduce:transform-none"
                        />
                        <div className="absolute left-4 top-4 rounded-full bg-glass-highlight/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-text">
                          Outfit visualization
                        </div>
                        <div
                          className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_rgb(var(--glass-border)_/_0.16)]"
                          aria-hidden="true"
                        />
                      </div>
                    ) : (
                      <div className="h-[420px] w-full sm:h-[500px]" />
                    )}
                  </Surface>
                </div>

                <div className="mx-auto w-full max-w-4xl">
                  <Surface className="overflow-hidden p-0">
                    <MotionPreview
                      state={active?.stages.c ?? "pending"}
                      image={active?.generatedImage}
                      video={active?.generatedVideo}
                    />
                  </Surface>
                </div>
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4 lg:sticky lg:top-28">
            <ChatPanel
              isBusy={isGenerating}
              versionLabel={versionLabel}
              disablePrev={disablePrev}
              disableNext={disableNext}
              disableComposer={isGenerating || !hydrated}
              feedback={active?.feedback || ""}
              messages={messages}
              onPrevVersion={() => selectVersion(selectedIndex - 1)}
              onNextVersion={() => selectVersion(selectedIndex + 1)}
              onFeedback={recordFeedback}
              onSubmitRequest={runSequence}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
