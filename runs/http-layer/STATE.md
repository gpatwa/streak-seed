# Slice State — http-layer

- **Ask:** HTTP surface over the StreakKeeper service, landing the two preconditions carried from the greenfield run (clock guard; preserve the `null` non-oracle).
- **Project pack:** b2c-saas
- **Release tier:** 2 (local HTTP surface; no external effect, no deploy)
- **Current stage:** Landed (local) — Post-Launch complete
- **Status:** done
- **Started:** 2026-07-26T04:00Z  ·  **Updated:** 2026-07-26T18:55Z

## Stages

| Stage | Owner | Status | Artefact | Gate |
|-------|-------|--------|----------|------|
| Intake | Orchestrator | done | runs/http-layer/00-slice-plan.md | n/a |
| Architecture | Software Architect | done | runs/http-layer/01-arch.md | guard sited in dayIndex(); non-oracle = one 404 |
| Implementation | Backend engineer | **rework** | runs/http-layer/02-impl.md | 54/54 green; **sent back by Security** (binds all interfaces) |
| QA | QA Evidence | done | runs/http-layer/03-qa.md | PASS · 54/54 + 119 independent probes, 2 non-blocking findings |
| Security | Security & Privacy | done (round 1) | runs/http-layer/04-security.md | **CONDITIONAL PASS** — both preconditions CLOSED; 1 blocker → re-gate |
| Security re-gate | Orchestrator (direct) | done | runs/http-layer/05-release.md § blocker | blocker **CLOSED** — `lsof` 127.0.0.1, LAN refused |
| Release | Orchestrator (direct) | done | runs/http-layer/05-release.md | **Tier 2 · GO** |
| Post-Launch | Orchestrator (direct) | done | runs/http-layer/06-post-launch.md | trace.json emitted |

## Approvals

| Action | Rule | Requested | Decision | Approver | When (UTC) | Record |
|--------|------|-----------|----------|----------|-----------|--------|
| — (no gated action expected: local surface, no send/deploy/model) | — | — | — | — | — | — |

## Budget

Per `RUN_ECONOMICS.md`. **Applied retroactively** — this slice ran before the
protocol existed, and is the run that motivated it.

- **Budget:** 600k tokens (6 stages)  ·  **Depth actually used:** `adversarial`
  on every stage — never chosen, just inherited from how the briefs were worded.
  A dependency-free local seed warranted `standard`.
- **Spent:** **868k (145% of budget)** across 7 spawned stages, of which
  **156k (18%) produced nothing** — two agents killed mid-stage by an account
  usage limit with their artefacts still unwritten.
- **Overrun cause:** no pre-spawn check existed. Every stage was individually
  defensible; nothing ever summed them.
- **Remaining plan (budget-checked):** Security re-gate → **not spawned**; the
  bind fix is an objective fact, verified directly (`lsof`) at ~0 cost. Release
  → gates already green in CI + tests; walked directly. Post-Launch → **spawn**
  (judgment, and it feeds the analytics), est. 130k → the only remaining spend.

Rule now in force: agents for **judgment**, direct execution for **facts**.

## Failure budget

Class per `FAILURE_LOOP.md` "Failure categories".

| Stage | Retries used | Cap | Class | Last failure |
|-------|--------------|-----|-------|--------------|
| Implementation | 1 | 2 | gate-violation | Security round 1: `server.js` `.listen(port, cb)` binds `*:PORT` (all interfaces), not loopback — defeats the spec's stated basis for unauthenticated `X-User-Id`. Reachable over LAN, verified with `lsof` + a real cross-host request. |

**This is the fail-closed loop working as designed** — the first live delivery
run in which a gate sent a slice back rather than forward. Both carried
preconditions were verified CLOSED; the blocker is unrelated new surface
introduced by going HTTP.

> Note: the Architecture stage was interrupted once by an account session usage
> limit (partial work, no artefact written) and re-run after reset — an
> infrastructure pause, not a slice failure, so **not counted against the retry
> budget** (same handling as the llm-summary and greenfield runs).

## Trace

Emitted to `runs/http-layer/trace.json` at close. Model routing per
`MODEL_ROUTING.md` (Tier 2 static defaults: Architect + Security opus).

| Stage | Model | Start (UTC) | End (UTC) | Wall | Tokens | Tool calls | Retry # |
|-------|-------|-------------|-----------|------|--------|------------|---------|
| Architecture | opus | 2026-07-26T04:00Z | 2026-07-26T13:35Z | ~10m | 93,172 | 22 | 0 |
| Implementation | sonnet | 2026-07-26T13:35Z | 2026-07-26T13:52Z | ~15.7m | 178,278 | 48 | 0 |
| QA | sonnet | 2026-07-26T13:52Z | 2026-07-26T14:07Z | ~14.3m | 178,029 | 43 | 0 |
| Security (round 1) | opus | 2026-07-26T14:07Z | 2026-07-26T14:22Z | ~14.8m | 149,430 | 30 | 0 |
| Implementation (rework) | sonnet | 2026-07-26T14:22Z | 2026-07-26T14:30Z | ~7.8m | 112,385 | 33 | 1 |
| Security re-gate + Release + Post-Launch | **orchestrator (direct)** | 2026-07-26T18:40Z | 2026-07-26T18:55Z | ~15m | ~8,000 | 6 | 0 |
| **Productive total (5 spawned + direct close-out)** | 2 opus / 3 sonnet | | | | **711,294** | 176 | 1 |
| *Interrupted, no artefact (not counted above)* | | | | | *156,356* | *37* | — |
| **Grand total incl. waste** | | | | | **867,650** | 213 | 1 |

## Outcome

**Landed locally — Tier 2 GO.** Both carried preconditions **CLOSED** (clock
guard; foreign-vs-fake non-oracle). 56/56 tests, all gates green.

The **fail-closed loop fired for the first time in delivery**: Security round 1
blocked the slice over a wildcard bind that let a LAN host read a user's data;
the slice went *back* to Implementation, was fixed with two regression tests, and
the blocker was re-verified directly (`lsof` → `127.0.0.1`, LAN refused).

Close-out ran under the new `RUN_ECONOMICS.md`: the Security re-gate and Release
were **facts**, executed directly at ~8k, instead of **judgment** spawned at
~235k. Carry-forwards in `06-post-launch.md` — notably that `stash-seed` shares
the same wildcard-bind exposure.

**Open (rule 3):** exposing this surface beyond loopback, or deploying it. Not
authorized by the GO — the safety argument rests entirely on unreachability.
