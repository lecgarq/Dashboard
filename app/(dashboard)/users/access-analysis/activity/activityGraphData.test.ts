import { describe, expect, it } from "vitest";
import {
  buildActivityAuthorLinks,
  buildAuthorMatch,
  buildProjectSelectionMask,
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
      timeId: monthId,
      selectedTime: 1,
      authorMask: match.mask,
    })!)).toEqual([3, 5]);
    expect(filterActivityIndices({ authorId, timeId: monthId, selectedTime: null, authorMask: null })).toBeNull();
  });

  it("filters by author role and stays on the fast null path when all roles are selected", () => {
    const roleDict = ["Unknown", "Arquitecto", "BIM Manager"];
    const roleId = Uint16Array.from([0, 1, 2, 1, 2, 1]);

    // All roles selected → no mask → no filter.
    expect(buildProjectSelectionMask(roleDict, new Set(roleDict))).toBeNull();
    expect(
      filterActivityIndices({ authorId, timeId: monthId, selectedTime: null, authorMask: null, roleId, roleMask: null }),
    ).toBeNull();

    const mask = buildProjectSelectionMask(roleDict, new Set(["BIM Manager"]));
    expect(Array.from(mask!)).toEqual([0, 0, 1]);
    expect(Array.from(filterActivityIndices({
      authorId,
      timeId: monthId,
      selectedTime: null,
      authorMask: null,
      roleId,
      roleMask: mask,
    })!)).toEqual([2, 4]);

    // Composes with the month filter in the same pass.
    expect(Array.from(filterActivityIndices({
      authorId,
      timeId: monthId,
      selectedTime: 1,
      authorMask: null,
      roleId,
      roleMask: mask,
    })!)).toEqual([4]);
  });

  it("filters by selected projects and stays on the fast null path when all are selected", () => {
    const projectDict = ["(none)", "guid-a", "guid-b"];
    const projectId = Uint16Array.from([0, 1, 2, 1, 2, 1]);

    expect(buildProjectSelectionMask(projectDict, new Set(projectDict))).toBeNull();

    const mask = buildProjectSelectionMask(projectDict, new Set(["guid-a"]));
    expect(Array.from(mask!)).toEqual([0, 1, 0]);
    expect(Array.from(filterActivityIndices({
      authorId,
      timeId: monthId,
      selectedTime: null,
      authorMask: null,
      projectId,
      projectMask: mask,
    })!)).toEqual([1, 3, 5]);

    // Composes with the month filter in the same pass.
    expect(Array.from(filterActivityIndices({
      authorId,
      timeId: monthId,
      selectedTime: 1,
      authorMask: null,
      projectId,
      projectMask: mask,
    })!)).toEqual([3, 5]);
  });

  it("filters by activity type (verb) and by month, composed with the scrubber", () => {
    const verbDict = ["Unknown", "created", "viewed"];
    const verbId = Uint16Array.from([1, 2, 1, 2, 1, 2]);
    const monthDict = ["Dec 2024", "Jan 2025"];
    const monthMask = Uint8Array.from([1, 0]); // months are id-indexed, not label-keyed

    const verbMask = buildProjectSelectionMask(verbDict, new Set(["viewed"]));
    expect(Array.from(filterActivityIndices({
      authorId,
      timeId: monthId,
      selectedTime: null,
      authorMask: null,
      verbId,
      verbMask,
    })!)).toEqual([1, 3, 5]);

    // Month multi-select is independent of the scrubber bucket.
    expect(Array.from(filterActivityIndices({
      authorId,
      timeId: monthId,
      selectedTime: null,
      authorMask: null,
      monthId,
      monthMask,
    })!)).toEqual([0, 1, 2]);

    // Both together: verb "viewed" AND month Dec 2024.
    expect(Array.from(filterActivityIndices({
      authorId,
      timeId: monthId,
      selectedTime: null,
      authorMask: null,
      verbId,
      verbMask,
      monthId,
      monthMask,
    })!)).toEqual([1]);

    // All months selected → null mask → fast null path preserved.
    expect(buildProjectSelectionMask(monthDict, new Set(monthDict))).toBeNull();
  });

  it("keeps the all-selected fast path when a dict repeats a label", () => {
    // The real role dict carries "Unknown" twice (slot-0 sentinel + a real role
    // of that name). A label-keyed Set dedupes, so selecting every DISTINCT
    // label must still yield a null mask — otherwise every mount pays a full
    // 4.9M-row scan and the filter badge reads "90/91" while nothing is off.
    const roleDict = ["Unknown", "Arquitecto", "Unknown"];
    const distinct = Array.from(new Set(roleDict));
    expect(distinct).toHaveLength(2);
    expect(buildProjectSelectionMask(roleDict, new Set(distinct))).toBeNull();

    // Selecting the shared label keeps BOTH slots that carry it.
    const mask = buildProjectSelectionMask(roleDict, new Set(["Unknown"]));
    expect(Array.from(mask!)).toEqual([1, 0, 1]);
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
