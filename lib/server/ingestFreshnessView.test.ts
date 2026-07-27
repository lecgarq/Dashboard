import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  findRun: vi.fn(),
  countActivity: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    accDcIngestRun: { findFirst: mocks.findRun },
    accActivity: { count: mocks.countActivity },
  },
}));

import { loadIngestFreshness } from "./ingestFreshnessView";

describe("loadIngestFreshness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null on an empty DB and does not call count", async () => {
    mocks.findRun.mockResolvedValue(null);

    const result = await loadIngestFreshness();

    expect(result).toBeNull();
    expect(mocks.countActivity).not.toHaveBeenCalled();
  });

  it("never selects rowsByModule and sources throughput from the live AccActivity count", async () => {
    mocks.findRun.mockResolvedValue({
      id: "run-1",
      startedAt: new Date("2026-07-02T18:00:03.000Z"),
      endedAt: new Date("2026-07-02T18:12:45.000Z"),
      status: "quarantined",
      projectsProcessed: 1152,
    });
    mocks.countActivity.mockResolvedValue(1086);

    const result = await loadIngestFreshness();

    // rowsByModule must never be part of the select object (standing guardrail).
    expect(mocks.findRun).toHaveBeenCalledWith({
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        status: true,
        projectsProcessed: true,
      },
    });
    const selectArg = mocks.findRun.mock.calls[0][0].select;
    expect(selectArg).not.toHaveProperty("rowsByModule");

    expect(mocks.countActivity).toHaveBeenCalledWith({ where: { ingestRunId: "run-1" } });
    expect(result?.activityRowCount).toBe(1086);
  });

  it("serializes startedAt/endedAt to ISO strings, and null endedAt to null", async () => {
    mocks.findRun.mockResolvedValue({
      id: "run-2",
      startedAt: new Date("2026-07-02T18:00:03.000Z"),
      endedAt: null,
      status: "running",
      projectsProcessed: 0,
    });
    mocks.countActivity.mockResolvedValue(0);

    const result = await loadIngestFreshness();

    expect(result?.startedAt).toBe("2026-07-02T18:00:03.000Z");
    expect(result?.endedAt).toBeNull();
  });
});
