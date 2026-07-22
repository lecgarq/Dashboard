import { describe, expect, it } from "vitest";
import { decodeColumnarPayload } from "@/lib/acc/columnarPayload";
import {
  ACTIVITY_TEST_FIXTURE_COUNT,
  ACTIVITY_TEST_FIXTURE_MONTH_COUNT,
  buildActivityUniverseTestFixture,
} from "./activityUniverseTestFixture";

const REQUIRED_COLUMNS = [
  "positions",
  "verbId",
  "objectTypeId",
  "moduleId",
  "monthId",
  "roleId",
  "companyId",
  "projectId",
  "authorId",
  "folderId",
] as const;

describe("activityUniverseTestFixture", () => {
  it("decodes to aligned required columns with three exact, balanced months", () => {
    const fixture = buildActivityUniverseTestFixture();
    const decoded = decodeColumnarPayload(fixture.payload);

    expect(fixture.meta.count).toBe(ACTIVITY_TEST_FIXTURE_COUNT);
    expect(fixture.meta.dicts.monthCount).toBe(ACTIVITY_TEST_FIXTURE_MONTH_COUNT);
    expect(decoded.count).toBe(ACTIVITY_TEST_FIXTURE_COUNT);
    for (const name of REQUIRED_COLUMNS) {
      const multiplier = name === "positions" ? 2 : 1;
      expect(decoded.columns[name].length, name).toBe(ACTIVITY_TEST_FIXTURE_COUNT * multiplier);
    }

    const counts = [0, 0, 0];
    for (const month of decoded.columns.monthId) counts[month] += 1;
    expect(counts).toEqual([60, 60, 60]);
    expect(Array.from(decoded.columns.positions).every(Number.isFinite)).toBe(true);
  });
});
