import { Building2 } from "lucide-react";

type AuthShellProps = {
  children: React.ReactNode;
};

/**
 * Quiet auth chrome: brand mark + centered content card. The page's own card
 * carries the heading and copy — the shell adds no marketing layer
 * (PRODUCT.md anti-references: no heroes, no gradient blobs, no fake status).
 */
export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-[30rem] space-y-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-display text-base font-semibold tracking-tight text-foreground">
              LECG Dashboard
            </p>
            <p className="text-xs text-muted-foreground">ACC · Forma · MTY operations</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
