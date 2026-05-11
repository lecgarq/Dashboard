# APS Master API Reference Dictionary

> Auto-generated on 2026-05-08 | 1,882 JSON files across 7 APIs

---

## Quick Decision Matrix — "When Do I Use What?"

| I need to… | Use This API | Auth Type |
|---|---|---|
| Get an access token | **Authentication** | N/A |
| List hubs, projects, folders, files | **Data Management** | 2-leg or 3-leg |
| Upload/download files to cloud storage | **Data Management (OSS)** | 2-leg |
| Convert files between CAD formats | **Model Derivative** | 2-leg |
| Prepare a file for online 3D viewing | **Model Derivative** → SVF2 | 2-leg |
| Extract metadata/properties from a model | **Model Derivative** | 2-leg |
| Display a 3D model in the browser | **Viewer** (JS) | 3-leg or 2-leg |
| Run Revit/AutoCAD/Inventor scripts in cloud | **Design Automation** | 2-leg |
| Manage BIM 360 projects, users, companies | **BIM 360** (Account Admin) | 2-leg |
| Manage issues, RFIs, clash tests | **BIM 360** (Issues/MC) | 3-leg |
| Track construction costs & budgets | **BIM 360** (Cost Mgmt) | 3-leg |
| Query BIM element data via GraphQL | **Manufacturing Data Model** | 2-leg |
| Create/query data exchanges (IFC, Revit) | **Manufacturing Data Model** | 2-leg |

---

## 1. Authentication API (OAuth v2)

**Base URL:** `https://developer.api.autodesk.com/authentication/v2`
**Local Docs:** `AUTHENTICATION API/` (72 files)
**SDKs:** .NET (`AuthenticationClient`), TypeScript (`AuthenticationClient`)

### Key Endpoints

| Method | Endpoint | Use When |
|---|---|---|
| `GET` | `/authorize` | Redirect user for 3-legged login |
| `POST` | `/token` | Get 2-leg token (client_credentials) or exchange auth code for 3-leg token |
| `POST` | `/introspect` | Validate/inspect an existing token |
| `POST` | `/revoke` | Revoke a token |
| `GET` | `/keys` | Get JWKS public keys for JWT validation |
| `GET` | `/users/@me` | Get current user profile (3-leg) |
| `GET` | `/.well-known/openid-configuration` | OIDC discovery endpoint |
| `GET` | `/logout` | Log user out |

### Auth Flow Summary

- **2-Legged (Server-to-Server):** `POST /token` with `grant_type=client_credentials` + client_id + client_secret
- **3-Legged (User Context):** Redirect to `/authorize` → user logs in → callback with `code` → `POST /token` with `grant_type=authorization_code`
- **PKCE:** Same as 3-leg but with `code_verifier`/`code_challenge` for public clients

### Scopes

`data:read`, `data:write`, `data:create`, `data:search`, `bucket:create`, `bucket:read`, `bucket:update`, `bucket:delete`, `code:all`, `account:read`, `account:write`, `user:read`, `user:write`, `viewables:read`

---

## 2. Data Management API (v2)

**Base URLs:**
- DM: `https://developer.api.autodesk.com/project/v1` and `/data/v1`
- OSS: `https://developer.api.autodesk.com/oss/v2`

**Local Docs:** `DATA MANAGEMENT API/` (764 files)
**SDKs:** .NET (`DataManagementClient`, `OssClient`), TypeScript (same)

### Hubs & Projects (DM)

| Method | Endpoint | Use When |
|---|---|---|
| `GET` | `/hubs` | List all accessible hubs (BIM360, ACC, Fusion) |
| `GET` | `/hubs/:hub_id` | Get specific hub details |
| `GET` | `/hubs/:hub_id/projects` | List projects within a hub |
| `GET` | `/hubs/:hub_id/projects/:project_id` | Get project details |
| `GET` | `/hubs/:hub_id/projects/:project_id/topFolders` | Get root folders of a project |

### Folders

| Method | Endpoint | Use When |
|---|---|---|
| `GET` | `/projects/:pid/folders/:fid` | Get folder metadata |
| `GET` | `/projects/:pid/folders/:fid/contents` | List items inside a folder |
| `GET` | `/projects/:pid/folders/:fid/search` | Search within folder tree |
| `POST` | `/projects/:pid/folders` | Create a new folder |
| `PATCH` | `/projects/:pid/folders/:fid` | Rename/update folder |

### Items & Versions

| Method | Endpoint | Use When |
|---|---|---|
| `GET` | `/projects/:pid/items/:iid` | Get item (file) metadata |
| `GET` | `/projects/:pid/items/:iid/versions` | List all versions of a file |
| `GET` | `/projects/:pid/items/:iid/tip` | Get latest version |
| `POST` | `/projects/:pid/items` | Create new item |
| `POST` | `/projects/:pid/versions` | Create new version of existing item |

### Object Storage Service (OSS)

| Method | Endpoint | Use When |
|---|---|---|
| `POST` | `/buckets` | Create a storage bucket |
| `GET` | `/buckets` | List your buckets |
| `DELETE` | `/buckets/:key` | Delete a bucket |
| `GET` | `/buckets/:key/objects` | List objects in bucket |
| `PUT` | `/buckets/:key/objects/:obj` | Upload a file (simple) |
| `GET` | `/buckets/:key/objects/:obj/signeds3upload` | Get signed S3 upload URL |
| `POST` | `/buckets/:key/objects/:obj/signeds3upload` | Complete S3 upload |
| `GET` | `/buckets/:key/objects/:obj/signeds3download` | Get signed S3 download URL |

### Commands

| Command | Use When |
|---|---|
| `CheckPermission` | Verify user can perform action on resource |
| `ListRefs` | Get all references for an item |
| `PublishModel` | Trigger translation of a Revit/C4R model |
| `GetPublishModelJob` | Check publish status |

---

## 3. Model Derivative API (v2)

**Base URL:** `https://developer.api.autodesk.com/modelderivative/v2`
**Local Docs:** `MODEL DERIVATIVE API/` (265 files)
**SDKs:** .NET (`ModelDerivativeClient`), TypeScript (`ModelDerivativeClient`)

### Key Endpoints

| Method | Endpoint | Use When |
|---|---|---|
| `GET` | `/designdata/formats` | List all supported input→output format pairs |
| `POST` | `/designdata/job` | **Start a translation** (source → SVF2, OBJ, STL, IFC, DWG, etc.) |
| `POST` | `/designdata/:urn/references` | Specify file references before translation |
| `GET` | `/designdata/:urn/manifest` | **Check translation status** and list derivatives |
| `DELETE` | `/designdata/:urn/manifest` | Delete all derivatives |
| `GET` | `/designdata/:urn/manifest/:derivativeUrn/signedcookies` | Get download URL for derivative |
| `HEAD` | `/designdata/:urn/manifest/:derivativeUrn` | Check derivative size/existence |
| `GET` | `/designdata/:urn/thumbnail` | Get model thumbnail image |
| `GET` | `/designdata/:urn/metadata` | **List model views** (viewables) |
| `GET` | `/designdata/:urn/metadata/:guid` | **Get object tree** (model hierarchy) |
| `GET` | `/designdata/:urn/metadata/:guid/properties` | **Get ALL properties** for all objects |
| `POST` | `/designdata/:urn/metadata/:guid/properties:query` | Get specific properties (filtered) |

### Typical Workflow

```
1. Upload file to OSS → get objectId (URN)
2. Base64-encode the URN
3. POST /job → start translation to SVF2 (for viewing) or OBJ/STL/IFC
4. Poll GET /manifest until status = "complete"
5. Use Viewer to display, or download derivative files
```

### Supported Output Formats

SVF, SVF2, OBJ, STL, STEP, IGES, DWG, IFC, Thumbnail, glTF (via SVF2)

---

## 4. Viewer API (v7)

**CDN:** `https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.min.js`
**Local Docs:** `VIEWER API/` (160 files)
**Type:** Client-side JavaScript library (no REST API)

### Core Classes

| Class | Purpose |
|---|---|
| `Autodesk.Viewing.GuiViewer3D` | Main viewer with default UI (toolbar, panels) |
| `Autodesk.Viewing.Viewer3D` | Headless viewer (no UI) |
| `Autodesk.Viewing.Document` | Load a translated model manifest |
| `Autodesk.Viewing.AggregatedView` | Load multiple models into one scene |
| `Autodesk.Viewing.BubbleNode` | Navigate the model's viewable tree |

### Key Extensions (33 total)

| Extension | Purpose |
|---|---|
| `Autodesk.BimWalk` | First-person walkthrough |
| `Autodesk.Explode` | Exploded view of assemblies |
| `Autodesk.Measure` | Distance/angle measurement |
| `Autodesk.Section` | Cross-section planes |
| `Autodesk.Edit2D` | 2D annotation/drawing overlay |
| `Autodesk.Viewing.MarkupsCore` | Freehand/arrow/text markups |
| `Autodesk.DocumentBrowser` | Switch between sheets/views |
| `Autodesk.Viewing.SceneBuilder` | Add custom geometry |
| `Autodesk.glTF` | Load glTF models |
| `Autodesk.PDF` | Render PDFs in viewer |

### Initialization Pattern

```javascript
const options = { env: 'AutodeskProduction', accessToken: token };
Autodesk.Viewing.Initializer(options, () => {
  const viewer = new Autodesk.Viewing.GuiViewer3D(container);
  viewer.start();
  Autodesk.Viewing.Document.load(documentId, (doc) => {
    const viewable = doc.getRoot().getDefaultGeometry();
    viewer.loadDocumentNode(doc, viewable);
  });
});
```

---

## 5. Design Automation API (v3)

**Base URL:** `https://developer.api.autodesk.com/da/us-east/v3`
**Local Docs:** `DESIGN AUTOMATION API/` (114 files)
**Supported Engines:** AutoCAD, Revit, Inventor, 3ds Max, Fusion

### Core Concepts

- **AppBundle** — Your custom plugin code (ZIP with .dll/.addin)
- **Activity** — Defines what to run: engine + appbundle + I/O parameters
- **WorkItem** — A single execution request: activity + actual input/output URLs

### Key Endpoints

| Method | Endpoint | Use When |
|---|---|---|
| `POST` | `/appbundles` | Register a new plugin |
| `POST` | `/appbundles/:id/versions` | Upload new version of plugin |
| `POST` | `/appbundles/:id/aliases` | Create alias (e.g., "prod") pointing to version |
| `POST` | `/activities` | Define a processing pipeline |
| `POST` | `/activities/:id/versions` | Update activity definition |
| `POST` | `/activities/:id/aliases` | Create alias for activity |
| `POST` | `/workitems` | **Execute a job** |
| `GET` | `/workitems/:id` | Check job status |
| `DELETE` | `/workitems/:id` | Cancel a running job |
| `POST` | `/workitems/batch` | Submit multiple jobs at once |
| `GET` | `/engines` | List available engines |
| `GET` | `/engines/:id` | Get engine details |
| `GET` | `/health/:engine` | Check engine health |
| `GET` | `/forgeapps/:id` | Get/set your app nickname |
| `GET` | `/servicelimits/:owner` | Check your rate limits |

### Typical Workflow

```
1. POST /appbundles → upload your Revit/AutoCAD addin
2. POST /appbundles/:id/aliases → alias "prod" to v1
3. POST /activities → define: engine + appbundle + params
4. POST /activities/:id/aliases → alias "prod"
5. POST /workitems → run with input/output URLs
6. Poll GET /workitems/:id until status = "success"
7. Download results from output URL
```

---

## 6. BIM 360 / ACC API (v1/v2)

**Base URLs:**
- Admin: `/hq/v1` (legacy) or `/construction/admin/v1` (new)
- Issues: `/issues/v2`
- Cost: `/cost/v1`
- Assets: `/bim360/assets/v2`
- Model Coordination: `/bim360/modelset/v3`
- Relationships: `/bim360/relationship/v2`
- Data Connector: `/data-connector/v1`
- Locations: `/bim360/locations/v2`
- Doc Mgmt: `/bim360/docs/v1`

**Local Docs:** `BIM 360 API/` (394 files)

### Account Admin

| Method | Endpoint | Use When |
|---|---|---|
| `POST` | `/accounts/:aid/projects` | Create new project |
| `GET` | `/construction/admin/v1/accounts/:aid/projects` | List projects (new API) |
| `GET` | `/construction/admin/v1/projects/:pid` | Get project details |
| `POST` | `/accounts/:aid/users` | Add user to account |
| `GET` | `/construction/admin/v1/projects/:pid/users` | List project members |
| `POST` | `/accounts/:aid/companies` | Create company |
| `GET` | `/construction/admin/v1/accounts/:aid/companies` | List companies |

### Issues (v2)

| Method | Endpoint | Use When |
|---|---|---|
| `GET` | `/issues/v2/containers/:cid/issues` | List issues |
| `POST` | `/issues/v2/containers/:cid/issues` | Create issue |
| `PATCH` | `/issues/v2/containers/:cid/issues/:iid` | Update issue |
| `GET` | `/issues/v2/containers/:cid/issue-types` | Get issue types |
| `GET` | `/issues/v2/containers/:cid/issue-attribute-definitions` | Get custom attributes |

### Cost Management

| Method | Endpoint | Use When |
|---|---|---|
| `GET` | `/cost/v1/containers/:cid/budgets` | List budgets |
| `POST` | `/cost/v1/containers/:cid/budgets` | Create budget |
| `GET` | `/cost/v1/containers/:cid/contracts` | List contracts |
| `GET` | `/cost/v1/containers/:cid/change-orders/pco` | List PCOs |
| `POST` | `/cost/v1/containers/:cid/change-orders/pco` | Create PCO |

### Model Coordination & Clash

| Method | Endpoint | Use When |
|---|---|---|
| `POST` | `/bim360/modelset/v3/containers/:cid/modelsets` | Create model set |
| `GET` | `/bim360/modelset/v3/containers/:cid/modelsets/:mid/versions/latest` | Get latest version |
| `GET` | Clash test endpoints | Query clash results |

### Document Management

| Method | Endpoint | Use When |
|---|---|---|
| Various DM endpoints | `/bim360/docs/v1/projects/:pid/...` | Custom attributes, permissions, naming schemes |

### Data Connector

| Method | Endpoint | Use When |
|---|---|---|
| `POST` | `/data-connector/v1/accounts/:aid/requests` | Create bulk data extract |
| `GET` | `/data-connector/v1/accounts/:aid/requests` | List requests |
| `GET` | `/data-connector/v1/accounts/:aid/requests/:rid/jobs` | Get job status & download |

---

## 7. Manufacturing Data Model / FDX Graph API

**GraphQL Endpoint:** `https://developer.api.autodesk.com/dataexchange/2023-05/graphql`
**Local Docs:** `MANUFACTURING DATA MODEL API/` (113 files)
**Type:** GraphQL (not REST)

### Key Queries

| Query | Use When |
|---|---|
| `hubs` / `hub` | List/get Autodesk hubs |
| `projects` / `project` | List/get projects in a hub |
| `topFolders` | Get root folders |
| `folder` / `folders` | Navigate folder tree |
| `exchange` | Get a data exchange by ID |
| `exchangeByFileUrn` | Get exchange linked to a specific file |
| `exchangeByVersions` | Get exchanges for specific file versions |
| `getExchangeCreationStatus` | Poll async exchange creation |

### Key Mutations

| Mutation | Use When |
|---|---|
| `createExchange` | Create a new data exchange from a source file with filters |

### Key Objects

`Exchange`, `Element`, `Property`, `PropertyDefinition`, `Folder`, `Project`, `Hub`, `Version`

### Element Filtering

```graphql
query {
  exchange(exchangeId: "...") {
    elements(filter: { query: "property.name.category==Walls" }) {
      results { name, properties { results { name, value } } }
    }
  }
}
```

---

## Cross-API Workflow Recipes

### Recipe 1: Upload → Translate → View

```
AUTH:  POST /token (2-leg, scope: data:write data:read viewables:read)
OSS:   POST /oss/v2/buckets (create bucket)
OSS:   PUT  /oss/v2/buckets/:key/objects/:obj (upload file)
MD:    POST /modelderivative/v2/designdata/job (translate to SVF2)
MD:    GET  /modelderivative/v2/designdata/:urn/manifest (poll status)
VIEWER: Autodesk.Viewing.Document.load('urn:' + urn)
```

### Recipe 2: BIM 360 File → Extract Properties

```
AUTH:  POST /token (3-leg, scope: data:read)
DM:    GET  /hubs → pick hub
DM:    GET  /hubs/:hid/projects → pick project
DM:    GET  /projects/:pid/topFolders → navigate
DM:    GET  /projects/:pid/folders/:fid/contents → find file
DM:    GET  /projects/:pid/items/:iid/tip → get latest version URN
MD:    POST /modelderivative/v2/designdata/job (translate)
MD:    GET  /designdata/:urn/metadata/:guid/properties (extract)
```

### Recipe 3: Automated Revit Processing

```
AUTH:  POST /token (2-leg, scope: code:all data:write data:read)
OSS:   Upload input .rvt and appbundle .zip
DA:    POST /appbundles (register plugin)
DA:    POST /activities (define: Revit engine + plugin + I/O)
DA:    POST /workitems (execute with input/output URLs)
DA:    GET  /workitems/:id (poll until done)
OSS:   Download result from output URL
```

### Recipe 4: Query BIM Element Data (GraphQL)

```
AUTH:  POST /token (2-leg, scope: data:read)
FDX:   POST /dataexchange/2023-05/graphql
       query { hubs { results { id name } } }
       → navigate to exchange
       query { exchange(exchangeId:"...") {
         elements(filter:{query:"..."}) { results { name properties { results { name value } } } }
       }}
```

---

---

## 8. ACC V1 API (Unified Forma)

**Base URL:** `https://developer.api.autodesk.com/acc/v1`
**Scraped Overview:** [Introduction](https://aps.autodesk.com/en/docs/acc/v1/overview/introduction/)
**Type:** Unified Construction Cloud APIs

### Core Capabilities

| API | Purpose |
|---|---|
| **Assets** | Create and manage project assets and equipment. |
| **Cost Management** | Unified API for budgets, contracts, and change orders. |
| **RFIs** | Full lifecycle management of Requests for Information. |
| **Sheets** | Publish and manage field-ready sheets and version sets. |
| **Submittals** | Create and track submittal items and logs. |
| **Takeoff** | Manage takeoff settings, classifications, and quantities. |
| **Model Coordination** | Detect clashes and manage issues in coordination spaces. |
| **Data Connector** | Bulk extraction of project data for hub-wide analytics. |

---

## 9. Audit & Analytics (HOW TO Guides)

Custom documentation generated for programmatic hub auditing and project data extraction.

| Goal | Guide |
|---|---|
| **Bulk Activity Logs** | [Extract Hub-wide Activity Logs](file:///c:/LECG/Dashboard/APS_DOCS/HOW%20TO/HOW_TO_Extract_Activity_Logs.md) |
| **Project Permissions** | [Extract Folder-Role Permission Matrix](file:///c:/LECG/Dashboard/APS_DOCS/HOW%20TO/HOW_TO_Extract_Folder_Role_Permissions.md) |
| **Member Access** | [Extract Project Member Matrix (Products/Roles)](file:///c:/LECG/Dashboard/APS_DOCS/HOW%20TO/HOW_TO_Extract_Project_Members.md) |
| **User Sign-In** | [Extract Last Sign-In Date for Users](file:///c:/LECG/Dashboard/APS_DOCS/HOW%20TO/HOW_TO_Extract_Last_Sign_In.md) |
| **File Activity** | [Extract Last File Activity per User](file:///c:/LECG/Dashboard/APS_DOCS/HOW%20TO/HOW_TO_Extract_Last_User_File_Activity.md) |
| **Project Inventory** | [Extract All Project Info (Type/Hub/Date)](file:///c:/LECG/Dashboard/APS_DOCS/HOW%20TO/HOW_TO_Extract_Project_Info.md) |
| **Role Inventory** | [Extract All Roles from All Projects](file:///c:/LECG/Dashboard/APS_DOCS/HOW%20TO/HOW_TO_Extract_All_Roles.md) |
| **File Inventory** | [Extract All Files, Folders, and Subfolders](file:///c:/LECG/Dashboard/APS_DOCS/HOW%20TO/HOW_TO_Extract_All_Files_and_Folders.md) |
| **New Users Audit** | [Extract Recent User Additions & WHO Added Them](file:///c:/LECG/Dashboard/APS_DOCS/HOW%20TO/HOW_TO_Extract_Recent_User_Additions.md) |

---

## Base URL Reference

| API | Base URL |
|---|---|
| Auth | `https://developer.api.autodesk.com/authentication/v2` |
| Data Mgmt (DM) | `https://developer.api.autodesk.com/project/v1` + `/data/v1` |
| Data Mgmt (OSS) | `https://developer.api.autodesk.com/oss/v2` |
| Model Derivative | `https://developer.api.autodesk.com/modelderivative/v2` |
| Design Automation | `https://developer.api.autodesk.com/da/us-east/v3` |
| BIM 360 Admin | `https://developer.api.autodesk.com/construction/admin/v1` |
| BIM 360 Issues | `https://developer.api.autodesk.com/issues/v2` |
| BIM 360 Cost | `https://developer.api.autodesk.com/cost/v1` |
| BIM 360 Assets | `https://developer.api.autodesk.com/bim360/assets/v2` |
| BIM 360 MC | `https://developer.api.autodesk.com/bim360/modelset/v3` |
| FDX Graph | `https://developer.api.autodesk.com/dataexchange/2023-05/graphql` |
| ACC V1 (Forma) | `https://developer.api.autodesk.com/acc/v1` |
| Viewer JS | CDN: `developer.api.autodesk.com/modelderivative/v2/viewers/7.*/` |

---

## SDK Coverage

| API | .NET Namespace | TypeScript Class |
|---|---|---|
| Auth | `Autodesk.Authentication` | `AuthenticationClient` |
| Data Mgmt | `Autodesk.DataManagement` | `DataManagementClient` |
| OSS | `Autodesk.Oss` | `OssClient` |
| Model Derivative | `Autodesk.ModelDerivative` | `ModelDerivativeClient` |
| Viewer | N/A (JS only) | `Autodesk.Viewing.*` |
| Design Automation | N/A (REST only) | N/A (REST only) |
| BIM 360 | N/A (REST only) | N/A (REST only) |
| FDX Graph | N/A (GraphQL) | N/A (GraphQL) |

---

## Local Documentation Index

| Folder | Files | Content |
|---|---|---|
| `DATA MANAGEMENT API/` | 764 | REST + .NET SDK + TS SDK |
| `AUTHENTICATION API/` | 72 | REST + .NET SDK + TS SDK |
| `DESIGN AUTOMATION API/` | 114 | REST + Tutorials + Engine guides |
| `BIM 360 API/` | 394 | REST + Tutorials (Admin, Issues, Cost, MC) |
| `MANUFACTURING DATA MODEL API/` | 113 | GraphQL schema + Tutorials |
| `MODEL DERIVATIVE API/` | 265 | REST + .NET SDK + TS SDK |
| `VIEWER API/` | 160 | JS SDK Reference + Tutorials |
| `HOW TO/` | 9 | Custom Audit & Extraction Guides |
| **TOTAL** | **1,891** | |

Each folder contains `_index.json` for programmatic navigation.
