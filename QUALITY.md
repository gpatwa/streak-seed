# Code Quality — generated

_Generated 2026-08-19T06:11:27Z. **Do not edit by hand** — regenerate with `node <playbook>/execution/quality.mjs .`._

> **Measure-only.** These metrics never gate a release. They describe the
> code's shape so a reviewer can look where it matters; whether any of them
> should block a slice is a decision earned by evidence, not asserted here.

## Summary

- Source files: **9** · Source SLOC: **705**
- Approx. complexity: median **10**, max **45**
- Largest file: **275** SLOC
- Test:source SLOC ratio: **2.21×** (7 test file(s)) — *presence signal, not coverage*
- Files flagged for a glance: **2/9**

## Per file

| File | SLOC | Approx. cx | Fns | Cx/SLOC | Flags |
|------|------|-----------|-----|---------|-------|
| src/server.js | 275 | 45 | 18 | 0.164 | large |
| src/services/streak.js | 53 | 19 | 6 | 0.358 | dense |
| src/client/app.js | 127 | 18 | 17 | 0.142 | — |
| src/client/render.js | 94 | 18 | 13 | 0.191 | — |
| src/client/dom.js | 44 | 10 | 8 | 0.227 | — |
| src/services/habits.js | 65 | 10 | 6 | 0.154 | — |
| src/client/copy.js | 27 | 2 | 7 | 0.074 | — |
| src/client/boot.js | 2 | 1 | 0 | 0.5 | — |
| src/services/audit.js | 18 | 1 | 4 | 0.056 | — |

## Flags

A flag is "worth a human glance", never "broken".

- **src/server.js** — 275 SLOC (> 250)
- **src/services/streak.js** — 0.358 decisions/SLOC (> 0.3)

## Thresholds

- Large file: **> 250** SLOC · High complexity: **> 60** · Dense: **> 0.3** decisions/SLOC (files ≥ 20 SLOC only)
- Calibrated from observed seed-repo code, not pulled from the air — the same discipline as analyze.mjs's density caps.

## What this is NOT

- **Not coverage.** The test ratio is test-SLOC / source-SLOC — a presence signal. Real coverage needs an instrumented run; this tool never executes code.
- **Not a parser.** Complexity is a per-file decision-point approximation; it omits ternary/optional-chaining `?` to avoid false positives, and does not attribute complexity to individual functions.
- **Not a gate.** Nothing here fails a build. That decision waits on a real slice.
