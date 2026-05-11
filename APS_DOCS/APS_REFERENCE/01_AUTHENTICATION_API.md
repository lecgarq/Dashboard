# Authentication API (OAuth v2) — Complete Reference

> Source: `AUTHENTICATION API/` — 72 JSON files
> Official docs: https://aps.autodesk.com/en/docs/oauth/v2/reference/http/

---

## Overview

The Authentication API is the **gateway to every other APS API**. No API call works without a valid token. It implements OAuth 2.0 and OpenID Connect (OIDC), supporting both machine-to-machine and user-delegated authentication.

## Base URL

```
https://developer.api.autodesk.com/authentication/v2
```

---

## Authentication Flows

### 2-Legged OAuth (Client Credentials) — Server-to-Server

**When to use:** Backend services, automated pipelines, no user context needed.

```http
POST /authentication/v2/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=YOUR_CLIENT_ID
&client_secret=YOUR_CLIENT_SECRET
&scope=data:read data:write
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Key facts:**
- Token is NOT tied to a user — it acts as the application itself
- Can access OSS, Model Derivative, Design Automation
- Cannot access user-specific BIM 360 data (use 3-leg for that)
- Token lifetime: **1 hour** (3600 seconds)

---

### 3-Legged OAuth (Authorization Code Grant) — User Context

**When to use:** Web apps where you need to act on behalf of a user (access their BIM 360 projects, Fusion data, etc.)

**Step 1 — Redirect user to authorize:**
```
GET /authentication/v2/authorize
  ?response_type=code
  &client_id=YOUR_CLIENT_ID
  &redirect_uri=https://yourapp.com/callback
  &scope=data:read account:read
  &state=random_csrf_token
```

**Step 2 — Exchange code for token:**
```http
POST /authentication/v2/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=THE_AUTH_CODE
&client_id=YOUR_CLIENT_ID
&client_secret=YOUR_CLIENT_SECRET
&redirect_uri=https://yourapp.com/callback
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "dkljafEJaq3faj...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Step 3 — Refresh when expired:**
```http
POST /authentication/v2/token
grant_type=refresh_token
&refresh_token=dkljafEJaq3faj...
&client_id=YOUR_CLIENT_ID
&client_secret=YOUR_CLIENT_SECRET
&scope=data:read
```

---

### 3-Legged with PKCE — Public Clients (SPA/Mobile)

**When to use:** Single-page apps, mobile apps, desktop apps where you can't safely store client_secret.

Same as 3-leg but:
1. Generate `code_verifier` (random 43-128 char string)
2. Compute `code_challenge` = BASE64URL(SHA256(code_verifier))
3. Send `code_challenge` + `code_challenge_method=S256` in authorize request
4. Send `code_verifier` in token exchange (no client_secret needed)

---

## Complete REST API Endpoints

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 1 | `GET` | `/.well-known/openid-configuration` | OIDC discovery — returns all endpoint URLs |
| 2 | `GET` | `/authorize` | Initiate 3-legged login (browser redirect) |
| 3 | `POST` | `/token` | Get/refresh access tokens (all grant types) |
| 4 | `POST` | `/introspect` | Validate a token — check if active, get scopes & expiry |
| 5 | `POST` | `/revoke` | Revoke an access or refresh token |
| 6 | `GET` | `/keys` | JWKS endpoint — public keys for JWT signature validation |
| 7 | `GET` | `/logout` | End user's SSO session |
| 8 | `GET` | `/users/@me` | Get current user's profile (requires 3-leg token) |

### Endpoint Details

#### POST /introspect
```http
POST /authentication/v2/introspect
Content-Type: application/x-www-form-urlencoded
Authorization: Basic BASE64(client_id:client_secret)

token=ACCESS_TOKEN
```
Returns: `{ "active": true, "scope": "data:read", "exp": 1699999999, "client_id": "..." }`

#### GET /users/@me
```http
GET /authentication/v2/users/@me
Authorization: Bearer 3_LEGGED_TOKEN
```
Returns: `{ "sub": "USER_ID", "name": "John Smith", "email": "john@example.com", "picture": "..." }`

---

## Scopes Reference

| Scope | Grants Access To |
|-------|-----------------|
| `data:read` | Read files, items, folders, versions |
| `data:write` | Write/modify files and metadata |
| `data:create` | Create new items, folders, versions |
| `data:search` | Search operations on Data Management |
| `bucket:create` | Create OSS buckets |
| `bucket:read` | List/read OSS buckets |
| `bucket:update` | Modify bucket policies |
| `bucket:delete` | Delete OSS buckets |
| `code:all` | Full access to Design Automation |
| `account:read` | Read BIM 360/ACC account data |
| `account:write` | Modify BIM 360/ACC account data |
| `user:read` | Read user profile |
| `user:write` | Modify user profile |
| `viewables:read` | Access translated viewables (Viewer) |
| `openid` | Request ID token with OIDC |
| `user-profile:read` | Read user profile via OIDC |

---

## SDK Reference

### .NET SDK

**Namespace:** `Autodesk.Authentication`

| Class | Purpose |
|-------|---------|
| `AuthenticationClient` | Main client — `GetTwoLeggedTokenAsync()`, `GetThreeLeggedTokenAsync()`, `RefreshTokenAsync()`, `GetUserInfoAsync()` |
| `AuthenticationApiException` | Exception type for auth errors |
| `TwoLeggedToken` | Response model for 2-leg tokens |
| `ThreeLeggedToken` | Response model for 3-leg tokens (includes refresh_token) |
| `IntrospectToken` | Response model for token introspection |
| `UserInfo` | User profile data model |
| `Scopes` enum | All available scope values |
| `GrantType` enum | `ClientCredentials`, `AuthorizationCode`, `RefreshToken` |

### TypeScript SDK

| Class | Purpose |
|-------|---------|
| `AuthenticationClient` | Main client — `getTwoLeggedToken()`, `getThreeLeggedToken()`, `refreshToken()`, `getUserInfo()` |
| `AuthenticationApiError` | Error class |
| `Scopes` enum | All scope values |
| `GrantType` enum | Grant types |

---

## Rate Limits

- **Token requests:** 500 requests/minute per client_id
- **Introspect/Revoke:** 500 requests/minute
- **Authorize:** No programmatic limit (browser-based)
- **Global APS limit:** Varies by API tier

---

## Common Patterns

### Token Caching
Always cache tokens and reuse until `expires_in` minus a buffer (e.g., 5 minutes):
```javascript
let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const resp = await fetch('/authentication/v2/token', { method: 'POST', body: '...' });
  const data = await resp.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken;
}
```

### Asymmetric Signing
For enhanced security, APS supports asymmetric key pairs instead of client_secret. You sign a JWT assertion with your private key and send it as `client_assertion` in token requests.
