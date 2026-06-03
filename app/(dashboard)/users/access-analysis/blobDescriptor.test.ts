import { describe, it, expect } from "vitest";
import { buildUserBlobDescriptor } from "./blobDescriptor";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import type { CatalogDimension } from "./dimensionCatalog.types";

function snap(nodeId: string, userName: string): NodeFeatureSnapshot {
  return {
    nodeId,
    nameLower: userName.toLowerCase(),
    emailLower: "",
    userName,
    project: "P",
    role: "R",
    permTier: null,
    isExternal: false,
    activityBucket: "None",
    signinBucket: ">90d",
    activityCountRaw: 0,
    lastSignInRel: "Never",
    permissionCoverage: "unknown",
    firmName: "",
    accountStatus: "active",
  } as NodeFeatureSnapshot;
}

const USER_DIM = {
  id: "user",
  label: "User name",
  family: "affiliation",
  kind: "categorical",
  source: "test",
  confidence: "high",
  available: true,
  surfaces: ["slider", "color"],
  colorScale: "categorical",
  extract: (f: NodeFeatureSnapshot) => (f.userName ? f.userName : null),
} as unknown as CatalogDimension;

describe("buildUserBlobDescriptor", () => {
  it("always returns a user blob with loose + packed endpoints", () => {
    const features = [snap("u1::p1", "Ann"), snap("u1::p2", "Ann"), snap("u2::p1", "Bob")];
    const d = buildUserBlobDescriptor(features, USER_DIM);
    expect(d.kind).toBe("blob");
    expect(d.dimId).toBe("user");
    expect([...d.clustering.labels].sort()).toEqual(["Ann", "Bob"]);
    expect(d.loose.length).toBe(features.length * 2);
    expect(d.packed.length).toBe(features.length * 2);
  });
  it("groups same-user nodes into the same cluster id", () => {
    const features = [snap("u1::p1", "Ann"), snap("u1::p2", "Ann"), snap("u2::p1", "Bob")];
    const d = buildUserBlobDescriptor(features, USER_DIM);
    expect(d.clustering.ids[0]).toBe(d.clustering.ids[1]);
    expect(d.clustering.ids[0]).not.toBe(d.clustering.ids[2]);
  });
});
