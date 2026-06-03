import Link from "next/link";
import { AlertTriangle, ShieldCheck } from "lucide-react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";

type UnauthorizedPageProps = {
  searchParams?: Promise<{
    reason?: string;
  }>;
};

export default async function UnauthorizedPage({ searchParams }: UnauthorizedPageProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const isPending = resolved?.reason === "pending_approval";
  const isConfigError = resolved?.reason === "config_error";

  const title = isConfigError
    ? "Access setup error"
    : isPending
      ? "Approval pending"
      : "Access restricted";

  const description = isConfigError
    ? "Access control is temporarily unavailable due to Google Sheets configuration. Contact your BIM manager."
    : isPending
      ? "Your account was submitted for approval. Ask your BIM manager to move your email to the Approved tab in Google Sheets."
      : "Your email is not on the approved list. Contact your BIM manager to request access.";

  return (
    <AuthShell
      eyebrow="Access state"
      title="Keep access messages clear instead of abrupt."
      description="Even restricted states should feel like part of the product, with context that tells users what to do next."
      highlights={[
        "Pending approval and configuration failures now feel intentional.",
        "Users get a next step instead of a flat warning screen.",
        "The tone matches the rest of the auth experience.",
      ]}
      statusLabel="Access controls active"
    >
      <div className="surface-card animate-fadeIn space-y-6 rounded-[2rem] border px-6 py-8 text-center sm:px-8">
        <div className="mx-auto flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.75rem] bg-amber-500/12 text-amber-700 dark:text-amber-300">
          {isPending ? <ShieldCheck className="h-8 w-8" /> : <AlertTriangle className="h-8 w-8" />}
        </div>

        <div className="space-y-3">
          <div className="surface-chip mx-auto inline-flex rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-amber-700 dark:text-amber-300">
            Access update
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.04em] text-foreground">
            {title}
          </h1>
          <p className="text-sm leading-7 text-muted-foreground">{description}</p>
        </div>

        <Button variant="outline" asChild className="rounded-2xl">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
