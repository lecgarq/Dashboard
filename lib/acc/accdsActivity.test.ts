import { describe, it, expect, vi } from 'vitest';
import { splitWindows, fetchActivityWindow, crawlProjectActivity } from './accdsActivity';
import type { AccdsActivityRow } from './accdsActivityMap';

function row(id: string): AccdsActivityRow {
  return { activity_id: id, created_at: '2026-06-01T00:00:00.000Z', project_id: 'p1', activity_verb: 'view-entity', created_by: 'U1' };
}
function page(rows: AccdsActivityRow[], total: number, hasNext: boolean): Response {
  return new Response(
    JSON.stringify({ results: rows, pagination: { total_results: String(total), has_next_page: hasNext } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}
const getToken = async () => 'tok';

describe('splitWindows', () => {
  it('splits a 75-day span into 3 windows of <=30 days', () => {
    const w = splitWindows('2026-01-01T00:00:00.000Z', '2026-03-17T00:00:00.000Z', 30);
    expect(w.length).toBe(3);
    expect(w[0][0]).toBe('2026-01-01T00:00:00.000Z');
    expect(new Date(w[2][1]).toISOString()).toBe('2026-03-17T00:00:00.000Z');
    expect(w[0][1]).not.toBe(w[1][0]); // windows must not overlap at the seam
  });
});

describe('fetchActivityWindow', () => {
  it('parses results + pagination', async () => {
    const fetchImpl = vi.fn(async () => page([row('a')], 1, false));
    const res = await fetchActivityWindow({
      getToken, projectId: 'p1', startISO: 's', endISO: 'e', limit: 50, offset: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(res.results.map(r => r.activity_id)).toEqual(['a']);
    expect(res.total).toBe(1);
    expect(res.hasNextPage).toBe(false);
    const calledUrl = ((fetchImpl.mock.calls as unknown[])[0] as unknown[])[0] as string;
    expect(calledUrl).toContain('/accds/v0/projects/p1/data');
    expect(calledUrl).toContain('template=activities');
  });

  it('throws on 403', async () => {
    const fetchImpl = vi.fn(async () => new Response('forbidden', { status: 403 }));
    await expect(fetchActivityWindow({
      getToken, projectId: 'p1', startISO: 's', endISO: 'e', limit: 50, offset: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toThrow(/403/);
  });

  it('retries on 429 then succeeds', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(page([row('a')], 1, false));
    const res = await fetchActivityWindow({
      getToken, projectId: 'p1', startISO: 's', endISO: 'e', limit: 50, offset: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {},
    });
    expect(res.results.map(r => r.activity_id)).toEqual(['a']);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries on persistent 503', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));
    await expect(fetchActivityWindow({
      getToken, projectId: 'p1', startISO: 's', endISO: 'e', limit: 50, offset: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxAttempts: 2, sleep: async () => {},
    })).rejects.toThrow(/503/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('crawlProjectActivity', () => {
  it('pages through offsets within one window and collects all rows', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(page([row('a'), row('b')], 3, true))  // offset 0
      .mockResolvedValueOnce(page([row('c')], 3, false));          // offset 2
    const collected: string[] = [];
    const res = await crawlProjectActivity({
      getToken, projectId: 'p1',
      fromISO: '2026-06-01T00:00:00.000Z', toISO: '2026-06-15T00:00:00.000Z',
      pageSize: 2,
      onRows: async (rows) => { collected.push(...rows.map(r => r.activity_id)); },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(collected).toEqual(['a', 'b', 'c']);
    expect(res.fetched).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('advances offset by actual rows returned when API returns fewer than requested limit', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(page([row('a'), row('b')], 4, true))   // requested limit 10, API returns 2
      .mockResolvedValueOnce(page([row('c'), row('d')], 4, false)); // must be fetched at offset=2, not 10
    const collected: string[] = [];
    await crawlProjectActivity({
      getToken, projectId: 'p1',
      fromISO: '2026-06-01T00:00:00.000Z', toISO: '2026-06-15T00:00:00.000Z',
      pageSize: 10,
      onRows: async (rows) => { collected.push(...rows.map(r => r.activity_id)); },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(collected).toEqual(['a', 'b', 'c', 'd']);
    const secondUrl = fetchImpl.mock.calls[1][0] as string;
    expect(secondUrl).toContain('offset=2'); // NOT offset=10
  });

  it('fetches a window\'s pages in parallel (derived from total) when pageConcurrency > 1', async () => {
    // total=5, pageSize=2 -> first page at offset 0, then parallel offsets 2 and 4.
    const byOffset: Record<string, Response> = {
      '0': page([row('a'), row('b')], 5, true),
      '2': page([row('c'), row('d')], 5, true),
      '4': page([row('e')], 5, false),
    };
    const fetchImpl = vi.fn(async (url: string) => byOffset[String(url).match(/offset=(\d+)/)![1]]);
    const collected: string[] = [];
    const res = await crawlProjectActivity({
      getToken, projectId: 'p1',
      fromISO: '2026-06-01T00:00:00.000Z', toISO: '2026-06-10T00:00:00.000Z',
      pageSize: 2, pageConcurrency: 4,
      onRows: async (rows) => { collected.push(...rows.map(r => r.activity_id)); },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect([...collected].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(res.fetched).toBe(5);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // offsets 0, 2, 4 — each once
  });
});
