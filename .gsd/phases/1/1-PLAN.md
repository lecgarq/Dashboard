---
phase: 1
plan: 1
wave: 1
---

# Plan 1.1: Tooling Setup & Knip Configuration

## Objective
Establish the automated mechanism (`knip`) that will detect unused files, exports, and dependencies across the workspace. We need to install it, bind it to package.json, and configure it thoughtfully to ignore intentionally dormant UI components and framework files.

## Context
- .gsd/SPEC.md
- .gsd/ARCHITECTURE.md
- package.json

## Tasks

<task type="auto">
  <name>Install Knip and add NPM Script</name>
  <files>package.json</files>
  <action>
    - Install `knip` as a dev dependency via npm.
    - Add a `"knip": "knip"` script to the package.json scripts block so it can be easily run.
  </action>
  <verify>npm list knip</verify>
  <done>Knip version is visible in devDependencies and the script exists in package.json.</done>
</task>

<task type="auto">
  <name>Create Configuration File (knip.ts)</name>
  <files>knip.ts</files>
  <action>
    - Create a `knip.ts` configuration file in the project root.
    - Export a configuration object that applies to Next.js projects.
    - MUST ignore `components/ui/**` (Shadcn components), `.gsd/**`, `scripts/**`, and standard configuration scripts to prevent them from being flagged as dead code.
  </action>
  <verify>cat knip.ts</verify>
  <done>The config exports exclusions and project roots aligned with a Next.js App Router codebase.</done>
</task>

<task type="auto">
  <name>Establish Baseline Analytics</name>
  <files>package.json</files>
  <action>
    - Execute a dry run of knip across the codebase using `npx knip --no-exit-code`. This command will output all current issues but will naturally exit without breaking CI, thus proving configuration is functional.
  </action>
  <verify>npx knip --version</verify>
  <done>Knip natively resolves dependencies and traverses without exception errors.</done>
</task>

## Success Criteria
- [ ] Knip is installed and executable.
- [ ] The `knip.ts` accurately maps Next.js entries and explicitly ignores `components/ui`.
- [ ] A baseline run successfully reveals existing unused targets and versions match.
