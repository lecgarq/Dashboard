// Shared helpers for the users router modules (account, acc-profile, acc-graph).
// Hosts the common "users" logger plus the ACC error-mapping and account-id
// resolution helpers used by more than one module.
import { TRPCError } from "@trpc/server";
import { createLogger } from "@/lib/server/logger";
import { IntegrationError } from "@/lib/server/integration-errors";
import { getAccountId } from "@/lib/server/acc-helpers";

export const logger = createLogger("users");

export function toAccRouterError(error: unknown, fallbackMessage: string) {
  if (error instanceof IntegrationError) {
    // UNAUTHORIZED = token expired/missing/not linked (user must reconnect)
    // FORBIDDEN    = valid token but no Account Admin privilege in the hub
    const code =
      error.code === "reconnect_required" || error.code === "config_missing"
        ? "UNAUTHORIZED"
        : error.code === "forbidden"
          ? "FORBIDDEN"
          : "INTERNAL_SERVER_ERROR";
    return new TRPCError({ code, message: error.message, cause: error });
  }
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: fallbackMessage,
    cause: error instanceof Error ? error : undefined,
  });
}

// `getAccountId` is now imported from "@/lib/server/acc-helpers".
// The shared helper throws a plain Error (not TRPCError) so it can be
// called from non-tRPC contexts (release script, cron script). Each
// tRPC call site below wraps the helper in a try/catch that maps the
// plain Error to TRPCError({ code: "PRECONDITION_FAILED" }).
export async function resolveAccountIdForRouter(db: any): Promise<string> {
  try {
    return await getAccountId(db);
  } catch (err) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        err instanceof Error
          ? `${err.message}. Set APS_HUB_ID in Railway environment variables.`
          : "APS Hub ID is not configured. Set APS_HUB_ID in Railway environment variables.",
      cause: err instanceof Error ? err : undefined,
    });
  }
}
