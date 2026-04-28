import { z } from "zod";

export const FAMILY_PHASE_METADATA = {
  TODO: { 
    label: "To Do", 
    color: "text-gray-600", 
    badgeBg: "bg-gray-100",
    cardBg: "bg-muted/50",
    cardText: "text-muted-foreground"
  },
  IN_PROGRESS: { 
    label: "In Progress", 
    color: "text-blue-700", 
    badgeBg: "bg-blue-100",
    cardBg: "bg-chart-1/10",
    cardText: "text-chart-1"
  },
  REVIEW: { 
    label: "Review", 
    color: "text-amber-700", 
    badgeBg: "bg-amber-100",
    cardBg: "bg-chart-5/10",
    cardText: "text-chart-5"
  },
  DONE: { 
    label: "Done", 
    color: "text-green-700", 
    badgeBg: "bg-green-100",
    cardBg: "bg-chart-2/10",
    cardText: "text-chart-2"
  },
} as const;

export type FamilyPhase = keyof typeof FAMILY_PHASE_METADATA;

export const FAMILY_PHASES = Object.keys(FAMILY_PHASE_METADATA) as FamilyPhase[];

export const getPhaseMetadata = (phase: string) => {
  return FAMILY_PHASE_METADATA[phase as FamilyPhase] ?? FAMILY_PHASE_METADATA.TODO;
};

export const familyPhaseSchema = z.enum(FAMILY_PHASES as [string, ...string[]]);

