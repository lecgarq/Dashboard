import "server-only";

import { google } from "googleapis";
import { TRPCError } from "@trpc/server";

import { router, protectedProcedure } from "../trpc";
import { getPrimaryGoogleOAuthClientConfig } from "@/lib/server/google-service-auth";
import {
  summarizeGoogleApiError,
  hasGoogleApiReason,
  googleApiErrorMessageIncludes,
} from "@/lib/google/oauth";

/**
 * Server-side cache of Workspace directory results, keyed by userId.
 *
 * Limitations: in-memory, scoped to a single Node.js process. In a multi-replica
 * deployment each replica caches independently. v1.0 accepts this — Workspace
 * directory queries are cheap relative to the People API quota (1500 req/min)
 * and the typical dashboard usage pattern is a single user reloading their
 * dashboard within one process. Migrate to @upstash/redis if quota pressure
 * appears (see RESEARCH.md Open Q4).
 */
const DIRECTORY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const directoryCache = new Map<string, { value: string[]; expires: number }>();

/**
 * Maximum pages to fetch before bailing — protects against quota burn / runaway
 * loops. 25 pages × 1000 page size = 25,000 user safety cap (Pitfall 3).
 */
const MAX_PAGES = 25;
const PAGE_SIZE = 1000;

/**
 * People API `sources` enum value. Verified against the public Google docs
 * (https://developers.google.com/people/api/rest/v1/people/listDirectoryPeople);
 * the `googleapis` TypeScript surface declares `sources?: string[]` so the
 * compiler will not catch a typo here. The string `DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE`
 * lists profiles of users in the signed-in user's Google Workspace tenant.
 *
 * @see https://developers.google.com/people/api/rest/v1/DirectorySourceType
 */
const DOMAIN_PROFILE_SOURCE = "DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE";

export const workspaceRouter = router({
  /**
   * Lists the signed-in user's Google Workspace directory emails using the
   * already-granted `directory.readonly` scope (lib/google/oauth.ts).
   *
   * Behaviour:
   * - Paginates via `nextPageToken` until exhausted or MAX_PAGES safety cap.
   * - Caches results server-side for 1 hour per userId.
   * - Empty list is a valid response (user not in a Workspace tenant — Open Q5).
   *
   * Errors:
   * - PRECONDITION_FAILED `workspace_access_required` — no Google account row /
   *   no refresh_token. UI should prompt re-sign-in.
   * - FORBIDDEN `workspace_scope_missing` — Google rejected with
   *   403/insufficient scope. UI should prompt re-consent.
   * - INTERNAL_SERVER_ERROR — anything else.
   */
  getDirectory: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // 1. Cache hit — short-circuit before any DB / Google call.
    const cached = directoryCache.get(userId);
    if (cached && cached.expires > Date.now()) {
      return { emails: cached.value };
    }

    // 2. Look up Account row to get the OAuth refresh token.
    const account = await ctx.db.account.findFirst({
      where: { userId, provider: "google" },
      select: { refresh_token: true, access_token: true },
    });

    if (!account?.refresh_token) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "workspace_access_required",
      });
    }

    // 3. Build OAuth2 client (mirrors buildUserGmailApi pattern in lib/server/email.ts).
    const { clientId, clientSecret } = getPrimaryGoogleOAuthClientConfig();
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({
      refresh_token: account.refresh_token,
      access_token: account.access_token ?? undefined,
    });

    const people = google.people({ version: "v1", auth: oauth2 });

    // 4. Pagination loop: accumulate lower-cased emails into a Set.
    const emails = new Set<string>();
    let pageToken: string | undefined;
    let pageCount = 0;

    try {
      do {
        const res = await people.people.listDirectoryPeople({
          readMask: "emailAddresses,names",
          sources: [DOMAIN_PROFILE_SOURCE],
          pageSize: PAGE_SIZE,
          pageToken,
        });

        for (const person of res.data.people ?? []) {
          for (const email of person.emailAddresses ?? []) {
            if (email.value) {
              emails.add(email.value.toLowerCase());
            }
          }
        }

        pageToken = res.data.nextPageToken ?? undefined;
        pageCount += 1;
      } while (pageToken && pageCount < MAX_PAGES);
    } catch (err) {
      const summary = summarizeGoogleApiError(err);

      // 403 / scope missing → typed FORBIDDEN so UI can show "sign in with Workspace".
      if (
        summary.statusCode === 403 ||
        hasGoogleApiReason(summary, "insufficientPermissions", "forbidden") ||
        googleApiErrorMessageIncludes(summary, "insufficient", "scope")
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "workspace_scope_missing",
          cause: err,
        });
      }

      // 5. Empty / non-Workspace fallback (Open Q5):
      // Some non-Workspace accounts respond with 400 / FAILED_PRECONDITION
      // rather than an empty list. Treat those as "no directory" and return [].
      if (
        summary.statusCode === 400 ||
        googleApiErrorMessageIncludes(
          summary,
          "not a workspace",
          "domain profile",
          "failed_precondition"
        )
      ) {
        const empty: string[] = [];
        directoryCache.set(userId, { value: empty, expires: Date.now() + DIRECTORY_CACHE_TTL_MS });
        return { emails: empty };
      }

      console.error("[workspace.getDirectory] People API error", summary);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "workspace_directory_failed",
        cause: err,
      });
    }

    // 6. Cache & return.
    const value = [...emails];
    directoryCache.set(userId, { value, expires: Date.now() + DIRECTORY_CACHE_TTL_MS });
    return { emails: value };
  }),
});
