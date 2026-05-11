# HOW TO: Extract the Global Activity Log across all Projects & Users

To extract the exact "Activity Log" (Date, Product - Tool, Activity type, Member, Activity details) for *every user across every project* in your Hub, you must use the **BIM 360 / ACC Data Connector API**. 

The standard REST endpoints do not provide a simple `/activities` list for an entire hub due to the massive volume of data. Instead, Data Connector generates a bulk CSV export containing the exact tables you see in the Account Admin Activity tab.

Here is the step-by-step process to automate this extraction.

---

## Prerequisites

1. Your APS App must be added as a **Custom Integration** in the BIM 360 / ACC Account Admin settings.
2. The user authorizing the app (or the service account) must have **Account Admin** or **Executive Overview** permissions.
3. You need an Access Token with `data:read` and `data:create` scopes.

---

## Step 1: Request the Data Extraction

You will initiate a bulk data extraction, specifically requesting the `activities` service group.

**Endpoint:**
`POST https://developer.api.autodesk.com/data-connector/v1/accounts/:accountId/requests`

*(Note: Your `:accountId` is your Hub ID with the `b.` prefix removed. Example: If Hub ID is `b.123456`, use `123456`)*

**Headers:**
```text
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Body:**
```json
{
  "description": "Global Activity Log Extraction",
  "isActive": true,
  "scheduleInterval": "ONE_TIME",
  "serviceGroups": [
    "activities",
    "admin"
  ],
  "dateRange": "PAST_7_DAYS" 
}
```
*Note: You can use `dateRange` values like `TODAY`, `YESTERDAY`, `PAST_7_DAYS`, `LAST_MONTH`, or specify `startDate` and `endDate` for a `CUSTOM` range. The `activities` service group can be massive, so querying smaller date ranges is recommended.*

**Response:**
You will get back a `201 Created` with a `id` (this is your `requestId`).

---

## Step 2: Poll for Job Completion

Data extraction takes time (from a few minutes to hours depending on hub size). You need to poll the jobs endpoint until it finishes.

**Endpoint:**
`GET https://developer.api.autodesk.com/data-connector/v1/accounts/:accountId/requests/:requestId/jobs`

**Response when running:**
```json
{
  "data": [
    {
      "id": "job-id-123",
      "status": "running"
    }
  ]
}
```

**Response when finished:**
```json
{
  "data": [
    {
      "id": "job-id-123",
      "status": "success",
      "downloadUrl": "https://developer.api.autodesk.com/oss/v2/signedresources/..."
    }
  ]
}
```

---

## Step 3: Download and Parse the Data

Once the status is `success`, use the provided `downloadUrl` to download a `.zip` file.

1. **Download the ZIP**: The `downloadUrl` is a signed S3 URL. Just do a standard HTTP GET (no auth headers needed for the signed URL).
2. **Extract the ZIP**: Inside, you will find multiple CSV files.
3. **Locate the Activity Logs**: Look for these specific files:
   - `admin_activities.csv` (Hub-level admin activities)
   - `project_activities.csv` (Project-level activities)
   - `users.csv` (To map User IDs to Member Names)
   - `projects.csv` (To map Project IDs to Project Names)

### The CSV Columns
The `project_activities.csv` file directly matches the UI you described. The headers will map as follows:
- **Date** → `created_at`
- **Product - Tool** → `service` / `tool`
- **Activity type** → `action`
- **Member** → `user_id` (Join this with `users.csv` to get the Member Name)
- **Activity details** → `details` or `description`

---

## Workflow Summary Script (Node.js Example)

```javascript
// 1. Trigger Extraction
const request = await fetch(`https://developer.api.autodesk.com/data-connector/v1/accounts/${accountId}/requests`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    description: "Activity Log Export",
    scheduleInterval: "ONE_TIME",
    serviceGroups: ["activities", "admin"]
  })
});
const { id: requestId } = await request.json();

// 2. Poll until complete
let downloadUrl = null;
while (!downloadUrl) {
  await new Promise(r => setTimeout(r, 60000)); // wait 1 minute
  
  const jobsRes = await fetch(`https://developer.api.autodesk.com/data-connector/v1/accounts/${accountId}/requests/${requestId}/jobs`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const jobsData = await jobsRes.json();
  
  const job = jobsData.data[0];
  if (job.status === 'success') {
    downloadUrl = job.downloadUrl;
  } else if (job.status === 'failed') {
    throw new Error('Data Connector job failed');
  }
}

// 3. Download the ZIP file
console.log("Download your Activity Logs ZIP from:", downloadUrl);
```
