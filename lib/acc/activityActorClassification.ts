export type ActivityActorClassification =
  | "resolved_user"
  | "automation/system"
  | "unmapped_external_user"
  | "invalid_actor_id";

export type ActivityActorCandidate = {
  autodeskId: string | null | undefined;
  userEmail?: string | null | undefined;
  rawActions?: readonly string[];
};

export type ActorClassificationInput = {
  classification: ActivityActorClassification;
  rows: number;
  actorKey: string;
};

export type ActorClassificationSummary = {
  classification: ActivityActorClassification;
  rows: number;
  actors: number;
};

const ACTOR_CLASSIFICATION_ORDER: readonly ActivityActorClassification[] = [
  "resolved_user",
  "automation/system",
  "unmapped_external_user",
  "invalid_actor_id",
];

const SYSTEM_ACTOR_IDS = new Set(["n/a", "na", "system", "automation", "autodesk-system"]);
const INVALID_ACTOR_IDS = new Set(["", "null", "undefined", "unknown"]);

function normalize(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function classifyActivityActor(candidate: ActivityActorCandidate): ActivityActorClassification {
  if (normalize(candidate.userEmail)) return "resolved_user";

  const id = normalize(candidate.autodeskId);
  const lowerId = id.toLowerCase();
  const actions = candidate.rawActions ?? [];

  if (SYSTEM_ACTOR_IDS.has(lowerId)) return "automation/system";
  if (actions.some((action) => action.toLowerCase().includes("automation"))) {
    return "automation/system";
  }
  if (INVALID_ACTOR_IDS.has(lowerId)) return "invalid_actor_id";

  return "unmapped_external_user";
}

export function summarizeActorClassifications(
  rows: readonly ActorClassificationInput[],
): ActorClassificationSummary[] {
  const rowCounts = new Map<ActivityActorClassification, number>();
  const actorKeys = new Map<ActivityActorClassification, Set<string>>();

  for (const row of rows) {
    rowCounts.set(row.classification, (rowCounts.get(row.classification) ?? 0) + row.rows);
    const keys = actorKeys.get(row.classification) ?? new Set<string>();
    keys.add(row.actorKey);
    actorKeys.set(row.classification, keys);
  }

  return ACTOR_CLASSIFICATION_ORDER.map((classification) => ({
    classification,
    rows: rowCounts.get(classification) ?? 0,
    actors: actorKeys.get(classification)?.size ?? 0,
  }));
}
