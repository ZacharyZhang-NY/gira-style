"use client";

import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/features/theme/theme-toggle";
import { cn } from "@/lib/cn";
import { luxTween, LUX_DURATION } from "@/lib/motion";
import { readLocalStorageJson, writeLocalStorageJson } from "@/lib/storage";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { makeSwatchStyle } from "@/features/studio/swatch";

import { LiquidPointer } from "./liquid-pointer";

type DraftIntent = {
  text: string;
  updatedAt: string;
};

const FEATURED = [
  {
    title: "The Quiet-Luxury Work Edit",
    tag: "Curated",
    price: "From $240",
    seed: "charcoal wool blazer",
  },
  {
    title: "Dinner, Soft Light, Clean Lines",
    tag: "Evening",
    price: "From $190",
    seed: "black satin dress gold",
  },
  {
    title: "Weekend Texture & Ease",
    tag: "Off-duty",
    price: "From $160",
    seed: "cream knit espresso leather",
  },
  {
    title: "Modern Tailoring, No Noise",
    tag: "Best seller",
    price: "From $280",
    seed: "navy tailoring grey",
  },
  {
    title: "Gold Details, Minimal Everything",
    tag: "Accessories",
    price: "From $68",
    seed: "gold hoops ivory",
  },
  {
    title: "Polished Layers for Cool Weather",
    tag: "Seasonal",
    price: "From $210",
    seed: "olive coat scarf",
  },
] as const;

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const shouldReduceMotion = useReducedMotion();
  const transition = luxTween(shouldReduceMotion, LUX_DURATION.base);

  return (
    <motion.div
      className={className}
      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ ...transition, delay: shouldReduceMotion ? 0 : delay }}
    >
      {children}
    </motion.div>
  );
}

function GlassNav({ onStart }: { onStart: () => void }) {
  const shouldReduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = React.useState(false);

  useMotionValueEvent(scrollY, "change", (v) => {
    if (shouldReduceMotion) return;
    setScrolled(v > 10);
  });

  return (
    <header className="sticky top-0 z-40">
      <div className="mx-auto max-w-7xl px-6 pt-5">
        <motion.div
          layout={!shouldReduceMotion}
          transition={luxTween(shouldReduceMotion)}
          className={cn(
            "flex items-center justify-between gap-4 rounded-full px-4 py-3",
            "ui-glass-subtle",
            scrolled && "shadow-lux-lg",
          )}
        >
          <Link href="/" className="group flex items-baseline gap-2">
            <span className="font-display text-lg leading-none tracking-tight text-text">GiraStyle</span>
            <span className="hidden text-[11px] font-semibold uppercase tracking-[0.22em] text-muted sm:inline">
              Studio
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm text-muted md:flex">
            <a
              href="#edit"
              className="transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-text"
            >
              The Edit
            </a>
            <a
              href="#how"
              className="transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-text"
            >
              How it feels
            </a>
            <a
              href="#stories"
              className="transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-text"
            >
              Stories
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle className="hidden sm:inline-flex" />
            <Button onClick={onStart} className="px-5">
              Start styling <ArrowRight className="h-4 w-4 opacity-80" aria-hidden="true" />
            </Button>
          </div>
        </motion.div>
      </div>
    </header>
  );
}

function IntentComposer({ onSubmit }: { onSubmit: (text: string) => void }) {
  const shouldReduceMotion = useReducedMotion();
  const transition = luxTween(shouldReduceMotion, 0.55);
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState("");

  const chips = [
    "Work meeting, refined and calm.",
    "Dinner date, modern and a little dramatic.",
    "Weekend errands, polished but effortless.",
  ];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Tell me the moment—one sentence is enough.");
      return;
    }
    setError("");
    onSubmit(trimmed);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <label htmlFor="intent" className="sr-only">
            Your request
          </label>
          <Textarea
            id="intent"
            rows={2}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
            placeholder="Tell me where you’re headed—and how you want to feel."
            className={cn(error && "ring-2 ring-gold/40")}
          />
          <AnimatePresence>
            {error ? (
              <motion.p
                role="alert"
                initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
                transition={transition}
                className="mt-2 text-sm text-text"
              >
                {error}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>

        <Button type="submit" className="h-[52px] px-7">
          Look at what you&apos;ve got
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => {
              setValue(chip);
              setError("");
            }}
            className={cn(
              "rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em]",
              "ui-glass-subtle",
              "transition-[transform,box-shadow] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
              "hover:shadow-lux-md motion-safe:hover:-translate-y-0.5",
            )}
          >
            {chip.replaceAll(".", "")}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProductCard({
  title,
  tag,
  price,
  seed,
}: {
  title: string;
  tag: string;
  price: string;
  seed: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const transition = luxTween(shouldReduceMotion, LUX_DURATION.base);

  return (
    <motion.article
      whileHover={shouldReduceMotion ? undefined : { y: -6 }}
      transition={transition}
      className={cn("group relative overflow-hidden rounded-2xl ui-glass")}
    >
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(420px_240px_at_20%_0%,rgba(255,255,255,0.35),transparent_70%)] opacity-0 transition-opacity duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-100" />

      <div className="p-4">
        <div
          className={cn(
            "relative aspect-[4/5] w-full overflow-hidden rounded-xl",
            "transition-[transform,filter,box-shadow] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
            shouldReduceMotion ? "duration-0" : "duration-[1800ms]",
            "filter grayscale group-hover:grayscale-0",
            "group-hover:shadow-lux-md",
            "will-change-transform",
            "group-hover:scale-[1.03] motion-reduce:transform-none",
          )}
          style={makeSwatchStyle(seed)}
        >
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.02))]" />
          <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_rgb(var(--glass-border)_/_0.35)]" aria-hidden="true" />

          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-4">
            <span className="rounded-full bg-glass-highlight/25 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-text">
              {tag}
            </span>
            <span className="text-sm font-semibold text-text">{price}</span>
          </div>
        </div>

        <div className="mt-4">
          <div className="font-display text-xl leading-tight tracking-tight text-text">{title}</div>
          <div className="mt-2 text-sm leading-relaxed text-muted">
            Crisp silhouette, calm texture, and a finish that reads expensive.
          </div>
        </div>
      </div>
    </motion.article>
  );
}

export function Landing() {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();

  const start = React.useCallback(() => {
    router.push("/start");
  }, [router]);

  const submitIntent = React.useCallback(
    (text: string) => {
      writeLocalStorageJson(STORAGE_KEYS.intentDraft, { text, updatedAt: new Date().toISOString() } satisfies DraftIntent);
      const storedColdStart = readLocalStorageJson(STORAGE_KEYS.coldStart);
      router.push(storedColdStart ? "/studio" : "/start");
    },
    [router],
  );

  return (
    <div className="min-h-screen">
      <LiquidPointer />
      <GlassNav onStart={start} />

      <main className="mx-auto max-w-7xl px-6 pb-24 pt-10">
        <section className="grid items-start gap-12 pt-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:pt-14">
          <div>
            <Reveal delay={0.02}>
              <h1 className="font-display text-5xl leading-[0.96] tracking-tight text-text sm:text-6xl lg:text-7xl">
                Look at what you&apos;ve got.
              </h1>
            </Reveal>
            <Reveal delay={0.08}>
              <p className="mt-6 max-w-[56ch] text-base leading-relaxed text-muted">
                A warm styling concierge with a luxury retail eye. Tell me the moment—then we shape a look that feels
                like you.
              </p>
            </Reveal>

            <div className="mt-9">
              <Reveal delay={0.14}>
                <IntentComposer onSubmit={submitIntent} />
              </Reveal>
            </div>

            <Reveal delay={0.2}>
              <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                <span className="rounded-full bg-glass-highlight/20 px-3 py-2">Light-first</span>
                <span className="rounded-full bg-glass-highlight/20 px-3 py-2">No login</span>
                <span className="rounded-full bg-glass-highlight/20 px-3 py-2">Refine in seconds</span>
              </div>
            </Reveal>
          </div>

          <Reveal className="lg:pt-6" delay={0.1}>
            <Surface tone="glass" className="relative overflow-hidden rounded-3xl p-6 sm:p-7">
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(600px_420px_at_22%_0%,rgba(255,255,255,0.40),transparent_68%)]" />

              <div className="relative grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <motion.div
                    initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={luxTween(shouldReduceMotion, LUX_DURATION.slow)}
                    className="overflow-hidden rounded-2xl ui-glass-subtle p-4"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Today&apos;s pick</div>
                    <div className="mt-3 font-display text-2xl leading-[1.05] tracking-tight text-text">
                      Tailoring, softened.
                    </div>
                    <div className="mt-4 text-sm leading-relaxed text-muted">
                      Sharp lines, warm texture, no stiffness.
                    </div>
                  </motion.div>

                  <motion.div
                    initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={luxTween(shouldReduceMotion, LUX_DURATION.slow)}
                    className="overflow-hidden rounded-2xl ui-glass-subtle p-4"
                    style={makeSwatchStyle("charcoal blazer gold")}
                  >
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.02))]" />
                    <div className="relative">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">Material</div>
                      <div className="mt-2 font-display text-2xl leading-[1.05] tracking-tight text-white">
                        Wool & satin
                      </div>
                      <div className="mt-4 text-sm leading-relaxed text-white/80">Quiet sheen, clean shape.</div>
                    </div>
                  </motion.div>
                </div>

                <motion.div
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={luxTween(shouldReduceMotion, LUX_DURATION.slow)}
                  className="overflow-hidden rounded-2xl ui-glass-subtle p-5"
                >
                  <div className="flex items-start justify-between gap-6">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Your next look</div>
                      <div className="mt-3 font-display text-3xl leading-[1.04] tracking-tight text-text">
                        Built around your intent.
                      </div>
                      <div className="mt-3 text-sm leading-relaxed text-muted">
                        The studio keeps it simple: request → look → refine.
                      </div>
                    </div>
                    <Button tone="outline" onClick={start} className="px-5">
                      Open studio
                    </Button>
                  </div>
                </motion.div>
              </div>
            </Surface>
          </Reveal>
        </section>

        <section id="edit" className="pt-20">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Curated</div>
                <h2 className="mt-3 font-display text-4xl leading-[1.02] tracking-tight text-text">
                  The Edit
                </h2>
              </div>
              <Button tone="outline" onClick={start} className="px-6">
                Personalize mine
              </Button>
            </div>
          </Reveal>

          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURED.map((item, index) => (
              <Reveal key={item.title} delay={0.04 * index}>
                <ProductCard title={item.title} tag={item.tag} price={item.price} seed={item.seed} />
              </Reveal>
            ))}
          </div>
        </section>

        <section id="how" className="pt-24">
          <Reveal>
            <div className="grid gap-10 lg:grid-cols-12 lg:items-start">
              <div className="lg:col-span-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">How it feels</div>
                <h2 className="mt-3 font-display text-4xl leading-[1.02] tracking-tight text-text">
                  Like shopping with a calm friend who has taste.
                </h2>
                <p className="mt-5 text-sm leading-relaxed text-muted">
                  You stay in control. We keep the language simple—sharper, softer, warmer, cleaner—until it&apos;s right.
                </p>
              </div>

              <div className="grid gap-4 lg:col-span-7 sm:grid-cols-2">
                {[
                  { title: "One sentence in.", body: "Tell me the moment. I’ll pull a direction that fits." },
                  { title: "Cinematic, not chaotic.", body: "Slow, luxe motion. Clear hierarchy. No noise." },
                  { title: "Refine with plain words.", body: "“More minimal.” “More dramatic.” “Keep it warm.”" },
                  { title: "Shop-friendly output.", body: "Pieces you can actually buy, not fantasy styling." },
                ].map((f) => (
                  <Surface key={f.title} tone="subtle" className="p-6">
                    <div className="font-display text-2xl leading-tight tracking-tight text-text">{f.title}</div>
                    <div className="mt-3 text-sm leading-relaxed text-muted">{f.body}</div>
                  </Surface>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        <section id="stories" className="pt-24">
          <Reveal>
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Stories</div>
                <h2 className="mt-3 font-display text-4xl leading-[1.02] tracking-tight text-text">
                  The little shifts that change everything.
                </h2>
              </div>

              <div className="grid gap-4 lg:col-span-8">
                {[
                  {
                    quote: "“I finally have outfits that feel like me—without overthinking.”",
                    by: "Client note",
                  },
                  {
                    quote: "“The refine loop is magic. One sentence and the whole vibe clicks.”",
                    by: "Studio user",
                  },
                ].map((t) => (
                  <Surface key={t.quote} tone="glass" className="p-7">
                    <div className="font-display text-2xl leading-[1.12] tracking-tight text-text">{t.quote}</div>
                    <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">{t.by}</div>
                  </Surface>
                ))}
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="pb-16">
        <div className="mx-auto max-w-7xl px-6">
          <Surface tone="subtle" className="flex flex-wrap items-center justify-between gap-6 rounded-3xl p-7">
            <div>
              <div className="font-display text-2xl leading-tight tracking-tight text-text">Ready when you are.</div>
              <div className="mt-2 text-sm leading-relaxed text-muted">
                Tell me the moment. We&apos;ll build your look—then polish it.
              </div>
            </div>
            <Button onClick={start} className="px-7">
              Start styling <ArrowRight className="h-4 w-4 opacity-80" aria-hidden="true" />
            </Button>
          </Surface>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 text-xs text-muted">
            <div>© {new Date().getFullYear()} GiraStyle</div>
            <div className="flex items-center gap-6">
              <a href="#edit" className="hover:text-text">
                The Edit
              </a>
              <Link href="/start" className="hover:text-text">
                Start
              </Link>
              <Link href="/studio" className="hover:text-text">
                Studio
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

