# Implementation Notes — StreakKeeper MVP

> Stage 6 · Owner: Backend Engineer
> Status: implemented, gates green
> Source spec: `runs/greenfield/05-arch.md` (verified against 16 edge-case checks)
> Guardrails: `.agentic/SAFETY_INVARIANTS.md`, `.agentic/LOCAL_COMMANDS.md`

## Summary

Built the three-module headless service exactly per `05-arch.md`: pure
day-cutoff/streak math (`streak.js`), the in-memory habit store + service
surface (`habits.js`), and the append-only audit log reused verbatim from the
stash-seed reference (`audit.js`). All 12 spec-mapped test cases (T1–T12) pass,
plus the four required npm gates are green. No dependencies, no network, no
persistence beyond in-memory `Map`/`Set`, no HTTP route, no LLM — as specified.

## Files created (8, 0 modified — greenfield)

| File | Contents |
|------|----------|
| `package.json` | ESM (`type: module`), no dependencies, the 5 scripts below. |
| `src/services/streak.js` | Pure: `dayIndex`, `isoDateUTC`, `currentStreak`, `longestStreak`, `atRisk`, `computeView`. No state, no I/O — implements §3 verbatim from the spec. |
| `src/services/habits.js` | Stores (`habits`, `completionDays`, `seq`) + `createHabit`, `listHabits`, `logCompletion`, `_reset`. Imports `streak.js`, `audit.js`. |
| `src/services/audit.js` | Verbatim copy of the stash-seed reference (`recordAuditEvent`, `listAuditEvents`, `_reset`). |
| `scripts/build-check.mjs` | Import-checks the three `src/services/*.js` modules (backs the `build` script; mirrors the reference). |
| `scripts/demo.mjs` | Tiny runnable demo (backs `npm start`) — creates a habit, logs it, re-logs same-day to show idempotency, lists habits. Not a server/route. |
| `test/streak.test.js` | T1, T3, T4 (pure), T10, T12 — 5 cases against the pure module, pinned `todayIndex`, zero store setup. |
| `test/habits.test.js` | T2, T4 (service), T5–T9, T11 — 8 cases against the service surface, pinned `now` via `Date.UTC(2026, 0, 10)`. |

## Verify commands — actual output

### `npm run typecheck`

```
> streak-seed@0.1.0 typecheck
> for f in $(find src scripts -type f \( -name '*.js' -o -name '*.mjs' \)); do node --check "$f" || exit 1; done; echo "typecheck ok"

typecheck ok
```

### `npm test`

```
> streak-seed@0.1.0 test
> node --test

✔ T2: first-ever log sets current/longest to 1 and changed=true (2.176333ms)
✔ T4 (service): a gap breaks the streak but longest survives, via listHabits (0.110958ms)
✔ T5: a same-day re-log is a no-op — changed=false, no duplicate audit event (0.097667ms)
✔ T6: a user only ever sees or affects their own habits (0.771417ms)
✔ T7: audit events never carry the habit name (0.518958ms)
✔ T8: longestStreak survives a break and is still returned (0.103ms)
✔ T9: logging on an at-risk day clears atRisk and extends the streak (0.075083ms)
✔ T11: input guards throw TypeError before any mutation or audit (0.262917ms)
✔ T1: at-risk and broken are mutually exclusive across the day boundary (2.159792ms)
✔ T3: a streak of length 1 behaves the same as any longer run (0.07675ms)
✔ T4 (pure): a broken streak leaves longestStreak unchanged and atRisk false (0.065542ms)
✔ T10: not-started and broken share currentStreak 0 but differ in longestStreak (0.068666ms)
✔ T12: dayIndex maps instants to a single UTC calendar day (0.058333ms)
ℹ tests 13
ℹ suites 0
ℹ pass 13
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 92.580916
```

13 `test()` blocks cover the 12 spec T-numbers: T1–T3 and T5–T12 get one block
each (11 blocks), and T4 — which the spec's own test-plan table marks as
spanning both files ("streak + habits") — gets two: "T4 (pure)" in
`streak.test.js` and "T4 (service)" in `habits.test.js` (2 blocks). 11 + 2 = 13.
All pass, zero failures, zero skipped.

### `npm run build`

```
> streak-seed@0.1.0 build
> node scripts/build-check.mjs

build ok
```

### `npm run qa:mvp` (= typecheck + test)

```
> streak-seed@0.1.0 qa:mvp
> npm run typecheck && npm run test
...
typecheck ok
...
ℹ tests 13
ℹ pass 13
ℹ fail 0
```

Full pass, matching the two gates run individually above.

### `npm start` (demo entry, sanity-run)

Ran cleanly: creates a habit (all-zero initial view), logs it today
(`current 1, longest 1, atRisk false, changed: true`), re-logs same-day
(`changed: false`, all numbers unchanged — idempotency visible end-to-end),
then lists the habit. No errors, no network calls.

**Zero network, zero dependencies** confirmed — no `node_modules/`, no
`dependencies`/`devDependencies` key in `package.json`, `.mjs`/`.js` files
import only Node built-ins (`node:test`, `node:assert/strict`) and each other.

## Deviations from spec, with rationale

1. **`scripts/demo.mjs` added** (not in the spec's 6-file table). My task
   brief requires a real `start` script ("a tiny demo entry is fine"); the
   spec explicitly forbids an HTTP route or adapter in this slice (§5, and
   the Handoff section: "do not add ... an HTTP route"). Resolved by making
   `npm start` a plain local script that calls the service functions
   in-process and prints the results — it demonstrates the service without
   adding a server, a route, or any new boundary. No production code path
   depends on it; it is dead weight the same way `scripts/smoke.mjs` is in
   the stash-seed reference.
2. **`scripts/build-check.mjs` added** (also not enumerated in the spec's
   6-file table, but required by the table's own text: "`build` (import-check,
   per the reference `scripts/build-check.mjs`)"). Treated as implied
   infrastructure, not a scope addition — without it `npm run build` has
   nothing to run.

No deviation in the streak algorithm, the service surface signatures, the
audit event shapes, or the data model — all implemented as specified,
character-for-character where the spec gave exact code (§3).

## Structural invariant check (not just tests)

- **§1 one cutoff:** `Date.now()` appears only as a default-parameter seam
  (`now = Date.now()` on `listHabits`/`logCompletion`/`dayIndex`) — never
  called mid-body, never a `date`/`dayIndex` parameter a caller could
  populate. `createHabit` takes no time input at all. Verified by grep: every
  `Date.now()` occurrence in `src/` is a default-parameter declaration.
- **§2 never silently zero:** `longestStreak` has no store field anywhere in
  `habits.js` — grep confirms the only occurrence is a read
  (`longestStreak: view.longestStreak`) when building audit metadata; the
  value itself always comes from `streak.js`'s `longestStreak(daySet)`
  computed fresh on every read.
- **§5 idempotency:** `logCompletion` computes `changed = !days.has(today)`
  before mutating, so a same-day re-log adds nothing to the `Set` and emits no
  audit event (verified by T5).
- **§4 user-scoping:** `logCompletion` checks `habit.userId !== userId` and
  returns `null` *before* the completion `Set` is read or written; `listHabits`
  filters storage by `habit.userId === userId` before any view is computed
  (verified by T6).

## Rollback

Nothing is committed yet (no commit was requested as part of this stage).
Rollback is one step either way: **delete the 8 new files** — `package.json`,
`src/services/{streak,habits,audit}.js`, `scripts/{build-check,demo}.mjs`,
`test/{streak,habits}.test.js`. Nothing else in the repo imports or depends on
them, and there is no persisted state (in-memory `Map`/`Set` only), so deletion
is equivalent to a full revert with no data migration.

## Handoff

**Next: QA Evidence.** Implementation is complete, all four local gates
(`typecheck`, `test`, `build`, `qa:mvp`) are green with the real output above.
Security & Privacy and Release follow per `STATE.md`. No commit has been made;
that remains a separate, explicitly-requested step.
