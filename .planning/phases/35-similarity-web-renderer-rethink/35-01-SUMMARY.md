# Plan 35-01 Summary: Renderer Candidate Measurements

## Outcome

Measured all four approved renderer candidates against the same authenticated full-data
graph and selected **Cosmos-native curved GPU links** as the smallest complete winner.

## Evidence

- Full graph: **22,279 nodes / 18,000 mapped similarity links**.
- Current Canvas2D control: **39.79 fps**, Tier **0 → 2**.
- Cosmos-native curved links: **60.03 fps**, Tier **0 → 0**, all 18,000 links.
- OffscreenCanvas worker: **60.01 fps**, Tier **0 → 0**, but adds lifecycle and transport.
- Deterministic 1-in-4 ambient decimation: **60.19 fps**, Tier **0 → 0**, but needlessly
  drops 13,500 links when native already holds the ceiling with the complete web.

Visual browser inspection confirmed that Cosmos's `0.14` curved-link control is acceptably
close to the existing quadratic bow. A screenshot also caught and invalidated a premature
`create()` prototype; the accepted native sample uses one queued links/colors/widths update
followed by one `render()`.

## Decision

Ship native curves alone. Do not ship a worker or decimation path. Selected, hovered, and
settled close views therefore retain complete fidelity by construction.

## Cleanup and commit

All prototype source edits were reversed. The permanent measurement record is
`35-BASELINE.md`, committed as `02c7dc15` (`docs(35): record renderer candidate measurements`).
