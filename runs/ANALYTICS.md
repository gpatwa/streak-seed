# Pipeline Analytics — generated

_Generated 2026-07-26T18:04:32Z. **Do not edit by hand** — regenerate with `node <playbook>/execution/analyze.mjs .` from the repo root._

## Fleet

- Runs traced: **1**
- Stages: **10** · Tokens: **947,185** · Tool calls: **223**
- Clean density (ex cap-breach): **~4.2k tok/call** — the reproducible unit cost of one agentic step
- Envelope breaches: **0/1**

## Per run

| Run | Tier | Stages | Tokens | Calls | Density | Envelope | Status |
|-----|------|--------|--------|-------|---------|----------|--------|
| greenfield | 2 | 10 | 947,185 | 223 | 4.2k | 1,000,000 | ✅ pass |

## Per stage

| Run | Stage | Model | Tokens | Calls | Tok/call | Flags |
|-----|-------|-------|--------|-------|----------|-------|
| greenfield | Market Research | sonnet | 66,400 | 12 | 5,533 | — |
| greenfield | PRD | sonnet | 60,899 | 10 | 6,090 | — |
| greenfield | UX | sonnet | 71,106 | 10 | 7,111 | — |
| greenfield | UI | sonnet | 77,225 | 8 | 9,653 | ⚠ density |
| greenfield | Architecture | opus | 96,878 | 21 | 4,613 | — |
| greenfield | Implementation | sonnet | 119,223 | 38 | 3,137 | — |
| greenfield | QA | sonnet | 142,330 | 52 | 2,737 | — |
| greenfield | Security | opus | 98,661 | 27 | 3,654 | — |
| greenfield | Release | sonnet | 85,046 | 20 | 4,252 | — |
| greenfield | Post-Launch | sonnet | 129,417 | 25 | 5,177 | — |

## Outliers

- **UI** (greenfield): 77,225 tok / 8 calls — 2.7× the 3.6k density baseline

## Baselines

- Per-stage cap: **150,000** tokens · Slice envelope: **stages × 100,000** · Density baseline: **~3,600** tok/call
