type IssueProjectFetchStatus =
  | "ok"
  | "zero_issues"
  | "forbidden"
  | "error";

export interface IssueProjectFetchResultInput {
  runId: string;
  projectId: string;
  projectName: string | null;
  issueCount?: number;
  coordinationCount?: number;
  forbidden?: boolean;
  errorMessage?: string | null;
  startedAt: Date;
  finishedAt: Date;
}

export interface IssueProjectFetchResult {
  runId: string;
  projectId: string;
  projectName: string | null;
  status: IssueProjectFetchStatus;
  issueCount: number;
  coordinationCount: number;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date;
}

export interface IssueProjectFetchSummary {
  total: number;
  ok: number;
  zeroIssues: number;
  forbidden: number;
  error: number;
  fetchedOk: number;
  issueRows: number;
  coordinationRows: number;
}

function clampCount(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value ?? 0));
}

export function buildIssueProjectFetchResult(
  input: IssueProjectFetchResultInput,
): IssueProjectFetchResult {
  const errorMessage = input.errorMessage?.slice(0, 1000) ?? null;
  const issueCount = clampCount(input.issueCount);
  const coordinationCount = clampCount(input.coordinationCount);

  let status: IssueProjectFetchStatus = "ok";
  if (input.forbidden) {
    status = "forbidden";
  } else if (errorMessage) {
    status = "error";
  } else if (issueCount === 0) {
    status = "zero_issues";
  }

  return {
    runId: input.runId,
    projectId: input.projectId,
    projectName: input.projectName,
    status,
    issueCount: status === "forbidden" || status === "error" ? 0 : issueCount,
    coordinationCount:
      status === "forbidden" || status === "error" ? 0 : coordinationCount,
    errorMessage,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
  };
}

export function summarizeIssueProjectFetchResults(
  results: IssueProjectFetchResult[],
): IssueProjectFetchSummary {
  const summary: IssueProjectFetchSummary = {
    total: results.length,
    ok: 0,
    zeroIssues: 0,
    forbidden: 0,
    error: 0,
    fetchedOk: 0,
    issueRows: 0,
    coordinationRows: 0,
  };

  for (const result of results) {
    switch (result.status) {
      case "ok":
        summary.ok++;
        summary.fetchedOk++;
        break;
      case "zero_issues":
        summary.zeroIssues++;
        summary.fetchedOk++;
        break;
      case "forbidden":
        summary.forbidden++;
        break;
      case "error":
        summary.error++;
        break;
    }
    summary.issueRows += result.issueCount;
    summary.coordinationRows += result.coordinationCount;
  }

  return summary;
}
