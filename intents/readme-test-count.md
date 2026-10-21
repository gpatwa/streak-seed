# Intent: the README stops quoting a test count that goes stale

> **The dry run of Process v3's first standing Charter** (`.agentic/STANDING_CHARTER.md`).
> A deliberately tiny, tier 1 change: the point is to measure how many times the
> human is needed (the target is zero), not the feature. Drafted 2026-10-21 by
> Claude in the playbook session; it runs only once the owner moves it into
> `intents/ready/`.

## What I want

The README says the suite has 84 tests; it has 92. A number written by hand goes
stale every time a test is added, so the README should not carry one.

## Who it's for

Someone reading the README to see what `npm run qa:mvp` does and whether to trust
it.

## Done means

- [ ] `README.md` no longer states a specific number of tests. The `qa:mvp` line
      still says what it does (typecheck, then the full suite).
- [ ] No other line of `README.md` changes, and no other file changes except this
      run's own record under `runs/readme-test-count/`.
- [ ] `npm run qa:mvp` and `npm run build` pass.

## Must not break

Every invariant in `.agentic/SAFETY_INVARIANTS.md`; every existing route and test.

## Constraints

Release tier 1 (documentation only, no behaviour change). Dependency-free, as
today.

## Out of scope

Any source or test change, CI, `.claude/`, `.agentic/`, deploy, publish, merge by
anyone but the Charter's auto-merge rule.

## Stakes

- [ ] Touches real user data
- [ ] Moves money, or changes billing
- [ ] Irreversible
- [ ] Changes auth, permissions, or a safety control
- [ ] Adds a screen or UI a user will see
- [x] None of the above
