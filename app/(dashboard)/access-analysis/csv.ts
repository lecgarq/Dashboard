export interface MemberRow {
  name: string; email: string; project: string; role: string;
  access: string; type: string; company: string; status: string; addedOn: string;
}

const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function toCsv(rows: MemberRow[]): string {
  const header = ["Name", "Email", "Project", "Role", "Access", "Type", "Company", "Status", "Added"];
  const lines = rows.map((r) =>
    [r.name, r.email, r.project, r.role, r.access, r.type, r.company, r.status, r.addedOn].map((v) => esc(String(v ?? ""))).join(","),
  );
  return [header.join(","), ...lines].join("\n") + "\n";
}

export const instanceToRow = (i: {
  name: string; email: string; projectName: string; roles: string[]; isAdmin: boolean;
  isInternal: boolean; company: string | null; status: string | null; addedOn: string | null;
}): MemberRow => ({
  name: i.name, email: i.email, project: i.projectName, role: i.roles.join("; "),
  access: i.isAdmin ? "Admin" : "Member", type: i.isInternal ? "Internal" : "External",
  company: i.company ?? "", status: i.status ?? "", addedOn: i.addedOn ?? "",
});
