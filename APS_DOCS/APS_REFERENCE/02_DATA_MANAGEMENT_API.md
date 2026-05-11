# Data Management API (v2) — Complete Reference

> Source: `DATA MANAGEMENT API/` — 764 JSON files
> Official docs: https://aps.autodesk.com/en/docs/data/v2/reference/http/

---

## Overview

The Data Management API is the **file system of APS**. It provides access to the hierarchical structure of Hubs → Projects → Folders → Items → Versions that organizes all files in Autodesk cloud products (BIM 360, ACC, Fusion). It also includes the Object Storage Service (OSS) for direct binary file storage.

## Base URLs

| Service | Base URL |
|---------|----------|
| Hubs/Projects | `https://developer.api.autodesk.com/project/v1` |
| Folders/Items/Versions | `https://developer.api.autodesk.com/data/v1` |
| OSS (Buckets/Objects) | `https://developer.api.autodesk.com/oss/v2` |

---

## Data Hierarchy

```
Hub (BIM 360 Account / Fusion Team)
 └── Project
      └── Top Folders (Plans, Project Files, etc.)
           └── Subfolder
                └── Item (a file lineage)
                     └── Version 1 (the actual file revision)
                     └── Version 2
                     └── Version N (tip = latest)
```

**Key concept:** An "Item" is the **lineage** (the file across all its versions). A "Version" is a **specific revision** of that Item. The "tip" is always the latest version.

---

## Hubs (2 endpoints)

| # | Method | Endpoint | Purpose | Auth |
|---|--------|----------|---------|------|
| 1 | `GET` | `/project/v1/hubs` | List all hubs accessible to the token | 3-leg |
| 2 | `GET` | `/project/v1/hubs/:hub_id` | Get a specific hub | 3-leg |

**Hub types:**
- `b.` prefix → BIM 360 / ACC
- `a.` prefix → Fusion Team / A360

```json
// GET /hubs response
{
  "data": [{
    "type": "hubs",
    "id": "b.12345-abcd-...",
    "attributes": {
      "name": "LECG Company Hub",
      "extension": { "type": "hubs:autodesk.bim360:Account" }
    }
  }]
}
```

---

## Projects (9 endpoints)

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 1 | `GET` | `/project/v1/hubs/:hub_id/projects` | List all projects in a hub |
| 2 | `GET` | `/project/v1/hubs/:hub_id/projects/:project_id` | Get project details |
| 3 | `GET` | `/project/v1/hubs/:hub_id/projects/:project_id/hub` | Get the parent hub |
| 4 | `GET` | `/project/v1/hubs/:hub_id/projects/:project_id/topFolders` | **Get root folders** |
| 5 | `GET` | `/data/v1/projects/:project_id/downloads/:download_id` | Get download job status |
| 6 | `GET` | `/data/v1/projects/:project_id/jobs/:job_id` | Get job status |
| 7 | `POST` | `/data/v1/projects/:project_id/downloads` | Create download for a version |
| 8 | `POST` | `/data/v1/projects/:project_id/storage` | **Create storage location** (before upload) |
| 9 | `GET` | `/data/v1/projects/:project_id/versions/:ver_id/downloads` | List download formats for a version |

**Critical:** `topFolders` is the entry point into the file tree. BIM 360 projects typically return folders like "Plans", "Project Files", "Submittals".

### Creating Storage for Upload

Before uploading to a BIM 360/ACC project, you must create a storage location:
```http
POST /data/v1/projects/:project_id/storage
{
  "jsonapi": { "version": "1.0" },
  "data": {
    "type": "objects",
    "attributes": { "name": "myfile.rvt" },
    "relationships": {
      "target": {
        "data": { "type": "folders", "id": "urn:adsk.wipprod:fs.folder:..." }
      }
    }
  }
}
```

---

## Folders (10 endpoints)

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 1 | `GET` | `/projects/:pid/folders/:fid` | Get folder metadata |
| 2 | `GET` | `/projects/:pid/folders/:fid/contents` | **List folder contents** (items + subfolders) |
| 3 | `GET` | `/projects/:pid/folders/:fid/parent` | Get parent folder |
| 4 | `GET` | `/projects/:pid/folders/:fid/refs` | Get folder references |
| 5 | `GET` | `/projects/:pid/folders/:fid/relationships/links` | Get related links |
| 6 | `GET` | `/projects/:pid/folders/:fid/relationships/refs` | Get related refs |
| 7 | `GET` | `/projects/:pid/folders/:fid/search` | **Search within folder tree** |
| 8 | `POST` | `/projects/:pid/folders` | **Create subfolder** |
| 9 | `POST` | `/projects/:pid/folders/:fid/relationships/refs` | Add reference |
| 10 | `PATCH` | `/projects/:pid/folders/:fid` | **Rename/update folder** |

### Folder Contents Response
```json
{
  "data": [
    { "type": "folders", "id": "urn:adsk.wipprod:fs.folder:...", "attributes": { "name": "Structural" } },
    { "type": "items", "id": "urn:adsk.wipprod:dm.lineage:...", "attributes": { "displayName": "model.rvt" } }
  ]
}
```

### Folder Search
```http
GET /data/v1/projects/:pid/folders/:fid/search?filter[extension.type]=items:autodesk.bim360:File&filter[attributes.name]=*.rvt
```

---

## Items (11 endpoints)

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 1 | `GET` | `/projects/:pid/items/:iid` | Get item metadata |
| 2 | `GET` | `/projects/:pid/items/:iid/parent` | Get parent folder |
| 3 | `GET` | `/projects/:pid/items/:iid/refs` | Get item references |
| 4 | `GET` | `/projects/:pid/items/:iid/relationships/links` | Get related links |
| 5 | `GET` | `/projects/:pid/items/:iid/relationships/refs` | Get related refs |
| 6 | `GET` | `/projects/:pid/items/:iid/tip` | **Get latest version (tip)** |
| 7 | `GET` | `/projects/:pid/items/:iid/versions` | **List all versions** |
| 8 | `POST` | `/projects/:pid/items` | **Create new item** (first version of a file) |
| 9 | `POST` | `/projects/:pid/items/:iid/relationships/refs` | Add reference |
| 10 | `PATCH` | `/projects/:pid/items/:iid` | Update item metadata |
| 11 | — | `ListItems` (command) | List items with filtering |

---

## Versions (9 endpoints)

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 1 | `GET` | `/projects/:pid/versions/:vid` | Get version details |
| 2 | `GET` | `/projects/:pid/versions/:vid/downloadFormats` | List available download formats |
| 3 | `GET` | `/projects/:pid/versions/:vid/item` | Get parent item |
| 4 | `GET` | `/projects/:pid/versions/:vid/refs` | Get version references |
| 5 | `GET` | `/projects/:pid/versions/:vid/relationships/links` | Get related links |
| 6 | `GET` | `/projects/:pid/versions/:vid/relationships/refs` | Get related refs |
| 7 | `POST` | `/projects/:pid/versions` | **Create new version** (upload new revision) |
| 8 | `POST` | `/projects/:pid/versions/:vid/relationships/refs` | Add reference |
| 9 | `PATCH` | `/projects/:pid/versions/:vid` | Update version metadata |

### Getting the file URN for Model Derivative

The version's `data.id` (e.g., `urn:adsk.wipprod:fs.file:vf.abc123?version=1`) is what you base64-encode to use as the URN in Model Derivative calls.

---

## Commands (5 endpoints)

Commands are POST operations to `/data/v1/projects/:pid/commands`:

| Command | Purpose |
|---------|---------|
| `CheckPermission` | Check if current user can perform a specific action on an item |
| `ListRefs` | Get all references (xrefs, links) for an item |
| `ListItems` | List items with advanced filtering |
| `PublishModel` | Trigger C4R (Collaboration for Revit) model publish |
| `GetPublishModelJob` | Check the status of a publish job |

---

## Object Storage Service — OSS (19 endpoints)

### Buckets (5 endpoints)

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 1 | `GET` | `/oss/v2/buckets` | List all buckets |
| 2 | `POST` | `/oss/v2/buckets` | **Create a bucket** |
| 3 | `GET` | `/oss/v2/buckets/:key/details` | Get bucket details |
| 4 | `DELETE` | `/oss/v2/buckets/:key` | Delete a bucket |
| 5 | `POST` | `/oss/v2/buckets/:key/protect` | Protect bucket from deletion |

**Bucket policies:**
- `transient` — deleted after 24 hours
- `temporary` — deleted after 30 days
- `persistent` — kept until explicitly deleted

```http
POST /oss/v2/buckets
{ "bucketKey": "my-unique-bucket-name", "policyKey": "persistent" }
```

### Objects — Upload (7 endpoints)

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 1 | `PUT` | `/buckets/:key/objects/:obj` | **Simple upload** (< 100MB) |
| 2 | `PUT` | `/buckets/:key/objects/:obj/resumable` | Resumable upload (large files) |
| 3 | `GET` | `/buckets/:key/objects/:obj/status/:sessionId` | Check resumable upload status |
| 4 | `GET` | `/buckets/:key/objects/:obj/signeds3upload` | **Get signed S3 upload URL** (recommended) |
| 5 | `POST` | `/buckets/:key/objects/:obj/signeds3upload` | **Complete S3 upload** |
| 6 | `POST` | `/buckets/:key/objects/batchsigneds3upload` | Batch S3 upload URLs |
| 7 | `POST` | `/buckets/:key/objects/batchcompleteupload` | Batch complete uploads |

### Objects — Download (4 endpoints)

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 1 | `GET` | `/buckets/:key/objects/:obj` | **Direct download** |
| 2 | `GET` | `/buckets/:key/objects/:obj/signeds3download` | **Get signed S3 download URL** |
| 3 | `POST` | `/buckets/:key/objects/batchsigneds3download` | Batch download URLs |
| 4 | `GET` | `/signedresources/:id` | Download via signed URL |

### Objects — Management (5 endpoints)

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 1 | `GET` | `/buckets/:key/objects` | List objects in bucket |
| 2 | `GET` | `/buckets/:key/objects/:obj/details` | Get object metadata (size, hash, etc.) |
| 3 | `PUT` | `/buckets/:key/objects/:obj/copyto/:newobj` | Copy an object |
| 4 | `DELETE` | `/buckets/:key/objects/:obj` | Delete an object |
| 5 | `POST` | `/buckets/:key/objects/:obj/signed` | Generate signed OSS URL |

### Recommended Upload Pattern (S3 Signed)

```
1. GET  /oss/v2/buckets/:key/objects/:objectKey/signeds3upload?parts=1
   → returns { uploadKey, urls: ["https://s3.amazonaws.com/..."] }

2. PUT  https://s3.amazonaws.com/... (upload binary to S3 directly)
   → returns ETag header

3. POST /oss/v2/buckets/:key/objects/:objectKey/signeds3upload
   { "uploadKey": "...", "size": 12345, "eTags": ["etag-from-step-2"] }
   → finalizes upload, returns objectId (URN)
```

---

## SDK Reference

### .NET SDK — Data Management

**Namespace:** `Autodesk.DataManagement` (304 classes)

| Key Class | Purpose |
|-----------|---------|
| `DataManagementClient` | Hubs, Projects, Folders, Items, Versions CRUD |

**Namespace:** `Autodesk.Oss` (43 classes)

| Key Class | Purpose |
|-----------|---------|
| `OssClient` | Bucket & Object operations, S3 signed URLs |

### TypeScript SDK — Data Management

| Key Class | Purpose |
|-----------|---------|
| `DataManagementClient` | Full DM operations (295 interfaces) |
| `OssClient` | Full OSS operations (36 interfaces) |

---

## Common Workflow: Navigate to a File

```javascript
// 1. List hubs
const hubs = await GET('/project/v1/hubs');
const hubId = hubs.data[0].id; // "b.xxx"

// 2. List projects
const projects = await GET(`/project/v1/hubs/${hubId}/projects`);
const projectId = projects.data[0].id; // "b.yyy"

// 3. Get top folders
const folders = await GET(`/project/v1/hubs/${hubId}/projects/${projectId}/topFolders`);
const folderId = folders.data.find(f => f.attributes.name === 'Project Files').id;

// 4. List folder contents
const contents = await GET(`/data/v1/projects/${projectId}/folders/${folderId}/contents`);
const item = contents.data.find(i => i.attributes.displayName === 'model.rvt');

// 5. Get latest version (tip)
const tip = await GET(`/data/v1/projects/${projectId}/items/${item.id}/tip`);
const fileUrn = btoa(tip.data.id); // base64 encode for Model Derivative
```
