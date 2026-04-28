import { z } from "zod";

export const moduleKeySchema = z.enum(["clash", "sim"]);
export type ModuleKey = z.infer<typeof moduleKeySchema>;

export const wikiStatusSchema = z.enum(["DRAFT", "REVIEW", "APPROVED"]);
export type WikiStatus = z.infer<typeof wikiStatusSchema>;

export const moduleTaskStatusSchema = z.enum([
  "PLANNING",
  "IN_PROGRESS",
  "REVIEW",
  "DONE",
]);
export type ModuleTaskStatus = z.infer<typeof moduleTaskStatusSchema>;

import { FAMILY_PHASES } from "./family-config";
export const familyPhaseSchema = z.enum(FAMILY_PHASES as [string, ...string[]]);


export type { FamilyPhase } from './family-config';

