# Post-Launch Review — StreakKeeper browser client

> Written by the Orchestrator, not a spawned agent. **Independence limitation
> stated plainly:** I orchestrated this run, so this is self-review. Mitigated —
> every finding below is sourced from QA's or Security's artefacts rather than my
> own assessment of my own work — but a genuinely independent review would be
> stronger. A deliberate cost-for-independence trade, on a run that had already
> overrun its budget.

## Did it meet its goal?

**Yes.** `04-ui.md` had been fully specified since Phase 4 and never rendered.
It renders now: seven states, seven components, final copy verbatim — including
the reframe where a broken streak reads *"Today starts a new streak."* 84/84
tests, all gates green, Security PASS with no blockers.

It also closed the PRD's oldest gap. Two success criteria were tagged
`[verify live]` back in Phase 4 because "no punitive framing" is unobservable
without a UI. There is a UI now.

## What surprised us

1. **A gate failed on something no test could have caught.** QA found focus lost
   after logging — by *using the app in a real browser*, which the arch doc asked
   for (§10) and the implementation had skipped. The full suite was green and the
   defect was real. It is the clearest evidence yet that "all tests pass" and
   "the thing works" are different claims.
2. **Security found a flaw in a control, not in the code.** The `href` guard
   validates `String(value)` and then re-stringifies it, so a stateful
   `toString` defeats it. Nothing today can reach it — but it is a *guard that
   does not guard*, which is worse than a missing guard because it invites trust.
   Found by attacking the control itself rather than the surface it protects.
3. **The best security result was structural, not behavioural.** The design's
   claim was "there is no escaping, because the client never builds markup."
   Security verified that as a property: across 12 hostile names the client can
   only produce 8 literal tags and 5 literal attribute names. That is a much
   stronger statement than "we tried some payloads and nothing fired."
4. **The non-oracle came out *stronger* in the client than at the HTTP layer** —
   foreign, fake and hostile ids produce byte-identical DOM and **zero network
   requests**, so there is no timing channel at all. An accident of the design
   (the client only ever reads its own user-scoped list), not a deliberate choice.
5. **The budget control stopped the run, and the stop was correct.** It fired
   before Security — the one stage that should never have been skimped, since
   this slice carries the first XSS surface. The protocol's own options
   (degrade / drop / ask) resolved cleanly to "ask", and the human funded it.

## The cost finding

| | |
|---|---|
| Budget | 550k |
| Spent | **654k (119%)** |
| Overrun | +104k, **human-authorized**, recorded as an exception |
| Stages | 5 spawned (4 planned + 1 rework); Release and Post-Launch direct |

**The estimate assumed zero reworks.** Per-stage figures were fine — Architecture
94k, rework 108k, Security 116k, all under their caps. What the model lacked was
any allowance for a gate doing its job. A pipeline whose gates genuinely fail
closed will sometimes rework, so a budget that prices only the happy path will
systematically under-quote the runs that most need the budget.

Note the exception was recorded as an exception, **not** as a raised budget: the
550k figure stands in the analytics as the estimate that was wrong, so the miss
stays visible.

## Carry-forward

1. **Slice budgets need an explicit rework allowance.** Suggest ~20% of the
   spawned-stage total, stated in the plan rather than discovered mid-run.
2. **A manual-use check belongs in the QA definition**, not only in an arch
   doc's appendix. This defect existed because "run it and use it" was optional.
3. **F-1 `href` double-stringification** — one-line fix, deliberately deferred
   rather than made unreviewed after the security gate passed.
4. **F-2 `vnode.tag` validation** — required the moment any slice builds a vnode
   from data. Today no such path exists.
5. **F-3 Trusted Types · F-4 `nosniff` on JSON** — advisory; F-4 becomes real if
   auth or content-type handling changes.

## Follow-up slices

- **Auth** — `X-User-Id` is self-asserted. Everything currently rests on
  loopback-only. This is the blocker for any real deployment.
- **Live engagement measurement** — finally possible now that a UI exists;
  answers the guilt-vs-retention question the Market Researcher raised in Phase 4
  and nothing since has been able to test.
