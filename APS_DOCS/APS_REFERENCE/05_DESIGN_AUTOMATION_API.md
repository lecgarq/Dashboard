# Design Automation API (v3) — Complete Reference

> Source: `DESIGN AUTOMATION API/` — 114 JSON files
> Official docs: https://aps.autodesk.com/en/docs/design-automation/v3/developers_guide/overview/

---

## Overview

Design Automation lets you **run Revit, AutoCAD, Inventor, 3ds Max, and Fusion scripts/plugins in the cloud** without a desktop license. You upload your plugin code (AppBundle), define a processing pipeline (Activity), and submit execution jobs (WorkItems).

## Base URL

```
https://developer.api.autodesk.com/da/us-east/v3
```

**Auth:** 2-legged token with `code:all data:write data:read`

---

## Core Concepts

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  AppBundle   │────▶│   Activity   │────▶│   WorkItem   │
│ (your code)  │     │ (the recipe) │     │ (a single    │
│ .dll/.addin  │     │ engine +     │     │  execution)  │
│ in a .zip    │     │ appbundle +  │     │ with actual  │
└─────────────┘     │ parameters   │     │ input/output │
                    └──────────────┘     │ URLs         │
                                         └──────────────┘
```

- **Engine** — The Autodesk application runtime (e.g., `Autodesk.Revit+2025`, `Autodesk.AutoCAD+25`)
- **AppBundle** — Your compiled plugin code packaged as a ZIP
- **Activity** — Defines: which engine, which appbundle, what parameters (inputs/outputs)
- **Alias** — A named pointer to a version (e.g., `prod` → v3, `dev` → v4)
- **WorkItem** — A single execution: an activity + actual input/output URLs
- **Nickname** — A friendly name for your Forge app (replaces the long client_id in IDs)

---

## Complete REST API (43 endpoints)

### Nicknames (3 endpoints)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/forgeapps/:id` | Get your app's nickname |
| `PATCH` | `/forgeapps/:id` | **Set your nickname** (do this first!) |
| `DELETE` | `/forgeapps/:id` | Delete nickname |

```http
PATCH /da/us-east/v3/forgeapps/me
{ "nickname": "MyCompanyName" }
```

---

### AppBundles (13 endpoints)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/appbundles` | List all your appbundles |
| `POST` | `/appbundles` | **Register new appbundle** (returns upload URL) |
| `GET` | `/appbundles/:id` | Get appbundle details |
| `DELETE` | `/appbundles/:id` | Delete appbundle (all versions) |
| `GET` | `/appbundles/:id/versions` | List versions |
| `POST` | `/appbundles/:id/versions` | **Upload new version** (returns upload URL) |
| `GET` | `/appbundles/:id/versions/:ver` | Get specific version |
| `DELETE` | `/appbundles/:id/versions/:ver` | Delete version |
| `GET` | `/appbundles/:id/aliases` | List aliases |
| `POST` | `/appbundles/:id/aliases` | **Create alias** (e.g., "prod" → v1) |
| `GET` | `/appbundles/:id/aliases/:alias` | Get alias details |
| `PATCH` | `/appbundles/:id/aliases/:alias` | **Update alias** (point to new version) |
| `DELETE` | `/appbundles/:id/aliases/:alias` | Delete alias |

#### Creating an AppBundle

```http
POST /da/us-east/v3/appbundles
{
  "id": "MyRevitPlugin",
  "engine": "Autodesk.Revit+2025",
  "description": "Extracts room data from Revit models"
}
```
Response includes `uploadParameters` — use those to PUT your ZIP file to the S3 URL.

---

### Activities (13 endpoints)

Same CRUD pattern as AppBundles:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/activities` | List all activities |
| `POST` | `/activities` | **Create activity** |
| `GET` | `/activities/:id` | Get activity details |
| `DELETE` | `/activities/:id` | Delete activity |
| `GET` | `/activities/:id/versions` | List versions |
| `POST` | `/activities/:id/versions` | Create new version |
| `GET` | `/activities/:id/versions/:ver` | Get version |
| `DELETE` | `/activities/:id/versions/:ver` | Delete version |
| `GET` | `/activities/:id/aliases` | List aliases |
| `POST` | `/activities/:id/aliases` | Create alias |
| `GET` | `/activities/:id/aliases/:alias` | Get alias |
| `PATCH` | `/activities/:id/aliases/:alias` | Update alias |
| `DELETE` | `/activities/:id/aliases/:alias` | Delete alias |

#### Creating an Activity

```http
POST /da/us-east/v3/activities
{
  "id": "ExtractRoomData",
  "commandLine": ["$(engine.path)\\revitcoreconsole.exe /i \"$(args[inputFile].path)\" /al \"$(appbundles[MyRevitPlugin].path)\""],
  "engine": "Autodesk.Revit+2025",
  "appbundles": ["MyNickname.MyRevitPlugin+prod"],
  "parameters": {
    "inputFile": {
      "verb": "get",
      "description": "Input Revit file",
      "localName": "input.rvt"
    },
    "outputFile": {
      "verb": "put",
      "description": "Output JSON",
      "localName": "result.json"
    }
  }
}
```

---

### WorkItems (8 endpoints)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/workitems` | **Submit a job** |
| `GET` | `/workitems/:id` | **Check job status** |
| `DELETE` | `/workitems/:id` | Cancel a running job |
| `POST` | `/workitems/batch` | Submit multiple jobs at once |
| `GET` | `/workitems?startAfterTime=:epoch` | List workitems by time |
| `POST` | `/workitems/status` | Batch status check |
| `POST` | `/workitems/combine` | Combine multiple workitems |

#### Submitting a WorkItem

```http
POST /da/us-east/v3/workitems
{
  "activityId": "MyNickname.ExtractRoomData+prod",
  "arguments": {
    "inputFile": {
      "url": "https://developer.api.autodesk.com/oss/v2/signedresources/...",
      "headers": { "Authorization": "Bearer TOKEN" }
    },
    "outputFile": {
      "verb": "put",
      "url": "https://developer.api.autodesk.com/oss/v2/signedresources/...",
      "headers": { "Authorization": "Bearer TOKEN" }
    }
  }
}
```

#### WorkItem Status Response
```json
{
  "status": "success",   // "pending", "inprogress", "success", "failedLimitProcessingTime", "failedDownload", "failedInstructions"
  "reportUrl": "https://...",  // detailed execution log
  "stats": {
    "timeQueued": "2024-01-01T00:00:00Z",
    "timeDownloadStarted": "...",
    "timeInstructionsStarted": "...",
    "timeUploadEnded": "...",
    "bytesDownloaded": 12345,
    "bytesUploaded": 6789
  }
}
```

---

### Engines & Health (3 endpoints)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/engines` | List all available engines |
| `GET` | `/engines/:id` | Get engine details |
| `GET` | `/health/:engine` | Check if engine is healthy |

**Available Engines:**
- `Autodesk.Revit+2025`, `+2024`, `+2023`, `+2022`
- `Autodesk.AutoCAD+25`, `+24`, `+23`
- `Autodesk.Inventor+2025`, `+2024`
- `Autodesk.3dsMax+2025`, `+2024`

---

### Service Limits (3 endpoints)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/servicelimits/:owner` | Get current limits |
| `PUT` | `/servicelimits/:owner` | Update limits |
| `DELETE` | `/servicelimits/:owner` | Reset limits |
| `GET` | `/shares` | List shared resources |

---

## Engine-Specific Notes

### Revit
- Use `revitcoreconsole.exe` in command line
- Support for handling Revit failures via `FailureProcessor`
- Custom fonts support via appbundle
- Cloud model integration available (open cloud workshared models)

### AutoCAD
- Use `accoreconsole.exe` in command line
- MaxScript and LISP support
- Command line: `$(engine.path)\\accoreconsole.exe /i "$(args[inputFile].path)" /s "$(args[inputScript].path)"`

### Inventor
- iLogic logging support
- Assembly processing with references

### Fusion
- TypeScript-based scripts
- Fusion Team integration for reading/writing cloud files

---

## Callbacks & WebSockets

Instead of polling for status, you can receive notifications:

### HTTP Callback
```json
{
  "activityId": "MyNickname.MyActivity+prod",
  "arguments": {
    "onComplete": {
      "verb": "post",
      "url": "https://myserver.com/callback"
    }
  }
}
```

### WebSocket
Connect to `wss://websockets.forgedesignautomation.io` for real-time status updates when callbacks aren't possible (e.g., client-side apps).
