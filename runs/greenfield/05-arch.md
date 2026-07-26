# Tech Spec — StreakKeeper (MVP slice)

> Stage 5 · Owner: Software Architect
> Status: ready for implementation
> Source: `runs/greenfield/02-prd.md`, `03-ux.md`, `04-ui.md`; `.agentic/SAFETY_INVARIANTS.md`, `PROJECT_CONTEXT.md`
> Reference pattern: `../stash-seed` (dependency-free Node ESM, in-memory `Map` stores, `recordAuditEvent`, `node --test`)
> Release tier: 2 · Model: opus

## Summary

Greenfield headless service for the core loop: **create a habit, log today's
completion (idempotent), and read per-habit `currentStreak` / `longestStreak` /
`atRisk`** — all three derived from **one server-side UTC day cutoff**. No UI,
no persistence beyond in-memory `Map`s, no network, no LLM, no new dependencies.

Three source modules, all new:

- `src/services/streak.js` — **pure** day-cutoff + streak math (no state, no I/O).
  The safety-critical §1/§2 logic lives here, isolated so it is exhaustively
  testable with pinned day indices and zero store setup.
- `src/services/habits.js` — the in-memory stores + `createHabit` / `listHabits`
  / `logCompletion`. Imports `streak.js` and `audit.js`.
- `src/services/audit.js` — reused **verbatim** from the stash-seed reference
  (append-only, `userId`-scoped `recordAuditEvent` / `listAuditEvents`).

This is **one cohesive slice** — there is no phase-1/phase-2 split. The service
returns only raw booleans / integers / ISO date strings; **all user-facing copy
(the `04-ui.md` strings) is the frontend's job**, never baked into the data
layer (`03-ux.md` §5 data-contract). The split into a pure `streak.js` is a
testability seam for the crux invariant, **not** data-model future-proofing.

## 1. Data model

Two module-level stores in `src/services/habits.js`, mirroring how the reference
`savedItems.js` holds `items` + `seq`. Minimal, JSON-ish, no normalization.

```js
/** @type {Map<string, HabitRecord>} */
const habits = new Map();          // habitId -> { habitId, userId, name, createdAt }

/** @type {Map<string, Set<number>>} */
const completionDays = new Map();  // habitId -> Set of UTC day-indices logged

let seq = 0;                       // id counter -> `habit_${++seq}`
```

**Record shapes.**

| Store | Key | Value / shape |
|-------|-----|---------------|
| `habits` | `habitId` (`"habit_1"`) | `{ habitId: string, userId: string, name: string, createdAt: string /* ISO */ }` |
| `completionDays` | `habitId` | `Set<number>` — the set of **UTC day-indices** (see §3) on which the habit was logged. Created lazily on first log. |

**Why a `Set<number>` of day-indices, not per-completion records.** A completion
carries exactly one fact — *which day it counts toward* — and the day-index is
that fact. A `Set` makes **idempotency (§5) free** (`set.add` on an existing
member is a no-op, no double-count), makes order irrelevant, and needs no
`completionId`/`seq`. Storing richer per-log rows (timestamps, ids) would be
premature normalization for data this slice never reads back per-log (Architect
anti-pattern: no future-proofing). No `deletedAt` — this slice never deletes or
backfills (PRD non-goal), so completions are **append-only and today-only**.

**No `longestStreak` field is stored.** It is *derived* from `completionDays`
on read (§3). Deriving it — rather than persisting a mutable counter — makes
"never decreases" (§2, PRD success criterion 2) a **structural** property, not
one a future bug could violate by decrementing a field.

**`userId` is not duplicated onto completions.** A habit's completion `Set` is
reachable only through a `habits` entry the caller owns; every mutating/reading
path checks `habit.userId === userId` first (§4). Denormalizing `userId` onto
each completion would add a field with no reader.

### `HabitView` — the read shape returned to callers

```js
/**
 * @typedef {Object} HabitView
 * @property {string}       habitId
 * @property {string}       name               // UI display text — NOT audit (§6)
 * @property {number}       currentStreak
 * @property {number}       longestStreak
 * @property {boolean}      atRisk
 * @property {string|null}  lastCompletedDate  // "YYYY-MM-DD" UTC, or null if never logged
 */
```

Exactly the `{ currentStreak, longestStreak, atRisk, lastCompletedDate }` of the
`03-ux.md` happy path, plus `habitId`/`name` for identity and display. It
carries **no** tone-laden string, no `state`/`broken`/`streakLost` field, and no
negative number — the four UI states are *derived by the frontend* from these
raw fields (see the non-normative table at the end of §3). `name` is legitimate
UI data returned to the caller; §6 forbids the name only in **audit/telemetry**.

## 2. Service surface

All functions are `userId`-scoped and synchronous. `createHabit` / `logCompletion`
guard bad inputs with `TypeError` (mirroring `bulkDeleteItems`). `now` is an
**injectable clock** for tests (§3), defaulting to real server time.

### `src/services/habits.js`

```js
/**
 * Create a habit for a user. Emits `habit.created` (habitId only, never name).
 * @param {string} userId
 * @param {string} name
 * @returns {HabitView}  initial view (all zeros, atRisk false, lastCompletedDate null)
 * @throws {TypeError} on empty/non-string userId or name (before any mutation/audit)
 */
export function createHabit(userId, name) { /* ... */ }

/**
 * List a user's habits as computed views, as of `now`. Read-only; no audit.
 * Scoped: returns ONLY habits whose record.userId === userId (§4).
 * @param {string} userId
 * @param {number|Date} [now=Date.now()]  injectable clock; NOT client-supplied (§3)
 * @returns {HabitView[]}
 * @throws {TypeError} on empty/non-string userId
 */
export function listHabits(userId, now = Date.now()) { /* ... */ }

/**
 * Log a completion for TODAY (per the server cutoff). Idempotent per day (§5).
 * Ownership-gated: an unknown or foreign habitId returns null with NO mutation
 * and NO audit event (§4) — it never reveals or touches another user's data.
 * @param {string} userId
 * @param {string} habitId
 * @param {number|Date} [now=Date.now()]  injectable clock; NOT client-supplied (§3)
 * @returns {(HabitView & { changed: boolean }) | null}
 *          null if habit not found / not owned; changed=false on a same-day re-log.
 * @throws {TypeError} on empty/non-string userId or habitId (before any lookup)
 */
export function logCompletion(userId, habitId, now = Date.now()) { /* ... */ }

/** Test helper — clears habits, completionDays, and seq. */
export function _reset() { habits.clear(); completionDays.clear(); seq = 0; }
```

**`logCompletion` control flow (ordering is load-bearing).**

1. Guard `userId`, then `habitId` → `TypeError` before any lookup.
2. `const habit = habits.get(habitId);` — if `!habit || habit.userId !== userId`
   → **return `null`** (no mutation, no audit; §4). Ownership is checked *before*
   the completion `Set` is ever touched.
3. `const today = dayIndex(now);` — the single server cutoff (§3).
4. Get/create the habit's `Set`; `const changed = !days.has(today);`.
5. If `changed`: `days.add(today)`, recompute the view, emit **one**
   `habit.completion_logged` (habitId, dayIndex, streak numbers — never name),
   return `{ ...view, changed: true }`.
6. If **not** `changed` (same-day re-log): **no `add`, no audit event**, recompute
   and return `{ ...view, changed: false }`. This is §5 — a duplicate is a
   no-op against both the streak math and the audit trail, never an error.

### `src/services/audit.js` — reused verbatim

`recordAuditEvent(userId, type, metadata)` (event id `evt_N`, ISO `at`,
`userId`-scoped) and `listAuditEvents(userId)` / `_reset()`, identical to the
reference. `userId`-scoping of the audit trail is therefore free (§4/§6).

## 3. Day-cutoff / streak algorithm — the crux (§1, §2)

**One cutoff, one function.** Every day-sensitive value derives from a single
mapping of an instant to a UTC day-index:

```js
const MS_PER_DAY = 86_400_000;

/** UTC day-index: whole UTC days since 1970-01-01. Same UTC calendar day → same int. */
export function dayIndex(now = Date.now()) {
  const ms = now instanceof Date ? now.getTime() : now;
  return Math.floor(ms / MS_PER_DAY);
}

/** Inverse, date-only: day-index -> "YYYY-MM-DD" (UTC). */
export function isoDateUTC(idx) {
  return new Date(idx * MS_PER_DAY).toISOString().slice(0, 10);
}
```

`Math.floor(ms / 86_400_000)` is exact: the Unix epoch is UTC midnight and JS
time has no leap seconds, so this integer is precisely the UTC calendar day.
Integer arithmetic gives "yesterday" (`todayIndex - 1`) and gap length
(subtraction) with no timezone, DST, or string-parse ambiguity.

**The clock is injectable but never client-authoritative (invariant §1).** `now`
exists **only** as a test seam and always defaults to `Date.now()`. There is no
`date` / `dayIndex` parameter on any public function that a request payload could
populate — in a deployed system the request handler calls `logCompletion(userId,
habitId)` / `listHabits(userId)` with **no** clock argument, so server time is
authoritative and a client can never spoof "which day" a completion counts
toward. `dayIndex` is called in exactly one place per read/write, so all three
outputs share one cutoff.

**The three outputs — pure functions of `(daySet, todayIndex)`.**

```js
/** Completed yesterday and not yet today — false in every other case. */
export function atRisk(daySet, todayIndex) {
  return daySet.has(todayIndex - 1) && !daySet.has(todayIndex);
}

/** Consecutive days up to today, holding yesterday's count during the grace day. */
export function currentStreak(daySet, todayIndex) {
  if (daySet.size === 0) return 0;
  let last = -Infinity;
  for (const d of daySet) if (d > last) last = d;
  if (last < todayIndex - 1) return 0;          // ≥1 full empty day elapsed → broken
  let streak = 0, d = last;                      // last is today or yesterday
  while (daySet.has(d)) { streak++; d--; }        // walk the run back from last
  return streak;
}

/** Longest run of consecutive day-indices anywhere in history. */
export function longestStreak(daySet) {
  let best = 0;
  for (const d of daySet) {
    if (!daySet.has(d - 1)) {                      // d starts a run
      let len = 1, n = d + 1;
      while (daySet.has(n)) { len++; n++; }
      if (len > best) best = len;
    }
  }
  return best;
}

/** Bundle the three, plus lastCompletedDate, from one (daySet, todayIndex). */
export function computeView(daySet, todayIndex) {
  let last = null;
  for (const d of daySet) if (last === null || d > last) last = d;
  return {
    currentStreak: currentStreak(daySet, todayIndex),
    longestStreak: longestStreak(daySet),
    atRisk: atRisk(daySet, todayIndex),
    lastCompletedDate: last === null ? null : isoDateUTC(last),
  };
}
```

**One-sentence cutoff rule.** *Every completion is stamped with the UTC
day-index of the server's clock at log time, and `currentStreak`, `longestStreak`,
and `atRisk` are all computed from that one set of day-indices against today's
UTC day-index — never a client-supplied date.*

**Why `atRisk` and "broken" can never both be true (invariant §1, by
construction).** All three read the same `daySet` and the same `todayIndex`, and
the outcome partitions on `last = max(daySet)`:

| Case | Meaning | `currentStreak` | `atRisk` | State |
|------|---------|-----------------|----------|-------|
| `last === todayIndex` | logged today | run ending today, **≥ 1** | `false` (`has(today)`) | healthy |
| `last === todayIndex − 1` | logged yesterday, not today | run ending yesterday, **≥ 1** (intact, **not** zeroed — §2) | `true` | at-risk |
| `last ≤ todayIndex − 2` *or* empty | a full day elapsed empty | **0** | `false` (`!has(today−1)`) | broken (if `longest>0`) / not-started |

The cases are exhaustive and mutually exclusive over one integer `last`, so
exactly one holds. "Broken" requires `currentStreak === 0`, which happens **only**
in the third case, where `atRisk` is necessarily `false`; "at-risk" occurs
**only** in the second, where `currentStreak ≥ 1` so it is not broken. They
cannot coexist because they are computed from the same cutoff — the exact failure
(`atRisk` *and* reset at once) invariant §1 forbids.

**Why `longestStreak` never decreases (§2).** `completionDays` is append-only and
today-only (no delete, no backfill — PRD non-goal), so the set only ever grows;
adding an element can only extend or merge runs, never shorten one. `longestStreak`
is the max run over that growing set, so it is monotonic non-decreasing, and it
is always `≥ currentStreak` (the current run is one of the runs it maximizes over).
A break leaves the historical run in the set, so the longest value survives it —
"longest streak stays visible and unchanged" is structural, not enforced by
discipline.

**Edge cases, resolved by the same rule.**

- **First-ever log:** empty set → log today → run `{today}` ⇒ `currentStreak 1`,
  `longestStreak 1`, `atRisk false` (no `today−1` present), `lastCompletedDate`
  today. No at-risk flash (`03-ux.md` §4).
- **Streak of exactly 1:** length is never special-cased — a `{T}` set is as
  eligible for `atRisk` at `T+1` and for reset at `T+2` as any longer run. `atRisk`
  is **not** gated on streak length (`03-ux.md` §4, the "easy bug").
- **At-risk clears same day:** logging on the at-risk day adds `today`; `atRisk`
  → `false` and the run now ends at `today`, so `currentStreak` increments (PRD
  criterion 4; UX journey step 4).
- **Broken is terminal, not urgent at-risk:** third case forces `atRisk false`
  (`03-ux.md` §4).
- **Not-started vs broken share the digit 0** but differ in the data: not-started
  is `currentStreak 0 && longestStreak 0`; broken is `currentStreak 0 &&
  longestStreak > 0`. The frontend distinguishes them from these fields (no
  service-side string needed).

**UI-state derivation (non-normative — for the frontend, from raw fields only).**

| UI state (`04-ui.md`) | Condition on `HabitView` |
|-----------------------|--------------------------|
| Not started | `longestStreak === 0 && currentStreak === 0` (`lastCompletedDate === null`) |
| Healthy (logged today) | `atRisk === false && currentStreak >= 1` |
| At-risk | `atRisk === true` |
| Broken | `currentStreak === 0 && longestStreak > 0` |

Note "healthy" needs **no** client clock: `atRisk === false && currentStreak ≥ 1`
holds **iff** `last === today` (the only non-at-risk way to have a positive
streak), so the frontend never recomputes a day boundary — reinforcing §1.

## 4. Audit events (invariant §6)

Every state-changing function emits one event via the reused `recordAuditEvent`;
reads (`listHabits`) emit nothing. Metadata carries **IDs, a day-index, and streak
counts only — never the habit name or any free text** (§6).

| Event type | Emitted from | When | Metadata |
|------------|--------------|------|----------|
| `habit.created` | `createHabit` | once per habit created | `{ habitId }` |
| `habit.completion_logged` | `logCompletion` | once per **(habit, day)** — only on `changed === true` | `{ habitId, dayIndex, currentStreak, longestStreak }` |

The same-day re-log path emits **nothing** (§5), so the audit trail holds exactly
one `completion_logged` per habit per day — the auditable expression of
idempotency. All events are `userId`-scoped by `recordAuditEvent` (§4). The habit
`name` flows only into `habits` records and `HabitView` returns (legitimate UI
data), **never** into audit metadata.

## 5. Adapter boundaries

**None — confirmed, by design.** This slice is pure deterministic in-memory logic:
no LLM, no network, no email/notification (PRD non-goal: no push/loss-aversion
alerts), no external service, no persistence beyond the in-memory `Map`s. There
is therefore **no adapter seam and no throwing placeholder** — the reference's
throwing-placeholder rule applies *when* an external boundary exists; here none
does, so inventing one would be dead code. The only injected seam is the `now`
clock (§3), which is not an external integration: it defaults to `Date.now()`,
needs no keys or network, and tests pin it directly. Every test runs with zero
network and zero dependencies.

## 6. Rollback plan

Greenfield pure addition: the slice **is** the initial `src/` + `test/` commit,
touching no pre-existing code (there is none).

1. The engineer lands the slice as a **single commit** (the three `src/services/`
   modules, the two test files, `package.json`).
2. Rollback is one shot: **`git revert <implementation-commit>`** removes exactly
   those files and nothing else, because the slice adds and nothing else depends
   on it. Pre-first-release, deleting the files is equivalent.
3. **No data migration.** Stores are in-memory `Map`s — reverting the code drops
   them; there is no persisted schema, index, or row to migrate or backfill.
4. **No feature flag.** Nothing auto-invokes the service (no route, cron, or UI
   in this slice), so there is no ambient exposure to gate — deletion is the
   rollback and there is no live surface to disable first.
5. **Verify rollback:** on the reverted tree, `npm run qa:mvp` is green and
   `grep -rn "habit" src/` returns nothing.

Note: creating/pushing a GitHub repo for StreakKeeper is a **separate rule-3
human-approval stop** (per `runs/greenfield/STATE.md`) and is *not* part of this
spec or commit.

## 7. Test plan

Node's built-in runner (`node:test` + `node:assert/strict`), mirroring
`test/savedItems.test.js`; `_reset()` at the top of each case. Two files:

- **`test/streak.test.js`** — the pure §1/§2 crux, tested on `daySet` + pinned
  `todayIndex` with no store. Deterministic, no clock.
- **`test/habits.test.js`** — the service surface, audit, and user-isolation,
  pinning `now` via the injected clock (e.g. `Date.UTC(2026, 0, 10)`).

Every required UX edge case, mapped:

| # | Case (source) | File | Assertion |
|---|---------------|------|-----------|
| T1 | **Day boundary: at-risk vs broken never both** (§1; `03-ux.md` §4) | streak | Set `{T−1}`: at `T−1` healthy (`current 1`, `atRisk false`); at `T` `atRisk true` & `current 1` & `!broken`; at `T+1` `atRisk false` & `current 0` & broken. Assert `!(atRisk && current===0 && longest>0)` at every step. |
| T2 | **First-ever log** (`03-ux.md` §4) | habits | Fresh habit → `logCompletion` → `current 1, longest 1, atRisk false, lastCompletedDate = today`, `changed true`. |
| T3 | **Streak of exactly 1 is not special-cased** (`03-ux.md` §4) | streak | `{T}`: at `T+1` `atRisk true, current 1`; at `T+2` `current 0, atRisk false`. Same behavior as a long run. |
| T4 | **Broken streak, gap ≥ 1 day** (§2; `03-ux.md` §4) | streak + habits | `{T−3, T−2}` at `T` ⇒ `current 0, longest 2 (unchanged), atRisk false`. Service-level: log two consecutive days, jump `now` +3 days, `listHabits` shows `current 0, longest 2`. |
| T5 | **Same-day double-log idempotency** (§5) | habits | Two `logCompletion` with same `now`: 2nd returns `changed false`, `current`/`longest`/`lastCompletedDate` unchanged; **exactly one** `habit.completion_logged` for that day in `listAuditEvents`. |
| T6 | **User isolation** (§4) | habits | `u1` creates+logs; `listHabits("u2")` empty; `logCompletion("u2", u1Habit)` returns `null`, u1's set unchanged, **no** audit event under u1 or u2. |
| T7 | **No habit name in audit** (§6) | habits | Habit named `"Meditate"`, create + log; `JSON.stringify(listAuditEvents(u))` does **not** contain `"Meditate"`; `completion_logged` metadata keys are exactly `{habitId, dayIndex, currentStreak, longestStreak}` (no `name`). |
| T8 | **Longest never decreases across a break** (§2; PRD crit 2) | habits | Log a 3-day run, skip 2 days, `listHabits` → `current 0` but `longest 3` still shown. |
| T9 | **At-risk clears same day** (PRD crit 4; UX step 4) | habits | On an at-risk habit, `logCompletion` today → `atRisk false`, `current` +1. |
| T10 | **Not-started ≠ broken in the data** (`04-ui.md`) | streak | Empty set ⇒ `current 0, longest 0`; `{T−3,T−2}` at `T` ⇒ `current 0, longest 2`. Distinguishable by `longestStreak`. |
| T11 | **Input guards** (reference parity) | habits | `createHabit`/`logCompletion` with empty/`null` `userId` (and empty `name`/`habitId`) throw `TypeError`; no mutation, no audit. |
| T12 | **dayIndex cutoff** (§3) | streak | Two instants in the same UTC day → same index; `23:59:59Z` and the next `00:00:00Z` differ by 1; `dayIndex` accepts a `Date` or epoch-ms and matches. |

**QA gate.** `npm run qa:mvp` (= `typecheck` + `node --test`) green, **zero
network, zero dependencies**. `package.json`: `"type": "module"`, scripts
`typecheck` (`node --check` each file), `test` (`node --test`), `build`
(import-check, per the reference `scripts/build-check.mjs`), `qa:mvp`
(`typecheck && test`) — matching `.agentic/LOCAL_COMMANDS.md`.

## File plan

**6 new files, 0 modified** (greenfield).

| File | Contents |
|------|----------|
| `src/services/streak.js` | Pure: `dayIndex`, `isoDateUTC`, `currentStreak`, `longestStreak`, `atRisk`, `computeView`. No state, no audit. |
| `src/services/habits.js` | Stores (`habits`, `completionDays`, `seq`) + `createHabit`, `listHabits`, `logCompletion`, `_reset`. Imports `streak.js`, `audit.js`. |
| `src/services/audit.js` | Verbatim from the stash-seed reference. |
| `test/streak.test.js` | T1, T3, T4(pure), T10, T12. |
| `test/habits.test.js` | T2, T4(service), T5–T9, T11. |
| `package.json` | ESM, the four scripts above; no dependencies. |

## Handoff

**Next: Backend engineer (Implementation).** Build the six files exactly per this
spec in one commit, then run `npm run qa:mvp`. Own the data shape and service
boundary as specified; do **not** add a persistence layer, an HTTP route, an
adapter, or any user-facing string (those are out of this slice). Then QA
Evidence → Security & Privacy → Release. Product scope (PM) and visual design
(UI Designer) are settled upstream and not re-opened here.
