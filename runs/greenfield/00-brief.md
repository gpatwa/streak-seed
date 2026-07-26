# Greenfield Brief — StreakKeeper (Phase 4)

**Run:** greenfield 0→1 · **Driver:** Orchestrator (this session)

## The one-paragraph ask (verbatim — the pipeline's only input)

> StreakKeeper — a personal habit-streak tracker. A user logs which of their
> daily habits they completed each day, and the app shows, per habit, the
> current streak (consecutive days completed up to today) and the longest
> streak ever, plus a gentle nudge for any habit whose streak is "at risk"
> (completed yesterday but not yet today). The goal is to make consistency
> visible and losable-on-purpose rather than gamified into guilt — the streak
> is a mirror, not a scoreboard.

## What this run validates (Phase 4, VALIDATION_MATRIX)

The **discovery half, live** — Market Researcher → PM → UX → UI, none of which
any prior run exercised; **bootstrapping `.agentic/` from nothing**; **0→1** to
runnable code. Bonus: first **live `trace.json`** (closes Phase 6).

## Constraints

- Same ethos as stash-seed: dependency-free Node ESM, in-memory seed, tests via
  `node --test`, least-privilege, no item/user content in logs.
- **Discovery checkpoints for human review before any code** (Orchestrator gate).
- **No live web research this run** (avoids the parallel-search hang): market
  claims reason from general knowledge and are flagged "verify live" — **no
  fabricated citations** (Market Researcher anti-pattern).

## Greenfield finding

`execution/install.mjs` exits if the target has no `.agentic/`, so the pack
can't install until discovery authors it. Correct 0→1 order: discovery →
bootstrap `.agentic/` → install pack → delivery. (Candidate playbook follow-up:
a `--greenfield` bootstrap path.)
