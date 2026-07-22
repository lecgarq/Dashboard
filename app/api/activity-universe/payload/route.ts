import { readFileSync } from "node:fs";
import {
  activityUniversePaths,
  readActivityUniverseMeta,
} from "@/lib/server/activityUniversePayload";
import { activityUniverseTestFixture } from "@/lib/server/activityUniverseTestFixture";

// v2.7 Phase 38 (SCALE-02): serves the activity-universe binary columnar
// payload materialized by scripts/build-activity-universe-payload.ts.
// ETag = embeddingRunId — the artifact only changes on a manual pipeline
// rerun (owner decision: no nightly refit), so revalidation is cheap and
// correct. `?meta=1` returns the JSON meta (dicts + ACT-02 coverage) that
// Phase 39 renders as the honest author-coverage label.
// Auth posture matches the existing local data routes (health/sim-updates):
// no session gate on this single-user local dashboard.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const fixtureEnabled =
    process.env.NEXT_PUBLIC_ACC_GRAPH_TEST === "1" &&
    process.env.ACC_ACTIVITY_TEST_FIXTURE === "1";
  const fixture = fixtureEnabled ? activityUniverseTestFixture() : null;
  const meta = fixture?.meta ?? readActivityUniverseMeta();
  if (!meta) {
    return Response.json(
      { error: "activity-universe artifact not built — run compute_activity_embeddings.py then build-activity-universe-payload.ts" },
      { status: 404 },
    );
  }
  const etag = `"${meta.embeddingRunId}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }
  const url = new URL(request.url);
  if (url.searchParams.get("meta") === "1") {
    return Response.json(meta, {
      headers: { ETag: etag, "Cache-Control": "public, max-age=0, must-revalidate" },
    });
  }
  // ponytail: whole-file bytes per request (~149.7 MB on the real artifact);
  // switch to a stream if concurrent readers ever matter on this single-user box.
  const bytes = fixture
    ? new Uint8Array(fixture.payload)
    : new Uint8Array(readFileSync(activityUniversePaths().bin));
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      ETag: etag,
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
