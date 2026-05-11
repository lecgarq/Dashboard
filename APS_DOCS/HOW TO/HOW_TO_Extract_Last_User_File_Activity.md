# HOW TO: Extract the Last File Modified/Viewed by Every User

To find the **last file modified, edited, or viewed** for every single user, you cannot rely on the standard Data Management API alone (because Data Management tracks *who last modified a specific file*, but it doesn't track *views*, and you would have to scan every single file in the hub to find a specific user).

Instead, the only reliable way to get this information—especially "viewed" files—is by parsing the **Activity Log** extracted via the **Data Connector API**.

Here is the exact workflow to extract this insight.

---

## 1. Extract the Data Connector Activities
Follow the steps in `HOW_TO_Extract_Activity_Logs.md` to trigger a Data Connector extraction for the `activities` service group and download the resulting ZIP file.

Inside the ZIP, you need two specific files:
1. `project_activities.csv` (Contains all the file interactions)
2. `users.csv` (To map User IDs to actual Names/Emails)

---

## 2. Understand the Activity Log Schema
In `project_activities.csv`, every row represents a single action. The columns you care about are:

* `created_at` — The timestamp of the activity.
* `user_id` — The ID of the member who performed the action.
* `service` / `tool` — Will usually be `Document Management` or `Docs`.
* `action` — The type of activity. You want to filter for file-related actions such as:
  * `File Uploaded`
  * `Document Viewed`
  * `File Downloaded`
  * `Document Version Created`
* `details` or `description` — This column contains the **File Name** and often the path or URN of the file they interacted with.

---

## 3. Data Processing Strategy

Because the CSV contains every action ever performed, you need to group the data by User ID and find the **most recent** timestamp for file-related actions.

### Automation Script (Node.js Example)
Here is a conceptual script (using a standard CSV parser like `csv-parser` or `papaparse`) to process the downloaded files and extract the "Last Modified/Viewed File" for every user:

```javascript
const fs = require('fs');
const Papa = require('papaparse'); // Assuming you have a CSV parsing library

async function findLastFileActivityPerUser(activitiesCsvPath, usersCsvPath) {
  
  // 1. Load Users into a Map for easy lookup: { "userId": "John Doe" }
  const usersRaw = fs.readFileSync(usersCsvPath, 'utf8');
  const parsedUsers = Papa.parse(usersRaw, { header: true }).data;
  const userMap = {};
  parsedUsers.forEach(u => {
    if (u.id) userMap[u.id] = { name: u.name, email: u.email };
  });

  // 2. Load and Parse the Project Activities
  const activitiesRaw = fs.readFileSync(activitiesCsvPath, 'utf8');
  const parsedActivities = Papa.parse(activitiesRaw, { header: true }).data;

  // 3. Define the actions we care about
  const FILE_ACTIONS = ['File Uploaded', 'Document Viewed', 'File Downloaded', 'Document Version Created'];

  // 4. Create a dictionary to hold the MOST RECENT activity per user
  const latestActivityPerUser = {};

  for (const row of parsedActivities) {
    const userId = row.user_id;
    const action = row.action;
    const timestamp = new Date(row.created_at).getTime();

    // Only process if it's a file action and has a valid user
    if (userId && FILE_ACTIONS.includes(action)) {
      
      // If we haven't seen this user yet, or this row is MORE RECENT than the saved one
      if (!latestActivityPerUser[userId] || timestamp > latestActivityPerUser[userId].timestamp) {
        
        latestActivityPerUser[userId] = {
          timestamp: timestamp,
          date: row.created_at,
          action: action,
          service: row.service,
          details: row.details // This contains the File Name / URN
        };
      }
    }
  }

  // 5. Format the Final Report
  const report = [];
  for (const [userId, activity] of Object.entries(latestActivityPerUser)) {
    const userInfo = userMap[userId] || { name: 'Unknown User', email: 'N/A' };
    
    report.push({
      UserName: userInfo.name,
      UserEmail: userInfo.email,
      LastActivityDate: activity.date,
      ActionType: activity.action,
      FileDetails: activity.details
    });
  }

  // Sort by date descending (most recently active users first)
  report.sort((a, b) => new Date(b.LastActivityDate) - new Date(a.LastActivityDate));

  console.table(report);
  return report;
}
```

## The Final Output

This script will output a table that looks like this:

| UserName | UserEmail | LastActivityDate | ActionType | FileDetails |
| :--- | :--- | :--- | :--- | :--- |
| John Smith | john@example.com | 2024-05-08T14:30:00Z | Document Viewed | `Architectural_Model_v3.rvt` |
| Jane Doe | jane@example.com | 2024-05-07T09:15:00Z | File Uploaded | `Site_Plan.pdf` |
| Bob Builder | bob@example.com | 2024-05-01T11:00:00Z | File Downloaded | `Structural_Specs.docx` |

*(Users who have never viewed or edited a file will simply not appear in this list).*
