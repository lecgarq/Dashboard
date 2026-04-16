import { router, protectedProcedure } from "../trpc";
import { Prisma } from "@prisma/client";

type CountRow = {
  family_total: bigint;
  family_done: bigint;
  family_review: bigint;
  clash_total: bigint;
  clash_done: bigint;
  clash_review: bigint;
  exam_task_total: bigint;
  user_count: bigint;
  deliverables_total: bigint;
  deliverables_done: bigint;
};

export const kpiRouter = router({
  getHomeDashboard: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();

    // Single CTE replaces 10 separate count queries → 8 total connections instead of 17
    const [countsResult, examResults, familyDeadlines, clashDeadlines, recentFamilies, recentChangelogs, recentClashTasks, recentExamResults] =
      await Promise.all([
        ctx.db.$queryRaw<CountRow[]>(Prisma.sql`
          SELECT
            (SELECT COUNT(*) FROM "Family")::bigint                                            AS family_total,
            (SELECT COUNT(*) FROM "Family" WHERE phase = 'DONE')::bigint                      AS family_done,
            (SELECT COUNT(*) FROM "Family" WHERE phase IN ('REVIEW','DONE'))::bigint          AS family_review,
            (SELECT COUNT(*) FROM "ClashTask")::bigint                                         AS clash_total,
            (SELECT COUNT(*) FROM "ClashTask" WHERE status = 'DONE')::bigint                  AS clash_done,
            (SELECT COUNT(*) FROM "ClashTask" WHERE status IN ('REVIEW','DONE'))::bigint      AS clash_review,
            (SELECT COUNT(*) FROM "ExamBuildTask")::bigint                                     AS exam_task_total,
            (SELECT COUNT(*) FROM "User")::bigint                                              AS user_count,
            (SELECT COUNT(*) FROM "FamilyDeliverable")::bigint                                AS deliverables_total,
            (SELECT COUNT(*) FROM "FamilyDeliverable" WHERE done = true)::bigint              AS deliverables_done
        `),
        ctx.db.examResult.findMany({ select: { score: true, maxScore: true }, take: 500 }),
        ctx.db.family.findMany({ where: { dueDate: { gt: now } }, select: { dueDate: true, name: true }, orderBy: { dueDate: "asc" }, take: 5 }),
        ctx.db.clashTask.findMany({ where: { dueDate: { gt: now } }, select: { dueDate: true, title: true }, orderBy: { dueDate: "asc" }, take: 5 }),
        ctx.db.family.findMany({ orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, name: true, phase: true, updatedAt: true, owner: true } }),
        ctx.db.familyChangelog.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { family: { select: { name: true } } } }),
        ctx.db.clashTask.findMany({ orderBy: { updatedAt: "desc" }, take: 3, select: { id: true, title: true, status: true, updatedAt: true, owner: true } }),
        ctx.db.examResult.findMany({ orderBy: { completedAt: "desc" }, take: 3, select: { id: true, candidateName: true, score: true, maxScore: true, completedAt: true } }),
      ]);

    const counts = countsResult[0];
    const familyTotal   = Number(counts.family_total);
    const familyDone    = Number(counts.family_done);
    const familyReview  = Number(counts.family_review);
    const clashTotal    = Number(counts.clash_total);
    const clashDone     = Number(counts.clash_done);
    const clashReview   = Number(counts.clash_review);
    const examTaskTotal = Number(counts.exam_task_total);
    const userCount     = Number(counts.user_count);
    const deliverablesTotal = Number(counts.deliverables_total);
    const deliverablesDone  = Number(counts.deliverables_done);

    const activeTasks = (familyTotal - familyDone) + (clashTotal - clashDone) + examTaskTotal;
    const capacity = userCount > 0 ? Math.min(100, Math.round((activeTasks / (userCount * 8)) * 100)) : 0;

    const allMilestones = [
      ...familyDeadlines.map((f) => ({ date: f.dueDate!, label: f.name })),
      ...clashDeadlines.map((c) => ({ date: c.dueDate!, label: c.title })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    const avgPassRate =
      examResults.length > 0
        ? Math.round((examResults.filter((r) => r.score / r.maxScore >= 0.7).length / examResults.length) * 100)
        : 0;

    const activities = [
      ...recentFamilies.map((f) => ({ id: `family-${f.id}`, label: `Update: Family "${f.name}" → ${f.phase.replace("_", " ")}`, module: "Familias", time: f.updatedAt, user: { name: f.owner || "System" } })),
      ...recentChangelogs.map((c) => ({ id: `cl-${c.id}`, label: `V${c.version} Release: ${c.family.name}`, module: "Familias", time: c.createdAt, user: { name: c.author || "System" } })),
      ...recentClashTasks.map((t) => ({ id: `ct-${t.id}`, label: `Task "${t.title}" → ${t.status.replace("_", " ")}`, module: "Clash", time: t.updatedAt, user: { name: t.owner || "Admin" } })),
      ...recentExamResults.map((r) => ({ id: `er-${r.id}`, label: `Submission: ${r.candidateName} (${r.score}/${r.maxScore})`, module: "Examen", time: r.completedAt, user: { name: r.candidateName } })),
    ].sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 10);

    return {
      families: { total: familyTotal, done: familyDone, rate: familyTotal > 0 ? Math.round((familyDone / familyTotal) * 100) : 0 },
      clash: { total: clashTotal, done: clashDone, rate: clashTotal > 0 ? Math.round((clashDone / clashTotal) * 100) : 0 },
      exam: { total: examTaskTotal, passRate: avgPassRate, totalCandidates: examResults.length },
      userCount,
      capacity,
      nearestMilestone: allMilestones[0] ?? null,
      velocity: {
        modeling: familyTotal > 0 ? Math.round((familyReview / familyTotal) * 100) : 0,
        documentation: deliverablesTotal > 0 ? Math.round((deliverablesDone / deliverablesTotal) * 100) : 0,
        qa: clashTotal > 0 ? Math.round((clashReview / clashTotal) * 100) : 0,
      },
      activities,
    };
  }),


  getDashboardKPIs: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      familyTotal,
      familyDone,
      examResults,
      clashTotal,
      clashDone,
      examTotal,
    ] = await Promise.all([
      ctx.db.family.count(),
      ctx.db.family.count({ where: { phase: "DONE" } }),
      ctx.db.examResult.findMany({ select: { score: true, maxScore: true }, take: 500 }),
      ctx.db.clashTask.count(),
      ctx.db.clashTask.count({ where: { status: "DONE" } }),
      ctx.db.examBuildTask.count(),
    ]);

    // Nearest deadline across all modules
    const [familyDeadlines, clashDeadlines, examDeadlines] = await Promise.all([
      ctx.db.family.findMany({
        where: { dueDate: { gt: now } },
        select: { dueDate: true },
        orderBy: { dueDate: "asc" },
        take: 1,
      }),
      ctx.db.clashTask.findMany({
        where: { dueDate: { gt: now } },
        select: { dueDate: true },
        orderBy: { dueDate: "asc" },
        take: 1,
      }),
      ctx.db.revitExam.findMany({
        where: { dueDate: { gt: now } },
        select: { dueDate: true },
        orderBy: { dueDate: "asc" },
        take: 1,
      }),
    ]);

    const allDeadlines = [
      ...familyDeadlines.map((f) => f.dueDate!),
      ...clashDeadlines.map((c) => c.dueDate!),
      ...examDeadlines.map((e) => e.dueDate!),
    ].sort((a, b) => a.getTime() - b.getTime());

    const nearestDeadline = allDeadlines[0] ?? null;

    const avgPassRate =
      examResults.length > 0
        ? Math.round(
            (examResults.filter((r) => r.score / r.maxScore >= 0.7).length / examResults.length) * 100
          )
        : 0;

    return {
      families: {
        total: familyTotal,
        done: familyDone,
        completionRate: familyTotal > 0 ? Math.round((familyDone / familyTotal) * 100) : 0,
      },
      clash: {
        total: clashTotal,
        done: clashDone,
        completionRate: clashTotal > 0 ? Math.round((clashDone / clashTotal) * 100) : 0,
      },
      exam: {
        total: examTotal,
        passRate: avgPassRate,
        totalCandidates: examResults.length,
      },
      nearestDeadline,
    };
  }),

  getRecentActivity: protectedProcedure.query(async ({ ctx }) => {
    const [recentFamilies, recentChangelogs, recentClashTasks, recentExamResults] = await Promise.all([
      ctx.db.family.findMany({
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, name: true, phase: true, updatedAt: true },
      }),
      ctx.db.familyChangelog.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { family: { select: { name: true } } },
      }),
      ctx.db.clashTask.findMany({
        orderBy: { updatedAt: "desc" },
        take: 3,
        select: { id: true, title: true, status: true, updatedAt: true },
      }),
      ctx.db.examResult.findMany({
        orderBy: { completedAt: "desc" },
        take: 3,
        select: { id: true, candidateName: true, score: true, maxScore: true, completedAt: true },
      }),
    ]);

    const activities: Array<{
      id: string;
      type: string;
      label: string;
      module: string;
      time: Date;
    }> = [
      ...recentFamilies.map((f) => ({
        id: `family-${f.id}`,
        type: "family_update",
        label: `Family "${f.name}" updated → ${f.phase}`,
        module: "Familias",
        time: f.updatedAt,
      })),
      ...recentChangelogs.map((c) => ({
        id: `changelog-${c.id}`,
        type: "changelog",
        label: `Changelog v${c.version} added to "${c.family.name}"`,
        module: "Familias",
        time: c.createdAt,
      })),
      ...recentClashTasks.map((t) => ({
        id: `clash-${t.id}`,
        type: "clash_task",
        label: `Task "${t.title}" → ${t.status}`,
        module: "Clash",
        time: t.updatedAt,
      })),
      ...recentExamResults.map((r) => ({
        id: `result-${r.id}`,
        type: "exam_result",
        label: `${r.candidateName} scored ${r.score}/${r.maxScore}`,
        module: "Examen",
        time: r.completedAt,
      })),
    ]
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, 15);

    return activities;
  }),
});
