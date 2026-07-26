# Discovery Brief — StreakKeeper

**Run:** greenfield 0→1 · **Stage:** Market Research · **Input:** `00-brief.md` (verbatim ask) · **Method:** general market knowledge only, no live web access this run

## 1. Problem hypothesis

In the user's words: *"I want to actually stick with my habits, but every tracker I've tried either makes me feel like a failure the one day I slip — a broken chain, a dead avatar, a guilt-trip notification — or it's so bare I might as well use a notes app. I don't want a game, and I don't want a scoreboard I'm losing. I just want an honest picture: am I keeping this up, or have I been telling myself I am? And when I miss a day, I want to see that clearly without the app punishing me for it."*

The gap isn't "no way to track habits" — paper and notes apps exist. It's that every method tried so far either lies by omission (memory, notes) or turns a personal practice into a performance that can be *lost* (gamified apps).

## 2. Evidence the problem exists

- Streak-as-motivator is one of the most independently reinvented mechanics in consumer software — habit apps, Duolingo, Snapchat, even GitHub's contribution graph all converged on "show a consecutive-day count." Convergent, unrelated reinvention is reasonable evidence of a real underlying motivator. [general knowledge]
- The same mechanic is also one of the most consistently *criticized* patterns in app discourse: streak anxiety, rage at losing a long streak to a timezone bug, paying to "freeze" a streak instead of doing the habit — recurring themes in reviews and tech commentary, especially around Duolingo. [general knowledge] This is the direct evidence for the guilt half of the hypothesis.
- "Don't break the chain" — the technique built entirely around visible streak-marking (popularly, if disputedly, attributed to Jerry Seinfeld) — has circulated for well over a decade and keeps getting rediscovered, independent of any one app's execution. [general knowledge]
- Habit-formation writing is often summarized as finding that a single missed day doesn't meaningfully derail habit formation, in contrast to the all-or-nothing framing a hard streak-reset implies. I recall this as a recurring claim but can't confirm the specific study or numbers without a live source. [verify live]
- Reviews of existing streak apps commonly show a bimodal split — enthusiastic long-term users vs. "deleted after one missed day wiped out months of progress." That pattern *shape* is consistent with a real subset of users being actively harmed, not just unmoved, by punitive streak design. [general knowledge]

## 3. Who feels it

**Segment: "Bounced Trackers"** — people who have installed and abandoned two or more habit-tracking apps.

- **Sizing:** habit tracking is a mature, decade-plus category with dozens of competing apps, near-zero switching cost, and free tiers everywhere — conditions that structurally produce heavy multi-app churn. Plausibly a large share of anyone who's tried a habit app has tried more than one, but I have no reliable size estimate without a live source. [verify live]
- **Frequency:** the underlying want (an honest consistency check) is daily. The abandonment trigger is episodic, clustering in the first few weeks: the first missed day, or the first time the game layer starts feeling hollow. [general knowledge]
- **Severity:** moderate, not acute — not health- or money-critical, but it compounds. Each abandoned tracker feeds a self-narrative of "I can't even stick with a habit app," a worse starting point than never trying one. That's why this segment is worth naming rather than targeting habit-trackers-in-general.

A sharper sub-slice: people who name *gamification or guilt specifically* — not bad UI, not missing features — as why they quit their last tracker. That sub-slice is who StreakKeeper's positioning is actually built for (see §7).

## 4. What users do today instead

- **Paper / wall calendar with X's** — the literal "don't break the chain" method. No computed streak or longest-ever; easy to lose, doesn't travel with you.
- **Notes or reminders app** — persistent but dumb: no streak arithmetic, no "at risk" state, the user counts in their head.
- **Spreadsheet** — a habits × days grid with a streak formula. More rigor, but setup/upkeep friction is high enough that most people abandon it within weeks.
- **General calendar app** — marking a habit's day among meetings and events. Visible, but not habit-shaped.
- **Memory alone** — "I'm pretty sure I've kept this up" — the exact self-deception the ask's "mirror, not scoreboard" framing reacts against.
- **A previously installed app, now deleted** — Bounced Trackers have by definition already tried and shed one real product.

## 5. Competitive landscape

- **Streaks** (iOS/watchOS, Crunchy Bagel) — the closest direct analog: minimalist, streak-count-first, no social feed or leaderboard, a well-regarded design-award winner. [general knowledge; award specifics verify live] It already does most of the ask — current streak, visual restraint, no gamification. Where it stops short: a broken streak just resets to zero with a color change; restraint is implicit in the UI, not a stated promise to the user. **This is the competitor that makes the core feature set table stakes, not white space.**
- **Habitica** — a full RPG layer: avatar leveling, gold, gear, HP loss for missed dailies, the avatar can "die," party/guild accountability. [general knowledge] The direct foil for "mirror, not scoreboard" — Habitica is maximally scoreboard. Differentiation here is real and sharp.
- **Loop Habit Tracker** (Android, open source) — arrived independently at a similar anti-punishment instinct via a different mechanic: a "regularity" score and graph instead of a hard streak, non-daily schedule support, no social or game layer, free. [general knowledge] Its existence is mildly disconfirming (§6): the underlying need is already being served, just not in StreakKeeper's specific current/longest/at-risk shape.

**Where the differentiation actually lives:** not the feature list — current streak, longest streak, and a reminder are close to the minimum viable version of the whole category; all three competitors above already ship all three. It lives almost entirely in **tone and restraint as an explicit, stated commitment**, and in what the product refuses to add later (leaderboards, avatars, streak-freeze upsells) more than in what v1 ships. A real but narrow moat: strong against Habitica-style apps, thin against Streaks/Loop, which already occupy similar restraint.

## 6. Disconfirming evidence

- **The feature is a commodity.** Current + longest streak + a reminder isn't a wedge into the category — it's close to the category's definition. No technical novelty. [general knowledge]
- **The category is saturated,** and "anti-gamification minimalism" isn't itself novel — Loop already occupies it. [general knowledge]
- **Revealed preference may cut against the thesis.** Duolingo's success — including monetizing streak-freezes — suggests the guilt/loss-aversion loop StreakKeeper rejects is also part of what drives some of the category's best retention. People loud about hating streak-guilt online may not represent what makes people *return* daily. Removing the guilt loop could help integrity and hurt retention at once. [general knowledge] This is the single biggest open risk, not a formality.
- **Thin monetization path.** Products with this restrained posture (Loop) tend to be free/open-source, because stripping streak-freezes, cosmetics, and social features also strips the usual upsell levers.
- **No social/accountability layer**, deliberately excluded by the ask. Accountability-via-others is one of the better-evidenced levers for behavior change; a solitary "mirror" forgoes it by design — a real ceiling on this version's engagement power, not an oversight.

None of this says the problem is fake. It says the *feature* is proven and commoditized, and the *differentiation* is a tone/restraint bet trading some engagement for integrity — a bet PM/UX need to make explicit, not one discovery can resolve further from a desk.

## 7. Recommendation

**Proceed to PRD.** Streak tracking as a retention mechanic isn't an open question — it's one of the most validated patterns in consumer software, independently reinvented across categories (§2). This isn't an unproven idea needing more discovery, and padding this brief further would manufacture rigor the situation doesn't need. The real question is "does it still work with the punitive layer removed" — a positioning/UX/copy question (the at-risk nudge's wording, the empty-state and broken-streak-state tone), answerable at PRD/UX, not a discovery blocker.

**First-slice target:** the "Bounced Trackers" segment (§3), narrowed to those who cite gamification or guilt — not UI, not missing features — as why they quit their last habit app. That's who "mirror, not scoreboard" is a reason to *switch* for; building for bounced-trackers-in-general risks a head-on polish fight with Streaks a v1 doesn't need to pick.
