---
phase: 4
plan: fix-trpc-testing
wave: 2
gap_closure: true
---

# Fix: tRPC Integration Testing

## Problem
Currently, verifying tRPC router changes requires either full manual testing or flaky scratch scripts that struggle with path resolution and environment setup.

## Root Cause
Lack of a pre-configured testing harness for server-side logic.

## Tasks

<task type="auto">
  <name>Setup Vitest for Server Testing</name>
  <files>
    <file>package.json</file>
    <file>vitest.config.ts</file>
  </files>
  <action>
    1. Install `vitest` as a dev dependency.
    2. Create `vitest.config.ts` with support for `@/` path aliases.
    3. Add a `test` script to `package.json`.
  </action>
  <verify>npm test -- --version</verify>
  <done>Vitest is installed and configured.</done>
</task>

<task type="auto">
  <name>Create Basic Router Smoke Test</name>
  <files>
    <file>server/routers/families.test.ts</file>
  </files>
  <action>
    1. Create a test that instantiates the `familiesRouter` and verifies a simple procedure (like `getAll`) with a mocked context.
    2. This will serve as a template for future router tests.
  </action>
  <verify>npm test</verify>
  <done>Integration test passes.</done>
</task>

## Success Criteria
- [ ] `npm test` runs and passes.
- [ ] Pattern established for future server-side testing.
