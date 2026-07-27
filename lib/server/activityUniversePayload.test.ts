import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ID_ANCHOR_STRIDE,
  activityUniverseEtag,
  anchorFor,
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

  it("changes the ETag when the payload is rebuilt from an UNCHANGED embedding run", () => {
    // The real regression: derived columns (role/access/file format) are built by
    // build-activity-universe-payload.ts without a refit, so embeddingRunId stays
    // put while the bytes change. An embeddingRunId-only ETag 304s the browser
    // onto the previous artifact and the new dims read as "· unavailable".
    const before = activityUniverseEtag({
      embeddingRunId: "20260721T210323Z-80e4cff2",
      generatedAt: "2026-07-24T16:00:00.000Z",
    });
    const after = activityUniverseEtag({
      embeddingRunId: "20260721T210323Z-80e4cff2",
      generatedAt: "2026-07-24T22:30:00.000Z",
    });
    expect(after).not.toBe(before);
    expect(before).toBe('"20260721T210323Z-80e4cff2:2026-07-24T16:00:00.000Z"');
  });

  it("keeps the ETag stable for an unchanged artifact (revalidation must still 304)", () => {
    const meta = { embeddingRunId: "run-1", generatedAt: "2026-07-21T01:00:00Z" };
    expect(activityUniverseEtag(meta)).toBe(activityUniverseEtag({ ...meta }));
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

  it("anchorFor resolves index → (anchor, offset) within the stride window", () => {
    const anchors = ["id-0", "id-10000", "id-20000"];
    expect(anchorFor(anchors, 0)).toEqual({ anchorId: "id-0", offset: 0 });
    expect(anchorFor(anchors, 9_999)).toEqual({ anchorId: "id-0", offset: 9_999 });
    expect(anchorFor(anchors, ID_ANCHOR_STRIDE)).toEqual({ anchorId: "id-10000", offset: 0 });
    expect(anchorFor(anchors, 25_432)).toEqual({ anchorId: "id-20000", offset: 5_432 });
    // Out of range / invalid → null (honest failure upstream).
    expect(anchorFor(anchors, 30_000)).toBeNull();
    expect(anchorFor(anchors, -1)).toBeNull();
    expect(anchorFor(anchors, 1.5)).toBeNull();
  });
});
