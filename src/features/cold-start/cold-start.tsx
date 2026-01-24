"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { luxTween } from "@/lib/motion";
import { readLocalStorageJson, writeLocalStorageJson } from "@/lib/storage";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { ThemeToggle } from "@/features/theme/theme-toggle";
import { createSession } from "@/features/studio/api";
import {
  COLD_START_QUESTIONS,
  EMPTY_COLD_START_ANSWERS,
  isColdStartQ4Option,
  type ColdStartAnswers,
} from "./questions";

type StoredColdStart = {
  answers: ColdStartAnswers;
  updatedAt: string;
  sessionId?: string;
};

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
    q4: isColdStartQ4Option(q4Candidate) ? q4Candidate : "",
    zipCode: zipCodeCandidate,
    location: {
      latitude: latitudeCandidate,
      longitude: longitudeCandidate,
      source: sourceCandidate,
    },
    styleNote:
      styleNoteCandidate ||
      (!isColdStartQ4Option(q4Candidate) ? q4Candidate : ""),
  };
}

function createLocalSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function ColdStart() {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const transition = luxTween(shouldReduceMotion);

  const [answers, setAnswers] = React.useState<ColdStartAnswers>(
    EMPTY_COLD_START_ANSWERS,
  );
  const [stepIndex, setStepIndex] = React.useState(0);
  const [styleText, setStyleText] = React.useState("");
  const [error, setError] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDetectingZip, setIsDetectingZip] = React.useState(false);
  const stepIndexRef = React.useRef(stepIndex);

  React.useEffect(() => {
    stepIndexRef.current = stepIndex;
  }, [stepIndex]);

  React.useEffect(() => {
    const stored = readLocalStorageJson<StoredColdStart>(
      STORAGE_KEYS.coldStart,
    );
    if (!stored?.answers) return;
    const normalized = normalizeColdStartAnswers(stored.answers);
    const hasRequired = Boolean(
      normalized.q1.length &&
      normalized.q2.length &&
      normalized.q3.length &&
      normalized.q4.trim(),
    );
    if (!hasRequired) return;
    router.replace("/studio");
  }, [router]);

  const totalQuestions = COLD_START_QUESTIONS.length;
  const zipStepIndex = totalQuestions;
  const styleStepIndex = totalQuestions + 1;
  const totalSteps = totalQuestions + 2;
  const isZipStep = stepIndex === zipStepIndex;
  const isStyleStep = stepIndex === styleStepIndex;
  const hasZipCode = Boolean(answers.zipCode.trim());
  const question =
    isZipStep || isStyleStep ? null : COLD_START_QUESTIONS[stepIndex];
  const answerValue = question ? answers[question.id] : null;
  const selectedValues = React.useMemo(() => {
    if (!question) return [];
    if (Array.isArray(answerValue)) return answerValue;
    if (typeof answerValue === "string" && answerValue.trim())
      return [answerValue];
    return [];
  }, [answerValue, question]);
  const currentStep = Math.min(stepIndex + 1, totalSteps);

  function setAnswer(nextValue: string) {
    setError("");
    if (!question || question.multi) return;
    setAnswers((prev) => ({ ...prev, [question.id]: nextValue }));
  }

  function toggleAnswer(nextValue: string) {
    setError("");
    if (!question) return;
    if (!question.multi) {
      setAnswer(nextValue);
      return;
    }

    setAnswers((prev) => {
      const current = prev[question.id];
      const currentValues = Array.isArray(current)
        ? current
        : normalizeMultiSelect(current);
      const nextValues = currentValues.includes(nextValue)
        ? currentValues.filter((value) => value !== nextValue)
        : [...currentValues, nextValue];
      return { ...prev, [question.id]: nextValues };
    });
  }

  function goBack() {
    setError("");
    setStepIndex((i) => Math.max(0, i - 1));
  }

  function goNext() {
    if (isStyleStep) return;
    if (isZipStep) {
      setError("");
      setStepIndex((i) => Math.min(styleStepIndex, i + 1));
      return;
    }
    if (!selectedValues.length) {
      setError("Pick at least one option so I can tailor your first look.");
      return;
    }
    setError("");
    setStepIndex((i) => Math.min(styleStepIndex, i + 1));
  }

  async function finish() {
    if (isSaving) return;
    const trimmed = styleText.trim();

    const sessionId = createLocalSessionId();
    const nextAnswers: ColdStartAnswers = {
      ...answers,
      styleNote: trimmed,
    };
    const payload: StoredColdStart = {
      answers: nextAnswers,
      updatedAt: new Date().toISOString(),
      sessionId,
    };
    writeLocalStorageJson(STORAGE_KEYS.coldStart, payload);

    setIsSaving(true);
    setError("");
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await createSession({
        sessionId,
        preferences: nextAnswers,
        userAgent: navigator.userAgent,
        locale: navigator.language,
        timezone,
      });
      router.push("/studio");
    } catch {
      setError("We couldn't save your preferences yet. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30">
        <div className="mx-auto max-w-6xl px-6 pt-5">
          <div className="flex items-center justify-between gap-4 rounded-full px-4 py-3 ui-glass-liquid">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="font-display text-base leading-none tracking-tight text-text sm:text-lg">
                GiraStyle
              </span>
            </Link>

            <ThemeToggle className="[&_button]:px-3 [&_button]:py-1.5 [&_button]:text-[10px] [&_button]:tracking-[0.2em] sm:[&_button]:px-4 sm:[&_button]:py-2 sm:[&_button]:text-[11px] sm:[&_button]:tracking-[0.22em]" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-16 pt-10">
        <div className="grid grid-cols-12 items-start gap-x-0 gap-y-10 sm:gap-10">
          <div className="col-span-12 lg:col-span-4">
            <div className="lg:sticky lg:top-28">
              <div className="sr-only">Quick setup</div>
              <h1 className="mt-4 font-display text-3xl leading-[1.1] tracking-tight text-text sm:text-5xl sm:leading-[1.05]">
                Let&apos;s find your{" "}
                <span className="italic">quiet confidence</span>.
              </h1>

              <Surface tone="subtle" className="mt-8 p-6" aria-live="polite">
                <div className="flex items-end justify-between gap-6">
                  <div className="sr-only">Progress</div>
                  <div className="text-xs font-semibold text-text sm:text-sm">
                    {currentStep} / {totalSteps}
                  </div>
                </div>
                <div
                  className="mt-4 h-2 w-full rounded-full bg-glass-highlight/20"
                  role="progressbar"
                  aria-label="Quiz progress"
                >
                  <div
                    className="h-2 rounded-full bg-gold transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
                    style={{ width: `${(currentStep / totalSteps) * 100}%` }}
                  />
                </div>
              </Surface>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-8">
            <Surface className="p-8 sm:p-10">
              <AnimatePresence mode="wait">
                <motion.section
                  key={
                    isStyleStep
                      ? "style"
                      : isZipStep
                        ? "zip"
                        : question?.id
                  }
                  initial={
                    shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 18 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  exit={
                    shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -12 }
                  }
                  transition={transition}
                >
                  <div className="flex flex-wrap items-end justify-between gap-6">
                    <div className="max-w-[60ch]">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted sm:text-[11px]">
                        {isStyleStep
                          ? "Your style"
                          : isZipStep
                            ? "Your location"
                            : `Question ${stepIndex + 1}`}
                      </div>
                      <h2 className="mt-3 font-display text-xl leading-[1.2] tracking-tight text-text sm:text-3xl sm:leading-[1.15]">
                        {isStyleStep
                          ? "Describe your style in one sentence."
                          : isZipStep
                            ? "What’s your zip code?"
                          : question?.title}
                      </h2>
                      {!isStyleStep &&
                      !isZipStep &&
                      question?.multi &&
                      question?.hint ? (
                        <p className="mt-3 text-xs leading-relaxed text-muted sm:text-sm">
                          {question.hint}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {isStyleStep ? (
                    <div className="mt-8 space-y-3">
                      <label
                        htmlFor="styleText"
                        className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted sm:text-[11px]"
                      >
                        Style note{" "}
                        <span className="text-muted">(optional)</span>
                      </label>
                      <Textarea
                        id="styleText"
                        value={styleText}
                        onChange={(e) => {
                          setStyleText(e.target.value);
                          setError("");
                        }}
                        rows={4}
                        placeholder="Minimal, modern, tailored. Neutral palette, clean lines, subtle edge."
                        className={cn(error && "border-gold")}
                      />
                    </div>
                  ) : isZipStep ? (
                    <div className="mt-8 space-y-4">
                      <label
                        htmlFor="zipCode"
                        className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted sm:text-[11px]"
                      >
                        Zip code <span className="text-muted">(optional)</span>
                      </label>
                      <p className="text-xs leading-relaxed text-muted sm:text-sm">
                        Used only to tailor fabrics and layering to your local
                        weather.
                      </p>
                      <Textarea
                        id="zipCode"
                        value={answers.zipCode}
                        onChange={(e) => {
                          const nextZip = e.target.value;
                          setAnswers((prev) => ({
                            ...prev,
                            zipCode: nextZip,
                            location: { source: "manual" },
                          }));
                          setError("");
                        }}
                        rows={1}
                        placeholder="e.g. 90210"
                        className={cn("h-12", error && "border-gold")}
                      />
                      <div className="flex flex-wrap gap-3">
                        <Button
                          type="button"
                          tone="outline"
                          onClick={async () => {
                            if (isDetectingZip) return;
                            if (
                              typeof navigator === "undefined" ||
                              !("geolocation" in navigator)
                            ) {
                              setError("Location isn’t available—type your zip code instead.");
                              return;
                            }
                            setError("");
                            setIsDetectingZip(true);
                            try {
                              const position = await new Promise<GeolocationPosition>(
                                (resolve, reject) => {
                                  navigator.geolocation.getCurrentPosition(
                                    resolve,
                                    reject,
                                    {
                                      enableHighAccuracy: false,
                                      timeout: 10_000,
                                      maximumAge: 60_000,
                                    },
                                  );
                                },
                              );

                              const latitude = position.coords.latitude;
                              const longitude = position.coords.longitude;

                              const geoapifyKey =
                                process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY;
                              if (!geoapifyKey) {
                                throw new Error(
                                  "Location lookup isn’t configured—type your zip code instead.",
                                );
                              }

                              const resp = await fetch(
                                `https://api.geoapify.com/v1/geocode/reverse?lat=${encodeURIComponent(
                                  String(latitude),
                                )}&lon=${encodeURIComponent(
                                  String(longitude),
                                )}&lang=en&limit=1&apiKey=${encodeURIComponent(
                                  geoapifyKey,
                                )}`,
                              );
                              if (!resp.ok) {
                                throw new Error("Unable to detect zip code.");
                              }
                              const payload = (await resp.json()) as {
                                features?: Array<{
                                  properties?: { postcode?: unknown };
                                }>;
                              };
                              const postcode =
                                typeof payload.features?.[0]?.properties
                                  ?.postcode === "string"
                                  ? payload.features[0].properties.postcode.trim()
                                  : "";
                              if (!postcode) {
                                throw new Error(
                                  "We couldn’t detect a zip code for this location.",
                                );
                              }
                              if (stepIndexRef.current !== zipStepIndex) {
                                return;
                              }

                              setAnswers((prev) => ({
                                ...prev,
                                zipCode: postcode,
                                location: {
                                  latitude,
                                  longitude,
                                  source: "geolocation",
                                },
                              }));
                            } catch (err) {
                              const message =
                                err instanceof Error && err.message
                                  ? err.message
                                  : "We couldn’t detect your zip code—type it in instead.";
                              setError(message);
                            } finally {
                              setIsDetectingZip(false);
                            }
                          }}
                          isLoading={isDetectingZip}
                          className="text-xs sm:text-sm"
                        >
                          Use my location
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-8 grid gap-4">
                      {question
                        ? question.options.map((opt) => {
                            const isSelected = selectedValues.includes(
                              opt.value,
                            );
                            const isQ2 = question.id === "q2";
                            const showSubtitle = isQ2;
                            let subtitle = opt.description;
                            if (isQ2) {
                              const [beforeAgent] =
                                opt.description.split(/Agent mode:/i);
                              subtitle = beforeAgent.trim();
                            }
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => toggleAnswer(opt.value)}
                                className={cn(
                                  "group relative flex w-full cursor-pointer items-start justify-between gap-6 rounded-2xl p-6 text-left",
                                  "ui-glass-subtle",
                                  "transition-[transform,box-shadow] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                                  "hover:shadow-lux-md motion-safe:hover:-translate-y-0.5",
                                  isSelected && "shadow-lux-md",
                                )}
                              >
                                <div className="min-w-0">
                                  <div className="font-display text-lg leading-tight tracking-tight text-text sm:text-2xl">
                                    {opt.title}
                                  </div>
                                  {showSubtitle && subtitle ? (
                                    <div className="mt-2 text-xs leading-relaxed text-muted sm:text-sm">
                                      {subtitle}
                                    </div>
                                  ) : null}
                                </div>

                                <div className="mt-1 flex items-center gap-4">
                                  <span
                                    className={cn(
                                      "h-3.5 w-3.5 border transition-colors duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                                      question?.multi
                                        ? "rounded-sm"
                                        : "rounded-full",
                                      isSelected
                                        ? "border-gold bg-gold"
                                        : "border-glass-border/45 bg-glass-highlight/15 group-hover:border-glass-border/70",
                                    )}
                                    aria-hidden="true"
                                  />
                                </div>
                              </button>
                            );
                          })
                        : null}
                    </div>
                  )}

                  {error ? (
                    <p role="alert" className="mt-6 text-xs text-text sm:text-sm">
                      {error}
                    </p>
                  ) : null}

                  <div className="mt-8 flex items-center justify-between gap-3">
                    <Button
                      tone="ghost"
                      onClick={goBack}
                      disabled={stepIndex === 0}
                      className="text-xs sm:text-sm"
                    >
                      Back
                    </Button>

                    {isStyleStep ? (
                      <Button
                        onClick={finish}
                        isLoading={isSaving}
                        className="text-xs sm:text-sm"
                      >
                        Start chatting
                      </Button>
                    ) : (
                      <Button onClick={goNext} className="text-xs sm:text-sm">
                        {isZipStep && !hasZipCode ? "Skip" : "Next"}
                      </Button>
                    )}
                  </div>
                </motion.section>
              </AnimatePresence>
            </Surface>
          </div>
        </div>
      </main>
    </div>
  );
}


