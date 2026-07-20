// PreToolUse guard for repo-fatal Bash commands (AGENTS.md rules).
// 1. Bulk git staging is banned on this WIP-heavy tree (explicit paths only).
// 2. `npm run build` while :3000 is live 500s the running workshop app.
const PORT = Number(process.env.GUARD_BASH_PORT || 3000); // test seam only
let s = '';
process.stdin
  .on('data', (d) => (s += d))
  .on('end', () => {
    let cmd = '';
    try {
      cmd = JSON.parse(s).tool_input?.command || '';
    } catch {
      return;
    }
    const raw = cmd;
    // Quoted text (commit messages, echo strings) must not trigger the guards.
    // ponytail: naive quote stripping, no nested/escaped-quote handling
    cmd = cmd.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
    const deny = (reason) => {
      console.log(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: reason,
          },
        })
      );
      process.exit(0);
    };

    // ponytail: explicit short-flag list; exotic combined flags (-sam) not covered
    const bulkStage =
      /\bgit\s+add\s+(?:[^|;&]*\s)?(?:-A|--all|-u)(?:\s|$)|\bgit\s+add\s+\.\/?(?:\s|$)|\bgit\s+commit\s+(?:[^|;&]*\s)?-a(?:m)?(?:\s|$)/;
    if (bulkStage.test(cmd)) {
      deny(
        'Bulk staging is banned on this WIP-heavy tree — stage explicit paths only, then inspect `git diff --cached --name-only` (AGENTS.md / lecg-workflow-conventions.md).'
      );
    }

    // Isolated-dist builds (NEXT_DIST_DIR set to a non-default dir, e.g. .next-e2e)
    // never write live .next, so they cannot 500 the :3000 app — this is the exact
    // mechanism 24-BASELINE.md uses to measure with :3000 live. Exempt them.
    // (Also matches the PowerShell form `$env:NEXT_DIST_DIR='.next-e2e'`.)
    const isolatedRe = /\bNEXT_DIST_DIR\s*=\s*['"]?(?!\.next['"\s]|\.next$)\.[\w./-]+/;
    const buildRe = /\b(?:npm(?:\.cmd)?\s+run\s+build|next\s+build)\b/;
    const denyIfLiveBuild = (text) => {
      if (isolatedRe.test(text) || !buildRe.test(text)) return;
      const sock = require('net').connect({ port: PORT, host: '127.0.0.1' });
      sock.setTimeout(700);
      sock.on('connect', () => {
        sock.destroy();
        deny(
          ':3000 is LIVE — building now would 500 the running workshop app. Stop the "LECG Dashboard Local" scheduled task first (deploy-sequence.md), or use /lecg-ship.'
        );
      });
      sock.on('timeout', () => sock.destroy());
      sock.on('error', () => {});
    };

    // GUARD-01: powershell/pwsh -Command wrappers hide the build inside quotes,
    // which the quote-strip above blanks — the exact Phase-33 bypass that
    // overwrote the live .next. Inspect the wrapped payload UN-stripped.
    // Trap: bash expands `$env:` inside DOUBLE quotes to empty, so wrapped
    // payloads get double-quoted in practice — single-quote powershell payloads
    // from bash (v2.5 trap). ponytail: -Command forms only; -File and
    // -EncodedCommand are out of scope (owner decision, recorded).
    // Detect the invocation on the STRIPPED cmd (a real `powershell -Command`
    // survives stripping; one merely quoted in a commit message does not), then
    // extract the payload from the RAW text. ponytail: first-match extraction —
    // a quoted mention preceding a real invocation over-denies, never under.
    const wrapRe = /\b(?:powershell|pwsh)(?:\.exe)?\s+(?:[^|;&]*?\s)?-command\s+(?:"([^"]*)"|'([^']*)'|(.+))/i;
    if (wrapRe.test(cmd)) {
      const wrap = wrapRe.exec(raw);
      if (wrap) denyIfLiveBuild(wrap[1] ?? wrap[2] ?? wrap[3] ?? '');
    }

    denyIfLiveBuild(cmd); // bare (unwrapped) builds, quote-stripped as before
  });
