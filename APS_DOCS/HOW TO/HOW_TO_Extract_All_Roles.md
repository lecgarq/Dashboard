# HOW TO: Extract All Roles from All Projects

In APS, "Industry Roles" (like Architect, BIM Manager, Subcontractor) are managed at the **Hub level** and then inherited by your individual **Projects**. 

Depending on your goal, you either want to pull the "Master Dictionary" of all roles in your hub, or you want to see exactly which roles are active/configured inside every single project.

Here are the two methods to achieve this.

---

## Method 1: Extract the Hub's "Master List" of Roles

If you just want a list of every possible role that exists in your Account Admin settings, you only need to make one API call.

**Endpoint:**
`GET https://developer.api.autodesk.com/hq/v2/accounts/:accountId/industry_roles`
*(Replace `:accountId` with your Hub ID without the `b.`)*

**Headers:**
```text
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response:**
This returns a simple JSON array of every role defined in your Account Admin panel.

---

## Method 2: Extract Roles Inside EVERY Project

If you need to know exactly which roles are configured/assigned *inside* specific projects, you must use the **Project Industry Roles** endpoint.

Because there is no "give me all project roles globally" endpoint, you must first get your list of projects, and then loop through them.

**Endpoint:**
`GET https://developer.api.autodesk.com/hq/v2/accounts/:accountId/projects/:projectId/industry_roles`

### Automation Script (Node.js Example)

Here is a script that ties together the Project List extraction (from `HOW_TO_Extract_Project_Info.md`) and fetches the Roles for every single project.

```javascript
async function extractAllProjectRoles(accountId, token) {
  const headers = { 'Authorization': `Bearer ${token}` };

  // 1. Get the list of ALL Project IDs (simplified for brevity)
  console.log("Fetching all projects...");
  const projRes = await fetch(`https://developer.api.autodesk.com/construction/admin/v1/accounts/${accountId}/projects?limit=200`, { headers });
  const projData = await projRes.json();
  const projects = projData.results;

  // 2. Loop through every project and get its roles
  const allRolesReport = [];

  for (const project of projects) {
    const projectId = project.id.replace('b.', '');
    
    // Fetch Roles for this specific project
    const url = `https://developer.api.autodesk.com/hq/v2/accounts/${accountId}/projects/${projectId}/industry_roles`;
    const roleRes = await fetch(url, { headers });
    
    if (roleRes.ok) {
      const rolesData = await roleRes.json();
      
      // Add each role to our master report
      for (const role of rolesData) {
        allRolesReport.push({
          ProjectName: project.name,
          ProjectId: projectId,
          RoleId: role.id,
          RoleName: role.name,
          
          // Role Defaults (Optional - shows what access level the role gives by default)
          DocsDefaultAccess: role.services?.document_management?.access_level || 'none',
          ProjectAdminDefaultAccess: role.services?.project_administration?.access_level || 'none'
        });
      }
    }
  }

  // 3. Output the result
  console.table(allRolesReport);
  return allRolesReport;
}
```

### The Output
This script will generate a massive table mapping every project to its roles:

| ProjectName | ProjectId | RoleId | RoleName | DocsDefaultAccess |
| :--- | :--- | :--- | :--- | :--- |
| Sample Project | 2c9958f4-... | 5502171c-... | Contractor | admin |
| Sample Project | 2c9958f4-... | 8a1b2c3d-... | Architect | user |
| Hospital Renovation | 88f293a1-... | 5502171c-... | Contractor | user |
