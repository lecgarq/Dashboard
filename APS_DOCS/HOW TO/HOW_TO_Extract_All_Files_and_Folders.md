# HOW TO: Extract All Folders, Subfolders, and Files

If you want to extract the entire directory structure of a project—meaning every folder, subfolder, and the files inside them—you must use the **Data Management API**. 

There are two main ways to do this:
1. **The Recursive Approach (Recommended)**: Best for mapping out the exact folder tree (e.g., recreating the folder structure locally).
2. **The Search Approach**: Best for just getting a massive, flat list of every file in the project.

Here is how you do both.

---

## Method 1: The Recursive Approach (Building the Tree)

This method starts at the very top of the project, gets the root folders, and then dynamically drills down into every subfolder it finds, logging files along the way.

**The Endpoints You Need:**
1. **Get Top Folders:** `GET https://developer.api.autodesk.com/project/v1/hubs/:hubId/projects/:projectId/topFolders`
2. **Get Folder Contents:** `GET https://developer.api.autodesk.com/data/v1/projects/:projectId/folders/:folderId/contents`

*(Note: In the Data Management API, your Project ID must retain the `b.` prefix! Example: `b.a4be0c34a-4ab7`)*

### Automation Script (Node.js Example)
Here is a script that starts at the top of the project and recursively crawls every folder, printing out the folder tree and the files inside them.

```javascript
async function extractEntireProjectStructure(hubId, projectId, token) {
  const headers = { 'Authorization': `Bearer ${token}` };
  const allFiles = [];
  const allFolders = [];

  // Recursive function to drill down into folders
  async function scanFolder(folderId, currentPath) {
    let url;
    
    // If it's the root, we use the topFolders endpoint. Otherwise, we use the contents endpoint.
    if (folderId === 'root') {
      url = `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${projectId}/topFolders`;
    } else {
      url = `https://developer.api.autodesk.com/data/v1/projects/${projectId}/folders/${folderId}/contents`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) return; // Skip if no permission

    const data = await res.json();

    // Iterate through everything found in this folder
    for (const item of data.data) {
      const itemName = item.attributes.displayName || item.attributes.name;
      const fullPath = currentPath ? `${currentPath}/${itemName}` : itemName;

      if (item.type === 'folders') {
        // It's a folder: Save it, and recursively scan it
        allFolders.push({ FolderName: itemName, Path: fullPath, FolderId: item.id });
        await scanFolder(item.id, fullPath);
      } 
      else if (item.type === 'items') {
        // It's a file: Save it
        allFiles.push({ FileName: itemName, Path: fullPath, FileId: item.id });
      }
    }
  }

  console.log("Starting full project scan...");
  await scanFolder('root', "");

  console.log(`Scan complete! Found ${allFolders.length} Folders and ${allFiles.length} Files.`);
  
  // You can now output these arrays to CSV or JSON
  console.table(allFolders);
  console.table(allFiles);
}
```

---

## Method 2: The Search Approach (The Fast Flat-List)

If you already know the ID of your main root folder (for example, the ID of the "Project Files" folder), you can use the Search API. 

The Search API automatically searches the folder *and all of its subfolders*.

**The Endpoint:**
`GET https://developer.api.autodesk.com/data/v1/projects/:projectId/folders/:folderId/search`

**How to filter for Files vs Folders:**
* To get a list of **only files**, add `?filter[type]=items` to the URL.
* To get a list of **only folders**, add `?filter[type]=folders` to the URL.

*(Note: The Search API is paginated, so if you have thousands of files, you will need to add `&page[number]=1`, `2`, `3`, etc., until it stops returning data).*
