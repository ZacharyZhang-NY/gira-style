import fs from "node:fs";
import path from "node:path";

import { Studio } from "@/features/studio/studio";

function loadChipOptions() {
  const constantsPath = path.join(process.cwd(), "api", "constants.py");
  let raw = "";
  try {
    raw = fs.readFileSync(constantsPath, "utf8");
  } catch {
    return [];
  }

  const blockMatch = raw.match(/CHIP_CATEGORIES\s*=\s*\{([\s\S]*?)\n\}/);
  if (!blockMatch) return [];
  const block = blockMatch[1];
  const chips: string[] = [];

  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.includes(": [")) continue;
    const itemMatch = trimmed.match(/^"([^"]+)"\s*,?\s*$/);
    if (itemMatch) chips.push(itemMatch[1]);
  }

  return Array.from(new Set(chips));
}

export default function StudioPage() {
  const chipOptions = loadChipOptions();
  return (
    <div className="font-jost">
      <Studio initialChips={chipOptions} />
    </div>
  );
}

