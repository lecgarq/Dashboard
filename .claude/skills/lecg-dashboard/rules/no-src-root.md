---
name: no-src-root
verification_command: "git diff --cached --name-only | grep -E '^src/' && echo 'FAIL: new file under src/ — use app/, components/, lib/, or server/' && exit 1 || true"
---

# No src/ Root

This repository does not use a root `src/` directory. All source code lives
under `app/`, `components/`, `lib/`, `server/`, `prisma/`, `scripts/`, or
`services/`.

## Rule

Do not create files under `src/`. If a plan or agent names a `src/...` path,
the path is wrong — use the correct Dashboard root.

## Verification

```bash
# Check staged files
git diff --cached --name-only | grep -E '^src/'

# Check all tracked files (should return nothing)
git ls-files 'src/' | head -5
```

If either returns results, the rule is violated.
