# 18-01 Reconciliation Verdict — AccFolderPermissionSummary vs live aggregate

Run: `node scripts/verify-folder-perm-summary.cjs --out .planning/phases/18-accfolderpermissionsummary-foundation/18-RECONCILIATION.md`

Proves `AccFolderPermissionSummary` (populated by `scripts/backfill-folder-perm-summary.cjs`)
equals the live `includePermissionSummary` GROUP BY aggregate at
`lib/server/acc-hot-cache.ts:304-317`, row-for-row, against the live local PostgreSQL DB.
No consumer is switched — this is a pre-flight parity proof for Phase 19 (PROJ-02/PROJ-03).

## VERDICT: PASS

## Raw script output

```
=== AccFolderPermissionSummary Reconciliation — 2026-07-02T16:39:55.911Z ===
live aggregate row count:       22082
projection row count:           22082
full-outer-join mismatch count:  0

spot-checked keys (20):
  MATCH  (fc4e400f-f78c-4412-985e-e31b57a99ac9, 46dbd332-e995-40f6-9eee-41b33ac07c23)  folderCount live=3 proj=3  totalBytes live=0 proj=0  permTypes live=["View+Download"] proj=["View+Download"]
  MATCH  (59bd3fa4-2904-44f3-8f3e-4da0d2eeb1ee, 39660f57-66e5-45d2-a614-81ad3495e166)  folderCount live=168 proj=168  totalBytes live=7544940482 proj=7544940482  permTypes live=["View Only","View+Download","View+Download+Upload+Edit"] proj=["View Only","View+Download","View+Download+Upload+Edit"]
  MATCH  (1f9607bc-a753-4680-9792-583f5f862131, 4660801e-e4b7-4763-bf06-26819d49f242)  folderCount live=8 proj=8  totalBytes live=0 proj=0  permTypes live=["View Only","View+Download"] proj=["View Only","View+Download"]
  MATCH  (cc195a54-c3f7-479e-a894-9e76980f6a8f, 67c5794e-9721-4aa3-89bc-3ad577137458)  folderCount live=282 proj=282  totalBytes live=0 proj=0  permTypes live=["View Only","View+Download","View+Download+Upload","View+Download+Upload+Edit"] proj=["View Only","View+Download","View+Download+Upload","View+Download+Upload+Edit"]
  MATCH  (c270308f-7ca7-43b3-b80e-b795bc9c8915, b288900e-5572-4d52-af6b-63d65e90964e)  folderCount live=33 proj=33  totalBytes live=0 proj=0  permTypes live=["View Only","View+Download"] proj=["View Only","View+Download"]
  MATCH  (40c6db53-6724-4b8b-87aa-9ae667aa1346, a0de3c9a-5376-4445-8e69-1e235f7d4024)  folderCount live=33 proj=33  totalBytes live=0 proj=0  permTypes live=["View Only","View+Download"] proj=["View Only","View+Download"]
  MATCH  (018be831-56de-4c19-bd11-380542e184a9, 8d71e5c0-2a90-47d1-8fdc-1595aa88fbcf)  folderCount live=50 proj=50  totalBytes live=0 proj=0  permTypes live=["View Only","View+Download","View+Download+Upload+Edit"] proj=["View Only","View+Download","View+Download+Upload+Edit"]
  MATCH  (14380853-7ae0-4d70-ab8e-b4a037ae98a1, 1fb71f7b-0ea8-4630-a01e-98da6df84339)  folderCount live=32 proj=32  totalBytes live=0 proj=0  permTypes live=["View Only","View+Download"] proj=["View Only","View+Download"]
  MATCH  (19dbdfc9-8320-48ef-9355-2521662371aa, 1fb71f7b-0ea8-4630-a01e-98da6df84339)  folderCount live=92 proj=92  totalBytes live=0 proj=0  permTypes live=["View Only","View+Download","View+Download+Upload+Edit"] proj=["View Only","View+Download","View+Download+Upload+Edit"]
  MATCH  (ccebcb91-6b85-4e55-b45c-b713d2f6531d, 37deb4b8-b68a-4959-8b72-4b264650138e)  folderCount live=737 proj=737  totalBytes live=0 proj=0  permTypes live=["View Only","View+Download","View+Download+Upload+Edit"] proj=["View Only","View+Download","View+Download+Upload+Edit"]
  MATCH  (4fc9939e-6eac-4d8a-b7d0-09f97000505e, 6ce04104-9941-44d0-a7a8-eb3e7d500f70)  folderCount live=202 proj=202  totalBytes live=0 proj=0  permTypes live=["View Only","View+Download+Upload","View+Download+Upload+Edit"] proj=["View Only","View+Download+Upload","View+Download+Upload+Edit"]
  MATCH  (91a0f41b-e79e-4d96-a9fb-4c6495c51ecd, 39660f57-66e5-45d2-a614-81ad3495e166)  folderCount live=40 proj=40  totalBytes live=0 proj=0  permTypes live=["View Only","View+Download","View+Download+Upload+Edit"] proj=["View Only","View+Download","View+Download+Upload+Edit"]
  MATCH  (474e6cb3-23c0-494f-8a61-98d0992e396c, 39660f57-66e5-45d2-a614-81ad3495e166)  folderCount live=74 proj=74  totalBytes live=0 proj=0  permTypes live=["View Only","View+Download","View+Download+Upload+Edit"] proj=["View Only","View+Download","View+Download+Upload+Edit"]
  MATCH  (20eb8a62-84a5-443b-adb9-41509bd966a2, b07fc428-66bc-4a45-af67-b6d429b77457)  folderCount live=34 proj=34  totalBytes live=187461632 proj=187461632  permTypes live=["View Only","View+Download","View+Download+Upload+Edit"] proj=["View Only","View+Download","View+Download+Upload+Edit"]
  MATCH  (15983c8a-9da1-478b-a8f2-b50218cbd8b8, b07fc428-66bc-4a45-af67-b6d429b77457)  folderCount live=47 proj=47  totalBytes live=4220318990 proj=4220318990  permTypes live=["View Only","View+Download","View+Download+Upload+Edit"] proj=["View Only","View+Download","View+Download+Upload+Edit"]
  MATCH  (8ea5034d-2218-46b1-9641-bdab412a4633, 2bbf066a-23a8-4280-b344-9b666cdc45e4)  folderCount live=222 proj=222  totalBytes live=0 proj=0  permTypes live=["View Only","View+Download"] proj=["View Only","View+Download"]
  MATCH  (eff55021-b84e-47e0-96af-a747208b5cab, 46dbd332-e995-40f6-9eee-41b33ac07c23)  folderCount live=16 proj=16  totalBytes live=0 proj=0  permTypes live=["View Only","View+Download"] proj=["View Only","View+Download"]
  MATCH  (4e000891-adba-459d-ac14-5ef8b4617bcf, 80f39fe7-02b3-4fb9-aa7c-e24bf5edefc8)  folderCount live=129 proj=129  totalBytes live=0 proj=0  permTypes live=["Full Controller","View Only","View+Download"] proj=["Full Controller","View Only","View+Download"]
  MATCH  (e84216d8-644a-4e60-8856-0f0130ab56e7, adcaa625-4fa1-4638-b010-57b87923aab2)  folderCount live=46 proj=46  totalBytes live=0 proj=0  permTypes live=["View Only","View+Download"] proj=["View Only","View+Download"]
  MATCH  (b1bdf86a-e69d-4a9e-9580-cac1fbf0424f, 4e078bc2-bf9e-490e-b115-e89f7e5e636e)  folderCount live=149 proj=149  totalBytes live=0 proj=0  permTypes live=["View Only","View+Download","View+Download+Upload+Edit"] proj=["View Only","View+Download","View+Download+Upload+Edit"]

VERDICT: PASS
=====================================================
```
