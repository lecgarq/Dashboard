# HOW TO: Extract Recently Added Users and Identify WHO Added Them

If you want to track when users were recently added to projects, **and specifically who added them**, you must use a combination of the Admin API (to see *when* they were added) and the Data Connector Activity Log (to see *who* performed the action).

The standard Admin API does not natively tell you "User A invited User B". It only tells you that User B exists and what date they joined. To get the "Who", you have to read the audit logs.

Here is exactly how to do it.

---

## Part 1: Finding Recently Added Users

You can easily get a list of recently added users for any project using the Construction Admin API.

**Endpoint:**
`GET https://developer.api.autodesk.com/construction/admin/v1/projects/:projectId/users`

**How to Filter & Sort:**
You can append `sort=addedOn desc` to the URL to get the most recently added users first.
You can also filter by a specific date using `filter[addedOn]=YYYY-MM-DD`.

**The Response:**
```json
{
  "results": [
    {
      "name": "Jane Doe",
      "email": "jane@example.com",
      "addedOn": "2024-05-08T10:00:00.000Z" // <-- Date they were added
    }
  ]
}
```

---

## Part 2: Finding WHO Added Them

To find out **who** actually clicked "Add Member" and invited Jane Doe to the project, you must parse the Activity Logs via the Data Connector API (as explained in `HOW_TO_Extract_Activity_Logs.md`).

### The Workflow:

1. **Trigger Data Connector Extraction** for the `activities` and `admin` service groups.
2. **Download and Open `admin_activities.csv` and `project_activities.csv`**.
3. **Filter the `action` column** for user-related events. Depending on whether they were added to the Hub or the Project, the exact action name will be something like:
   - `User Invited`
   - `Member Added`
   - `Project Member Added`
4. **Read the Columns:**
   - The `user_id` column in the activity log is **the person who did the inviting** (The Admin).
   - The `details` or `description` column will contain the email or name of the person they added (e.g., *"Added jane@example.com to the project"*).

### Node.js Example: Parsing the Log for "Who Added Who"

Here is a conceptual script that parses your Data Connector CSV to find out who has been adding users recently:

```javascript
const fs = require('fs');
const Papa = require('papaparse'); // CSV parsing library

async function findWhoAddedUsers(activitiesCsvPath, usersCsvPath) {
  // 1. Load users into a Map to resolve User IDs to Names
  const usersRaw = fs.readFileSync(usersCsvPath, 'utf8');
  const parsedUsers = Papa.parse(usersRaw, { header: true }).data;
  const userMap = {};
  parsedUsers.forEach(u => {
    if (u.id) userMap[u.id] = u.name;
  });

  // 2. Load the Activity Log
  const activitiesRaw = fs.readFileSync(activitiesCsvPath, 'utf8');
  const parsedActivities = Papa.parse(activitiesRaw, { header: true }).data;

  // 3. Filter for 'Member Added' events in the last 30 days
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const addActions = ['Member Added', 'User Invited', 'Project Member Added'];
  
  const report = [];

  for (const row of parsedActivities) {
    const timestamp = new Date(row.created_at).getTime();
    
    if (addActions.includes(row.action) && timestamp > thirtyDaysAgo) {
      const adminId = row.user_id; // The person performing the action
      const adminName = userMap[adminId] || "Unknown Admin";
      
      report.push({
        DateAdded: row.created_at,
        AdminWhoInvited: adminName,
        ActionTaken: row.action,
        Details: row.details // This contains the email of the person who was added
      });
    }
  }

  console.table(report);
  return report;
}
```

### The Final Output
This script will output an audit table that looks like this:

| DateAdded | AdminWhoInvited | ActionTaken | Details |
| :--- | :--- | :--- | :--- |
| 2024-05-08 | Bob Smith | Member Added | "Added jane.doe@example.com to project Sample Project" |
| 2024-05-07 | Alice Manager | User Invited | "Invited mark.contractor@example.com to the Hub" |

By using this method, you can easily audit exactly which Admins are adding which users to your projects.
