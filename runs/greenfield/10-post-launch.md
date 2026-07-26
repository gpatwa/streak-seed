# Post-Launch Review — StreakKeeper MVP

> Stage 10 · Owner: Post-Launch Learning · Status: complete
> Source: `00-brief.md`, `02-prd.md`, `06-impl.md`–`09-release.md`, `STATE.md`,
> `.agentic/{SAFETY_INVARIANTS,PROJECT_CONTEXT,CURRENT_MVP_STATUS}.md`;
> playbook repo: `execution/install.mjs`, `docs/{PIPELINE_SLOS,PIPELINE_ANALYTICS}.md`
> Landed: commit `eee59ce` (local, unpushed — GitHub push stays an unrequested rule-3 approval)

## Summary

Ships as intended: **5/5 functional PRD criteria met** (one — no-punitive-framing —
met at the data layer and by design intent, not yet by anything a user can
see, since this slice is headless by design). **0/2 engagement criteria
measured**, correctly, and not merely pending — no client surface exists yet
for either to even be measurable. Two review-chain catches stand out as
better-than-typical: UX naming the day-boundary trap before any code existed,
and Security *sharpening* QA's own proposed fix rather than rubber-stamping
it. The run's own telemetry surfaces a live finding about the pipeline's
analytics, not just the product: token density looks stage-archetype-
dependent, and this is the first run with data to show it. Five concrete
carry-forwards and three follow-up slices are filed below.

## 1. Did it meet its success criteria?

### Functional criteria (observable now)

| # | Criterion (`02-prd.md`) | Verdict | Evidence |
|---|---|---|---|
| 1 | Logging today updates current streak | **Met** | T2, T9; QA §2 end-to-end 3-run probe (4-day/2-day/6-day) |
| 2 | Longest streak rises when current surpasses it, never decreases | **Met** | T8; QA §2 — monotonic across all 15 recorded steps of a 3-run sequence |
| 3 | At-risk flagged exactly when completed yesterday, not today — never otherwise | **Met, unusually strongly** | T1, T9; QA's 36,892-case brute-force sweep, 0 violations, plus an algebraic proof of structural (not just empirical) mutual exclusion |
| 4 | At-risk clears the same day it's logged | **Met** | T9; QA's millisecond-boundary probe (`23:59:59.999Z` → `00:00:00.000Z` next day → `23:59:59.999Z` again) confirms an exact UTC-midnight cutoff |
| 5 | After a miss, current streak reflects the break, longest stays visible/unchanged, no punitive framing anywhere a broken streak is shown | **Met at the data layer; not yet observable as a rendered experience** | T4, T10; grep sweeps in `07-qa.md` §3 and `08-security.md` §3 confirm zero guilt/shame/penalty lexicon and no returned `"broken"` string anywhere in `src/` |

On #2: the non-decrease guarantee isn't just "checked at each point" — QA's probe deliberately ran a 4-day streak, broke it, ran a *shorter* 2-day streak, broke that too, then ran a *longer* 6-day streak. `longestStreak` correctly held at 4 through the entire shorter run (proving a short run can't accidentally lower it) before rising to 6 only once genuinely exceeded — and it can't get stuck, because there is no stored `longestStreak` field anywhere; it's recomputed fresh from `streak.js` on every read.

On #5, the caveat is real, not throat-clearing: the copy that actually delivers "no punitive framing" to a *user* — `04-ui.md`'s "New streak" tag and "Today starts a new streak" detail line — has no code path rendering it. `07-qa.md` §4 confirms there is "nothing to preview or screenshot" for this slice. The criterion is satisfied at the only layer that exists today (raw data + a fully-specified design intent that never says "broken"), and that is the correct, honest way to score it before a UI ships — not a passing grade earned by proxy.

### [verify live] criteria — correctly unverified, and currently unverifiable, not just pending

- **Return rate after a first missed day, vs. a prior gamified tracker.** No users exist. Beyond that: there is no HTTP surface or UI for anyone to use even if they wanted to. This needs a follow-up slice to exist before it can start, not just time to pass.
- **At-risk nudge reads as informative, not guilt-inducing (interview/survey signal).** Same gap, doubled — there is no rendered nudge anywhere yet to react to; `atRisk` is a boolean in a data structure today, not something a user has seen.

## 2. What surprised us

**a. The UX stage caught the one-day-cutoff correctness trap before any code existed.** `03-ux.md` §4 names, in prose, the exact failure mode QA would later spend 36,892 test cases disproving: a day-boundary mismatch "produces contradictory states, like a habit that is simultaneously `atRisk` and already reset." UX's resolution — one server-side UTC-midnight cutoff, never client-supplied — became `SAFETY_INVARIANTS.md` §1 verbatim and is the single most heavily tested property in the whole slice (QA's largest probe by two orders of magnitude over any other invariant). Discovery work measurably reduced delivery risk here, not just produced prose.

**b. QA found the unvalidated-clock corruption; Security's fix was strictly sharper than QA's own.** QA (`07-qa.md` §3) found that an invalid `now` (`NaN`) partially mutates the store *before* throwing an undocumented `RangeError`, permanently corrupting a habit and cascading into `listHabits` denying a user visibility into all their other, healthy habits. QA's proposed fix — a `Number.isFinite` guard — is necessary but Security (`08-security.md` §4) showed it is **not sufficient**: a finite-but-astronomical epoch (e.g. `8.64e18` ms → `dayIndex ≈ 1e11`) passes `Number.isFinite` and still throws, because the resulting `Date` falls outside JavaScript's representable range. Security's guard validates finiteness *and* representability at the single `dayIndex` choke point shared by every read and write. A second independent review sharpening the first, rather than repeating it, is the rare case and worth naming as one.

**c. The "New streak" reframe is a discovery artifact, not a delivery afterthought.** The PRD (`02-prd.md`) left broken-streak tone as a **blocking open question**. UX (`03-ux.md`) resolved the *semantics* ("matter-of-fact and backward-permitting... an ordinary, ungated chance to start again, not a penalty to climb out of") without writing the words. UI (`04-ui.md`) turned that into the shipped copy — "New streak" / "Not logged yesterday. Today starts a new streak." — deliberately never printing "broken" to a user. Per `01-discovery-brief.md` and `PROJECT_CONTEXT.md`, restraint-as-tone is this product's *entire* differentiation (the feature set itself is commodity — Streaks, Loop Habit Tracker already ship it). That differentiation exists today as two lines of copy in a markdown file with no code path rendering them yet.

**d. Token density looks stage-archetype-dependent, not flat — and this is the first run with data to show it.** Per-stage tokens ÷ tool-calls, from `STATE.md`'s Trace table:

| Stage | Archetype | Tokens/call |
|---|---|---|
| Market Research | discovery | ~5,533 |
| PRD | discovery | ~6,090 |
| UX | discovery | ~7,111 |
| UI | discovery | ~9,653 |
| Architecture (opus) | gate/spec | ~4,613 |
| Implementation | build | ~3,137 |
| QA | verify | ~2,737 |
| Security (opus) | gate/spec | ~3,654 |
| Release | gate/spec | ~4,252 |

The four discovery stages run 5.5k–9.7k/call (avg ~6,891); the two pure build/verify stages run 2.7k–3.1k; the three gate/spec stages sit in between at 3.7k–4.6k regardless of whether the model is opus (Architecture, Security) or sonnet (Release) — ruling out model routing as the explanation. The pipeline's existing density baseline is **~3.6k/call**, built from "13 traced stages, 2 runs" (`docs/PIPELINE_ANALYTICS.md`), and both prior runs were execution-heavy slices with **no live discovery stage at all** — this run is explicitly the first to run "the discovery half, live" (`00-brief.md`). Applied naively, the generator's own outlier rule (">2× the ~3.6k baseline," i.e. ~7.2k) would flag UI (9,653) outright and put UX (7,111) right on the line — not because either stage misbehaved, but because discovery-archetype stages structurally run hotter on this metric. This is the density metric's own version of the false alarm the pipeline already diagnosed once on the flat per-tier *token-budget* SLO (the email-digest "504k vs 400k" miss, fixed by moving to a per-stage model in `PIPELINE_SLOS.md`). Worth noting for calibration: the coarser existing SLOs held fine here — no stage breached the 150k/stage cap (QA came closest at 142,330, ~95% of it) and the run's total (817,768 tokens / 198 tool calls across the 9 completed stages) stayed under the 900k stage-count-scaled envelope. Only the newer, finer tokens/call metric would have false-positived — which is exactly why it needs the same archetype-aware fix now, before it does.

## 3. What we'd do differently

**Guard-ordering should be a spec-checked property, not just a test-covered one.** `logCompletion`'s two existing guards (non-empty `userId`, non-empty `habitId`) both throw before touching the completion `Set` — a deliberate convention. The clock parameter didn't follow it, and nothing in `05-arch.md` or the 12 T-numbered tests would have caught that inconsistency structurally; it took QA's adversarial probing, beyond the shipped suite, to find it. Next architecture spec should enumerate, per exported mutating function, which parameters are validated and in what order relative to the first store write — making "does every guard precede every mutation" checkable at spec-review time instead of needing to survive to an adversarial probe.

**`CURRENT_MVP_STATUS.md` shipped self-contradictory in the same commit that made it wrong.** It still reads "Greenfield — no code yet... delivery not started" — authored during Bootstrap, before Implementation ran, and never refreshed before landing. Commit `eee59ce` ships that claim in the same tree as 8 files of working code and a green test suite that directly contradict it. The single-commit land should refresh this file as part of that commit, not treat it as frozen once discovery hands off.

**Two of Implementation's "deviations" were really gaps in the architecture spec, not implementation judgment calls.** `06-impl.md` logs adding `scripts/demo.mjs` and `scripts/build-check.mjs` as deviations from `05-arch.md`'s 6-file table — but by its own account, both were required by that same spec's *prose* (a real `start` script; a `build` script "per the reference `scripts/build-check.mjs`"), just never entered into the table. That's `05-arch.md` being inconsistent with itself, not Implementation improvising. The file table should be checked against the spec's own prose requirements before handoff, so Implementation doesn't inherit the job of reconciling the architecture document with itself.

**The density baseline was published as one number from a sample with zero discovery-archetype stages in it — worth a scope caveat at publish time, not just after a counterexample shows up.** `docs/PIPELINE_ANALYTICS.md`'s "~3.6k baseline" is accurate for what it measured (13 stages, 2 execution-heavy runs) but was stated without flagging the stage mix it came from. This run is the first live test of whether it generalizes, and it doesn't. The lesson isn't that the number was wrong — it's that a baseline built from a non-representative archetype mix should say so out loud when published, so today's fix (carry-forward below) reads as the plan working, not a scramble.

## 4. Carry-forward items

**(a) `install.mjs`'s greenfield bootstrap gap.** `execution/install.mjs:26–29` hard-exits (`process.exit(1)`) if `<product-dir>/.agentic/` doesn't already exist. This run had no way to use the pack's own installer for its first four stages — the Orchestrator hand-authored `.agentic/{PROJECT_CONTEXT,SAFETY_INVARIANTS,LOCAL_COMMANDS,CURRENT_MVP_STATUS}.md` as its own stage (`STATE.md`: "Bootstrap `.agentic/`") before `install.mjs` could run at all. Concrete fix: give `install.mjs` a greenfield path — e.g. a `--greenfield` flag that scaffolds a minimal `.agentic/` (or accepts one discovery just authored) instead of refusing to run — so a 0→1 project doesn't need a bootstrap step living outside the pack's own tooling.

**(b) Split the tokens/call density baseline (and its outlier detector) by stage archetype.** See surprise (d): discovery ~6.9k avg, build/verify ~3k, gate/spec ~3.7–4.6k — not one flat ~3.6k. Concrete fix: `execution/analyze.mjs` / `docs/PIPELINE_ANALYTICS.md` should carry at least these bands rather than one figure, and the ">2× baseline" outlier rule should compare each stage against its own archetype's baseline. This run supplies the first discovery-stage data points to calibrate the split.

**(c) Land the clock-validation guard before or with the first HTTP/adapter slice — Security's exact version, not QA's original.** Validate at the `dayIndex` choke point (`src/services/streak.js`) that the clock produces both a finite index *and* a representable date, throwing `TypeError` — consistent with, and before, the existing `userId`/`habitId` guards — before `habits.js`'s `days.add(today)` mutation. `Number.isFinite` alone is insufficient per surprise (b). This is `08-security.md`'s required-fix precondition #1 of 6, with `new Date(req.body.date)` named as the canonical threat-model footgun for that slice.

**(d) Refresh `.agentic/CURRENT_MVP_STATUS.md` at the landing commit**, not just at discovery handoff. Concrete: the next slice's Orchestrator should update it to reflect that delivery has landed (headless service, 13/13 tests, Tier 2 GO) as part of that slice's own commit, not carry the stale "no code yet" line forward indefinitely.

**(e) Security's other standing preconditions on the first HTTP/adapter slice stay live, not just recorded once:** map both foreign-and-fake `habitId` `null` outcomes to one identical HTTP response (never split 403-vs-404 — `habitId` is sequentially enumerable and the ownership check is the *only* IDOR defense); keep the audit trail name-free and owner-scoped (either changing reopens `08-security.md` §2's privacy assessment); no notification/nudge/gamification layer built on `atRisk` without explicit human approval (§3 is a product commitment, re-checked every slice); trim/reject whitespace-only `userId`/`name`/`habitId` at the HTTP edge and escape habit `name` on render. Itemized here so none of it depends on this document being re-read in full months from now.

## 5. Follow-up slices to file

- **The HTTP/adapter layer slice** — implements the clock guard (carry-forward c) as a precondition, preserves the foreign-vs-fake `null` non-oracle as a single HTTP response (carry-forward e), and applies the input-normalization/output-encoding advisories. Also the prerequisite for a UI to finally render `04-ui.md`'s fully-specified, entirely-unbuilt copy and component vocabulary.
- **A live-engagement measurement slice** — to answer the Market Researcher's flagged open risk (`01-discovery-brief.md` §6: "Removing the guilt loop could help integrity and hurt retention at once... the single biggest open risk, not a formality") and the PRD's two [verify live] criteria. Worth noting for whoever scopes it: this run's discovery ran with live web research explicitly disabled (`00-brief.md`: "avoids the parallel-search hang"), so the evidence for exactly this risk currently rests entirely on the Market Researcher's general knowledge, not a live source — this slice is also the first chance to replace that with real data.
- **A frontend/UI-rendering slice** for `04-ui.md`'s complete-but-unvalidated component vocabulary (HabitRow, StreakFigure, StateTag, LogTodayControl, EmptyState, HabitDetail, ErrorNotice) and full accessibility/screen-reader spec — designed in full, exercised by nothing so far (`07-qa.md` §4).

## Handoff

Final stage of this greenfield run. The Orchestrator finalizes `runs/greenfield/trace.json` (including this stage's own row) and regenerates the analytics views at close. The carry-forward items (§4) and follow-up slices (§5) above are this run's durable output.
