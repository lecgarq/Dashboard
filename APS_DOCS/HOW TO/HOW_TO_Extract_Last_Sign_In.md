# HOW TO: Extract the "Last Sign-In" Date for Users

Yes, you can easily extract the exact date and time a user last signed into the platform. This data is natively tracked by the Autodesk Platform Services (APS) Admin API.

There are two primary ways to get this, depending on whether you want the hub-wide (account level) sign-in or the project-specific sign-in data.

---

## Method 1: Extract from the Account Admin API (Hub Level)

If you want to pull a massive list of every user in your Hub and see when they last logged in, you use the HQ Account Admin API.

**Endpoint:**
`GET https://developer.api.autodesk.com/hq/v1/accounts/:accountId/users`
*(Replace `:accountId` with your Hub ID without the `b.`)*

**Headers:**
```text
Authorization: Bearer YOUR_2_LEGGED_ACCESS_TOKEN
```

**The Response:**
The JSON response will return an array of user objects. The field you are looking for is `last_sign_in`.

```json
[
  {
    "id": "a75e8769-621e-40b6-a524-0cffdd2f784e",
    "status": "active",
    "role": "account_admin",
    "name": "John Smith",
    "email": "john.smith@example.com",
    "last_sign_in": "2024-05-01T07:27:20.858Z" // <--- EXACT LAST SIGN-IN DATE
  }
]
```
*(Note: If a user has been invited but has never logged in, this value will be `null`).*

---

## Method 2: Extract from the Construction Admin API (Project Level)

If you only want to know when users in a **specific project** last signed in, you can request it from the new Construction Admin API.

**Endpoint:**
`GET https://developer.api.autodesk.com/construction/admin/v1/projects/:projectId/users?fields=name,email,lastSignIn`

*Crucial Note:* When using the new Admin API, you **must explicitly request** the `lastSignIn` field by appending `?fields=name,email,lastSignIn` to your URL.

**The Response:**
```json
{
  "results": [
    {
      "id": "39712a51-bd64-446a-9c72-48c4e43d0a0d",
      "name": "Bob Smith",
      "email": "bob.smith@example.com",
      "lastSignIn": "2024-05-08T12:45:00.000Z" // <--- EXACT LAST SIGN-IN DATE
    }
  ]
}
```

## Alternative: Data Connector
If you are already running bulk CSV extractions using the Data Connector API, you can find the `last_sign_in` column directly inside the `users.csv` file that comes in the downloaded ZIP. This is the fastest way to get this data if you are already doing automated daily backups of your hub data.
