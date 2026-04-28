export const FAMILY_PHASE_METADATA = {
  TODO: { label: "To Do", color: "bg-gray-100 text-gray-600" },
  IN_PROGRESS: { label: "In Progress", color: "bg-blue-100 text-blue-700" },
  REVIEW: { label: "Review", color: "bg-amber-100 text-amber-700" },
  DONE: { label: "Done", color: "bg-green-100 text-green-700" },
} as const;

export type FamilyPhase = keyof typeof FAMILY_PHASE_METADATA;

export const FAMILY_PHASES = Object.keys(FAMILY_PHASE_METADATA) as FamilyPhase[];
