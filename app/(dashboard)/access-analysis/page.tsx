import { loadInstanceView } from "@/lib/server/accessInstanceView";
import { summarizeRoles, collapseToTopSlices } from "./roleCounts";
import { RolesPieChart } from "./components/RolesPieChart";

export const metadata = { title: "Access Analysis" };
export const dynamic = "force-dynamic";

// Roles shown individually on the donut; the rest fold into "Other (N roles)".
const TOP_ROLES = 8;

export default async function AccessAnalysisRoute() {
  const view = await loadInstanceView();
  const { slices, distinctRoles } = summarizeRoles(view);
  const data = collapseToTopSlices(slices, TOP_ROLES);
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
        <h1 className="text-lg font-semibold text-zinc-100">Access Analysis</h1>
        <RolesPieChart data={data} distinctRoles={distinctRoles} />
      </div>
    </div>
  );
}
