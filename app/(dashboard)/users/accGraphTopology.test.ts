import assert from "node:assert/strict";
import test from "node:test";

import type { OrganicLayoutNode } from "./accGraphOrganicLayout";

// Node's strip-types test runner loads the source file directly; TypeScript
// type-checks the extensionless import above.
// @ts-expect-error TS5097 is expected for the runtime-only .ts extension.
const layout = await import("./accGraphOrganicLayout.ts") as typeof import("./accGraphOrganicLayout");

const nodes = [
  {
    id: "instance:b@example.com:project-2",
    email: "b@example.com",
    name: "Beta User",
    projectId: "project-2",
    projectName: "Project Two",
    isAdmin: false,
    roles: ["Modeler"],
    lastAddedBucket: "2026-04",
    modules: ["docs"],
  },
  {
    id: "instance:a@example.com:project-1",
    email: "a@example.com",
    name: "Alpha User",
    projectId: "project-1",
    projectName: "Project One",
    isAdmin: true,
    roles: ["Architect", "Reviewer"],
    lastAddedBucket: "2026-03",
    modules: ["docs", "build"],
  },
] satisfies OrganicLayoutNode[];

test("buildAccTopologyGraph preserves visible node order", () => {
  assert.equal(typeof layout.buildAccTopologyGraph, "function");

  const graph = layout.buildAccTopologyGraph(nodes);

  assert.deepEqual(
    graph.visibleNodes.map((node) => node.id),
    nodes.map((node) => node.id),
  );
});

test("buildAccTopologyGraph creates deterministic hidden hubs", () => {
  assert.equal(typeof layout.buildAccTopologyGraph, "function");

  const first = layout.buildAccTopologyGraph(nodes);
  const second = layout.buildAccTopologyGraph([...nodes].reverse());

  assert.deepEqual(
    first.hiddenNodes.map((node) => node.id),
    second.hiddenNodes.map((node) => node.id),
  );
  assert.deepEqual(first.hiddenNodes.map((node) => node.id), [
    "hub:access:admin",
    "hub:access:member",
    "hub:module:build",
    "hub:module:docs",
    "hub:project:project-1",
    "hub:project:project-2",
    "hub:role:architect",
    "hub:role:modeler",
    "hub:role:reviewer",
    "hub:user:a%40example.com",
    "hub:user:b%40example.com",
  ]);
});

test("buildAccTopologyGraph links nodes through real ACC relationships only", () => {
  assert.equal(typeof layout.buildAccTopologyGraph, "function");

  const graph = layout.buildAccTopologyGraph(nodes);
  const sourceA = "instance:a@example.com:project-1";
  const linkKeys = new Set(graph.links.map((link) => `${link.source}->${link.target}:${link.kind}`));

  assert.ok(linkKeys.has(`${sourceA}->hub:project:project-1:project`));
  assert.ok(linkKeys.has(`${sourceA}->hub:role:architect:role`));
  assert.ok(linkKeys.has(`${sourceA}->hub:role:reviewer:role`));
  assert.ok(linkKeys.has(`${sourceA}->hub:module:docs:module`));
  assert.ok(linkKeys.has(`${sourceA}->hub:module:build:module`));
  assert.ok(linkKeys.has(`${sourceA}->hub:access:admin:access`));
  assert.ok(linkKeys.has(`${sourceA}->hub:user:a%40example.com:user`));
  assert.equal(graph.links.some((link) => String(link.kind) === "semantic"), false);
  assert.equal(graph.links.some((link) => String(link.kind) === "lastAdded"), false);
});
