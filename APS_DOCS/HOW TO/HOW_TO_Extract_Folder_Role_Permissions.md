# HOW TO: Extract Folder Permissions for Roles & Check Member Assignments

If you want to extract every folder in a project, find out exactly which **Roles** are assigned to them, see the permission levels they have, and verify if those Roles actually have any users assigned to them in the project, you need to combine three different APS APIs:

1. **Data Management API**: To recursively get all folder names and IDs.
2. **BIM 360 Document Management API**: To get the permission settings for each folder.
3. **BIM 360 Admin API**: To get the project members and check their assigned roles.

Here is the exact step-by-step workflow to achieve this.

---

## 1. The Endpoints You Need

**A. Get Project Users & Roles**
`GET https://developer.api.autodesk.com/construction/admin/v1/projects/:projectId/users`
*(This gets all users. We will use this to count how many users have a specific Role ID).*

**B. Get Folders**
`GET https://developer.api.autodesk.com/project/v1/hubs/:hubId/projects/:projectId/topFolders`
`GET https://developer.api.autodesk.com/data/v1/projects/:projectId/folders/:folderId/contents?filter[type]=folders`
*(You will need to call this recursively to build your folder tree).*

**C. Get Folder Permissions**
`GET https://developer.api.autodesk.com/bim360/docs/v1/projects/:projectId/folders/:folderUrn/permissions`
*(This returns the permissions array. We will filter this for `subjectType === "ROLE"`).*

---

## 2. Understanding the Permission Types

When you hit the permissions endpoint, the `actions` array determines the Permission Level (Type) in the UI. Here is the mapping:

| Actions Array Returned by API | UI Permission Type (BIM 360) |
| :--- | :--- |
| `["VIEW", "COLLABORATE"]` | **View Only** |
| `["VIEW", "DOWNLOAD", "COLLABORATE"]` | **View / Download** |
| `["PUBLISH"]` | **Upload Only** |
| `["PUBLISH", "VIEW", "DOWNLOAD", "COLLABORATE"]` | **View / Download + Upload** |
| `["PUBLISH", "VIEW", "DOWNLOAD", "COLLABORATE", "EDIT"]` | **View / Download + Upload + Edit** |
| `["PUBLISH", "VIEW", "DOWNLOAD", "COLLABORATE", "EDIT", "CONTROL"]` | **Full Controller** (Folder Admin) |

---

## 3. Automation Script (Node.js Example)

Here is a conceptual script that ties these three APIs together to generate the exact matrix you requested:

```javascript
async function extractRolePermissions(hubId, projectId, token) {
  const headers = { 'Authorization': `Bearer ${token}` };

  // -------------------------------------------------------------
  // STEP 1: Get all users and map which Roles actually have members
  // -------------------------------------------------------------
  const usersRes = await fetch(`https://developer.api.autodesk.com/construction/admin/v1/projects/${projectId.replace('b.', '')}/users?limit=200`, { headers });
  const usersData = await usersRes.json();
  
  // Create a map to easily check if a role has members: { "RoleId": MemberCount }
  const roleMemberCount = {};
  for (const user of usersData.results) {
    if (user.roles) {
      for (const role of user.roles) {
        roleMemberCount[role.id] = (roleMemberCount[role.id] || 0) + 1;
      }
    }
  }

  // -------------------------------------------------------------
  // STEP 2: Recursive function to get all folders in the project
  // -------------------------------------------------------------
  async function getAllFolders(folderId, pathName = "") {
    let folders = [];
    // If it's the root, use topFolders, else get contents
    const url = folderId === 'root' 
      ? `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${projectId}/topFolders`
      : `https://developer.api.autodesk.com/data/v1/projects/${projectId}/folders/${folderId}/contents?filter[type]=folders`;

    const res = await fetch(url, { headers });
    const data = await res.json();

    for (const item of data.data) {
      if (item.type === 'folders') {
        const folderName = item.attributes.name;
        const fullPath = pathName ? `${pathName} / ${folderName}` : folderName;
        folders.push({ id: item.id, name: folderName, path: fullPath });
        
        // Recursively get subfolders
        const subfolders = await getAllFolders(item.id, fullPath);
        folders = folders.concat(subfolders);
      }
    }
    return folders;
  }

  console.log("Fetching folder tree...");
  const allFolders = await getAllFolders('root');

  // -------------------------------------------------------------
  // STEP 3: Get permissions for every folder and format the output
  // -------------------------------------------------------------
  const permissionReport = [];

  for (const folder of allFolders) {
    const permUrl = `https://developer.api.autodesk.com/bim360/docs/v1/projects/${projectId.replace('b.', '')}/folders/${folder.id}/permissions`;
    const permRes = await fetch(permUrl, { headers });
    
    if (!permRes.ok) continue; // Skip if no access
    
    const permissions = await permRes.json();

    // Filter to ONLY look at ROLE assignments
    const rolePermissions = permissions.filter(p => p.subjectType === "ROLE");

    for (const perm of rolePermissions) {
      const roleId = perm.subjectId;
      const roleName = perm.name;
      const actions = perm.actions.join(", ");
      
      // Determine UI Type based on the actions array
      let type = "Custom";
      if (actions.includes("CONTROL")) type = "Full Controller";
      else if (actions.includes("EDIT")) type = "View/Download/Upload/Edit";
      else if (actions.includes("PUBLISH") && actions.includes("VIEW")) type = "View/Download/Upload";
      else if (actions.includes("PUBLISH") && !actions.includes("VIEW")) type = "Upload Only";
      else if (actions.includes("DOWNLOAD")) type = "View/Download";
      else if (actions.includes("VIEW")) type = "View Only";

      const membersAssignedCount = roleMemberCount[roleId] || 0;

      permissionReport.push({
        FolderPath: folder.path,
        FolderName: folder.name,
        RoleAssigned: roleName,
        PermissionType: type,
        RawActions: actions,
        HasMembersAssigned: membersAssignedCount > 0 ? "YES" : "NO",
        ActiveMembersInRole: membersAssignedCount
      });
    }
  }

  console.table(permissionReport);
  return permissionReport;
}
```

### The Final Output
This script will output a table that looks exactly like this:

| FolderPath | FolderName | RoleAssigned | PermissionType | HasMembersAssigned | ActiveMembersInRole |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Project Files / Architecture | Architecture | Architect | View/Download/Upload/Edit | YES | 4 |
| Project Files / Architecture | Architecture | BIM Manager | Full Controller | YES | 1 |
| Project Files / Structural | Structural | Structural Engineer | View/Download/Upload | NO | 0 |

*(In the example above, the "Structural Engineer" role is assigned to the Structural folder, but the API verified that `NO` members are currently assigned to that role in the project).*
