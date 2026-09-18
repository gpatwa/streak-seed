# Slice Plan — security-hardening

> Stage 1 (Intake) · Owner: Orchestrator · Slice: `security-hardening`
> Source of the ask: the four advisories in `runs/browser-client/04-security.md`
> (§1.3 F-1, §1.4 F-2, §2.4 F-3, §3.1 F-4), three of which were carried as
> preconditions in that document's §7.

## Outcome

Close all four Security advisories from the `browser-client` review, converting
three discipline-dependent controls into structural ones, with no change to any
user-visible behaviour.

## Why now (and not later)

The `browser-client` review passed with **no blockers**. These four are latent —
each is unreachable under the current data flow, and §7 of that review states the
conditions that would make three of them live: a data-derived vnode tag (F-2), a
non-primitive prop value (F-1), and cookie/session auth or an HTML-rendering
endpoint (F-4). The review's own recommendation is to fix them *before* the slice
that makes them reachable, not after. Doing it as one small dedicated slice is
cheaper than attaching each fix to the unrelated feature slice that would trip it.

## Scope — the four fixes

| # | File | Change | Reachable today? |
|---|------|--------|------------------|
| F-1 | `src/client/dom.js` `setProp` | Stringify **once** — `const v = String(value)` — then validate and set the same `v`. Today the href guard validates one stringification and sets a second, independently computed one, so a stateful `toString` defeats it. | No (single call site returns a template literal; CSP independently blocks the outcome) |
| F-2 | `src/client/dom.js` `create` | Validate `vnode.tag` against a tag allowlist before `createElement`, and reject children that are neither a string nor a well-formed vnode. Today the "tag is always a literal" invariant lives in a comment. | No (no data-derived tag exists) |
| F-3 | `src/server.js` `HTML_CSP` | Add `require-trusted-types-for 'script'` so the design's "no markup sinks" rule is browser-enforced at runtime, not only enforced by the C8 source scan plus review. | n/a (defense in depth) |
| F-4 | `src/server.js` `send`/`sendAndClose` | Add `x-content-type-options: nosniff` and `charset=utf-8` to JSON responses. The JSON route is the only response in the system carrying user free text, and it is the only one lacking `nosniff` — the static route already has it. | No (every response carrying a habit name requires the `x-user-id` request header, which a top-level navigation cannot send) |

F-1, F-2 and F-4 discharge preconditions §7.2, §7.1 and §7.3 of
`runs/browser-client/04-security.md` respectively. F-3 has no precondition; it is
taken now because it is one directive and it backstops the same boundary as F-2.

## Success criteria (observable)

1. All four fixes present, each with a targeted regression test that **fails
   against the current code** — a test that passes before the fix proves nothing.
   Specifically: a stateful-`toString` probe for F-1, a `tag = "script"` /
   malformed-child probe for F-2, a header assertion for F-4, and a CSP string
   assertion for F-3.
2. `npm run qa:mvp` green, with **no fewer than the 84 tests** passing today.
3. `npm run build` green (the import-check).
4. The app still renders and logs a completion **in a real Chromium session with
   the new CSP active** — the one genuine functional risk in this slice (§ Risks).
5. All six `.agentic/SAFETY_INVARIANTS.md` still hold; none is weakened.
6. Security re-gate confirms each of the four advisories is closed by the
   mechanism claimed, and that no new surface was opened.

## Non-goals

- **No behaviour change.** No new route, no response-body change, no status-code
  change, no copy change, no UI change. A diff that alters what a user sees is
  out of scope for this slice.
- **No new CSP directives beyond F-3.** Widening the policy for a future asset is
  a different slice (precondition §7.6).
- **Not addressing §7.4 or §7.5.** "The client never asks" (§7.4) is preserved by
  *not* adding network calls — nothing to implement. Sequential `habitId` (§7.5)
  was explicitly dispositioned as not-a-finding across three reviews; re-opening
  it here would be scope creep.
- **No push to GitHub.** A push is a rule-3 external effect and would need its own
  human approval. This slice lands locally only.
- No refactor of `dom.js` beyond the two fixes, however tempting the surrounding
  code looks.

## Constraints from `.agentic/`

- **SAFETY_INVARIANTS §6** (no sensitive content in logs) touches F-4 directly:
  the fix must not cause a habit name to be logged or echoed anywhere new.
- **SAFETY_INVARIANTS §1/§2** must be untouched — nothing here goes near the day
  cutoff or the streak math, and the diff must show that.
- **LOCAL_COMMANDS**: dependency-free Node ESM, Node 18+, no install step. The
  fixes must add **no dependency** — a package added to close a header advisory
  would be a worse trade than the advisory.
- **PROJECT_CONTEXT**: this is a headless-service-plus-browser-client seed; the
  restraint stance applies to code as well as features.

## Human-approval scan (`docs/HUMAN_APPROVAL_RULES.md`)

Run at Intake, before any implementation, per `CLAUDE.md` rule 1.

| Rule | Trips? | Reason |
|------|--------|--------|
| 1. Send / submit on behalf of a user | **No** | No send path exists or is added. |
| 2. Destructive operation on shared state | **No** | Additive edits to two files; no delete, no force-push, no remote ref. |
| 3. External-effect change via deploy / release | **No** | Tier 2, local only. **No push, no deploy** — and a push to the public repo would be a separate rule-3 stop, explicitly a non-goal above. |
| 4. Change to a safety control | **No — but considered explicitly** | See below. |
| 5. LLM into a deterministic path | **No** | No model, no adapter, no network call in build/test. |
| 6. New third-party data processor | **No** | No new data flow; no vendor. |

**On rule 4.** This slice modifies safety controls — the CSP and the rendering
boundary — so the rule was checked rather than waved past. Rule 4's enumerated
actions are all *weakening* ones: disabling an approval gate, disabling an audit
event, removing an anti-bot guard, skipping a release gate, bypassing a hook.
Every change here moves the other way: the CSP gains a directive and loses none,
`create()` gains validation it did not have, `setProp` closes a bypass, and the
JSON route gains a header. No gate is disabled, no audit event removed, no hook
bypassed, and no invariant weakened. **Rule 4 does not trip, and no approval is
required.** Recorded here so the judgment is auditable rather than implicit — and
so the Release Manager can check it rather than re-derive it.

**Result: no gated action. The run proceeds without a human stop.**

## Risks

1. **F-3 could break the app.** `require-trusted-types-for 'script'` throws in
   Chromium on any injection-sink assignment. The client is believed to use none
   (`createElement`, `createTextNode`, `replaceChildren`, `setAttribute`,
   `getElementById`), and `setAttribute("href", …)` is not a Trusted Types sink.
   But "believed" is exactly what this slice exists to stop relying on — so
   success criterion 4 makes a **live Chromium check mandatory**, not optional.
   If the app breaks, F-3 comes back out and the finding is re-dispositioned; it
   does not get "fixed" by adding `unsafe-inline` or by dropping the directive
   silently.
2. **F-2's allowlist could be wrong.** Too narrow breaks rendering; too wide is
   theatre. The implementer must derive the list from the tags `render.js`
   actually emits (the review recorded exactly eight literals, five of which
   reach the live DOM) and record the derivation in `02-impl.md`.
3. **Over-fixing.** Three of four are one-liners. The pull toward a broader
   "security pass" on `dom.js` is the main scope risk; the non-goals above exist
   to hold it.

## Stages

Compressed per EM judgment — see `## Stage compression` below.

| # | Stage | Owner | Depth |
|---|-------|-------|-------|
| 1 | Intake | Orchestrator | — |
| 2 | Implementation | Frontend Developer | standard |
| 3 | QA | QA Evidence | standard |
| 4 | Security re-gate | Security & Privacy | standard |
| 5 | Release | Orchestrator (direct) | — |
| 6 | Post-Launch | Orchestrator (direct) | — |

## Stage compression

**No Architecture stage.** `runs/browser-client/04-security.md` already *is* the
design document for this slice: it names the exact fix for F-1 (§1.3, "stringify
once"), the exact requirements for F-2 (§7.1, "require `typeof vnode.tag ===
'string'` against a tag allowlist and reject children that are neither a string
nor a well-formed vnode"), the exact directive for F-3 (§2.4), and the exact
headers for F-4 (§7.3). A tech spec here would restate a document that already
exists, at ~100k tokens. The design decisions that *are* open — the contents of
the tag allowlist, and the Trusted Types risk call — move into the Implementation
brief, which must record their derivation in `02-impl.md`. Independent
verification is not lost: QA and Security both still run, and Security is the
author of the advisories being closed.

**No PM / UX / UI stage.** No user-visible change, by design (see non-goals).
There is no user problem to research and no screen to lay out.

**One implementer, not two.** The diff spans `src/client/dom.js` (frontend) and
`src/server.js` (nominally backend). Splitting it costs a second ~130k build
stage to change four lines of header and CSP string. The Frontend Developer takes
both: they own `dom.js`, they own the CSP because it is client-delivery policy,
and precedent exists — the same role edited the static-route block in
`src/server.js` during `browser-client` (`02-impl.md`, build order §11). F-4 adds
two keys to two header objects and touches no service, no route, and no body.

**Release and Post-Launch run Orchestrator-direct.** Gate-walking is
fact-checking against artefacts that will already exist; spawning a ~100k agent
to restate them is the anti-pattern `RUN_ECONOMICS.md` §2 exists to stop. Same
call as `browser-client` and `http-layer`.

## Budget

Per `.claude/protocols/RUN_ECONOMICS.md`. Checked **before every spawn**.

- **Budget: 490k tokens.** Σ estimates (Implementation 130k build + QA 130k build
  + Security 100k review = 360k) + one build stage of headroom (130k).
- **Depth: `standard` on all three spawned stages.** Not `adversarial`: this is a
  dependency-free local seed with no users and no real data, and every finding
  being closed was already classified advisory-not-blocker by the review that
  found it. `adversarial` is earned by stakes, and `http-layer` is the recorded
  example of what inheriting it by habit costs (145% of budget).
- Had Architecture run, the budget would have been ~590k — within a hair of the
  ~600k line `RUN_ECONOMICS.md` §2 calls "the slice is too big". For a ~15-line
  diff that is the signal to compress, which is what the section above does.

## Least-privilege

**Enforced for this run.** This Orchestrator session is rooted in the product repo
(`/Users/gopalpatwa/opt/streak-seed`), so `.claude/agents/` is discoverable and
every stage is spawned as its generated agent with its `tools:` frontmatter in
force — `frontend-developer`, `qa-evidence`, and `security-privacy` are each
`Read, Write, Edit, Bash, Grep, Glob` and nothing more.

This closes the carry-forward recorded in `runs/browser-client/STATE.md`, where
the Orchestrator ran from the playbook, `.claude/agents/` was invisible to it,
and stages were spawned as general-purpose agents with briefs inlined and full
tools. That note said validating least-privilege "moves to the next slice run
from a session rooted in a product repo". This is that run.

## Rollback

Required at Tier 2. The slice is additive edits to two files with no data
migration, no schema change, and no persisted state: `git revert` of the slice's
commits restores the previous behaviour exactly. Per-fix rollback is also
independent — each of the four can be reverted without the other three, which
matters most for F-3 (see Risks 1).
