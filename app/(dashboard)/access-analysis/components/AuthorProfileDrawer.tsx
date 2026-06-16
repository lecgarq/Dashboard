"use client";

/**
 * AuthorProfileDrawer — slide-over that shows an issue author's full ACC profile.
 *
 * Reuses the SAME UserProfilePanel the /users directory and the spatial-graph
 * right rail render, fed from the SAME bulk queries (accDcGraph.bulkUsers +
 * users.bulkAccSummary + accMembers.enrichedUsers, merged exactly as the
 * directory does). The queries are gated on an email being selected, so the
 * (heavy) bulk fetch only happens once the first author is clicked, then stays
 * cached for instant subsequent opens. Mounted only while open, so this whole
 * users-profile module graph never loads on a plain Access Analysis visit.
 */

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { trpc } from "@/lib/core/trpc";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { UserProfilePanel } from "../../users/UserProfilePanel";
import {
  mergeAccSummaryWithEnrichment,
  selectAccSummarySource,
  attachDirectoryFields,
  useOrgDirectoryPeople,
} from "../../users/useMergedAccUsers";

const STALE_MS = 600_000;

export function AuthorProfileDrawer({
  email,
  onClose,
}: {
  email: string | null;
  onClose: () => void;
}): React.JSX.Element {
  const enabled = !!email;
  const dcUsers = trpc.accDcGraph.bulkUsers.useQuery(undefined, { enabled, staleTime: STALE_MS, retry: false });
  const summary = trpc.users.bulkAccSummary.useQuery(undefined, { enabled, staleTime: STALE_MS, retry: false });
  const enriched = trpc.accMembers.enrichedUsers.useQuery(undefined, { enabled, staleTime: STALE_MS, retry: false });

  const directoryPeople = useOrgDirectoryPeople({ enabled });
  const usersByEmail = useMemo(() => {
    const source = selectAccSummarySource(
      (dcUsers.data ?? []) as BulkAccUser[],
      (summary.data ?? []) as BulkAccUser[],
    );
    const merged = attachDirectoryFields(
      mergeAccSummaryWithEnrichment(source, enriched.data ?? []),
      directoryPeople,
    );
    const map = new Map<string, BulkAccUser>();
    for (const u of merged) map.set(u.email.toLowerCase(), u);
    return map;
  }, [dcUsers.data, summary.data, enriched.data, directoryPeople]);

  const key = email?.toLowerCase() ?? "";
  const user = usersByEmail.get(key) ?? null;
  const loading = enabled && (dcUsers.isLoading || summary.isLoading) && !user;

  return (
    <AnimatePresence>
      {email && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            key="drawer"
            data-testid="author-profile-drawer"
            className="fixed right-0 top-0 z-50 h-full"
            initial={{ x: 384, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 384, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {loading ? (
              <aside className="flex h-full w-96 shrink-0 flex-col border-l border-border/30 bg-card">
                <header className="flex items-center justify-between gap-2 border-b border-border/30 px-4 py-3">
                  <h2 className="truncate text-sm font-semibold" title={email}>{email}</h2>
                  <button type="button" onClick={onClose} className="rounded-md border px-2 py-1 text-xs hover:bg-accent">
                    Close
                  </button>
                </header>
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  Loading profile…
                </div>
              </aside>
            ) : (
              <UserProfilePanel user={user} email={email} onClose={onClose} variant="rail" />
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
