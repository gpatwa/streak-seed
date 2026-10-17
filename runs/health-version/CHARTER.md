# Charter: health-version

## 1. Scope
- **C1.1 Intent:** `runs/health-version/intent.md`, sha256 `e79a33744f71e8571b3b9b523325c82220a1b8f49afd383717d54078f0b9561d`
- **C1.2 Plan:** `runs/health-version/00-slice-plan.md`, sha256 `46a5426ab308c891e589bd18ff76c25a84d0c90cc8c29285bbe65cc89436c7ad`
- **C1.3 Non-goals:** Any other route; any client change; any new dependency; deploy; publish; merge; push.

## 2. Budget (unit: peak context summed per spawn)
- **C2.1 Plan total:** 120k
- **C2.2 Ceiling:** 160k. Above it the run continues and sends a notice.
- **C2.3 Hard cap:** 200k. Above it the run stops. The run never raises it.

## 3. Models (rule 5)
- **C3.0** None: no model in the product path.

## 4. Data processors (rule 6)
- **C4.0** None beyond those already approved: none required.

## 5. Safety controls (rule 4)
- **C5.0** None.

## 6. Prerequisites (set once in the setup phase, each with its dry run)
| id | What | Why | Dry run that proves it |
|---|---|---|---|
| C6.1 | `npm run qa:mvp` runnable | Implementation, QA gates | `npm run qa:mvp` prints 91 pass, 0 fail (done at Intake) |
| C6.2 | Local branch `slice/health-version` | commit target (C8.2) | `git switch -c slice/health-version` exits 0 (run on approval) |
| C6.3 | Role agents in `.claude/agents/` | stage dispatch | `ls .claude/agents/{backend-architect,qa-evidence,security-privacy,release-manager}.md` lists four files (done) |

## 7. Depth (may not be lowered)
- **C7.1** Security Review: standard
- **C7.2** Release Gate tier: 1

## 8. Outcomes decided now
- **C8.1 If a pre-registered check fails:** close as not releasable, write the close-out, stop.
- **C8.2 At the end of a passing run:** commit on local branch `slice/health-version`; never push, never open a pull request, never merge, never deploy, never send.
- **C8.3 Irreversible actions allowed (rules 1 to 3):** none.

## 9. Stops (the only reasons the run asks)
1. An action not covered by a line above (a new model, processor, data, file, invariant, or irreversible action).
2. Spend above the hard cap (C2.3).
3. A credential is needed (agents never handle credentials).
4. Lowering a depth in section 7.
5. A change to this Charter (an amendment is a new approval of a new hash).

## 10. Notices (sent, never asked)
A push notification at each stage boundary with two lines: the stage, its result
and the spend. The full record stays in `runs/health-version/`.
