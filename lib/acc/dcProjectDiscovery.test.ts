/**
 * Phase 8 plan 08-09 — dcProjectDiscovery unit tests (TDD RED → GREEN).
 *
 * All tests mock `fetchImpl` so no real APS calls are made.
 * Tests cover: happy path, pagination, local filter, error handling,
 * missing pagination, and the infinite-loop guard.
 */
import { describe, it, expect, vi } from 'vitest';

import { discoverAdminProjects } from './dcProjectDiscovery';

// ---------------------------------------------------------------------------
// Helper — build a mock fetch that returns the given pages in sequence
// ---------------------------------------------------------------------------

function makeFetchMock(pages: unknown[]) {
  let call = 0;
  return vi.fn().mockImplementation(async () => {
    const data = pages[call++] ?? { results: [], pagination: { limit: 200, totalResults: 0 } };
    return {
      ok: true,
      status: 200,
      json: async () => data,
    };
  });
}

// ---------------------------------------------------------------------------
// Test 1: happy path — single page, mixed access levels
// ---------------------------------------------------------------------------

describe('discoverAdminProjects', () => {
  it('happy path — single page, filters to projectAdmin=true only', async () => {
    const mockFetch = makeFetchMock([
      {
        results: [
          { id: 'p1', name: 'Project 1', status: 'active', createdAt: '2024-01-01T00:00:00Z', accessLevels: { projectAdmin: true } },
          { id: 'p2', name: 'Project 2', status: 'active', createdAt: '2024-01-02T00:00:00Z', accessLevels: { projectAdmin: false } },
        ],
        pagination: { limit: 200, totalResults: 2 },
      },
    ]);

    const result = await discoverAdminProjects({
      accountId: 'acc1',
      userId: 'u1',
      token2Leg: 'tkn',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    // Only the projectAdmin=true record is returned.
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p1');

    // Exactly one fetch call was made.
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // URL must contain the correct path with offset=0.
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/accounts/acc1/users/u1/projects?limit=200&offset=0');

    // Authorization header must be sent.
    const calledInit = mockFetch.mock.calls[0][1] as RequestInit;
    expect((calledInit.headers as Record<string, string>).Authorization).toBe('Bearer tkn');
  });

  // -------------------------------------------------------------------------
  // Test 2: pagination — two pages
  // -------------------------------------------------------------------------

  it('pagination — fetches two pages when totalResults > page size', async () => {
    // Build 200 admin projects for page 1 and 150 for page 2.
    const page1Results = Array.from({ length: 200 }, (_, i) => ({
      id: `p${i}`,
      name: `Project ${i}`,
      status: 'active',
      createdAt: '2024-01-01T00:00:00Z',
      accessLevels: { projectAdmin: true },
    }));
    const page2Results = Array.from({ length: 150 }, (_, i) => ({
      id: `p${200 + i}`,
      name: `Project ${200 + i}`,
      status: 'active',
      createdAt: '2024-01-01T00:00:00Z',
      accessLevels: { projectAdmin: true },
    }));

    const mockFetch = makeFetchMock([
      { results: page1Results, pagination: { limit: 200, totalResults: 350 } },
      { results: page2Results, pagination: { limit: 200, totalResults: 350 } },
    ]);

    const result = await discoverAdminProjects({
      accountId: 'acc1',
      userId: 'u1',
      token2Leg: 'tkn',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result).toHaveLength(350);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // First call offset=0, second call offset=200.
    expect(mockFetch.mock.calls[0][0]).toContain('offset=0');
    expect(mockFetch.mock.calls[1][0]).toContain('offset=200');
  });

  // -------------------------------------------------------------------------
  // Test 3: local filter must NOT trust server filter
  // -------------------------------------------------------------------------

  it('local filter — excludes projectAdmin=false and missing accessLevels', async () => {
    const mockFetch = makeFetchMock([
      {
        results: [
          { id: 'p1', name: 'A', status: 'active', createdAt: '2024-01-01T00:00:00Z', accessLevels: { projectAdmin: true } },
          { id: 'p2', name: 'B', status: 'active', createdAt: '2024-01-01T00:00:00Z', accessLevels: { projectAdmin: false } },
          { id: 'p3', name: 'C', status: 'active', createdAt: '2024-01-01T00:00:00Z', accessLevels: { projectAdmin: true } },
          { id: 'p4', name: 'D', status: 'active', createdAt: '2024-01-01T00:00:00Z', accessLevels: { projectAdmin: false } },
          { id: 'p5', name: 'E', status: 'active', createdAt: '2024-01-01T00:00:00Z' /* no accessLevels */ },
        ],
        pagination: { limit: 200, totalResults: 5 },
      },
    ]);

    const result = await discoverAdminProjects({
      accountId: 'acc1',
      userId: 'u1',
      token2Leg: 'tkn',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(['p1', 'p3']);
  });

  // -------------------------------------------------------------------------
  // Test 4: error — non-2xx response (no results field)
  // -------------------------------------------------------------------------

  it('error — rejects with message containing "user-projects failed" + status code on 401', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ errors: [{ title: 'unauthorized' }] }),
    });

    await expect(
      discoverAdminProjects({
        accountId: 'acc1',
        userId: 'u1',
        token2Leg: 'bad-token',
        fetchImpl: mockFetch as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/user-projects failed/);

    // Confirm the status code is in the error message.
    try {
      await discoverAdminProjects({
        accountId: 'acc1',
        userId: 'u1',
        token2Leg: 'bad-token',
        fetchImpl: mockFetch as unknown as typeof fetch,
      });
    } catch (err) {
      expect((err as Error).message).toContain('401');
    }
  });

  // -------------------------------------------------------------------------
  // Test 5: error — totalResults missing (defensive)
  // -------------------------------------------------------------------------

  it('defensive — completes when pagination object is missing', async () => {
    const mockFetch = makeFetchMock([
      {
        results: [
          { id: 'p1', name: 'A', status: 'active', createdAt: '2024-01-01T00:00:00Z', accessLevels: { projectAdmin: true } },
        ],
        // No pagination object at all.
      },
    ]);

    const result = await discoverAdminProjects({
      accountId: 'acc1',
      userId: 'u1',
      token2Leg: 'tkn',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    // Should complete and return the filtered result.
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p1');
    // Only one fetch call (treated as last page).
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Test 6: pagination guard — never infinite-loops
  // -------------------------------------------------------------------------

  it('pagination guard — terminates early when page returns 0 results', async () => {
    // Mock always returns 0 results but totalResults=1_000_000 (broken metadata).
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [], pagination: { limit: 200, totalResults: 1_000_000 } }),
    });

    const result = await discoverAdminProjects({
      accountId: 'acc1',
      userId: 'u1',
      token2Leg: 'tkn',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    // Function should terminate (results empty → guard kicks in).
    expect(result).toHaveLength(0);
    // At most 2 calls before guard terminates the loop.
    expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
