# Data Discovery Workflow

> **Status:** Durable process doc. Thin repo-specific wrapper.
> **Scope:** Confirm a real, counted data source exists **before** building any dimension, edge, chart, or
> schema-shaped change. This is the "data first" gate.
> **Companions:** [`index`](./index.md) · [`repo-development-workflow`](./repo-development-workflow.md) ·
> **the authoritative source:** [`access-analysis-graph-development`](./access-analysis-graph-development.md) §1
> (Data Discovery), plus the dated research artifacts under `docs/superpowers/research/`.

## Purpose

This repo's first principle is **data honesty**: no dimension/edge/preset/chart ships without a real,
counted source field. This workflow is the gate that enforces it. It deliberately **does not duplicate**
the detailed graph procedure — it points at it and adds the general "verify before you build" loop.

## When to use

- Before adding any dimension, edge layer, chart, filter, or risk flag.
- Before any change keyed on a DB field, schema column, or ingested CSV shape.
- After any DC ingest that could change the node set or field coverage.

## Required inputs

- The field(s) your change depends on.
- The current inventory under `docs/superpowers/research/` (e.g. the access-analysis data inventory JSON).
- Access to local Postgres (`npm run db:status`; start with `npm run db:start`).

## Allowed files

Read-only discovery scripts under `scripts/scratch/**` and the research markdown/JSON under
`docs/superpowers/research/`. **Discovery is read-only** — it never mutates app data.

## Forbidden files / actions

- No schema or runtime change during discovery — discovery only *informs* later work.
- No destructive DB commands. Read/`EXPLAIN`/`count` only.
- Prisma 7.8 needs a driver adapter, so ad-hoc `new PrismaClient()` won't work for scratch queries — use
  the `pg` driver directly (as the P5-C C0 measurement did) or psql.

## Step-by-step process

1. **Confirm the DB is up:** `npm run db:status` (else `npm run db:start`).
2. **Run the read-only discovery** for the area (e.g. the committed access-analysis discovery script under
   `scripts/scratch/`). For graph dimensions/edges, follow
   [`access-analysis-graph-development`](./access-analysis-graph-development.md) §1 step-by-step.
3. **Count the field you need.** Confirm it exists, its coverage, and its real distribution. Watch the
   known traps recorded in memory — e.g. the internal/external domain defect (`@lecg.com` matched 0 users;
   the real domain was `hermosillo.com`), and empty-string sentinels (`projectId = ''` for admin rows, not
   `null`).
4. **Reconcile headline counts** against the prior inventory and `scripts/scratch/check-db-counts.cjs`.
   Known live baseline: ~**16,942** nodes; internal ≈ **1,265**.
5. **Record the numbers** in the research doc (update tables + confidence levels for anything that moved).
6. **Decide availability/confidence** for each field the change will use; downgrade anything that lost
   coverage. A field with no real coverage **does not become a feature** — it is dropped or deferred.
7. **Only then** proceed to planning ([`repo-development-workflow`](./repo-development-workflow.md) step 2).

## Required tests

Discovery itself is measurement, not code. The *consumer* of the discovery (the dimension/edge/chart) must
later prove counts match the inventory in its integration tests (see
[`access-analysis-graph-development`](./access-analysis-graph-development.md) §2 gate: "counts match data").

## Verification checklist

- [ ] DB confirmed up; discovery run read-only.
- [ ] Required field's existence + coverage + distribution counted from live data.
- [ ] Known traps checked (domain defect, empty-string sentinels, sign-in vs activity recency).
- [ ] Headline counts reconciled with the prior inventory / check script.
- [ ] Research doc updated with new numbers + confidence.
- [ ] Fields lacking real coverage dropped/deferred, not shipped.

## Commit rules

If discovery produced an updated research artifact, stage it surgically
([`surgical-staging-workflow`](./surgical-staging-workflow.md)) under `docs/superpowers/research/` with a
`docs(research): ...` message. Scratch scripts are committed only if intended to be reusable.

## Stop conditions

- The field you need has no real coverage → stop; the feature can't be data-honest. Report and re-plan.
- Counts contradict a memory fact or the prior inventory → stop; reconcile before building (the data may
  have drifted, or a prior assumption was wrong — both have happened here).

## Handoff report template

```
## Data discovery — <field/feature>
- DB: up (local PG)
- Source field: <name> — exists? <y/n>, coverage: <n / total>
- Distribution: <key counts>
- Reconciliation: nodes <16942?>, internal <1265?>, vs inventory <match/drift>
- Traps checked: <domain / sentinel / recency — findings>
- Decision: <ship | defer | drop> with confidence <high/med/low>
- Research doc updated: <path or none>
```
