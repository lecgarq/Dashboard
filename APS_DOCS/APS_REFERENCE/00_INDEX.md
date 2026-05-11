# APS Master API Reference — Index

> Generated: 2026-05-08 | 1,882 JSON source files across 7 APIs
> This is the **master index** linking to detailed per-API reference documents.

---

## 📚 Reference Documents

| # | Document | API | Files | Covers |
|---|----------|-----|-------|--------|
| 01 | [Authentication API](01_AUTHENTICATION_API.md) | OAuth v2 | 72 | Auth flows (2-leg, 3-leg, PKCE), scopes, token management, OIDC |
| 02 | [Data Management API](02_DATA_MANAGEMENT_API.md) | DM v2 + OSS v2 | 764 | Hubs, Projects, Folders, Items, Versions, OSS Buckets/Objects |
| 03 | [Model Derivative API](03_MODEL_DERIVATIVE_API.md) | MD v2 | 265 | File translation, SVF2 conversion, metadata/property extraction |
| 04 | [Viewer API](04_VIEWER_API.md) | Viewer v7 | 160 | 3D/2D rendering, 33 extensions, custom tools, events |
| 05 | [Design Automation API](05_DESIGN_AUTOMATION_API.md) | DA v3 | 114 | Cloud Revit/AutoCAD/Inventor processing, AppBundles, Activities, WorkItems |
| 06 | [BIM 360 / ACC API](06_BIM360_ACC_API.md) | BIM 360 v1 | 394 | Account admin, Issues, Cost, Assets, Model Coordination, Clash, Doc Mgmt |
| 07 | [Manufacturing Data Model](07_MANUFACTURING_DATA_MODEL_API.md) | FDX Graph v1 | 113 | GraphQL element queries, data exchanges, IFC/Revit property extraction |

---

## Quick Decision Matrix

| I need to… | API | Document |
|---|---|---|
| Get an access token | **Authentication** | [01](01_AUTHENTICATION_API.md) |
| List hubs / projects / folders | **Data Management** | [02](02_DATA_MANAGEMENT_API.md) |
| Upload / download files | **Data Management (OSS)** | [02](02_DATA_MANAGEMENT_API.md) |
| Convert CAD files (RVT→IFC, DWG→OBJ) | **Model Derivative** | [03](03_MODEL_DERIVATIVE_API.md) |
| Prepare a model for 3D viewing | **Model Derivative** (→SVF2) | [03](03_MODEL_DERIVATIVE_API.md) |
| Extract BIM properties from a model | **Model Derivative** | [03](03_MODEL_DERIVATIVE_API.md) |
| Display a 3D model in the browser | **Viewer** | [04](04_VIEWER_API.md) |
| Add measurement/markup tools | **Viewer Extensions** | [04](04_VIEWER_API.md) |
| Run Revit plugins in the cloud | **Design Automation** | [05](05_DESIGN_AUTOMATION_API.md) |
| Run AutoCAD scripts serverless | **Design Automation** | [05](05_DESIGN_AUTOMATION_API.md) |
| Manage BIM 360 projects & users | **BIM 360 Admin** | [06](06_BIM360_ACC_API.md) |
| Track construction issues | **BIM 360 Issues** | [06](06_BIM360_ACC_API.md) |
| Manage budgets & contracts | **BIM 360 Cost** | [06](06_BIM360_ACC_API.md) |
| Detect model clashes | **BIM 360 Model Coord** | [06](06_BIM360_ACC_API.md) |
| Bulk export BIM 360 data | **Data Connector** | [06](06_BIM360_ACC_API.md) |
| Query BIM elements via GraphQL | **FDX Graph** | [07](07_MANUFACTURING_DATA_MODEL_API.md) |
| Create filtered data exchanges | **FDX Graph** | [07](07_MANUFACTURING_DATA_MODEL_API.md) |

---

## Base URL Quick Reference

| API | Base URL |
|-----|----------|
| Auth | `https://developer.api.autodesk.com/authentication/v2` |
| DM (Hubs/Projects) | `https://developer.api.autodesk.com/project/v1` |
| DM (Folders/Items) | `https://developer.api.autodesk.com/data/v1` |
| OSS | `https://developer.api.autodesk.com/oss/v2` |
| Model Derivative | `https://developer.api.autodesk.com/modelderivative/v2` |
| Design Automation | `https://developer.api.autodesk.com/da/us-east/v3` |
| BIM 360 Admin (new) | `https://developer.api.autodesk.com/construction/admin/v1` |
| BIM 360 Issues | `https://developer.api.autodesk.com/issues/v2` |
| BIM 360 Cost | `https://developer.api.autodesk.com/cost/v1` |
| BIM 360 Assets | `https://developer.api.autodesk.com/bim360/assets/v2` |
| BIM 360 MC | `https://developer.api.autodesk.com/bim360/modelset/v3` |
| FDX Graph | `https://developer.api.autodesk.com/dataexchange/2023-05/graphql` |
| Viewer CDN | `https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/` |

---

## SDK Matrix

| API | .NET Namespace | TypeScript Class | JS (Browser) |
|-----|---------------|-----------------|--------------|
| Auth | `Autodesk.Authentication` | `AuthenticationClient` | — |
| Data Mgmt | `Autodesk.DataManagement` | `DataManagementClient` | — |
| OSS | `Autodesk.Oss` | `OssClient` | — |
| Model Deriv | `Autodesk.ModelDerivative` | `ModelDerivativeClient` | — |
| Viewer | — | — | `Autodesk.Viewing.*` |
| Design Auto | — (REST only) | — (REST only) | — |
| BIM 360 | — (REST only) | — (REST only) | — |
| FDX Graph | — (GraphQL) | — (GraphQL) | — |

---

## Cross-API Workflow Recipes

### Recipe 1: Upload → Translate → View in Browser
```
[AUTH]   POST /token (2-leg, scope: data:write data:read viewables:read)
[OSS]    POST /oss/v2/buckets (create bucket)
[OSS]    GET  /oss/v2/buckets/:key/objects/:obj/signeds3upload (get upload URL)
[OSS]    PUT  S3 URL (upload binary)
[OSS]    POST /oss/v2/buckets/:key/objects/:obj/signeds3upload (complete)
[MD]     POST /modelderivative/v2/designdata/job (translate to SVF2)
[MD]     GET  /modelderivative/v2/designdata/:urn/manifest (poll until complete)
[VIEWER] Autodesk.Viewing.Document.load('urn:' + base64Urn)
```

### Recipe 2: BIM 360 Project → Extract All Properties
```
[AUTH]   POST /token (3-leg, scope: data:read viewables:read)
[DM]     GET  /project/v1/hubs → pick hub
[DM]     GET  /hubs/:hid/projects → pick project
[DM]     GET  /hubs/:hid/projects/:pid/topFolders → navigate
[DM]     GET  /data/v1/projects/:pid/folders/:fid/contents → find file
[DM]     GET  /data/v1/projects/:pid/items/:iid/tip → get tip version URN
[MD]     POST /modelderivative/v2/designdata/job → translate
[MD]     GET  /designdata/:urn/metadata → get model view GUIDs
[MD]     POST /designdata/:urn/metadata/:guid/properties:query → extract filtered properties
```

### Recipe 3: Automated Revit Processing Pipeline
```
[AUTH]   POST /token (2-leg, scope: code:all data:write data:read)
[OSS]    Upload input .rvt + appbundle .zip
[DA]     POST /appbundles → register plugin
[DA]     POST /appbundles/:id/aliases → alias "prod"
[DA]     POST /activities → define pipeline (engine + plugin + I/O)
[DA]     POST /activities/:id/aliases → alias "prod"
[DA]     POST /workitems → execute with signed input/output URLs
[DA]     GET  /workitems/:id → poll until status = "success"
[OSS]    Download result from output URL
```

### Recipe 4: GraphQL Element Query from BIM 360 Model
```
[AUTH]   POST /token (2-leg, scope: data:read)
[FDX]    POST /dataexchange/2023-05/graphql
         query { hubs { results { id, projects { results { id } } } } }
         → navigate hub → project → folder → exchange
[FDX]    POST /dataexchange/2023-05/graphql
         query { exchange(exchangeId: "...") {
           elements(filter: { query: "property.name.category==Walls" }) {
             results { name, properties { results { name, value } } }
           }
         }}
```

### Recipe 5: Create Issues from Clash Detection
```
[AUTH]   POST /token (3-leg, scope: data:read account:read)
[DM]     Navigate to project → get container IDs
[BIM360] GET  /bim360/modelset/v3/containers/:cid/modelsets/:mid/versions/latest
[BIM360] Query clash results → get clashing element pairs
[BIM360] POST /issues/v2/containers/:cid/issues → create issue for each critical clash
[BIM360] POST /issues/v2/containers/:cid/issues/:iid/attachments → attach clash screenshot
```

---

## Local Documentation Corpus

All raw JSON documentation is stored locally for programmatic access:

```
c:\LECG\Dashboard\
├── DATA MANAGEMENT API\          (764 files)
│   ├── _index.json               ← master index
│   ├── Data Management\          ← REST endpoints by category
│   ├── OSS\                      ← Object Storage endpoints
│   ├── .NET SDK (Data Management)\
│   ├── .NET SDK (OSS)\
│   ├── TypeScript SDK (Data Management)\
│   └── TypeScript SDK (OSS)\
├── AUTHENTICATION API\           (72 files)
├── DESIGN AUTOMATION API\        (114 files)
├── BIM 360 API\                  (394 files)
├── MANUFACTURING DATA MODEL API\ (113 files)
├── MODEL DERIVATIVE API\         (265 files)
├── VIEWER API\                   (160 files)
└── APS_REFERENCE\                ← THIS REFERENCE SUITE
    ├── 00_INDEX.md               ← You are here
    ├── 01_AUTHENTICATION_API.md
    ├── 02_DATA_MANAGEMENT_API.md
    ├── 03_MODEL_DERIVATIVE_API.md
    ├── 04_VIEWER_API.md
    ├── 05_DESIGN_AUTOMATION_API.md
    ├── 06_BIM360_ACC_API.md
    └── 07_MANUFACTURING_DATA_MODEL_API.md
```

Each API folder contains `_index.json` with full endpoint listings for programmatic access.
