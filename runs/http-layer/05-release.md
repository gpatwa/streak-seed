# Release Checklist — StreakKeeper HTTP layer

> Stage: Release · **Walked directly by the Orchestrator, not a spawned agent**
> (`RUN_ECONOMICS.md`: agents for judgment, direct execution for facts — gate
> walking is mechanical and every gate here has an objective answer).

## Tier 2 gates

| Gate | Result | Evidence |
|------|--------|----------|
| Typecheck | ✅ pass | `npm run typecheck` → `typecheck ok` |
| Tests | ✅ pass | `npm test` → **56/56**, 0 fail |
| Build (import check) | ✅ pass | `npm run build` → `build ok` (incl. `src/server.js`) |
| QA gate | ✅ pass | `runs/http-layer/03-qa.md` — PASS; 119 independent probes beyond the suite |
| Security gate | ✅ pass (round 2) | Round 1 **blocked**; blocker fixed; re-verified directly (below) |
| Scope discipline | ✅ pass | `git status` shows only expected files; deferred 413 finding untouched (`req.destroy` still present) |
| Rollback | ✅ pass | New files + bounded edits; `git revert` of this commit, or delete `src/server.js` + restore `dayIndex()` |
| Deploy smoke / live SLOs | n/a — reason | Local loopback-only surface; nothing is deployed. A real deploy is a separate rule-3 action |
| Approval rules | n/a — reason | No send, no deploy, no real model, no new data processor |

## The blocker, re-verified

Security round 1 blocked this slice: `server.js` bound `*:PORT`, defeating the
spec's basis for accepting an unauthenticated `X-User-Id`. Re-verified directly
rather than by re-spawning the reviewer, because the question is a **fact with an
objective answer**, not a judgment:

```
lsof  → node ... TCP 127.0.0.1:45501 (LISTEN)      # loopback only, not *:45501
curl 127.0.0.1:45501  → HTTP 201                    # served
curl 192.168.0.42:45501 → refused (HTTP 000)       # LAN path gone
```

Plus two regression tests (S29 structural pin, S30 spawns the real server and
asserts the negative). **Blocker closed.**

## Both carried preconditions — the reason this slice existed

| Precondition (from `runs/greenfield/08-security.md`) | Verdict |
|---|---|
| Clock guard — validate a representable date **before mutation** | ✅ **CLOSED** — guard sits in `dayIndex()`, the service funnel all callers pass through; validates the *result* of `getTime()`, so a lying Proxy/subclass is still rejected |
| Preserve the foreign-vs-fake `null` non-oracle | ✅ **CLOSED** — identical status, 27 body bytes, content-length, raw wire header order, 0 audit events, identical access-log line |

## Carried forward (not fixed here, deliberately)

- **413 keep-alive defect** — the 413 response advertises `Connection: keep-alive`
  then RSTs the socket, breaking a client's *next* request. Protocol-correctness
  defect with a client-visible availability symptom. **Required fix before the
  first browser-client slice** (browsers pool aggressively): send
  `Connection: close` and drop the `req.destroy()`.
- **Loopback bind belongs in the seed template** — the same wildcard-bind pattern
  is inherited from `stash-seed/src/server.js`. That repo has the same exposure.
- Proxy-wrapped `Date` throws a native `TypeError` rather than the guard's message
  — cosmetic, still pre-mutation-safe, unreachable from HTTP.

## Decision

**GO (Tier 2)** — for a local, loopback-only, unauthenticated seed surface. All
gates pass or are n/a-with-reason; both carried preconditions are closed; the
one blocker raised is fixed and independently re-verified.

Landing = local commit. **Exposing this beyond loopback, or deploying it
anywhere, is a separate rule-3 human action** and is explicitly *not* authorized
by this GO — the design's entire safety argument rests on it being unreachable.
