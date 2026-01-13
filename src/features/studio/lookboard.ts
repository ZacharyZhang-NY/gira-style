import type { RecommendationItem } from "./types";
import { pickSwatchHex } from "./swatch";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function createLookboardDataUri(args: { items: RecommendationItem[] }) {
  const swatches = args.items
    .slice(0, 4)
    .map((item) => pickSwatchHex(item.color || item.item_name || ""));
  while (swatches.length < 4) swatches.push("#D4AF37");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FBFAF8"/>
      <stop offset="1" stop-color="#F3F0EB"/>
    </linearGradient>
    <radialGradient id="haloA" cx="20%" cy="10%" r="65%">
      <stop offset="0" stop-color="#D4AF37" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#D4AF37" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="haloB" cx="84%" cy="14%" r="70%">
      <stop offset="0" stop-color="#98BBD2" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#98BBD2" stop-opacity="0"/>
    </radialGradient>
    <filter id="softBlur">
      <feGaussianBlur stdDeviation="22"/>
    </filter>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.25"/>
      </feComponentTransfer>
    </filter>
  </defs>

  <rect x="0" y="0" width="900" height="1200" fill="url(#paper)"/>
  <circle cx="180" cy="120" r="320" fill="url(#haloA)" filter="url(#softBlur)"/>
  <circle cx="760" cy="180" r="360" fill="url(#haloB)" filter="url(#softBlur)"/>

  <!-- Glass sheet -->
  <rect
    x="72" y="98" width="756" height="980" rx="44"
    fill="#FFFFFF" fill-opacity="0.40"
    stroke="#FFFFFF" stroke-opacity="0.42" stroke-width="2"
  />
  <rect
    x="76" y="102" width="748" height="972" rx="42"
    fill="none" stroke="#0C0A09" stroke-opacity="0.06" stroke-width="2"
  />

  <!-- Minimal silhouette -->
  <g opacity="0.95">
    <path
      d="M450 260
         C418 260 392 288 392 322
         C392 346 404 368 424 380
         C404 418 360 480 332 540
         C310 586 318 630 346 660
         C382 698 412 722 412 762
         C412 806 392 872 382 920
         C374 960 394 978 424 982
         C448 986 452 962 458 930
         C468 874 486 808 486 762
         C486 722 516 698 552 660
         C580 630 588 586 566 540
         C538 480 494 418 474 380
         C494 368 506 346 506 322
         C506 288 480 260 450 260 Z"
      fill="#0C0A09" fill-opacity="0.04"
    />
  </g>

  <!-- Swatches -->
  <g transform="translate(110, 1002)">
    ${swatches
      .map((hex, i) => {
        const x = i * 190;
        const opacity = clamp(0.9 - i * 0.08, 0.55, 0.9);
        return `<g transform="translate(${x},0)">
          <rect width="170" height="66" rx="18" fill="${hex}" fill-opacity="${opacity}"/>
          <rect width="170" height="66" rx="18" fill="none" stroke="#FFFFFF" stroke-opacity="0.40" stroke-width="2"/>
        </g>`;
      })
      .join("")}
  </g>

  <!-- Grain -->
  <rect x="0" y="0" width="900" height="1200" filter="url(#grain)" opacity="0.09"/>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
