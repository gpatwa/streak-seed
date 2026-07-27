# Slice Plan — browser-client

> Stage 1 (Intake) · Owner: Orchestrator
> **Prepared from the playbook session; to be RUN from a session rooted in this
> repo** so the generated role agents in `.claude/agents/` are discoverable and
> their least-privilege `tools:` frontmatter is actually enforced.

## Ask

Render the interface `runs/greenfield/04-ui.md` fully specified and nothing has
ever displayed: the habit list and habit detail, over the existing HTTP API.

## Why now

Three things line up:

1. **The UI spec is complete and unrendered.** Discovery produced final copy and
   a 7-component vocabulary (HabitRow, StreakFigure, StateTag, LogTodayControl,
   EmptyState, HabitDetail, ErrorNotice) that no code has consumed.
2. **Its precondition is closed.** Security bound this slice to the 413
   keep-alive fix (browsers pool aggressively); that landed — `Connection: close`,
   guarded by S31.
3. **It closes the PRD's measurement gap.** Two success criteria were
   `[verify live]` because "no punitive framing" is unobservable without a UI.

## Scope (in)

- A dependency-free browser client (vanilla HTML/CSS/JS — no framework, matching
  the repo) served by the existing `src/server.js` as a static route.
- The 7 components and **the final copy verbatim** from `04-ui.md` — including
  the broken-streak reframe (`"New streak"` / *"Not logged yesterday. Today
  starts a new streak."*), never the word "broken".
- The states: no habits, habit with no completions, healthy streak, at-risk,
  broken, loading, error.
- Accessibility per `03-ux.md`: keyboard, screen-reader phrasing for streak
  counts and the at-risk signal, and **no gamifying motion** (the anti-guilt
  stance is a design constraint, not a preference).

## Out of scope

Auth (still `X-User-Id`; still loopback-only), build tooling, frameworks, any
dependency, persistence, deployment.

## The security surface this introduces

**Habit names are user free-text and this slice renders them into HTML.** That
is a genuine XSS vector and is new — the headless API never rendered anything.
Invariant §6 covers logs, not markup. The Architect must specify the escaping
boundary; Security must probe it. Also carry forward: the `null` non-oracle must
survive the UI (a "not found" must not become a visibly different state than
"not yours"), and no habit names may reach the browser console.

## Tier & depth

**Tier 2** — local, loopback-only, no external effect, no deploy.
**Depth: `standard`** for every stage (`RUN_ECONOMICS.md`) — a dependency-free
local seed with no real users. Security may go deeper *on the escaping boundary
specifically* if it finds cause; escalating depth needs a recorded reason.

## Budget

Σ estimates + one stage of headroom, per `RUN_ECONOMICS.md`:

| Stage | Archetype | Est. | Spawned? |
|-------|-----------|------|----------|
| Architecture | review | 100k | yes |
| Implementation | build | 130k | yes |
| QA | build | 130k | yes |
| Security | review | 100k | yes |
| Release | — | ~0 | **no** — gate walking is fact-checking, orchestrator-direct |
| Post-Launch | — | ~0 | **no** — orchestrator-direct, independence limitation stated |

**Budget: 550k.** The budget guard (`PreToolUse` on `Agent`) reads this from
`STATE.md` and will ask before a spawn that would exceed it.
