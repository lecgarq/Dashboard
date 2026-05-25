/**
 * Pure bisection helper for APS POST /requests 403 recovery.
 *
 * When APS returns HTTP 403 for an entire batch, this module recursively
 * splits the batch (binary search / DFS) to isolate the inaccessible
 * project(s) and salvage the good ones.
 *
 * Pure module — no Prisma, no fetch. Mirrors the dcBackfillPriority.ts
 * pattern: fully unit-tested, injectable submit function.
 */

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/** Thrown by dcSubmit (in a later task) when APS returns HTTP 403 for a batch. */
export class DcSubmitForbiddenError extends Error {
  readonly status = 403 as const;
  readonly projectIds: string[];

  constructor(projectIds: string[], detail?: string) {
    super(
      `POST /requests 403 (forbidden) for ${projectIds.length} project(s)${detail ? `: ${detail}` : ''}`,
    );
    this.name = 'DcSubmitForbiddenError';
    this.projectIds = projectIds;
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Processes one sub-batch. Resolves on success; throws DcSubmitForbiddenError
 * on 403; throws ANYTHING ELSE (e.g. QuotaExceededError, 5xx, generic) to
 * signal "do not bisect".
 */
export type BisectSubmitFn = (projectIds: string[]) => Promise<void>;

export interface BisectOptions {
  /** Hard cap on total submitFn invocations during this bisection (time/quota bound). */
  maxRequests: number;
  /** Quota guard checked BEFORE each submit; false => stop, leave residual unprobed. Default () => true. */
  hasBudget?: () => boolean;
  /** Floor batch size; at or below this a forbidden batch is not split further. Default 1. */
  minBatchSize?: number;
  /** Called once per isolated single-project culprit (for logging). */
  onInaccessible?: (projectId: string) => void;
}

export interface BisectSummary {
  requestsUsed: number;             // total submitFn invocations actually made
  successfulProjectIds: string[];   // projects in sub-batches that ingested OK
  inaccessibleProjectIds: string[]; // single-project culprits isolated via 403
  unprobedProjectIds: string[];     // left unprobed due to budget/cap, or residual below floor
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export async function bisectOnForbidden(
  projectIds: string[],
  submitFn: BisectSubmitFn,
  opts: BisectOptions,
): Promise<BisectSummary> {
  const minBatchSize = Math.max(1, opts.minBatchSize ?? 1);
  const hasBudget = opts.hasBudget ?? (() => true);

  const summary: BisectSummary = {
    requestsUsed: 0,
    successfulProjectIds: [],
    inaccessibleProjectIds: [],
    unprobedProjectIds: [],
  };

  async function attempt(batch: string[]): Promise<void> {
    // 1. Empty batch — nothing to do.
    if (batch.length === 0) {
      return;
    }

    // 2. GUARD: check cap and budget BEFORE submitting.
    if (summary.requestsUsed >= opts.maxRequests || !hasBudget()) {
      summary.unprobedProjectIds.push(...batch);
      return;
    }

    // 3. Submit the batch.
    summary.requestsUsed += 1;
    try {
      await submitFn(batch);
      // Success: all projects in this batch are good.
      summary.successfulProjectIds.push(...batch);
    } catch (err) {
      // Non-403 errors propagate immediately — never bisect.
      if (!(err instanceof DcSubmitForbiddenError)) {
        throw err;
      }

      // 403 — decide whether to split or mark as floor.
      if (batch.length <= minBatchSize) {
        if (batch.length === 1) {
          // Isolated single culprit.
          summary.inaccessibleProjectIds.push(batch[0]);
          opts.onInaccessible?.(batch[0]);
        } else {
          // At or below floor but more than 1 — cannot isolate further.
          summary.unprobedProjectIds.push(...batch);
        }
        return;
      }

      // Split deterministically: ceil(len/2) goes left, remainder goes right.
      const mid = Math.ceil(batch.length / 2);
      await attempt(batch.slice(0, mid));
      await attempt(batch.slice(mid));
    }
  }

  await attempt(projectIds);
  return summary;
}
