import { encodeColumnarPayload, type ColumnArray } from "@/lib/acc/columnarPayload";
import type { ActivityUniverseMeta } from "@/lib/server/activityUniversePayload";

export const ACTIVITY_TEST_FIXTURE_COUNT = 180;
export const ACTIVITY_TEST_FIXTURE_MONTH_COUNT = 3;

export interface ActivityUniverseTestFixture {
  meta: ActivityUniverseMeta;
  payload: ArrayBuffer;
}

/** Deterministic, CI-sized activity universe. Never used without both route flags. */
export function buildActivityUniverseTestFixture(): ActivityUniverseTestFixture {
  const count = ACTIVITY_TEST_FIXTURE_COUNT;
  const positions = new Float32Array(count * 2);
  const verbId = new Uint16Array(count);
  const objectTypeId = new Uint16Array(count);
  const moduleId = new Uint16Array(count);
  const monthId = new Uint16Array(count);
  const roleId = new Uint16Array(count);
  const companyId = new Uint16Array(count);
  const projectId = new Uint32Array(count);
  const authorId = new Uint32Array(count);
  const folderId = new Uint32Array(count);

  for (let i = 0; i < count; i++) {
    const month = Math.floor(i / (count / ACTIVITY_TEST_FIXTURE_MONTH_COUNT));
    const local = i % (count / ACTIVITY_TEST_FIXTURE_MONTH_COUNT);
    const angle = (local / (count / ACTIVITY_TEST_FIXTURE_MONTH_COUNT)) * Math.PI * 2;
    const radius = 0.32 + (local % 7) * 0.035;
    positions[i * 2] = (month - 1) * 1.25 + Math.cos(angle) * radius;
    positions[i * 2 + 1] = Math.sin(angle) * radius + Math.sin(local * 0.73) * 0.08;
    verbId[i] = 1 + (i % 4);
    objectTypeId[i] = 1 + (i % 3);
    moduleId[i] = i % 3;
    monthId[i] = month;
    roleId[i] = i % 11 === 0 ? 0 : 1 + (i % 2);
    companyId[i] = i % 13 === 0 ? 0 : 1 + (i % 2);
    projectId[i] = 1 + (i % 2);
    authorId[i] = i % 17 === 0 ? 0 : 1 + (i % 3);
    folderId[i] = i % 5 === 0 ? 0 : 1 + (i % 12);
  }

  const columns: Record<string, ColumnArray> = {
    positions,
    verbId,
    objectTypeId,
    moduleId,
    monthId,
    roleId,
    companyId,
    projectId,
    authorId,
    folderId,
  };
  const meta: ActivityUniverseMeta = {
    version: 1,
    embeddingRunId: "activity-e2e-fixture-v1",
    generatedAt: "2026-07-21T00:00:00.000Z",
    count,
    dicts: {
      verb: ["Unknown", "View", "Edit", "Create", "Download"],
      objectType: ["Unknown", "File", "Issue", "Model"],
      module: ["Docs", "Build", "Model Coordination"],
      monthFloor: "2026-01",
      monthCount: ACTIVITY_TEST_FIXTURE_MONTH_COUNT,
      role: ["Unknown", "Project Admin", "Member"],
      company: ["Unknown", "Hermosillo", "Partner"],
      project: ["Unknown", "fixture-project-a", "fixture-project-b"],
      author: ["Unknown author", "Ada Lovelace", "Grace Hopper", "Alan Turing"],
      folder: ["None", ...Array.from({ length: 12 }, (_, i) => `Fixture folder ${i + 1}`)],
    },
    coverage: {
      measuredAt: "2026-07-21T00:00:00.000Z",
      total: count,
      nullEmail: 11,
      matchedPair: 159,
      matchedEmailOnly: 10,
      unmatchedEmail: 0,
      resolvedPairRate: 159 / count,
      resolvedEmailRate: 169 / count,
      unknownAuthorRate: 11 / count,
    },
    idAnchors: ["fixture-activity-000"],
  };
  return { meta, payload: encodeColumnarPayload(count, columns) };
}

let cachedFixture: ActivityUniverseTestFixture | undefined;

export function activityUniverseTestFixture(): ActivityUniverseTestFixture {
  cachedFixture ??= buildActivityUniverseTestFixture();
  return cachedFixture;
}
