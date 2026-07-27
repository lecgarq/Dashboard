import "server-only";
import { db } from "@/server/db";

/**
 * PIPE-01 — latest Data Connector ingest run + live throughput for that run.
 *
 * `AccDcIngestRun.rowsByModule` is a confirmed always-zero field (standing
 * guardrail across v2.3) — NEVER selected or read here. Throughput instead
 * comes from a live `db.accActivity.count({ where: { ingestRunId } })`, which
 * is cheap because `AccActivity.ingestRunId` is indexed (schema.prisma:582).
 */
export interface IngestFreshness {
  id: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  projectsProcessed: number;
  activityRowCount: number;
}

export async function loadIngestFreshness(): Promise<IngestFreshness | null> {
  const run = await db.accDcIngestRun.findFirst({
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      startedAt: true,
      endedAt: true,
      status: true,
      projectsProcessed: true,
    },
  });
  if (!run) return null;

  const activityRowCount = await db.accActivity.count({ where: { ingestRunId: run.id } });

  return {
    id: run.id,
    startedAt: run.startedAt.toISOString(),
    endedAt: run.endedAt ? run.endedAt.toISOString() : null,
    status: run.status,
    projectsProcessed: run.projectsProcessed,
    activityRowCount,
  };
}
