/**
 * Inviter attribution helper (ACTV-04).
 *
 * Given an activity row that represents an invitation event, parses the invitee
 * email from the `details` column, resolves the inviter via `AccProjectMember`
 * by `autodeskId`, and looks up the invitee via case-insensitive email match.
 * Unresolved cases are persisted to `UnresolvedAttribution` for forensic review.
 *
 * Source pattern: 03-RESEARCH.md Example 2 + CONTEXT.md attribution rules.
 */

import type { PrismaClient } from "@prisma/client";

const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w+/g;

export interface AttributionResult {
  inviterAutodeskId: string;
  inviterMemberId: string | null;
  inviteeEmail: string | null;
  inviteeMemberId: string | null;
  reason?: "no_email_match" | "no_autodesk_id_match" | "ambiguous_match";
}

export function parseInviteeEmail(details: string | null | undefined): string | null {
  if (!details) return null;
  const matches = details.match(EMAIL_RE);
  if (!matches || matches.length === 0) return null;
  return matches[0].toLowerCase();
}

/**
 * Attribute a single invitation activity row.
 *
 * Side effect: writes a row to `UnresolvedAttribution` when the invitee email
 * cannot be parsed or matched. Inviter resolution failure is also recorded
 * (the inviter SHOULD always resolve since `autodeskId` is a hard key, but
 * we defend against renamed/removed members).
 */
export async function attribute(
  activity: {
    id: string;
    autodeskId: string;
    details: string | null;
    projectId: string | null;
  },
  prisma: PrismaClient
): Promise<AttributionResult> {
  // 1. Parse invitee email from details column.
  const inviteeEmail = parseInviteeEmail(activity.details);

  // 2. Resolve inviter via autodeskId (canonical).
  //    AccProjectMember has compound-unique (projectId, autodeskId) so a single
  //    autodeskId may appear across multiple project rows — findFirst is fine
  //    since the identity (name/avatar) is the same per autodeskId.
  const inviter = await prisma.accProjectMember.findFirst({
    where: { autodeskId: activity.autodeskId },
    select: { id: true },
  });

  // 3. Resolve invitee via email (case-insensitive belt-and-suspenders even
  //    though we already lowercase emails on write).
  let invitee: { id: string } | null = null;
  let ambiguous = false;
  if (inviteeEmail) {
    const matches = await prisma.accProjectMember.findMany({
      where: { email: { equals: inviteeEmail, mode: "insensitive" } },
      select: { id: true, autodeskId: true },
      take: 5,
    });
    if (matches.length === 1) {
      invitee = { id: matches[0].id };
    } else if (matches.length > 1) {
      // Multiple members across projects with same email — pick the first,
      // but flag as ambiguous in forensic log.
      const distinctAutodeskIds = new Set(matches.map((m) => m.autodeskId));
      if (distinctAutodeskIds.size === 1) {
        // Same person, multiple project rows — not ambiguous.
        invitee = { id: matches[0].id };
      } else {
        invitee = { id: matches[0].id };
        ambiguous = true;
      }
    }
  }

  const result: AttributionResult = {
    inviterAutodeskId: activity.autodeskId,
    inviterMemberId: inviter?.id ?? null,
    inviteeEmail,
    inviteeMemberId: invitee?.id ?? null,
  };

  // 4. Log unresolved cases to UnresolvedAttribution.
  let reason: AttributionResult["reason"] | undefined;
  if (!invitee) {
    reason = inviteeEmail ? "no_email_match" : "no_autodesk_id_match";
  } else if (ambiguous) {
    reason = "ambiguous_match";
  }

  if (reason) {
    result.reason = reason;
    try {
      await prisma.unresolvedAttribution.create({
        data: {
          activityId: activity.id,
          rawEmail: inviteeEmail,
          rawDetails: activity.details,
          reason,
        },
      });
    } catch (err) {
      // Forensic logging must never block ingest. Swallow + log.
      console.warn(
        `[attributeInviter] Failed to persist UnresolvedAttribution for activity ${activity.id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return result;
}
