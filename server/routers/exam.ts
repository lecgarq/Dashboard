import { z } from "zod";
import { router, protectedProcedure, adminProcedure, editorProcedure } from "../trpc";

const TaskStatusEnum = z.enum(["PLANNING", "IN_PROGRESS", "REVIEW", "DONE"]);

const QuestionSchema = z.object({
  text: z.string().min(1),
  type: z.enum(["MULTIPLE_CHOICE", "SHORT_ANSWER", "PARAGRAPH"]),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
});

export const examRouter = router({
  getExams: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.revitExam.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { tasks: true, results: true } } },
    });
  }),

  getExam: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.revitExam.findUnique({
        where: { id: input.id },
        include: { tasks: { orderBy: { order: "asc" } }, results: { orderBy: { completedAt: "desc" } } },
      });
    }),

  createExam: editorProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        dueDate: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.revitExam.create({ data: input });
    }),

  updateExam: editorProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        status: TaskStatusEnum.optional(),
        dueDate: z.date().nullable().optional(),
        formUrl: z.string().nullable().optional(),
        formId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.revitExam.update({ where: { id }, data });
    }),

  // Generate Google Form from questions
  generateForm: editorProcedure
    .input(
      z.object({
        examId: z.string(),
        questions: z.array(QuestionSchema).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const exam = await ctx.db.revitExam.findUnique({
        where: { id: input.examId },
      });
      if (!exam) throw new Error("Exam not found");

      // Dynamic import to avoid loading googleapis in client bundles
      const { createGoogleForm } = await import("@/lib/google/forms");

      const { formId, formUrl } = await createGoogleForm(
        exam.title,
        exam.description ?? undefined,
        input.questions
      );

      // Save form URL and ID to exam
      const updated = await ctx.db.revitExam.update({
        where: { id: input.examId },
        data: { formUrl, formId },
      });

      return { formUrl, formId, exam: updated };
    }),

  // Fetch Google Form responses
  getFormResponses: protectedProcedure
    .input(z.object({ examId: z.string() }))
    .query(async ({ ctx, input }) => {
      const exam = await ctx.db.revitExam.findUnique({
        where: { id: input.examId },
      });
      if (!exam?.formId) return [];

      try {
        const { getFormResponses } = await import("@/lib/google/forms");
        return await getFormResponses(exam.formId);
      } catch {
        return [];
      }
    }),

  createTask: editorProcedure
    .input(
      z.object({
        examId: z.string(),
        title: z.string().min(1),
        status: TaskStatusEnum.optional(),
        dueDate: z.date().optional(),
        order: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const count = await ctx.db.examBuildTask.count({ where: { examId: input.examId } });
      return ctx.db.examBuildTask.create({
        data: { ...input, status: input.status ?? "PLANNING", order: input.order ?? count },
      });
    }),

  updateTask: editorProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        status: TaskStatusEnum.optional(),
        dueDate: z.date().nullable().optional(),
        order: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.examBuildTask.update({ where: { id }, data });
    }),

  deleteTask: editorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.examBuildTask.delete({ where: { id: input.id } });
    }),

  addResult: editorProcedure
    .input(
      z.object({
        examId: z.string(),
        candidateName: z.string().min(1),
        candidateEmail: z.string().optional(),
        score: z.number(),
        maxScore: z.number(),
        attempts: z.number().optional(),
        notes: z.string().optional(),
        failureTopics: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.examResult.create({ data: input });
    }),

  getResults: protectedProcedure
    .input(z.object({ examId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.examResult.findMany({
        where: input.examId ? { examId: input.examId } : undefined,
        orderBy: { completedAt: "desc" },
        include: { exam: { select: { title: true } } },
      });
    }),

  getKPIs: protectedProcedure.query(async ({ ctx }) => {
    const results = await ctx.db.examResult.findMany({
      select: { score: true, maxScore: true, failureTopics: true },
    });

    if (results.length === 0) {
      return { passRate: 0, avgScore: 0, totalCandidates: 0, commonFailures: [] };
    }

    const passingThreshold = 0.7;
    const passed = results.filter((r) => r.score / r.maxScore >= passingThreshold).length;
    const avgScore = results.reduce((acc, r) => acc + (r.score / r.maxScore) * 100, 0) / results.length;

    const failureCounts: Record<string, number> = {};
    for (const r of results) {
      if (r.failureTopics) {
        try {
          const topics = JSON.parse(r.failureTopics) as string[];
          for (const t of topics) {
            failureCounts[t] = (failureCounts[t] ?? 0) + 1;
          }
        } catch {}
      }
    }

    const commonFailures = Object.entries(failureCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic, count]) => ({ topic, count }));

    return {
      passRate: Math.round((passed / results.length) * 100),
      avgScore: Math.round(avgScore),
      totalCandidates: results.length,
      commonFailures,
    };
  }),
});
