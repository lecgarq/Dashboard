import { NextResponse } from "next/server";
import { loadInstanceView } from "@/lib/server/accessInstanceView";
import { filterInstances } from "@/app/(dashboard)/access-analysis/filters";
import { parseFilters } from "@/app/(dashboard)/access-analysis/filterParams";
import { toCsv, instanceToRow } from "@/app/(dashboard)/access-analysis/csv";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filters = parseFilters(url.searchParams.get("filters"));
  const rows = filterInstances(await loadInstanceView(), filters);

  if (url.searchParams.get("format") === "csv") {
    const csv = toCsv(rows.map(instanceToRow));
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="access-analysis.csv"' },
    });
  }

  const page = Math.max(0, Number(url.searchParams.get("page") ?? 0));
  const size = Math.min(200, Math.max(1, Number(url.searchParams.get("size") ?? 50)));
  const start = page * size;
  return NextResponse.json({
    total: rows.length,
    page,
    size,
    rows: rows.slice(start, start + size).map(instanceToRow),
  });
}
