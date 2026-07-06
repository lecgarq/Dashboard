import { describe, it, expect } from "vitest";
import { summarizeModules, UNMAPPED_MODULE, type ModuleActivityRow } from "../moduleCounts";
import { classifyActivity, donutModules } from "../moduleOverrides";

// Real taxonomy action ids (stable, generated from acc.xlsx):
//   issue-create / issue-view -> build
//   view-entity / upload-entity -> dataManagement
//   create-custom-attribute -> datum
const mk = (
  projectId: string,
  rawAction: string,
  count: number,
  service: string | null = null,
): ModuleActivityRow => ({
  projectId,
  projectName: projectId === "" ? "Account-level" : `Project ${projectId}`,
  rawAction,
  count,
  service,
});

describe("summarizeModules", () => {
  it("returns an empty summary for no rows (all 10 modules are zero, incl. Admin Actions)", () => {
    const s = summarizeModules([]);
    expect(s.slices).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.activeModules).toBe(0);
    expect(s.zeroModules).toHaveLength(9); // 8 excel modules (excl. modelCoordination) + Admin Actions
    expect(s.zeroModules.some((m) => m.id === "adminActions")).toBe(true);
    expect(s.typesByModule.size).toBe(0);
  });

  it("buckets activity into modules, summing volume across projects, sorted desc", () => {
    const s = summarizeModules([
      mk("p1", "view-entity", 100),
      mk("p2", "view-entity", 50), // same action, different project -> merges into Data Management
      mk("p1", "issue-create", 40),
      mk("p1", "create-custom-attribute", 3),
    ]);
    expect(s.total).toBe(193);
    expect(s.slices.map((x) => [x.id, x.value])).toEqual([
      ["dataManagement", 150],
      ["build", 40],
      ["datum", 3],
    ]);
    expect(s.slices[0].name).toBe("Data Management");
    expect(s.activeModules).toBe(3);
  });

  it("lists activity types per module, merged by action across projects, sorted desc", () => {
    const s = summarizeModules([
      mk("p1", "issue-view", 60),
      mk("p2", "issue-view", 10), // merge -> 70
      mk("p1", "issue-create", 40),
    ]);
    const build = s.typesByModule.get("build")!;
    expect(build.map((t) => [t.raw, t.count])).toEqual([
      ["issue-view", 70],
      ["issue-create", 40],
    ]);
    expect(build[0].label).toBe("Issue View");
  });

  it("folds unmapped raw actions into the Unmapped bucket, excluded from activeModules", () => {
    const s = summarizeModules([
      mk("p1", "view-entity", 100),
      mk("p1", "totally-made-up-action", 7),
    ]);
    const unmapped = s.slices.find((x) => x.id === UNMAPPED_MODULE);
    expect(unmapped?.value).toBe(7);
    expect(s.activeModules).toBe(1); // only Data Management counts as a real module
    expect(s.zeroModules.some((m) => m.id === UNMAPPED_MODULE)).toBe(false);
  });

  it("reports the modules that have no activity, in canonical order", () => {
    const s = summarizeModules([mk("p1", "view-entity", 5)]);
    const zeroIds = s.zeroModules.map((m) => m.id);
    expect(zeroIds).not.toContain("dataManagement");
    expect(zeroIds).toContain("autospecs");
    expect(zeroIds).toContain("design");
    expect(zeroIds).toContain("insight");
    expect(zeroIds).toHaveLength(8); // 9 donut modules (excl. modelCoordination) - dataManagement
  });

  it("routes coordination issue-* actions to Build (not Model Coordination, not Unmapped)", () => {
    const s = summarizeModules([
      mk("p1", "issue-attach", 10),
      mk("p1", "issue-void", 5), // no rows in current data, but pre-mapped
      mk("p2", "issue-respond", 2),
    ]);
    // Must NOT appear as modelCoordination any more.
    expect(s.slices.some((x) => x.id === "modelCoordination")).toBe(false);
    // All volume must land in Build.
    const build = s.slices.find((x) => x.id === "build");
    expect(build?.value).toBe(17);
    expect(s.slices.some((x) => x.id === UNMAPPED_MODULE)).toBe(false);
    const types = s.typesByModule.get("build")!;
    expect(types.map((t) => t.raw)).toEqual(expect.arrayContaining(["issue-attach", "issue-void", "issue-respond"]));
    expect(types.find((t) => t.raw === "issue-attach")?.label).toBe("Issue Attach");
  });

  it("classifyActivity: issue-* verbs route to Build, not modelCoordination", () => {
    expect(classifyActivity("issue-attach").moduleId).toBe("build");
    expect(classifyActivity("issue-void").moduleId).toBe("build");
    expect(classifyActivity("issue-respond").moduleId).toBe("build");
    expect(classifyActivity("issue-work-completed").moduleId).toBe("build");
  });

  it("classifyActivity: *-collection verbs (catalog modelCoordination) route to dataManagement", () => {
    // create-collection is one of the sheet collection verbs the excel maps to modelCoordination
    expect(classifyActivity("create-collection").moduleId).toBe("dataManagement");
  });

  it("donutModules: modelCoordination is NOT present in the list", () => {
    const modules = donutModules();
    expect(modules.some((m) => m.id === "modelCoordination")).toBe(false);
  });

  it("groups admin/permission actions into Admin Actions, leaving Preconstruction empty", () => {
    // notify-final-members is a Preconstruction catalog action, but the owner-delegated
    // mapping review (21.1-04 checkpoint) routes it to Data Management (Docs review-workflow
    // sibling of notify-reviewers/submit-review/claim-review-task), not Admin Actions.
    const s = summarizeModules([
      mk("p1", "assign-member", 8),
      mk("p1", "assign-permission", 3),
      mk("p1", "notify-final-members", 1),
    ]);
    expect(s.slices.find((x) => x.id === "adminActions")).toEqual({ id: "adminActions", name: "Admin Actions", value: 11 });
    expect(s.slices.find((x) => x.id === "dataManagement")).toEqual({ id: "dataManagement", name: "Data Management", value: 1 });
    expect(s.slices.some((x) => x.id === "preconstruction")).toBe(false);
    expect(s.zeroModules.some((m) => m.id === "preconstruction")).toBe(true);
    expect(s.zeroModules.some((m) => m.id === "adminActions")).toBe(false);
  });

  it("maps the previously-unmapped catalog gaps (Sheets sets, calibration, admin) — no Unmapped left", () => {
    // add-version-to-set routes to Build per the owner-directed Sheets-cluster move
    // (21.1-04 final-look verdict): Sheets version-sets are ACC Build tool features,
    // so they follow the tool -- no longer Data Management.
    const s = summarizeModules([
      mk("p1", "add-version-to-set", 889), // -> Build (Sheets cluster)
      mk("p1", "calibrate-entity", 37), // -> Data Management
      mk("p1", "create-project", 6), // -> Admin Actions
      mk("p1", "setting_update", 1), // normalizes to setting-update -> Admin Actions
    ]);
    expect(s.slices.some((x) => x.id === UNMAPPED_MODULE)).toBe(false);
    expect(s.slices.find((x) => x.id === "dataManagement")?.value).toBe(37);
    expect(s.slices.find((x) => x.id === "build")?.value).toBe(889);
    expect(s.slices.find((x) => x.id === "adminActions")?.value).toBe(7);
    const avt = s.typesByModule.get("build")!.find((t) => t.raw === "add-version-to-set");
    expect(avt?.label).toBe("Add Version to Set");
    expect(avt?.category).toBe("Content changes");
  });

  it("tags every activity type with an action category", () => {
    const s = summarizeModules([mk("p1", "view-entity", 5), mk("p1", "delete-entity", 2)]);
    const dm = s.typesByModule.get("dataManagement")!;
    expect(dm.find((t) => t.raw === "view-entity")?.category).toBe("Viewing & exports");
    expect(dm.find((t) => t.raw === "delete-entity")?.category).toBe("Deletions");
  });

  describe("service-first attribution (21.1-01)", () => {
    it("a service-tagged row moves module vs its verb-only twin", () => {
      // view-entity verb-classifies to dataManagement; the same rawAction tagged
      // with the decisive "submittals" service must land in build instead.
      const s = summarizeModules([
        mk("p1", "view-entity", 100), // verb-only twin -> dataManagement
        mk("p2", "view-entity", 40, "submittals"), // service override -> build
      ]);
      expect(s.slices.find((x) => x.id === "dataManagement")?.value).toBe(100);
      expect(s.slices.find((x) => x.id === "build")?.value).toBe(40);
    });

    it("attribution counters: mixed rows split by attributedBy, summing to total", () => {
      const s = summarizeModules([
        mk("p1", "view-entity", 100), // no service -> verb
        mk("p2", "view-entity", 40, "submittals"), // decisive service -> service
        mk("p1", "issue-create", 25, "issues"), // service agrees with verb -> still service-attributed
      ]);
      expect(s.attribution.serviceCount + s.attribution.verbCount).toBe(s.total);
      expect(s.attribution.serviceCount).toBe(65); // 40 + 25
      expect(s.attribution.verbCount).toBe(100);
    });

    it("all-null-service rows -> serviceCount is 0 and slices match the pre-service-fix expectations", () => {
      const s = summarizeModules([
        mk("p1", "view-entity", 100),
        mk("p2", "view-entity", 50),
        mk("p1", "issue-create", 40),
        mk("p1", "create-custom-attribute", 3),
      ]);
      expect(s.attribution.serviceCount).toBe(0);
      expect(s.attribution.verbCount).toBe(193);
      // Regression pin: identical to the pre-21.1 "buckets activity into modules" case above.
      expect(s.slices.map((x) => [x.id, x.value])).toEqual([
        ["dataManagement", 150],
        ["build", 40],
        ["datum", 3],
      ]);
    });
  });
});
