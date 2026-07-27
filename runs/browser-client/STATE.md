# Slice State — browser-client

- **Ask:** Render the UI `runs/greenfield/04-ui.md` specified and nothing has ever displayed — habit list + detail over the existing HTTP API.
- **Project pack:** b2c-saas
- **Release tier:** 2 (local, loopback-only; no external effect, no deploy)
- **Current stage:** Landed (local) — Post-Launch complete
- **Status:** done
- **Started:** 2026-07-26T19:30Z  ·  **Updated:** 2026-07-27T00:10Z

> **Least-privilege was NOT enforced for this run.** Recorded per the pack
> `CLAUDE.md`. The Orchestrator session is rooted in the *playbook*, so
> `streak-seed/.claude/agents/` is not discoverable to it; stages were spawned as
> general-purpose agents with the role brief inlined and **full tools**, rather
> than as the generated agents with their `tools:` frontmatter. The briefs state
> their own tool boundary, but that is honour-system, not enforcement.
>
> Everything else in this run is unaffected. Validating least-privilege moves to
> the next slice run from a session rooted in a product repo — it is not specific
> to this slice.

## Stages

| Stage | Owner | Status | Artefact | Gate |
|-------|-------|--------|----------|------|
| Intake | Orchestrator | done | runs/browser-client/00-slice-plan.md | n/a |
| Architecture | Software Architect | done | runs/browser-client/01-arch.md | unsafe path designed out |
| Implementation | Frontend Developer | **rework** | runs/browser-client/02-impl.md | 81/81 green; **sent back by QA** (focus lost after logging) |
| QA | QA Evidence | done (round 1) | runs/browser-client/03-qa.md | **FAIL** → rework → re-verified |
| Security | Security & Privacy | done | runs/browser-client/04-security.md | **PASS** — no blockers, 4 advisories |
| Release | Orchestrator (direct) | done | runs/browser-client/05-release.md | Tier 2 GO |
| Post-Launch | Orchestrator (direct) | done | runs/browser-client/06-post-launch.md | trace.json emitted |

## Approvals

| Action | Rule | Requested | Decision | Approver | When (UTC) | Record |
|--------|------|-----------|----------|----------|-----------|--------|
| — none expected (local surface; no send / deploy / model / processor) | — | — | — | — | — | — |

## Budget

Per `RUN_ECONOMICS.md`. Checked **before every spawn** — never reconciled after.

- **Budget:** 550k tokens  ·  **Depth:** standard (all stages)
- **Spent:** 538k (98%)  ·  **Remaining:** 12k
- **Next stage:** Security (review) est. 100k → **STOP AND ASK**

The pre-spawn check fails. Security would take the run to ~638k against a 550k
budget. Per `RUN_ECONOMICS.md` the options are degrade, drop, or stop and ask —
**never raise the budget to fit the spend**. Security is *not* droppable here:
this slice introduces the first XSS surface in the product, which is the
specific reason it was scoped for review. Escalated to the human with numbers.

> **OVERRUN AUTHORIZED by gpatwa (human), 2026-07-27.** Explicitly approved
> spending ~100k beyond the 550k budget to run Security at `standard` rather
> than degrade or drop it, on the grounds that this slice introduces the
> product's first XSS surface. Recorded as an approved exception, not a raised
> budget — the 550k figure stands as the estimate that was wrong, so the miss
> stays visible in the analytics. Carry-forward: slice budgets need an explicit
> rework allowance.

Overrun cause: the QA gate failed and forced a rework (+108k) that the original
four-stage estimate did not carry. The estimate was not wrong about stage costs
— it assumed zero reworks.

Four spawned stages (Architecture, Implementation, QA, Security); Release and
Post-Launch run orchestrator-direct — gate walking is fact-checking, and a
~130k agent to restate lessons already in the artefacts is the anti-pattern
`RUN_ECONOMICS` exists to stop.

## Failure budget

Class per `FAILURE_LOOP.md` "Failure categories".

| Stage | Retries used | Cap | Class | Last failure |
|-------|--------------|-----|-------|--------------|
| Implementation | 1 | 2 | gate-violation | QA round 1: focus not restored after logging. `mount()` unconditionally `replaceChildren`s, destroying the clicked control; no `.focus()` call exists. Violates `01-arch.md` §7.2 and `04-ui.md` §4. |

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
| Architecture | opus | 2026-07-27T00:10Z | 2026-07-27T00:20Z | ~10m | 94,354 | 22 | 0 |
| Implementation | sonnet | 2026-07-27T00:20Z | 2026-07-27T00:34Z | ~14m | 178,817 | 77 | 0 |
| QA (round 1) | sonnet | 2026-07-27T00:34Z | 2026-07-27T00:45Z | ~11m | 157,301 | 83 | 0 |
| Implementation (rework) | sonnet | 2026-07-27T00:45Z | 2026-07-27T00:53Z | ~7.5m | 107,824 | 54 | 1 |
| Security | opus | 2026-07-27T01:00Z | 2026-07-27T01:12Z | ~12m | 116,235 | 39 | 0 |
| Release + Post-Launch | **orchestrator (direct)** | 2026-07-27T01:12Z | 2026-07-27T01:20Z | ~8m | ~6,000 | 5 | 0 |
| **Total (5 spawned + direct close-out)** | 2 opus / 3 sonnet | | | ~55m | **654,531** | 275 | 1 |

## Outcome

**Landed locally — Tier 2 GO.** The UI discovery specified in Phase 4 and nothing
had ever displayed now renders: seven states, seven components, final copy
verbatim. 84/84 tests; Security **PASS, no blockers**.

Two gates fired and both were right. **QA failed the slice** on a live
keyboard-accessibility defect that a green test suite could not have caught —
focus lost after logging — fixed with a non-vacuous regression guard. **The
budget control stopped the run** before Security at 538k/550k; escalated with
numbers, human authorized the overrun because this slice carries the product's
first XSS surface. Final: 654k (119%), recorded as an approved exception rather
than a raised budget.

Security's four advisories (F-1 `href` double-stringification, F-2 unvalidated
`vnode.tag`, F-3 Trusted Types, F-4 `nosniff` on JSON) are all unreachable today
and carried forward in `06-post-launch.md`. F-1 was deliberately **not** fixed
here: an unreviewed change to security-critical code after the gate passed is
worse than a documented advisory.

**Open (rule 3):** deploying this or exposing it beyond loopback. Not authorized
by the GO — `X-User-Id` is still self-asserted.
