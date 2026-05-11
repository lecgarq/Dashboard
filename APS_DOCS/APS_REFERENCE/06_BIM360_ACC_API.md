# BIM 360 / ACC API (v1/v2) — Complete Reference

> Source: `BIM 360 API/` — 394 JSON files
> Official docs: https://aps.autodesk.com/en/docs/bim360/v1/reference/http/

---

## Overview

The BIM 360 / Autodesk Construction Cloud (ACC) API is the **largest APS API suite** covering construction project management: account admin, issues, cost management, assets, model coordination, clash detection, document management, relationships, checklists, RFIs, locations, and data connector.

## Base URLs

| Module | Base URL | Auth |
|--------|----------|------|
| Account Admin (legacy) | `/hq/v1/accounts/:account_id` | 2-leg |
| Account Admin (new) | `/construction/admin/v1` | 2-leg |
| Issues v2 | `/issues/v2/containers/:container_id` | 3-leg |
| Cost Management | `/cost/v1/containers/:container_id` | 3-leg |
| Assets | `/bim360/assets/v2/projects/:project_id` | 3-leg |
| Model Coordination | `/bim360/modelset/v3/containers/:container_id` | 3-leg |
| Relationships | `/bim360/relationship/v2/containers/:container_id` | 3-leg |
| Document Mgmt | `/bim360/docs/v1/projects/:project_id` | 3-leg |
| Data Connector | `/data-connector/v1/accounts/:account_id` | 2-leg |
| Locations | `/bim360/locations/v2/containers/:container_id` | 3-leg |
| Checklists | `/bim360/checklists/v1/containers/:container_id` | 3-leg |
| RFIs | `/bim360/rfis/v1/containers/:container_id` | 3-leg |

---

## Container IDs

Most BIM 360 endpoints require a **container ID** instead of a project ID. To get it:

```http
GET /project/v1/hubs/:hub_id/projects/:project_id
```

In the response, look at `data.relationships.issues.data.id` (for Issues container), `data.relationships.cost.data.id` (for Cost), etc.

---

## Account Admin (288 REST endpoints total in BIM 360)

### Projects

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/hq/v1/accounts/:aid/projects` | Create project |
| `GET` | `/construction/admin/v1/accounts/:aid/projects` | List projects (new, filterable) |
| `GET` | `/hq/v1/accounts/:aid/projects` | List projects (legacy) |
| `GET` | `/construction/admin/v1/projects/:pid` | Get project details (new) |
| `GET` | `/hq/v1/accounts/:aid/projects/:pid` | Get project (legacy) |
| `PATCH` | `/hq/v1/accounts/:aid/projects/:pid` | Update project |
| `PATCH` | `/hq/v1/accounts/:aid/projects/:pid/image` | Update project image |

### Companies

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/hq/v1/accounts/:aid/companies` | Create company |
| `POST` | `/hq/v1/accounts/:aid/companies/import` | Batch import companies |
| `GET` | `/construction/admin/v1/accounts/:aid/companies` | List companies (new) |
| `GET` | `/hq/v1/accounts/:aid/companies` | List companies (legacy) |
| `GET` | `/hq/v1/accounts/:aid/companies/:cid` | Get company |
| `GET` | `/hq/v1/accounts/:aid/companies/search` | Search companies |
| `PATCH` | `/hq/v1/accounts/:aid/companies/:cid` | Update company |

### Users

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/hq/v1/accounts/:aid/users` | Add user to account |
| `POST` | `/hq/v1/accounts/:aid/users/import` | Batch import users |
| `GET` | `/hq/v1/accounts/:aid/users` | List account users |
| `GET` | `/construction/admin/v1/projects/:pid/users` | List project users (new) |
| `GET` | `/hq/v1/accounts/:aid/users/:uid` | Get user |
| `GET` | `/hq/v1/accounts/:aid/users/search` | Search users |
| `PATCH` | `/hq/v1/accounts/:aid/users/:uid` | Update user |
| `POST` | `/construction/admin/v1/projects/:pid/users` | Add users to project (new) |
| `PATCH` | `/construction/admin/v1/projects/:pid/users/:uid` | Update project user (new) |
| `DELETE` | `/construction/admin/v1/projects/:pid/users/:uid` | Remove user from project |

### Business Units, Roles, Industry Roles

Additional endpoints for managing organizational structure within BIM 360.

---

## Issues v2

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/issues/v2/containers/:cid/issues` | **List issues** (with filtering) |
| `GET` | `/issues/v2/containers/:cid/issues/:iid` | Get issue details |
| `POST` | `/issues/v2/containers/:cid/issues` | **Create issue** |
| `PATCH` | `/issues/v2/containers/:cid/issues/:iid` | **Update issue** (status, assignee, etc.) |
| `GET` | `/issues/v2/containers/:cid/issue-types` | Get issue types & subtypes |
| `GET` | `/issues/v2/containers/:cid/issue-attribute-definitions` | Get custom attribute definitions |
| `GET` | `/issues/v2/containers/:cid/issues/:iid/attachments` | List issue attachments |
| `POST` | `/issues/v2/containers/:cid/issues/:iid/attachments` | Attach file to issue |
| `GET` | `/issues/v2/containers/:cid/issues/:iid/comments` | List issue comments |
| `POST` | `/issues/v2/containers/:cid/issues/:iid/comments` | Add comment |

### Issue Filtering
```http
GET /issues/v2/containers/:cid/issues
  ?filter[status]=open,answered
  &filter[issueTypeId]=abc123
  &filter[assignedTo]=user-id
  &filter[dueDate]=2024-01-01..2024-12-31
  &sort=-createdAt
  &limit=50
  &offset=0
```

---

## Cost Management

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET/POST/PATCH` | `/cost/v1/containers/:cid/budgets` | CRUD budgets |
| `GET/POST/PATCH` | `/cost/v1/containers/:cid/contracts` | CRUD contracts |
| `GET/POST/PATCH` | `/cost/v1/containers/:cid/cost-items` | CRUD cost items |
| `GET/POST/PATCH` | `/cost/v1/containers/:cid/change-orders/pco` | Potential change orders |
| `GET/POST/PATCH` | `/cost/v1/containers/:cid/change-orders/rco` | Request for change orders |
| `GET/POST/PATCH` | `/cost/v1/containers/:cid/change-orders/sco` | Submitted change orders |
| `GET` | `/cost/v1/containers/:cid/templates` | Budget code templates |
| `GET` | `/cost/v1/containers/:cid/segments` | Budget segments |
| `GET/POST/PATCH` | `/cost/v1/containers/:cid/expenses` | Expense tracking |
| `GET/POST/PATCH` | `/cost/v1/containers/:cid/payment-items` | Payment items |
| `GET/POST/PATCH` | `/cost/v1/containers/:cid/time-sheets` | Timesheets |

---

## Model Coordination & Clash Detection

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/bim360/modelset/v3/containers/:cid/modelsets` | Create model set |
| `GET` | `/bim360/modelset/v3/containers/:cid/modelsets` | List model sets |
| `GET` | `/bim360/modelset/v3/containers/:cid/modelsets/:mid/versions/latest` | Get latest version |
| `GET` | Clash endpoints | Query clash test results, get clash instances |

---

## Assets

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/bim360/assets/v2/projects/:pid/assets` | List assets |
| `POST` | `/bim360/assets/v2/projects/:pid/assets:batch-create` | Batch create assets |
| `GET` | `/bim360/assets/v1/projects/:pid/categories` | Get asset categories |
| `GET` | `/bim360/assets/v1/projects/:pid/custom-attributes` | Get custom attribute definitions |
| `GET/PATCH` | `/bim360/assets/v1/projects/:pid/status-sets` | Asset statuses |

---

## Document Management

| Method | Endpoint | Purpose |
|--------|----------|---------|
| Various | `/bim360/docs/v1/projects/:pid/folders/:fid/permissions` | Folder permissions |
| Various | `/bim360/docs/v1/projects/:pid/folders/:fid/permission-batch` | Batch permissions |
| Various | `/bim360/docs/v1/projects/:pid/items/:iid/custom-attribute-values` | Custom attributes on files |
| Various | `/bim360/docs/v1/projects/:pid/naming-standards` | File naming standards |

---

## Data Connector (Bulk Export)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/data-connector/v1/accounts/:aid/requests` | Create data extract request |
| `GET` | `/data-connector/v1/accounts/:aid/requests` | List requests |
| `GET` | `/data-connector/v1/accounts/:aid/requests/:rid` | Get request status |
| `PATCH` | `/data-connector/v1/accounts/:aid/requests/:rid` | Update request |
| `GET` | `/data-connector/v1/accounts/:aid/requests/:rid/jobs` | List extraction jobs |

Exports data as CSV files covering: issues, submittals, RFIs, daily logs, checklists, photos, assets, etc.

---

## Relationships

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/bim360/relationship/v2/containers/:cid/relationships/:rid` | Get relationship |
| `POST` | `/bim360/relationship/v2/containers/:cid/relationships:search` | Search relationships |
| `POST` | `/bim360/relationship/v2/containers/:cid/relationships:batch-create` | Batch create |
| `GET` | `/bim360/relationship/v2/utility/relationships:writable` | Check writable relationships |

---

## Rate Limits by Module

| Module | Limit |
|--------|-------|
| Account Admin | 100 req/min |
| Assets | 100 req/min |
| Checklists | 600 req/min |
| Cost Management | 300 req/min |
| Data Connector | 10 req/min |
| Document Management | 600 req/min |
| Issues | 600 req/min |
| Model Coordination | 600 req/min |
| Relationships | 600 req/min |
| Locations | 600 req/min |
