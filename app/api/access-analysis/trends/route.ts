import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { loadInstanceView } from "@/lib/server/accessInstanceView";
import { filterInstances } from "@/app/(dashboard)/access-analysis/filters";
import { parseFilters } from "@/app/(dashboard)/access-analysis/filterParams";
import { bucketByWeek, bucketByMonth } from "@/app/(dashboard)/access-analysis/trends";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const filters = parseFilters(new URL(request.url).searchParams.get("filters"));
  const view = filterInstances(await loadInstanceView(), filters);

  // Access added per month, from the filtered instance view.
  const accessAdded = bucketByMonth(view.map((v) => v.addedOn ?? "").filter(Boolean));

  // Activity per week, scoped to the filtered users' emails.
  const emails = [...new Set(view.map((v) => v.email).filter(Boolean))];
  const activityRows = emails.length
    ? await db.accActivity.findMany({
        where: { userEmail: { in: emails } },
        select: { createdAt: true },
      })
    : [];
  const activityPerWeek = bucketByWeek(activityRows.map((r) => r.createdAt.toISOString()));

  return NextResponse.json({ activityPerWeek, accessAdded });
}
