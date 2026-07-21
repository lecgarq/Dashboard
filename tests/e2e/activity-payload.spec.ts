import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { decodeColumnarPayload } from "../../app/(dashboard)/users/scale-spike/columnar";

/**
 * activity-payload.spec.ts — Phase 38 SCALE-02 budget gate.
 *
 * Fetches the REAL /api/activity-universe/payload route 5× on the isolated
 * :3100 production build, decodes each response with the shared columnar codec,
 * and asserts the median fetch+decode total meets the ≤2,500 ms budget set from
 * 37-BASELINE track (b). GPU upload is NOT re-measured here (measured in Phase
 * 37; full time-to-graph re-lands when the graph consumes this route in
 * Phase 39/41). Results recorded to test-results/activity-payload.json.
 */

const OUTPUT_PATH = "test-results/activity-payload.json";
const RUNS = 5;
const BUDGET_MS = 2_500;

const EXPECTED_COLUMNS = [
  "positions",
  "verbId",
  "objectTypeId",
  "moduleId",
  "monthId",
  "roleId",
  "companyId",
  "projectId",
  "authorId",
  "folderId",
];

test("activity-universe payload meets the median-of-5 fetch+decode budget", async ({ request }) => {
  const meta = await request.get("/api/activity-universe/payload?meta=1");
  expect(meta.ok(), "meta must exist — build the artifact first").toBeTruthy();
  const metaJson = (await meta.json()) as {
    count: number;
    embeddingRunId: string;
    coverage: { unknownAuthorRate: number };
  };
  expect(metaJson.count).toBeGreaterThan(0);
  expect(metaJson.coverage.unknownAuthorRate).toBeGreaterThanOrEqual(0);

  const runs: Array<{ fetchMs: number; decodeMs: number; totalMs: number; bytes: number }> = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    const res = await request.get("/api/activity-universe/payload");
    expect(res.status()).toBe(200);
    const body = await res.body();
    const t1 = performance.now();
    const buf = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
    const decoded = decodeColumnarPayload(buf as ArrayBuffer);
    const t2 = performance.now();

    expect(decoded.count).toBe(metaJson.count);
    for (const c of EXPECTED_COLUMNS) expect(decoded.columns[c], `column ${c}`).toBeDefined();
    expect(decoded.columns.positions.length).toBe(metaJson.count * 2);

    runs.push({
      fetchMs: Math.round(t1 - t0),
      decodeMs: Math.round((t2 - t1) * 10) / 10,
      totalMs: Math.round(t2 - t0),
      bytes: body.byteLength,
    });
  }
  const totals = runs.map((r) => r.totalMs).sort((a, b) => a - b);
  const median = totals[Math.floor(totals.length / 2)];

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        embeddingRunId: metaJson.embeddingRunId,
        count: metaJson.count,
        budgetMs: BUDGET_MS,
        runs,
        medianTotalMs: median,
      },
      null,
      2,
    ),
  );
  console.log(`[activity-payload] median-of-${RUNS} fetch+decode: ${median} ms (budget ${BUDGET_MS} ms)`, runs);
  expect(median).toBeLessThanOrEqual(BUDGET_MS);
});
