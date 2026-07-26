# Security & Privacy Review — StreakKeeper MVP

> Stage 8 · Owner: Security & Privacy (last technical gate before Release)
> Status: complete
> Source: actual code in `src/services/*.js` + `scripts/*.mjs` + `package.json`;
> `runs/greenfield/05-arch.md`, `06-impl.md`, `07-qa.md`; `.agentic/SAFETY_INVARIANTS.md`,
> `PROJECT_CONTEXT.md`
> Method: read every shipped file; independent grep sweeps; a 4-probe adversarial
> script run against the **real** modules (not trusted from QA); gate re-run.
> I did not rubber-stamp QA — each claim below was re-derived or re-executed.

## Verdict

**PASS — safe to ship as a headless MVP.** No blocker. No secret, PII, or
approval-bypass finding. All six safety invariants hold as written, verified
independently (not merely re-read from QA). Zero dependencies, zero network,
zero eval/exec, no install-time hooks. One real robustness defect (QA's clock
gap) is confirmed and **carried forward as a required precondition on the first
HTTP/adapter slice** — it is genuinely unreachable today and violates no stated
invariant, so it does not gate this slice. Advisories and forward-preconditions
are listed explicitly rather than folded into the pass.

Severity legend: **blocker** (stops release) · **required-fix (deferred)** (must
land before the named future slice) · **advisory** (fold into a later slice) ·
**info** (confirmation, no action).

---

## 1. User isolation (§4) — cross-user read/write + existence-leak surface

**Finding: PASS (info).** No cross-user read or write path exists.

- **Write path.** `logCompletion` (`habits.js:80`) fetches the record and returns
  `null` on `!habit || habit.userId !== userId` **before** the completion `Set`
  is read or written and before `dayIndex(now)` is called (`habits.js:85`). A
  foreign or unknown `habitId` touches no state and emits no audit event.
- **Read path.** `listHabits` (`habits.js:59`) filters storage by
  `habit.userId === userId` and computes a view only for owned records.
  `listAuditEvents` (`audit.js:23`) filters by `e.userId === userId`. There is no
  API that returns another user's habit or event.
- **No object-key injection.** Both stores are `Map`s keyed by `habitId`; `userId`
  is only ever compared with `===`. `habitId "__proto__"`/`"constructor"` are
  ordinary `Map.get` misses (Maps are immune to the plain-object prototype
  footgun) → `null`. No prototype-pollution path.

**Existence-leak surface — verified, QA's claim is correct.** I re-ran it (probe
P1): a **real-but-foreign** `habitId` and a **fully fake** `habitId` both return
literally `null`, `JSON.stringify`-identical (`identical=true`), and the rejecting
user accrued **0** audit events from two rejected attempts. At the service layer
there is **no oracle** distinguishing "not yours" from "doesn't exist" — neither
in the return value nor as an audit side-channel. Confirmed.

**Carried to the future HTTP slice (advisory → precondition):**
- **`habitId` is sequentially enumerable** (`habit_${++seq}`, `habits.js:44`). The
  §4 ownership gate is therefore the *sole* IDOR defense; it must never be
  weakened or moved after a `Set` touch. It is correctly placed today.
- **Preserve the non-oracle at the HTTP layer.** The service returns one
  indistinguishable `null` for both foreign and fake. A naive handler that maps
  `null` to **404 for "unknown" vs. 403 for "not yours"** would *reintroduce* the
  existence oracle this layer carefully eliminated. The HTTP slice must map both
  `null` cases to a **single identical response** (same status, same body). QA
  verified the service-layer equality; this note carries the obligation forward.

## 2. No sensitive content in logs (§6) — habit names, and the timing question

**Finding: PASS (info) for names; one privacy nuance recorded.**

- **Habit names never reach audit.** `recordAuditEvent` is called in exactly two
  places: `habit.created` with `{ habitId }` (`habits.js:47`) and
  `habit.completion_logged` with `{ habitId, dayIndex, currentStreak,
  longestStreak }` (`habits.js:101`). `name` appears only in the `habits` record
  and in the returned `HabitView` (`habits.js:28`) — legitimate UI data to the
  caller, never in audit metadata. Probe P4 dumped **all** audit for a user across
  5 adversarial names (Unicode `喝水八杯`, an id-lookalike, a metadata-key-lookalike,
  and `<script>x</script>`): **zero** leaked, full or partial; metadata keys were
  exactly `{currentStreak, dayIndex, habitId, longestStreak}` on every event.
- **No log/telemetry sink exists at all.** Grep: `src/` has **no** `console.*`,
  `logger`, `telemetry`, or `process.std*` sink. The only `console.log`s are in
  `scripts/demo.mjs` and `scripts/build-check.mjs` — a local human-eyeball demo
  and the import-check, both dev-facing stdout, not a telemetry path. (`demo.mjs`
  prints a `HabitView` that includes `name`; that is the caller receiving its own
  UI data in-process, not a §6 audit/telemetry emission.)

**Are streak numbers / day-indices themselves sensitive? (task question)** —
Assessed. The `completion_logged` metadata is, in effect, a **behavioral-timing
record**: `dayIndex` reveals *which day* a habit was logged and the streak
counts reveal *how consistent* the user is. Habit *timing* can be revealing. But:
(a) invariant §6 **explicitly sanctions** "habit IDs, counts, and streak numbers"
in audit — this metadata is compliant *by deliberate design*, not by oversight;
(b) without the name, an audit reader learns only "`habit_5` was logged on day
20574 with streak 3" — **timing without semantics**; the name is the sensitive
linker and it is correctly withheld; (c) the trail is strictly `userId`-scoped
(`listAuditEvents` filters by owner) and never shipped off-box (no export/network
sink). **Net: compliant.** The standing condition (advisory) is that this holds
*only while* the trail stays both **name-free and owner-scoped** — the moment a
future slice (i) admits the name into audit, (ii) exposes audit events to anyone
but the owning user, or (iii) joins audit across users, the timing metadata
becomes meaningfully sensitive and this assessment must be redone.

## 3. Anti-guilt commitments (§3) — restraint as a product-safety property

**Finding: PASS (info) + standing watch item.** No gamification, notification, or
dark-pattern code exists. Grep for `leaderboard|badge|avatar|points|level|
streak.?freeze|repair|notif|push|reminder|guilt|shame|penalt|punish|nudge|
loss.?aversion` across `src/ scripts/ test/` returned only false positives
(`Array.prototype.push`). The service returns only raw booleans / integers / ISO
strings; there is no returned `"broken"` string or `state` field (all reframing
copy is deferred to the not-yet-built frontend, per `05-arch.md` §3). This matches
the product's stated differentiation (`PROJECT_CONTEXT.md`: "the streak is a
mirror, not a scoreboard").

**Standing watch item (for every future slice).** §3 is a **product commitment,
not a backlog gap**. A future slice that quietly adds a loss-aversion nudge, a
streak-freeze purchase, points/levels/badges, or a "you're about to lose your
streak" notification is a **§3 violation requiring explicit human approval** —
regardless of engagement upside. The at-risk boolean exists to *inform*, not to
pressure; a notification layer built on it would cross the line. Security should
re-scan for this lexicon on every slice that touches the read model or adds any
delivery/notification surface.

## 4. The QA-found clock-validation gap — independent classification

I reproduced the gap end-to-end against the real modules (probe P2) and a variant
QA did not test (P3). QA's factual characterization is **accurate and complete**;
I extend the guard recommendation and sharpen the classification.

**Confirmed behavior.** Passing an invalid clock (`new Date("garbage")`,
`.getTime() → NaN`) to `logCompletion`:
1. Passes the two documented guards (valid `userId`, `habitId`).
2. Reaches `today = dayIndex(now) = NaN` (`streak.js:9–11` never checks finiteness).
3. `days.add(NaN)` succeeds — **partial mutation before any throw** — then the
   function throws an **undocumented `RangeError: Invalid time value`** inside
   `isoDateUTC` (`streak.js:16`, via `computeView`), *unlike* the other two guards
   which throw a `TypeError` **before** touching the `Set`.
4. **Permanent:** a subsequent call with a perfectly valid `now` on the same habit
   **still throws** — because `NaN`, inserted first, becomes `last` in
   `computeView`'s max loop and no real day can dislodge it (`realNum > NaN` is
   always false). Confirmed: the habit is permanently unreadable in-process.
5. **Cascade:** `listHabits(userId)` builds all of a user's views in one loop, so
   it throws entirely and returns nothing — one corrupt habit denies the user
   visibility into **all** their other, healthy habits (P2: a second untouched
   habit was collateral). This is a **local availability** failure, not just a
   single-record integrity bug.

**New nuance beyond QA (P3).** QA recommends "a finiteness guard on `dayIndex()`'s
result (`Number.isFinite`)." Necessary, but **not sufficient**: a *finite but
astronomical* `now` (e.g. `8.64e18` ms → day-index `1e11`, for which
`Number.isFinite` is `true`) still throws `RangeError` in `isoDateUTC` because the
resulting `Date` is out of the representable range. The guard must validate that
the clock maps to a **valid, representable UTC day** — i.e. `Number.isFinite(ms)`
**and** the resulting date is valid (equivalently, bound the index to Date's
range) — not merely that the index is finite.

**Independent classification.**
- **Today, in this slice:** a **robustness / data-integrity defect with a local
  availability (self-DoS) dimension.** It is **not a security issue** (no
  attacker-reachable path: cross-user is blocked by the §4 gate, which runs
  *before* the clock is read — P2 could only corrupt the caller's *own* habit) and
  **not a privacy issue** (it destroys availability, discloses nothing). It
  **violates none of the six invariants** as written — §1 forbids a
  *client-supplied* date, and there is no client; integrity/availability is not a
  named invariant.
- **Reachability today: none.** `now` is a test-only seam defaulting to
  `Date.now()`; there is no HTTP route or client entry point anywhere in the repo
  (confirmed by grep and by QA), and no shipped path (tests, demo) passes an
  invalid clock. Only trusted same-process code can reach it.
- **Exact precondition to become exploitable:** the moment **any
  client-influenced value flows into the `now` parameter** — canonically a future
  handler doing `new Date(req.body.date)` (→ `NaN` on a malformed string) or
  forwarding a raw out-of-range epoch — *without* validating it before
  `dayIndex`. At that point it is simultaneously (a) a real **§1 violation**
  (client-supplied date reaching the cutoff) and (b) a **self-inflicted
  availability/DoS**: one malformed request permanently corrupts and blanks the
  caller's entire habit list until process restart.

**Recommended concrete guard.** Validate the clock **once, at the `dayIndex`
boundary, before any mutation**, since `dayIndex` is pure and shared by every
read and write (so one guard covers `logCompletion`, `listHabits`, and
`computeView`):

```
export function dayIndex(now = Date.now()) {
  const ms = now instanceof Date ? now.getTime() : now;
  const idx = Math.floor(ms / MS_PER_DAY);
  if (!Number.isFinite(idx) || !Number.isFinite(new Date(idx * MS_PER_DAY).getTime())) {
    throw new TypeError("now must be a valid date/epoch-ms");   // parity with existing guards
  }
  return idx;
}
```

The load-bearing property is **order**: because `logCompletion` calls
`dayIndex(now)` (`habits.js:87`) *before* `days.add(today)` (`habits.js:95`),
throwing inside `dayIndex` guarantees a bad clock can **never** partially mutate
the `Set` — closing the exact "add-then-throw" window this defect exploits, and
making the clock guard consistent with the pre-mutation `TypeError`s already on
`userId`/`habitId`.

**Block this slice, or carry it forward?** **Carry it forward.** I concur with QA
that it does not block the headless MVP: unreachable today, violates no invariant.
I strengthen the framing from QA's "should be fixed" to a **required-fix
precondition** that **must land before or with the first HTTP/adapter slice**, and
must be present in that slice's threat model as the canonical `req.body.date`
footgun. Because the fix is trivial, purely additive, and changes no behavior for
valid inputs, I **recommend pulling it into this slice now as cheap
defense-in-depth** — but I do **not** condition PASS on it, since it is genuinely
unreachable in a headless service with no client surface.

## 5. Anything else — injection, demo, package, secrets

**Finding: PASS (info).**
- **Injection surfaces: none.** No `eval`, `new Function`, `child_process`,
  network client, DB, or template-into-sink. String interpolation is limited to
  `habit_${++seq}`, `evt_${…}`, and `` `${label} required` `` where `label` is a
  hardcoded literal — never user input. The `<script>…</script>` habit name is
  stored/returned as an inert string (no HTML sink here); **note for the future
  frontend**: escape habit names on render (standard output-encoding), not a
  service-layer issue.
- **Demo script (`scripts/demo.mjs`):** a plain in-process script over the service
  functions — not a server, route, or new boundary (confirmed; matches `06-impl.md`
  deviation #1 and `05-arch.md` §5). No network, no external input.
- **`package.json` integrity:** `"private": true`, **no `dependencies` /
  `devDependencies`**, **no `preinstall`/`postinstall`/`prepare`** or any
  install-time hook, and no script that fetches (`curl`/`wget`/remote `npx`). The
  five scripts are all local (`typecheck`, `test`, `build`, `qa:mvp`, `start`).
  `node_modules` is absent. Zero-dependency, zero-network supply chain confirmed.
- **Secrets scan:** no `.env`, no keys/tokens/passwords/JWTs, no credential files
  — nothing to inline (there is no external service to authenticate to).
- **`new Date()` real-clock reads** at `habits.js:45` (`createdAt`) and
  `audit.js:16` (`at`): server-side, not client-suppliable, never fed into the
  streak/day-cutoff math, and `createdAt` is never read back or surfaced in
  `HabitView`. Not a §1 concern (info).
- **Whitespace-only strings** pass `assertNonEmptyString` (`" "` is length ≥ 1).
  QA flagged this as intentional per the spec's literal contract. It is not a
  security issue — a whitespace `userId` is still isolated to itself; no
  cross-user effect. **Advisory** for the input-normalization story at the HTTP
  edge (trim + non-empty), not a service-layer fix.

## 6. Role cross-checks (audit coverage, adapter integrity)

- **Audit event coverage — no event removed or weakened.** The spec's two events
  (`05-arch.md` §4) are both present and unchanged: `habit.created` `{ habitId }`
  and `habit.completion_logged` `{ habitId, dayIndex, currentStreak, longestStreak
  }`. Every state-changing function emits exactly one event; reads emit none; the
  same-day re-log emits nothing (§5) — verified structurally and by test T5.
  Nothing was renamed or dropped versus the spec.
- **Adapter boundary integrity — no placeholder became a real client.** There is
  no adapter, LLM client, network egress, or notification sender in this slice, by
  design (`05-arch.md` §5), so there is nothing to "turn real." Grep confirms no
  such client was introduced. No approval-gated boundary was crossed.
- **Approval gates:** the one open human-approval item (create/push a GitHub repo,
  rule 3 — `STATE.md`) is untouched by this stage; I did not create, push, or
  configure any remote. No new send/submit/publish/deploy path was added.

---

## Preconditions carried to the future HTTP/adapter slice

The headless MVP's safety argument rests on "no client surface exists yet." When
that changes, the following must be satisfied by the slice that adds it:

1. **Clock validation (required-fix).** Land the `dayIndex` finiteness+validity
   guard (§4 above) **before or with** the first slice that lets any
   client-influenced value reach `now`. Treat `new Date(req.body.date) → now` as
   the canonical footgun in that slice's threat model. Never forward a client date
   into the cutoff (invariant §1).
2. **Preserve the non-oracle (§1 above).** Map both `null` outcomes
   (foreign + fake `habitId`) to a **single identical HTTP response**; do not
   split into 403-vs-404. `habitId` is sequentially enumerable, so the ownership
   gate is the only IDOR defense — keep it, and keep it before any state touch.
3. **Keep audit name-free and owner-scoped (§2 above).** The behavioral-timing
   metadata is only non-sensitive while the name is absent and events are visible
   only to their owner. Any change to either reopens the §6 privacy assessment.
4. **§3 restraint (§3 above).** No notification/nudge/gamification built on the
   at-risk signal without explicit human approval.
5. **Input normalization (advisory).** Trim + reject whitespace-only `userId` /
   `name` / `habitId` at the HTTP edge.
6. **Output encoding (advisory).** Escape habit `name` on render in the frontend.

## Handoff

**To Release Manager. Recommendation: GO (Tier 2).** This is a safe headless MVP:
zero blockers, all six invariants intact and independently verified, zero
dependencies / network / secrets, and the one real defect is unreachable today and
formally carried forward as a precondition on the first HTTP/adapter slice. The
GitHub-repo push remains a separate rule-3 human-approval stop (`STATE.md`) and is
not part of this gate.
