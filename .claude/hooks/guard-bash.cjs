// PreToolUse guard for repo-fatal Bash commands (AGENTS.md rules).
// 1. Bulk git staging is banned on this WIP-heavy tree (explicit paths only).
// 2. `npm run build` while :3000 is live 500s the running workshop app.
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

    if (/\b(?:npm(?:\.cmd)?\s+run\s+build|next\s+build)\b/.test(cmd)) {
      const sock = require('net').connect({ port: 3000, host: '127.0.0.1' });
      sock.setTimeout(700);
      sock.on('connect', () => {
        sock.destroy();
        deny(
          ':3000 is LIVE — building now would 500 the running workshop app. Stop the "LECG Dashboard Local" scheduled task first (deploy-sequence.md), or use /lecg-ship.'
        );
      });
      sock.on('timeout', () => sock.destroy());
      sock.on('error', () => {});
    }
  });
