// chartColors.ts
// Single source of truth for chart color. Resolves a semantic role or
// sequence index to a concrete color string, reading the live CSS custom
// property at runtime (so dark mode works) and falling back to the
// light-theme hex when unavailable (SSR + jsdom tests).

export type ChartRole =
  | "good"
  | "watch"
  | "risk"
  | "info"
  | "neutral"
  | "seq1"
  | "seq2"
  | "seq3"
  | "seq4"
  | "seq5";

const VAR_NAME: Record<ChartRole, string> = {
  good: "--success",
  watch: "--warning",
  risk: "--destructive",
  info: "--info",
  neutral: "--muted-foreground",
  seq1: "--chart-1",
  seq2: "--chart-2",
  seq3: "--chart-3",
  seq4: "--chart-4",
  seq5: "--chart-5",
};

// Light-theme values from app/globals.css :root. Used when getComputedStyle
// cannot resolve the custom property (jsdom, SSR).
const FALLBACK_HEX: Record<ChartRole, string> = {
  good: "#0E8A6D",
  watch: "#B0810A",
  risk: "#C42021",
  info: "#2E5F95",
  neutral: "#6B7280",
  seq1: "#2E5F95",
  seq2: "#E65A28",
  seq3: "#0089A3",
  seq4: "#B0810A",
  seq5: "#7E3567",
};

const SEQUENCE: ChartRole[] = ["seq1", "seq2", "seq3", "seq4", "seq5"];

export function chartColor(role: ChartRole): string {
  const fallback = FALLBACK_HEX[role];
  if (typeof window === "undefined" || typeof getComputedStyle !== "function") {
    return fallback;
  }
  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(VAR_NAME[role])
    .trim();
  return resolved || fallback;
}

/** Nth color from the curated 5-color sequence, wrapping (and handling negatives). */
export function sequenceColor(index: number): string {
  const n = SEQUENCE.length;
  return chartColor(SEQUENCE[((index % n) + n) % n]);
}
