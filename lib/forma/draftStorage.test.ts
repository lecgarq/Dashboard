import { describe, it, expect } from "vitest";
import {
  DRAFT_VERSION, storageKey, emptyDraft, parseDraft, serializeDraft,
} from "./draftStorage";
import { DEFAULT_FORMA_ROLES } from "./defaultRoles";

const NOW = "2026-06-15T00:00:00.000Z";

describe("draftStorage", () => {
  it("storageKey includes template id and version", () => {
    expect(storageKey("tpl")).toBe(`forma-proposal:tpl:v${DRAFT_VERSION}`);
  });

  it("emptyDraft seeds the given roles and empty assignments", () => {
    const d = emptyDraft("tpl", DEFAULT_FORMA_ROLES, NOW);
    expect(d.version).toBe(DRAFT_VERSION);
    expect(d.templateProjectId).toBe("tpl");
    expect(d.roles).toHaveLength(26);
    expect(d.assignments).toEqual({});
    expect(d.updatedAt).toBe(NOW);
  });

  it("serialize → parse round-trips", () => {
    const d = emptyDraft("tpl", DEFAULT_FORMA_ROLES, NOW);
    d.assignments = { architect: { root: "Full administrative controls" } };
    expect(parseDraft(serializeDraft(d))).toEqual(d);
  });

  it("parseDraft returns null for null / garbage / wrong version", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft("not json")).toBeNull();
    expect(parseDraft(JSON.stringify({ version: 999 }))).toBeNull();
    expect(parseDraft(JSON.stringify({ version: DRAFT_VERSION }))).toBeNull(); // missing fields
  });
});
