# Pipeline Analytics — generated

_Generated 2026-07-27T06:26:14Z. **Do not edit by hand** — regenerate with `node <playbook>/execution/analyze.mjs .` from the repo root._

## Fleet

- Runs traced: **2**
- Stages: **15** · Tokens: **1,658,479** · Tool calls: **399**
- Envelope breaches: **1/2** · Stage outliers: **2**

## Per run

| Run | Tier | Stages | Tokens | Calls | Envelope | Status |
|-----|------|--------|--------|-------|----------|--------|
| greenfield | 2 | 10 | 947,185 | 223 | 1,000,000 | ✅ pass |
| http-layer | 2 | 5 | 711,294 | 176 | 500,000 | ❌ over 211k |

## DORA

Per `PIPELINE_SLOS.md` § DORA mapping. **Only metrics the traces ground are reported** — anything without data says so.

| Metric | Value | Basis |
|--------|-------|-------|
| Lead time (median) | 14.9h | intake → landed, 2/2 slices dated |
| Deployment frequency | 14.0 slices/week | 2 landed over the traced span |
| Change failure rate | 0% | 0 post-landing fixes + 0 reverts ÷ 2 landed |
| Rework rate | 0.50 / slice | 1 stage retries + 0 post-landing fixes ÷ 2 landed |
| Failed-deployment recovery time | **not captured** | needs blocked→unblocked timestamps in `STATE.md`; no run has recorded them |

Per-slice lead time: greenfield 1.5h · http-layer 14.9h

## Density by archetype

Tokens per tool call, measured against each archetype's own cap.

| Archetype | What it does | Cap | Observed (n) | Range | Avg |
|-----------|--------------|-----|--------------|-------|-----|
| **design** | reason → long artefact, few calls | 15,000 | 4 | 5,533–9,653 | 7,097 |
| **review** | read artefacts → verdict | 8,000 | 6 | 3,654–5,177 | 4,485 |
| **build** | heavy file / test I/O | 5,000 | 3 | 2,737–3,406 | 3,093 |

## Per stage

| Run | Stage | Type | Model | Tokens | Calls | Tok/call | % of cap | Flags |
|-----|-------|------|-------|--------|-------|----------|----------|-------|
| greenfield | Market Research | design | sonnet | 66,400 | 12 | 5,533 | 37% | — |
| greenfield | PRD | design | sonnet | 60,899 | 10 | 6,090 | 41% | — |
| greenfield | UX | design | sonnet | 71,106 | 10 | 7,111 | 47% | — |
| greenfield | UI | design | sonnet | 77,225 | 8 | 9,653 | 64% | — |
| greenfield | Architecture | review | opus | 96,878 | 21 | 4,613 | 58% | — |
| greenfield | Implementation | build | sonnet | 119,223 | 38 | 3,137 | 63% | — |
| greenfield | QA | build | sonnet | 142,330 | 52 | 2,737 | 55% | — |
| greenfield | Security | review | opus | 98,661 | 27 | 3,654 | 46% | — |
| greenfield | Release | review | sonnet | 85,046 | 20 | 4,252 | 53% | — |
| greenfield | Post-Launch | review | sonnet | 129,417 | 25 | 5,177 | 65% | — |
| http-layer | Architecture | review | opus | 93,172 | 22 | 4,235 | 53% | — |
| http-layer | Implementation | build | sonnet | 178,278 | 48 | 3,714 | 74% | ⚠ over cap |
| http-layer | QA | build | sonnet | 178,029 | 43 | 4,140 | 83% | ⚠ over cap |
| http-layer | Security | review | opus | 149,430 | 30 | 4,981 | 62% | — |
| http-layer | Implementation rework | build | sonnet | 112,385 | 33 | 3,406 | 68% | — |

## Outliers

- **Implementation** (http-layer, build): 178,278 tok / 48 calls — 1.2× the 150k per-stage token cap
- **QA** (http-layer, build): 178,029 tok / 43 calls — 1.2× the 150k per-stage token cap

## Baselines

- Per-stage token cap: **150,000** · Slice envelope: **stages × 100,000**
- Density caps: **design** 15,000 · **review** 8,000 · **build** 5,000 (tok/call)
