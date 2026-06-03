# Activity Attribution Audit

Generated: 2026-05-21

## Summary

The ACC activity table now has deterministic actor attribution and unknown-actor classification suitable for dashboard consumption.

| Metric | Value |
| --- | ---: |
| Total activity rows | 26,579 |
| Rows attributed to user email | 26,412 |
| Rows remaining unattributed | 167 |
| Attribution rate | 99.37% |
| Resolved user actors | 435 |
| Unknown actor IDs | 7 |

## Actor Classification

| Classification | Rows | Actors | Meaning |
| --- | ---: | ---: | --- |
| `resolved_user` | 26,412 | 435 | Activity has a mapped `userEmail`. |
| `automation/system` | 114 | 1 | Activity is from known system-style actor IDs or automation actions. |
| `unmapped_external_user` | 53 | 6 | Actor ID is syntactically usable but not present in local ACC user sources. |
| `invalid_actor_id` | 0 | 0 | Actor ID is blank, null-like, or unusable. |

## Remaining Unknown Actors

| Autodesk ID | Rows | Classification | Actions |
| --- | ---: | --- | --- |
| `N/A` | 114 | `automation/system` | `add-entity-by-automation`, `assign-permission`, `create-entity`, `upload-entity` |
| `MZH2PECBPWPLUFYB` | 20 | `unmapped_external_user` | `view-entity` |
| `X5J229GGK9BRQUTJ` | 12 | `unmapped_external_user` | `view-entity` |
| `WFL2D4T4NBKQHBM6` | 10 | `unmapped_external_user` | `download-entity`, `view-entity` |
| `AW8MJXQ3Y527AFDM` | 8 | `unmapped_external_user` | `download-entity`, `view-entity` |
| `6SP2KNMWJV9ELUL6` | 2 | `unmapped_external_user` | `download-entity`, `view-entity` |
| `T925M7UEW9ETEDHH` | 1 | `unmapped_external_user` | `issue-view` |

## Service Coverage Of Unknown Rows

| Service | Rows |
| --- | ---: |
| `docs` | 166 |
| `issues` | 1 |

## Data Sources Used

The no-quota attribution repair used only local tables:

- `AccDcUser.autodeskId -> email`
- `AccProjectMember.autodeskId -> email`
- `AccMemberCache.data.autodeskId -> email`

No Autodesk/Data Connector request was submitted for this repair.

## Dashboard Contract

`accActivity.getCoverage` now returns:

- `unattributedRows`
- `attributionRate`
- `distinctUnknownActors`
- `actorClassifications`
- `unknownRowsByService`
- `topUnknownActors`

This lets future dashboards show classified residuals instead of vague unknown rows.
