"use client";

import * as React from "react";
import { trpc } from "@/lib/core/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CHANGE_STREAM_META, type ChangeStreamId } from "@/lib/acc/accessAnalysisTypes";
import { useAccessAnalysis } from "./AccessAnalysisContext";

interface ChangeStreamCardProps {
  stream: ChangeStreamId;
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length === 0) return null;
  const w = 128;
  const h = 40;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const points = values.map((v, i) => `${i * step},${h - (v / max) * h}`).join(" ");
  const areaPoints = `0,${h} ${points} ${(values.length - 1) * step},${h}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polygon points={areaPoints} fill={color} fillOpacity="0.25" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

export function ChangeStreamCard({ stream }: ChangeStreamCardProps) {
  const meta = CHANGE_STREAM_META[stream];
  const { window, setDirectoryFilter, setDirectoryOpen } = useAccessAnalysis();

  const timeline = trpc.accActivity.getTimeline.useQuery({ window }, { staleTime: 300_000 });
  const headline = trpc.accActivity.getHeadlineEvent.useQuery({ window, stream }, { staleTime: 300_000 });

  const values = React.useMemo<number[]>(() => {
    if (!timeline.data) return [];
    return timeline.data.points.map((p) => p[stream]);
  }, [timeline.data, stream]);

  const total = values.reduce((sum, v) => sum + v, 0);

  return (
    <Card className="flex flex-col gap-3 px-4 py-4">
      <div className="flex flex-row items-center gap-2">
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ backgroundColor: meta.color }}
          aria-hidden
        />
        <h3 className="text-sm font-semibold uppercase tracking-wide">{meta.label}</h3>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-3xl font-semibold tabular-nums">{total.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">{meta.description}</div>
        </div>
        <div className="h-10 w-32">
          {timeline.isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <Sparkline values={values} color={meta.color} />
          )}
        </div>
      </div>
      {headline.isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : headline.data ? (
        <div className="rounded-md bg-muted/40 p-3 text-sm">
          <div className="text-xs font-medium text-muted-foreground">Headline</div>
          <div className="mt-1">{headline.data.headline}</div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground text-center">
          No events in this window
        </div>
      )}
      <Button
        variant="link"
        className="p-0 h-auto text-sm self-start"
        onClick={() => {
          setDirectoryFilter({ stream });
          setDirectoryOpen(true);
          requestAnimationFrame(() => {
            document.getElementById("directory-accordion")?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }}
      >
        See all changes →
      </Button>
    </Card>
  );
}
