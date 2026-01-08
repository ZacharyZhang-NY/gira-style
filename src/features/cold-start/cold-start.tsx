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
import {
  COLD_START_QUESTIONS,
  EMPTY_COLD_START_ANSWERS,
  type ColdStartAnswers,
} from "./questions";

type StoredColdStart = {
  answers: ColdStartAnswers;
  updatedAt: string;
};

type StoredIntentDraft = {
  text: string;
  updatedAt: string;
};

export function ColdStart() {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const transition = luxTween(shouldReduceMotion);

  const [answers, setAnswers] = React.useState<ColdStartAnswers>(EMPTY_COLD_START_ANSWERS);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [intentText, setIntentText] = React.useState("");
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const stored = readLocalStorageJson<StoredColdStart>(STORAGE_KEYS.coldStart);
    if (!stored?.answers) return;
    setAnswers({ ...EMPTY_COLD_START_ANSWERS, ...stored.answers });
  }, []);

  const total = COLD_START_QUESTIONS.length;
  const totalSteps = total + 1;
  const isIntentStep = stepIndex === total;
  const question = isIntentStep ? null : COLD_START_QUESTIONS[stepIndex];
  const selectedValue = question ? answers[question.id] || "" : "";
  const currentStep = Math.min(stepIndex + 1, totalSteps);

  React.useEffect(() => {
    const storedDraft = readLocalStorageJson<StoredIntentDraft>(STORAGE_KEYS.intentDraft);
    if (!storedDraft?.text) return;
    setIntentText(storedDraft.text);
  }, []);

  function setAnswer(nextValue: string) {
    setError("");
    if (!question) return;
    setAnswers((prev) => ({ ...prev, [question.id]: nextValue }));
  }

  function goBack() {
    setError("");
    setStepIndex((i) => Math.max(0, i - 1));
  }

  function goNext() {
    if (isIntentStep) return;
    if (!selectedValue) {
      setError("Pick one option so I can tailor your first look.");
      return;
    }
    setError("");
    setStepIndex((i) => Math.min(total, i + 1));
  }

  function finish() {
    const trimmed = intentText.trim();
    if (!trimmed) {
      setError("Give me one sentence—where are you headed, and how do you want to feel?");
      return;
    }

    const payload: StoredColdStart = {
      answers,
      updatedAt: new Date().toISOString(),
    };
    writeLocalStorageJson(STORAGE_KEYS.coldStart, payload);

    const intentPayload: StoredIntentDraft = {
      text: trimmed,
      updatedAt: new Date().toISOString(),
    };
    writeLocalStorageJson(STORAGE_KEYS.intentDraft, intentPayload);

    router.push("/studio");
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30">
        <div className="mx-auto max-w-6xl px-6 pt-5">
          <div className="flex items-center justify-between gap-4 rounded-full px-4 py-3 ui-glass-subtle">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="font-display text-lg leading-none tracking-tight text-text">GiraStyle</span>
              <span className="hidden text-[11px] font-semibold uppercase tracking-[0.22em] text-muted sm:inline">
                Start
              </span>
            </Link>

            <ThemeToggle className="hidden sm:inline-flex" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-16 pt-10">
        <div className="grid grid-cols-12 items-start gap-10">
          <div className="col-span-12 lg:col-span-4">
            <div className="lg:sticky lg:top-28">
              <div className="sr-only">Quick setup</div>
              <h1 className="mt-4 font-display text-4xl leading-[1.05] tracking-tight text-text sm:text-5xl">
                Let&apos;s find your <span className="italic">quiet confidence</span>.
              </h1>
              <p className="mt-5 max-w-[38ch] text-sm leading-relaxed text-muted">
                {isIntentStep
                  ? "Now give me the moment: time, place, weather—and how you want to feel."
                  : "No pressure. Pick what feels right—then we’ll turn it into a look you can actually wear."}
              </p>

              <Surface tone="subtle" className="mt-8 p-6" aria-live="polite">
                <div className="flex items-end justify-between gap-6">
                  <div className="sr-only">Progress</div>
                  <div className="text-sm font-semibold text-text">
                    {currentStep} / {totalSteps}
                  </div>
                </div>
                <div className="mt-4 h-2 w-full rounded-full bg-glass-highlight/20" role="progressbar" aria-label="Quiz progress">
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
                  key={isIntentStep ? "intent" : question?.id}
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -12 }}
                  transition={transition}
                >
                  <div className="flex flex-wrap items-end justify-between gap-6">
                    <div className="max-w-[60ch]">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">
                        {isIntentStep ? "Your moment" : `Question ${stepIndex + 1}`}
                      </div>
                      <h2 className="mt-3 font-display text-2xl leading-[1.15] tracking-tight text-text sm:text-3xl">
                        {isIntentStep ? "Tell me where you’re headed." : question?.title}
                      </h2>
                      <p className="mt-3 text-sm leading-relaxed text-muted">
                        {isIntentStep ? "One sentence is plenty. I’ll take it from there." : question?.hint}
                      </p>
                    </div>
                  </div>

                  {isIntentStep ? (
                    <div className="mt-8 space-y-3">
                      <label
                        htmlFor="intentText"
                        className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted"
                      >
                        Your request <span className="text-muted">(required)</span>
                      </label>
                      <Textarea
                        id="intentText"
                        value={intentText}
                        onChange={(e) => {
                          setIntentText(e.target.value);
                          setError("");
                        }}
                        rows={4}
                        placeholder="Dinner date, cool weather. Refined, modern, a little dramatic—nothing fussy."
                        className={cn(error && "border-gold")}
                      />
                    </div>
                  ) : (
                    <div className="mt-8 grid gap-4">
                      {question?.options.map((opt) => {
                        const isSelected = selectedValue === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setAnswer(opt.value)}
                            className={cn(
                              "group relative flex w-full cursor-pointer items-start justify-between gap-6 rounded-2xl p-6 text-left",
                              "ui-glass-subtle",
                              "transition-[transform,box-shadow] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                              "hover:shadow-lux-md motion-safe:hover:-translate-y-0.5",
                              isSelected && "shadow-lux-md",
                            )}
                          >
                            <div className="min-w-0">
                              <div className="font-display text-2xl leading-tight tracking-tight text-text">{opt.title}</div>
                              <div className="mt-2 text-sm leading-relaxed text-muted">{opt.description}</div>
                            </div>

                            <div className="mt-1 flex items-center gap-4">
                              <span
                                className={cn(
                                  "h-3.5 w-3.5 rounded-full border transition-colors duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                                  isSelected
                                    ? "border-gold bg-gold"
                                    : "border-glass-border/45 bg-glass-highlight/15 group-hover:border-glass-border/70",
                                )}
                                aria-hidden="true"
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {error ? (
                    <p role="alert" className="mt-6 text-sm text-text">{error}</p>
                  ) : null}

                  <div className="mt-8 flex items-center justify-between gap-3">
                    <Button tone="ghost" onClick={goBack} disabled={stepIndex === 0}>
                      Back
                    </Button>

                    {isIntentStep ? (
                      <Button onClick={finish}>Look at what you&apos;ve got</Button>
                    ) : (
                      <Button onClick={goNext}>Next</Button>
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
