# streak-seed — StreakKeeper

A habit-streak tracker: log a habit, see your current and longest streak, and
get a gentle signal when one is at risk. The stance the product commits to is
that **the streak is a mirror, not a scoreboard** — consistency made visible
without guilt.

It exists as a reference app for the
[Agentic SDLC](https://github.com/gpatwa/agentic-sdlc-playbook), and it is the
one that answers a harder question than "can agents write code": **this app was
built 0→1 from a single paragraph.** Market research, PRD, UX, UI, architecture,
implementation, QA, security review and release — the product direction was
derived, not supplied.

The interesting directory is [`runs/`](runs/).

## Run it

Node 18+, no dependencies, no install step, no build.

```bash
npm run qa:mvp   # typecheck + the full suite (84 tests)
npm start        # server + browser client on 127.0.0.1:3000
```

## What's in here

| Path | What it is |
|------|-----------|
| `src/services/streak.js` | The core: current/longest streak and at-risk, from one server-side day cutoff |
| `src/services/habits.js` | Habits, completions, audit — all scoped by user |
| `src/server.js` | `node:http` surface + the static client route, **loopback-only** |
| `src/client/` | Vanilla browser client — no framework, no build, no dependency |
| `.agentic/` | Product context every agent reads first, incl. `SAFETY_INVARIANTS.md` |
| `runs/` | **The record** — every artefact, durable state, and telemetry per slice |

## The runs

| Slice | What it produced |
|-------|------------------|
| [`greenfield`](runs/greenfield/) | The whole app from one paragraph. Discovery caught a correctness trap *before any code existed*; QA found a bug whose proposed fix Security then proved insufficient |
| [`http-layer`](runs/http-layer/) | HTTP surface. **Security blocked the slice** — it was listening on every network interface, and reached a user's data over the LAN to prove it |
| [`browser-client`](runs/browser-client/) | The UI. **QA failed it** on a keyboard-accessibility defect a fully green test suite could not catch |

## The invariants

Stated in [`.agentic/SAFETY_INVARIANTS.md`](.agentic/SAFETY_INVARIANTS.md) and
enforced structurally rather than by good intentions:

- **One server-side day cutoff.** `currentStreak`, `atRisk` and the reset all
  derive from it, so they cannot disagree. No client-supplied date reaches it.
- **A streak is never silently zeroed** — and `longestStreak` is *derived, never
  stored*, so it cannot be reduced by a break.
- **No guilt mechanics.** No leaderboards, no streak-freeze purchases, no
  loss-aversion nudges. A broken streak reads *"Today starts a new streak."* —
  the word "broken" never reaches the user. These are product commitments, and
  adding one requires human approval.
- **The client cannot construct markup.** Habit names are user free-text; the
  render layer can only emit text nodes, so there is no escaping step to forget.

## Honest notes

- **In-memory storage** — restarting loses everything. Deliberate for a seed.
- **No auth.** `userId` is a self-asserted header and the server binds
  loopback only. Do not expose this; the safety argument is unreachability.
- **Known advisories** are recorded in
  [`runs/browser-client/04-security.md`](runs/browser-client/04-security.md)
  rather than fixed unreviewed after the gate passed.
- **Not deployed anywhere**, and deploying it would be a separate decision.

## More

The methodology lives in the
[playbook](https://github.com/gpatwa/agentic-sdlc-playbook); the other reference
app is [stash-seed](https://github.com/gpatwa/stash-seed).
