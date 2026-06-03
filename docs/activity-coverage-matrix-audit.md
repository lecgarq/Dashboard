# Activity Coverage Matrix Audit

Generated from local database state on 2026-05-21. No Autodesk or Data Connector
request was submitted for this repair.

## Summary

The dashboard now has a no-quota activity coverage matrix contract:
`accActivity.getCoverageMatrix`.

Default window used for this audit: 30 days ending at the latest local
`AccActivity.createdAt`, from `2026-04-22T00:00:00.000Z` through
`2026-05-21T23:59:59.999Z`.

| Metric | Value |
| --- | ---: |
| Activity rows in window | 26,537 |
| Attributed rows in window | 26,370 |
| Active project/day/service cells | 276 |
| Days with activity | 18 / 30 |
| Services with activity | 6 |
| Projects in ACC inventory | 428 |
| Inventory projects with activity | 83 |
| Inventory projects without activity | 345 |
| Non-inventory activity scopes | 1 |

The non-inventory activity scope is expected: admin/account-level activity is
stored as the `(admin)` scope, not as a project inventory row.

## Service Coverage

| Service | Rows | Attributed Rows | Projects/Scopes | Days | Latest Activity |
| --- | ---: | ---: | ---: | ---: | --- |
| docs | 17,690 | 17,524 | 81 | 15 | 2026-05-21T05:59:57.840Z |
| issues | 8,500 | 8,499 | 14 | 8 | 2026-05-21T05:58:12.127Z |
| rfis | 137 | 137 | 10 | 7 | 2026-05-21T04:15:03.603Z |
| submittals | 101 | 101 | 3 | 4 | 2026-05-20T03:43:58.302Z |
| sheets | 82 | 82 | 7 | 5 | 2026-05-21T05:46:28.358Z |
| admin | 27 | 27 | 2 | 7 | 2026-05-21T05:33:23.162Z |

## Highest-Volume Project Coverage

| Project | Rows | Active Days | Services | Coverage Band |
| --- | ---: | ---: | ---: | --- |
| MXL PSF Planta Conversion QRO - OQRO040 | 6,368 | 3 | 3 | sparse |
| MXL Plateros RED - OMXL170 | 4,092 | 3 | 3 | sparse |
| CDMX Amp Prepa TEC Santa Fe OMEX060 | 3,319 | 7 | 4 | sparse |
| CDMX Platah ESPEC 01 OMEX066 | 1,382 | 3 | 3 | sparse |
| CDMX Amazon TI'S OTLC030 | 1,374 | 7 | 4 | sparse |
| FWD Walmart CEDIS Bajio Secos | 1,139 | 3 | 1 | sparse |
| MTY ITESM Innovation HUB O/MTY/078+095 | 841 | 3 | 2 | sparse |
| CDMX Infraestructura PLATAH OMEX069 | 799 | 3 | 1 | sparse |
| CDMX MELI PLATAH MXCD13 OMEX064 | 667 | 3 | 1 | sparse |
| MTY AE-01 | 657 | 5 | 1 | sparse |

## First Missing Inventory Projects In Window

These are inventory projects with no activity rows in the audited 30-day window.

| Project | Status |
| --- | --- |
| 00 Implementacion HER-ACS | active |
| 32 D TI's Vesta Apodaca 07 | active |
| 51 D Prosperity Hermosillo Inventario | active |
| ACC CDV Design Collaboration TEST | active |
| ACC DEMO 3 | archived |
| ACC DEMO 4 | archived |
| ACC DEMO 5 | archived |
| ACC Demo Project | archived |
| ACC Migracion | active |
| ACC MTY DEMO | archived |

## Dashboard Contract

`accActivity.getCoverageMatrix` returns:

- `range`: UTC `from`, `to`, and day count.
- `totals`: row counts, attributed counts, active cells, day/service/project coverage, and non-inventory activity scopes.
- `days`: UTC day keys for the requested window.
- `services`: service-level row, project/scope, day, and freshness rollups.
- `projects`: highest-volume projects/scopes with active-day ratios and coverage bands.
- `missingProjects`: inventory projects with no activity rows in the window.
- `cells`: normalized project x day x service cells with row, actor, attributed-row, and freshness counts.

This contract is intended for heatmaps, coverage warnings, extraction planning,
and future Sync Center drill-downs. Missing projects stay explicit instead of
being inferred as inactive users or low-risk projects.
