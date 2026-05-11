# Manufacturing Data Model / FDX Graph API — Complete Reference

> Source: `MANUFACTURING DATA MODEL API/` — 113 JSON files
> Official docs: https://aps.autodesk.com/en/docs/fdxgraph/v1/developers_guide/overview/

---

## Overview

The Manufacturing Data Model API (also called FDX Graph or Data Exchange GraphQL) provides a **GraphQL interface** for querying BIM element-level data from data exchanges. Unlike REST APIs that return file-level data, this API lets you query individual building elements, their properties, categories, and relationships — directly from Revit/IFC models stored in ACC/BIM 360.

## GraphQL Endpoint

```
POST https://developer.api.autodesk.com/dataexchange/2023-05/graphql
Authorization: Bearer TOKEN
Content-Type: application/json
```

**Auth:** 2-legged token with `data:read`

---

## Schema Overview

### Queries (12)

| Query | Purpose |
|-------|---------|
| `hubs` | List all accessible hubs |
| `hub(hubId)` | Get specific hub |
| `projects(hubId)` | List projects in a hub |
| `project(hubId, projectId)` | Get specific project |
| `topFolders(hubId, projectId)` | Get root folders |
| `folder(projectId, folderId)` | Get folder details |
| `folders(projectId, folderId)` | List subfolders |
| `exchange(exchangeId)` | **Get a data exchange** with elements & properties |
| `exchangeByFileUrn(fileUrn)` | Get exchange by file URN |
| `exchangeByVersions(...)` | Get exchange by file version |
| `getExchangeCreationStatus(id)` | Poll async exchange creation |

### Mutations (1)

| Mutation | Purpose |
|---------|---------|
| `createExchange(input)` | **Create a new data exchange** from a source file with filters |

### Key Object Types (39)

| Object | Purpose |
|--------|---------|
| `Hub` | Autodesk hub (account) |
| `Project` | Project within a hub |
| `Folder` / `Folders` | Folder containers |
| `Exchange` | A data exchange — the core entity |
| `ExchangeVersion` | Versioned snapshot of an exchange |
| `Element` / `Elements` | BIM elements (walls, doors, rooms, etc.) |
| `Property` / `Properties` | Element properties (dimensions, materials, etc.) |
| `PropertyDefinition` | Schema of a property (name, type, units) |
| `ReferenceProperty` | Linked properties (e.g., type properties) |
| `Item` / `Version` | File items and versions |
| `User` | User information |
| `Units` | Unit system information |

### Input Types (13)

| Input | Purpose |
|-------|---------|
| `CreateExchangeInput` | Input for `createExchange` mutation |
| `ElementFilterInput` | Filter elements by category, property values |
| `ExchangeFilterInput` | Filter exchanges |
| `PropertyfilterInput` | Filter properties by name/value |
| `PaginationInput` | Offset/limit for pagination |
| `HubFilterInput` | Filter hubs |
| `ProjectFilterInput` | Filter projects |
| `FolderFilterInput` | Filter folders |
| `ExchangeSourceInput` | Source file for exchange creation |
| `ExchangeTargetInput` | Target location for exchange |

### Enums

| Enum | Values |
|------|--------|
| `ExchangeStatus` | `PROCESSING`, `COMPLETED`, `FAILED` |
| `Region` | `US`, `EMEA` |

---

## Common Query Patterns

### Navigate to Exchanges

```graphql
query {
  hubs {
    results {
      id
      name
      projects {
        results {
          id
          name
          topFolders {
            results {
              id
              name
              exchanges {
                results {
                  id
                  name
                  createdOn
                  lastModifiedOn
                }
              }
            }
          }
        }
      }
    }
  }
}
```

### Get Exchange Elements

```graphql
query {
  exchange(exchangeId: "urn:adsk.exchange:...") {
    id
    name
    version { number }
    elements(pagination: { limit: 100, offset: 0 }) {
      pagination { cursor totalResults }
      results {
        id
        name
        properties(pagination: { limit: 50 }) {
          results {
            name
            value
            definition {
              name
              units { name }
            }
          }
        }
      }
    }
  }
}
```

### Filter Elements by Category

```graphql
query {
  exchange(exchangeId: "urn:adsk.exchange:...") {
    elements(
      filter: { query: "property.name.category==Walls" }
      pagination: { limit: 50 }
    ) {
      results {
        name
        properties(
          filter: { names: ["Width", "Height", "Area", "Volume"] }
        ) {
          results { name value }
        }
      }
    }
  }
}
```

### Filter by Property Value

```graphql
query {
  exchange(exchangeId: "urn:adsk.exchange:...") {
    elements(
      filter: {
        query: "property.name.category==Doors AND property.name.Width>0.9"
      }
    ) {
      results { name properties { results { name value } } }
    }
  }
}
```

### Get Reference Properties (Type Properties)

```graphql
query {
  exchange(exchangeId: "urn:adsk.exchange:...") {
    elements(filter: { query: "property.name.category==Walls" }) {
      results {
        name
        properties { results { name value } }
        referenceProperties {
          results {
            name
            properties { results { name value } }
          }
        }
      }
    }
  }
}
```

---

## Creating Exchanges

### Create from Revit File (AEC Data Model filters)

```graphql
mutation {
  createExchange(input: {
    source: {
      fileVersionUrn: "urn:adsk.wipprod:fs.file:vf.abc123?version=1"
    }
    target: {
      hubId: "b.hub-id"
      projectId: "b.project-id"
      folderId: "urn:adsk.wipprod:fs.folder:..."
    }
    name: "Structural Walls Export"
    filters: {
      categories: ["Walls"]
      views: ["3D View: {3D}"]
    }
  }) {
    exchangeId
    status
  }
}
```

### Create from IFC File

```graphql
mutation {
  createExchange(input: {
    source: { fileVersionUrn: "urn:..." }
    target: { hubId: "...", projectId: "...", folderId: "..." }
    name: "IFC Windows Export"
    filters: {
      ifcCategories: ["IfcWindow"]
    }
  }) {
    exchangeId
    status
  }
}
```

### Poll Creation Status

```graphql
query {
  getExchangeCreationStatus(exchangeId: "urn:adsk.exchange:...") {
    status     # PROCESSING, COMPLETED, FAILED
    progress   # percentage
  }
}
```

---

## IFC-Specific Queries

```graphql
# Get all IfcWall elements
query {
  exchange(exchangeId: "...") {
    elements(filter: { query: "property.name.category==IfcWall" }) {
      results {
        name
        properties { results { name value } }
      }
    }
  }
}

# Get fixed windows of a specific type
query {
  exchange(exchangeId: "...") {
    elements(filter: {
      query: "property.name.category==IfcWindow AND property.name.OperationType==FIXED"
    }) {
      results { name properties { results { name value } } }
    }
  }
}
```
