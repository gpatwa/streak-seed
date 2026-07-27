# Implementation Notes — StreakKeeper HTTP layer

> Stage 3 (Implementation) · Owner: Backend Engineer
> Spec: `runs/http-layer/01-arch.md` · Slice: `runs/http-layer/00-slice-plan.md`
> Prior art followed: `/Users/gopalpatwa/opt/stash-seed/src/server.js`

## Files created / modified

Committed in the spec's mandated order (clock guard first, HTTP surface second — so no history point ever has the surface without the guard behind it):

1. **`src/services/streak.js`** (modified) — `dayIndex()` gained the clock
   guard: type gate first (`Date` or `number` only — `null`/`true` no longer
   silently coerce to day 0), then `NaN`/`±Infinity`, then finite-but-out-of-range
   (`|ms| > 8.64e15`), then an executable postcondition. Implemented verbatim
   from the spec's §2.5 reference code. No other function in the file changed.
2. **`test/streak.test.js`** (modified) — added C1–C10 (10 new tests) for the
   guard, appended after the existing T1/T3/T4/T10/T12 tests.
3. **`test/habits.test.js`** (modified) — added H1–H3 (3 new tests): the
   pre-mutation regression proof (bad clock throws before any `Set` touch, no
   collateral damage to a second habit, valid calls still work afterward).
4. **`src/server.js`** (new) — dependency-free `node:http` surface. Exports
   `createStreakServer({ log })`; listens only when run directly
   (`import.meta.url === \`file://${process.argv[1]}\``). Routes: `GET /health`,
   `POST /habits`, `POST /habits/:habitId/completions`, `GET /habits`.
5. **`test/server.test.js`** (new) — S1–S28 (28 tests) per the spec's test plan.
6. **`scripts/build-check.mjs`** (modified) — added `"../src/server.js"` to the
   import list.
7. **`package.json`** (modified) — `"start": "node src/server.js"` (was
   `node scripts/demo.mjs`); added `"demo": "node scripts/demo.mjs"` so the
   existing demo script stays reachable via `npm run demo` (see Deviations).

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

✔ T2, T4 (service), T5, T6, T7, T8, T9, T11        — existing habits.test.js, unchanged, still pass
✔ H1, H2, H3                                       — new, clock-guard pre-mutation proof
✔ S1 .. S28                                        — new, test/server.test.js (all 28 named cases)
✔ T1, T3, T4 (pure), T10, T12                      — existing streak.test.js, unchanged, still pass
✔ C1 .. C10                                        — new, clock-guard unit tests

ℹ tests 54
ℹ suites 0
ℹ pass 54
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 164.028458
```

Every pre-existing test (T1–T12) is unchanged and still green — the guard is
behavior-preserving for every valid clock value, exactly as the spec's gate
requires. Full 54/54 pass list confirmed in the raw run (not abbreviated above
only for length).

### `npm run build`

```
> streak-seed@0.1.0 build
> node scripts/build-check.mjs

build ok
```

(`src/server.js` now imports cleanly as part of this check — confirms
import-safety: no port bound, no listener started, at build time.)

### `npm run qa:mvp`

```
> streak-seed@0.1.0 qa:mvp
> npm run typecheck && npm run test
...
ℹ tests 54
ℹ pass 54
ℹ fail 0
```

Exit code `0`. All four gates green.

## Real request/response transcript

Server started for real (not just import-tested): `PORT=4173 node src/server.js`,
then driven with `curl` from a separate shell. Full transcript below, elided only
for the `Date`/`Keep-Alive` headers which vary by wall-clock.

```
$ PORT=4173 node src/server.js
streak-seed listening on :4173
```

**1. `GET /health`**
```
HTTP/1.1 200 OK
content-type: application/json
cache-control: no-store
content-length: 15

{"status":"ok"}
```

**2. `POST /habits` (X-User-Id: alice, body `{"name":"  Drink water  "}`)**
```
HTTP/1.1 201 Created
content-length: 128

{"habit":{"habitId":"habit_1","name":"Drink water","currentStreak":0,"longestStreak":0,"atRisk":false,"lastCompletedDate":null}}
```
Name trimmed on the way in and stored trimmed.

**3. `POST /habits/habit_1/completions` (alice, first log)**
```
HTTP/1.1 200 OK
content-length: 151

{"habit":{"habitId":"habit_1","name":"Drink water","currentStreak":1,"longestStreak":1,"atRisk":false,"lastCompletedDate":"2026-07-26"},"changed":true}
```

**4. `POST /habits/habit_1/completions` (alice, same-day re-log)**
```
HTTP/1.1 200 OK
content-length: 152

{"habit":{"habitId":"habit_1","name":"Drink water","currentStreak":1,"longestStreak":1,"atRisk":false,"lastCompletedDate":"2026-07-26"},"changed":false}
```
`currentStreak` unchanged, only `changed` flips to `false` — idempotent, §5, live-verified.

**5. `GET /habits` (alice)**
```
HTTP/1.1 200 OK
content-length: 139

{"habits":[{"habitId":"habit_1","name":"Drink water","currentStreak":1,"longestStreak":1,"atRisk":false,"lastCompletedDate":"2026-07-26"}]}
```

**6. `POST /habits/habit_1/completions` (X-User-Id: bob — FOREIGN, habit_1 belongs to alice)**
```
HTTP/1.1 404 Not Found
content-length: 27

{"error":"habit not found"}
```

**7. `POST /habits/habit_999999/completions` (bob — FAKE, no such habit exists)**
```
HTTP/1.1 404 Not Found
content-length: 27

{"error":"habit not found"}
```
**Responses 6 and 7 are byte-identical** — same status, same `content-length`,
same body — live confirmation of the non-oracle, matching S17.

**8. `GET /habits` (no X-User-Id)**
```
HTTP/1.1 400 Bad Request
content-length: 37

{"error":"x-user-id header required"}
```

**9. `POST /habits` (alice, body `{bad json`)**
```
HTTP/1.1 400 Bad Request
content-length: 24

{"error":"invalid json"}
```

**10. `POST /habits` (alice, 9000-byte body)**
```
HTTP/1.1 413 Payload Too Large
content-length: 29

{"error":"payload too large"}
```
Response was actually delivered (not a hung/reset connection) — curl received
a full, well-formed body.

**11. `GET /nope`**
```
HTTP/1.1 404 Not Found
content-length: 21

{"error":"not found"}
```

**12. `POST /habits` (X-User-Id: carol, body `{"name":"喝水八杯"}`)**
```
HTTP/1.1 201 Created
content-length: 129

{"habit":{"habitId":"habit_2","name":"喝水八杯","currentStreak":0,"longestStreak":0,"atRisk":false,"lastCompletedDate":null}}
```
Multi-byte UTF-8 round-trips intact (the `Buffer.concat`-then-decode-once fix).

**Server's own access log for the whole session (stdout), captured verbatim:**
```
streak-seed listening on :4173
GET /health 200 3ms
POST /habits 201 0ms
POST /habits/:habitId/completions 200 1ms
POST /habits/:habitId/completions 200 0ms
GET /habits 200 1ms
POST /habits/:habitId/completions 404 0ms
POST /habits/:habitId/completions 404 0ms
GET /habits 400 1ms
POST /habits 400 0ms
POST /habits 413 0ms
GET (unmatched) 404 0ms
POST /habits 201 0ms
```
Route *templates* only — request 6 (foreign) and request 7 (fake) produced the
same log line; `/nope` never appears, only `(unmatched)`; no user id, no habit
id, no habit name, no query string anywhere in the log.

Server was then killed (`lsof -ti:4173 | xargs kill -9`); port confirmed free.

## Deviations from the spec, with rationale

1. **Explicit `content-length` header, added beyond the spec's illustrative
   snippet.** Plain `res.writeHead(status, {content-type, cache-control})` +
   `res.end(payload)` left Node to fall back to `Transfer-Encoding: chunked`
   with no `Content-Length` header at all (confirmed empirically — the first
   live `curl -i` run showed exactly this). §3 of the spec states the
   foreign/fake byte-identity argument explicitly in terms of
   *"the serialized bytes and the `content-length` are equal by
   construction,"* and S17 asserts on `content-length` directly. Both `send()`
   and `sendAndDestroy()` now set `"content-length": Buffer.byteLength(payload)`
   explicitly. This doesn't change any documented status code or body — it
   only makes the already-specified byte-identity property real and
   observable instead of vacuously true (`null === null`), and is a strict
   improvement (no unnecessary chunked framing for bodies whose full length is
   already known).
2. **Route/query parsing via raw string ops, not `new URL()`.** stash-seed
   (prior art) builds a `URL` object and reads `.pathname`. I deliberately
   didn't: the WHATWG `URL` parser can re-encode or normalize path characters,
   which risks silently disagreeing with the spec's "raw path segment, NOT
   decoded, NOT trimmed" requirement for `habitId` (§2.4). Instead
   `src/server.js` slices `req.url` on the first `?` and matches the pathname
   directly against a fixed regex (`/^\/habits\/([^/]+)\/completions$/`),
   guaranteeing the captured `habitId` is exactly the wire bytes Node handed
   the server. Same outcome for every named test; more defensibly correct for
   S19's garbage-id sweep.
3. **`MAX_BODY_BYTES` enforced for every request, not just the two POST
   routes.** The spec lists body-size (§2.1) as the first blanket check "per
   request," ahead of routing-specific logic. I read (and cap) the body for
   `GET /health`, `GET /habits`, and unmatched routes too, before any 404 is
   decided — a resource-protection measure that doesn't depend on which route
   was hit. An unmatched route with a >8 KiB body still gets `413` before the
   `404` would otherwise apply; not explicitly named in the test plan, but a
   defensible reading of "all before any service call," and cheap.
4. **Unmatched routes never attempt JSON parsing.** For a `(method, pathname)`
   pair that matches no route, the body is read (and size-capped, per #3) but
   never handed to `JSON.parse` — the handler goes straight to `404`
   regardless of body validity. Only *recognized* routes parse JSON. This
   keeps "does this endpoint exist" answerable without regard to payload
   shape, and isn't contradicted by any S-numbered test (none combine a bad
   body with an unmatched path).
5. **`package.json` gained a `"demo"` script** (`node scripts/demo.mjs`)
   alongside repointing `"start"` to `node src/server.js`. The slice plan's
   scope note says `npm start` should serve the HTTP server; my own task brief
   additionally asked me to keep the demo script reachable if it doesn't
   conflict. It doesn't — `npm run demo` still runs the original headless
   walkthrough unchanged (verified: see below).

None of these change a documented status code, error phrase, response body,
or the non-oracle/clock-guard behavior the spec gates on.

## Sanity check: demo script preserved

```
$ npm run demo
> streak-seed@0.1.0 demo
> node scripts/demo.mjs

Created habit: { habitId: 'habit_1', name: 'Meditate', currentStreak: 0, ... }
Logged today: { ..., currentStreak: 1, changed: true }
Same-day re-log (idempotent, changed=false): { ..., changed: false }
listHabits(userId): [ { ..., currentStreak: 1, ... } ]
```
Unaffected by the `server.js`/`package.json` changes.

## Rollback

`git revert` commit 2 (the `src/server.js` + `test/server.test.js` +
`build-check.mjs` + `package.json` commit) to drop the HTTP surface while
keeping the strictly-better clock guard; never revert the guard commit while
the HTTP surface is still live.

## Rework — Security round 1 blocker (bind loopback)

> Responds to `runs/http-layer/04-security.md` §3.1, finding **BIND-1
> (blocker)**: `server.js` called `.listen(port, cb)` with no host argument,
> so Node bound the wildcard address (`*:PORT`, all interfaces) instead of
> the `127.0.0.1` loopback the spec documents. Security reproduced this live
> — reached a user's data from the host's LAN address with a self-asserted
> `X-User-Id` header — which defeats the spec's entire justification for
> trusting that header: that the surface is local and unreachable.

### What changed

`src/server.js`, the module-scope startup block only (the guarded
`if (import.meta.url === ...)` block that runs solely when the file is
executed directly — nothing inside `createStreakServer()` itself was
touched):

```diff
 if (import.meta.url === `file://${process.argv[1]}`) {
   const port = Number(process.env.PORT) || 3000;
-  createStreakServer().listen(port, () => {
-    process.stdout.write(`streak-seed listening on :${port}\n`);
+  // Loopback only (BIND-1, runs/http-layer/04-security.md §3.1): the spec's
+  // entire justification for trusting a self-asserted X-User-Id header is
+  // that this surface is local and unreachable. Omitting the host argument
+  // here binds every interface (0.0.0.0/::), silently making that untrue.
+  // Exposing this beyond loopback is a rule-3 human-approval action, not a
+  // default. Bound host is echoed in the log line so a wildcard bind would
+  // be obvious at a glance, not just correct-by-omission.
+  const host = "127.0.0.1";
+  createStreakServer().listen(port, host, () => {
+    process.stdout.write(`streak-seed listening on ${host}:${port}\n`);
   });
 }
```

Two things asked for by the blocker, both done: the explicit loopback host
argument, and the bound host now printed in the startup log line
(`streak-seed listening on 127.0.0.1:PORT`, was `streak-seed listening on
:PORT`). No `HOST` env var was added — the security review only *preferred*
that "if a future slice needs flexibility"; adding a configurable knob now
would be scope beyond the one-line fix requested, and it would reopen a way
to accidentally rebind to `0.0.0.0`. `01-arch.md`'s documented base
(`http://127.0.0.1:${PORT|3000}`) already matched the intended behavior, so
the spec was not changed — only the code was brought into line with it.

Nothing else in `src/server.js` changed. The 413/keep-alive finding (413-1)
is explicitly out of scope for this rework — Security deferred it to P2, a
future slice that adds a browser client.

### Regression test added

`test/server.test.js` — two new tests, appended after S28, under a new
"Network bind (BIND-1 regression)" section. `createStreakServer()` in
isolation was never the buggy part; the bug was in the guarded module-scope
block, which (per S28's own comment) only runs when the file is *executed*,
not imported — so, same as QA's and Security's §6 finding about the default
log sink, the only way to exercise the real bug is to spawn `node
src/server.js` as a genuine OS process, not construct a server in-process.

- **S29** (structural, instant, no process spawn) — reads `src/server.js`
  and asserts both `const host = "127.0.0.1"` and `.listen(port, host,`
  appear, so a future edit that quietly drops the host argument fails
  immediately with a precise message, the same pattern S28 already uses for
  the import-guard.
- **S30** (behavioral, the one the blocker specifically asked for) — spawns
  `node src/server.js` for real with a fixed `PORT`, then:
  1. asserts the startup stdout line matches `listening on 127.0.0.1:<port>`
     (host visible in the log, per the fix's second requirement);
  2. confirms `GET /health` over `127.0.0.1` still succeeds (positive
     control);
  3. finds a real non-loopback IPv4 address on the host via
     `os.networkInterfaces()` and asserts a raw TCP connect to
     `<that address>:<port>` does **not** succeed within 1.5s — mirroring
     exactly how Security reproduced BIND-1 live over the LAN address. A
     successful connect here fails the test with an explicit "BIND-1
     regressed" message. If no non-loopback interface exists on the host
     running the suite, the test calls `t.skip(...)` rather than
     false-passing.
  Kills the child process in a `finally` block regardless of outcome.

On this machine the non-loopback branch is not hypothetical — it ran for
real (see gate output below): `os.networkInterfaces()` found `en0
192.168.86.28`, the same address Security's review used.

### Gate output — real, re-run after the fix

**`npm run typecheck`**
```
> streak-seed@0.1.0 typecheck
> for f in $(find src scripts -type f \( -name '*.js' -o -name '*.mjs' \)); do node --check "$f" || exit 1; done; echo "typecheck ok"

typecheck ok
```

**`npm test`**
```
> streak-seed@0.1.0 test
> node --test

✔ T2, T4 (service), T5, T6, T7, T8, T9, T11        — habits.test.js, unchanged
✔ H1, H2, H3                                       — clock-guard pre-mutation proof, unchanged
✔ S1 .. S28                                        — server.test.js, unchanged, all still pass
✔ S29: startup code is pinned to an explicit loopback host, not a bare port
✔ S30: node src/server.js (the real entry point) is reachable via 127.0.0.1 but not via the host's LAN address (141ms)
✔ T1, T3, T4 (pure), T10, T12                      — streak.test.js, unchanged
✔ C1 .. C10                                        — clock-guard unit tests, unchanged

ℹ tests 56
ℹ suites 0
ℹ pass 56
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 458.053458
```
54 → 56 (the two new tests). Every one of the 54 pre-existing tests, including
all 28 original server tests (S1–S28), is unchanged and still green — this
was a startup-path-only fix, and nothing about request handling moved.

**`npm run build`**
```
> streak-seed@0.1.0 build
> node scripts/build-check.mjs

build ok
```

**`npm run qa:mvp`**
```
> streak-seed@0.1.0 qa:mvp
> npm run typecheck && npm run test
...
ℹ tests 56
ℹ pass 56
ℹ fail 0
```
Exit code `0`. All four gates green, re-run for real after the fix, not
assumed.

### Bind evidence — real before/after transcript

Reproduced Security's exact method (`lsof` + a real request from the host's
actual LAN address, `192.168.86.28`, discovered live via
`os.networkInterfaces()`, not hardcoded). To get a genuine "before," the
fixed startup block was temporarily swapped back to the original
`.listen(port, cb)` (backed up first, restored byte-for-byte after — diffed
clean against the backup, confirmed below), rather than trusting memory of
what the bug looked like.

**BEFORE the fix** (`PORT=41999 node src/server.js`):
```
stdout:  streak-seed listening on :41999

$ lsof -nP -iTCP:41999 -sTCP:LISTEN
node    49622 gopalpatwa   12u  IPv6 ...  TCP *:41999 (LISTEN)      <- wildcard, all interfaces

$ curl http://127.0.0.1:41999/health
{"status":"ok"}                                                     [http_code=200]

$ curl http://192.168.86.28:41999/health          <- the host's real LAN address
{"status":"ok"}                                                     [http_code=200]   <- VULNERABLE

$ curl -X POST http://192.168.86.28:41999/habits -H "x-user-id: alice" -d '{"name":"PrivateHabit"}'
{"habit":{"habitId":"habit_1","name":"PrivateHabit", ...}}          [http_code=201]

$ curl http://192.168.86.28:41999/habits -H "x-user-id: alice"
{"habits":[{"habitId":"habit_1","name":"PrivateHabit", ...}]}       [http_code=200]
```
Created and then read back a user's private data over the LAN address with
nothing but a self-asserted header — the exact scenario Security's review
described, reproduced independently.

**AFTER the fix** (`PORT=42000 node src/server.js`, fixed code restored and
diffed clean against the pre-revert backup):
```
stdout:  streak-seed listening on 127.0.0.1:42000                  <- host now visible in the log

$ lsof -nP -iTCP:42000 -sTCP:LISTEN
node    49658 gopalpatwa   12u  IPv4 ...  TCP 127.0.0.1:42000 (LISTEN)   <- loopback only

$ curl http://127.0.0.1:42000/health
{"status":"ok"}                                                     [http_code=200]   <- still works

$ curl http://192.168.86.28:42000/health
curl: (7) Failed to connect to 192.168.86.28 port 42000 after 1 ms: Couldn't connect to server
                                                                     [http_code=000 curl_exit=7]  <- FIXED
```

Both servers were killed immediately after their respective checks
(`kill $PID`); confirmed after each run with `ps` (no `node src/server.js`
process left) and `lsof -iTCP:<port>` (both ports free, exit code 1 / no
listener). Working tree confirmed clean of any leftover port state.

**Verdict: BIND-1 closed.** The server now binds exactly what
`01-arch.md` §1 documents (`127.0.0.1`), the bound host is visible in the
startup log rather than implicit, and S29/S30 make a silent regression to
the wildcard bind fail the suite — S30 by literally reproducing Security's
LAN-reachability probe on every `npm test` run where a non-loopback
interface is present.
