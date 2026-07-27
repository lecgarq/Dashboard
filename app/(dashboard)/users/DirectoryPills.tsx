import type { AggregatedStatus } from "@/lib/acc/accStatusReduction";

export const STATUS_PILL_LABEL: Record<AggregatedStatus, string> = {
  active: "Active",
  pending: "Pending",
  deleted: "Deleted",
};
