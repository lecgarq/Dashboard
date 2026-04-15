---
phase: 4
plan: 3
wave: 3
---

# Plan 4.3: Deprecated Google Sheets Dead Code Block Removal

## Objective
Natively eradicate the completely orphaned 12 dead async validation wrappers mapped inside our `lib/sheets.ts` document without disturbing actively used modules logic.

## Context
- .gsd/SPEC.md
- lib/sheets.ts

## Tasks

<task type="auto">
  <name>Wipe Unused Google Sheet Resolvers</name>
  <files>lib/sheets.ts</files>
  <action>
    - Open `lib/sheets.ts` and surgically extract the exact 12 dead named exports native to it.
    - Dead list: `getApprovedEmails`, `getBlacklistedEmails`, `getBlacklistedRequestsFromSheets`, `getPendingRequestsFromSheets`, `getPendingEmails`, `blacklistUserInSheets`, `unblacklistUserInSheets`, `removeUserFromApprovedInSheets`, `syncWhitelist`, `approveUserInSheets`, `declineUserInSheets`, `MODULES_LIST`.
    - Only purge the chunks related to these, retaining connection logic that is valid.
  </action>
  <verify>grep -q "blacklistUserInSheets" lib/sheets.ts || echo "Safe"</verify>
  <done>Dead Sheets logic systematically deleted directly from disk.</done>
</task>

<task type="auto">
  <name>Final Metric Verification Across Entire Project</name>
  <files>package.json</files>
  <action>
    - Ensure zero unused items currently exist.
    - Execute `npx knip --no-exit-code`. The target is zero exports natively found.
  </action>
  <verify>npx knip --no-exit-code</verify>
  <done>Knip returns flawless, natively verifying exactly zero orphaned bits of code in Phase 4!</done>
</task>

## Success Criteria
- [ ] Orphaned sheets logic removed organically.
- [ ] Knip completely green.
