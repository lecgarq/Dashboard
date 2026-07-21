import {
  encodeColumnarPayload,
  type ColumnArray,
} from "@/app/(dashboard)/users/scale-spike/columnar";
import {
  SPIKE_DEFAULT_COUNT,
  SPIKE_DEFAULT_SEED,
  generateSpikeAttributes,
  generateSpikePositions,
} from "@/app/(dashboard)/users/scale-spike/spikeSynthetic";

// Phase-37 SCALE-01 track (b): binary columnar payload prototype. Content is
// SYNTHETIC (deterministic, same generator as the render harness) — Phase 38
// replaces the generator with the real activity-table read; the FORMAT and its
// measured wire/decode/upload numbers are the deliverable here. Flag-gated:
// 404 without NEXT_PUBLIC_ACC_SCALE_SPIKE=1, zero production impact.
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (process.env.NEXT_PUBLIC_ACC_SCALE_SPIKE !== "1") {
    return new Response(null, { status: 404 });
  }
  const url = new URL(request.url);
  const n = Math.max(1, Number(url.searchParams.get("n")) || SPIKE_DEFAULT_COUNT);
  const seed = Number(url.searchParams.get("seed")) || SPIKE_DEFAULT_SEED;

  // Downproject stride-3 → stride-2 server-side: the wire format carries what
  // the renderer actually uploads (cosmos.gl is 2D).
  const xyz = generateSpikePositions(n, seed);
  const positions = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    positions[i * 2] = xyz[i * 3];
    positions[i * 2 + 1] = xyz[i * 3 + 1];
  }
  const attrs = generateSpikeAttributes(n, seed);
  const columns: Record<string, ColumnArray> = {
    positions,
    verbId: attrs.verbId,
    objectTypeId: attrs.objectTypeId,
    projectId: attrs.projectId,
    authorId: attrs.authorId,
    month: attrs.month,
  };
  const buf = encodeColumnarPayload(n, columns);
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(buf.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
