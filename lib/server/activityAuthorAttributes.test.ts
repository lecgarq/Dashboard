import { describe, expect, it } from "vitest";
import { buildAuthorAttributeMap } from "./activityAuthorAttributes";

const snap = (
  nodeId: string,
  emailLower: string,
  role = "Architect",
  firmName = "Hermosillo",
  moduleSignature: string[] = ["docs"],
) => ({ nodeId, emailLower, role, firmName, moduleSignature });

describe("buildAuthorAttributeMap", () => {
  it("collapses duplicate (email, project) pairs deterministically (first wins) and sorts output", () => {
    const rows = buildAuthorAttributeMap([
      snap("u2::pB", "b@x.com", "Manager"),
      snap("u1::pA", "a@x.com", "Architect"),
      snap("u1dup::pA", "a@x.com", "OTHER-ROLE"), // duplicate key — first occurrence wins
    ]);
    expect(rows.map((r) => `${r.emailLower}::${r.projectId}`)).toEqual([
      "a@x.com::pA",
      "b@x.com::pB",
    ]);
    expect(rows[0].role).toBe("Architect");
  });

  it("drops empty-email rows and malformed node ids, keeps modules copied", () => {
    const rows = buildAuthorAttributeMap([
      snap("u1::pA", ""),
      snap("no-separator", "c@x.com"),
      snap("u3::pC", "c@x.com", "(no role)", "", ["build", "docs"]),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      emailLower: "c@x.com",
      projectId: "pC",
      role: "(no role)",
      company: "",
      modules: ["build", "docs"],
    });
  });
});
