import { NextResponse } from "next/server";
import { loadInstanceView } from "@/lib/server/accessInstanceView";
import { filterInstances } from "@/app/(dashboard)/access-analysis/filters";
import { parseFilters } from "@/app/(dashboard)/access-analysis/filterParams";
import { buildUserRows } from "@/app/(dashboard)/access-analysis/userRows";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filters = parseFilters(url.searchParams.get("filters"));
  // Filter at the (user, project) instance grain, then collapse to one row per user.
  const users = buildUserRows(filterInstances(await loadInstanceView(), filters));

  const page = Math.max(0, Number(url.searchParams.get("page") ?? 0));
  const size = Math.min(200, Math.max(1, Number(url.searchParams.get("size") ?? 50)));
  const start = page * size;
  return NextResponse.json({
    total: users.length,
    page,
    size,
    rows: users.slice(start, start + size),
  });
}
