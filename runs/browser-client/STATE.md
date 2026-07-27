# Slice State — browser-client

- **Ask:** Render the UI `runs/greenfield/04-ui.md` specified and nothing has ever displayed — habit list + detail over the existing HTTP API.
- **Project pack:** b2c-saas
- **Release tier:** 2 (local, loopback-only; no external effect, no deploy)
- **Current stage:** Architecture — **not started**
- **Status:** in-progress
- **Started:** 2026-07-26T19:30Z  ·  **Updated:** 2026-07-26T19:30Z

> **Run this slice from a session rooted in THIS repo.** Prepared from the
> playbook session, where `.claude/agents/` is not discoverable and least-privilege
> is therefore not enforced (see the pack `CLAUDE.md`). Running it here is the
> point: it is the first slice whose role agents are spawned with their real tool
> restrictions — e.g. the Architect has **no Bash**.

## Stages

| Stage | Owner | Status | Artefact | Gate |
|-------|-------|--------|----------|------|
| Intake | Orchestrator | done | runs/browser-client/00-slice-plan.md | n/a |
| Architecture | Software Architect | pending | runs/browser-client/01-arch.md | escaping boundary specified |
| Implementation | Frontend Developer | pending | runs/browser-client/02-impl.md | gates green |
| QA | QA Evidence | pending | runs/browser-client/03-qa.md | tests pass + states verified |
| Security | Security & Privacy | pending | runs/browser-client/04-security.md | PASS (XSS boundary probed) |
| Release | Orchestrator (direct) | pending | runs/browser-client/05-release.md | Tier 2 GO |
| Post-Launch | Orchestrator (direct) | pending | runs/browser-client/06-post-launch.md | trace.json emitted |

## Approvals

| Action | Rule | Requested | Decision | Approver | When (UTC) | Record |
|--------|------|-----------|----------|----------|-----------|--------|
| — none expected (local surface; no send / deploy / model / processor) | — | — | — | — | — | — |

## Budget

Per `RUN_ECONOMICS.md`. Checked **before every spawn** — never reconciled after.

- **Budget:** 550k tokens  ·  **Depth:** standard (all stages)
- **Spent:** 0k (0%)  ·  **Remaining:** 550k
- **Next stage:** Architecture (review) est. 100k → **PROCEED**

Four spawned stages (Architecture, Implementation, QA, Security); Release and
Post-Launch run orchestrator-direct — gate walking is fact-checking, and a
~130k agent to restate lessons already in the artefacts is the anti-pattern
`RUN_ECONOMICS` exists to stop.

## Failure budget

Class per `FAILURE_LOOP.md` "Failure categories".

| Stage | Retries used | Cap | Class | Last failure |
|-------|--------------|-----|-------|--------------|
| — | 0 | 2 | — | — |

## Interruptions

Per `RUN_ECONOMICS.md` §6. Infrastructure interruptions are **not** retries.
On re-spawn, hand the agent its partial artefact back and continue from the
first missing section — never restart.

| Stage | Cause | Class | Partial artefact reached | Resumed |
|-------|-------|-------|--------------------------|---------|
| — | — | — | — | — |

## Trace

Emitted to `runs/browser-client/trace.json` at close. Telemetry comes from the
harness, never agent self-report. Model routing per `MODEL_ROUTING.md`.

| Stage | Model | Start (UTC) | End (UTC) | Wall | Tokens | Tool calls | Retry # |
|-------|-------|-------------|-----------|------|--------|------------|---------|
| — | | | | | | | |

## Next action

Spawn the **Software Architect** on `00-slice-plan.md` + `runs/greenfield/04-ui.md`
+ `03-ux.md` → `01-arch.md`. It must specify the **HTML-escaping boundary** for
habit names (user free-text rendered into markup — a new XSS surface the headless
API never had), how the `null` non-oracle survives the UI, and the static-serving
route. Depth: `standard`.
