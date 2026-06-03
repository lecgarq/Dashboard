import { loadInstanceView } from "@/lib/server/accessInstanceView";
import { roleCounts } from "./roleCounts";
import { RolesPieChart } from "./components/RolesPieChart";

export const metadata = { title: "Access Analysis" };
export const dynamic = "force-dynamic";

export default async function AccessAnalysisRoute() {
  const view = await loadInstanceView();
  const data = roleCounts(view);
  const assignments = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
        <h1 className="text-lg font-semibold text-zinc-100">Access Analysis</h1>
        <RolesPieChart data={data} assignments={assignments} />
      </div>
    </div>
  );
}
