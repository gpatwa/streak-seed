# Release Checklist — StreakKeeper MVP

> Stage 9 · Owner: Release Manager
> Tier: **2** (behavioural change, no external effect)
> Source artefacts: `runs/greenfield/05-arch.md` (§6 rollback), `06-impl.md`
> (verify commands, rollback), `07-qa.md` (QA PASS), `08-security.md`
> (Security PASS), `.agentic/SAFETY_INVARIANTS.md`, `docs/RELEASE_GATES.md`,
> `docs/HUMAN_APPROVAL_RULES.md`, `STATE.md`

## Tier classification rationale

StreakKeeper's headless service (`src/services/{streak,habits,audit}.js`) is a
new service with an internal data model (in-memory `Map`/`Set` habit +
completion + audit stores) and no external effect: no HTTP route, no network
call, no dependency, no deploy target. That is exactly `docs/RELEASE_GATES.md`'s
Tier 2 definition ("new service, internal data model change... no external
effect"), not Tier 3 — nothing here sends, submits, posts, publishes, pushes,
deploys, or touches auth/permissions of a third party. Confirmed independently
by both QA (`07-qa.md`) and Security (`08-security.md`), who each recommend
"GO (Tier 2)."

## Gates

Walking `docs/RELEASE_GATES.md`'s gate map for the Implementation / QA /
Security / Release rows, which is what Tier 2 requires in full (the Scope,
Discovery, and Architecture rows precede Implementation and are already
recorded done in `STATE.md`'s stage table — Market Research, PRD, UX, UI,
Architecture (16 checks) — not re-litigated here).

### Implementation

- [x] **Typecheck passed** — `npm run typecheck` → `typecheck ok` (`06-impl.md`); independently re-run, identical (`07-qa.md` §1).
- [x] **Targeted tests passed** — all 12 spec T-numbers covered (T4 split pure/service = 13 blocks), each named and green (`06-impl.md`).
- [x] **Full test suite passed** — `npm test` → 13/13 pass, 0 fail/skip; re-run twice independently by QA, deterministic (`07-qa.md` §1).
- [x] **Build passed** — `npm run build` → `build ok` (`06-impl.md`); re-confirmed (`07-qa.md` §1).
- [x] **One commit per task** — plan-confirmed, execution pending this GO: `05-arch.md` §6 fixes the slice as **one commit** for this one-task slice. `git log` is empty today by design — the commit itself is the landing action this GO authorizes (see Landing boundary below), not a precedent this gate is checking retroactively.
- [x] **No new lint warnings** — no lint tool is configured (zero-dependency prototype: `package.json` has 5 scripts, no lint step, no `devDependencies`), so I ran the pack-equivalent (`git diff --check`) myself: staged all 58 untracked files, ran `git diff --cached --check` → **exit 0, zero warnings** across 5,348 inserted lines, then `git reset` to unstage — repo left exactly as found (staging is not landing; that stays the Orchestrator's step).

### QA

- [x] **UI verified in preview where observable** — **n/a-with-reason**: headless service, zero HTTP/UI surface exists by design (`07-qa.md` §4, cross-checked against `.agentic/PROJECT_CONTEXT.md` and `05-arch.md`) — there is nothing to preview or screenshot for a local MVP with no client surface.
- [x] **Local regression command passed** — `npm run qa:mvp` green, independently re-run (`07-qa.md` §1).
- [x] **Safety invariants verified** — **6/6** `.agentic/SAFETY_INVARIANTS.md` invariants held under adversarial probing well beyond the shipped test suite (`07-qa.md` §2) — including a 36,892-case brute-force sweep against §1 alone (vs. the spec's one worked example), and a real found gap (below) that does **not** violate any of the six.

### Security

- [x] **No secrets / credentials in diff** — no `.env`, no keys/tokens/passwords/JWTs, nothing to inline — there's no external service to authenticate to (`08-security.md` §5).
- [x] **No PII / sensitive data logged** — habit names never reach audit (grep-confirmed at both call sites); **zero** log/telemetry sink exists anywhere in `src/` (`08-security.md` §2).
- [x] **Audit events cover state changes** — both spec events (`habit.created`, `habit.completion_logged`) present and unchanged; every state-changing function emits exactly one; nothing renamed or dropped vs. `05-arch.md` (`08-security.md` §6).
- [x] **Adapter boundary placeholder still throws** — **n/a-with-reason**: no adapter, LLM client, or network egress exists in this slice by design (`08-security.md` §6: "there is nothing to 'turn real'") — there is no placeholder to re-test because there is no adapter boundary yet.

### Release

- [x] **Human approval points satisfied** (`docs/HUMAN_APPROVAL_RULES.md`) — cross-checked all six always-approval rules against this slice: none apply (no send/submit, no destructive op on shared state, no deploy/flag/RBAC change, no safety-control change, no LLM wired behind a placeholder, no new third-party processor). The one forward-looking gated action for this project — create/push a GitHub repo, rule 3 — is correctly **un-taken**, not bypassed (`STATE.md` Approvals table: "not yet" requested; confirmed untouched by Security in `08-security.md` §6).
- [x] **Rollback plan exists** — see below; lifted from `05-arch.md` §6, confirmed against actual repo state.
- [x] **Release checklist filled** — this document.

### Enterprise & governance gates

**N/A (block)** — project pack is `b2c-saas` (`STATE.md`); the
`enterprise-saas-future` overlay is not enabled for this slice, so none of
Data Governance / Compliance / AI Governance / FinOps / SRE / CAB gates apply.

### Skipped gates

| Gate | Reason for skip | Confirmed by |
|------|-----------------|--------------|
| UI verified in preview | Headless service, no UI/HTTP surface exists by design in this slice | QA (`07-qa.md` §4) |
| Adapter boundary placeholder still throws | No adapter/LLM/network boundary exists yet in this slice — nothing to re-test | Security (`08-security.md` §6) |
| Enterprise & governance gate block | `b2c-saas` pack; enterprise overlay not enabled | Release Manager (`STATE.md`) |

## The one open finding — confirmed genuinely non-blocking

**The `now` clock-validation gap** (invalid/`NaN` clock → permanent per-habit
corruption + cascading `listHabits` failure for that user):

- **QA** (`07-qa.md` §3) found and fully characterized it, and explicitly
  confirms it **violates none of the six invariants** — §1 forbids a
  *client-supplied* date, and there is categorically no client path in this
  repo (no HTTP route anywhere) — and has **zero live reachability** today.
- **Security** (`08-security.md` §4) independently reproduced it end-to-end
  (two probes, one beyond what QA ran), reclassified it precisely as a
  **robustness / local-availability (self-DoS) defect** — explicitly **not**
  a security issue (no attacker-reachable path; the §4 ownership check runs
  before the clock is ever read, so it's strictly self-inflicted) and **not**
  a privacy issue (destroys availability, discloses nothing) — and *sharpened*
  QA's proposed guard: finiteness alone is insufficient, since a finite but
  out-of-range epoch still throws; the guard must validate the clock maps to
  a representable UTC day.
- Both reviewers independently concur: **carry forward, do not block.**
  Security formally recorded it as **required-fix precondition #1 of 6** in
  `08-security.md`'s "Preconditions carried to the future HTTP/adapter slice"
  — it must land **before or with** the first slice that lets any
  client-influenced value reach `now`, with `new Date(req.body.date)` named
  explicitly as the canonical footgun for that slice's threat model.
- **Re-anchored here a third time** (Release Manager checkpoint) so it does
  not evaporate between now and whenever that future HTTP slice's Architect
  picks up work: the fix is cheap, purely additive, and changes no behavior
  for valid inputs — it belongs in that slice's own tech spec and threat
  model as a named precondition, not merely assumed remembered.

**Conclusion: genuinely non-blocking for this Tier 2 headless release** —
correctly documented, not silently dropped.

## Rollback plan

Lifted from `05-arch.md` §6, confirmed against the actual repo (`git status`:
0 commits, all 8 slice files currently untracked):

1. **Today (pre-landing).** Discard = delete the 8 new files
   (`package.json`, `src/services/{streak,habits,audit}.js`,
   `scripts/{build-check,demo}.mjs`, `test/{streak,habits}.test.js`). Nothing
   else in the repo imports or depends on them.
2. **After landing** (this GO authorizes the Orchestrator's single commit
   per the plan above): `git revert <implementation-commit>` removes exactly
   those files and nothing else.
3. **No data migration** — stores are in-memory `Map`/`Set`; reverting the
   code drops all state; there is no persisted schema, index, or row.
4. **No feature flag needed** — nothing auto-invokes the service (no route,
   cron, or UI in this slice), so there is no live surface to disable first.
5. **Verify rollback:** on the reverted tree, `npm run qa:mvp` is green and
   `grep -rn "habit" src/` returns nothing.

## Decision

- [x] **GO (Tier 2).**

All implementation, QA, and security gates pass with independently re-run
evidence (not rubber-stamped — QA re-derived every claim against real code;
Security re-derived every claim against real code and against QA). The two
n/a gates (UI preview, adapter-placeholder) are correctly n/a because this
slice has no UI and no adapter boundary by design, not because they were
skipped. Rollback is a single, verified, no-migration operation. The one open
finding violates no invariant, has no live reachability, and is durably
recorded as a required-fix precondition on the correct future slice.

## Landing boundary (explicit)

This is a greenfield **local** repo with no remote (`git remote -v` returns
nothing). **"Landing" here means only that the Orchestrator makes the first
local git commit** — normal artefact-saving, no external effect, already
covered by `docs/HUMAN_APPROVAL_RULES.md`'s "Allowed without approval" list
("Create local commits on the project's working branch"). This GO clears
that: it is safe to commit locally and hand to Post-Launch.

**Creating or pushing a GitHub repository for StreakKeeper is a separate
rule-3 human-approval action** (`docs/HUMAN_APPROVAL_RULES.md` rule 3:
external-effect changes via deploy/release) and is explicitly **not**
authorized by this GO. It is tracked, still unrequested, in `STATE.md`'s
Approvals table and remains the human's call, not the pipeline's.

## Hand off

**GO → Post-Launch Learning Agent** (`runs/greenfield/10-post-launch.md`,
emits `trace.json`, closing Phase 6 per the validation matrix), once the
Orchestrator has made the single local commit described above. The
GitHub-repo push stays parked as a rule-3 human-approval item and is not
part of this hand-off.
