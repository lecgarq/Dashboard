import { z } from "zod";

export const moduleKeySchema = z.enum(["clash", "sim"]);
export type ModuleKey = z.infer<typeof moduleKeySchema>;

export const wikiStatusSchema = z.enum(["DRAFT", "REVIEW", "APPROVED"]);

export const moduleTaskStatusSchema = z.enum([
  "PLANNING",
  "IN_PROGRESS",
  "REVIEW",
  "DONE",
]);
