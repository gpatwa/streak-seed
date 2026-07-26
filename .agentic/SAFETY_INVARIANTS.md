# Safety Invariants — StreakKeeper

These MUST hold across releases. A slice may not weaken them without explicit
human approval.

1. **One server-side day boundary.** `currentStreak`, `atRisk`, and the
   broken-streak reset all derive from a single server-authoritative day cutoff
   (prototype default: UTC midnight) — never a client-supplied date. If the three
   ever disagree, that is a correctness bug (a habit could read at-risk *and*
   broken at once). Surfaced by the UX Researcher; the core invariant of the slice.
2. **A streak is never silently zeroed.** When a habit is at-risk (logged
   yesterday, not yet today) the current streak stays visible and intact; it
   resets to 0 only once a full day passes with no completion. Longest streak is
   never reduced by a break.
3. **No guilt / loss-aversion mechanics.** The product ships no leaderboards,
   streak-freeze/repair purchases, points/levels/badges/avatars, or loss-aversion
   notifications. A broken streak is reframed ("a new streak"), never punished.
   These are **product commitments, not backlog gaps** — adding one weakens this
   invariant and requires human approval.
4. **A user only ever affects their own data.** Every operation is scoped by
   `userId`; another user's habits or logs are never read or mutated.
5. **Logging is idempotent per day.** Logging a habit already completed today is
   a no-op, never a double-count.
6. **No sensitive content in logs.** Audit / telemetry may carry habit IDs,
   counts, and streak numbers — never habit names or other free text.
