# Plan 34-01 Summary — GUARD-01 powershell-wrap bypass closed

**Status:** COMPLETE — 2026-07-20
**Requirement:** GUARD-01
**Commits:**
- `50dd815c` `chore(hooks): exempt isolated-dist builds from the :3000 build guard`
  (Decision 4: pre-existing uncommitted isolatedDist WIP committed first, alone —
  verified diff vs HEAD `9b7337b4` was exactly the exemption, index was clean).
- `63ef0aca` `fix(hooks): deny powershell-wrapped builds while :3000 serves (GUARD-01)`
  (`.claude/hooks/guard-bash.cjs` + new `tests/hooks/guard-bash.test.ts`).

## What shipped

- **Wrapped-payload inspection** in `.claude/hooks/guard-bash.cjs`: a
  `powershell`/`pwsh` `-Command` invocation (double-quoted / single-quoted /
  unquoted-rest payload) is detected on the quote-STRIPPED command (so a
  commit-message mention never triggers), then the payload is extracted from the
  RAW text and run through the same build check — isolatedDist exemption first
  (regex also matches the `$env:NEXT_DIST_DIR=` PowerShell form), then the
  :3000 socket-probe deny. Bare-command path unchanged.
- **`$env:` trap documented at the rule**: bash expands `$env:` inside double
  quotes to empty (v2.5 trap) — comment explains why wrapped payloads arrive
  double-quoted and that single-quoting from bash is the established form.
- **Testability seam**: `GUARD_BASH_PORT` env override (default 3000) so unit
  tests probe an ephemeral listener instead of the live workshop app.
- **Regression check** `tests/hooks/guard-bash.test.ts` (10 tests): wrapped deny
  ×3 forms, wrapped isolatedDist allow ×2 forms (bash env + `$env:`), wrapped
  allow when port closed, bare deny, bare isolatedDist allow, quoted-mention
  allow, bulk-stage deny. Picked up by default `npm test` glob (only
  `tests/e2e/**` is excluded).

## Deviations from plan

- None of scope. One design addition made during implementation: wrapper
  detection gated on the stripped command before raw-payload extraction —
  without it, a commit message quoting a powershell build command would have
  been a NEW false positive. Covered by the quoted-mention test.

## Gate outcomes (exact)

- `npx vitest run tests/hooks/guard-bash.test.ts` → `Test Files 1 passed (1)`,
  `Tests 10 passed (10)`.
- `npx tsc --noEmit` → exit 0, no output.
- `git diff --cached --name-only` inspected before both commits — exact paths only.

## Recorded scope cuts / debt

- `-File` / `-EncodedCommand` powershell forms OUT of scope (owner Decision 2,
  noted in the hook comment). `-command` matched case-insensitively, full flag
  name only (no `-c` shorthand).
- First-match payload extraction: a quoted mention preceding a REAL invocation
  in the same command over-denies (errs safe). ponytail comment at the rule.
