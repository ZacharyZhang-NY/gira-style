export function pickSwatchHex(input: string) {
  const s = input.toLowerCase();
  if (s.includes("black")) return "#0C0A09";
  if (s.includes("charcoal")) return "#1C1917";
  if (s.includes("navy")) return "#0B1B2A";
  if (s.includes("cream")) return "#F5F1E8";
  if (s.includes("ivory")) return "#F6F0E5";
  if (s.includes("espresso")) return "#2B1D15";
  if (s.includes("oxblood")) return "#5C1F26";
  if (s.includes("olive")) return "#384431";
  if (s.includes("grey") || s.includes("gray")) return "#44403C";
  if (s.includes("brown")) return "#3A2A1C";
  if (s.includes("gold")) return "#D4AF37";
  return "#CA8A04";
}

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function makeSwatchStyle(seed: string) {
  const base = pickSwatchHex(seed);
  const h = hashString(seed);
  const accent = h % 2 === 0 ? "#CA8A04" : "#D4AF37";
  const angle = 115 + (h % 60);
  const glowX = 20 + (h % 60);
  const glowY = 10 + ((h >> 3) % 40);

  return {
    backgroundImage: [
      `radial-gradient(900px 600px at ${glowX}% ${glowY}%, ${accent}22, transparent 55%)`,
      `linear-gradient(${angle}deg, ${base}cc, #0B0907)`,
      "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01))",
    ].join(", "),
  } as const;
}

