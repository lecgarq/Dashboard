import { gzipSync } from "node:zlib";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import {
  buildCompactGraphPayload,
  type CompressedGraphSnapshot,
} from "@/lib/acc/graphSnapshotPayload";

const snapshotCache = new WeakMap<readonly BulkAccUser[], CompressedGraphSnapshot>();

/** Cache the packed payload against the hot-cache array identity. */
export function getCompressedGraphSnapshot(
  users: readonly BulkAccUser[],
): CompressedGraphSnapshot {
  const cached = snapshotCache.get(users);
  if (cached) return cached;

  const payload = buildCompactGraphPayload(users);
  const snapshot = {
    gzipBase64: gzipSync(JSON.stringify(payload)).toString("base64"),
  };
  snapshotCache.set(users, snapshot);
  return snapshot;
}
