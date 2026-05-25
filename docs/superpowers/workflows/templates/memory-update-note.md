# Template — Memory Update Note

> For proposing a durable memory after a session. The memory system lives at the auto-memory path
> (`…/memory/`): one fact per file with frontmatter, indexed by a one-line pointer in `MEMORY.md`.
> **Always ask before writing to `MEMORY.md`** unless the user pre-authorized it.

---

## When to save a memory

Save what is **non-obvious and durable** across sessions:
- `user` — who the user is (role, expertise, preferences).
- `feedback` — how you should work (a correction or a confirmed approach) — include the *why*.
- `project` — ongoing work/goals/constraints **not derivable from code or git history**
  (convert relative dates to absolute).
- `reference` — pointers to external resources (URLs, dashboards, tickets).

**Do not save** what the repo already records: code structure, past fixes, git history, CLAUDE.md content,
or anything only relevant to the current conversation.

## Before writing

- [ ] Check `MEMORY.md` for an existing file that already covers this → **update it**, don't duplicate.
- [ ] If a prior memory turned out wrong, delete it.
- [ ] Relative dates converted to absolute (today's date).

## File body (one fact per file: `…/memory/<type>_<slug>.md`)

```markdown
---
name: <short-kebab-case-slug>
description: <one-line summary — used for recall relevance>
metadata:
  type: user | feedback | project | reference
---

<the fact. For feedback/project, follow with:>
**Why:** <reason>
**How to apply:** <what to do next time>

<link related memories with [[their-slug]]>
```

## Index line (append to `MEMORY.md`)

```
- [<Title>](<type>_<slug>.md) — <hook>
```

## Proposal to the user (paste this, then wait for OK)

```
Proposed memory:
- type: <project|feedback|user|reference>
- slug: <slug>
- fact: <one line>
- why it's worth remembering: <non-obvious + durable>
- updates existing? <[[slug]] | new>
OK to write it (and add the MEMORY.md index line)?
```
