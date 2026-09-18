# Release Checklist — security-hardening

> Stage 6 (Release) · Owner: Orchestrator (direct) · Slice: `security-hardening`
> Tier 2 (local; behavioural hardening, no external effect, no deploy, no push).
> Run Orchestrator-direct per `00-slice-plan.md` § Stage compression: gate-walking
> here is fact-checking against artefacts that already exist.

## Decision

# **Tier 2 · GO**

Unconditional. Security's re-verify recommends "GO, unconditional"; every Tier 2
gate below is satisfied; no human-approval rule is triggered.

The release covers the **code**. It does **not** absolve the run's budget
overrun, which is recorded in full in `STATE.md` § Budget and carried to
Post-Launch. Those are separate judgments and are kept separate deliberately:
`RELEASE_GATES.md` governs whether the change is safe to land;
`RUN_ECONOMICS.md` governs what the pipeline was allowed to spend producing it.
The first passed. The second did not.

## What shipped

Five defects closed in the rendering boundary and HTTP header surface. Four were
advisories raised by `runs/browser-client/04-security.md`; the fifth was found by
this slice's own Security re-gate, in the fix written for the second.

| # | Fix | File |
|---|-----|------|
| F-1 | `setProp` stringifies once — `const v = String(value)`, validated and set | `src/client/dom.js` |
| F-2 | `create()` validates `vnode.tag` against a 9-tag allowlist; children must be a string or a well-formed vnode | `src/client/dom.js` |
| F-3 | `require-trusted-types-for 'script'` added to `HTML_CSP` | `src/server.js` |
| F-4 | `x-content-type-options: nosniff` + `charset=utf-8` on JSON responses | `src/server.js` |
| F-5 | `create()` binds `vnode.tag` once — the F-1 defect found inside the F-2 fix | `src/client/dom.js` |

Diff: 2 source files, 3 test files. Tests 84 → **91**. No dependency added.

## Tier 2 gates (`docs/RELEASE_GATES.md`)

| Gate | Owner | Status | Evidence |
|------|-------|--------|----------|
| Slice fits one implementation pass | EM (compressed to Intake) | ✅ | 2 source files, ~30 net lines |
| Non-goals explicit | EM | ✅ | `00-slice-plan.md` § Non-goals |
| Typecheck passes | Engineer | ✅ | `01-impl.md` § Gates; re-run by QA and Security |
| Targeted tests pass | Engineer | ✅ | C20, C21, C21b, C21c, C22, S32, S32b |
| Full suite passes | Engineer | ✅ | **91/91**, independently re-run by QA, Security, and Orchestrator |
| Build passes | Engineer | ✅ | `npm run build` → `build ok` |
| No new lint warnings | Engineer | ✅ | `git diff --check` clean |
| One commit per task | Engineer | ⚠️ **n/a** | Deliberately **uncommitted** — see § Commit status |
| UI verified in preview | QA | ✅ | `02-qa.md` §3 — live headless Chromium, 5 UI states, real completion round trip |
| Local regression command | QA | ✅ | `npm run qa:mvp` green |
| Safety invariants verified | QA | ✅ | `02-qa.md` §6 — 6/6 hold; Security re-verified at runtime |
| No secrets/credentials in diff | Security | ✅ | `03-security.md` — scan clean |
| No PII/sensitive data logged | Security | ✅ | Invariant §6 re-verified live with a hostile-named habit; access log carries route templates only |
| Audit events cover state changes | Security | ✅ | No state-change path touched; no audit event added, removed, or altered |
| Adapter placeholder still throws | Security | **n/a** | No adapter in this project |
| Human approval points satisfied | Release (this doc) | ✅ | § Human approval below |
| Rollback plan exists | Release (this doc) | ✅ | § Rollback below |
| Release checklist filled | Release (this doc) | ✅ | This document |

Enterprise/governance gates: **all n/a** — no new data class, no schema or
migration, no subprocessor, no AI capability, no production service, no CAB.
Recorded rather than skipped silently, per `RELEASE_GATES.md`.

## Human approval

**None required, and none was assumed.** The six rules of
`docs/HUMAN_APPROVAL_RULES.md` were scanned at Intake, before implementation, and
the reasoning is in `00-slice-plan.md` § Human-approval scan.

Rule 4 (changes to safety controls) was the one that needed an actual argument
rather than a glance, because this slice modifies the CSP and the rendering
boundary. The claim was: every change strengthens a control and none weakens one,
so rule 4 — whose enumerated actions are all *weakening* ones — does not trip.

**The Security agent independently checked that claim and endorsed it** (§9 of
`03-security.md`), with a caveat worth preserving verbatim in effect: the
endorsement holds *because the direction was verified*, not because the slice was
labelled "hardening". An over-wide `ALLOWED_TAGS` would have made "every change
strengthens a control" false while still looking like hardening. That is the
origin of new precondition §7.7.

No approval was self-granted, inferred, or carried over. No gated action occurred.

## Commit status — read this before assuming the slice is in git

**Nothing was committed and nothing was pushed.** All changes are in the working
tree. This is deliberate:

- The `00-slice-plan.md` non-goals bar a push: the repo is public
  (`github.com/gpatwa/streak-seed`) and a push is a rule-3 external-effect action
  requiring its own human approval, which was never requested and never given.
- Committing locally is *permitted* without approval (`HUMAN_APPROVAL_RULES.md`
  § Allowed without approval), but the run left the tree uncommitted so the human
  reviews the diff before it enters history.

The "one commit per task" gate is therefore marked **n/a**, not passed. Stating
it as passed would be false.

**Action for the human:** review and commit. The push, if wanted, is a separate
decision and a separate approval.

## Rollback

Required at Tier 2, and cheap here: additive edits to two source files, no data
migration, no schema change, no persisted state, no config.

- **Whole slice:** `git checkout -- src/client/dom.js src/server.js test/` (or
  `git revert` once committed) restores prior behaviour exactly. Suite returns to
  84/84.
- **Per-fix:** each of the five reverts independently. This matters most for F-3
  — if `require-trusted-types-for 'script'` ever breaks a future browser or a
  future asset, removing that one directive is a self-contained change that
  touches nothing else.
- **Blast radius if wrong:** local only. No deployed surface, no external
  consumer, no stored data affected. The failure mode of an over-tight
  `ALLOWED_TAGS` is a loud `TypeError` at render, not silent corruption.

## What this slice deliberately did not do

- No push, no deploy (rule 3).
- No commit (see above).
- Did not touch §7.4 (non-oracle — preserved by adding nothing) or §7.5
  (sequential `habitId` — dispositioned as not-a-finding across four reviews now).
- No refactor of `dom.js` beyond the five fixes.
