# Project Context — StreakKeeper

## What this is
A personal habit-streak tracker. Users log which daily habits they completed;
the app shows, per habit, the **current streak** and the **longest-ever streak**,
plus a gentle **at-risk** signal. Positioning: **the streak is a mirror, not a
scoreboard** — consistency made visible without guilt-gamification.

## Who it serves
Primary segment: **"Bounced Trackers"** — people who have abandoned ≥2 prior
habit apps, specifically those who quit over *gamification or guilt*
(broken-chain shame, dead avatars, loss-aversion nudges), not over UI or missing
features. The moment that matters: **the morning after a missed day** — where
other apps punish and lose them.

## The stance (why it's differentiated)
Not the feature set (current/longest streak + reminder is table stakes). The
differentiation is **stated restraint** — what the product refuses to add
(see SAFETY_INVARIANTS §3). A broken streak is **reframed, not punished**: the
user-facing copy never says "broken" — it reads *"Today starts a new streak."*

## Stage
Greenfield MVP. Discovery complete (`runs/greenfield/01–04`). Delivery target:
a **headless, dependency-free Node service** (in-memory seed) backing a future
frontend.

## Open question (deferred, not resolved)
Does removing the loss-aversion loop cost real engagement vs. Duolingo-style
competitors? Needs live data — deferred to post-launch, not gating the MVP.
