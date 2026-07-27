# Security & Privacy Review — StreakKeeper HTTP layer

> Stage 5 · Owner: Security & Privacy (last technical gate before Release)
> Status: complete
> Slice: `runs/http-layer/00-slice-plan.md` · Spec: `01-arch.md` · Impl: `02-impl.md` · QA: `03-qa.md`
> Prior review (the source of the two carried preconditions): `runs/greenfield/08-security.md`
> Source of truth: the shipped code — `src/server.js`, `src/services/{streak,habits,audit}.js`,
> `test/server.test.js`, `package.json` — plus `.agentic/SAFETY_INVARIANTS.md`.
> Method: read every changed file; independent grep sweeps; **six adversarial probe
> scripts** run against real spawned server processes and the real modules —
> raw-socket protocol probes (methods, smuggling, dup headers, route bypass),
> JSON-hostility, identity-confusion, a controlled interleaved timing experiment,
> abort/DoS lifecycle, and a bind-surface probe. Gates re-run myself.
> I did not rubber-stamp QA: I re-derived both precondition verdicts, corrected one
> imprecise claim in the spec, corrected **one of my own** first measurements, and
> found one issue neither QA nor the spec covers.

## Verdict

**CONDITIONAL PASS — blocked on one one-line fix.**

**Both carried preconditions are genuinely CLOSED.** That is the point of this
slice and it is a real, independently verified result — not a formality. The
clock guard sits in the service funnel where it cannot be bypassed and throws
before any mutation; the foreign-vs-fake non-oracle holds on every channel I
could measure, including ones QA did not test.

**One new blocker, introduced by going HTTP and not covered by the spec, the
impl notes, or QA: the server binds to every network interface, not loopback**
(BIND-1, §3.1). The spec's entire justification for accepting a self-asserted
`X-User-Id` as identity is that the surface is local and unreachable; the code
does not implement that, so the slice crosses a boundary the spec itself
designates as approval-gated. The fix is one line and zero-risk.

Nothing else found rises above advisory. No secret, PII, injection, or
approval-bypass finding. All six safety invariants hold over HTTP.

Severity legend: **blocker** (stops release) · **required-fix (deferred)** (must
land before the named future slice) · **advisory** (fold into a later slice) ·
**info** (confirmation, no action).

| # | Finding | Class |
| --- | --- | --- |
| BIND-1 | Server binds `*:PORT` (all interfaces), not `127.0.0.1` as specified | **blocker** |
| 413-1 | 413 advertises `Connection: keep-alive`, then RSTs the socket | **required-fix (deferred)** |
| DOS-1 | No request/socket timeouts or connection cap set (Node defaults only) | advisory |
| OBS-1 | Non-413 stream errors produce no response *and* no access-log line | advisory |
| SPEC-1 | Spec §3's timing claim is imprecise (conclusion still correct) | info |
| PROXY-1 | QA finding 2 (Proxy-Date native TypeError) — confirmed cosmetic | info |

---

## 1. Precondition 1 — the clock guard: **CLOSED**

Carried from `08-security.md` §4 / precondition 1. The obligation had three
parts: the guard must sit where it cannot be bypassed, it must throw before any
mutation, and no client-supplied value may reach the authoritative "today".
All three verified.

**Placement — a service funnel, not the edge. Correct.** The guard lives inside
`dayIndex()` in `src/services/streak.js`, which is the single point where a
clock value is interpreted. All three callers funnel through it: `createHabit`
(`habits.js:48`), `listHabits` (`habits.js:61`), `logCompletion`
(`habits.js:87`). An edge-only check in `src/server.js` would have guarded
nothing — the HTTP layer never passes `now` at all — and would have been
bypassed by `scripts/demo.mjs`, the tests, and every future adapter. This is the
right location and the spec's §2.5 reasoning for it is sound.

**Pre-mutation ordering — verified, and stronger than required.** In
`logCompletion`, `dayIndex(now)` (line 87) runs before *every* state touch: not
only before `days.add(today)` (line 95) but before the lazy
`completionDays.set(habitId, new Set())` at lines 89–92. A rejected clock
therefore creates nothing at all — not even an empty Set. I confirmed
end-to-end: a bad clock throws `TypeError`, a subsequent valid call on the same
habit succeeds normally, `listHabits` still returns everything, and the audit
count lands exactly where it should (1 `habit.created` + 1
`habit.completion_logged`). The permanent-corruption and collateral-damage
cascade from the greenfield review is gone.

**Guard strength — validates the value, not just the type.** The guard is a type
gate first (rejecting `null`/`true`/`""`, which previously coerced to day 0 =
1970-01-01 *silently* — the worst form of the old defect), then finiteness, then
the `|ms| > 8.64e15` range check, then an executable postcondition. I probed the
bypass class QA's battery motivated but did not fully close: a **lying**
`Date` — a `Proxy` or subclass whose `getTime()` returns an out-of-range value.

```
Proxy lying getTime -> 8.64e18        -> TypeError (guard's own message)
Proxy lying getTime -> NaN/Infinity    -> TypeError
Date subclass getTime -> 8.64e18       -> TypeError
Date subclass getTime -> valid         -> accepted (idx 11574) — not over-tight
obj with throwing valueOf/toPrimitive  -> TypeError, coercion hook NEVER invoked
```

This is the load-bearing property: the guard applies its range checks to the
*result* of `getTime()` rather than trusting `instanceof`, so type confusion
cannot smuggle a bad index through. Attacker-controlled coercion hooks are never
reached, because the `typeof` gate rejects before any arithmetic.

**No client-supplied value can reach `now` — verified structurally and
behaviorally.** Structurally: `src/server.js` contains zero `new Date(`; the only
header ever read anywhere in the file is `x-user-id` (line 132); the service call
sites are fixed-arity — `createHabit(userId, name)`, `listHabits(userId)`,
`logCompletion(userId, habitId)`. Behaviorally — the proof that matters, because
absence-of-error proves nothing:

```
POST .../completions {"date":"1999-01-01","now":0,"timestamp":8.64e18,"dayIndex":1}
  -> 200 changed=true  lastCompletedDate=2026-07-26   (server's real today)
POST .../completions {"date":"2999-01-01","now":8.64e18}
  -> 200 changed=false      <== must be false
GET /habits?date=1999-01-01&now=0&dayIndex=1  -> lastCompletedDate=2026-07-26
X-Now / X-Date / Date / If-Modified-Since headers -> ignored
```

If any client-supplied date had reached the cutoff, the second request would
have landed on a different day-index and returned `changed:true`. It returned
`false`. The cutoff is server-authoritative on every channel — body, query, and
header.

**Verdict: CLOSED.** Guard correctly placed in the funnel, throws before any
mutation including Set creation, robust against type confusion and lying Dates,
and no route, header, body field, or query parameter can reach the clock.

## 2. Precondition 2 — the non-oracle: **CLOSED**

Carried from `08-security.md` §1 / precondition 2: foreign and fake `habitId`
must be indistinguishable, and the §4 ownership gate — the sole IDOR defense,
because ids are sequentially enumerable — must stay before any Set touch.

**The ownership gate is still correctly placed.** `habits.js:85` —
`if (!habit || habit.userId !== userId) return null;` — runs before `dayIndex`
(line 87) and before every Set operation. This slice did not weaken it,
duplicate it, or move it. The HTTP layer adds **no** pre-lookup of its own: there
is no `habits.has()` check, no ownership comparison, and no second lookup in
`src/server.js`. The handler receives `null` and structurally cannot tell the two
cases apart.

**Mechanism, not intention.** One frozen constant (`HABIT_NOT_FOUND`,
`server.js:33`) with exactly one call site (`server.js:265`). I verified by
reading it, not by trusting the comment.

**Indistinguishable on every channel I could measure:**

| Channel | Foreign (`habit_1`, A's) | Fake (`habit_999999`) | Identical |
| --- | --- | --- | --- |
| Status | 404 | 404 | yes |
| Body bytes | 27 B `{"error":"habit not found"}` | 27 B, same | yes (`Buffer.equals`) |
| `content-length` | 27 | 27 | yes |
| Header set **and wire order/casing** | `content-type, cache-control, content-length` | same | yes |
| `transfer-encoding: chunked` fallback | absent | absent | yes |
| Audit events (prober / victim) | 0 / +0 | 0 / +0 | yes |
| Access log | `POST /habits/:habitId/completions 404 Nms` | identical | yes |

I read `res.rawHeaders` via `node:http` rather than `fetch` specifically to get
the literal wire order and casing — `fetch`'s `Headers` normalizes before you can
see it. Order matches, not just the sorted set.

**Timing — reasoned about, then measured, then corrected.** The task asks
whether there is a data-dependent branch before the response. **There is**, and
the spec is imprecise about it. `01-arch.md` §3 states both null paths do "one
`Map.get`, one `===`, return." In fact `!habit || habit.userId !== userId`
short-circuits: the **fake** path takes a `Map.get` *miss* and never evaluates
the string comparison; the **foreign** path takes a hit and does one extra
property read plus one string compare. The premise is wrong; the conclusion is
right, and I verified that rather than assuming it.

My first HTTP measurement showed a 41 µs gap — which was an artifact of my own
test, not the code: I used ids of different lengths (`habit_1` vs
`habit_999999`, different request byte counts) and sampled in blocks rather than
interleaved. Re-run properly — equal-length ids (`habit_1` real vs `habit_9`
nonexistent, 27-char paths both), interleaved A/B/A/B, n=3000 each, with a
same-vs-same control arm:

```
TEST     foreign median=49.13us   fake median=49.08us   delta = 0.04us
CONTROL  fake vs fake (identical requests)               delta = -0.08us   <- noise floor
SCALE    owned (200, real Set work + view) vs fake (404) delta =  0.08us
```

The foreign-vs-fake delta is **smaller in magnitude than the measurement noise
floor**. In-process at 200k iterations the delta is ~3 ns against 6–10 ns of
run-to-run noise. Note the SCALE row: even the *owned vs not-owned* axis — the
one bit this API is designed to disclose — is only 0.08 µs, swamped ~600× by
per-request HTTP overhead. No padding is needed or warranted.

**Widened adversarial id space.** Beyond QA's sweep I confirmed `__proto__`,
`constructor`, `%00`, `%2F`, dot-segments, and case variants all produce the
identical 404. The stores are `Map`s, so these are ordinary `Map.get` misses —
no prototype-pollution path, confirmed live (§3.4).

**One interaction worth recording.** Because the §4 gate runs *before*
`dayIndex`, a bad clock combined with a foreign id returns `null` (404) rather
than throwing, while a bad clock on an *owned* id throws (→ 500). Were a client
clock ever bindable, that would create a 500-vs-404 split — but on the
**owned/not-owned** axis, which is already public to the caller, not on the
foreign/fake axis. So it would not reopen this precondition. Moot today; recorded
because it is the kind of interaction a future slice could get wrong.

**Verdict: CLOSED.** Byte-identical on status, body, content-length, header set
and order; no audit or access-log side channel; no measurable timing channel; the
sole IDOR defense is intact and correctly placed.

## 3. New attack surface introduced by going HTTP

This is the area the spec and QA do not fully own. I probed rather than reasoned
where I could — six scripts against real spawned processes.

### 3.1 BIND-1 — the server listens on every interface, not loopback · **BLOCKER**

`server.js:310` calls `createStreakServer().listen(port, cb)` with **no host
argument**. Node then binds the unspecified address, so the socket accepts
connections from any host that can route to this machine:

```
$ lsof -nP -iTCP:41886 -sTCP:LISTEN
node ... IPv6 ... TCP *:41886 (LISTEN)          <-- wildcard, all interfaces
control: listen(port,"127.0.0.1") -> TCP 127.0.0.1:41887 (LISTEN)   <-- what loopback looks like
```

Reached over the host's LAN address, it served a user's data to a self-asserted
identity header:

```
GET /habits   Host: 192.168.0.42:41886   X-User-Id: alice
  -> 200 {"habits":[{"habitId":"habit_2","name":"PrivateHabit",...}]}
```

**Why this is a blocker and not an advisory.** `01-arch.md` §1 documents the base
as `http://127.0.0.1:${PORT|3000}` and rests the *entire* acceptability argument
for unauthenticated `X-User-Id` on it, in its own words: the header is
acceptable "only because this slice is Tier 2 — local, in-memory, never
deployed, no external effect," and "deploying this surface anywhere reachable
would be a separate rule-3 action and would require real auth first." Binding to
`*` *is* making it reachable. The implementation therefore performs, as a side
effect, the very thing the spec designates as requiring explicit human approval —
and it does so silently: it is not among the impl notes' five deviations, and QA
did not test it. This is precisely the class of gap that "we went from a headless
library to an HTTP server" introduces, and no other document owns it.

**Residual risk on this host is not theoretical:** the macOS application firewall
is **disabled** (`socketfilterfw --getglobalstate` → `State = 0`), so there is no
OS-level mitigation. Running `npm start` on any shared network exposes an
unauthenticated, mutating API. Exploitation needs no sophistication: identity is
a self-asserted header, `habitId` is sequentially enumerable, and there is no
rate limiting. The one friction is that reading a specific user's data requires
guessing their `userId` string (userIds are not enumerable through the API);
creating habits under arbitrary ids needs no guessing at all.

**Required fix (one line):**

```js
createStreakServer().listen(port, "127.0.0.1", () => { ... });
```

Prefer a `HOST` env var defaulting to `127.0.0.1` if a future slice needs
flexibility — the default must be loopback. Add a test asserting
`server.address().address` is a loopback address, so this cannot silently
regress.

**Note for the playbook, outside this repo's scope:** the same pattern exists in
the prior art (`stash-seed/src/server.js:111` — `listen(port, cb)`). It was
inherited, not invented here. That does not reduce the finding, but it means the
seed template itself should be corrected, or every future HTTP slice will
reproduce it.

### 3.2 Request smuggling and duplicate headers · **info (no finding)**

Probed with raw sockets, since an HTTP client library would sanitize exactly what
I wanted to test. Node v25's parser rejects **every** smuggling variant with a
400 before `handleRequest` ever runs:

```
Content-Length + Transfer-Encoding: chunked   -> 400 (never reaches app)
two Content-Length headers                    -> 400
duplicate Transfer-Encoding: chunked          -> 400
obfuscated "Transfer-Encoding : chunked"      -> 400
negative Content-Length                       -> 400
obs-fold header continuation                  -> 400
```

**Can `X-User-Id` be sent twice? Yes — and it is safe.** Node joins duplicates of
a non-special header into one comma-separated string. The critical question is
whether that resolves to one of the two claimed identities. It does not — I
tested with a habit already seeded for alice, in both header orders:

```
X-User-Id: alice + X-User-Id: bob   -> 200 {"habits":[]}   (joined "alice, bob" — a third namespace)
X-User-Id: bob   + X-User-Id: alice -> 200 {"habits":[]}   (same, order-independent)
X-User-Id: alice + X-User-Id: (empty) -> 200 {"habits":[]}
```

Neither first-wins nor last-wins; there is no identity-confusion path. Matches
the spec's documented, accepted behavior. Header-name casing is irrelevant
(`X-USER-ID` works identically — Node lowercases).

**Identity cannot be smuggled through any second channel** — confirmed live:
`?userId=alice` sent as bob returns `[]`; a body `{"userId":"alice"}` sent as bob
creates the habit for **bob**, and alice's list is unchanged afterwards.
Whitespace-only `X-User-Id` → 400; `"  alice  "` canonicalizes to `alice`.
The greenfield review's advisory #5 (input normalization) is closed.

### 3.3 Header/log injection (CRLF) · **info (no finding)**

Structurally impossible, and I verified the structural claim rather than
assuming it. The single log call site (`server.js:172`) interpolates only
`method`, `routeTemplate`, `status`, and a computed duration. `routeTemplate` is
one of four literals from a closed set. `method` cannot carry injection because
Node's parser rejects anything that is not a known method token — verified:

```
FOO /health          -> 400 (parser, never reaches app)
lowercase "get"      -> 400
"GE\r\nT /health"    -> 400
PATCH (known)        -> reaches app, logs as "PATCH (unmatched) 404 0ms"
```

The raw path, query string, habit id, user id, and body never reach the sink at
all — see §4.

### 3.4 JSON parse hostility · **info (no finding)**

All within the 8 KiB cap, all handled cleanly, no 500, no crash:

```
4000-deep nested arrays        -> 400 invalid json   (V8 throws; caught)
1300-deep nested objects       -> 400 invalid json
{"name":1e999} (-> Infinity)   -> 400 name required
8000-digit integer literal     -> 400
{"__proto__":{"polluted":..}}  -> 201; no pollution took (verified after)
{"constructor":{"prototype":..}} -> 201; no pollution
bare array / null / string body-> 400 name required  (treated as {}, per spec)
name as object                 -> 400 name required
invalid UTF-8 bytes            -> 400 invalid json
```

No pollution is possible: `JSON.parse` creates own properties, and the code never
merges, spreads, or `Object.assign`s the parsed body into anything — it reads
exactly one named field.

**Body cap boundary is exact:** an 8192-byte body is accepted (and then rejected
by the 200-char name rule); 8193 bytes returns 413. The `Buffer.concat`-then-
decode-once fix is real and correct — multi-byte UTF-8 round-trips intact.

### 3.5 Route-matching bypass · **info (no finding)**

Every variant falls to a clean `404 {"error":"not found"}` — none matched a route
they should not:

```
/HABITS  //habits  /habits/  /./habits  /foo/../habits  /habits/../habits
/habits%2Ffoo/completions  /habits;x=1  /habits#frag  /health/
absolute-form "GET http://127.0.0.1/habits"
```

The engineer's deviation #2 (raw string slicing instead of `new URL()`) is
**correct and load-bearing**, and QA's live diff justifying it is sound: `new
URL()` would have normalized `/habits/foo/../bar/completions` into a request for
habit `bar`. Raw slicing means the `habitId` handed to the service is exactly the
wire bytes. `?userId=bob` in the query is ignored for both routing and identity.

### 3.6 DoS shape · **DOS-1, advisory**

`src/server.js` sets no timeouts and no connection cap, so Node's defaults apply:
`requestTimeout=300000ms`, `headersTimeout=60000ms`, `keepAliveTimeout=5000ms`,
`timeout=0` (no socket timeout), `maxConnections` unset. A slowloris-shaped
connection is therefore held open for up to 5 minutes, and connection count is
unbounded. I confirmed the shape: a request with a declared `Content-Length` and
an incomplete body is held with no response for the full observation window; 60
concurrent half-open connections were held with the server still serving
`/health` normally.

For a Tier 2 in-memory local seed this is acceptable and I do not gate on it —
but it becomes real the moment BIND-1 is *not* fixed, since the two compound.
Fold `requestTimeout`/`headersTimeout`/`maxConnections` tightening into the same
slice that fixes BIND-1 if convenient; otherwise carry as advisory.

Per-request memory is properly bounded: the 8 KiB cap is enforced on every
request regardless of route (deviation #3, verified live for `GET /health`,
`GET /habits`, and unmatched routes), and rejection happens on the chunk that
crosses the threshold rather than after buffering.

### 3.7 Unhandled rejections / process crash · **info (no finding)**

The handler is invoked as `handleRequest(...).catch(...)` with a
`headersSent`-guarded last-resort responder, and `readBodyCapped` removes its own
listeners on settle. I probed the paths where that pattern typically breaks —
an `'error'` emitted on a stream after its listener was removed:

```
abort mid-body (RST during upload)          -> server alive, no stderr
25x abort immediately after a complete body -> server alive, no stderr
60 concurrent held half-open connections    -> server alive, /health still 200
```

Across every probe script in this review the server's stderr stayed empty and the
process never exited. No unhandled rejection, no crash, no wedge.

### 3.8 Error-path leakage · **info (no finding)**

No error response leaked a stack, exception type, file path, internal field name,
or the string `"now"`. I checked every failure path against a leak regex
(`stack|TypeError|RangeError|at Object|/Users/|node:internal|habits\.js|streak\.js|"now"`)
and found nothing. Every body is exactly one `error` key from the closed phrase
set. Notably `"name too long"` does **not** echo the rejected name.

**I could not reach a 500 by any request.** Every clock-smuggling channel, every
garbage id, every hostile body returned a documented status. This is the spec's
§2.6 claim and it holds — because the boundary validates everything the services
would otherwise throw on, and the clock guard removed the one known
`RangeError` path.

### 3.9 OBS-1 — a silent request class · **advisory**

On a non-413 stream error (`readBodyCapped`'s `else` branch, `server.js:184–197`)
the server destroys both `req` and `res` and returns **without calling
`finish()`** — so the request produces no response *and* no access-log line. That
is defensible (there is nothing reliable left to respond to) but it means a class
of aborted requests is invisible in the log. No security impact — it leaks
nothing and cannot be induced to hide another request — but it is an
observability gap worth a line in whichever slice adds real logging.

## 4. §6 over HTTP — habit names and user ids must not reach logs

**Finding: PASS (info). QA's method was sound, and necessary.**

**Assessing QA's method first, as asked.** QA declined to reuse the in-process
test harness and instead spawned `node src/server.js` as a real OS process. That
was not decorative — I verified the reason they gave. `test/server.test.js` calls
`createStreakServer` exactly once, at line 13, with an injected sink
(`{ log: (line) => logs.push(line) }`), and that is the only construction in the
file. So the default binding —
`log = process.stdout.write.bind(process.stdout)` — is **never exercised by
`node --test`**. Testing §6 through the suite alone would have verified a
substitute, not the shipped path. QA's method is the correct one, and I
reproduced it independently across four separate spawned servers.

**My own result on the real default path.** Across 835 real stdout lines from
spawned processes, driving every route including every error path with
adversarial habit names (`喝水八杯`, `habit_1` id-lookalike,
`<script>x</script>`, LF- and CRLF-injection payloads, and marker strings for
both name and user id): **zero habit names, zero user ids, zero query strings,
zero raw paths**, and every line matched the fixed template
`^(METHOD) (/health|/habits|/habits/:habitId/completions|\(unmatched\)) \d{3} \d+ms$`.
Injected fake log lines never appeared as their own line.

**One apparent leak I ran down and dismissed.** My detector initially flagged the
string `GET /health 200 0ms` — which was itself one of my adversarial habit
names, chosen to test log forgery. It was a false positive on my side: the string
was present because I had genuinely requested `/health`. I re-ran the case with
**no** `/health` request at all, and the name-derived line was absent:

```
habit named exactly "GET /health 200 0ms"; no /health request made
stdout: | streak-seed listening on :41886
        | POST /habits 201 5ms
        | GET /habits 200 0ms
forged line present? false
```

A client cannot forge an access-log entry. Recording this because it is exactly
the kind of thing that reads as a finding and is not one.

**Why it is structural rather than filtered** — and I agree with the spec's
framing here: names can only travel in a request body (no route accepts a name in
a path or query, so a name cannot reach a URL), and the log emits a route
*template*, never the raw path. That is a genuine tightening over the prior art,
which logs the raw pathname. Confirmed: `POST /habits?name=Drink%20water` →
`400 name required` with no query string in its log line.

**The greenfield §2 standing condition is undisturbed.** This slice adds **no**
audit events and **no** audit-read route — verified by grep and by behavior
(`src/server.js` never imports `audit.js`). The trail remains name-free and
owner-scoped, so the behavioral-timing assessment from the prior review still
stands and does not need redoing. The spec's §5 reasoning for refusing a
`habit.access_denied` event is correct and important: such an event would
reintroduce the existence oracle at the audit layer, where the byte-identity
argument does not reach.

## 5. The 413 finding — my classification

**Finding 413-1: required-fix (deferred). QA's "non-blocking" call is right;
their "connection-lifecycle nuance" framing understates it.**

I reproduced QA's scenario exactly, and then found the mechanism they did not
report — which changes how it should be classified and makes the fix precise.
The 413 response **advertises a reusable connection and then destroys it**:

```
HTTP/1.1 413 Payload Too Large
content-type: application/json
cache-control: no-store
content-length: 29
Connection: keep-alive        <-- the server promises the socket is reusable
Keep-Alive: timeout=5         <-- and states a timeout
                                 ...then sendAndDestroy() RSTs it
```

Observed consequence on a standard pooled client:

```
request 1 (oversized POST, keep-alive) -> 413 {"error":"payload too large"}  (delivered whole)
request 2 (unrelated GET /health, same pooled socket) -> ECONNRESET, never reaches the server
request 3 (agent evicts dead socket, retries) -> 200 {"status":"ok"}
```

**Precise classification.** Not cosmetic — a real request deterministically
fails, and it is an *unrelated* request that did nothing wrong. Not a server
availability bug — the process stays healthy and every other client is
unaffected; what dies is one client's pooled socket. It is best classified as a
**protocol-correctness defect with a client-side availability symptom**: the
server states `Connection: keep-alive` on the wire and immediately violates its
own stated contract. Root cause is not "destroying the socket" per se; it is
"destroying it while advertising the opposite."

**Must it be fixed now, or carried? Carried — but bound to a named slice, not
left as a vague follow-up.** It touches no safety invariant, no data, and neither
carried precondition; the 413 body itself is always delivered whole, so §2.1's
own promise holds; it self-heals on the next attempt; and it requires the client
to send an oversized body first. For a local seed that is acceptable. But it
**must** land before any slice puts a real browser client or a frontend in front
of this surface — browsers pool connections aggressively and would surface
spurious failures on unrelated requests, and a naive client will report the
`ECONNRESET` rather than the 413 that actually explains it. I am converting QA's
"worth a follow-up" into precondition **P2** below.

**Fix:** send `Connection: close` in the 413 response headers and drop the
`req.destroy()` — Node will then close the connection cleanly after the body
flushes, and well-behaved clients will not reuse the socket. That is strictly
better than destroying it, because it removes the need to destroy anything.

## 6. QA's second finding (Proxy-Date native TypeError) — my classification

**Confirmed cosmetic (info). No action. QA's classification is correct and I
verified the reasoning rather than accepting it.**

`dayIndex(new Proxy(new Date(x), {}))` passes `instanceof Date`, then
`now.getTime()` throws a native engine `TypeError: this is not a Date object.`
instead of the guard's own message. The question that matters for safety is not
the message but whether a Proxy can get a *bad value* through — and it cannot,
because the guard validates the result of `getTime()` rather than trusting the
type (see the lying-Proxy table in §1). It is still a `TypeError`, still thrown
pre-mutation, unreachable from HTTP (fixed arity), and the HTTP catch-all maps
every message to `{"error":"internal error"}` regardless. The only consequence is
a less-pretty internal error string that never reaches the wire.

## 7. Standing watch items from the prior review

**§3 restraint (anti-guilt) — holds.** Re-scanned the new and changed code
(`src/server.js`, `src/services/streak.js`) for the full lexicon
(`leaderboard|badge|avatar|points|level|streak.?freeze|repair|notif|push|reminder|
guilt|shame|penalt|punish|nudge|loss.?aversion|rank|score`): **no hits.** The
response key set is closed and asserted by test S27. No notification,
subscription, or delivery endpoint exists — correctly out of scope per the spec,
and a delivery layer built on `atRisk` remains a §3 change requiring explicit
human approval. A same-day repeat is a `200` with `changed:false`, never a `409`
— making idempotency look like a failure would itself have been a small
loss-aversion cue, and the spec reasons about this explicitly. The watch item
carries forward unchanged.

**Audit name-free and owner-scoped — holds.** `src/services/audit.js` is
unchanged by this slice. `recordAuditEvent` is still called from exactly two
places with `{habitId}` and `{habitId, dayIndex, currentStreak, longestStreak}`;
`listAuditEvents` still filters by owner; no audit route was added. Verified live
that a rejecting prober accrues **0** events and the victim gains **0** from
rejected attempts.

**§2 (never silently zeroed) and §5 (idempotency) — hold over HTTP.** The layer is
a pure pass-through of `computeView` with no recomputation or coercion; `atRisk`
returns with the streak intact; a same-day re-log returns a byte-identical habit
object with exactly one audit event. I spot-verified idempotency live
(`changed:true` then `changed:false`, streak unchanged).

## 8. Supply chain, secrets, injection

**PASS (info).** `package.json` still has `"private": true`, **no `dependencies`
or `devDependencies`**, no install-time hooks (`preinstall`/`postinstall`/
`prepare`), and no script that fetches. `node_modules` is absent. The two script
changes are the `start` repoint and the added `demo` — both local. The HTTP layer
adds `node:http` only. No `.env`, no keys or tokens. No `eval`, `new Function`,
`child_process`, or template-into-sink anywhere in `src/`. Habit names are stored
and returned as inert strings; the **output-encoding advisory for the future
frontend still stands** (escape `name` on render) — this slice returns JSON, so
it is not a service-layer issue, but `<script>x</script>` round-trips intact as
data and a careless renderer would be the sink.

## Preconditions carried to future slices

1. **P1 — Bind to loopback (BLOCKER, this slice).** `listen(port, "127.0.0.1", …)`.
   Add a test asserting the bound address is loopback. Until this lands, the
   spec's justification for self-asserted `X-User-Id` does not hold, and exposing
   the surface beyond loopback remains a rule-3 human-approval action. Fix the
   seed template too, or every future HTTP slice inherits it.
2. **P2 — Fix the 413 connection contract** before any slice adds a browser
   client or frontend. Send `Connection: close` on the 413 instead of destroying
   an advertised-keep-alive socket.
3. **P3 — Real auth before any non-local exposure.** `X-User-Id` is a stand-in,
   not authentication. The `identify(req)` single-swap-point design is good and
   should be kept; replacing its body is the intended path. Any slice that moves
   identity to a **cookie** must revisit the deliberately-omitted CSRF defense
   (the spec's reasoning that it is not load-bearing depends on there being no
   ambient authority — a cookie would create one).
4. **P4 — Keep the clock guard and the HTTP surface coupled.** Never roll back
   the guard while the surface is live (the spec's rollback rule). If a future
   slice ever binds a client-influenced clock, it fails closed today — but it
   would still be a §1 violation and must not be done.
5. **P5 — Keep audit name-free and owner-scoped** (unchanged from greenfield).
   No `habit.access_denied`, no per-request telemetry, ever — it would rebuild
   the existence oracle at the audit layer. Any audit-read route reopens the
   behavioral-timing privacy assessment.
6. **P6 — §3 restraint** (unchanged). No notification/nudge/gamification built on
   `atRisk` without explicit human approval.
7. **P7 — Output encoding (advisory).** Escape habit `name` on render in the
   frontend.
8. **P8 — DoS hardening (advisory).** Set `requestTimeout`, `headersTimeout`, and
   a connection cap if this surface ever becomes long-lived or non-local.

## Handoff

**To Release Manager. Recommendation: HOLD pending one one-line fix, then GO
(Tier 2).**

The slice achieved its stated purpose: both carried preconditions are genuinely
closed, verified independently against an adversarial space wider than the
shipped tests, and I found nothing that reopens either. The engineer's five
deviations are all sound — deviation #1 (`content-length`) is what makes the
non-oracle observable rather than vacuous, and deviation #2 (raw path slicing)
prevents a real route-normalization divergence. QA's work was thorough,
methodologically correct on the §6 process-isolation point, and both of their
findings are correctly characterized as non-blocking.

The one blocker is not a defect in the slice's own logic — it is the new
network-exposure surface that going HTTP created, which no prior document owned:
the server binds every interface while its spec says loopback, and the spec's
security argument depends on the difference. One line, plus a regression test.
Re-gate after it lands; nothing else in this review needs to be re-verified.
