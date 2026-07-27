import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  cookieHeaderFromStorageState,
  fetchFreshToken,
  createTokenProvider,
  SessionExpiredError,
  getSessionHealth,
  SESSION_WARN_HOURS,
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

// Helper: write a temp Playwright storageState JSON to os.tmpdir() and return its path.
// cookie values use obvious fixture sentinels that must never appear in getSessionHealth output.
async function tmpSession(
  cookies: Array<{ name: string; value: string; domain: string; expires?: number }>,
): Promise<string> {
  const p = join(tmpdir(), `accds-test-${Date.now()}-${Math.random()}.json`);
  await writeFile(p, JSON.stringify({ cookies }));
  return p;
}

describe('getSessionHealth', () => {
  const created: string[] = [];
  afterEach(async () => {
    for (const f of created.splice(0)) {
      await unlink(f).catch(() => {});
    }
  });

  it('state=healthy when cookie expires > 12h from now (48h fixture)', async () => {
    const nowMs = Date.now();
    const expires = Math.floor((nowMs + 48 * 3600 * 1000) / 1000);
    const p = await tmpSession([{ name: 'auth', value: 'FIXTURE_VALUE_48H', domain: '.autodesk.com', expires }]);
    created.push(p);
    const h = await getSessionHealth(p);
    expect(h.state).toBe('healthy');
    expect(h.hoursRemaining).toBeGreaterThan(SESSION_WARN_HOURS);
    expect(h.estimate).toBe(true);
    expect(h.cookieCount).toBe(1);
    // Security: cookie value must never appear in the returned object
    expect(JSON.stringify(h)).not.toContain('FIXTURE_VALUE_48H');
  });

  it('state=expiring when cookie expires within 6h', async () => {
    const expires = Math.floor((Date.now() + 6 * 3600 * 1000) / 1000);
    const p = await tmpSession([{ name: 'auth', value: 'FIXTURE_VALUE_6H', domain: '.autodesk.com', expires }]);
    created.push(p);
    const h = await getSessionHealth(p);
    expect(h.state).toBe('expiring');
    expect(h.hoursRemaining).toBeGreaterThan(0);
    expect(h.hoursRemaining).toBeLessThan(SESSION_WARN_HOURS);
    expect(h.estimate).toBe(true);
    expect(JSON.stringify(h)).not.toContain('FIXTURE_VALUE_6H');
  });

  it('state=expired when cookie expired 1h ago', async () => {
    const expires = Math.floor((Date.now() - 1 * 3600 * 1000) / 1000);
    const p = await tmpSession([{ name: 'auth', value: 'FIXTURE_VALUE_EXP', domain: '.autodesk.com', expires }]);
    created.push(p);
    const h = await getSessionHealth(p);
    expect(h.state).toBe('expired');
    expect(h.hoursRemaining).toBeLessThanOrEqual(0);
    expect(h.expiresAt).not.toBeNull();
    expect(JSON.stringify(h)).not.toContain('FIXTURE_VALUE_EXP');
  });

  it('state=missing when session file does not exist', async () => {
    const h = await getSessionHealth(join(tmpdir(), 'nonexistent-accds-test-file.json'));
    expect(h.state).toBe('missing');
    expect(h.expiresAt).toBeNull();
    expect(h.hoursRemaining).toBeNull();
    expect(h.estimate).toBe(false); // certain fact: file absent
    expect(h.cookieCount).toBe(0);
  });

  it('state=unknown when all autodesk.com cookies have expires=-1 (session cookies)', async () => {
    const p = await tmpSession([
      { name: 'a', value: 'SECRET_A', domain: '.autodesk.com', expires: -1 },
      { name: 'b', value: 'SECRET_B', domain: '.auth.autodesk.com', expires: -1 },
    ]);
    created.push(p);
    const h = await getSessionHealth(p);
    expect(h.state).toBe('unknown');
    expect(h.estimate).toBe(true);
    expect(h.expiresAt).toBeNull();
    expect(h.hoursRemaining).toBeNull();
    // Security: no secret values in output
    expect(JSON.stringify(h)).not.toContain('SECRET_A');
    expect(JSON.stringify(h)).not.toContain('SECRET_B');
  });

  it('boundary: hoursRemaining=12 is "healthy" (12 < SESSION_WARN_HOURS is false)', async () => {
    // Add 30s buffer so Math.round gives 12 despite floor truncation and execution time.
    const expires = Math.floor((Date.now() + SESSION_WARN_HOURS * 3600 * 1000 + 30_000) / 1000);
    const p = await tmpSession([{ name: 'auth', value: 'FIXTURE_BOUNDARY', domain: '.autodesk.com', expires }]);
    created.push(p);
    const h = await getSessionHealth(p);
    expect(h.state).toBe('healthy');
    expect(h.hoursRemaining).toBe(SESSION_WARN_HOURS); // exactly 12h
    expect(JSON.stringify(h)).not.toContain('FIXTURE_BOUNDARY');
  });

  it('filters non-autodesk.com cookies; cookieCount reflects only autodesk.com entries', async () => {
    const expiresExpiring = Math.floor((Date.now() + 6 * 3600 * 1000) / 1000); // 6h
    const expiresLong = Math.floor((Date.now() + 48 * 3600 * 1000) / 1000);    // 48h (non-autodesk)
    const p = await tmpSession([
      { name: 'auth', value: 'SECRET_ADSK', domain: '.autodesk.com', expires: expiresExpiring },
      { name: 'other', value: 'SECRET_OTHER', domain: '.google.com', expires: expiresLong },
    ]);
    created.push(p);
    const h = await getSessionHealth(p);
    expect(h.state).toBe('expiring');   // autodesk.com cookie is at 6h
    expect(h.cookieCount).toBe(1);      // only autodesk.com cookies counted
    expect(JSON.stringify(h)).not.toContain('SECRET_ADSK');
    expect(JSON.stringify(h)).not.toContain('SECRET_OTHER');
  });
});
