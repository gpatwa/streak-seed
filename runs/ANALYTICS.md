# Pipeline Analytics — generated

_Generated 2026-07-26T18:39:50Z. **Do not edit by hand** — regenerate with `node <playbook>/execution/analyze.mjs .` from the repo root._

## Fleet

- Runs traced: **1**
- Stages: **10** · Tokens: **947,185** · Tool calls: **223**
- Envelope breaches: **0/1** · Stage outliers: **0**

## Per run

| Run | Tier | Stages | Tokens | Calls | Envelope | Status |
|-----|------|--------|--------|-------|----------|--------|
| greenfield | 2 | 10 | 947,185 | 223 | 1,000,000 | ✅ pass |

## Density by archetype

Tokens per tool call, measured against each archetype's own cap.

| Archetype | What it does | Cap | Observed (n) | Range | Avg |
|-----------|--------------|-----|--------------|-------|-----|
| **design** | reason → long artefact, few calls | 15,000 | 4 | 5,533–9,653 | 7,097 |
| **review** | read artefacts → verdict | 8,000 | 4 | 3,654–5,177 | 4,424 |
| **build** | heavy file / test I/O | 5,000 | 2 | 2,737–3,137 | 2,937 |

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

## Outliers

None — every stage is within its token cap and its archetype's density cap.

## Baselines

- Per-stage token cap: **150,000** · Slice envelope: **stages × 100,000**
- Density caps: **design** 15,000 · **review** 8,000 · **build** 5,000 (tok/call)
