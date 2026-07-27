# LECG Dashboard Product Context

> Companion to `DESIGN.md`. Consumed by design tooling (`/impeccable`) and the
> `lecg-*` workflow skills. `AGENTS.md` remains the operational contract.

## What this is

An internal BIM/VDC operations and workshop dashboard for LECG. It answers
"who has access to what, who is actually active, and where the coordination
risk is" across Autodesk Construction Cloud (ACC), Forma, and the MTY
template — from a fully extracted local PostgreSQL dataset (~4.5M rows,
~950 projects).

## Audience

- **Primary:** Luis — owner, BIM manager, and workshop presenter. Operates it
  live on a projector in front of stakeholders.
- **Secondary:** workshop attendees (project managers, VDC leads) who watch,
  not click. They judge credibility in seconds.

## Product lane

Dense operational analytics tool. The comparables are internal ops consoles
and observability dashboards — **not** SaaS marketing sites, not consumer
apps, not BI-tool genericism.

## Voice

Concise, technical, truthful. Domain vocabulary (ACC, Forma, LOD, clash,
folder tiers, Model Coordination) over generic SaaS words. Numbers carry the
message. Data limitations are stated inline — an under-covered metric says so
next to the number; credibility in the workshop depends on it.

## Anti-references (what this must never resemble)

- AI-generated SaaS landing pages: hero sections, gradient blobs, emoji
  bullets, "Powerful. Simple. Fast." copy.
- Template dashboards: card-grid walls of identical stat tiles, purple-on-dark
  defaults, Inter-everywhere sameness.
- Demo-ware: fake numbers, hidden caveats, spinners that pretend work is
  happening.

## Non-negotiables

- Four core surfaces: `/users`, `/access-analysis`, `/template-mty`,
  `/forma-proposal` — polish these before adding new ones.
- Truthful data over impressive data, always.
- Dark zinc presentation is the workshop default; light mode fully supported.
- Local-only delivery (`:3000` scheduled task); no cloud, no telemetry.
