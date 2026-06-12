import { describe, it, expect, vi } from 'vitest';
import {
  cookieHeaderFromStorageState,
  fetchFreshToken,
  createTokenProvider,
  SessionExpiredError,
} from './accdsToken';

// A JWT whose payload sets exp; signature is irrelevant (we only decode).
function jwt(expSec: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: expSec })).toString('base64url');
  return `${header}.${payload}.sig`;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('cookieHeaderFromStorageState', () => {
  it('keeps autodesk.com cookies, drops others, dedups by name', () => {
    const header = cookieHeaderFromStorageState({
      cookies: [
        { name: 'a', value: '1', domain: '.acc.autodesk.com' },
        { name: 'b', value: '2', domain: 'login.acc.autodesk.com' },
        { name: 'junk', value: 'x', domain: '.google.com' },
        { name: 'a', value: '3', domain: '.autodesk.com' }, // later wins
      ],
    });
    expect(header).toContain('a=3');
    expect(header).toContain('b=2');
    expect(header).not.toContain('junk');
  });
});

describe('fetchFreshToken', () => {
  it('returns accessToken + exp from the refresh endpoint', async () => {
    const token = jwt(2_000_000_000);
    const fetchImpl = vi.fn(async () => jsonResponse({ accessToken: token }));
    const res = await fetchFreshToken('a=1', fetchImpl as unknown as typeof fetch);
    expect(res.accessToken).toBe(token);
    expect(res.expSec).toBe(2_000_000_000);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('throws SessionExpiredError on 401', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 }));
    await expect(fetchFreshToken('a=1', fetchImpl as unknown as typeof fetch))
      .rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('throws SessionExpiredError on a 302 login redirect', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 302, headers: { location: 'https://signin.autodesk.com/' } }));
    await expect(fetchFreshToken('a=1', fetchImpl as unknown as typeof fetch))
      .rejects.toBeInstanceOf(SessionExpiredError);
  });
});

describe('createTokenProvider', () => {
  it('caches the token until ~60s before expiry, then refetches', async () => {
    let now = 1_000;
    const tokenA = jwt(1_000 + 1_000); // expires at 2000
    const tokenB = jwt(1_000 + 5_000);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ accessToken: tokenA }))
      .mockResolvedValueOnce(jsonResponse({ accessToken: tokenB }));
    const getToken = createTokenProvider('a=1', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      nowSec: () => now,
    });
    expect(await getToken()).toBe(tokenA);   // fetch #1
    expect(await getToken()).toBe(tokenA);   // cached, no fetch
    now = 1_990;                             // within 60s of exp (2000)
    expect(await getToken()).toBe(tokenB);   // fetch #2
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('collapses concurrent refreshes into a single fetch', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const fetchImpl = vi.fn(async () => { await gate; return jsonResponse({ accessToken: jwt(2_000_000_000) }); });
    const getToken = createTokenProvider('a=1', { fetchImpl: fetchImpl as unknown as typeof fetch });
    const both = Promise.all([getToken(), getToken()]); // both start while no token cached
    release();
    const [t1, t2] = await both;
    expect(t1).toBe(t2);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // one refresh served both callers
  });
});
