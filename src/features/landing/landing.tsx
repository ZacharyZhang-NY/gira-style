"use client";

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { ArrowRight, CheckCircle2, Compass, SlidersHorizontal, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { CommunityLooks } from "@/features/studio/components/community-looks";
import { fetchCommunityLooks, updateCommunityFeedback } from "@/features/studio/api";
import type { CommunityLook } from "@/features/studio/types";
import { ThemeToggle } from "@/features/theme/theme-toggle";
import { cn } from "@/lib/cn";
import { luxTween, LUX_DURATION } from "@/lib/motion";
import { readLocalStorageJson, writeLocalStorageJson } from "@/lib/storage";
import { STORAGE_KEYS } from "@/lib/storageKeys";

import { LiquidPointer } from "./liquid-pointer";

const INTENTS = [
  {
    label: "Work polish",
    summary: "Structured lines, clean layering, calm finish.",
  },
  {
    label: "Evening sharp",
    summary: "Higher contrast, subtle shine, refined silhouette.",
  },
  {
    label: "Weekend ease",
    summary: "Soft textures, relaxed structure, minimal noise.",
  },
] as const;

const FLOW = [
  {
    title: "Describe context",
    body: "Occasion, mood, and constraints in one clear input.",
    icon: Compass,
  },
  {
    title: "Curate quickly",
    body: "Focused recommendations, no cluttered decision tree.",
    icon: Sparkles,
  },
  {
    title: "Refine live",
    body: "Micro-adjust tone and detail until it feels right.",
    icon: SlidersHorizontal,
  },
] as const;

type StoredCommunityVoter = {
  id: string;
  updatedAt: string;
};

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

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ ...luxTween(shouldReduceMotion, LUX_DURATION.base), delay: shouldReduceMotion ? 0 : delay }}
    >
      {children}
    </motion.div>
  );
}

function FlowCard({
  title,
  body,
  icon: Icon,
  active,
  onHover,
}: {
  title: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onHover: () => void;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.article
      whileHover={shouldReduceMotion ? undefined : { y: -4 }}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.995 }}
      transition={luxTween(shouldReduceMotion, 0.28)}
      onMouseEnter={onHover}
      className={cn(
        "rounded-2xl p-5 ui-glass-subtle",
        active && "shadow-lux-md",
      )}
    >
      <div className="flex items-start gap-4">
        <motion.span
          whileHover={shouldReduceMotion ? undefined : { rotate: -6, scale: 1.05 }}
          transition={luxTween(shouldReduceMotion, 0.22)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-glass-highlight/25 text-text"
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </motion.span>
        <div className="min-w-0">
          <h3 className="font-display text-2xl leading-tight tracking-tight text-text">{title}</h3>
          <p className="mt-2 text-base leading-relaxed text-muted">{body}</p>
        </div>
      </div>
    </motion.article>
  );
}

export function Landing() {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const { scrollY } = useScroll();

  const [activeIntent, setActiveIntent] = React.useState(0);
  const [activeFlow, setActiveFlow] = React.useState(0);
  const [scrolled, setScrolled] = React.useState(false);
  const [communityLooks, setCommunityLooks] = React.useState<CommunityLook[]>([]);
  const [communityVoterId, setCommunityVoterId] = React.useState<string | null>(null);
  const [communityState, setCommunityState] = React.useState<"loading" | "ready" | "empty" | "error">("loading");

  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const rotateX = useTransform(tiltY, [-40, 40], [5, -5]);
  const rotateY = useTransform(tiltX, [-40, 40], [-6, 6]);

  useMotionValueEvent(scrollY, "change", (v) => {
    if (shouldReduceMotion) return;
    setScrolled(v > 8);
  });

  const progressWidth = `${((activeFlow + 1) / FLOW.length) * 100}%`;

  const goStart = React.useCallback(() => {
    router.push("/start");
  }, [router]);

  const handlePreviewMove = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (shouldReduceMotion) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      tiltX.set(Math.max(-40, Math.min(40, x / 4)));
      tiltY.set(Math.max(-40, Math.min(40, y / 4)));
    },
    [shouldReduceMotion, tiltX, tiltY],
  );

  const resetPreviewTilt = React.useCallback(() => {
    tiltX.set(0);
    tiltY.set(0);
  }, [tiltX, tiltY]);

  React.useEffect(() => {
    setCommunityVoterId(getCommunityVoterId());
  }, []);

  React.useEffect(() => {
    if (!communityVoterId) return;
    const controller = new AbortController();
    setCommunityState("loading");
    fetchCommunityLooks({ signal: controller.signal, voterId: communityVoterId })
      .then((looks) => {
        setCommunityLooks(looks);
        setCommunityState(looks.length ? "ready" : "empty");
      })
      .catch(() => {
        setCommunityLooks([]);
        setCommunityState("error");
      });
    return () => controller.abort();
  }, [communityVoterId]);

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

  return (
    <div className="min-h-screen">
      <LiquidPointer />

      <header className="sticky top-0 z-40">
        <div className="mx-auto max-w-7xl px-6 pt-5">
          <motion.div
            layout={!shouldReduceMotion}
            transition={luxTween(shouldReduceMotion, 0.35)}
            className={cn(
              "flex items-center justify-between gap-4 rounded-full px-4 py-3",
              "ui-glass-liquid",
              scrolled ? "shadow-lux-lg" : "shadow-lux-md",
            )}
          >
            <Link href="/start" className="group inline-flex items-center">
              <span className="font-display text-base leading-none tracking-tight text-text sm:text-lg">GiraStyle</span>
            </Link>

            <div className="flex items-center gap-3">
              <ThemeToggle className="hidden sm:inline-flex" />
              <Button onClick={goStart} className="px-5 whitespace-nowrap">
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  Playground
                  <ArrowRight className="h-4 w-4 opacity-80" aria-hidden="true" />
                </span>
              </Button>
            </div>
          </motion.div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-20 pt-10">
        <section id="hero" className="grid items-start gap-10 pt-8 scroll-mt-28 lg:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)] lg:pt-12">
          <div className="lg:col-start-1 lg:row-start-1">
            <Reveal delay={0.08}>
              <h1 className="mt-5 font-display text-5xl leading-[0.98] tracking-tight text-text sm:text-6xl lg:text-7xl">
                I&apos;m Gira,
                <br />
                your AI-Powered personal stylist.
              </h1>
            </Reveal>

            <Reveal delay={0.14}>
              <p className="mt-6 max-w-[56ch] text-base leading-relaxed text-muted">
                Let&apos;s find your quiet confidence through curated looks that truly understand your taste, for every
                occasion.
              </p>
            </Reveal>
          </div>

          <Reveal delay={0.12} className="lg:col-start-2 lg:row-start-1">
            <motion.div
              onMouseMove={handlePreviewMove}
              onMouseLeave={resetPreviewTilt}
              onBlur={resetPreviewTilt}
              style={
                shouldReduceMotion
                  ? undefined
                  : {
                      rotateX,
                      rotateY,
                      transformPerspective: 900,
                    }
              }
              className="rounded-3xl"
            >
              <Surface tone="glass" className="rounded-3xl p-6 sm:p-7">
                <div className="space-y-4">
                  {FLOW.map((item, index) => (
                    <motion.div
                      key={item.title}
                      whileHover={shouldReduceMotion ? undefined : { x: 3 }}
                      whileTap={shouldReduceMotion ? undefined : { scale: 0.995 }}
                      transition={luxTween(shouldReduceMotion, 0.2)}
                      className={cn(
                        "flex items-center justify-between gap-4 rounded-2xl px-4 py-3 ui-glass-subtle",
                        activeFlow === index && "shadow-lux-md",
                      )}
                      onMouseEnter={() => setActiveFlow(index)}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-text">{item.title}</div>
                      </div>
                      <motion.span
                        animate={shouldReduceMotion || activeFlow !== index ? undefined : { scale: [1, 1.07, 1] }}
                        transition={shouldReduceMotion ? { duration: 0 } : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <CheckCircle2 className="h-4 w-4 text-gold" aria-hidden="true" />
                      </motion.span>
                    </motion.div>
                  ))}
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between text-sm font-medium text-muted">
                    <span>Step</span>
                    <span>{activeFlow + 1} / {FLOW.length}</span>
                  </div>
                  <div className="h-2 rounded-full bg-glass-highlight/20">
                    <motion.div
                      className="h-2 rounded-full bg-gold"
                      animate={{ width: progressWidth }}
                      transition={luxTween(shouldReduceMotion, 0.28)}
                    />
                  </div>
                </div>
              </Surface>
            </motion.div>
          </Reveal>

          <div className="lg:col-start-1 lg:row-start-2 lg:self-center">
            <Reveal delay={0.2}>
              <div className="mt-8 flex flex-wrap gap-2 lg:mt-0">
                {INTENTS.map((intent, index) => {
                  const selected = activeIntent === index;
                  return (
                    <motion.button
                      key={intent.label}
                      type="button"
                      onClick={() => setActiveIntent(index)}
                      whileHover={shouldReduceMotion ? undefined : { y: -2 }}
                      whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
                      transition={luxTween(shouldReduceMotion, 0.18)}
                      aria-pressed={selected}
                      className={cn(
                        "rounded-full px-4 py-2 text-sm font-semibold",
                        "transition-[box-shadow,background,color] duration-300",
                        selected ? "bg-text text-bg shadow-lux-md" : "ui-glass-subtle text-text",
                      )}
                    >
                      {intent.label}
                    </motion.button>
                  );
                })}
              </div>
            </Reveal>

            <Reveal delay={0.24}>
              <Surface tone="subtle" className="mt-4 rounded-2xl p-4 lg:hidden">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={INTENTS[activeIntent].label}
                    initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                    transition={luxTween(shouldReduceMotion, 0.24)}
                    className="text-sm leading-relaxed text-muted"
                  >
                    {INTENTS[activeIntent].summary}
                  </motion.p>
                </AnimatePresence>
              </Surface>
            </Reveal>
          </div>

          <Reveal delay={0.16} className="hidden lg:block lg:col-start-2 lg:row-start-2 lg:self-center">
            <Surface tone="subtle" className="rounded-2xl p-4">
              <AnimatePresence mode="wait">
                <motion.p
                  key={`desktop-${INTENTS[activeIntent].label}`}
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                  transition={luxTween(shouldReduceMotion, 0.24)}
                  className="text-sm leading-relaxed text-muted"
                >
                  {INTENTS[activeIntent].summary}
                </motion.p>
              </AnimatePresence>
            </Surface>
          </Reveal>
        </section>

        <section id="benefits" className="pt-16 scroll-mt-28">
          <Reveal>
            <div>
              <h2 className="mt-3 font-display text-4xl leading-[1.02] tracking-tight text-text">
                What you get from the workflow.
              </h2>
            </div>
          </Reveal>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {FLOW.map((item, index) => (
              <Reveal key={item.title} delay={0.04 * index}>
                <FlowCard
                  title={item.title}
                  body={item.body}
                  icon={item.icon}
                  active={activeFlow === index}
                  onHover={() => setActiveFlow(index)}
                />
              </Reveal>
            ))}
          </div>
        </section>

        <section id="social-proof" className="pt-16 scroll-mt-28">
          <Reveal>
            <div className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <h2 className="mt-3 font-display text-4xl leading-[1.02] tracking-tight text-text">
                    Community-voted looks.
                  </h2>
                </div>
              </div>

              {communityState === "ready" ? (
                <CommunityLooks
                  looks={communityLooks}
                  onFeedback={handleCommunityFeedback}
                />
              ) : (
                <Surface tone="subtle" className="rounded-2xl p-6">
                  <p className="text-base leading-relaxed text-muted">
                    {communityState === "loading" && "Loading community looks…"}
                    {communityState === "empty" && "No community looks available yet."}
                    {communityState === "error" && "Community looks are unavailable right now."}
                  </p>
                </Surface>
              )}
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="pb-10 pt-14">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border/15 pt-6 text-sm text-muted">
            <span>© {new Date().getFullYear()} GiraStyle</span>
            <Link href="/start" className="hover:text-text">
              Playground
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
