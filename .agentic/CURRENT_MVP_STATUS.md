# Current MVP Status — StreakKeeper

**MVP slice landed (local)** — commit `eee59ce`, Tier 2 GO. Built 0→1 by the
Agentic SDLC pipeline (Phase 4 greenfield run, `runs/greenfield/`).

## What ships
A headless, dependency-free Node service: create a habit; log a completion for
today (idempotent per day); per-habit current streak + longest streak + at-risk
flag, all from **one server-side UTC day cutoff**; user-scoped; audited (no
habit names). 13/13 tests; all 6 `SAFETY_INVARIANTS` independently verified
(QA + Security).

## Source
- `src/services/streak.js` (pure day-cutoff math), `habits.js`, `audit.js`
- `test/streak.test.js`, `test/habits.test.js`
- Run: `npm run qa:mvp` · `npm start` (demo)

## Not in this slice (see SAFETY_INVARIANTS §3 + `runs/greenfield/10-post-launch.md`)
No UI/HTTP surface; no leaderboards/streak-freeze/points/loss-aversion; no
non-daily habits or backfill. Known non-blocking finding: an unvalidated clock
arg → **required fix before the first HTTP slice** (validate a representable
date before mutation — not just `isFinite`).

## Hardening (slice `security-hardening`, 2026-08-22 — local, uncommitted)

Five defects closed in the rendering boundary and HTTP headers: single
stringification in `setProp` (F-1), a 9-tag allowlist + child validation in
`create()` (F-2), `require-trusted-types-for 'script'` in the CSP (F-3),
`nosniff` + `charset=utf-8` on JSON responses (F-4), and `vnode.tag` bound once
(F-5 — the F-1 defect found inside the F-2 fix by the Security re-gate).

84 → **91 tests**. `SAFETY_INVARIANTS` §6 re-verified **at runtime** with a
hostile-named habit: no habit name in any log, console, title, or URL; the access
log carries route templates only. Trusted Types confirmed enforcing in live
headless Chromium, with a non-vacuity probe.

Preconditions §7.1/§7.2/§7.3 from `runs/browser-client/04-security.md` are
**struck**. New standing precondition **§7.7**: widening `ALLOWED_TAGS` or
`ALLOWED_PROPS` is a rule-4 safety-control change and needs human approval.

**Uncommitted** — in the working tree pending human review. See
`runs/security-hardening/04-release.md`.

## Repo
Pushed (public): https://github.com/gpatwa/streak-seed — rule-3, human-approved.
