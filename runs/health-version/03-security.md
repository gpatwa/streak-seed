# Security Review — health-version

> Stage 4 · security-privacy · depth **standard** (Charter C7.1, not lowered or raised)
> Base `143de22`, uncommitted working tree on `slice/health-version`. No src/test edited, nothing committed.

## Verdict

**PASS. GO to Release Manager.** 0 blockers, 0 required-fix, 3 advisories (A-1..A-3 below).

## Scope check

- `git diff --name-only`: `src/server.js`, `test/client-server.test.js`, `test/server.test.js`. Exactly the three permitted files.
- `git status --porcelain --untracked-files=all` outside `runs/`: only those three `M` lines.
  Untracked `runs/APPROVAL_VERIFICATION.md` (mtime 2026-09-14) and `runs/CONFORMITY.md` (2026-09-12) pre-date this slice
  (started 2026-10-16) and are generated reports from earlier runs, not slice output. Not in scope; noted for the Release Manager
  so they are not swept into the slice commit.
- No `package-lock.json`, no `node_modules`, `package.json` unchanged (`git diff HEAD -- package.json` empty), no new `import`
  in the diff (`readFileSync` from `node:fs` was already imported at line 10). **No new dependency.**
- No `.agentic/`, `.claude/`, client, or `docs/` change.

## Re-run of `npm run qa:mvp` (real output, this stage)

```
ℹ tests 92
ℹ suites 0
ℹ pass 92
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 308.980042
```

Matches QA (92/92). Includes S29 (loopback-host structural pin) and S28 (no listen on import).

## Live probe (this stage, loopback only)

`PORT=51397`/`51398 node src/server.js`, probed with curl against `127.0.0.1` only, killed afterwards.

| Probe | Result |
|---|---|
| Listen socket (`netstat -anv`, `lsof -p <pid> -iTCP`) | `tcp4 127.0.0.1.51398 LISTEN` / `TCP 127.0.0.1:51398 (LISTEN)`. Single IPv4 loopback socket. |
| Same port via LAN IP `192.168.86.249` | curl exit 7 (connection refused). Not reachable off-loopback. |
| Same port via `[::1]` | curl exit 7. No IPv6 wildcard. |
| `GET /health`, no headers | `200`, `cache-control: no-store`, `x-content-type-options: nosniff`, body `{"status":"ok","version":"0.1.0"}` (33 bytes) |
| `GET /health?version=evil&status=x` + `X-User-Id: alice` + `X-Forwarded-For` | byte-identical body `{"status":"ok","version":"0.1.0"}`. Query, identity and proxy headers have no influence. |
| `POST /health` with body `{"version":"evil"}` | `404 {"error":"not found"}` (route is GET-only, unchanged) |
| `GET /health` with malformed body | `400 {"error":"invalid json"}` (pre-existing ordering, unchanged by this slice) |
| `/health/`, `/health%00`, `HEAD /health` | `404` (unchanged route match) |

Server log for these probes, verbatim:

```
streak-seed listening on 127.0.0.1:51398
GET /health 200 2ms
GET /health 200 1ms
HEAD (unmatched) 404 0ms
```

Route template, status, latency only. No user id, no query string, no version string.

## Findings

### Secrets / credentials — none

Diff grep for `api_key|secret|token|password|bearer|eyJ...|AKIA|sk-|BEGIN PRIVATE`: no match. No `.env` or credential file added.
The only datum newly exposed is `package.json`'s `version` (`"0.1.0"`); no other manifest field is read into the response.

### PII / logging (invariant 6) — none

No added `log(`/`console.`/`process.std*` call in the diff. The `finish()` access-log line (src/server.js:250) is unchanged and
still carries `method routeTemplate status ms` only (confirmed live above). The version is not logged, and it is a build
string, not free text or user content.

### Version read: can it throw, leak a path, or be request-influenced? — no

- `VERSION` is a module-level `const` evaluated once at import (src/server.js:15-17). `handleRequest` only references it;
  there is no `readFileSync`/`package.json` access on the request path (grep: `readFileSync` call sites in src/server.js are
  line 16 and the pre-existing static-asset allowlist at line 60, both import-time).
- The path is `new URL("../package.json", import.meta.url)`: a constant relative to the module file. No request field
  (path, query, header, body) reaches it; confirmed live, hostile query/headers/body leave the body byte-identical.
- Failure mode: a missing or unparseable `package.json` throws at **import**, before `createStreakServer()` exists and before
  any `listen()`. The stack (which would include the absolute path) goes to the operator's own stderr, never to an HTTP
  client, because no socket is ever opened. Fail-closed, same as the existing static-asset import-time read.
- If `version` were absent, `JSON.stringify` drops the `undefined` key and the body degrades to `{"status":"ok"}`; no path or
  error text is emitted. S1b's exact `deepEqual` would fail in CI.
- `send()` serializes with `JSON.stringify`, so even a hostile manifest value could not break out of the JSON string or
  inject headers (`content-length` is computed from the serialized bytes).

### /health auth and user data (invariant 4) — holds

Handler (src/server.js:296-300) runs before `identify(req)`, as before; calls no service; reads no user. Response identical with
and without `X-User-Id`. No user data in the body. Still `cache-control: no-store`.

### Bind / new surface (invariant 7) — holds, no widening

No `listen`/`host` line in the diff; `const host = "127.0.0.1"` and `.listen(port, host, ...)` unchanged (S29 green). Live socket
is IPv4 loopback only, refused on the LAN IP and on `::1`. No new route, method, header, or input. The added surface is one
static string in an existing response on an existing loopback-only route.

### Safety controls (Charter C5.0 = none) — none changed

No change to the bind, the `X-User-Id` carve-out list (still `/health` + static allowlist), the body-size cap, error-phrase set,
CSP/nosniff headers, or any invariant text. No `.agentic/` or `.claude/` change.

### Approval bypass — not applicable, none found

No send/submit/publish/deploy/network-egress path added. Charter C8.2/C8.3 (local commit only, no irreversible action) untouched.

### Audit event coverage — unchanged

The tech spec (00-slice-plan / 01-impl) names no new audit event; the slice adds no state-changing function. The single access-log
event is unchanged in shape and still emitted for `/health` (`finish(200)` retained). Nothing removed or renamed.

### Adapter boundary — not applicable

Charter C3.0: no model in the product path. No adapter, client or network library added.

### Agentic threats — not applicable

No agent, tool, or persisted agent memory in the product surface touched.

### Advisories (non-blocking, for a future slice)

- **A-1 (advisory).** Version disclosure on an unauthenticated endpoint is acceptable **only because** invariant 7 holds. If a
  future slice widens the bind (which already requires rule-4 approval plus real auth in the same slice), that slice's Security
  review should re-decide whether `/health` keeps disclosing `version` to unauthenticated callers (fingerprinting). Suggest the
  Release Manager note this next to invariant 7 rather than in code.
- **A-2 (advisory).** C19 in `test/client-server.test.js` was relaxed from exact-body to `status === "ok"`, so that harness would no
  longer catch an extra (e.g. user-derived) key appearing on `/health`. S1b's exact `deepEqual` covers the same
  `createStreakServer` in `test/server.test.js`, so there is no real gap today. Same as QA observation 1; tightening C19 to
  `deepEqual(..., {status:"ok", version: pkg.version})` is cheap hardening.
- **A-3 (housekeeping).** `runs/APPROVAL_VERIFICATION.md` and `runs/CONFORMITY.md` are untracked pre-existing reports. The slice commit
  should stage only the three source/test files and `runs/health-version/`, not `git add -A`.

No blocker. No required-fix.

## Safety invariants touched

| # | Invariant | Touched? | Holds? | Evidence |
|---|---|---|---|---|
| 1, 2, 3, 5 | day boundary / never zeroed / no guilt / idempotent | no | yes | no service/streak code in diff; 92/92 |
| 4 | own data only | adjacent (no-auth route) | yes | handler before `identify()`, no service call, identical with/without `X-User-Id` |
| 6 | no sensitive content in logs | adjacent | yes | no log call added; live log is template-only |
| 7 | loopback-only bind | adjacent (unauth disclosure) | yes | bind lines untouched, S29 green, live socket 127.0.0.1 only, LAN/::1 refused |

## Handoff to Release Manager

- **From:** security-privacy · **To:** release-manager · **Recommendation:** GO.
- **Diff reviewed:** `git diff` vs `143de22`, 3 files, +17/-4 (`git diff --stat`), unchanged during this review.
- **Commands run this stage:** `npm run qa:mvp` (92/92), diff greps (secrets, log calls, scope), two short-lived loopback
  server runs with curl probes, `netstat`/`lsof` on the listen socket. No src/test edited, nothing committed, no network
  egress beyond loopback and one refused LAN-IP connect to our own host.
- **Carry forward:** A-1 (re-decide version disclosure if invariant 7 ever changes), A-2 (tighten C19), A-3 (stage
  selectively at commit; leave the two untracked pre-existing `runs/*.md` reports out).
