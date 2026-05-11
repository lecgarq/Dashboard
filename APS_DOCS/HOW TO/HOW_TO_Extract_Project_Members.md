# HOW TO: Extract the Project Members Matrix (Users, Roles, & Product Access)

If you need to extract the exact table found in the "Members" tab of the Project Admin UI—which includes **Name, Email, Phone, Status, Company, Role, Access Level, Added On**, and the specific module access flags like **Data Management, Design Collaboration, Model Coordination, Build, Insight, etc.**—you can use the new **BIM 360 / ACC Admin API**.

Here is how you extract this exact matrix programmatically.

---

## The Endpoint

You will use the new Construction Admin API to get users for a specific project. This endpoint returns the exact product access matrix you are looking for.

**Endpoint:**
`GET https://developer.api.autodesk.com/construction/admin/v1/projects/:projectId/users`

*(Note: The `:projectId` is the ID of your project, WITHOUT the `b.` prefix. Example: `a4be0c34a-4ab7`)*

**Headers:**
```text
Authorization: Bearer YOUR_ACCESS_TOKEN
```
*(Requires a 2-legged or 3-legged token with the `account:read` scope)*

---

## The Response Data Mapping

The API returns a JSON array of users. Here is exactly how the JSON fields map to the columns you requested:

| UI Column | API JSON Field | Example Value / Notes |
| :--- | :--- | :--- |
| **Name** | `name` | `"Bob Smith"` |
| **Email** | `email` | `"bob.smith@example.com"` |
| **Phone** | `phone.number` | `"123-345-1234"` |
| **Status** | `status` | `"active"`, `"pending"`, `"deleted"` |
| **Company** | `companyName` | `"Sample Company"` |
| **Role** | `roles` (array) | `[{"name": "Architect"}, {"name": "Engineer"}]` |
| **Access level** | `accessLevels` (object) | `{"projectAdmin": true, "executive": false}` |
| **Added on** | `addedOn` | `"2018-01-01T12:45:00.000Z"` |

### The "Product Access" Columns
To get the checkboxes/access levels for individual modules (Data Management, Design Collaboration, etc.), look at the `products` array in the JSON response. 

The `products` array looks like this:
```json
"products": [
  { "key": "docs", "access": "administrator" },
  { "key": "designCollaboration", "access": "member" },
  { "key": "modelCoordination", "access": "none" },
  { "key": "build", "access": "administrator" }
]
```

Here is how the API `key` maps to the UI Column names:
* **Data Management / Docs** → `key: "docs"` or `key: "documentManagement"`
* **Design Collaboration** → `key: "designCollaboration"`
* **Model Coordination** → `key: "modelCoordination"`
* **Preconstruction / Takeoff** → `key: "takeoff"` or `key: "quantification"`
* **AutoSpecs** → `key: "autoSpecs"`
* **Build** → `key: "build"` or `key: "fieldManagement"`
* **Insight** → `key: "insight"`
* **Cost Management** → `key: "cost"` or `key: "costManagement"`
* **Project Admin** → `key: "projectAdministration"`

---

## Automation Script (Node.js Example)

If you want to extract this for **every project in your hub**, you need to fetch all projects first, then iterate through them. Here is a starter script to fetch and format the members for a single project:

```javascript
async function getProjectMembersMatrix(projectId, token) {
  let allUsers = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    const url = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectId}/users?limit=${limit}&offset=${offset}`;
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await response.json();
    allUsers.push(...data.results);
    
    if (data.results.length < limit) {
      hasMore = false;
    } else {
      offset += limit;
    }
  }

  // Format into a flat table
  const csvRows = allUsers.map(user => {
    // Helper to find product access
    const getProductAccess = (productKey) => {
      const prod = user.products?.find(p => p.key === productKey);
      return prod ? prod.access : 'none'; // returns "administrator", "member", or "none"
    };

    return {
      Name: user.name,
      Email: user.email,
      Phone: user.phone?.number || '',
      Status: user.status,
      Company: user.companyName || '',
      Role: user.roles?.map(r => r.name).join(', ') || '',
      AccessLevel: user.accessLevels?.projectAdmin ? 'Project Admin' : 'Member',
      AddedOn: user.addedOn,
      
      // Module Access
      DataManagement: getProductAccess('docs'),
      DesignCollaboration: getProductAccess('designCollaboration'),
      ModelCoordination: getProductAccess('modelCoordination'),
      Build: getProductAccess('build'),
      AutoSpecs: getProductAccess('autoSpecs'),
      Insight: getProductAccess('insight'),
      Cost: getProductAccess('cost')
    };
  });

  console.table(csvRows);
  return csvRows;
}
```

### To do this for *Every* Project:
1. Call `GET https://developer.api.autodesk.com/construction/admin/v1/accounts/:accountId/projects` to get a list of all `projectId`s.
2. Run the function above for every ID in that list.
3. Merge the results into a single CSV.
