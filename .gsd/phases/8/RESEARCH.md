# Research: Phase 8 - Communication & Performance

## Gmail Integration

### Goal
Implement a full-featured Gmail inbox (read, view, send) within the LECG Dashboard.

### Technical Options
1.  **Google APIs (`googleapis`)**: 
    - Already used in `lib/email.ts`.
    - `gmail.users.messages.list`: Fetch inbox with snippets.
    - `gmail.users.messages.get`: Fetch full body (HTML/Text) and attachments.
    - `gmail.users.messages.send`: Already implemented for system notifications.
2.  **Authentication**:
    - Current: Service account / Env refresh token.
    - Requirement: User-specific OAuth logic if we want users to see *their* inbox, not a shared system one.
    - *Decision*: Since it's an internal dashboard, we'll likely use the current `GMAIL_USER` refresh token flow unless per-user inbox is strictly required.

### Proposed UI
- Sidebar entry "Mail".
- List of emails with "from", "subject", and "timestamp".
- Detail view for the body.
- Compose modal.

---

## Media Preview Stability

### Issue
The user reports the preview is "unstable" (likely jumping during pan/zoom or flickers).

### Diagnosis
- `handlePointerMove` updates state on every move without `requestAnimationFrame`.
- Transition property `transform 0.15s ease-out` on the image might conflict with rapid pan updates (panning should usually be `transition-none`).
- Missing `touch-action: none` might cause browser scroll interference on mobile/touch.

### Solution
- Use `requestAnimationFrame` for pan updates or ensure `transition: none` is strictly applied while `isPanning.current` is true.
- Add `touch-action: none` to the modal content.

---

## Performance Optimization (Trello & Chat)

### Trello
- **Latency**: Multiple API calls for member resolution and board details.
- **Solution**: 
    - Implement a more robust cache for `getMemberCards` and `getBoardDetail` (e.g., 5-minute TTL).
    - Use Trello's `batch` API for multi-resource fetches if possible.
    - Optimize the `allDay`/`due` logic to avoid heavy processing on the server.

### Google Chat
- **Latency**: Currently uses SSE. The server polls Google Chat API.
- **Solution**:
    - Reduce the polling interval if the API quota allows.
    - Implement a "Pre-fetch" cache: store messages in the local DB and use webhooks to invalidate.
    - *Constraint*: Google Chat Webhooks require a public HTTPS endpoint (verified active via Ngrok).

---

## Open Questions
- **Per-User Gmail?**: Should users see the shared `GMAIL_USER` inbox or their own authenticated Gmail?
- **Trello Boards**: Which boards are the priority for speed (just "ESTANDARIZACION" or all)?
