# Release Checklist — StreakKeeper browser client

> Stage: Release · **Walked directly by the Orchestrator, not spawned**
> (`RUN_ECONOMICS.md`: agents for judgment, direct execution for facts). Every
> gate below has an objective answer, and the budget was already spent.

## Tier 2 gates

| Gate | Result | Evidence |
|------|--------|----------|
| Typecheck | ✅ pass | `typecheck ok` |
| Tests | ✅ pass | **84/84**, 0 fail (57 before this slice) |
| Build (import check) | ✅ pass | `build ok` — static assets read at import, so a missing asset fails the build |
| QA gate | ✅ pass (round 2) | Round 1 **FAILED** on a live a11y defect; fixed and re-verified — `03-qa.md` |
| Security gate | ✅ **PASS, no blockers** | `04-security.md` — the "no unsafe path" claim verified structurally *and* in live Chromium |
| Client invariants | ✅ pass | zero `innerHTML`, zero `Date`, zero `console.` in `src/client/` (grep, at release) |
| Scope discipline | ✅ pass | only the client, its tests, the static route, and S24's widened regex |
| Rollback | ✅ pass | delete `src/client/` + the four `client-*.test.js`, revert the `STATIC` block and S24's regex. No data, no migration. |
| Deploy smoke / live SLOs | n/a — reason | loopback-only, nothing deployed |
| Approval rules | n/a — reason | no send, deploy, model, or new processor |

## What this slice actually delivered

The UI that discovery specified in Phase 4 and **nothing had ever displayed**:
all seven states, the 7-component vocabulary, and the final copy verbatim —
including the reframe that a broken streak reads *"Today starts a new streak."*
and never the word "broken".

## The two gates that fired

1. **QA failed it.** The arch doc called for a manual browser check (§10, "not
   asserted in CI") that had never been run. QA ran it and found focus lost after
   logging — `mount()` destroyed the clicked control and nothing re-focused it.
   A real keyboard-accessibility regression against an explicit requirement in
   both `01-arch.md` §7.2 and `04-ui.md` §4. Fixed with `restoreFocus`, guarded
   by three regression tests **proven non-vacuous**.
2. **The budget stopped the run.** The pre-spawn check failed before Security
   (538k spent of 550k). Escalated with numbers rather than continuing; the human
   authorized the overrun explicitly because this slice carries the product's
   first XSS surface. Recorded as an approved exception — *not* a raised budget.

## Carried forward (Security's advisories — none gate this release)

- **F-1 `href` double-stringification.** `setProp` calls `String(value)` twice —
  validate, then re-stringify — so a stateful `toString` defeats the guard.
  Demonstrated by Security. Unreachable today (the sole `href` call site returns
  a template literal) and CSP blocks the outcome independently. **One-line fix;
  deliberately not made here** — an unreviewed change to security-critical code
  after the security gate passed is worse than a documented latent advisory.
- **F-2 unvalidated `vnode.tag`.** `create()` passes the tag to `createElement`
  without checking; `script`/`iframe`/`base` all construct. No data-derived tag
  exists today. **Becomes a required fix the moment any slice builds a vnode
  from data.**
- **F-3** no Trusted Types. **F-4** JSON responses lack `nosniff` — not navigable
  today; a precondition if auth or content-type handling changes.

## Decision

**GO (Tier 2)** — for a local, loopback-only client. All gates pass or are
n/a-with-reason; the one QA failure was fixed and re-verified; Security passed
with no blockers and no conditions on release.

Landing = local commit. **Deploying this anywhere, or exposing it beyond
loopback, remains a separate rule-3 human action** — the safety argument still
rests on unreachability plus a self-asserted `X-User-Id`.
