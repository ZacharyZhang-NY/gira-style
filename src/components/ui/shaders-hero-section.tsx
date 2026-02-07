"use client";

import { MeshGradient, PulsingBorder } from "@paper-design/shaders-react";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import * as React from "react";

import { useTheme } from "@/features/theme/theme";
import { cn } from "@/lib/cn";

interface ShaderBackgroundProps {
  children: React.ReactNode;
  className?: string;
}

export function ShaderBackground({ children, className }: ShaderBackgroundProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isActive, setIsActive] = React.useState(false);
  const { theme } = useTheme();

  React.useEffect(() => {
    const handleMouseEnter = () => setIsActive(true);
    const handleMouseLeave = () => setIsActive(false);

    const container = containerRef.current;
    if (container) {
      container.addEventListener("mouseenter", handleMouseEnter);
      container.addEventListener("mouseleave", handleMouseLeave);
    }

    return () => {
      if (container) {
        container.removeEventListener("mouseenter", handleMouseEnter);
        container.removeEventListener("mouseleave", handleMouseLeave);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative isolate w-full overflow-hidden",
        className,
      )}
    >
      <svg className="absolute inset-0 h-0 w-0">
        <defs>
          <filter id="gira-glass-effect" x="-50%" y="-50%" width="200%" height="200%">
            <feTurbulence baseFrequency="0.005" numOctaves="1" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.3" />
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0.02
                      0 1 0 0 0.02
                      0 0 1 0 0.05
                      0 0 0 0.9 0"
              result="tint"
            />
          </filter>
          <filter id="gira-gooey-filter" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
              result="gooey"
            />
            <feComposite in="SourceGraphic" in2="gooey" operator="atop" />
          </filter>
        </defs>
      </svg>

      <MeshGradient
        className="absolute inset-0 h-full w-full"
        colors={
          theme === "dark"
            ? ["#0C0A09", "#6F531B", "#1A1511", "#2A2119", "#0F0C09"]
            : ["#F9F8F6", "#F6E8BD", "#FFFFFF", "#FAF1D8", "#FFFDF8"]
        }
        speed={isActive ? 0.42 : 0.28}
      />
      <MeshGradient
        className={cn(
          "absolute inset-0 h-full w-full transition-opacity duration-500",
          isActive ? "opacity-55" : "opacity-40",
        )}
        colors={
          theme === "dark"
            ? ["#0C0A09", "#3A2D13", "#9A742A", "#11100E"]
            : ["#FFFFFF", "#F2E3B3", "#EAD38E", "#FFFCF4"]
        }
        speed={0.2}
      />

      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          theme === "dark"
            ? "bg-[radial-gradient(120%_90%_at_20%_0%,rgba(122,92,33,0.30),transparent_65%)]"
            : "bg-[radial-gradient(120%_90%_at_20%_0%,rgba(212,175,55,0.20),transparent_65%)]",
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          theme === "dark"
            ? "bg-[radial-gradient(140%_100%_at_100%_100%,rgba(18,15,12,0.26),transparent_72%)]"
            : "bg-[radial-gradient(140%_100%_at_100%_100%,rgba(255,255,255,0.34),transparent_72%)]",
        )}
      />

      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function PulsingCircle() {
  return (
    <div className="absolute bottom-8 right-8 z-30">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <PulsingBorder
          colors={["#D4AF37", "#E8CD6E", "#F9F8F6", "#D4AF37", "#A37E2C"]}
          colorBack="#00000000"
          speed={1.5}
          roundness={1}
          thickness={0.1}
          softness={0.2}
          intensity={4.4}
          spots={4}
          spotSize={0.1}
          pulse={0.1}
          smoke={0.45}
          smokeSize={4}
          scale={0.65}
          rotation={0}
          frame={9161408.251009725}
          style={{
            width: "60px",
            height: "60px",
            borderRadius: "50%",
          }}
        />

        <motion.svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          animate={{ rotate: 360 }}
          transition={{
            duration: 20,
            repeat: Number.POSITIVE_INFINITY,
            ease: "linear",
          }}
          style={{ transform: "scale(1.6)" }}
        >
          <defs>
            <path id="gira-circle" d="M 50, 50 m -38, 0 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0" />
          </defs>
          <text className="fill-white/80 text-[8px]">
            <textPath href="#gira-circle" startOffset="0%">
              GiraStyle Playground • GiraStyle Playground •
            </textPath>
          </text>
        </motion.svg>
      </div>
    </div>
  );
}

export function HeroContent() {
  return (
    <main className="absolute bottom-8 left-8 z-20 max-w-lg">
      <div className="text-left">
        <div
          className="relative mb-4 inline-flex items-center rounded-full bg-white/5 px-3 py-1 backdrop-blur-sm"
          style={{
            filter: "url(#gira-glass-effect)",
          }}
        >
          <div className="absolute left-1 right-1 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <span className="relative z-10 text-xs font-light text-white/90">Refined shader background</span>
        </div>

        <h1 className="mb-4 text-5xl font-light tracking-tight text-white md:text-6xl md:leading-16">
          <span className="font-medium italic">Beautiful</span> Shader
          <br />
          <span className="font-light tracking-tight text-white">Experiences</span>
        </h1>

        <p className="mb-4 text-xs font-light leading-relaxed text-white/70">
          Create stunning visual experiences with interactive shader lighting and smooth transitions.
        </p>
      </div>
    </main>
  );
}

export function Header() {
  return (
    <header className="relative z-20 flex items-center justify-between p-6">
      <div className="flex items-center text-white">
        <Sparkles className="h-5 w-5" aria-hidden="true" />
      </div>

      <nav className="flex items-center space-x-2">
        <a
          href="#"
          className="rounded-full px-3 py-2 text-xs font-light text-white/80 transition-all duration-200 hover:bg-white/10 hover:text-white"
        >
          Features
        </a>
        <a
          href="#"
          className="rounded-full px-3 py-2 text-xs font-light text-white/80 transition-all duration-200 hover:bg-white/10 hover:text-white"
        >
          Pricing
        </a>
        <a
          href="#"
          className="rounded-full px-3 py-2 text-xs font-light text-white/80 transition-all duration-200 hover:bg-white/10 hover:text-white"
        >
          Docs
        </a>
      </nav>

      <div
        id="gira-gooey-btn"
        className="group relative flex items-center"
        style={{ filter: "url(#gira-gooey-filter)" }}
      >
        <button className="absolute right-0 z-0 flex h-8 -translate-x-10 items-center justify-center rounded-full bg-white px-2.5 py-2 text-xs font-normal text-black transition-all duration-300 group-hover:-translate-x-19 hover:bg-white/90">
          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </button>
        <button className="z-10 flex h-8 items-center rounded-full bg-white px-6 py-2 text-xs font-normal text-black transition-all duration-300 hover:bg-white/90">
          Login
        </button>
      </div>
    </header>
  );
}
