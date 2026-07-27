# Activity-type → module audit

Generated read-only from live PG. **1,046,075 rows · 171 distinct activity types.**
Module + category from `classifyActivity`; `service` is Autodesk's own product attribution.
A ⚠ flag means the dominant `service` implies a different module than we assigned (review candidate).

## Module totals

| Module | Activity types | Volume | % | ⚠ flagged types |
|---|--:|--:|--:|--:|
| Build | 47 | 172,101 | 16.5% |  |
| Data Management | 76 | 828,898 | 79.2% | 3 |
| Datum | 9 | 25 | 0.0% | 3 |
| Design Collaboration | 13 | 40,767 | 3.9% | 10 |
| Model Coordination | 12 | 966 | 0.1% | 10 |
| Admin Actions | 14 | 3,318 | 0.3% | 4 |

## Build — 172,101 activities, 47 types

| Activity (label) | rawAction | Volume | Category | service spread | review |
|---|---|--:|---|---|---|
| Issue View | `issue-view` | 59,812 | Workflow | (null):37,495, issues:22,317 |  |
| Issue Edit | `issue-edit` | 39,635 | Workflow | (null):22,190, issues:17,445 |  |
| Issue Attachment Add | `issue-attachment-add` | 11,609 | Workflow | issues:6,238, (null):5,371 |  |
| RFI View | `rfi-view` | 9,887 | Workflow | rfis:5,941, (null):3,946 |  |
| Issue Assign | `issue-assign` | 6,317 | Workflow | (null):3,304, issues:3,013 |  |
| Issue Create | `issue-create` | 5,429 | Workflow | (null):2,955, issues:2,474 |  |
| Issue Due Date | `issue-due-date` | 4,933 | Workflow | (null):3,304, issues:1,629 |  |
| Issue Link Added | `issue-link-added` | 3,341 | Workflow | issues:1,707, (null):1,634 |  |
| Submittals Item Change Attribute | `submittals-item-change-attribute` | 3,218 | Workflow | submittals:1,900, (null):1,318 |  |
| Issue Closed | `issue-closed` | 2,765 | Workflow | (null):1,508, issues:1,257 |  |
| Submittals Item Commit Transition | `submittals-item-commit-transition` | 2,689 | Workflow | submittals:1,690, (null):999 |  |
| Issue Comment | `issue-comment` | 2,533 | Workflow | (null):1,463, issues:1,070 |  |
| Issue In Review | `issue-in-review` | 2,072 | Workflow | (null):1,413, issues:659 |  |
| Submittals Item Add Attachment | `submittals-item-add-attachment` | 2,047 | Workflow | submittals:1,362, (null):685 |  |
| Issue Completed | `issue-completed` | 2,012 | Workflow | (null):1,530, issues:482 |  |
| Submittals Item Change Attribute User | `submittals-item-change-attribute-user` | 2,007 | Workflow | submittals:1,291, (null):716 |  |
| Issue Placement Reposition | `issue-placement-reposition` | 1,877 | Workflow | issues:1,067, (null):810 |  |
| RFI Update | `rfi-update` | 1,607 | Workflow | rfis:894, (null):713 |  |
| Issue Snapshot Edit | `issue-snapshot-edit` | 1,510 | Workflow | (null):1,218, issues:292 |  |
| Submittals Step Change Attribute | `submittals-step-change-attribute` | 1,145 | Workflow | submittals:703, (null):442 |  |
| Submittals Item Change Attribute Review Response | `submittals-item-change-attribute-review-response` | 773 | Workflow | submittals:555, (null):218 |  |
| Submittals Task Change Attribute | `submittals-task-change-attribute` | 764 | Workflow | submittals:548, (null):216 |  |
| Issue Open | `issue-open` | 649 | Workflow | (null):390, issues:259 |  |
| Submittals Item Create | `submittals-item-create` | 614 | Workflow | submittals:368, (null):246 |  |
| Submittals Item Change Attribute Final Response | `submittals-item-change-attribute-final-response` | 589 | Workflow | submittals:395, (null):194 |  |
| Issue Deleted | `issue-deleted` | 518 | Workflow | (null):268, issues:250 |  |
| Issue Pending | `issue-pending` | 340 | Workflow | (null):237, issues:103 |  |
| Issue Copy | `issue-copy` | 321 | Workflow | issues:231, (null):90 |  |
| RFI Create | `rfi-create` | 309 | Workflow | rfis:160, (null):149 |  |
| Issue Attachment Remove | `issue-attachment-remove` | 153 | Workflow | (null):91, issues:62 |  |
| Submittals Item Remove Attachment | `submittals-item-remove-attachment` | 98 | Workflow | submittals:71, (null):27 |  |
| Issue Draft | `issue-draft` | 88 | Workflow | (null):73, issues:15 |  |
| Submittals Item Change Attribute Revision | `submittals-item-change-attribute-revision` | 80 | Workflow | submittals:46, (null):34 |  |
| Issue Not Approved | `issue-not-approved` | 69 | Workflow | (null):39, issues:30 |  |
| Issue Link Removed | `issue-link-removed` | 68 | Workflow | (null):50, issues:18 |  |
| Submittals Item Add Comment | `submittals-item-add-comment` | 68 | Workflow | submittals:42, (null):26 |  |
| Asset Update | `asset-update` | 67 | Content changes | (null):67 |  |
| Issue Restored | `issue-restored` | 18 | Workflow | (null):18 |  |
| Issue Placement Add | `issue-placement-add` | 17 | Workflow | issues:9, (null):8 |  |
| Issue Placement Remove | `issue-placement-remove` | 16 | Workflow | (null):9, issues:7 |  |
| Submittals Item Add Reference | `submittals-item-add-reference` | 12 | Workflow | submittals:11, (null):1 |  |
| Asset Create | `asset-create` | 8 | Content changes | (null):8 |  |
| Submittals Item Change Relation Package | `submittals-item-change-relation-package` | 6 | Workflow | submittals:5, (null):1 |  |
| Issue In Progress | `issue-in-progress` | 5 | Workflow | issues:5 |  |
| Submittals Item Remove Reference | `submittals-item-remove-reference` | 3 | Workflow | submittals:3 |  |
| Submittals Item Change Relation Spec | `submittals-item-change-relation-spec` | 2 | Workflow | submittals:1, (null):1 |  |
| Asset Delete | `asset-delete` | 1 | Deletions | (null):1 |  |

## Data Management — 828,898 activities, 76 types

| Activity (label) | rawAction | Volume | Category | service spread | review |
|---|---|--:|---|---|---|
| View Entity | `view-entity` | 401,944 | Viewing & exports | (null):242,218, docs:159,726 |  |
| Upload Entity | `upload-entity` | 199,819 | Content changes | (null):112,518, docs:87,301 |  |
| Download Entity | `download-entity` | 40,732 | Viewing & exports | (null):23,183, docs:17,549 |  |
| Copy File | `copy-file` | 36,331 | Content changes | (null):25,221, docs:11,110 |  |
| Lock Entity | `lock-entity` | 25,281 | Content changes | (null):15,579, docs:9,702 |  |
| Unlock Entity | `unlock-entity` | 25,180 | Content changes | (null):15,482, docs:9,698 |  |
| Create Entity | `create-entity` | 20,467 | Content changes | (null):11,328, docs:9,139 |  |
| View Existing Review | `view-existing-review` | 14,335 | Viewing & exports | (null):9,459, docs:4,876 |  |
| Rename Entity | `rename-entity` | 11,866 | Content changes | (null):6,624, docs:5,242 |  |
| Delete Entity | `delete-entity` | 11,452 | Deletions | docs:6,385, (null):5,067 |  |
| Set Approval Status | `set-approval-status` | 9,373 | Content changes | (null):6,386, docs:2,987 |  |
| View Transmittal | `view-transmittal` | 4,114 | Viewing & exports | (null):2,262, docs:1,852 |  |
| Create Transmittal | `create-transmittal` | 3,354 | Workflow | docs:2,507, (null):847 |  |
| Print Entity | `print-entity` | 2,088 | Viewing & exports | (null):1,192, docs:896 |  |
| Process Entity | `process-entity` | 1,882 | Content changes | (null):1,704, docs:178 |  |
| Move Entity | `move-entity` | 1,710 | Content changes | (null):872, docs:838 |  |
| Publish Entity | `publish-entity` | 1,708 | Content changes | docs:1,708 |  |
| Edit Office File | `edit-office-file` | 1,673 | Content changes | (null):933, docs:740 |  |
| Add Entity By Automation | `add-entity-by-automation` | 1,670 | Content changes | (null):1,263, docs:407 |  |
| Notify Reviewers | `notify-reviewers` | 1,311 | Workflow | (null):795, docs:516 |  |
| Add Docs To Review | `add-docs-to-review` | 1,239 | Workflow | (null):747, docs:492 |  |
| View Public Link | `view-public-link` | 1,110 | Viewing & exports | (null):686, docs:424 |  |
| Initiate Review Process | `initiate-review-process` | 1,068 | Workflow | (null):637, docs:431 |  |
| Claim Review Task | `claim-review-task` | 1,062 | Workflow | (null):661, docs:401 |  |
| Submit Review | `submit-review` | 971 | Workflow | (null):607, docs:364 |  |
| Review Push Approval Status | `review-push-approval-status` | 902 | Workflow | (null):552, docs:350 |  |
| Add Version to Set | `add-version-to-set` | 889 | Content changes | docs:889 |  |
| Export File | `export-file` | 644 | Viewing & exports | docs:326, (null):318 |  |
| Review Entity | `review-entity` | 629 | Workflow | docs:629 |  |
| Add Doc Comment For Review | `add-doc-comment-for-review` | 494 | Workflow | (null):444, docs:50 |  |
| Notify Observers | `notify-observers` | 481 | Workflow | (null):341, docs:140 |  |
| Export Transmittal | `export-transmittal` | 415 | Workflow | (null):215, docs:200 |  |
| Copy Review Docs To Folder | `copy-review-docs-to-folder` | 364 | Content changes | (null):299, docs:65 |  |
| Response Create | `response-create` | 343 | Workflow | rfis:213, (null):126, docs:4 | ⚠ Build |
| Terminate Review | `terminate-review` | 195 | Workflow | (null):103, docs:92 |  |
| Save Approval Workflow | `save-approval-workflow` | 180 | Workflow | (null):118, docs:62 |  |
| Create Public Link For Documents | `create-public-link-for-documents` | 174 | Content changes | (null):115, docs:59 |  |
| Review Export Files | `review-export-files` | 168 | Viewing & exports | (null):92, docs:76 |  |
| Comment Create | `comment-create` | 141 | Workflow | (null):79, rfis:58, docs:4 | ⚠ Build |
| Create Version Set | `create-version-set` | 121 | Content changes | sheets:80, (null):40, docs:1 |  |
| Create Public Link For Folders | `create-public-link-for-folders` | 114 | Content changes | (null):65, docs:49 |  |
| Delete Entity By Automation | `delete-entity-by-automation` | 92 | Deletions | docs:46, (null):46 |  |
| Shared With Recipients For Documents | `shared-with-recipients-for-documents` | 82 | Content changes | (null):44, docs:38 |  |
| Restore Entity | `restore-entity` | 80 | Content changes | (null):48, docs:32 |  |
| Review Back To Initiator | `review-back-to-initiator` | 63 | Workflow | (null):45, docs:18 |  |
| View In AutoCAD Web | `view-in-autocad-web` | 59 | Viewing & exports | (null):44, docs:15 |  |
| Remove Docs From Review | `remove-docs-from-review` | 57 | Deletions | (null):39, docs:18 |  |
| Review Update Candidates | `review-update-candidates` | 52 | Workflow | docs:45, (null):7 |  |
| Restore Version | `restore-version` | 43 | Content changes | (null):33, docs:10 |  |
| Shared With Recipients For Folders | `shared-with-recipients-for-folders` | 41 | Content changes | (null):25, docs:16 |  |
| Response Update | `response-update` | 39 | Workflow | rfis:28, (null):10, docs:1 | ⚠ Build |
| Edit Description | `edit-description` | 38 | Content changes | docs:19, (null):19 |  |
| Calibrate Entity | `calibrate-entity` | 37 | Content changes | docs:37 |  |
| Add Recipients To Transmittal | `add-recipients-to-transmittal` | 35 | Workflow | (null):26, docs:9 |  |
| Review Rename | `review-rename` | 34 | Workflow | (null):27, docs:7 |  |
| Delegate Review Task | `delegate-review-task` | 30 | Workflow | (null):19, docs:11 |  |
| Review Update Duration | `review-update-duration` | 25 | Workflow | (null):19, docs:6 |  |
| Delete Bridge Automation | `delete-bridge-automation` | 15 | Deletions | bridge:12, (null):3 |  |
| Update Doc Comment For Review | `update-doc-comment-for-review` | 14 | Workflow | (null):10, docs:4 |  |
| Archive Review | `archive-review` | 12 | Workflow | (null):8, docs:4 |  |
| Review Save As Draft | `review-save-as-draft` | 11 | Workflow | (null):10, docs:1 |  |
| Review Submit As Workflow | `review-submit-as-workflow` | 11 | Workflow | (null):10, docs:1 |  |
| Create Set | `create-set` | 6 | Content changes | docs:6 |  |
| Delete Doc Comment For Review | `delete-doc-comment-for-review` | 4 | Deletions | (null):3, docs:1 |  |
| Review Skip Step | `review-skip-step` | 4 | Workflow | docs:2, (null):2 |  |
| Create Bridge | `create-bridge` | 3 | Content changes | (null):3 |  |
| Create Bridge Automation | `create-bridge-automation` | 3 | Content changes | (null):3 |  |
| Archive Approval Workflow | `archive-approval-workflow` | 2 | Content changes | docs:2 |  |
| Delete Bridge | `delete-bridge` | 2 | Deletions | (null):2 |  |
| Edit Entity | `edit-entity` | 2 | Content changes | docs:1, (null):1 |  |
| Review Create Transmittal | `review-create-transmittal` | 2 | Workflow | (null):2 |  |
| Review Step Back | `review-step-back` | 2 | Workflow | docs:1, (null):1 |  |
| Delete Public Link For Documents | `delete-public-link-for-documents` | 1 | Content changes | (null):1 |  |
| Delete Public Link For Folders | `delete-public-link-for-folders` | 1 | Content changes | docs:1 |  |
| Rename Version Set | `rename-version-set` | 1 | Content changes | (null):1 |  |
| Update Version Set | `update-version-set` | 1 | Content changes | (null):1 |  |

## Datum — 25 activities, 9 types

| Activity (label) | rawAction | Volume | Category | service spread | review |
|---|---|--:|---|---|---|
| Create Custom Attribute | `create-custom-attribute` | 8 | Content changes | (null):6, docs:2 | ⚠ Data Management |
| Update Folder Properties | `update-folder-properties` | 5 | Content changes | (null):5 |  |
| Upgrade Version | `upgrade-version` | 3 | Content changes | (null):2, docs:1 | ⚠ Data Management |
| Upsert Custom Attribute Constraint | `upsert-custom-attribute-constraint` | 3 | Content changes | (null):3 |  |
| Attach Custom Attribute | `attach-custom-attribute` | 2 | Content changes | docs:1, (null):1 | ⚠ Data Management |
| Add Attribute To Naming Standard | `add-attribute-to-namingstandard` | 1 | Content changes | (null):1 |  |
| Apply Naming Standard | `apply-naming-standard` | 1 | Content changes | (null):1 |  |
| Detach Custom Attribute | `detach-custom-attribute` | 1 | Content changes | (null):1 |  |
| Update Custom Attribute | `update-custom-attribute` | 1 | Content changes | (null):1 |  |

## Design Collaboration — 40,767 activities, 13 types

| Activity (label) | rawAction | Volume | Category | service spread | review |
|---|---|--:|---|---|---|
| Receive Entity From Project With Automation | `receive-entity-from-project-with-automation` | 20,143 | Content changes | (null):20,143 |  |
| Send Entity To Project | `send-entity-to-project` | 9,494 | Content changes | (null):7,710, docs:1,784 | ⚠ Data Management |
| View Sheet | `view-sheet` | 6,735 | Viewing & exports | sheets:3,988, (null):2,747 | ⚠ Data Management |
| Receive Entity From Project | `receive-entity-from-project` | 3,253 | Content changes | (null):2,615, docs:638 | ⚠ Data Management |
| Publish Sheet | `publish-sheet` | 664 | Content changes | sheets:481, (null):183 | ⚠ Data Management |
| Export Sheet | `export-sheet` | 214 | Viewing & exports | sheets:133, (null):81 | ⚠ Data Management |
| Print Sheet | `print-sheet` | 166 | Viewing & exports | sheets:119, (null):47 | ⚠ Data Management |
| Move Sheet Collection | `move-sheet-collection` | 49 | Content changes | sheets:27, (null):22 | ⚠ Data Management |
| Change Discipline Order | `change-discipline-order` | 19 | Content changes | (null):15, sheets:4 | ⚠ Data Management |
| Delete Sheet | `delete-sheet` | 18 | Deletions | (null):11, sheets:7 | ⚠ Data Management |
| Renumber Sheet | `renumber-sheet` | 7 | Content changes | sheets:5, (null):2 | ⚠ Data Management |
| Shared With Recipients For Sheets | `shared-with-recipients-for-sheets` | 4 | Content changes | (null):4 |  |
| Add Resources To Package | `add-resources-to-package` | 1 | Content changes | (null):1 |  |

## Model Coordination — 966 activities, 12 types

| Activity (label) | rawAction | Volume | Category | service spread | review |
|---|---|--:|---|---|---|
| Issue Attach | `issue-attach` | 514 | Workflow | issues:514 | ⚠ Build |
| Issue Work Completed | `issue-work-completed` | 208 | Workflow | issues:208 | ⚠ Build |
| Issue Ready to Inspect | `issue-ready-to-inspect` | 109 | Workflow | issues:109 | ⚠ Build |
| Issue Suggestion Generated | `issue-suggestion-generated` | 77 | Workflow | issues:77 | ⚠ Build |
| Create Collection | `create-collection` | 21 | Workflow | sheets:11, (null):9, docs:1 | ⚠ Data Management |
| Issue Detach | `issue-detach` | 19 | Workflow | issues:19 | ⚠ Build |
| Issue Respond | `issue-respond` | 10 | Workflow | issues:10 | ⚠ Build |
| Rename Collection | `rename-collection` | 3 | Content changes | (null):3 |  |
| Enable Collection | `enable-collection` | 2 | Content changes | sheets:1, (null):1 | ⚠ Data Management |
| Delete Collection | `delete-collection` | 1 | Deletions | (null):1 |  |
| Issue Answered | `issue-answered` | 1 | Workflow | issues:1 | ⚠ Build |
| Issue Void | `issue-void` | 1 | Workflow | issues:1 | ⚠ Build |

## Admin Actions — 3,318 activities, 14 types

| Activity (label) | rawAction | Volume | Category | service spread | review |
|---|---|--:|---|---|---|
| Assign Permission | `assign-permission` | 907 | Access & permissions | (null):488, docs:418, admin:1 | ⚠ Data Management |
| Assign Member | `assign-member` | 882 | Access & permissions | (null):470, admin:412 |  |
| Notify Final Members | `notify-final-members` | 869 | Workflow | (null):533, docs:336 | ⚠ Data Management |
| Assign Admin | `assign-admin` | 275 | Access & permissions | admin:157, (null):118 |  |
| Delete Permission | `delete-permission` | 130 | Access & permissions | docs:75, (null):55 | ⚠ Data Management |
| Edit Project | `edit-project` | 92 | Workflow | (null):73, admin:19 |  |
| Remove Member | `remove-member` | 88 | Access & permissions | (null):47, admin:41 |  |
| Remove Admin | `remove-admin` | 47 | Access & permissions | admin:36, (null):11 |  |
| Create Project Company | `create-project-company` | 12 | Content changes | admin:12 |  |
| Export Folder Permission Report | `export-folder-permission-report` | 7 | Access & permissions | (null):7 |  |
| Create Project | `create-project` | 6 | Workflow | admin:6 |  |
| Add Member | `add-member` | 1 | Access & permissions | docs:1 | ⚠ Data Management |
| Setting Update | `setting_update` | 1 | Workflow | (null):1 |  |
| Update Sheets Permission | `update-sheets-permission` | 1 | Access & permissions | (null):1 |  |
