import { describe, expect, it } from "vitest";
import {
  buildActivityAuthorLinks,
  buildAuthorMatch,
  filterActivityIndices,
} from "./activityGraphData";

describe("activityGraphData", () => {
  const authors = ["Unknown author", "Ana Ruiz <ana@x.com>", "Luis Cortes <luis@x.com>"];
  const authorId = Uint32Array.from([0, 1, 2, 1, 2, 1]);
  const monthId = Uint16Array.from([0, 0, 0, 1, 1, 1]);

  it("searches author labels and composes the result with month filtering", () => {
    const match = buildAuthorMatch(authors, " ANA@X ");
    expect(match.matchedAuthorCount).toBe(1);
    expect(Array.from(filterActivityIndices({
      authorId,
      monthId,
      selectedMonth: 1,
      authorMask: match.mask,
    })!)).toEqual([3, 5]);
    expect(filterActivityIndices({ authorId, monthId, selectedMonth: null, authorMask: null })).toBeNull();
  });

  it("builds bounded same-author chains in rendered-index space", () => {
    const rendered = Uint32Array.from([1, 2, 3, 4, 5]);
    expect(Array.from(buildActivityAuthorLinks(authorId, rendered, authors.length))).toEqual([
      0, 2,
      1, 3,
      2, 4,
    ]);
    expect(buildActivityAuthorLinks(authorId, rendered, authors.length, 2)).toHaveLength(4);
  });
});
