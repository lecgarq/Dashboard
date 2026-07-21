import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assembleActivityUniverseMeta,
  readActivityUniverseMeta,
  type ActivityUniverseCoverage,
} from "./activityUniversePayload";

const coverage: ActivityUniverseCoverage = {
  measuredAt: "2026-07-21T00:00:00Z",
  total: 100,
  nullEmail: 1,
  matchedPair: 60,
  matchedEmailOnly: 30,
  unmatchedEmail: 9,
  resolvedPairRate: 0.6,
  resolvedEmailRate: 0.9,
  unknownAuthorRate: 0.1,
};

describe("activityUniversePayload", () => {
  it("assembles the v1 meta shape round-trippable through JSON", () => {
    const meta = assembleActivityUniverseMeta({
      embeddingRunId: "run-1",
      generatedAt: "2026-07-21T01:00:00Z",
      count: 100,
      dicts: { verb: ["(none)", "view"] },
      coverage,
    });
    expect(meta.version).toBe(1);
    expect(JSON.parse(JSON.stringify(meta))).toEqual(meta);
    expect(meta.coverage.unknownAuthorRate).toBeCloseTo(0.1);
  });

  it("returns null when the artifact pair is absent, meta when both exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "au-"));
    expect(readActivityUniverseMeta(dir)).toBeNull();
    // meta alone is not enough — the .bin must exist too
    const emb = join(dir, ".embedding");
    require("node:fs").mkdirSync(emb, { recursive: true });
    writeFileSync(
      join(emb, "activity-universe-meta.json"),
      JSON.stringify(
        assembleActivityUniverseMeta({
          embeddingRunId: "r",
          generatedAt: "t",
          count: 1,
          dicts: {},
          coverage,
        }),
      ),
    );
    expect(readActivityUniverseMeta(dir)).toBeNull();
    writeFileSync(join(emb, "activity-universe.bin"), Buffer.from([1, 2, 3]));
    expect(readActivityUniverseMeta(dir)?.embeddingRunId).toBe("r");
  });
});
