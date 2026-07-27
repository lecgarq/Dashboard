# Deferred Items — Phase 22 (Issue Type Resolution)

## 22-02: pre-existing test-isolation flake in an unrelated file

- **File:** `app/(dashboard)/users/access-analysis/physicsLayer.test.ts`
- **Test:** "normalizes the settled spread to LAYOUT_HALF_EXTENT (≈350) before caching"
- **Observed:** `npm test` full-suite run showed 1 failed / 2507 passed / 1 skipped. Re-running
  the same test in isolation (`npx vitest run ... -t "normalizes the settled spread"`) passed
  cleanly.
- **Scope:** `/users/spatial-graph`-adjacent physics module, entirely outside this plan's
  `files_modified` (`lib/server/issueFunnelView.ts`, `issueFunnelView.test.ts`,
  `app/(dashboard)/access-analysis/issueTypeCounts.ts`,
  `app/(dashboard)/access-analysis/__tests__/issueTypeCounts.test.ts`). Not caused by, or
  fixable within, 22-02's diff.
- **Pattern match:** same shape as the previously-recorded `UsersDirectoryClient.integration.test.tsx`
  test-isolation flake (STATE.md, Phase 20 P05) — passes in isolation, fails only under full-suite
  run ordering/shared-state pressure.
- **Action:** not fixed (out of scope, Rule boundary). Recommend a future infra-focused
  plan/phase investigate cross-file test-isolation leakage in the `/users` physics/spatial-graph
  test suite.
