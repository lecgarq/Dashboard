/**
 * Trello label colors — single source of truth.
 *
 * Light mode: Trello's exact brand hex values.
 * Dark mode: desaturated + lightness-adjusted so labels stay readable on zinc-950
 * (Luis confirmed legibility > strict brand fidelity for dark — see DARK_MODE.md §5).
 *
 * Read at runtime via `useTrelloLabelColor()` or `getTrelloLabelColor(name, isDark)`.
 */

export type TrelloLabelKey =
  | "green"
  | "yellow"
  | "orange"
  | "red"
  | "purple"
  | "blue"
  | "sky"
  | "lime"
  | "pink"
  | "black";

export const LABEL_COLORS_LIGHT: Record<TrelloLabelKey, string> = {
  green: "#61bd4f",
  yellow: "#f2d600",
  orange: "#ff9f1a",
  red: "#eb5a46",
  purple: "#c377e0",
  blue: "#0079bf",
  sky: "#00c2e0",
  lime: "#51e898",
  pink: "#ff78cb",
  black: "#344563",
};

/**
 * Dark-mode equivalents: same hues, ~25% desaturated, lightness lifted ~10%.
 * Computed once so the values are stable; not derived at runtime to avoid color-math bugs.
 */
const LABEL_COLORS_DARK: Record<TrelloLabelKey, string> = {
  green: "#7fc77a",
  yellow: "#e8d75c",
  orange: "#ffb454",
  red: "#e0826f",
  purple: "#c89cdf",
  blue: "#4d9fd1",
  sky: "#5cd1e8",
  lime: "#7feba8",
  pink: "#ffa5d6",
  black: "#6b7894",
};

export function getTrelloLabelColor(name: string, isDark: boolean): string {
  const key = name as TrelloLabelKey;
  const map = isDark ? LABEL_COLORS_DARK : LABEL_COLORS_LIGHT;
  return map[key] ?? (isDark ? LABEL_COLORS_DARK.black : LABEL_COLORS_LIGHT.black);
}
