# Release Checklist — health-version

> Stage 5 · release-manager · depth smoke · Tier 1 (Charter C7.2) · base `143de22`, branch `slice/health-version`, uncommitted
> I committed nothing. My tools are Read/Write/Edit/Grep/Glob only: no shell, so I could not run `charter-check.mjs` or any git command.

## Verdict: GO (local commit only, per Charter C8.2)

Attempt 1 returned NO-GO because I have no shell and could not recompute the Charter sha256. The Orchestrator ran
`charter-check.mjs` and saved its verbatim output in `runs/health-version/charter-check-output.txt`:

```
charter complete: runs/health-version/CHARTER.md
sha256 40e45749fc84283bd64f91024963d8806bee482e67beeeeb6a14dc2ee011b174
```

That hash equals the one in `APPROVAL_RECORD-1.md` (the hash the human approved) and the Charter reference in STATE.md. The Charter is unchanged
since approval. Every other gate below passes, so the hold is lifted. No condition remains.

## Release tier

**Tier 1** (Charter C7.2; intent stakes "None of the above"). Confirmed against the diff: one response field in one existing loopback-only handler, plus two test files.
No new route, no client, dependency, auth, bind or safety-control change, no external effect. Not Tier 2/3.

## Gate walk (Tier 1: implementation gates, secrets/PII scan, light release checklist)

| Gate | Evidence | Result |
|---|---|---|
| Typecheck / targeted tests / full suite | `npm run qa:mvp` 92 pass, 0 fail: reported identically by 01-impl, 02-qa and 03-security (security re-ran it). Baseline 91 (Charter C6.1, slice plan) + S1b = 92 | PASS (cited, consistent across 3 stages; not re-run by me, no shell) |
| Build | `npm run build` -> `build ok` (01-impl, 02-qa) | PASS (cited) |
| Fail-first | S1b fails on old `src/server.js`, passes with fix; reproduced independently by QA | PASS (cited) |
| One commit per task | Single task; one local commit per Charter C8.2. Branch ref `slice/health-version` = `143de22` = `main`, so no commit exists yet | PASS (pending the commit) |
| No new lint warnings (`git diff --check`) | Not run by me. QA/Security diff reviews report +17/-4 across 3 files and no stray content | Not independently verified; low risk, see Residual |
| QA: UI preview | No client file touched; n/a | n/a (Tier 1, no UI) |
| QA: regression command | 92/92 as above | PASS |
| QA: safety invariants | Invariants 1-7 checked in 02-qa and 03-security; 4, 6, 7 adjacent and hold; S29 loopback pin and S28 green | PASS |
| Security: no secrets in diff | Grep for key/token/secret patterns, no match (03-security). Only `package.json` `version` newly exposed | PASS |
| Security: no PII logged | No log call added; live log is route template, status, ms only | PASS |
| Security: audit events | No state-changing function added; access-log shape unchanged | PASS |
| Security: adapter boundary | Charter C3.0, no model in product path; n/a | n/a |
| Security verdict | PASS, 0 blockers, 0 required-fix, 3 advisories (A-1 to A-3) | PASS |
| Release: rollback plan | Tier 1 light checklist. The change is one additive field, undone by reverting the single local commit (`git revert <sha>` or deleting the unpushed branch). Nothing shipped externally | PASS |
| Release: checklist filled | This file | PASS |

## Charter and approval verification

| Check | Evidence | Result |
|---|---|---|
| Approval record exists | `runs/health-version/APPROVAL_RECORD-1.md`: approved, Gopal Patwa, directly in the driving session, 2026-10-16, verbatim quote names the file and the hash, confirms 160k ceiling and the intent and plan | PASS |
| Hash consistent across records | `40e45749...e011b174` identical in CHARTER reference in STATE.md line 10, STATE.md Approvals row, and APPROVAL_RECORD-1.md (string compare by me) | PASS |
| Recorded hash equals what `charter-check.mjs` prints now | `charter-check-output.txt` (run by the Orchestrator): `charter complete`, sha256 `40e45749...e011b174`, equal to APPROVAL_RECORD-1 | PASS |
| Approval applies to this action | The Charter C8.2 pre-authorises the local commit; the approval covers that exact hash. Nothing else asked | PASS |
| Charter in scope: depth not lowered | C7.1 standard, C7.2 Tier 1; QA and Security ran at standard, Release at smoke per plan | PASS |

## No gated action beyond the Charter

| Check | Evidence | Result |
|---|---|---|
| No commit, merge or reset yet | `.git/logs/HEAD` last entry: `checkout: moving from main to slice/health-version`; `refs/heads/slice/health-version` = `main` = `143de22` | PASS |
| No push | `refs/remotes/origin/main` = `06e1668` (older than `main`; the two later local commits `47d46db`, `143de22` are unpushed). Caveat: the reflog does not record pushes, but an unmoved remote ref is consistent with none | PASS (consistent) |
| No PR / merge / deploy / send | No such path in the diff; no network code added; Security's only network activity was loopback and one refused connect to its own LAN address | PASS |
| No safety-control or `.agentic`/`.claude` change | Security scope check (git diff names only 3 files); `src/server.js` bind untouched (`host = "127.0.0.1"`) | PASS |
| No new dependency | `package.json` unchanged; the only import in `src/server.js` pre-exists (`readFileSync` at line 10) | PASS |
| No model / data processor | Charter C3.0, C4.0 | PASS |

Spot checks I made directly: `src/server.js` lines 13-17 (module-level `VERSION`, read once) and line 298 (`send(res, 200, { status: "ok", version: VERSION })`);
`test/server.test.js` S1 relaxed to `status === "ok"`, S1b exact `deepEqual` with `package.json` version; `test/client-server.test.js` line 136 relaxed. All match 01-impl.

## Exact commit file set (C8.2: local commit on `slice/health-version` only)

Stage by explicit path. Never `git add -A` or `git add .`.

```
git add src/server.js test/server.test.js test/client-server.test.js runs/health-version/
```

1. `src/server.js`
2. `test/server.test.js`
3. `test/client-server.test.js`
4. `runs/health-version/` (intent.md, 00-slice-plan.md, CHARTER.md, APPROVAL_RECORD-1.md, 01-impl.md, 02-qa.md, 03-security.md, 04-release.md, charter-check-output.txt, STATE.md)

**Excluded, must stay untracked:** `runs/APPROVAL_VERIFICATION.md`, `runs/CONFORMITY.md` (pre-existing reports from earlier runs, Security A-3).
Before committing, `git status --short` should show nothing staged outside the four paths above. Do not push, open a PR, merge or deploy.

## Rollback

Revert the one local commit (`git revert <sha>`), or delete the unpushed branch `slice/health-version` (`main` is untouched). No data, migration or external state involved.

## Post-launch monitoring

Not required (Tier 1; nothing deployed; no Post-Launch stage per slice plan).

## Carried advisories (non-blocking)

- A-1: re-decide whether unauthenticated `/health` keeps disclosing `version` if invariant 7 (loopback bind) is ever widened.
- A-2: C19 (`test/client-server.test.js`) could be tightened to exact body `{status:"ok", version: pkg.version}`.
- A-3: honoured above (selective staging).

## Residual notes

- `git diff --check` and a fresh `npm run qa:mvp` were not run by me (no shell). Three independent stages report 92/92 on the same diff, so this is low risk; the Orchestrator may run both with the charter-check step if it wants them first-hand.
- STATE.md's Budget block still says the ceiling and hard cap are "pending approval". That note is stale (APPROVAL_RECORD-1 approves the whole Charter hash and confirms the 160k ceiling). It is outside my artefact and the Budget block is not mine to edit, so I left it for the Orchestrator.
- Spend is 135k (STATE.md): above the 120k plan, under the 160k ceiling (C2.2), so notice only, no stop. My attempt-1 spawn is part of that figure.

## Hand-off

GO. Orchestrator makes the local commit above (C8.2): no push, PR, merge or deploy. Then the end-of-run review (no Post-Launch stage).
