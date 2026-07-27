export const ISSUE_DELETED_FILTER_PASSES = [false, true] as const;

export type IssueDeletedFilter = (typeof ISSUE_DELETED_FILTER_PASSES)[number];

export function buildIssueListUrl(input: {
  baseUrl: string;
  projectId: string;
  limit: number;
  offset: number;
  deleted: IssueDeletedFilter;
}): string {
  const params = new URLSearchParams();
  params.set("limit", String(input.limit));
  params.set("offset", String(input.offset));
  params.set("filter[deleted]", input.deleted ? "true" : "false");

  const baseUrl = input.baseUrl.replace(/\/+$/, "");
  return `${baseUrl}/construction/issues/v1/projects/${encodeURIComponent(input.projectId)}/issues?${params.toString()}`;
}
