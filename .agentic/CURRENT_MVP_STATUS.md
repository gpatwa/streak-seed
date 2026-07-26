# Current MVP Status — StreakKeeper

**Greenfield — no code yet.** Discovery is complete; delivery not started.

## Discovery artefacts
- `runs/greenfield/00-brief.md` — the ask
- `runs/greenfield/01-discovery-brief.md` — Market Researcher (proceed; segment: Bounced Trackers)
- `runs/greenfield/02-prd.md` — PRD (core loop + 5 non-goals as commitments)
- `runs/greenfield/03-ux.md` — feature spec (at-risk/broken semantics; one-day-cutoff trap)
- `runs/greenfield/04-ui.md` — UX spec (final copy; 7-component vocabulary)

## The MVP slice (what delivery will build)
The core loop as a **headless service**: create a habit; log a completion for
today (idempotent); compute per-habit current streak + longest streak + at-risk
flag, all from **one server-side day cutoff**; user-scoped; audited. No UI in
this slice.

## Not in the MVP
Leaderboards, streak-freeze/purchases, points/badges/avatars, loss-aversion
notifications, non-daily habits, backfilling past days. (See SAFETY_INVARIANTS §3.)
