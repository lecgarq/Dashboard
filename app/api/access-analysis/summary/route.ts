import { NextResponse } from "next/server";
import { loadInstanceView } from "@/lib/server/accessInstanceView";
import { filterInstances } from "@/app/(dashboard)/access-analysis/filters";
import { buildSummary } from "@/app/(dashboard)/access-analysis/aggregations";
import { parseFilters } from "@/app/(dashboard)/access-analysis/filterParams";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const filters = parseFilters(new URL(request.url).searchParams.get("filters"));
  const view = await loadInstanceView();
  const summary = buildSummary(filterInstances(view, filters));
  return NextResponse.json(summary);
}
