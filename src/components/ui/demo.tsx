"use client";

import { Header, HeroContent, PulsingCircle, ShaderBackground } from "@/components/ui/shaders-hero-section";

export default function ShaderShowcase() {
  return (
    <ShaderBackground className="min-h-screen">
      <Header />
      <HeroContent />
      <PulsingCircle />
    </ShaderBackground>
  );
}
