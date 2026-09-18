# Pipeline Analytics — generated

_Generated 2026-08-27T07:20:55Z. **Do not edit by hand** — regenerate with `node <playbook>/execution/analyze.mjs .` from the repo root._

## Fleet

- Runs traced: **4**
- Stages: **25** · Tokens: **2,833,149** · Tool calls: **902**
- **Untraced stages: 11** across 3 run(s) — executed by the Orchestrator rather than spawned, so they carry no tokens or tool calls
- Envelope breaches: **3/4** · Stage outliers: **5**

## Per run

| Run | Tier | Stages | Tokens | Calls | Envelope | Status |
|-----|------|--------|--------|-------|----------|--------|
| greenfield | 2 | 10 | 947,185 | 223 | 1,000,000 | ✅ pass |
| http-layer | 2 | 5 | 711,294 | 176 | 500,000 | ❌ over 211k |
| browser-client | 2 | 5 | 654,531 | 275 | 500,000 | ❌ over 155k |
| security-hardening | 2 | 8 | 520,139 | 228 | 500,000 | ❌ over 20k |

## Pipeline completeness

Declared-vs-actual against the 12-stage lifecycle (`AGENTIC_SDLC.md`). An
**always** node missing is a real gap; a **conditional** node missing may be a
legitimate compression (`AGENTIC_SDLC.md` § "When to compress stages") — not
flagged either way, just listed, since only the EM's recorded rationale (not
this table) can say whether a given skip was earned.

| Run | Missing (always) | Skipped (conditional) | Unrecognized stage name |
|-----|-------------------|------------------------|--------------------------|
| greenfield | ⚠ Intake, Scope Review | — | — |
| http-layer | ⚠ Intake, Scope Review | Market Research, Discovery, UX Research, UI Design | — |
| browser-client | ⚠ Intake, Scope Review | Market Research, Discovery, UX Research, UI Design | — |
| security-hardening | ⚠ Scope Review | Market Research, Discovery, UX Research, UI Design, Architecture | — |

## DORA

Per `PIPELINE_SLOS.md` § DORA mapping. **Only metrics the traces ground are reported** — anything without data says so.

| Metric | Value | Basis |
|--------|-------|-------|
| Lead time (median) | 3.6h | intake → landed, 4/4 slices dated |
| Deployment frequency | 1.0 slices/week | 4 landed over the traced span |
| Change failure rate | 0% | 0 post-landing fixes + 0 reverts ÷ 4 landed |
| Rework rate | 0.75 / slice | 3 stage retries + 0 post-landing fixes ÷ 4 landed |
| Failed-deployment recovery time | **21m** | median across 1 recorded gate-catch recovery window(s) |

Per-slice lead time: browser-client 1.2h · greenfield 1.5h · security-hardening 3.6h · http-layer 14.9h

## Density by archetype

Tokens per tool call, measured against each archetype's own cap.

| Archetype | What it does | Cap | Observed (n) | Range | Avg |
|-----------|--------------|-----|--------------|-------|-----|
| **design** | reason → long artefact, few calls | 15,000 | 4 | 5,533–9,653 | 7,097 |
| **review** | read artefacts → verdict | 8,000 | 9 | 2,441–5,177 | 4,069 |
| **build** | heavy file / test I/O | 5,000 | 7 | 1,528–3,406 | 2,387 |

## Per stage

| Run | Stage | Type | Model | Effort | Tokens | Calls | Tok/call | % of cap | Flags |
|-----|-------|------|-------|--------|--------|-------|----------|----------|-------|
| greenfield | Market Research | design | sonnet | — | 66,400 | 12 | 5,533 | 37% | — |
| greenfield | PRD | design | sonnet | — | 60,899 | 10 | 6,090 | 41% | — |
| greenfield | UX | design | sonnet | — | 71,106 | 10 | 7,111 | 47% | — |
| greenfield | UI | design | sonnet | — | 77,225 | 8 | 9,653 | 64% | — |
| greenfield | Architecture | review | opus | — | 96,878 | 21 | 4,613 | 58% | — |
| greenfield | Implementation | build | sonnet | — | 119,223 | 38 | 3,137 | 63% | — |
| greenfield | QA | build | sonnet | — | 142,330 | 52 | 2,737 | 55% | — |
| greenfield | Security | review | opus | — | 98,661 | 27 | 3,654 | 46% | — |
| greenfield | Release | review | sonnet | — | 85,046 | 20 | 4,252 | 53% | — |
| greenfield | Post-Launch | review | sonnet | — | 129,417 | 25 | 5,177 | 65% | — |
| http-layer | Architecture | review | opus | — | 93,172 | 22 | 4,235 | 53% | — |
| http-layer | Implementation | build | sonnet | — | 178,278 | 48 | 3,714 | 74% | ⚠ over cap |
| http-layer | QA | build | sonnet | — | 178,029 | 43 | 4,140 | 83% | ⚠ over cap |
| http-layer | Security | review | opus | — | 149,430 | 30 | 4,981 | 62% | — |
| http-layer | Implementation rework | build | sonnet | — | 112,385 | 33 | 3,406 | 68% | — |
| browser-client | Architecture | review | opus | — | 94,354 | 22 | 4,289 | 54% | — |
| browser-client | Implementation | build | sonnet | — | 178,817 | 77 | 2,322 | 46% | ⚠ over cap |
| browser-client | QA | build | sonnet | — | 157,301 | 83 | 1,895 | 38% | ⚠ over cap |
| browser-client | Implementation rework | build | sonnet | — | 107,824 | 54 | 1,997 | 40% | — |
| browser-client | Security | review | opus | — | 116,235 | 39 | 2,980 | 37% | — |
| security-hardening | Implementation | build | sonnet | medium | 117,977 | 67 | 1,761 | 35% | — |
| security-hardening | QA | build | sonnet | high | 116,159 | 76 | 1,528 | 31% | — |
| security-hardening | Security re-gate | review | opus | high | 97,649 | 40 | 2,441 | 31% | — |
| security-hardening | Implementation rework | build | sonnet | medium | 72,966 | 34 | 2,146 | 43% | — |
| security-hardening | Security re-verify | review | opus | high | 115,388 | 11 | 10,490 | 131% | ⚠ density |

## Untraced stages

Executed by the Orchestrator rather than spawned as a subagent, so they
carry no tokens or tool calls. **Every fleet and per-run figure above
excludes them** — treat slice costs as a floor, not a total.

| Run | Stage | Recorded via |
|-----|-------|-------------|
| http-layer | Security re-gate (fact-check) | `notes.orchestratorExecuted` (trace@1) |
| http-layer | Release | `notes.orchestratorExecuted` (trace@1) |
| http-layer | Post-Launch | `notes.orchestratorExecuted` (trace@1) |
| browser-client | Release | `notes.orchestratorExecuted` (trace@1) |
| browser-client | Post-Launch | `notes.orchestratorExecuted` (trace@1) |
| security-hardening | Intake | `notes.orchestratorExecuted` (trace@1) |
| security-hardening | Release | `notes.orchestratorExecuted` (trace@1) |
| security-hardening | Post-Launch | `notes.orchestratorExecuted` (trace@1) |
| security-hardening | Intake | `executor` (trace@2) |
| security-hardening | Release | `executor` (trace@2) |
| security-hardening | Post-Launch | `executor` (trace@2) |

## Gate catches

Defects the gates caught before they shipped — the pipeline earning its keep.
**A floor, not a total:** 3 run(s) predate the `gateCatches` field (browser-client, greenfield, http-layer) and recorded catches only in prose, so a real block — e.g. Security stopping the http-layer bind — is not counted here.

**Structured catches: 1**

| Run | Gate | Verdict | Severity | Finding | Recovery |
|-----|------|---------|----------|--------|----------|
| security-hardening | Security | fail | required-fix | F-5: the F-2 fix reproduced the F-1 defect it sat beside — create() read vnode.tag three times (typeof, Set.has, createElement), so a stateful getter or Proxy validated as 'div' and constructed 'script'. Not reachable in this build; sent back so precondition 7.1 could be struck honestly rather than recorded as a guarantee the code did not provide. | 21m |

**Legacy gate activity (unstructured, `notes.gatesThatFired`) — surfaced, not counted:**

- browser-client: QA round 1: FAIL (focus lost after logging — live a11y defect)
- browser-client: Budget: STOP AND ASK before Security

## Outliers

- **Implementation** (http-layer, build): 178,278 tok / 48 calls — 1.2× the 150k per-stage token cap
- **QA** (http-layer, build): 178,029 tok / 43 calls — 1.2× the 150k per-stage token cap
- **Implementation** (browser-client, build): 178,817 tok / 77 calls — 1.2× the 150k per-stage token cap
- **QA** (browser-client, build): 157,301 tok / 83 calls — 1.0× the 150k per-stage token cap
- **Security re-verify** (security-hardening, review): 115,388 tok / 11 calls — 1.3× the 8.0k review-density cap

## Baselines

- Per-stage token cap: **150,000** · Slice envelope: **stages × 100,000**
- Density caps: **design** 15,000 · **review** 8,000 · **build** 5,000 (tok/call)
