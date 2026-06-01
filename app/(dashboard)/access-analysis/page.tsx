import { loadInstanceView } from "@/lib/server/accessInstanceView";
import { AccessAnalysisDashboard } from "./AccessAnalysisDashboard";

export const metadata = { title: "Access Analysis" };
export const dynamic = "force-dynamic";

export default async function AccessAnalysisRoute() {
  const view = await loadInstanceView();
  const projects = [...new Map(view.map((v) => [v.projectId, v.projectName])).entries()].map(([value, label]) => ({ value, label }));
  const companies = [...new Set(view.map((v) => v.company).filter(Boolean) as string[])].sort().map((c) => ({ value: c, label: c }));
  const roles = [...new Set(view.flatMap((v) => v.roles))].sort().map((r) => ({ value: r, label: r }));
  return (
    <AccessAnalysisDashboard
      filterOptions={{ projects, companies, roles }}
      projectTotal={1152}
    />
  );
}
