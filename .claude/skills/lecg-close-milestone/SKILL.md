---
name: lecg-close-milestone
description: Audit a finished LECG Dashboard milestone against its requirements, write the retrospective, archive its planning artifacts, and prune completed phase directories. Use when Luis says "close the milestone", "milestone done", "audit v2.4", "wrap up this milestone", or every phase of the active milestone is summarized and verified.
argument-hint: "[vN.N]"
---

# lecg-close-milestone

Close the active milestone on evidence, not declarations. Nothing here
re-executes work; a failed audit routes back to the phase that owes evidence.

Read `../lecg-dashboard/references/lecg-workflow-conventions.md` first.

## 1. Audit requirements against shipped evidence

For every requirement ID in `.planning/REQUIREMENTS.md`:

- Find its shipping evidence: the owning phase's `NN-VERIFICATION.md`, plan
  SUMMARYs, commits, and — when a claim is user-visible — the actual route.
- Verdict per ID: **shipped** (evidence named), **partial** (what's missing),
  or **dropped** (why). Never mark shipped without concrete evidence; a
  requirement no VERIFICATION covers is a gap, even if memory says it landed.
- Gaps: ask Luis — accept as deferred (record in STATE Deferred Items) or
  reopen the owning phase (`/lecg-phase <N>`) before closing. Do not close a
  milestone with unacknowledged gaps.

## 2. Write the retrospective into MILESTONES.md

**Append** a section for this milestone — never rewrite or truncate existing
history (a past tool did exactly that; treat MILESTONES.md as append-only).
Include: goal vs outcome, the per-ID audit table, phases shipped with dates,
durable traps/decisions worth carrying forward, and deferred items with
destinations.

## 3. Archive and prune

1. Copy the milestone's `REQUIREMENTS.md` and its ROADMAP section to
   `.planning/milestones/<vN.N>-REQUIREMENTS.md` / `<vN.N>-ROADMAP.md`
   (matching the existing v2.3 archives).
2. Delete this milestone's completed `.planning/phases/<NN>-*/` directories.
   Keep the ROADMAP's `## Phase Details` history intact — the archive plus git
   history preserve the full record.
3. Roll still-live debt from the phase VERIFICATIONs into
   `.planning/codebase/CONCERNS.md` if phase completion missed any.

## 4. Reconcile and commit

- ROADMAP: check the milestone off in `## Milestones`; mark its section ✅.
- STATE: keep schema-v2 frontmatter valid; set `stopped_at` to
  "milestone <vN.N> closed — next: /lecg-new-milestone", carry surviving
  Deferred Items forward. Re-read frontmatter after writing.
- Commit everything **by explicit path** (archives, MILESTONES.md, ROADMAP,
  STATE, CONCERNS, and the phase-directory deletions — stage deletions with
  `git add .planning/phases/<NN>-<slug>` per directory):
  `docs(planning): close <vN.N> milestone`. Inspect
  `git diff --cached --name-only`; an uncommitted prune leaves the tree and
  index disagreeing for every future session.

## 5. Route

`/lecg-new-milestone` — seed it with the deferred items and CONCERNS debt this
audit surfaced. Suggest `/lecg-map-codebase` first when the codebase docs
predate this milestone's work.
