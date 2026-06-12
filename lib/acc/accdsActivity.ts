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
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<AccdsPage> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const maxAttempts = args.maxAttempts ?? 4;
  const sleep = args.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const token = await args.getToken();
  const url =
    `${ACCDS_BASE}/${encodeURIComponent(args.projectId)}/data?template=activities` +
    `&filter[created_at]=${args.startISO}..${args.endISO}` +
    `&limit=${args.limit}&offset=${args.offset}`;
  for (let attempt = 0; ; attempt++) {
    // region: 'US' matches the account's data residency; make it a param if EU projects are ever crawled.
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, region: 'US' } });
    if (res.ok) {
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
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < maxAttempts - 1) {
      const ra = Number(res.headers.get('retry-after'));
      const waitMs = Number.isFinite(ra) && ra > 0
        ? Math.min(60_000, ra * 1000)
        : Math.min(30_000, 1000 * 2 ** attempt);
      await sleep(waitMs);
      continue;
    }
    throw new Error(`accds ${res.status} for project ${args.projectId}`);
  }
}

/** Run `fn` over items with bounded concurrency, preserving result order. */
async function mapLimit<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}

/**
 * Crawl one project's activity across the date range, streaming pages to onRows.
 * `pageConcurrency` > 1 fetches a window's pages in parallel (derived from the
 * window's total_results) instead of one-at-a-time — the main throughput lever.
 */
export async function crawlProjectActivity(args: {
  getToken: () => Promise<string>;
  projectId: string;
  fromISO: string;
  toISO: string;
  onRows: (rows: AccdsActivityRow[]) => Promise<void>;
  pageSize?: number;
  pageConcurrency?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ projectId: string; fetched: number }> {
  const pageSize = args.pageSize ?? 100;
  const pageConcurrency = args.pageConcurrency ?? 1;
  let fetched = 0;
  const fetchPage = (startISO: string, endISO: string, offset: number) =>
    fetchActivityWindow({
      getToken: args.getToken,
      projectId: args.projectId,
      startISO,
      endISO,
      limit: pageSize,
      offset,
      fetchImpl: args.fetchImpl,
    });

  for (const [startISO, endISO] of splitWindows(args.fromISO, args.toISO)) {
    // First page tells us the window total (and whether there's more).
    const first = await fetchPage(startISO, endISO, 0);
    if (first.results.length) {
      await args.onRows(first.results);
      fetched += first.results.length;
    }
    if (!first.hasNextPage || first.results.length === 0) continue;

    if (pageConcurrency <= 1) {
      // Sequential: advance by rows actually returned (the API caps pages at 100
      // regardless of the requested limit, so advancing by pageSize would skip rows).
      let offset = first.results.length;
      for (;;) {
        const page = await fetchPage(startISO, endISO, offset);
        if (page.results.length) {
          await args.onRows(page.results);
          fetched += page.results.length;
        }
        if (!page.hasNextPage || page.results.length === 0) break;
        offset += page.results.length;
      }
    } else {
      // Parallel: derive every remaining offset from the window total and fetch
      // them concurrently instead of waiting on each page's has_next_page.
      const offsets: number[] = [];
      for (let o = first.results.length; o < first.total; o += pageSize) offsets.push(o);
      const pages = await mapLimit(offsets, pageConcurrency, (o) => fetchPage(startISO, endISO, o));
      for (const page of pages) {
        if (page.results.length) {
          await args.onRows(page.results);
          fetched += page.results.length;
        }
      }
    }
  }
  return { projectId: args.projectId, fetched };
}
