// app/(dashboard)/template-mty/components/TemplateMembersTable.tsx
import type { TemplateMember } from "@/lib/server/templateView";

export function TemplateMembersTable({ members }: { members: TemplateMember[] }) {
  if (members.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        No members found for this template.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft-xl">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 font-medium">Member</th>
            <th className="px-4 py-2 font-medium">Role</th>
            <th className="px-4 py-2 font-medium">Company</th>
            <th className="px-4 py-2 font-medium">Access</th>
            <th className="px-4 py-2 font-medium">Origin</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.email} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
              <td className="px-4 py-2">
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{m.name}</span>
                  <span className="text-xs text-muted-foreground">{m.email}</span>
                </div>
              </td>
              <td className="px-4 py-2 text-foreground/90">
                {m.role ? m.role : <span className="text-muted-foreground">No role</span>}
              </td>
              <td className="px-4 py-2 text-foreground/90">{m.company || <span className="text-muted-foreground">—</span>}</td>
              <td className="px-4 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  m.isAdmin
                    ? "border border-primary/40 bg-primary/10 text-primary"
                    : "bg-muted/60 text-muted-foreground"
                }`}>
                  {m.accessLevel}
                </span>
              </td>
              <td className="px-4 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  m.isInternal ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                }`}>
                  {m.isInternal ? "Internal" : "External"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
