# HOW TO: Extract All Project Information (List of Projects)

To extract a clean list of every project in your Hub along with its specific details (Type, Name, Number, Hub, Created On, etc.), you will use the **Construction Admin API**.

This is much more efficient than using the older HQ API, as it allows for robust filtering and pagination.

---

## The Endpoint

You will request a list of projects for your specific Account (Hub).

**Endpoint:**
`GET https://developer.api.autodesk.com/construction/admin/v1/accounts/:accountId/projects`

*(Replace `:accountId` with your Hub ID. Remember to remove the `b.` prefix if your hub ID has one).*

**Headers:**
```text
Authorization: Bearer YOUR_ACCESS_TOKEN
```
*(Requires a 2-legged or 3-legged token with the `account:read` scope).*

---

## Field Mapping

The API returns a vast amount of data for each project. You can restrict the payload size by adding `?fields=name,type,jobNumber,accountId,createdAt` to the URL.

Here is how the API fields map exactly to the UI columns you requested:

| UI Column | API JSON Field | Example Value / Notes |
| :--- | :--- | :--- |
| **Type** | `type` | `"Hospital"`, `"Template Project"`, `"Office"` |
| **Name** | `name` | `"Sample Project 2024"` |
| **Number** | `jobNumber` | `"HP-0002"` |
| **Hub** | `accountId` | `"d73fc742-4538-401c-8d0f-853b49b750b2"` (Your Hub ID) |
| **Created on** | `createdAt` | `"2022-11-29T07:40:52.109Z"` |
| **Default Access** | *(Not exposed natively)* | The specific "Default Access" toggle (e.g., Invite Only) from the UI is not directly exposed as a simple string in the GET Projects API. It is handled internally by the `adminGroupId` and `memberGroupId` permissions. |

---

## Automation Script (Node.js Example)

If you want to pull down every single project in your hub and format it into a clean table or CSV, here is the script to do it.

Because hubs can have hundreds of projects, this script handles **pagination** (fetching 100 projects at a time until they are all downloaded).

```javascript
async function extractAllProjectInfo(accountId, token) {
  let allProjects = [];
  let offset = 0;
  const limit = 100; // Fetch 100 at a time
  let hasMore = true;

  console.log("Fetching all projects from Hub...");

  while (hasMore) {
    // We explicitly request only the fields we care about to speed up the query
    const url = `https://developer.api.autodesk.com/construction/admin/v1/accounts/${accountId}/projects?limit=${limit}&offset=${offset}&fields=name,type,jobNumber,accountId,createdAt`;
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
        console.error("Failed to fetch projects", await response.text());
        return;
    }

    const data = await response.json();
    allProjects.push(...data.results);
    
    // Check if we need to fetch another page
    if (data.results.length < limit) {
      hasMore = false;
    } else {
      offset += limit;
    }
  }

  // Format into a flat table matching your requested columns
  const csvRows = allProjects.map(project => {
    return {
      Type: project.type || 'Unknown',
      Name: project.name,
      Number: project.jobNumber || 'N/A',
      Hub: project.accountId,
      CreatedOn: project.createdAt
    };
  });

  // Print as a table to the console
  console.table(csvRows);
  
  return csvRows;
}
```

### Note on Alternative Extraction (Data Connector)
If you do not want to write code to hit the REST API directly, you can also trigger a Data Connector extraction (as shown in the Activity Log guide) and simply open the `projects.csv` file that is included in the downloaded ZIP. It contains all of these exact columns.
