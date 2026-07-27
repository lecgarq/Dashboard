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
    <AuthShell>
      <div className="surface-card animate-fadeIn space-y-6 rounded-[2rem] border px-6 py-8 text-center sm:px-8">
        <div className="mx-auto flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.75rem] bg-warning/10 text-warning">
          {isPending ? <ShieldCheck className="h-8 w-8" /> : <AlertTriangle className="h-8 w-8" />}
        </div>

        <div className="space-y-3">
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
