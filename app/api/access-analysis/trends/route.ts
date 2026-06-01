import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { loadInstanceView } from "@/lib/server/accessInstanceView";
import { filterInstances } from "@/app/(dashboard)/access-analysis/filters";
import { parseFilters } from "@/app/(dashboard)/access-analysis/filterParams";
import { bucketByMonth } from "@/app/(dashboard)/access-analysis/trends";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const filters = parseFilters(new URL(request.url).searchParams.get("filters"));
  const view = filterInstances(await loadInstanceView(), filters);

  // Access added per month, from the filtered instance view.
  const accessAdded = bucketByMonth(view.map((v) => v.addedOn ?? "").filter(Boolean));

  // Activity per week, aggregated in SQL (date_trunc) scoped to the filtered users' emails.
  const emails = [...new Set(view.map((v) => v.email).filter(Boolean))];
  const activityPerWeek = emails.length
    ? await db.$queryRaw<Array<{ label: string; value: number }>>`
        SELECT to_char(date_trunc('week', "createdAt"), 'IYYY-"W"IW') AS label,
               count(*)::int AS value
        FROM "AccActivity"
        WHERE "userEmail" IN (${Prisma.join(emails)})
        GROUP BY label
        ORDER BY label
      `
    : [];

  return NextResponse.json({ activityPerWeek, accessAdded });
}
