# Slice State — security-hardening

- **Ask:** Close the four Security advisories from `runs/browser-client/04-security.md` — F-1 (double stringification defeats the href guard), F-2 (unvalidated `vnode.tag`), F-3 (no Trusted Types in CSP), F-4 (no `nosniff` on JSON responses).
- **Project pack:** b2c-saas
- **Release tier:** 2 (local; behavioural hardening, no external effect, no deploy, no push)
- **Current stage:** Security re-verify done (**PASS**) → Release
- **Status:** in-progress — **all gates green, no open finding, no open approval.** Route A rework verified independently by Security: `create()` reads `vnode.tag` exactly once, the three original F-5 exploits now all yield `created=[div]` with `tag reads: 1`, `props`/`children` confirmed single-read, and C21c re-derived fail-first (`3 !== 1`, `createElement=["script"]`) against a reconstructed three-read `create()`. `npm test` 91/91 and `npm run build` ok, re-run by Security. Ready for Tier 2 release.
- **Started:** 2026-08-22T19:05Z  ·  **Updated:** 2026-08-22T22:20Z

> **Least-privilege IS enforced for this run.** The Orchestrator session is rooted
> in the product repo, so `.claude/agents/` is discoverable and each stage is
> spawned as its generated agent with `tools:` frontmatter in force. This closes
> the carry-forward recorded in `runs/browser-client/STATE.md`, which deferred
> validating least-privilege to "the next slice run from a session rooted in a
> product repo". See `00-slice-plan.md` § Least-privilege.

## Baseline at Intake

Working tree clean; `main` at `c607707`. `npm run qa:mvp`: **84/84 pass**. This is
the number the QA gate must not regress.

## Stages

| Stage | Owner | Status | Artefact | Gate |
|-------|-------|--------|----------|------|
| Intake | Orchestrator | done | runs/security-hardening/00-slice-plan.md | approval scan clean — no gated action |
| Architecture | — | **skipped** | — | n/a — `browser-client/04-security.md` is the design doc (plan § Stage compression) |
| Implementation | Frontend Developer | done | runs/security-hardening/01-impl.md | 4 original fixes + F-5 rework (one-line read-once fix in `create()`, `props`/`children` checked and confirmed already single-read, C21c regression test added and fail-first verified). 91/91 across `npm test` and `qa:mvp`. **Security re-verify: PASS** |
| QA | QA Evidence | done | runs/security-hardening/02-qa.md | **PASS** — 90/90 + build green re-run independently; all 6 new tests re-derived fail-first; live Chromium under new CSP (5 states + real log-completion, zero TT/CSP violations, non-vacuity probe); F-2 allowlist independently re-derived exhaustive; F-4 headers confirmed on 6 route/status combos incl. 413; 6/6 invariants hold; no behaviour change; working tree unmodified |
| Security re-gate | Security & Privacy | done | runs/security-hardening/03-security.md | **CONDITIONAL PASS** (superseded by the re-verify below) — F-1/F-3/F-4 closed structurally by the claimed mechanism (single-`String()` proven by call-count instrumentation; CSP read off the wire with all 9 directives; `nosniff`+charset on all 3 `writeHead` sites, confirmed across 12 route/status combos). F-2 closed for a plain-data tag but **F-5 (required-fix, not reachable)** found: `create()` reads `vnode.tag` three times, so an accessor/Proxy passes validation and constructs `<script>`/`<iframe>` — the F-1 defect inside the F-2 fix. No blocker; 7/7 invariants hold; secrets/PII clean; no audit event changed; rule 4 independently confirmed not tripped |
| Implementation (F-5 rework) | Frontend Developer | done | runs/security-hardening/01-impl.md (Route A rework) | **PASS** — 4-line `create()` head + test C21c; 91/91, build ok; only `src/client/dom.js` and `test/client-dom.test.js` touched |
| Security re-verify | Security & Privacy | done | runs/security-hardening/03-security.md § Re-verify — F-5 rework | **PASS** — F-5 closed by the mechanism claimed (`vnode.tag` read exactly once; all three original exploits now yield `created=[div]`, `tag reads: 1`). `vnode.props`/`vnode.children` independently confirmed single-read (accessor counters, Proxy trap counts, and the descriptor-vs-`get` divergence case). C21c re-derived fail-first against a reconstructed three-read `create()`: `3 !== 1` **and** `createElement=["script"]`. Mutation-tested: C21c catches a two-read variant, C21 catches allowlist removal/widening — the pair is complete, neither alone is. Nothing new introduced |
| Release | Orchestrator (direct) | pending | runs/security-hardening/04-release.md | **Tier 2 GO, unconditional** — no blocker, no required fix, no condition |
| Post-Launch | Orchestrator (direct) | pending | runs/security-hardening/05-post-launch.md | trace.json emitted |

## Security findings (from `03-security.md`)

**Final security verdict: PASS** (`03-security.md` § Re-verify — F-5 rework).
F-1, F-2, F-3, F-4 and F-5 are all **CLOSED** by the mechanism claimed. No
blocker, no required fix, no condition on release.

| ID | Severity | Summary | Reachable? | Status |
|----|----------|---------|-----------|--------|
| F-5 | ~~required-fix~~ → **CLOSED** | `create()` read `vnode.tag` three times — validated reads 1–2, constructed from read 3 | Was **not** reachable; now structurally impossible | **Fixed via Route A** and independently re-verified. `const tag = vnode.tag` is the only read; validated and constructed from the same binding. Test C21c pins the read count |
| A-1 | advisory | `create()` silently ignores a non-object `props` instead of failing loudly | No / harmless | EM backlog |
| A-2 | advisory | a bare-string `children` iterates per character into text nodes | No / harmless | Record only |

### Preconditions after this slice

- `browser-client/04-security.md` **§7.2 struck** (stringify once — enforced in code).
- **§7.3 struck** (`nosniff` + charset on JSON — enforced on every response the service emits).
- **§7.1 struck in full** — both clauses enforced in code, and the accessor/Proxy gap that withheld the strike is closed. **§7.1′ withdrawn; it never needs to exist.**
- §7.4 / §7.5 / §7.6 carried unchanged; §7.4 ("the client never asks") re-verified: foreign and fake habits remain byte-identical in status, headers *and* body.
- **§7.7 new** — widening `ALLOWED_TAGS` / `ALLOWED_PROPS` is a rule-4 safety-control change and must be argued in a slice plan, not slipped in with a feature.

## Approvals

Scan run at Intake against all six rules of `docs/HUMAN_APPROVAL_RULES.md` —
detail and reasoning in `00-slice-plan.md` § Human-approval scan.

| Action | Rule | Requested | Decision | Approver | When (UTC) | Record |
|--------|------|-----------|----------|----------|-----------|--------|
| — none: no send/submit, no destructive shared state, no deploy or push, no model, no processor | — | — | — | — | — | — |
| Rule 4 (safety-control change) considered and **does not trip** — every change strengthens a control, none weakens one | 4 | n/a | n/a | n/a | n/a | 00-slice-plan.md § Human-approval scan — **independently re-checked and endorsed by Security**, `03-security.md` §9: each of rule 4's five enumerated actions tested against the diff, and the allowlist re-derived to confirm it was not silently widened (an over-wide `ALLOWED_TAGS` *would* have tripped rule 4) |

## Budget

Per `RUN_ECONOMICS.md`. Checked **before every spawn** — never reconciled after.

- **Budget:** 490k tokens  ·  **Depth:** `standard` (all three spawned stages)
- **Final spend: 520k against a 490k budget — 106%. THIS RUN IS OVER BUDGET.**

| Stage | Est. | Actual | Delta |
|-------|------|--------|-------|
| Implementation | 130k | 117,977 | −12k |
| QA | 130k | 116,159 | −14k |
| Security re-gate | 100k | 97,649 | −2k |
| Implementation rework | 50k | 72,966 | **+23k** |
| Security re-verify | **40k** | **115,388** | **+75k** |
| **Total** | **450k** | **520,139** | **+70k** |

**Cause: a bad estimate, not a missing check.** The pre-spawn check ran before
every spawn and passed every time. It passed because the Orchestrator estimated
the `SendMessage` re-verify at ~40k on the reasoning that a resumed agent with
intact context would be cheap. That reasoning was wrong twice over: a resumed
agent still re-processes its accumulated context on every turn (which is *what*
`RUN_ECONOMICS.md` §1 says dominates cost), and the re-verify did substantial
genuinely new work — Proxy trap-count probes, a reconstructed pre-rework source
for fail-first, and a three-mutant mutation test. It cost a full review stage
because it *was* a full review stage.

The four estimates drawn from the `RUN_ECONOMICS.md` §1 archetype table were
accurate to within 14k. The two invented ones — the `smoke` rework and the
resumed re-verify — were both low, by 23k and 75k. **The table has no archetype
for either, and the Orchestrator filled the gap with a guess rather than
flagging it.** Carried to Post-Launch as the run's primary lesson.

Per `RUN_ECONOMICS.md`: the budget was **not** raised to fit the spend. It is
recorded at 490k and the run is recorded as having exceeded it.

Three spawned stages (Implementation, QA, Security). Architecture dropped and
Release/Post-Launch run Orchestrator-direct — both recorded in
`00-slice-plan.md` § Stage compression with reasons.

## Failure budget

Class per `FAILURE_LOOP.md` "Failure categories".

| Stage | Retries used | Cap | Class | Last failure |
|-------|--------------|-----|-------|--------------|
| Security re-gate | 0 | 2 | — | — (gate returned CONDITIONAL PASS, not a stage failure) |
| Implementation | 1 | 2 | logic — narrow, one-line | F-5, `03-security.md` §3. Route A taken; rework complete, gates green (91/91) |

## Interruptions

Per `RUN_ECONOMICS.md` §6. Infrastructure interruptions are **not** retries.
On re-spawn, hand the agent its partial artefact back and continue from the
first missing section — never restart.

| Stage | Cause | Class | Partial artefact reached | Resumed |
|-------|-------|-------|--------------------------|---------|
| Implementation | Account usage limit hit mid-stage; agent terminated by the harness | **Infrastructure — not a retry** (`RUN_ECONOMICS.md` §6) | `01-impl.md` complete through `## Handoff to QA`; all four fixes, all six tests, and all gate output already on disk. Only the agent's own `STATE.md` update was outstanding. | **Not re-spawned.** The incremental-write rule did its job — nothing was lost, so re-spawning would have re-bought ~130k of finished work. The Orchestrator independently re-ran `qa:mvp` (90/90) and `build` (ok), re-derived the F-2 tag allowlist from `render.js`/`app.js`, and completed the bookkeeping directly. **0 tokens wasted** — compare `http-layer`, where the same failure class lost 156k. |

## Trace

Emitted to `runs/security-hardening/trace.json` at close. Telemetry comes from
the harness, never agent self-report. Model routing per `MODEL_ROUTING.md`.

| Stage | Model | Start (UTC) | End (UTC) | Wall | Tokens | Tool calls | Retry # |
|-------|-------|-------------|-----------|------|--------|------------|---------|
| Implementation | sonnet | 2026-08-22T19:06Z | 2026-08-22T21:32Z | ~6m30s agent time (interrupted) | 117,977 | 67 | 0 |
| QA | sonnet | 2026-08-22T21:36Z | 2026-08-22T21:44Z | ~8m06s | 116,159 | 76 | 0 |
| Security re-gate | opus | 2026-08-22T21:53Z | 2026-08-22T22:03Z | ~9m57s | 97,649 | 40 | 0 |
| Implementation rework | sonnet | 2026-08-22T22:12Z | 2026-08-22T22:15Z | ~3m07s | 72,966 | 34 | 1 |
| Security re-verify | opus | 2026-08-22T22:20Z | 2026-08-22T22:24Z | ~3m56s | 115,388 | 11 | 0 |
| Security re-gate | opus | 2026-08-22T21:48Z | 2026-08-22T22:05Z | — | *(harness)* | *(harness)* | 0 |
| Implementation (F-5 rework) | sonnet | — | — | — | *(harness)* | *(harness)* | 1 |
| Security re-verify | opus | 2026-08-22T22:10Z | 2026-08-22T22:20Z | — | *(harness)* | *(harness)* | 0 |

## Next action

**Route A taken and complete.** `01-impl.md`'s "Rework — Security round 1
(F-5)" section has the fix, the `props`/`children` same-defect-class check
(both confirmed single-read, no change needed), the fail-first evidence
(`3 !== 1` against the unfixed code, then 91/91 after the fix), and full gate
output. Hand back to **Security & Privacy** to re-verify the one-line diff and
confirm §7.1 can be struck in full (rather than carried forward as §7.1′).
Live Chromium re-check is not required per `03-security.md` Route A. After
Security re-verifies, Release Manager proceeds to `04-release.md`, and
`.agentic/CURRENT_MVP_STATUS.md` is updated on release.

Budget check before any re-spawn: spent 234k + Security (harness figure) +
~40k for a narrow Implementation fix — verify against the 490k budget per
`RUN_ECONOMICS.md` before spawning.

---

### Superseded — the Orchestrator's note when it spawned this stage

Spawn **Security & Privacy** on `01-impl.md` + `02-qa.md` + `00-slice-plan.md`
→ `03-security.md`. Depth: `standard`. Re-gate the four advisories
(`browser-client/04-security.md` §1.3/§1.4/§2.4/§3.1) against the fixes and
against QA's independent evidence — fail-first re-derivation, a real
Chromium session confirming F-3 is safe and non-vacuously enforced, an
independent re-derivation of the F-2 allowlist as exhaustive, and multi-route
F-4 header confirmation — and confirm success criterion 6 (each advisory
closed by the claimed mechanism, no new surface opened).

QA note for the record: the load-bearing task (success criterion 4, live
Chromium check of F-3) is closed — see `02-qa.md` §3. `01-impl.md`'s
static-analysis "zero sinks" prediction is confirmed live: the app renders
empty/list/detail/not-found states, a real log-completion round trip
succeeds, a hostile habit name never executes and stays a single text node
throughout, and zero Trusted Types/CSP violations were recorded. A
deliberate non-vacuity probe (forcing an `innerHTML` write) proved the
enforcement and the observation channel are both real. All six new tests
(C20, C21, C21b, C22, S32, S32b) were independently re-derived fail-first by
`git stash`-reverting each source file and re-running — not accepted from
`01-impl.md` on trust. Working tree confirmed byte-identical to
`01-impl.md`'s handoff state at the end of QA (`git diff --stat` unchanged);
no stray Chrome/server process or open port survives QA's session.
