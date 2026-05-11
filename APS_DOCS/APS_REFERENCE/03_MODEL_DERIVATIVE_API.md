# Model Derivative API (v2) — Complete Reference

> Source: `MODEL DERIVATIVE API/` — 265 JSON files
> Official docs: https://aps.autodesk.com/en/docs/model-derivative/v2/developers_guide/overview/

---

## Overview

The Model Derivative API is the **translation engine** of APS. It converts 70+ CAD/BIM file formats into viewable derivatives (SVF2 for the Viewer), extracts metadata and properties, generates thumbnails, and translates between formats (RVT→IFC, DWG→OBJ, etc.).

## Base URL

```
https://developer.api.autodesk.com/modelderivative/v2
```

**Auth:** 2-legged token with `data:read data:write viewables:read`

---

## Core Concepts

- **URN** — A base64-safe-encoded object ID from OSS or Data Management. Every API call uses this.
- **Manifest** — A JSON document describing all derivatives (translations) of a source file
- **Derivative** — An output file generated from the source (SVF2, OBJ, thumbnail, etc.)
- **Model View (GUID)** — A viewable within the translated model (e.g., 3D view, 2D sheet)
- **Object Tree** — The hierarchical breakdown of model elements
- **Properties** — Key-value metadata attached to each element in the model

---

## Complete REST API (13 endpoints)

### Translation Jobs

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 1 | `GET` | `/designdata/formats` | **List all supported input→output format pairs** |
| 2 | `POST` | `/designdata/job` | **Start a translation job** |
| 3 | `POST` | `/designdata/:urn/references` | Specify file references (xrefs) before translating assemblies |

#### POST /designdata/job — Start Translation

```http
POST /modelderivative/v2/designdata/job
Authorization: Bearer TOKEN
Content-Type: application/json
x-ads-force: true

{
  "input": {
    "urn": "BASE64_ENCODED_URN",
    "compressedUrn": false
  },
  "output": {
    "destination": { "region": "us" },
    "formats": [
      {
        "type": "svf2",
        "views": ["2d", "3d"],
        "advanced": {
          "generateMasterViews": true
        }
      }
    ]
  }
}
```

**Supported output types:** `svf`, `svf2`, `obj`, `stl`, `step`, `iges`, `dwg`, `ifc`, `thumbnail`

**Advanced options per format:**
- **SVF2/SVF:** `generateMasterViews`, `extractorVersion` (for Revit: room/space info)
- **OBJ:** `unit`, `modelGuid`, `objectIds` (extract specific objects)
- **STL:** `format` (ascii/binary), `exportColor`
- **IFC:** `conversionMethod` (v2/v3)
- **DWG:** `sheetType`, `exportFileStructure`

---

### Manifest (Tracking & Cleanup)

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 4 | `GET` | `/designdata/:urn/manifest` | **Check translation status** & list all derivatives |
| 5 | `DELETE` | `/designdata/:urn/manifest` | Delete all derivatives (cleanup) |

#### Manifest Response Structure
```json
{
  "type": "manifest",
  "hasThumbnail": "true",
  "status": "success",     // "pending", "inprogress", "success", "failed", "timeout"
  "progress": "complete",
  "region": "US",
  "urn": "dXJuOm...",
  "derivatives": [
    {
      "name": "model.rvt",
      "hasThumbnail": "true",
      "status": "success",
      "outputType": "svf2",
      "children": [
        {
          "guid": "6bfb4886-...",
          "type": "geometry",
          "role": "3d",
          "name": "{3D}",
          "status": "success"
        },
        {
          "guid": "a1b2c3d4-...",
          "type": "geometry",
          "role": "2d",
          "name": "Level 1 - Floor Plan"
        }
      ]
    }
  ]
}
```

**Polling pattern:**
```javascript
async function waitForTranslation(urn) {
  while (true) {
    const manifest = await GET(`/modelderivative/v2/designdata/${urn}/manifest`);
    if (manifest.status === 'success') return manifest;
    if (manifest.status === 'failed') throw new Error(manifest.derivatives[0].messages);
    await sleep(5000); // poll every 5 seconds
  }
}
```

---

### Derivative Download

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 6 | `GET` | `/designdata/:urn/manifest/:derivativeUrn/signedcookies` | **Get download URL** for a derivative |
| 7 | `HEAD` | `/designdata/:urn/manifest/:derivativeUrn` | Check derivative file size and headers |
| 8 | `GET` | `/designdata/:urn/manifest/:derivativeUrn` | Download derivative (deprecated — use signedcookies) |

---

### Thumbnails

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 9 | `GET` | `/designdata/:urn/thumbnail` | Get a thumbnail image of the model |

Query params: `width` (100, 200, 400), `height` (100, 200, 400)

---

### Metadata & Properties (the power endpoints)

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 10 | `GET` | `/designdata/:urn/metadata` | **List all model views** (viewables with GUIDs) |
| 11 | `GET` | `/designdata/:urn/metadata/:guid` | **Get object tree** (full model hierarchy) |
| 12 | `GET` | `/designdata/:urn/metadata/:guid/properties` | **Get ALL properties** for every object |
| 13 | `POST` | `/designdata/:urn/metadata/:guid/properties:query` | **Query specific properties** (filtered, paginated) |

#### GET /metadata — List Model Views
Returns all viewable GUIDs. You need a GUID to query the object tree or properties.
```json
{
  "data": {
    "metadata": [
      { "name": "{3D}", "guid": "6bfb4886-...", "role": "3d" },
      { "name": "Level 1 - Floor Plan", "guid": "a1b2c3d4-...", "role": "2d" }
    ]
  }
}
```

#### POST /properties:query — Filtered Property Query
This is the **most powerful endpoint** for extracting BIM data:
```http
POST /modelderivative/v2/designdata/:urn/metadata/:guid/properties:query
{
  "query": {
    "$contains": ["properties.Category", "Walls"]
  },
  "fields": ["objectid", "name", "properties.Dimensions"],
  "pagination": { "offset": 0, "limit": 50 }
}
```

**Filter operators:** `$eq`, `$ne`, `$gt`, `$lt`, `$ge`, `$le`, `$in`, `$nin`, `$contains`, `$between`, `$prefix`

---

## Supported Format Translations

| Input | → Output |
|-------|----------|
| RVT, RFA | SVF2, OBJ, IFC, DWG, STL, Thumbnail |
| DWG, DXF | SVF2, OBJ, STL, Thumbnail |
| NWD, NWC | SVF2, Thumbnail |
| IFC | SVF2, OBJ, STL, Thumbnail |
| STEP, IGES | SVF2, OBJ, STL, Thumbnail |
| F3D (Fusion) | SVF2, OBJ, STL, STEP, IGES, Thumbnail |
| IPT, IAM (Inventor) | SVF2, OBJ, STL, STEP, IGES, Thumbnail |
| SLDPRT, SLDASM | SVF2, OBJ, STL, Thumbnail |
| 3DM (Rhino) | SVF2, OBJ, STL, Thumbnail |
| SKP (SketchUp) | SVF2, Thumbnail |
| CATIA, JT, PRT | SVF2, OBJ, STL, Thumbnail |

---

## SDK Reference

### .NET SDK (`Autodesk.ModelDerivative`)

| Key Class | Purpose |
|-----------|---------|
| `ModelDerivativeClient` | All 13 endpoints: `StartJobAsync()`, `GetManifestAsync()`, `GetMetadataAsync()`, `GetPropertiesAsync()` |
| `JobPayload` | Translation job request model |
| `JobPayloadFormatSVF2` | SVF2 output config |
| `Manifest` | Manifest response model |
| `Properties` | Properties response model |
| `SpecificPropertiesPayload` | Filter query model |

### TypeScript SDK (`ModelDerivativeClient`)

Same methods as .NET: `startJob()`, `getManifest()`, `getMetadata()`, `getProperties()`, `getSpecificProperties()`

---

## Rate Limits

- **Job creation:** 20 concurrent jobs, 500 jobs/day (free tier)
- **Manifest/metadata queries:** 14,400 requests/day
- **File size:** Up to 500 MB per source file (varies by format)
