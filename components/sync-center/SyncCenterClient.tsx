"use client";

import { useMemo, useState } from "react";

import { trpc } from "@/lib/core/trpc";
import {
  SyncCenterStatusPanel,
  type SyncCenterStatusViewModel,
} from "./SyncCenterStatusPanel";

const REFRESH_MS = 15_000;

export function SyncCenterClient() {
  const [actionError, setActionError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const status = trpc.accSync.getSyncCenterStatus.useQuery(undefined, {
    refetchInterval: REFRESH_MS,
    staleTime: 5_000,
  });

  const invalidate = async () => {
    setActionError(null);
    await utils.accSync.getSyncCenterStatus.invalidate();
    await utils.accSync.getDcIngestStatus.invalidate();
  };

  const mutationOptions = {
    onSuccess: invalidate,
    onError: (err: { message: string }) => setActionError(err.message),
  };

  const startDaily = trpc.accSync.startDailyExtraction.useMutation(mutationOptions);
  const resumeBackfill = trpc.accSync.resumeBackfill.useMutation(mutationOptions);
  const pause = trpc.accSync.pauseExtraction.useMutation(mutationOptions);
  const resume = trpc.accSync.resumeExtraction.useMutation(mutationOptions);
  const retry = trpc.accSync.retryFailedJob.useMutation(mutationOptions);

  const data = useMemo<SyncCenterStatusViewModel>(() => {
    if (status.data) return status.data;
    return {
      status: "idle",
      activeJobId: null,
      activeRequestId: null,
      elapsedTime: "0 seconds",
      estimatedRemainingTime: null,
      completionEstimateDuration: null,
      completionEstimateTime: null,
      quotaUsedToday: 0,
      quotaRemainingToday: 0,
      dailyQuotaCap: 25,
      dailySafeRequestBudget: 20,
      reserveRequests: 5,
      nextSafeRunTime: null,
      plannedRequests: 0,
      runnableRequestsToday: 0,
      deferredRequests: 0,
      paused: false,
      latestLogs: [],
      latestErrors: actionError ? [actionError] : [],
      unknownModulesSeen: [],
    };
  }, [actionError, status.data]);

  const isBusy =
    status.isLoading ||
    startDaily.isPending ||
    resumeBackfill.isPending ||
    pause.isPending ||
    resume.isPending ||
    retry.isPending;

  return (
    <SyncCenterStatusPanel
      data={{
        ...data,
        latestErrors: actionError
          ? [actionError, ...data.latestErrors]
          : data.latestErrors,
      }}
      isBusy={isBusy}
      onStartDaily={() => startDaily.mutate()}
      onResumeBackfill={() => resumeBackfill.mutate()}
      onPause={() => pause.mutate()}
      onResume={() => resume.mutate()}
      onRetry={() => retry.mutate()}
      onOpenLogs={() => {
        void status.refetch();
        window.location.hash = "logs";
      }}
    />
  );
}
