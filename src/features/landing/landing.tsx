"use client";

import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { ArrowRight } from "lucide-react";
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

export function Landing() {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const { scrollY } = useScroll();

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
            </div>
          </motion.div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-20 pt-10">
        <section
          id="hero"
          className="grid min-h-[calc(100svh-13.5rem)] items-center gap-10 scroll-mt-28 lg:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)]"
        >
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
              <Button
                onClick={goStart}
                className="h-32 w-full rounded-3xl text-2xl tracking-[0.2em] sm:h-36 sm:text-3xl"
              >
                <span className="inline-flex items-center gap-4 whitespace-nowrap">
                  PLAYGROUND
                  <ArrowRight className="h-7 w-7 opacity-90" aria-hidden="true" />
                </span>
              </Button>
            </motion.div>
          </Reveal>

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
