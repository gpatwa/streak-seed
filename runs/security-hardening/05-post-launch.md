# Post-Launch Review — security-hardening

> Stage 7 (Post-Launch) · Owner: Orchestrator (direct) · Slice: `security-hardening`
> Landed locally (uncommitted), Tier 2 GO, 2026-08-22.

## Outcome

All five defects closed and independently verified. Suite 84 → 91. Three
preconditions from `runs/browser-client/04-security.md` §7 **struck in full**
(§7.1, §7.2, §7.3); three carried (§7.4, §7.5, §7.6); one new generated (§7.7).

The run **exceeded its token budget by 6%** (520k against 490k). The artefacts
are sound; the run is not clean. Both facts are recorded.

## Lesson 1 — the pipeline's best find came from the stage that had already passed the work

The F-2 fix reproduced the F-1 defect *in the adjacent function*, and neither the
implementer who wrote both fixes in one sitting nor QA — which independently
re-derived every fail-first test — caught it. Security found it with a class of
probe neither had run: 60+ hostile inputs driven through `mount()` against a stub
`document`, asking not "does the fix work?" but "does the unsafe path exist?"

Security's own note on why generalises better than the finding does:

> "The fix works against the attack the fix was written for" and "the unsafe path
> does not exist" are different claims, and only the second is what this slice
> promised.

The test that missed it (C21) was not a bad test. It was non-vacuous, fail-first,
and it asserted exactly what it claimed. It asserted the **outcome** for a
plain-data hostile tag. F-5 lived in the **mechanism** — the number of property
reads — which no outcome assertion can see. The rework's C21c fixes this by
asserting `tagReads === 1`: a mechanism assertion, not an outcome one.

**Carry forward:** when a slice's promise is structural ("the unsafe path does not
exist"), at least one test must assert the *mechanism*, not the outcome. The
mutation table in `03-security.md` § Re-verify shows why both are needed — C21c
catches a two-read variant that C21 passes, and C21 catches allowlist widening
that C21c passes. Neither alone is sufficient.

## Lesson 2 — the budget check ran every time and still missed, because an estimate was invented

This is the run's primary process finding and it is a **new failure mode**, not a
repeat of `http-layer`'s.

`http-layer` blew its budget because **no check existed**. `RUN_ECONOMICS.md` §2
was written to fix exactly that, and it worked as designed here: a pre-spawn check
ran before all five spawns and passed each time.

It still ended at 106%, because two of the five estimates were **invented rather
than derived**:

| Estimate source | Stages | Accuracy |
|---|---|---|
| `RUN_ECONOMICS.md` §1 archetype table | Implementation, QA, Security re-gate, (baseline) | within **14k** — the table is good |
| Invented by the Orchestrator | `smoke` rework (50k), resumed re-verify (**40k**) | low by **23k** and **75k** |

The re-verify estimate was the expensive one, and the reasoning behind it was
specifically wrong: *"a resumed agent with intact context will be cheap."* Two
errors in one sentence.

1. A resumed agent still re-processes accumulated context every turn — which is
   what `RUN_ECONOMICS.md` §1 itself identifies as the thing that dominates cost.
   Resumption saves the *re-derivation*, not the *tokens*.
2. The re-verify did substantial new work: Proxy trap-count probes, a
   reconstructed pre-rework source to re-derive fail-first, and a three-mutant
   mutation test. It cost a review stage because it **was** a review stage. Its
   11 tool calls against 115k tokens is the signature: few turns, each carrying a
   large context.

Choosing `SendMessage` over a fresh spawn was still correct — a cold agent would
have re-read five artefacts to reach the same place. The error was pricing it at
40k, not choosing it.

**Proposed amendments to `RUN_ECONOMICS.md`** (for the playbook, not applied here):

- **Add a fourth archetype: `re-gate` ≈ 100k.** A re-gate is a review stage and
  should be priced as one, whether spawned cold or resumed. Resumption is a
  quality and latency optimisation, not a cost one.
- **Price rework by its verification surface, not its diff size.** The F-5 rework
  was one line and cost 73k — because the cost is in reading the finding,
  re-deriving fail-first, and re-running gates, none of which scale with line
  count. A `smoke` rework floor of ~75k is closer than 50k.
- **Make "no archetype fits" an escalation, not a guess.** The protocol says what
  to do when `spent + estimate > budget`. It says nothing about what to do when
  the estimate itself has no basis. It should: state the estimate is unfounded in
  `STATE.md` before spawning, and widen the headroom rather than picking a number
  that happens to fit.

## Lesson 3 — least-privilege, finally validated

`runs/browser-client/STATE.md` carried this forward: that run could not enforce
per-role tool restrictions because its Orchestrator session was rooted in the
playbook, where `.claude/agents/` is invisible, so stages ran as general-purpose
agents with briefs inlined and full tools.

**This run closed it.** Rooted in the product repo, all five spawns used the
generated agents with `tools:` frontmatter in force — `Read, Write, Edit, Bash,
Grep, Glob` and nothing else.

It was not free, and the cost is the interesting part. Both QA and Security needed
live-browser evidence, and neither had a browser tool. Rather than working around
the boundary or handing back, both drove headless Chrome over CDP from Bash using
Node 25's native `WebSocket` — no dependency, inside the boundary. Security then
went further and did its re-verify entirely in-process against a stub `document`,
opening no port at all.

**The constraint improved the evidence.** A stub-`document` probe counts property
reads and Proxy trap invocations, which is how F-5 was found; a real browser
cannot see either. The tighter boundary did not just fail to obstruct the work —
it pushed toward a sharper instrument.

**Carry forward:** run the Orchestrator from the product repo. `CLAUDE.md` already
says this; this run is the evidence for why it is not merely hygiene.

## Lesson 4 — incremental artefacts paid off under a real interruption

The Implementation agent was killed mid-stage by an account usage limit — the same
failure class that cost `http-layer` **156k in agents that produced nothing**.

Here it cost **zero**. `01-impl.md` was already on disk complete through its
handoff section; only the agent's own `STATE.md` bookkeeping was outstanding, and
the Orchestrator completed it directly after independently re-running the gates.
No re-spawn, no lost work.

`RUN_ECONOMICS.md` §4 (incremental artefacts) is validated. It is the one control
from the `http-layer` post-mortem that has now demonstrably paid for itself.

## What went well

- The gate caught a real defect *in a security fix*, and the send-back was
  Route-A'd for the right reason — the accuracy of the safety record, not
  exposure. F-5 was never reachable; it was fixed so §7.1 could be struck
  honestly rather than recorded as a guarantee the code did not provide.
- Every stage re-derived its predecessor's claims instead of accepting them. QA
  ran a non-vacuity probe on its own CSP result; Security mutation-tested the
  rework's new test; the Orchestrator re-derived the F-2 allowlist from source
  and re-ran every gate itself.
- Dropping the Architecture stage was correct. The prior security review *was*
  the design doc, the two genuinely open design calls were recorded in
  `01-impl.md` as briefed, and nothing downstream needed a spec that did not exist.

## What to do differently

1. Price a re-gate as a review stage (Lesson 2) — the single change that would
   have kept this run inside budget.
2. Require one mechanism-level assertion per structural claim (Lesson 1).
3. When an estimate has no archetype, say so in `STATE.md` before spawning rather
   than inventing a number (Lesson 2).

## Carried forward to the next slice

- **§7.7 (new):** widening `ALLOWED_TAGS` or `ALLOWED_PROPS` is a rule-4
  safety-control change and needs human approval. The mutation table is the
  evidence: a slice that widens the allowlist *and* updates C21 to match would
  leave no test failing.
- **§7.4:** preserve "the client never asks" — no `GET /habits/:habitId`, no
  prefetch, no analytics beacon on the detail route.
- **§7.5:** `habitId` stays sequentially enumerable; dispositioned, not re-raised.
- **§7.6:** CSP moves with the app — narrowest directive, never `unsafe-inline`.
- **Advisories A-1 and A-2** from `03-security.md` remain open and advisory.
- **The slice is uncommitted.** The human reviews and commits; a push is a
  separate rule-3 approval.
