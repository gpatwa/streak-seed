# Slice Plan — health-version

> Stage 1 (Intake) · Owner: Orchestrator · Process v2 dry run (pack v20)

## Outcome

`GET /health` returns `200` `{"status":"ok","version":"<package.json version>"}`,
version read once at startup; still no `X-User-Id`, still no user data.

## Success criteria (from intent "Done means")

1. `GET /health` → 200, body exactly `{"status":"ok","version":"<v>"}`, `<v>` = `package.json` `version`.
2. `/health` still needs no `X-User-Id` and carries no user data.
3. A new test covers the `version` field and fails against current code (fail-first).
4. `npm run qa:mvp` green, no fewer than the 91 tests passing at Intake.

## Non-goals

Any other route; any client change; any new dependency; deploy; publish; merge; push.

## Constraints from `.agentic/`

Dependency-free Node ESM. Version read once at startup, not per request. All 7
`SAFETY_INVARIANTS` hold; the §7 loopback bind is untouched. Nothing logged gains
free text (§6) — the version is a build string, not user content.

## Human-approval scan

| Rule | Trips? | Reason |
|------|--------|--------|
| 1 send/submit | No | no send path |
| 2 destructive shared state | No | additive edit to one source file and one test |
| 3 deploy/release | No | local branch only; no push, no PR, no merge |
| 4 safety control | No | no invariant or guarded file changes |
| 5 real model/client | No | no model |
| 6 new data processor | No | none |

Result: no gated action.

## Baseline at Intake

`main` at `143de22`; working tree has only untracked `runs/APPROVAL_VERIFICATION.md`,
`runs/CONFORMITY.md` (not part of this slice, left alone). `npm run qa:mvp`: 91/91.

## Stages (compressed per EM judgment — Stakes: none of the above, Tier 1)

No Product, UX, UI, Architecture or EM-scope stage: the intent fixes the contract
to one response field in one handler; a spec stage would restate it.

| # | Stage | Owner (agent type) | Depth | Environment | Est. |
|---|-------|--------------------|-------|-------------|------|
| 1 | Intake | Orchestrator | — | default | done |
| 2 | Implementation | backend-architect | standard | default | 40k |
| 3 | QA | qa-evidence | standard | default | 35k |
| 4 | Security re-gate | security-privacy | standard | default | 30k |
| 5 | Release (Tier 1 checklist) | release-manager | smoke | default | 15k |

Gates never compress: QA and Security run at standard, Release walks `RELEASE_GATES.md`
for Tier 1. No Post-Launch stage (nothing deployed); the end-of-run review stands in.

## Budget (unit: peak context summed per spawn)

Plan total **120k**. Proposed ceiling **160k** (~1.3×, no adversarial stage, no model).
Proposed hard cap **200k**.

## Prerequisites

| id | What | Why | Dry run (run at Intake) | Result |
|----|------|-----|-------------------------|--------|
| P1 | `npm run qa:mvp` runnable by Implementation/QA | baseline + gates | `npm run qa:mvp` → 91 pass, 0 fail | PASS |
| P2 | Playbook resolves to absolute path | gates, charter-check, usage.mjs | `ls ../agentic-sdlc-playbook/execution/charter-check.mjs` (main checkout = this repo) | PASS |
| P3 | `usage.mjs` runs | Trace Model column | `node ../agentic-sdlc-playbook/execution/usage.mjs . --slice health-version` → runs, no spawns yet | PASS |
| P4 | Agent definitions present in `.claude/agents/` | role dispatch (teams on) | `ls .claude/agents/{backend-architect,qa-evidence,security-privacy,release-manager}.md` | PASS (see below) |
| P5 | Budget-guard reads STATE | pre-spawn check | `STATE.md` Budget block in template format; re-run guard after STATE written | at STATE write |
| P6 | Slice branch exists | commit target for C8.2 | `git switch -c slice/health-version` before stage 2 | done at approval |

No `fresh-load` stage: every definition above exists before the first gated stage,
so no stage changes a definition it must then reload, and no human session start is needed.

Note: the budget-guard flagged `security-hardening` (an older slice whose STATE
predates the format) as unparseable. Pre-existing, unrelated; not touched.
