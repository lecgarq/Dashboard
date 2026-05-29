import { describe, it, expect } from "vitest";
import { normalizeActionId } from "./accNormalize";

describe("normalizeActionId", () => {
  it("kebab-cases display labels to match DB rawActions", () => {
    expect(normalizeActionId("Issue Create")).toBe("issue-create");
    expect(normalizeActionId("RFI View")).toBe("rfi-view");
    expect(normalizeActionId("Submittals Item Add Attachment")).toBe("submittals-item-add-attachment");
  });
  it("treats '+' as a separator and collapses runs", () => {
    expect(normalizeActionId("View + Download")).toBe("view-download");
  });
  it("trims leading/trailing separators and lowercases", () => {
    expect(normalizeActionId("  View-Entity  ")).toBe("view-entity");
    expect(normalizeActionId("view-entity")).toBe("view-entity");
  });
});
