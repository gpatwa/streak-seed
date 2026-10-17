# Intent: /health reports the running version

> A deliberately small slice: the first dry run of Aveto Process v2 (one
> Charter approval at the start, then no questions). The point is to measure
> how many times the human is needed, not the feature.

## What I want

`GET /health` returns the running version as well as the status, so an
operator can tell which build is answering without opening a terminal.

## Who it's for

Whoever runs StreakKeeper and wants to confirm a restart picked up a new
build.

## Done means

- [ ] `GET /health` returns `200` with a JSON body `{"status":"ok","version":"<v>"}`, where `<v>` is the `version` field of `package.json`.
- [ ] `/health` still needs no `X-User-Id` header and still carries no user data.
- [ ] A test covers the new field, and `npm run qa:mvp` passes.

## Must not break

Every invariant in `.agentic/SAFETY_INVARIANTS.md`; every existing route and
test.

## Constraints

Dependency-free Node ESM, as today. Read the version once at startup, not per
request.

## Out of scope

Any other route, any change to the client, any new dependency, deploy,
publish, or merge.

## Stakes

- [ ] Touches real user data
- [ ] Moves money, or changes billing
- [ ] Irreversible
- [ ] Changes auth, permissions, or a safety control
- [ ] Adds a screen or UI a user will see
- [x] None of the above
