import type { AccdsActivityRow } from './accdsActivityMap';

const ACCDS_BASE = 'https://developer.api.autodesk.com/accds/v0/projects';

export interface AccdsPage {
  results: AccdsActivityRow[];
  total: number;
  hasNextPage: boolean;
}

/** Split [fromISO, toISO] into consecutive windows of at most `maxDays` (accds rejects wider). */
export function splitWindows(fromISO: string, toISO: string, maxDays = 30): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let start = new Date(fromISO).getTime();
  const end = new Date(toISO).getTime();
  const stepMs = maxDays * 24 * 60 * 60 * 1000;
  while (start < end) {
    const next = Math.min(start + stepMs, end);
    // accds filter[created_at]=a..b may be inclusive on both ends; step non-final
    // window ends back 1ms so a boundary-timestamp row can't land in two windows.
    const windowEnd = next < end ? next - 1 : end;
    out.push([new Date(start).toISOString(), new Date(windowEnd).toISOString()]);
    start = next;
  }
  return out;
}

export async function fetchActivityWindow(args: {
  getToken: () => Promise<string>;
  projectId: string;
  startISO: string;
  endISO: string;
  limit: number;
  offset: number;
  fetchImpl?: typeof fetch;
}): Promise<AccdsPage> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const token = await args.getToken();
  const url =
    `${ACCDS_BASE}/${encodeURIComponent(args.projectId)}/data?template=activities` +
    `&filter[created_at]=${args.startISO}..${args.endISO}` +
    `&limit=${args.limit}&offset=${args.offset}`;
  // region: 'US' matches the account's data residency; make it a param if EU projects are ever crawled.
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, region: 'US' } });
  if (!res.ok) throw new Error(`accds ${res.status} for project ${args.projectId}`);
  const json = (await res.json()) as {
    results?: AccdsActivityRow[];
    pagination?: { total_results?: string; has_next_page?: boolean };
  };
  return {
    results: json.results ?? [],
    total: Number(json.pagination?.total_results ?? 0),
    hasNextPage: Boolean(json.pagination?.has_next_page),
  };
}

/** Crawl one project's activity across the date range, streaming pages to onRows. */
export async function crawlProjectActivity(args: {
  getToken: () => Promise<string>;
  projectId: string;
  fromISO: string;
  toISO: string;
  onRows: (rows: AccdsActivityRow[]) => Promise<void>;
  pageSize?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ projectId: string; fetched: number }> {
  const pageSize = args.pageSize ?? 200;
  let fetched = 0;
  for (const [startISO, endISO] of splitWindows(args.fromISO, args.toISO)) {
    let offset = 0;
    for (;;) {
      const page = await fetchActivityWindow({
        getToken: args.getToken,
        projectId: args.projectId,
        startISO,
        endISO,
        limit: pageSize,
        offset,
        fetchImpl: args.fetchImpl,
      });
      if (page.results.length) {
        await args.onRows(page.results);
        fetched += page.results.length;
      }
      if (!page.hasNextPage || page.results.length === 0) break;
      offset += pageSize;
    }
  }
  return { projectId: args.projectId, fetched };
}
