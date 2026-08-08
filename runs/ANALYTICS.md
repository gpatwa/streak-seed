# Pipeline Analytics — generated

_Generated 2026-08-08T06:40:04Z. **Do not edit by hand** — regenerate with `node <playbook>/execution/analyze.mjs .` from the repo root._

## Fleet

- Runs traced: **3**
- Stages: **20** · Tokens: **2,313,010** · Tool calls: **674**
- **Untraced stages: 5** across 2 run(s) — executed by the Orchestrator rather than spawned, so they carry no tokens or tool calls
- Envelope breaches: **2/3** · Stage outliers: **4**

## Per run

| Run | Tier | Stages | Tokens | Calls | Envelope | Status |
|-----|------|--------|--------|-------|----------|--------|
| greenfield | 2 | 10 | 947,185 | 223 | 1,000,000 | ✅ pass |
| http-layer | 2 | 5 | 711,294 | 176 | 500,000 | ❌ over 211k |
| browser-client | 2 | 5 | 654,531 | 275 | 500,000 | ❌ over 155k |

## DORA

Per `PIPELINE_SLOS.md` § DORA mapping. **Only metrics the traces ground are reported** — anything without data says so.

| Metric | Value | Basis |
|--------|-------|-------|
| Lead time (median) | 1.5h | intake → landed, 3/3 slices dated |
| Deployment frequency | 21.0 slices/week | 3 landed over the traced span |
| Change failure rate | 0% | 0 post-landing fixes + 0 reverts ÷ 3 landed |
| Rework rate | 0.67 / slice | 2 stage retries + 0 post-landing fixes ÷ 3 landed |
| Failed-deployment recovery time | **not captured** | needs blocked→unblocked timestamps in `STATE.md`; no run has recorded them |

Per-slice lead time: browser-client 1.2h · greenfield 1.5h · http-layer 14.9h

## Density by archetype

Tokens per tool call, measured against each archetype's own cap.

| Archetype | What it does | Cap | Observed (n) | Range | Avg |
|-----------|--------------|-----|--------------|-------|-----|
| **design** | reason → long artefact, few calls | 15,000 | 4 | 5,533–9,653 | 7,097 |
| **review** | read artefacts → verdict | 8,000 | 8 | 2,980–5,177 | 4,273 |
| **build** | heavy file / test I/O | 5,000 | 4 | 1,997–3,406 | 2,819 |

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

## Outliers

- **Implementation** (http-layer, build): 178,278 tok / 48 calls — 1.2× the 150k per-stage token cap
- **QA** (http-layer, build): 178,029 tok / 43 calls — 1.2× the 150k per-stage token cap
- **Implementation** (browser-client, build): 178,817 tok / 77 calls — 1.2× the 150k per-stage token cap
- **QA** (browser-client, build): 157,301 tok / 83 calls — 1.0× the 150k per-stage token cap

## Baselines

- Per-stage token cap: **150,000** · Slice envelope: **stages × 100,000**
- Density caps: **design** 15,000 · **review** 8,000 · **build** 5,000 (tok/call)
