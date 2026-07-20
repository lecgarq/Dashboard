# Phase 36 Verification — Full-Rate Gate & Closeout

**Date:** 2026-07-20 · **Milestone:** v2.6 Full-Rate Graph · **Plans:** 1/1 summarized
**Requirement:** REND-02

## REND-02 — hard full-rate gate ✅

- Accepted Phase-32 payload: **60.016 fps over 10.014 seconds**.
- Population: **22,279 nodes**, all 22,279 animated; **18,000 links**.
- Renderer: `cosmos-native`.
- Controller: Tier **0 before and after**; it did not engage during the accepted sample.
- Safety net remains present: the separate controller exercise observed sequence
  `0 → 1 → 2 → 1` and recovery to Tier 1.
- Reduced motion stayed static, click focus remained functional, and grouping morph
  paused/resumed ambient motion cleanly.

## Time-to-graph non-regression ✅

The unchanged N=5 method ran after the full gate sweep on isolated build
`tWSXSzfgHWy8ZCQ1BYxT0`:

| Run | Time to graph |
|---:|---:|
| 1 (cold browser context) | 2,211.5 ms |
| 2 | 2,386.7 ms |
| 3 | 2,389.2 ms |
| 4 | 2,310.3 ms |
| 5 | 2,427.4 ms |

Median **2,386.7 ms — PASS**: 1,527.0 ms / 39.0% faster than the strict 3,913.7 ms
reference. Every run rendered 22,279 nodes/features. Earlier failed experiments and their
complete batches remain recorded in `36-BASELINE.md`; no result was cherry-picked.

## Gates actually run

| Gate | Outcome |
|---|---|
| Focused regression suites | compact path 4 files / 6; rail/profile 2 / 21; parity 2 / 20 |
| `npx tsc --noEmit` | exit 0, including immediately before live build |
| Full `npm test` | 342 passed / 1 skipped; 2,638 passed / 1 skipped |
| TEST-01/02/03 + PERF-02 | 4 files / 49 passed |
| `node scripts/repo-map/check.cjs` | pass; 3 dependency + 248 AST baseline warnings |
| Isolated Next production build | pass; 29/29 static pages |
| `acc-dc-graph.spec.ts` | 16 passed / 8 expected skips |
| Final time-to-graph N=5 | 2,386.7 ms median, strict pass |
| Phase-32 ambient spec (run last) | 4/4 passed; 60.016 fps / 10.014 s / Tier 0 |

The legacy Phase-7 UAT wrapper was not run: it is hard-coded to reject any recent
`users/access-analysis` change and exercises four unrelated Phase-7 pages. The current
phase's graph E2E, time-to-graph, reduced-motion, framebuffer, and full-rate gates directly
exercise the changed surface.

## Deploy

- `LECG Dashboard Local` stopped and lingering port-3000 PID cleared before build.
- Fresh `npx tsc --noEmit` and `npm run build` passed; 29/29 static pages generated.
- Dashboard scheduled task restarted and reports `Running`; port 3000 is listening.
- 2026-07-20 17:25–17:27 -06:00 probes:
  - `/api/health` → 200, `database: connected`.
  - unauthenticated `/users/spatial-graph` → expected 307 login redirect.
  - authenticated `/users/spatial-graph` → 200, populated 22,279-node graph visible,
    no console errors.
- **BUILD_ID:** `39p7DFRd3DbgM8WjWU2Pz`.

## Scope and debt

No new dependency, schema, data source, WebGL surface, or visual behavior. The existing
three-tier safety controller remains intact. No new `VERIFY:` blocker or phase debt.

**Phase result: PASS — 4/4 success criteria met and deployed.**
