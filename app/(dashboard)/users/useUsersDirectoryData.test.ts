// @vitest-environment jsdom
/**
 * PERF-03 unit assertion for useUsersDirectoryData.
 *
 * Purpose: Prove that bulkUsers.useQuery is called with the referentially-stable
 * BULK_USERS_LEAN_INPUT constant, guaranteeing the SSR prefetch (acc-route-hydration.ts)
 * and the client query share an identical tRPC/React-Query cache key and cannot drift.
 *
 * TDD RED gate: This test MUST fail if the hook passes a fresh inline literal
 * `{ leanProjects: true }` instead of BULK_USERS_LEAN_INPUT, because a fresh
 * object is never referentially-equal (`toBe`) to the exported constant.
 *
 * Coverage:
 *   Case 1 — deep-equality: bulkUsers is called with { leanProjects: true }
 *   Case 2 — referential identity (PERF-03 core): the argument IS BULK_USERS_LEAN_INPUT
 *   Case 3 — call count: exactly one bulkUsers.useQuery call per render
 *   Case 4 — gates preserved: listInvitations is called with enabled:false
 *   Case 5 — gates preserved: bulkAccSummary enabled gate (dcEmpty pattern verified
 *             at hook level — starts disabled when dcUsers is non-empty mock)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Hoisted spies — must be created before vi.mock hoisting
// ---------------------------------------------------------------------------
const { bulkUsersQuerySpy, bulkAccSummaryQuerySpy, listInvitationsQuerySpy } = vi.hoisted(() => {
  const bulkUsersQuerySpy = vi.fn().mockReturnValue({
    data: [
      {
        email: "alice@hermosillo.com",
        name: "Alice Aranda",
        found: true,
        projectCount: 1,
        activeCount: 1,
        adminCount: 0,
        hasNoProjects: false,
        syncedAt: "2026-06-01T00:00:00.000Z",
        allRoles: ["Member"],
        allModules: ["documentManagement"],
        projects: [{ id: "p1", name: "Tower A", status: "active", isAdmin: false, roles: ["Member"], modules: ["documentManagement"] }],
        isAccountAdmin: false,
        addedOn: null,
      },
    ],
    isLoading: false,
  });

  const bulkAccSummaryQuerySpy = vi.fn().mockReturnValue({
    data: [],
    isLoading: false,
  });

  const listInvitationsQuerySpy = vi.fn().mockReturnValue({
    data: undefined,
    isLoading: false,
  });

  return { bulkUsersQuerySpy, bulkAccSummaryQuerySpy, listInvitationsQuerySpy };
});

// ---------------------------------------------------------------------------
// Mock @/lib/core/trpc
// ---------------------------------------------------------------------------
vi.mock("@/lib/core/trpc", () => ({
  trpc: {
    accDcGraph: {
      bulkUsers: {
        useQuery: bulkUsersQuerySpy,
      },
    },
    users: {
      bulkAccSummary: {
        useQuery: bulkAccSummaryQuerySpy,
      },
      getOrgDirectory: {
        useQuery: () => ({
          data: {
            status: "ok",
            people: [
              {
                resourceName: "people/alice",
                displayName: "Alice Aranda",
                email: "alice@hermosillo.com",
                photoUrl: null,
                department: "Engineering",
                jobTitle: "BIM Manager",
                phoneNumber: null,
                costCenter: "ENG-100",
              },
            ],
          },
          isLoading: false,
          error: null,
        }),
      },
      getDirectory: {
        useQuery: () => ({ data: [], isLoading: false }),
      },
    },
    accMembers: {
      enrichedUsers: {
        useQuery: () => ({ data: [], isLoading: false }),
      },
    },
    accActivity: {
      listInvitations: {
        useQuery: listInvitationsQuerySpy,
      },
      getCoverage: {
        useQuery: () => ({ data: undefined, isLoading: false }),
      },
      lastFileActivityByEmailAll: {
        useQuery: () => ({ data: undefined, isLoading: false }),
      },
    },
    accFolders: {
      getCoverage: {
        useQuery: () => ({ data: undefined, isLoading: false }),
      },
    },
  },
}));

// ---------------------------------------------------------------------------
// Import hook and the shared constant AFTER mocks are set up
// ---------------------------------------------------------------------------
import { useUsersDirectoryData, BULK_USERS_LEAN_INPUT } from "./useUsersDirectoryData";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useUsersDirectoryData — PERF-03 assertions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Case 1: Deep equality — bulkUsers called with { leanProjects: true }
  // -------------------------------------------------------------------------
  it("Case 1: bulkUsers.useQuery is called with { leanProjects: true }", () => {
    renderHook(() => useUsersDirectoryData());

    expect(bulkUsersQuerySpy).toHaveBeenCalledWith(
      { leanProjects: true },
      expect.objectContaining({ staleTime: expect.any(Number) }),
    );
  });

  // -------------------------------------------------------------------------
  // Case 2: Referential identity (PERF-03 core assertion)
  //   The argument passed to useQuery MUST be the same object as BULK_USERS_LEAN_INPUT.
  //   If the hook uses a fresh inline literal, this test fails — catching the
  //   exact regression that caused the hydration-cache miss (PERF-03).
  // -------------------------------------------------------------------------
  it("Case 2 (PERF-03): the argument to bulkUsers.useQuery IS BULK_USERS_LEAN_INPUT (same reference)", () => {
    renderHook(() => useUsersDirectoryData());

    expect(bulkUsersQuerySpy).toHaveBeenCalled();
    const firstCallArg = bulkUsersQuerySpy.mock.calls[0][0];
    // toBe checks referential identity, not deep equality
    expect(firstCallArg).toBe(BULK_USERS_LEAN_INPUT);
  });

  // -------------------------------------------------------------------------
  // Case 3: Call count — exactly one bulkUsers.useQuery call per render
  // -------------------------------------------------------------------------
  it("Case 3: bulkUsers.useQuery is called exactly once", () => {
    renderHook(() => useUsersDirectoryData());

    const bulkUsersCalls = bulkUsersQuerySpy.mock.calls.filter(
      (callArgs: unknown[]) => {
        const input = callArgs[0] as Record<string, unknown> | undefined;
        return input?.leanProjects === true;
      },
    );
    expect(bulkUsersCalls).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Case 4: listInvitations gate preserved — enabled:false (RESEARCH Pitfall 5)
  //   This query must never fire during normal directory load.
  // -------------------------------------------------------------------------
  it("Case 4: listInvitations.useQuery is called with enabled:false", () => {
    renderHook(() => useUsersDirectoryData());

    expect(listInvitationsQuerySpy).toHaveBeenCalledWith(
      expect.objectContaining({ windowDays: 90, limit: 100 }),
      expect.objectContaining({ enabled: false }),
    );
  });

  // -------------------------------------------------------------------------
  // Case 5: bulkAccSummary dcEmpty gate — disabled when DC data is non-empty
  //   The mock returns data for bulkUsers, so bulkAccSummary should be disabled.
  // -------------------------------------------------------------------------
  it("Case 5: bulkAccSummary.useQuery is called with enabled:false when DC data is present", () => {
    renderHook(() => useUsersDirectoryData());

    // When dcUsersRaw is non-empty (mock returns 1 user) and dcLoading is false,
    // the enabled gate evaluates to: !false && 1 === 0 → false
    expect(bulkAccSummaryQuerySpy).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ enabled: false }),
    );
  });
});
