# Tech Spec — StreakKeeper HTTP layer

> Stage 2 (Architecture) · Owner: Software Architect
> Slice: `runs/http-layer/00-slice-plan.md` (Tier 2)
> Carried preconditions: `runs/greenfield/08-security.md` §4 (clock) and §1 (non-oracle)
> Prior art: `/Users/gopalpatwa/opt/stash-seed/src/server.js`
> Method: read the shipped services, then ran one throwaway probe against the
> **real** modules to pin the clock failure boundary empirically. Findings that
> correct or extend the security review are marked **[probe]**.

## 0. Shape of the slice

Two commits, in this order (the order is load-bearing — see §6):

1. **`src/services/streak.js`** — `dayIndex()` gains the clock guard, plus unit
   tests. This is the one change to already-shipped service code and it is
   required; §2.5 justifies why it cannot live in the HTTP layer.
2. **`src/server.js`** (new) + **`test/server.test.js`** (new) +
   `scripts/build-check.mjs` (one line) + `package.json` (`start`).

Data model unchanged: still two `Map`s, still `Set<number>` of UTC day-indices,
no new fields, no persistence, no dependencies, `node:http` only.

### Probe results this spec is built on

| `now` passed to `dayIndex` | `ms` | `idx` | `Number.isFinite(idx)` | outcome |
| --- | --- | --- | --- | --- |
| `new Date("garbage")` | `NaN` | `NaN` | false | `RangeError` in `isoDateUTC` |
| `new Date(1e300)` | `NaN` | `NaN` | **false** | `RangeError` — *caught by a naive finiteness check* |
| `8.64e18` (raw) | `8.64e18` | `1e11` | **true** | `RangeError` — **survives a naive finiteness check** |
| `1e300` (raw) | `1e300` | `1.16e292` | **true** | `RangeError` — same class |
| `8.64e15 + 1000` (raw) | out of Date range | `1e8` | true | **silently clamps** to day `1e8` |
| `8.64e15` / `-8.64e15` | max/min | `±1e8` | true | valid (the exact bounds) |
| `null`, `true` | coerced `0` | `0` | true | **silently returns day 0 → 1970-01-01** |
| `"2020-01-01"` | string | `NaN` | false | `RangeError` |

**[probe] Correction to the carried precondition's example.** `new Date(1e300)`
is an *Invalid Date* — `getTime()` is `NaN` — so a plain `Number.isFinite` check
would in fact reject it. The value that genuinely defeats a finiteness-only guard
is a **raw out-of-range epoch number** (`8.64e18`, `1e300`): the index is finite,
and the corruption lands anyway. The security review's §4 nuance is correct; only
its illustrative example needs this substitution. Both forms corrupt identically,
so the guard must cover both, and the test plan pins both (C3, C4).

**[probe] New failure mode not in the review: silent corruption.** `dayIndex(null)`
and `dayIndex(true)` do not throw — they coerce to `0` and return day-index `0`,
i.e. **1970-01-01 becomes "today"**. That is strictly worse than the loud
`RangeError`: it is a §1 violation (wrong authoritative cutoff) with no error, no
exception, and a plausible-looking response. The guard must therefore be a **type
gate first**, not only a range gate.

**[probe] Cascade reproduced end-to-end.** After one bad-clock `logCompletion`,
(a) a *later, perfectly valid* `logCompletion` on the same habit still throws, and
(b) `listHabits(userId)` throws for the whole user — a second, untouched habit was
collateral. Confirms the review's availability framing.

**[probe] Non-oracle re-verified.** Foreign `habitId` and fake `habitId` both
return literally `null`, `JSON.stringify`-identical, with zero audit events.

---

## 1. HTTP surface

Base: `http://127.0.0.1:${PORT|3000}`. All responses are
`content-type: application/json` + `cache-control: no-store` (personal habit data
must not be cached by any intermediary). All request bodies are JSON.

### How `userId` is supplied

**`X-User-Id: <string>` request header. This is a seed stand-in for
authentication. It is not authentication.** Any client can claim any value; there
is no verification whatsoever. It is acceptable only because this slice is Tier 2
— local, in-memory, never deployed, no external effect. Deploying this surface
anywhere reachable would be a separate rule-3 action and would require real auth
first.

Three properties make it a *deliberate* stand-in rather than a shortcut:

- **Single source.** `userId` is read from the header and nowhere else. It is
  never read from the body or the query, so there is no second channel that could
  disagree with the first (§4; test S22).
- **Header, not query — a deliberate improvement on stash-seed.** stash-seed
  passes `userId` in the query string for `GET /items`, which is why its access
  log has to strip the query. Putting the identity in a header means the
  identifier is *structurally incapable* of reaching a URL, an access log, a
  `Referer`, or browser history. The hazard is removed rather than filtered.
- **One swap point.** A single `identify(req)` function returns the caller's
  `userId`. Real auth replaces that function body — validating a bearer token or
  session — and nothing else in the file changes. The §4 ownership gate is
  already exercised today and keeps working unchanged.

Duplicate `X-User-Id` headers are joined by Node into one comma-separated string,
which simply names a third, distinct namespace matching no existing user's data.
No §4 impact.

Because identity is a header and not a cookie, there is **no ambient authority**,
so the usual "require `content-type: application/json` as a CSRF defense" is not
load-bearing here and is deliberately omitted. If a future slice moves identity to
a cookie, that omission must be revisited.

### `HabitView` (the one response object)

```json
{
  "habitId": "habit_1",
  "name": "Drink water",
  "currentStreak": 3,
  "longestStreak": 7,
  "atRisk": false,
  "lastCompletedDate": "2026-07-25"
}
```

Serialized verbatim from the service view. The HTTP layer never recomputes,
rounds, defaults, or renames a field. The key set is **closed** — see §4/§3.

### Routes

**`GET /health`** — liveness. No `X-User-Id` required (it carries no user data).

- `200` → `{"status":"ok"}`

**`POST /habits`** — create a habit.

- Headers: `X-User-Id`
- Body: `{"name": "Drink water"}` — `name` is trimmed and stored trimmed;
  1 ≤ length ≤ 200 after trimming.
- `201` → `{"habit": HabitView}` (all zeros, `atRisk:false`,
  `lastCompletedDate:null`)
- `name` travels **only** in the body. There is no route or parameter anywhere in
  this API that accepts a habit name in a URL. This is what makes §6 structural
  rather than a filtering rule (§4.6).

**`POST /habits/:habitId/completions`** — log a completion **for today**.

- Headers: `X-User-Id`
- Body: none required. `{}`, an empty body, and any JSON object are all accepted;
  **no field of the body is read by this handler.**
- `200` → `{"habit": HabitView, "changed": true|false}`
- `404` → the single foreign-or-fake response (§3)
- The path is `/completions` (plural, a collection) and the day is chosen by the
  server. There is deliberately no `PUT /habits/:id/completions/:date` — a
  date-addressable completion resource would make a client-supplied date part of
  the URL contract, which §1 forbids outright.

**`GET /habits`** — list the caller's habits with streaks.

- Headers: `X-User-Id`
- `200` → `{"habits": [HabitView, ...]}` (empty array when the user has none —
  never a 404, which would leak nothing but would read as an error state)
- Returns only habits owned by the caller. There is no `?userId=` parameter, no
  admin view, and no cross-user list.

**Everything else** — any unmatched (method, pathname) pair → `404
{"error":"not found"}`. Note this body differs from the habit-not-found body; §3
shows why that is not an oracle.

### Not in this slice

No audit-read route, no delete, no rename, no un-log, no pagination, no
notification/subscription endpoint (§3 — a delivery surface built on `atRisk`
requires explicit human approval), no TLS, no rate limiting.

---

## 2. Validation at the boundary

Order of checks per request, all before any service call:

### 2.1 Body size — `MAX_BODY_BYTES = 8_192`

Accumulate chunks and reject as soon as the running byte total exceeds the cap.
8 KiB, not stash-seed's 1 MB: the largest legitimate body here is a 200-character
name, so 8 KiB is already ~10× headroom, and a smaller cap bounds per-connection
memory. On overflow: **send `413` first, then destroy the socket** — never write
to an already-destroyed response.

**[deviation from prior art, and a real bug fix]** stash-seed accumulates with
`data += chunk`, which stringifies each `Buffer` independently and can split a
multi-byte UTF-8 character across a chunk boundary, corrupting it into a
replacement character. Habit names are explicitly expected to be Unicode (the
security review probed `喝水八杯`). This layer must collect chunks in an array and
decode once: `Buffer.concat(chunks).toString("utf8")`.

### 2.2 JSON parse

Empty body → `{}`. Otherwise `JSON.parse`; on failure → `400
{"error":"invalid json"}`. A parsed value that is not a plain object (an array, a
string, `null`) is treated as `{}` — the handlers read named fields, so a
non-object simply has none of them and falls through to the normal
required-field errors.

### 2.3 Identity

`identify(req)`: read `req.headers["x-user-id"]`, require a string, `trim()`,
require non-empty. Missing/blank → `400 {"error":"x-user-id header required"}`.
Trimming resolves the security review's advisory #5 — whitespace-only identities
can no longer create a ghost namespace, and `" alice"` and `"alice"` canonicalize
to one user.

### 2.4 Per-route fields

- `POST /habits`: `name` must be a string; `trim()`; non-empty → else `400
  {"error":"name required"}`; ≤ 200 chars → else `400 {"error":"name too long"}`.
- `POST /habits/:habitId/completions`: `habitId` is the raw path segment,
  **not decoded and not trimmed**, passed verbatim to the service. It is
  deliberately **not** validated for shape (§3 explains why shape-checking it
  would be an anti-goal).
- **Unnamed body keys are ignored.** Each handler reads exactly the fields named
  above. The two dangerous ones have explicit tests proving they are ignored
  rather than honored: a body `userId` (S22) and a body `date`/`now`/`timestamp`
  (S13).

### 2.5 The clock guard

**Location: `src/services/streak.js`, inside `dayIndex()`. This is a required
change to shipped service code.**

```js
const MS_PER_DAY = 86_400_000;
const MAX_TIME = 8_640_000_000_000_000; // ECMA-262 max representable time value

export function dayIndex(now = Date.now()) {
  // 1. Type gate FIRST — null/true/"" coerce to 0 and would silently mean 1970-01-01.
  const isDate = now instanceof Date;
  if (!isDate && typeof now !== "number") {
    throw new TypeError("now must be a valid date or epoch-ms");
  }
  const ms = isDate ? now.getTime() : now;
  // 2. NaN (invalid Date, incl. new Date(1e300)) and ±Infinity.
  // 3. Finite but outside Date's representable range (8.64e18, 1e300, 8.64e15+1000).
  if (!Number.isFinite(ms) || Math.abs(ms) > MAX_TIME) {
    throw new TypeError("now must be a valid date or epoch-ms");
  }
  const idx = Math.floor(ms / MS_PER_DAY);
  // 4. Executable postcondition: isoDateUTC(idx) is now total. Unreachable given (3).
  if (!Number.isFinite(new Date(idx * MS_PER_DAY).getTime())) {
    throw new TypeError("now must be a valid date or epoch-ms");
  }
  return idx;
}
```

**Exactly what it rejects**, and why each clause is load-bearing:

| Rejected | Example | Why the previous/naive guard misses it |
| --- | --- | --- |
| non-`number`, non-`Date` | `null`, `true`, `"2020-01-01"`, `{}` | **[probe]** `null`/`true` coerce to `0` and return day 0 **without throwing** — silent §1 corruption |
| `NaN` | `new Date("garbage")`, `new Date(1e300)` | caught by a finiteness check too; listed for completeness |
| `±Infinity` | `Infinity` | caught by a finiteness check |
| finite but `\|ms\| > 8.64e15` | **`8.64e18`** (idx `1e11`), `1e300` | **`Number.isFinite(idx)` is `true`** — this is the case the naive guard lets through |
| finite, just past the bound | `8.64e15 + 1000` | a *round-trip-only* guard accepts it, silently **clamping** a nonsense epoch to day `1e8` |

**Accepted**, unchanged in behavior: any `number` or `Date` in
`[-8.64e15, 8.64e15]`, i.e. every real clock value. All existing tests pass a
pinned epoch number or a `Date` (verified by grep across `test/` and `scripts/`),
so no shipped caller relies on the rejected coercions and no existing test
changes.

**Postcondition:** `dayIndex` either returns an integer in `[-1e8, 1e8]` for
which `isoDateUTC` is total, or throws. Therefore `isoDateUTC` can never throw on
a value produced by `dayIndex`, and **`NaN` can never enter a completion `Set`.**

**Why it sits there and cannot be bypassed:**

- `dayIndex` is the **single funnel** for the clock. `createHabit` calls
  `dayIndex()` (`habits.js:48`), `listHabits` calls `dayIndex(now)`
  (`habits.js:61`), `logCompletion` calls `dayIndex(now)` (`habits.js:87`). One
  guard covers all three.
- On the write path the ordering is the whole point: `habits.js:87` (`dayIndex`)
  runs **before** `habits.js:95` (`days.add(today)`). Throwing inside `dayIndex`
  closes the exact add-then-throw window, and makes the clock guard consistent
  with the pre-mutation `TypeError`s already on `userId`/`habitId`.
- **A guard in `src/server.js` would guard nothing.** The HTTP layer never passes
  `now` at all, so an edge check would have no value to check. And it would be
  bypassed by every other caller — `scripts/demo.mjs`, the tests, and any future
  adapter. The invariant "no bad clock ever reaches a `Set`" can only be enforced
  where the clock is interpreted.
- `dayIndex` is pure, so the guard adds no state, no I/O, and no ordering
  dependency.

**And separately, at the HTTP layer, `now` is never bound at all.** The handlers
call `logCompletion(userId, habitId)` and `listHabits(userId)` with **fixed
arity, never a third argument**. No body field, query parameter, or header is
parsed as a date anywhere in `src/server.js`. `now` remains a test-only seam. The
guard is defense-in-depth for the day someone wires `new Date(req.body.date)` into
it: that change now fails closed and pre-mutation instead of permanently
corrupting the caller's habit list. Test S15 asserts the call-site arity directly.

### 2.6 Uniform error shape, no internal leakage

Every error response is exactly `{"error": "<lowercase phrase>"}` — one key, no
`code`, no `detail`, no `field`, no `stack`, no request echo. The set of phrases
is **closed**:

`"x-user-id header required"` · `"name required"` · `"name too long"` ·
`"invalid json"` · `"payload too large"` · `"habit not found"` · `"not found"` ·
`"internal error"`

Two consequences worth stating:

- **Service exception messages never reach the wire.** stash-seed forwards
  `e.message` from service `TypeError`s. This layer must not: `logCompletion`'s
  guards throw `"habitId required"` and the new clock guard throws `"now must be
  a valid date or epoch-ms"` — surfacing the latter would advertise an internal
  clock seam. All validation is done at the boundary; any `TypeError` that still
  escapes a service is a bug and maps to `500 {"error":"internal error"}`.
- **A `500` must be unreachable via any request.** The only known path to an
  unexpected throw was the clock `RangeError`, and §2.5 removes it. Test S16
  asserts that even a request carrying `{"now": 8.64e18}` returns `200`, never
  `500` — the guard and the never-bind rule are what make that true.

Node's own 431 on an oversized request line is out of this layer's control; it
applies identically to every id, so it creates no oracle.

---

## 3. Status-code map

| Route | Success | Failure |
| --- | --- | --- |
| `GET /health` | `200 {"status":"ok"}` | — |
| `POST /habits` | `201 {"habit":HabitView}` | `400` x-user-id header required · `400` name required · `400` name too long · `400` invalid json · `413` payload too large |
| `POST /habits/:habitId/completions` | `200 {"habit":HabitView,"changed":true}` first log today · `200 {...,"changed":false}` repeat today | **`404 {"error":"habit not found"}`** for foreign **and** fake · `400` x-user-id header required · `400` invalid json · `413` payload too large |
| `GET /habits` | `200 {"habits":[...]}` (`[]` when none) | `400` x-user-id header required |
| anything else | — | `404 {"error":"not found"}` |
| unexpected throw | — | `500 {"error":"internal error"}` (must be unreachable — §2.6) |

### The one response for foreign-or-fake `habitId`

> **`404` with body `{"error":"habit not found"}` — the identical status, the
> identical bytes, for a real-but-foreign `habitId` and a fully fake one.**

Mechanism, not intention: a single frozen module constant with a **single call
site**.

```js
const HABIT_NOT_FOUND = Object.freeze({ error: "habit not found" });
...
const result = logCompletion(userId, habitId);
if (result === null) return send(res, 404, HABIT_NOT_FOUND);   // the ONLY branch
```

The handler receives `null` and has no way to tell the two apart, because the
service deliberately does not tell it. There is no second lookup, no
`habits.has(habitId)` pre-check, no ownership comparison at the HTTP layer.

**Why `404` and not `403`:** `403` asserts *"this exists but is not yours"* —
that sentence **is** the existence oracle, restated as a status code. `404`
asserts only *"there is no such habit in your namespace"*, which is true for both
cases and discloses nothing. Since every request is scoped to the caller's
namespace, a foreign habit genuinely does not exist there.

**Why not a `200` with `null`:** it would work for the oracle, but it makes a
failed write look like a success to every client and monitor. `404` is honest
about the outcome without being honest about *someone else's* data.

The property, stated precisely: **the only bit this API discloses about a
`habitId` is "is it yours" — which is the bit its owner needs, and the only one.
Existence is never disclosed as a separate signal.**

Byte-identity is enforced on four axes, all asserted in S17:

1. **Status** — one `404` for both.
2. **Body** — one frozen constant, one call site, so the serialized bytes and the
   `content-length` are equal by construction.
3. **Audit** — the HTTP layer emits nothing (§5), and the service emits nothing on
   the `null` path, so neither case leaves a trace the other lacks.
4. **Access log** — the log line is a route *template* plus status (§4.6), so both
   produce the byte-identical line `POST /habits/:habitId/completions 404 <n>ms`.

**Timing, stated honestly.** Both `null` paths do the same work: one `Map.get`,
one `===`, return. The measurable timing difference in this API is between
*success* and *not-found* (success additionally does `Set` operations and computes
a view) — i.e. on the **owned/not-owned** axis, which is already public to the
caller. There is no timing difference on the **foreign/fake** axis, which is the
one that must not leak. No artificial constant-time padding is needed or added.

**`habitId` is deliberately not shape-validated.** Rejecting ids that don't match
`/^habit_\d+$/` with a `400` would introduce a second, distinguishable outcome
class for ids. It leaks nothing about *existence* — but it splits the id space,
and the strongest form of the non-oracle is the one with the fewest classes:
**every value that is not a habit you own — foreign, fake, whitespace,
`__proto__`, a kilobyte of garbage — produces the same `404`.** (`__proto__` and
`constructor` are ordinary `Map.get` misses; the stores are `Map`s, so there is no
prototype-pollution path.) Tested in S19.

**Why the two `404` bodies are not an oracle.** `"not found"` (unmatched route)
and `"habit not found"` (unowned habit) are different strings, but they are
unreachable from the same request shape: `POST /habits/<anything>/completions`
always matches the route regardless of whether the habit exists, so it can only
ever yield `200` or `"habit not found"` — never `"not found"`. The route 404
answers "is this an endpoint", which is public API surface; the habit 404 answers
"is this yours". They never overlap.

`habitId` is sequentially enumerable (`habit_${++seq}`, `habits.js:44`), so the
`habit.userId !== userId` gate at `habits.js:85` is the **sole** IDOR defense.
This slice does not weaken it, does not duplicate it, and does not move it after
a `Set` touch. Enumeration is tested directly in S18.

---

## 4. Invariant preservation over HTTP

### §1 — One server-side day boundary

- **No route accepts a date, time, timezone, or clock input.** Not in a body, not
  in a query, not in a header. There is no date-addressable completion resource
  (§1). `now` is never bound from request data anywhere in `src/server.js`.
- **Fixed-arity call sites.** `logCompletion(userId, habitId)` and
  `listHabits(userId)` — never a third argument. Asserted structurally by S15, so
  a future edit that adds one fails a test rather than silently shipping.
- **Fail-closed if that ever changes.** §2.5's guard means a client-influenced
  `now` throws *before* any mutation, instead of adding `NaN` to a `Set` and
  permanently blanking the user's list.
- **One cutoff per response, not per habit.** `listHabits` computes
  `const today = dayIndex(now)` **once, outside** the loop (`habits.js:61`) and
  reuses it for every habit. So within a single `GET /habits` response no two
  habits can straddle a midnight boundary, and `currentStreak`, `atRisk`, and the
  reset can never disagree with each other. This is the invariant's core clause,
  and it holds over HTTP for free because the service already computes it once.
- Two *separate* requests either side of midnight may legitimately see different
  days. That is correct, not a §1 violation: the invariant requires each response
  to be internally consistent against one server cutoff, which it is.

### §2 — A streak is never silently zeroed

The HTTP layer is a pure pass-through of `computeView`. It performs no
recomputation, no `|| 0` coercion on `currentStreak`, no omission of `atRisk`, and
no substitution for `lastCompletedDate` (which is legitimately `null` for a
never-logged habit and must be serialized as `null`, not dropped). An at-risk
habit is returned over HTTP with its streak intact and `atRisk:true` — S26 asserts
exactly that, using the service's test-only clock seam to seed "yesterday"
(demonstrating in passing that the seam is reachable from tests and *not* from
HTTP).

### §3 — No guilt / loss-aversion mechanics

- The response key set is **closed**: `habitId`, `name`, `currentStreak`,
  `longestStreak`, `atRisk`, `lastCompletedDate` (plus `changed` on the log
  route). No `message`, `state`, `warning`, `rank`, `points`, `badge`, `level`,
  or `streakFreeze`. S27 asserts the exact key set, which makes any future
  gamification field fail a test on arrival.
- No endpoint compares, ranks, or aggregates across users — there is no route
  that can even see two users' data.
- No notification, push, subscription, or reminder surface. `atRisk` is returned
  as a raw boolean for the client to *inform* with; a delivery layer built on it
  is a §3 change requiring explicit human approval.
- A same-day repeat log is a `200`, never a `409`/error — §5 below. Making
  idempotency look like a failure would be a small loss-aversion cue.

### §4 — A user only ever affects their own data

- `userId` has a **single source** (the header) and is passed to every service
  call. A body `userId` is never read; S23 proves a client cannot create a habit
  under another user's id by putting one in the body.
- `GET /habits` returns only owned habits — the service filters by
  `habit.userId === userId` (`habits.js:64`) and there is no unscoped variant.
- The completion route relies on the service's ownership gate **and adds no
  pre-lookup of its own**. A pre-lookup is exactly how the oracle would come back.
- Because ids are sequentially enumerable, that gate is the only IDOR defense.
  S18 sweeps `habit_1..habit_20` as a non-owner and requires all twenty responses
  to be byte-identical; S22 additionally asserts the target user's state is
  unchanged after the attempt.
- No cross-user write path exists at all: the only mutating routes are
  create (scoped to the header identity) and log (gated).

### §5 — Logging is idempotent per day

A second `POST /habits/:habitId/completions` on the same UTC day returns:

- **status `200`** — the same as the first. Deliberately *not* `201`-then-`200`
  and *not* `409`: a repeat is a no-op, not a conflict and not an error. Using one
  status keeps §3's "no punishment" framing and avoids carrying the same fact on
  two channels.
- **the same `habit` object, byte-identical** — `currentStreak`,
  `longestStreak`, `atRisk`, and `lastCompletedDate` are unchanged, because
  `days.add(today)` is skipped and `Set` membership makes the re-log structurally
  a no-op (`habits.js:94`).
- **`"changed": false`** — the only differing field. Honest, useful to a client
  (don't re-animate), and not a failure signal.
- **no second audit event** — `recordAuditEvent` is inside `if (changed)`
  (`habits.js:99`), so the count stays at one per (habit, day). S21 asserts the
  count, not just the response.

### §6 — No sensitive content in logs

Structural, not filtered:

- **Habit names can only travel in a request body.** No route accepts a name in a
  path segment or query parameter (§1). So a name cannot reach a URL, and
  therefore cannot reach anything that logs URLs.
- **The access log emits a route *template*, never the raw path**:
  `GET /habits 200 3ms`, `POST /habits/:habitId/completions 404 1ms`,
  `POST (unmatched) 404 0ms`. No path parameters, no query string, no headers, no
  body, no user id, no habit id. This is a tightening of stash-seed, which logs the
  raw pathname — safe there only because it has no path parameters. Here a caller
  could otherwise put arbitrary free text in the `:habitId` position and have it
  written to stdout. Templating removes that class entirely, and as a bonus makes
  the two foreign/fake log lines identical (§3, axis 4).
- **Error responses never echo input** — including `"name too long"`, which must
  not quote the name it rejected (§2.6).
- **This layer emits no audit events** (§5 below), so it adds no metadata that
  could carry a name.
- The log sink is injectable — `createStreakServer({ log })`, defaulting to
  `process.stdout.write` — purely so S24 can assert on captured lines
  deterministically. Like `now`, it is a test seam and is **not** bindable from a
  request.
- S24 creates habits named `喝水八杯`, `habit_1` (an id-lookalike), and
  `<script>x</script>`, drives every route including error paths, and asserts no
  captured line contains any of them and that every line matches the fixed
  template regex.

The security review's §2 standing condition still holds and is not disturbed: the
audit trail stays name-free and owner-scoped, because this slice adds no audit
event and no audit-read route.

---

## 5. Audit events

**This layer adds none. Explicitly and deliberately: zero new audit events.**

The services already emit exactly the right two — `habit.created {habitId}`
(`habits.js:47`) and `habit.completion_logged {habitId, dayIndex, currentStreak,
longestStreak}` (`habits.js:101`) — each on the state change itself, so an HTTP
event would double-count the same fact from a less reliable position.

More importantly, **an HTTP-layer event would be the fastest way to break the
non-oracle.** The obvious candidate — a `habit.access_denied` event on the 404 —
would reintroduce the existence oracle at the audit layer, where §3's byte-identity
argument does not reach. The security review verified that a rejecting user accrues
**zero** audit events from rejected attempts; that must stay zero. **No
`habit.access_denied`, no `http.request`, no per-request telemetry, ever.**
S17 asserts the event count for both the probing user and the target user.

No audit-**read** route either. `listAuditEvents` is owner-scoped and would be
defensible, but exposing the behavioral-timing metadata over HTTP expands the
surface the review's §2 assessment was scoped to. Out of scope for this slice; a
future slice that adds it must redo that assessment.

---

## 6. Rollback plan

The slice is almost entirely additive, which makes rollback code-only: no
migration, no persistence, no deploy. All state lives in two in-process `Map`s and
dies with the process, so reverting code fully reverts state.

**Commit split (deliberate, and ordered):**

1. `feat(streak): validate the clock before any mutation` — `src/services/streak.js`
   + `test/streak.test.js` + `test/habits.test.js` cases.
2. `feat(server): dependency-free HTTP surface` — `src/server.js`,
   `test/server.test.js`, `scripts/build-check.mjs`, `package.json`.

The guard lands **first** so that no commit in history — and no bisect point —
ever has an HTTP surface without the guard behind it.

**Rollback A — drop the HTTP surface, keep the guard (the expected rollback).**
`git revert <commit 2>`. Restores `"start": "node scripts/demo.mjs"`, removes
`src/server.js` from `build-check.mjs`, deletes `test/server.test.js`. The
services are untouched, so the repo returns to the shipped headless MVP with a
*strictly better* clock. Verify: `npm run qa:mvp && npm run build` green.

**Rollback B — back out the guard too.** `git revert <commit 1>`. This reinstates
the known carried defect and is only safe **together with, and after, Rollback A**.

> **Coupling, stated as a rule: never roll back the clock guard while the HTTP
> surface is live.** Doing so recreates the exact precondition the security review
> named — a client surface with an unguarded clock. If the guard must be reverted
> in an emergency, revert the server first.

**Runtime disable, no deploy needed.** `src/server.js` listens only under
`if (import.meta.url === \`file://${process.argv[1]}\`)`. Not running it is a
complete disable; importing it (build check, tests) starts nothing. Reverting
`package.json`'s `start` back to `demo.mjs` removes the only documented way to
launch it.

**Partial rollback of the surface** is possible without reverting anything:
deleting a single route block is independent, since routes share only `identify`,
`readJson`, and `send`.

---

## 7. Test plan

`node --test`, no dependencies. HTTP tests start the server on port `0`, wait for
`listening`, drive it with `fetch`, and close it in `after()`. Services are reset
between tests via the existing `_reset()` helpers.

### `test/streak.test.js` — clock guard, unit

| # | Case | Assert |
| --- | --- | --- |
| C1 | valid pinned epoch ms and the equivalent `Date` | same index; **no behavior change** for valid input |
| C2 | `dayIndex(new Date("garbage"))` | throws `TypeError` (not `RangeError`) |
| C3 | `dayIndex(new Date(1e300))` | throws `TypeError` — the `Invalid Date` form |
| C4 | **`dayIndex(8.64e18)`** | throws `TypeError`. **The finite-but-astronomical case**: `Math.floor(8.64e18/86400000) === 1e11` and `Number.isFinite(1e11)` is `true`, so this is precisely what a finiteness-only guard misses |
| C5 | `dayIndex(1e300)` | throws — same class, index ≈ `1.16e292` |
| C6 | `dayIndex(8.64e15)`, `dayIndex(-8.64e15)` | **succeed** — the exact representable bounds, `±1e8`; the guard is not over-tight |
| C7 | `dayIndex(8.64e15 + 1000)` | throws — the near-boundary epoch a round-trip-only guard would silently clamp to day `1e8` |
| C8 | `Infinity`, `-Infinity`, `NaN` | throw |
| C9 | `null`, `true`, `false`, `"2020-01-01"`, `{}`, `[]` | throw — previously returned day `0` (**1970-01-01**) silently |
| C10 | postcondition sweep over the bounds | for every index `dayIndex` returns, `isoDateUTC` does not throw |

### `test/habits.test.js` — pre-mutation proof (the regression that matters)

| # | Case | Assert |
| --- | --- | --- |
| H1 | two habits for one user; `logCompletion(u, h1, new Date("garbage"))` | throws `TypeError`; **then** a valid `logCompletion(u, h1)` **succeeds**, and `listHabits(u)` returns **both** habits — no partial mutation, no permanent corruption, no collateral damage to the healthy habit |
| H2 | same, with `8.64e18` | identical assertions — the astronomical form corrupts identically today |
| H3 | `listHabits(u, 8.64e18)` | throws `TypeError`; a subsequent valid `listHabits(u)` still returns everything |

### `test/server.test.js` — routes, boundary, invariants

**Happy paths**

- **S1** `GET /health` → `200 {"status":"ok"}`.
- **S2** `POST /habits` → `201`; body is `{habit:{habitId, name, currentStreak:0,
  longestStreak:0, atRisk:false, lastCompletedDate:null}}`; the stored name is
  trimmed.
- **S3** `POST /habits/:id/completions` → `200`, `changed:true`,
  `currentStreak:1`, `lastCompletedDate` = today UTC.
- **S4** `GET /habits` → `200`, array of views; `[]` for a user with none.

**Validation failures**

- **S5** each of the three user routes without `X-User-Id` → `400
  {"error":"x-user-id header required"}`.
- **S6** whitespace-only `X-User-Id` → `400` (trim + non-empty).
- **S7** `POST /habits` with missing / non-string / whitespace-only `name` →
  `400 {"error":"name required"}`.
- **S8** `name` of 201 chars → `400 {"error":"name too long"}`; **the rejected
  name does not appear in the response body**.
- **S9** malformed JSON → `400 {"error":"invalid json"}`.
- **S10** body > 8 KiB → `413 {"error":"payload too large"}`; the response is
  actually delivered (not a hung or reset socket).
- **S11** unmatched route and unmatched method → `404 {"error":"not found"}`.
- **S12** closed error set: across every failure case above, each body has
  **exactly one key** (`error`) whose value is in the documented allow-list; no
  body contains `"stack"`, `"TypeError"`, `"RangeError"`, `"at Object"`, a file
  path, or the string `"now"`.

**Clock guard over HTTP**

- **S13** `POST /habits/:id/completions` with body
  `{"date":"1999-01-01","now":0,"today":"x","timestamp":8.64e18}` → `200`, and
  `GET /habits` shows `lastCompletedDate` = **the server's** today. Then repeat
  with `{"date":"2999-01-01"}` → `changed:false`. If any client date had reached
  the cutoff, the second call would land on a different day and return
  `changed:true` — so this asserts the §1 property, not just the response.
- **S14** `GET /habits?date=1999-01-01&now=8.64e18` → streaks computed against
  the server's today, identical to the no-query request.
- **S15** **call-site arity guard** (structural): read `src/server.js` and assert
  the only service call sites are `logCompletion(userId, habitId)` and
  `listHabits(userId)` — no third argument — and that the file contains no
  `new Date(` applied to request-derived data. Fails loudly if a future edit binds
  a client date to `now`.
- **S16** even with `{"now":8.64e18}` in the body the response is `200`, never
  `500`, and no error line is written to the log sink.

**The non-oracle**

- **S17** **byte-identity.** User A creates a habit. User B sends
  `POST /habits/<A's real id>/completions` (**foreign**) and
  `POST /habits/habit_999999/completions` (**fake**). Assert equal: status
  (`404`), `await res.text()` **compared as raw strings**, `content-type`,
  `content-length`, and the sorted list of response header names. Plus
  `listAuditEvents("B")` is empty **and** `listAuditEvents("A")` gained nothing.
- **S18** **enumeration sweep.** B probes `habit_1`…`habit_20` where a mix exist
  (some A's, some C's) and none are B's → all twenty raw response bodies and
  statuses are byte-identical to each other and to the fake-id response.
- **S19** **garbage ids** — `%20`, `__proto__`, `constructor`, a 1 KB string →
  each produces the same `404 {"error":"habit not found"}` as the foreign case.
- **S20 (log side-channel)** the captured log lines for the foreign and the fake
  request are byte-identical apart from the duration field.

**§5 idempotency over HTTP**

- **S21** two `POST /habits/:id/completions` on the same day → both `200`; first
  `changed:true`, second `changed:false`; the two `habit` objects are
  **byte-identical**; `currentStreak` did not increment; **exactly one**
  `habit.completion_logged` audit event exists for that (habit, day). Never a
  `409`, never an error status.

**§4 cross-user**

- **S22** A's `GET /habits` never contains B's habits and vice versa; after B's
  failed log attempt on A's habit, A's `currentStreak` is still `0`.
- **S23** identity cannot be smuggled: `POST /habits` with header
  `X-User-Id: A` and body `{"userId":"B","name":"x"}` creates the habit for **A**;
  `GET /habits` as B returns `[]`.

**§6 no names in logs**

- **S24** with an injected log sink, create habits named `喝水八杯`, `habit_1`, and
  `<script>x</script>`; drive every route including every error path; assert **no
  captured line contains any of the three names** (full or partial), and that
  every line matches
  `^(GET|POST) (\/health|\/habits|\/habits\/:habitId\/completions|\(unmatched\)) \d{3} \d+ms$`
  — i.e. no path parameter, no query, no body ever reaches the sink.
- **S25** `POST /habits?name=Drink%20water` → `400 name required` (names are
  body-only, so they cannot enter a URL), and its log line carries no query
  string.

**§2 / §3**

- **S26** seed "yesterday" via the service clock seam
  (`logCompletion(u, id, Date.now() - 86_400_000)`), then `GET /habits` →
  `atRisk:true` **and** `currentStreak:1` — the streak is visible and intact, not
  zeroed (§2). Also demonstrates the seam is reachable from tests and not from
  HTTP.
- **S27** closed key set: every `HabitView` in every response has exactly
  `{habitId, name, currentStreak, longestStreak, atRisk, lastCompletedDate}` —
  no `message`, `state`, `warning`, `rank`, `points`, `badge`, `level`.

**Import safety**

- **S28** `await import("../src/server.js")` exports `createStreakServer` and
  **starts no listener** (no port bound, no output). `scripts/build-check.mjs`
  gains `"../src/server.js"`, which makes this a build-time check too.

### Gate

`npm run qa:mvp && npm run build` green, with all existing greenfield tests
unchanged and passing — the guard is behavior-preserving for every valid clock
value, so no prior test should need editing. If one does, that is a signal the
guard is over-tight and must be re-derived.

## Handoff

To the Implementer. The two carried preconditions are **acceptance criteria**, not
notes: C4/C7/C9 + H1/H2 (guard, pre-mutation, including the finite-but-astronomical
case) and S17/S18/S19/S20 (one byte-identical response for foreign and fake). A
`403`, a distinguishable message, a `habits.has()` pre-check, or any HTTP-layer
audit event on the 404 fails this spec.
