# PRD — StreakKeeper (MVP slice)

> Owner: Product Manager Agent · Status: ready for UX · Source: `01-discovery-brief.md` (recommendation: proceed)

## Problem

In the user's words: *"I don't want a game, and I don't want a scoreboard I'm losing. I just want an honest picture: am I keeping this up, or have I been telling myself I am? And when I miss a day, I want to see that clearly without the app punishing me for it."* People trying to build a habit either lose track and quietly fool themselves (paper, notes, memory), or they adopt a tracker whose gamification turns a personal practice into something that can be *lost* — a broken chain, a dead avatar, a guilt notification — and end up quitting the tracker, not just the habit.

## Target user & the moment

**Bounced Trackers who name guilt or gamification — not UI, not missing features — as the reason they quit their last habit app** (discovery §3, §7). The moment: they've just abandoned, or are about to abandon, a tracker after its punitive reaction to a missed day — a reset chain, an avatar penalty, a guilt-trip push — and are deciding whether to risk trying again with something that won't do that to them. A second, recurring moment once adopted: the day after a miss, opening the app wanting an honest, non-judgmental read on where they actually stand.

## Success criteria

Observable in product behavior or audit data:

- [ ] Logging a completion for a habit today updates that habit's current streak (consecutive days completed up to today).
- [ ] The longest-streak value updates whenever the current streak surpasses it, and never decreases.
- [ ] A habit is flagged "at risk" exactly when it was completed yesterday and not yet today — never in any other state.
- [ ] A habit's at-risk flag clears the same day it's logged.
- [ ] After a missed day, the current streak reflects the break while the longest streak stays visible and unchanged — no punitive framing (no negative score, no "streak lost" language) appears wherever a broken streak is shown.

Needs real usage — cannot be measured in a seed/prototype run:

- [ ] **[verify live]** Bounced Trackers who adopt StreakKeeper return at a higher rate after a first missed day than they did with their prior (gamified) tracker.
- [ ] **[verify live]** The at-risk nudge reads to users as informative rather than guilt-inducing (interview/survey signal).

## Scope (what's in)

The thin slice that delivers the core loop end to end:

- A small set of daily habits to log completions against (the minimum needed for the loop below — not habit management as a feature).
- Log a habit as completed for today.
- Per habit: show the current streak and the longest streak ever.
- Per habit: an at-risk signal when it was completed yesterday but not yet today.

## Non-goals (what's out)

Real exclusions a reasonable reader might expect from a habit tracker — each one a deliberate consequence of "mirror, not scoreboard," not an oversight:

- **No leaderboards, friend feeds, or any streak-vs-others comparison.** Accountability-via-others is a genuine retention lever (discovery §6); this version forgoes it by design.
- **No streak-freeze, streak-repair, or any purchase that protects a streak from breaking.** The exact monetization pattern this product's positioning is defined against (Duolingo).
- **No points, levels, badges, avatars, or other game-layer trappings on top of the streak.** The Habitica-style layer this product is the direct foil to.
- **No push notifications or reminder copy built around loss-aversion.** The at-risk signal is a passive, in-product mirror the user checks — not an alert campaign chasing them.
- **No non-daily/custom-schedule habits, and no editing or backfilling past days.** Every habit here is daily; today's log is the only thing this slice writes.

## Open questions

- [ ] **[BLOCKS IMPLEMENTATION — must resolve now]** What tone and language make the at-risk nudge and the post-miss state read as observational rather than punitive, without going so soft the signal becomes inert? UX/UI cannot finalize the nudge or the broken-streak state without a direction here — this is the concrete form of "mirror, not scoreboard" and needs an answer before those artefacts are built.
- [ ] **[CAN SHIP — polish-only, needs live data]** Does removing the guilt/loss-aversion loop cost this product meaningful return-usage relative to gamified competitors (discovery §6, the Duolingo tension) — and if so, is that an acceptable tradeoff for this product's premise, or is there a non-punitive way to recover some of that pull later? Unanswerable before real usage exists. The MVP should ship in its restrained form to generate the data rather than wait for the answer. Owned by Product, revisited post-launch.
