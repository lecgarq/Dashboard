---
name: zinc-not-slate
verification_command: "rg -n 'slate-[0-9]' app/ components/ --include '*.tsx' --include '*.ts' --include '*.css' | head -10 && echo 'FAIL: slate token found — use zinc' && exit 1 || true"
---

# Zinc, Not Slate

The Dashboard dark theme uses **zinc** (`#09090B` background, no blue cast).
All Tailwind color tokens for the neutral palette must use `zinc-*`, never
`slate-*`.

## Rule

Do not introduce `slate-` color tokens in new or modified files under `app/`,
`components/`, or any CSS/Tailwind configuration. Existing code uses `zinc-`
exclusively.

## Why

Slate has a blue undertone that conflicts with the established dark theme. The
shipped tokens in `app/globals.css` (`.dark { --background: #09090B }`) and
`DESIGN.md` §2 are the authority; nothing else records the palette.

## Verification

```bash
# Should return zero new matches
rg -n 'slate-[0-9]' app/ components/ --include '*.tsx' --include '*.ts' --include '*.css'
```
