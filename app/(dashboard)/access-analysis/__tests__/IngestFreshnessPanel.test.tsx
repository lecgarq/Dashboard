// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { IngestFreshnessPanel } from "../components/IngestFreshnessPanel";
import type { IngestFreshness } from "@/lib/server/ingestFreshnessView";

const NOW_ISO = "2026-07-03T00:00:00.000Z";

function freshRun(overrides: Partial<IngestFreshness> = {}): IngestFreshness {
  return {
    id: "run-1",
    startedAt: "2026-07-02T20:00:00.000Z", // 4h before NOW_ISO — fresh
    endedAt: "2026-07-02T20:12:00.000Z",
    status: "success",
    projectsProcessed: 1152,
    activityRowCount: 1086,
    ...overrides,
  };
}

describe("IngestFreshnessPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_ISO));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders tiles from a fresh run with no stale badge", () => {
    const { container } = render(<IngestFreshnessPanel freshness={freshRun()} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Last ingest");
    expect(text).toContain("Duration");
    expect(text).toContain("Projects processed");
    expect(text).toContain("1,152");
    expect(text).toContain("Activity rows this run");
    expect(text).toContain("1,086");
    expect(text).not.toContain("stale");
  });

  it("shows an amber stale badge for a run older than the threshold", () => {
    const staleStart = new Date(Date.parse(NOW_ISO) - 40 * 60 * 60 * 1000).toISOString(); // 40h ago
    const { container } = render(
      <IngestFreshnessPanel freshness={freshRun({ startedAt: staleStart, endedAt: null })} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("stale");
  });

  it("renders a neutral badge with the raw label for an unknown status", () => {
    const { container } = render(<IngestFreshnessPanel freshness={freshRun({ status: "quarantined-v2" })} />);
    const text = container.textContent ?? "";
    expect(text).toContain("quarantined-v2");
  });

  it("renders the honest empty line when freshness is null", () => {
    const { container } = render(<IngestFreshnessPanel freshness={null} />);
    const text = container.textContent ?? "";
    expect(text).toContain("No Data Connector ingest runs recorded.");
  });

  it("always carries the account-wide caption", () => {
    const { container } = render(<IngestFreshnessPanel freshness={freshRun()} />);
    const text = container.textContent ?? "";
    expect(text.toLowerCase()).toContain("account-wide");
  });
});
