# Post-Launch Review — StreakKeeper HTTP layer

> **Written by the Orchestrator, not a spawned Post-Launch agent.** A ~130k
> agent to re-derive lessons already documented in this run's own artefacts is
> the exact anti-pattern `RUN_ECONOMICS.md` was written to stop.
> **Independence limitation, stated plainly:** I orchestrated this run, so this
> is self-review. It is mitigated — every finding below is sourced from QA's or
> Security's artefacts, not from my own assessment of my own work — but a genuine
> independent review would still be stronger, and this is a deliberate
> cost-for-independence trade, not a claim that they are equivalent.

## Did it meet its goal?

**Yes.** The slice existed to close two preconditions carried from the greenfield
run. Both are **CLOSED**, verified by Security against the real code and server
(`04-security.md`), not by assertion. The HTTP surface itself works: 4 routes,
56/56 tests, all gates green.

## What surprised us

1. **A gate blocked a slice mid-flight — the first time in six runs.** Security
   found `server.js` binding all interfaces and *reached a user's data over the
   LAN* with a self-asserted header. Every prior run went straight through. The
   fail-closed loop was designed in Phase 0 and had never actually fired in
   delivery; it works, and the slice went back rather than forward.
2. **The blocker was in the gap between spec and code.** The spec *documented*
   loopback. The code didn't do it. Reviewers who read the spec would have agreed
   it was safe — Security caught it only by running `lsof`. Cheap lesson,
   expensive to have missed: **verify the claim, not the document.**
3. **Each reviewer sharpened the previous one, again.** QA found the 413
   keep-alive break; Security found the *mechanism* QA missed (the response
   advertises keep-alive, then RSTs) and reclassified it from cosmetic to a
   protocol-correctness defect. Same pattern as the greenfield run, where
   Security proved QA's proposed clock fix insufficient.
4. **The Architect corrected the Orchestrator's brief.** I asserted
   `new Date(1e300)` was the case defeating a finiteness check; it verified
   empirically that this is an *Invalid Date* (`NaN`) which a finite check does
   catch, and identified the real case (a raw out-of-range epoch, `8.64e18`). It
   also found a bug nobody had: `dayIndex(null)`/`dayIndex(true)` silently
   returned day 0 — a §1 corruption with no throw.
5. **The run cost more than the product.** ~868k tokens, unfinished, four usage
   limits. See below — this is the finding with the longest tail.

## The cost finding

| | |
|---|---|
| Spent | **868k** across 7 spawned stages (2 of which produced nothing) |
| Wasted | **156k (18%)** — agents killed mid-stage, artefacts unwritten |
| Over the 150k per-stage cap | Implementation (178k), QA (178k) |
| Depth actually used | `adversarial` on **every** stage — never chosen |

Nothing was individually wrong. Every stage was defensible; **nothing summed
them**, and no control existed to stop before the human hit a wall. The depth was
inherited from brief wording ("attack", "probe", "go beyond the shipped tests")
rather than selected — on a dependency-free local seed with no users.

This produced `RUN_ECONOMICS.md` (budget checked before every spawn; explicit
depth tiers; incremental artefacts so a kill costs minutes not everything), and
the close-out of this very slice was the first thing run under it: Security's
re-gate and Release were executed directly as **facts** (~0 tokens) instead of
spawned as **judgment** (~235k).

## Carry-forward

1. **Loopback bind belongs in the seed template.** `stash-seed/src/server.js` has
   the identical wildcard-bind pattern and therefore the identical exposure. Fix
   there, and in whatever the playbook offers as a server starting point.
2. **413 keep-alive fix** — required before the first browser-client slice:
   `Connection: close`, drop the `req.destroy()`.
3. **Crystallization.** QA wrote 119 probes for 178k tokens; only a handful
   became permanent tests. The rest evaporated and the next QA will re-derive
   them at full price. Probes that establish something should land in `test/`.
4. **This slice was two slices.** A service-layer guard *and* a new HTTP surface
   in one stage is why Implementation and QA both broke the per-stage cap. The
   EM-sizing check should catch that at Intake.

## Follow-up slices

- **Browser client / frontend** — renders `04-ui.md`'s never-rendered component
  set; carries the 413 fix as a precondition.
- **Auth** — the moment this surface is meant to be reachable, `X-User-Id` stops
  being acceptable. Today's safety argument is *only* "it's on loopback".
