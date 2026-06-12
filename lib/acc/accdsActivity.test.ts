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
});
