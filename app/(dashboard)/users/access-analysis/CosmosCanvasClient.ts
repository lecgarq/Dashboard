import { MosaicClient, type Selection } from "@uwdata/mosaic-core";
import { Query, sql } from "@uwdata/mosaic-sql";
import type { FilterExpr } from "@uwdata/mosaic-sql";

export interface CosmosCanvasHandle {
  /** Ordered array of node ids matching cosmos's point index space. */
  readonly nodeIds: readonly string[];
  /** Applies an alpha mask aligned with nodeIds (one float per node). */
  setAlphaMask(mask: Float32Array): void;
}

export interface CosmosCanvasClientOptions {
  handle: CosmosCanvasHandle;
  selection: Selection;
  /**
   * DuckDB view/table to query.
   * Expected schema: `user_id` + `project_id` columns.
   * Node IDs are derived as `concat(user_id, '::', project_id)`.
   *
   * Note: the plan specified a `node_id` column but the actual
   * `user_projects` view has no such column. We compute it inline
   * using a SQL expression. Tests pass pre-joined rows with a
   * `node_id` field so no schema change is needed there.
   */
  sourceTable: string;
}

const DIM_ALPHA = 0.15;
const LIT_ALPHA = 1.0;

export class CosmosCanvasClient extends MosaicClient {
  private readonly handle: CosmosCanvasHandle;
  private readonly source: string;

  constructor(options: CosmosCanvasClientOptions) {
    super(options.selection);
    this.handle = options.handle;
    this.source = options.sourceTable;
  }

  /**
   * Build a SELECT DISTINCT node_id query.
   * The `user_projects` view derives node_id as concat(user_id, '::', project_id).
   * Any WHERE filter clause from the active Selection is appended by the coordinator.
   */
  query(filter?: FilterExpr | null): Query {
    const q = Query.from(this.source)
      .select({ node_id: sql`concat(user_id, '::', project_id)` })
      .distinct();
    if (filter) q.where(filter);
    return q;
  }

  queryResult(data: unknown): this {
    const rows = (
      (data as { toArray?: () => Array<{ node_id: string }> })?.toArray?.() ?? []
    ) as Array<{ node_id: string }>;

    const lit = new Set<string>();
    for (const row of rows) lit.add(row.node_id);

    const mask = new Float32Array(this.handle.nodeIds.length);
    for (let i = 0; i < this.handle.nodeIds.length; i++) {
      mask[i] = lit.has(this.handle.nodeIds[i]) ? LIT_ALPHA : DIM_ALPHA;
    }
    this.handle.setAlphaMask(mask);
    return this;
  }
}
