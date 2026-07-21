# 38-01 SUMMARY — Activity-grain storage + author attributes + coverage (EMB-07 storage, ACT-02)

**Completed:** 2026-07-21 · commit `fa2502c2` (docs commits `16b4ae83` planning)

## What shipped

1. **`AccActivityEmbedding` Prisma model + raw-SQL migration** —
   `prisma/schema.prisma` (new model beside `AccInstanceEmbedding`) +
   `prisma/migrations/20260721000000_add_acc_activity_embedding/migration.sql`,
   applied via `scripts/create-activity-embedding-table.ts` (clone of the
   instance-embedding runner; comment-stripping added because the migration header
   would otherwise swallow the single CREATE statement) and registered with
   `npx prisma migrate resolve --applied`. `prisma migrate status`: **"Database
   schema is up to date!"** (21 migrations). Columns per plan: id TEXT PK
   (source-prefixed), x/y REAL, verbId/objectTypeId/moduleId/monthId/roleId/companyId
   SMALLINT, projectId/authorId/folderId INTEGER, embeddingRunId, updatedAt.
   Cardinality sizing verified live before creation: verbs 57 (+171 DC rawActions),
   objectTypes 13, roles 155, companies 414, months ~20 (Dec 2024 floor) — all
   smallint-safe; folders 132,163 and authors 2,313 → INTEGER.
2. **Pure attribute helper** — `lib/server/activityAuthorAttributes.ts`
   `buildAuthorAttributeMap(features)`: (emailLower, projectId) → {role, company,
   modules} from `buildGraphNodesFromUsers` snapshots (fields verified: `nodeId`
   "userId::projectId", `emailLower`, `role`, `firmName`, `moduleSignature`).
   Co-located vitest (dup collapse, empty-email/malformed-id drops): **2/2 green**.
3. **Sidecar + ACT-02 coverage script** — `scripts/build-activity-author-attributes.ts`
   (read-only DB; writes only gitignored `.embedding/`). Live run output:
   - sidecar: **22,279 (email, project) attribute rows** → `.embedding/activity-author-attributes.json`
   - coverage → `.embedding/activity-author-coverage.json`:

     | metric | value |
     |---|---|
     | total unified corpus | **4,904,886** |
     | nullEmail | 77 |
     | matchedPair (email+project membership) | 3,017,197 (61.52%) |
     | matchedEmailOnly (author known, no current membership on that project) | 1,613,279 (32.89%) |
     | unmatchedEmail | 274,333 (5.59%) |
     | **resolvedEmailRate** | **94.41%** |
     | **unknownAuthorRate** | **5.59%** |

   Reconciliation clean: withEmail + nullEmail == total (no drift warning).
   Corpus total confirms the CONTEXT ~4.905M unified estimate.

## Gates

- `npx vitest run lib/server/activityAuthorAttributes.test.ts` — 2/2 PASS
- `npx tsc --noEmit` — 0 errors
- `node scripts/repo-map/check.cjs` — PASS (3 dep-cruiser warnings + 248 ast-grep
  findings are the pre-existing baseline)
- `npx prisma migrate status` — up to date, migration registered

## Deviations

- Coverage measured at PAIR and EMAIL level (plan asked for null/unmatched only):
  role/company/modules are per-(email, project) membership, so events by authors on
  projects they've left match by email but not pair. Both rates recorded; Phase 39
  picks the label figure (recommend resolvedEmailRate for "author known" + explicit
  Unknown-author grouping for the 5.59%).
- DC-side per-email counts replicate the `mergeActivitySources` boundary in plain
  SQL (GROUP-BY astart, not the optimized LATERAL CTE — one-off script, ~seconds).

## Follow-ups / debt

- 38-02 must decide roleId/companyId dictionary handling for matchedEmailOnly events
  (email resolves, pair attributes absent → role/company Unknown codes but authorId
  real — keeps "Unknown author" honest while not discarding known identity).
