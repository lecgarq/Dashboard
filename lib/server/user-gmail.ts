import "server-only";

import { GMAIL_SCOPE } from "@/lib/google/oauth";
import { buildUserGmailApi } from "@/lib/server/email";

type AccountStore = {
  account: {
    findFirst: (args: {
      where: { userId: string; provider: string };
      select: {
        refresh_token: true;
        access_token: true;
        scope: true;
      };
    }) => Promise<{
      refresh_token: string | null;
      access_token: string | null;
      scope: string | null;
    } | null>;
  };
};

class GmailAccessRequiredError extends Error {
  constructor() {
    super("gmail_access_required");
    this.name = "GmailAccessRequiredError";
  }
}

export function isGmailAccessRequiredError(error: unknown) {
  return (
    error instanceof GmailAccessRequiredError ||
    (error instanceof Error && error.message === "gmail_access_required")
  );
}

export async function getUserGmailApi(userId: string, db: AccountStore) {
  const account = await db.account.findFirst({
    where: { userId, provider: "google" },
    select: { refresh_token: true, access_token: true, scope: true },
  });

  const hasGmailScope = (account?.scope ?? "").includes(GMAIL_SCOPE);
  if (!account?.refresh_token || !hasGmailScope) {
    throw new GmailAccessRequiredError();
  }

  return buildUserGmailApi({
    refreshToken: account.refresh_token,
    accessToken: account.access_token,
  });
}
