---
phase: 08-activity-re-extraction
plan: 01
artifact: spike-record
updated: 2026-06-22
---

# 08-01 Spike — ACCDS member-only access & crawl-source decision

## Session bootstrap (Task 1)

- `node scripts/accds-login.cjs` → `scratch/acc-session.json` written (65 cookies, gitignored, password-equivalent — never committed).
- **Liveness proven** by a single-project smoke crawl against a known admin project `2752ab7b-0911-4c96-b9ab-e090f3b364e3` (MXL PSF Planta Conversión QRO):
  `✓ 2752ab7b…  fetched=107934 inserted=7353` (3-month window), no `SessionExpiredError`.
  → The ACC web session is **live** and `accds/v0` returns data.

## Membership Enumeration (Task 2)

**Enumeration source — VERIFY / fallback note:** The APS 3-leg path (`prisma.account` autodesk `access_token` → `project/v1/hubs/:id/projects`) returned **HTTP 401 — the stored access token is expired** (known APS single-use refresh-token rotation issue; not refreshed here to avoid breaking dashboard login). Fell back to the **`AccProject` active set** as the membership source, which is also the exact list Plan 08-02 would crawl if the spike passes.

- Full membership proxy — `AccProject` active (`status='active'`): **1,153** (≈ the expected ~1,152 "extract ALL" target).
- Admin set — `AccActivity` distinct non-blank `projectId`: **234** (the inherited DC-extracted set; smaller than the ≈428 the CONTEXT estimated).
- Existing ACCDS coverage baseline — `AccActivityAccds`: 2,610,482 rows across **231** distinct projects.
- **Member-only candidate set** (`AccProject` active **minus** the admin set): **920** projects with no DC-sourced activity.

`VERIFY:` The 401 prevented confirming *Luis-personal* membership precisely; `AccProject` (2-legged app-visible active set) is the proxy. A spike PASS on a project Luis is clearly a member of (below) is still a definitive positive; a single 403 is treated as inconclusive and retried on another candidate before concluding admin-gated (RESEARCH Pitfall 5).

**Chosen member-only candidate (Luis is a known member):**
- `28e65bf1-0b0c-426c-b37f-3d3b73cbd860` — **ACC MTY WORKSHOP** (primary spike target)
- Backups if inconclusive: `def5fdea-8035-4b56-be60-66b36ba45149` (ACC Template MTY), `073fb3e2-df90-45fe-b81c-62e59a62b3e9` (BIM-VDC COORDINACIÓN MTY)

## SPIKE VERDICT (Task 3)

**VERDICT: PASS — `accds/v0` is member-accessible (no admin required).**

- Project tested: `28e65bf1-0b0c-426c-b37f-3d3b73cbd860` (**ACC MTY WORKSHOP**) — member-only (Luis is a member, project is NOT in the DC admin/activity set).
- Result: `✓ 28e65bf1…  fetched=97 inserted=97` (24-month window), no HTTP 403, no `SessionExpiredError`.
- Interpretation: `inserted=97 > 0` on a member-only project ⇒ the free session endpoint returns activity for projects Luis can merely *see* in the ACC web UI. The 234 admin ceiling is an artifact of the old DC extraction, not the session endpoint.

**DECIDED CRAWL SOURCE FOR 08-02: `full-membership`** = the `AccProject` active set (**1,153** projects), a ~5× expansion over the 234 admin set — achieved with **zero production permission changes** and **no DC quota**.

- No admin grant was performed (`scripts/acc-grant-project-admin.cjs` NOT called). The ~724/920 deferred Account-Admin route from CONTEXT is now **moot for reading activity** — member access suffices.
- `git diff --cached --name-only` confirmed `scratch/acc-session.json` is NOT staged before commit.

