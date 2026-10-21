# Standing Charter: streak-seed small changes

> **Process v3, the first standing Charter.** Drafted 2026-10-21 by Claude in the
> playbook session from the owner's decisions of 2026-10-20 (streak-seed first;
> tiers 1 and 2; auto-merge tier 1). It approves a class of routine run once, by its
> sha256, in the owner's own words, typed in a streak-seed session. A run that fits
> starts and finishes without asking; a run that does not fit waits for a normal
> Charter. Checked by `execution/standing-charter.mjs check`; each plan by `fits`.
> Budgets are sized from the last small slice here (`runs/health-version`: 141k).

## 1. Class
- **S1.1 Repository:** `streak-seed`
- **S1.2 Intents:** `intents/ready/` (only intents the owner moved there run under this Charter)
- **S1.3 Release tiers:** 1, 2

## 2. Budget (unit: peak context summed per spawn)
- **S2.1 Per run, hard cap:** 400k
- **S2.2 Per week, hard cap across all routine runs:** 1200k. Above it, routine runs stop until the owner says otherwise.

## 3. Models
One line per model a routine run may use, with its effort level. No other model, ever.
- **S3.1** stages the pack routes to `sonnet` (25 roles): `claude-sonnet-5-5`, effort medium (high where the role's own file sets high)
- **S3.2** Orchestrator, Software Architect, Security & Privacy: `claude-opus-5-5`, effort high

## 4. Paths a routine run may change
Exact path prefixes. A plan that names a path outside them does not fit.
- **S4.1** `src/`
- **S4.2** `test/`
- **S4.3** `README.md`

## 5. End actions
- **S5.1 End action:** pull request
- **S5.2 Auto-merge:** tier 1
- **S5.3 Permission rules:** written to `.claude/settings.local.json` (gitignored), every routine run on the one branch `routine-run` (one run at a time): `Bash(npm run typecheck)`, `Bash(npm test)`, `Bash(npm run build)`, `Bash(npm run qa:mvp)`, `Bash(git checkout main)`, `Bash(git pull --ff-only origin main)`, `Bash(git checkout -b routine-run)`, `Bash(git add src test README.md runs)`, `Bash(git commit -m *)`, `Bash(git push -u origin routine-run)`, `Bash(gh pr create *)`, `Bash(gh pr checks routine-run)`, `Bash(gh pr merge routine-run --squash --delete-branch)`

## 6. Validity
- **S6.1 Approved on:** 2026-10-21
- **S6.2 Expires on:** 2026-11-20
- **S6.3 Maximum runs:** 10
- **S6.4 Revocation:** deleting or renaming this file stops routine runs at the next stage boundary.

## 7. Never covered
A routine run never does any of these; a plan that needs one is not routine:
1. Sends or submits anything on a user's behalf.
2. Deletes or overwrites shared state.
3. Deploys or releases anything with an external effect.
4. Changes a safety control: `.agentic/SAFETY_INVARIANTS.md`, hooks, permissions, deny lists, `.claude/`, CI.
5. Puts a model into a path that was deterministic, or adds a model.
6. Adds a data processor or a data commitment.
