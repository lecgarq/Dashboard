# Milestone Audit: Core-Dependency-Update

**Audited:** 2026-04-28

## Summary
| Metric | Value |
|--------|-------|
| Phases | 3 |
| Gap closures | 0 |
| Technical debt items | 2 |

## Must-Haves Status
| Requirement | Verified | Evidence |
|-------------|----------|----------|
| npm updated to 11.11.1 | ✅ | `npm -v` |
| tRPC updated to 11.17.0 | ✅ | `package.json` |
| Technical Debt Resolved | ✅ | `tsc` pass |
| Build Stable | ✅ | `npm run build` |

## Concerns
- **Regex Risks**: During Phase 2, a broad regex replacement caused temporary syntax corruption in `FamiliesPage`. Future automated refactors should use more specific line-based targets or safer replacement logic.
- **Test Infrastructure**: The ad-hoc smoke test failed to run due to module resolution issues. This highlights the lack of a lightweight integration testing harness for tRPC routers.

## Recommendations
1. **Centralize Schemas**: Consolidate `FamilyPhase` and `familyPhaseSchema` into a single location (likely `family-config.ts`) and export from there, to prevent the kind of drift seen in `module-schemas.ts`.
2. **Setup Integration Tests**: Introduce a basic `vitest` or `jest` setup for testing tRPC routers in isolation, avoiding the need for flaky manual smoke test scripts.

## Technical Debt to Address
- [ ] Consolidate `FamilyPhase` types and schemas into `family-config.ts`.
- [ ] Setup lightweight integration testing for tRPC routers.
