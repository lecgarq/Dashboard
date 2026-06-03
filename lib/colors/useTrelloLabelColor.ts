"use client";

import { useTheme } from "next-themes";
import { useCallback } from "react";
import { getTrelloLabelColor, LABEL_COLORS_LIGHT, LABEL_COLORS_DARK } from "./trello";

/**
 * Returns a function `(labelName) => hex` that picks the right Trello label color
 * for the current theme. Resolves "system" via `next-themes`'s resolvedTheme.
 *
 * Usage:
 *   const labelColor = useTrelloLabelColor();
 *   <div style={{ backgroundColor: labelColor("green") }} />
 */
export function useTrelloLabelColor() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return useCallback(
    (name: string) => getTrelloLabelColor(name, isDark),
    [isDark],
  );
}

export { LABEL_COLORS_LIGHT, LABEL_COLORS_DARK, getTrelloLabelColor };
