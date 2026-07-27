# Slice Plan — http-layer

> Stage 1 (Intake) · Owner: Orchestrator

## Ask

Put an HTTP surface over the StreakKeeper service so a client (and a future
frontend) can create habits, log completions, and read streaks — **landing the
two preconditions the greenfield run carried forward** for exactly this moment.

## Why now

`runs/greenfield/08-security.md` classified the clock-validation gap as
*required-fix (deferred)* — unreachable with no client surface, but a real
availability/§1 defect the moment one exists. **This slice creates that surface,
so the guard is a gate on this slice, not a nice-to-have.**

## Required (carried preconditions — not optional)

1. **Clock guard.** Validate a **representable date before any mutation** —
   Security proved a `Number.isFinite` check on the day-index is *insufficient*
   (a finite-but-astronomical `now` still corrupts). No client-supplied date may
   reach the authoritative "today" (§1); `now` stays a test-only seam.
2. **Preserve the non-oracle.** The service returns one undifferentiated `null`
   for *foreign* and *fake* `habitId`. The HTTP layer must not split that into
   403-vs-404, or into distinguishable messages/timing. `habitId` is
   **sequentially enumerable** (`habit_${++seq}`), so the §4 ownership gate is
   the sole IDOR defense — never weaken it or move it after a `Set` touch.
3. **§6 over HTTP** — habit names must not appear in logs (incl. access logs).

## Scope (in)

- `src/server.js`: dependency-free `node:http` surface over the existing
  services. Create habit · log completion · list habits (with streaks).
- Input validation at the boundary (body size, JSON, types, required fields).
- `test/server.test.js`: route tests + the precondition evals above.
- `npm start` serves it; `scripts/build-check.mjs` includes it.

## Out of scope

Auth/sessions (userId is a supplied header for this seed, as in stash-seed), TLS,
persistence, rate limiting, a real deploy, any frontend. No new dependencies.

## Tier

**Tier 2** — local HTTP surface, no external effect, no deploy, no data
processor. (Matches stash-seed's equivalent Phase-2b slice.) Deploying it
anywhere real would be a separate rule-3 action.

## Prior art to follow

`stash-seed/src/server.js` — same house pattern: `node:http`, JSON in/out,
`MAX_BODY_BYTES` backpressure, no framework, invariants honored over HTTP.
