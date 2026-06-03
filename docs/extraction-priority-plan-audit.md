# Extraction Priority Plan Audit

Generated from local database state on 2026-05-21. No Autodesk or Data
Connector request was submitted for this planner.

## Summary

The dashboard now has a no-quota extraction priority contract:
`accSync.getExtractionPriorityPlan`.

Default window used for this audit: 30 days from `2026-04-22T00:00:00.000Z`
through `2026-05-21T23:59:59.999Z`.

| Metric | Value |
| --- | ---: |
| Projects in Data Connector inventory | 428 |
| Use quota first | 315 |
| Needs activity backfill later | 6 |
| Needs permissions crawl first | 0 |
| Good coverage, monitor only | 0 |
| Skip archived/demo/template/test/migration | 107 |

## Five-Quota Batch Shape

With `quotaLimit=5`, the planner selected 250 candidate projects and split them
into five 50-project batches. These are ranked from local evidence only:
activity rows, formal backfill state, folder crawl status, project member count,
project status, and low-value name patterns.

The first batch starts with these project IDs:

| Position | Project ID |
| ---: | --- |
| 1 | `fa948b7b-43eb-458e-8d8b-9f4cf7aa957f` |
| 2 | `34ca6fcd-198c-4ed9-bd8f-3e3a106fac71` |
| 3 | `a9e6218b-dc0b-41e1-9b07-8658e13874ac` |
| 4 | `8ef14b67-87f3-4a3a-8c02-4b327396f332` |
| 5 | `9c419dae-c7cb-497a-9415-1a2e3b2ec6ee` |
| 6 | `78fa1d01-bf66-48bc-9e4d-8f9868a25c93` |
| 7 | `43553ca7-680d-4c1c-b0aa-7a8989210314` |
| 8 | `283f8ca3-bb12-4f2d-b86f-ccefcf593f4d` |
| 9 | `57803ffe-18a5-4dcd-8f8b-b6a7509823e3` |
| 10 | `c2f6ac13-ace7-4ba7-8041-51915504739f` |

## Top Priority Projects

| Rank | Project | Members | Lane | Main reason |
| ---: | --- | ---: | --- | --- |
| 1 | MTY Caterpillar Azteca - OMTY083 | 287 | use_quota_first | No activity rows and no formal backfill window |
| 2 | MTY VPMA05 - O/MTY/084 | 192 | use_quota_first | No activity rows and no formal backfill window |
| 3 | CDMX MELI PLATAH MEZZANINE MXCD10 OMEX062 | 157 | use_quota_first | No activity rows and no formal backfill window |
| 4 | CDMX Navistar OMTY080 | 140 | use_quota_first | No activity rows and no formal backfill window |
| 5 | TIJ PPG MeLi GDL 43k OGDL015 (2024-2025) | 133 | use_quota_first | No activity rows and no formal backfill window |
| 6 | TIJ PPG MeLi GDL 100k OGDL016 017 | 129 | use_quota_first | No activity rows and no formal backfill window |
| 7 | CDMX Prologis Park Apodaca East Building 16 OMTY081 | 98 | use_quota_first | No activity rows and no formal backfill window |
| 8 | CDMX MELI MZN MXCD09 ONLU002 | 97 | use_quota_first | No activity rows and no formal backfill window |
| 9 | CDMX P&G Progreso OBJX035 | 97 | use_quota_first | No activity rows and no formal backfill window |
| 10 | CDMX Traxion Nave 1B OQRO044 | 96 | use_quota_first | No activity rows and no formal backfill window |

## Planner Rules

The scoring is deterministic. It does not infer risk with AI.

- Archived, inactive, demo, template, test, sandbox, training, or migration projects are routed to `skip_archived_or_demo`.
- Active projects with no recent activity and no formal backfill window are routed to `use_quota_first`.
- Active projects with partial/stale backfill but some activity are routed to `needs_activity_backfill`.
- Projects with adequate activity/backfill but missing folder crawl coverage are routed to `needs_permissions_crawl`.
- Projects with current backfill, meaningful activity coverage, and folder crawl coverage are routed to `good_coverage`.

## Dashboard Contract

`accSync.getExtractionPriorityPlan` returns:

- `summary`: counts by lane.
- `quotaPlan`: 50-project Data Connector batches for the requested quota limit.
- `rankedProjects`: scored project rows with lane, action, reasons, activity rows,
  active days, observed services, missing expected services, backfill state,
  folder crawl status, and member count.

This gives Sync Center and future dashboards a ranked extraction queue before
quota is spent.
