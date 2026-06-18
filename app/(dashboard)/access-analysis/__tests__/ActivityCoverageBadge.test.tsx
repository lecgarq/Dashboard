// @vitest-environment jsdom
/**
 * NA-01 — ActivityCoverageBadge RED test stub.
 * ActivityCoverageBadge does not exist yet; this test intentionally fails at runtime until
 * Wave 2 implements the component. The @ts-expect-error suppresses the TS2307
 * "module not found" error so tsc exits 0.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
// @ts-expect-error not yet implemented — Wave 2 will create this component
import { ActivityCoverageBadge } from "../components/ActivityCoverageBadge";

describe("ActivityCoverageBadge (NA-01)", () => {
  it("renders the covered and total project counts", () => {
    const { container } = render(<ActivityCoverageBadge covered={428} total={1152} />);
    const text = container.textContent ?? "";
    expect(text).toContain("428");
    // total may render as "1,152" or "1152"
    expect(text.includes("1,152") || text.includes("1152")).toBe(true);
    expect(text.toLowerCase()).toContain("project");
  });

  it("renders honestly when all projects are covered (covered === total)", () => {
    const { container } = render(<ActivityCoverageBadge covered={428} total={428} />);
    const text = container.textContent ?? "";
    expect(text).toContain("428");
  });
});
