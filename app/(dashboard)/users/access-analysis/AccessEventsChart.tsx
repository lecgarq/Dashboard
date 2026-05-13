"use client";

import { ResponsiveStream } from "@nivo/stream";
import { trpc } from "@/lib/core/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { CHANGE_STREAM_META, CHANGE_STREAMS } from "@/lib/acc/accessAnalysisTypes";
import { useAccessAnalysis } from "./AccessAnalysisContext";

export function AccessEventsChart() {
  const { window } = useAccessAnalysis();
  const query = trpc.accActivity.getTimeline.useQuery({ window }, { staleTime: 300_000 });

  if (query.isLoading || !query.data) {
    return <Skeleton className="h-[400px] w-full" />;
  }
  if (query.error) {
    return <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Failed to load timeline: {query.error.message}</div>;
  }

  const data = query.data.points.map((p) => ({
    membership: p.membership,
    permission: p.permission,
    project: p.project,
    admin: p.admin,
  }));

  const hasAnyData = data.some((d) => d.membership + d.permission + d.project + d.admin > 0);
  if (!hasAnyData) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center rounded-md border border-dashed text-center">
        <p className="text-base font-medium">No access events in this window</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {query.data.dataEarliestEvent
            ? `Earliest data: ${new Date(query.data.dataEarliestEvent).toISOString().slice(0, 10)}`
            : "No activity data has been ingested yet."}
        </p>
      </div>
    );
  }

  const colors = CHANGE_STREAMS.map((id) => CHANGE_STREAM_META[id].color);

  return (
    <div className="h-[400px] w-full">
      <ResponsiveStream
        data={data}
        keys={[...CHANGE_STREAMS]}
        margin={{ top: 16, right: 24, bottom: 48, left: 48 }}
        axisBottom={{
          tickSize: 5,
          tickPadding: 5,
          format: (i) => {
            const point = query.data!.points[i as number];
            if (!point) return "";
            const d = new Date(point.bucket);
            return d.toISOString().slice(5, 10);
          },
        }}
        axisLeft={{ tickSize: 5, tickPadding: 5 }}
        offsetType="diverging"
        colors={colors}
        fillOpacity={0.85}
        borderColor={{ theme: "background" }}
        enableGridX={false}
        enableGridY={true}
        legends={[
          {
            anchor: "bottom",
            direction: "row",
            translateY: 40,
            itemWidth: 110,
            itemHeight: 16,
            itemTextColor: "currentColor",
            symbolSize: 12,
            symbolShape: "circle",
          },
        ]}
      />
    </div>
  );
}
