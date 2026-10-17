# Implementation — health-version

> Stage 2 · backend-architect · depth standard · not committed (per instruction)

## What changed

- `src/server.js`: module-level `VERSION`, read once at load via
  `readFileSync(new URL("../package.json", import.meta.url))` + `JSON.parse(...).version`.
  The `/health` handler now sends `{ status: "ok", version: VERSION }`. Route match,
  no-`X-User-Id` carve-out and every other route untouched.
- `test/server.test.js`: new `S1b` (exact `deepEqual` against `{status:"ok", version: <package.json version>}`,
  no `X-User-Id` sent). Existing `S1` relaxed from whole-body equality to `status === "ok"`.
- `test/client-server.test.js` (line 136, C19): same relaxation. It asserted the old whole
  body `{status:"ok"}`, which the intended contract change necessarily invalidates. Not in the
  brief's file list; flagged for QA. Version equality stays covered by S1b.

No dependency, client, `.agentic` or `.claude` change.

## Fail-first evidence

S1b added before the implementation, run against unmodified `src/server.js`
(`node --test test/server.test.js`):

```
✖ S1b: GET /health -> exact {status, version} where version is package.json's, no X-User-Id
  + actual - expected
  -   version: '0.1.0'
    actual: { status: 'ok' },
    expected: { status: 'ok', version: '0.1.0' },
```

## Results after implementation

- `npm run qa:mvp` (typecheck + tests): tests 92, pass 92, fail 0 (baseline 91, +1 S1b).
  An intermediate run showed 91/92 with C19 failing on the old body; fixed as above.
- `npm run build`: `build ok`.

## Invariants check

1-5: no service/streak/day logic touched. 4: `/health` still reads no user and returns no user data.
6: nothing new is logged; the access log still carries the route template only; the version is a
build string from the manifest, not user content. 7: `listen`/bind untouched.
Version is read once at startup, not per request.
