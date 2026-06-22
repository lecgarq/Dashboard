---
phase: 08-activity-re-extraction
plan: 01
status: complete
completed: 2026-06-22
requirements: [DATA-03, DATA-01]
---

# 08-01 Summary — Pre-flight + membership spike

## Outcome

**Spike PASSED.** The free `accds/v0` web-session endpoint returns activity for projects where Luis is a **member but not admin**. The crawl source for Plan 08-02 is therefore the **full membership (`AccProject` active = 1,153)**, a ~5× expansion over the inherited 234-project DC admin set — with **no permission change and no DC quota**.

## What was done

1. **Task 1 (session bootstrap, owner):** Luis ran `node scripts/accds-login.cjs` → `scratch/acc-session.json` (65 cookies, gitignored). Liveness proven by a smoke crawl on admin project `2752ab7b…` (MXL PSF Planta Conversión QRO): `fetched=107934 inserted=7353` (3-mo), no `SessionExpiredError`.
2. **Task 2 (enumeration, auto):** APS 3-leg token was **expired (401)** → fell back to `AccProject` active (1,153) as the membership source (also the exact list 08-02 will crawl). Member-only candidate set = 1,153 active − 234 activity-admin = **920** projects.
3. **Task 3 (spike, auto — session was warm):** Crawled member-only `28e65bf1…` (ACC MTY WORKSHOP): `fetched=97 inserted=97`, no 403. → **PASS**.

## Decided crawl source for 08-02

`full-membership` — `SELECT id FROM "AccProject" WHERE status='active'` (1,153 ids).

## Key files

- Created: `.planning/phases/08-activity-re-extraction/08-SPIKE.md` (Membership Enumeration + SPIKE VERDICT)
- No source code changed. No new packages. `npx tsc --noEmit` unaffected (no `.ts` touched).

## Decisions & deviations

- **APS 3-leg enumeration unavailable (401).** Did NOT refresh the stored Autodesk token (single-use refresh-token rotation would risk breaking dashboard login — see memory `aps-refresh-token-rotation`). Used `AccProject` active as the membership proxy. `VERIFY:` precise Luis-personal membership vs app-visible `AccProject`; mitigated because the spike PASS is on a project Luis is a known member of.
- **Admin set is 234, not the ≈428 the CONTEXT estimated** (distinct non-blank `AccActivity.projectId`). Some `AccActivity` rows have a blank `projectId`.
- **Existing ACCDS baseline is large:** 2,610,482 rows / 231 distinct projects. Phase 8 is a refresh+expand, not a cold start. 08-02 must (a) crawl the ~920 never-crawled member projects and (b) consider currency of the 231 already-crawled (project-level `ACCDS_RESUME=1` skips existing — see resume-gap note in 08-02).

## Security

- `scratch/acc-session.json` (password-equivalent) never read/printed; confirmed NOT staged (`git diff --cached --name-only`). No admin grant performed.
