import { describe, expect, it } from "vitest";
import {
  buildUniqueAutodeskEmailMap,
  mergeAttributionMaps,
} from "./activityAttribution";

describe("activity attribution helpers", () => {
  it("builds a unique Autodesk ID to email map and flags ambiguous IDs", () => {
    const result = buildUniqueAutodeskEmailMap([
      { autodeskId: " A1 ", email: "ALICE@EXAMPLE.COM " },
      { autodeskId: "A1", email: "alice@example.com" },
      { autodeskId: "B2", email: "bob@example.com" },
      { autodeskId: "B2", email: "robert@example.com" },
      { autodeskId: "", email: "ignored@example.com" },
      { autodeskId: "C3", email: null },
    ]);

    expect(result.emailsById.get("A1")).toBe("alice@example.com");
    expect(result.emailsById.has("B2")).toBe(false);
    expect(result.ambiguousIds.has("B2")).toBe(true);
  });

  it("merges sources but excludes IDs when sources disagree", () => {
    const dc = buildUniqueAutodeskEmailMap([
      { autodeskId: "A1", email: "alice@example.com" },
      { autodeskId: "B2", email: "bob@example.com" },
    ]);
    const cache = buildUniqueAutodeskEmailMap([
      { autodeskId: "A1", email: "alice@example.com" },
      { autodeskId: "B2", email: "other@example.com" },
      { autodeskId: "C3", email: "carol@example.com" },
    ]);

    const merged = mergeAttributionMaps([dc, cache]);

    expect(merged.emailsById.get("A1")).toBe("alice@example.com");
    expect(merged.emailsById.get("C3")).toBe("carol@example.com");
    expect(merged.emailsById.has("B2")).toBe(false);
    expect(merged.ambiguousIds.has("B2")).toBe(true);
  });
});
