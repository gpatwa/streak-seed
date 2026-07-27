# Implementation Notes — StreakKeeper browser client

> Stage 3 (Implementation) · Owner: Frontend Developer · Slice: `browser-client`
> Implements `runs/browser-client/01-arch.md` against `runs/greenfield/04-ui.md`
> copy verbatim. Depth: standard, with the escaping boundary (§3 of the arch
> doc) implemented at the pre-authorized extra depth.

## Build order followed

Per §11 of the arch doc: `copy.js` → `render.js` (+ C1–C6) → `dom.js`
(+ C11–C14) → `index.html`/`app.css` (+ C7–C10) → `app.js`/`boot.js` → the
static route in `src/server.js` (+ C15–C19, and the S24 widening).

This document is written incrementally, section by section, as each file
lands.

## Files created

- `src/client/copy.js` — frozen `COPY` object, every string verbatim from
  `04-ui.md` §3, byte-checked against source (U+2026 ellipsis, ASCII `'`).
  Also carries `days(n)` pluralisation, the four screen-reader sentence
  builders, and the live-region announcement builder, since those are string
  *templates* rather than new copy — kept alongside the constants they
  compose so `srSentence`/live-region wiring in `render.js`/`app.js` never
  hand-assembles a sentence out of raw literals.
- `src/client/render.js` — `HabitView -> vnode`, pure. Implements all seven
  named components (`HabitRow`, `StreakFigure`, `StateTag`, `LogTodayControl`,
  `EmptyState`, `HabitDetail`, `ErrorNotice`) plus `stateOf` (the four-state
  total derivation with no clock) and `detailHref`.
- `src/client/dom.js` — the sole DOM-touching file (~65 lines incl. comments).
  `mount`, `setText`, `byId`, and the attribute allowlist with the two hard
  refusals (`on*` and non-`#/` `href`).
- `src/client/index.html` — static shell, zero interpolation. One
  `type="module" src="/boot.js"` script, one `aria-live` region, no inline
  `<script>`/`<style>`, no `on*=` attributes.
- `src/client/app.css` — all styling. No `@keyframes`, `animation`, or
  `transition`.
- `src/client/app.js` — fetch, state machine (`loading`/`load-error`/`loaded`
  × list/detail via `location.hash`), event wiring, mount calls. Exports
  `start()` plus the pure pieces (`getUserId`, `parseHash`, `findHabit`,
  `mapLogResponse`) for DOM-free unit testing.
- `src/client/boot.js` — two lines, `import { start } from "./app.js"; start();`.

## A deviation from the literal component table, and why

`01-arch.md` §2.3 tables `HabitRow(view)` and `LogTodayControl(view)` as
single-argument pure functions. I added optional trailing parameters instead:
`LogTodayControl(view, alreadyLoggedToday, onLog)`, `HabitRow(view, onLog,
inlineErrorMessage)`, `HabitDetail(view, onLog, inlineErrorMessage)`.

Rationale: the task's non-negotiables state `dom.js` is the *only* file that
touches the DOM. If `render.js`'s components took no handler and `app.js`
wired clicks by querying the mounted DOM after the fact (`root.querySelector`
+ `addEventListener`), `app.js` itself would be touching the DOM — violating
that rule. Threading the click callback through as a plain function value in
`vnode.props.on.click` (the reserved key the arch doc's own `dom.js` §3.3
already defines) keeps every `addEventListener` call inside `dom.js`, and
`render.js` stays pure — passing a function reference through untouched calls
no DOM API and reads nothing. Calling the pure unit tests do (`HabitRow(view)`
with no second argument) still works: the `on` prop is simply omitted. Every
existing behavioural rule from the arch doc (never disabled, real `<button>`,
idempotent no-op on second tap, one `on:{click}` per control) is unchanged —
only the plumbing that connects the callback gained an extra parameter.

## Files modified

- `src/server.js` — added `STATIC` (exported for the C10 test to pin against),
  `STATIC_ASSETS` (read once at import via `readFileSync`, frozen), and
  `sendStatic`. New route branch `else if (method === "GET" &&
  Object.hasOwn(STATIC, pathname))` inserted right after the `/health`
  branch, before `POST /habits`. Dispatch branch for `matched === "static"`
  inserted right after the `health` dispatch, before the `X-User-Id` check —
  static assets get the same no-identity-required carve-out `/health` already
  had.
- `test/server.test.js` — S24's log-template regex widened by exactly the
  seven `STATIC` key literals (see "The S24 widening" below).

## The S24 widening

Per §9.1 of the arch doc, this is the one existing test assertion that
changes. Before:

```
/^(GET|POST) (\/health|\/habits|\/habits\/:habitId\/completions|\(unmatched\)) \d{3} \d+ms$/
```

After — seven literal alternatives added, nothing removed, nothing turned
into a pattern:

```
/^(GET|POST) (\/health|\/habits|\/habits\/:habitId\/completions|\/|\/app\.css|\/boot\.js|\/app\.js|\/render\.js|\/dom\.js|\/copy\.js|\(unmatched\)) \d{3} \d+ms$/
```

Each new alternative is a fixed string literal that is a key of the frozen
`STATIC` table in `src/server.js` — not a pattern, and none of them can match
request-derived text (confirmed live below: a hostile query string on an
unmatched path still logs `(unmatched)` with the query bytes absent). This is
a widening, not a weakening: the property S24 exists to prove — every log
line is one of a closed set of templates, and no request data reaches a log
line — is unchanged. Test C18 additionally pins the seven new alternatives
against `Object.keys(STATIC)` directly, so the two cannot drift apart in a
future edit. I did not take the "discard which asset was requested" shortcut
the arch doc considered and rejected (§9.1) — the per-asset literals cost
nothing extra and preserve more information in the log.

## Comments had to avoid the banned tokens they describe

The banned-token scan (C8, §3.5) is a plain-text match over every file in
`src/client/`, comments included. An early draft of `dom.js`, `render.js`,
and `app.css` had doc-comments *naming* the forbidden APIs, the forbidden
clock constructor, and the forbidden motion properties for explanatory
purposes — which the scan (and the CSS-motion scan, C7) would themselves have
flagged. Rewrote those comments to describe the rule without spelling the
banned identifiers. Confirmed clean by running the same regex from §3.5 over
`src/client/*` by hand before writing the test file, so C8/C7 were not a
surprise later.

## Verify — commands with real output

```
$ npm run typecheck
> streak-seed@0.1.0 typecheck
> for f in $(find src scripts -type f \( -name '*.js' -o -name '*.mjs' \)); do node --check "$f" || exit 1; done; echo "typecheck ok"
typecheck ok

$ npm run build
> streak-seed@0.1.0 build
> node scripts/build-check.mjs
build ok

$ npm run test   (via npm run qa:mvp — typecheck ok, then the full suite)
✔ C11: mounting a row for a hostile name produces exactly one matching createTextNode, zero tainted setAttribute calls, and never touches an html-parsing sink
✔ C12: setProp throws for on* names (any case) and for any name outside the allowlist
✔ C13: href throws for non-#/ schemes and accepts an in-app hash route
✔ C14: on:{click:fn} calls addEventListener; on:{click:'alert(1)'} throws
✔ setText replaces content with exactly one createTextNode carrying the given text
✔ byId delegates to document.getElementById
✔ C1 (client-render): copy byte-equals the 04-ui.md §3 table, including U+2026 and ASCII apostrophes
✔ C2: all seven visible states render with correct copy, tag presence, and log-control label
✔ C2b: not-started and broken differ only by tag and longest-streak value
✔ C3 (client-render): pluralisation through a rendered figure, not just the helper
✔ C4: hostile habit names never reach a tag, a prop value, or an html-carrying key
✔ C5 (client-render): the four fixed-field-order sentences render verbatim, plus the live-region string
✔ C6: a never-existed id and a foreign (absent-from-list) id render deep-equal trees
✔ C6b: mapLogResponse maps two 404s with DIFFERENT bodies to the same {kind:'gone'}, body never read
✔ C6c: parseHash and detailHref round-trip
✔ C15: GET / -> 200 html, no-store, nosniff, CSP without unsafe-inline/unsafe-eval, byte-equal body
✔ C16: every declared static path serves its declared content type, and traversal/negative paths all 404
✔ C17: static assets serve 200 without X-User-Id, and are byte-identical for two different user ids
✔ C18: every static hit logs a template drawn from exactly the STATIC keys, hostile query still logs (unmatched)
✔ C19: /health, GET|POST /habits, the completions 404 non-oracle, and the 413 path are unaffected
✔ C7 (client-static): app.css has zero @keyframes, animation, or transition
✔ C8 (client-static): the banned-token regex matches zero times across every file in src/client/
✔ C9 (client-static): index.html has only src-only module scripts, no on*=, no style=, exactly one aria-live region
✔ C10 (client-static): every STATIC key maps to a file that exists, and every src/client/ file is reachable through exactly one key
... [S1–S31, T1–T12, H1–H3, plus streak.test.js's own pre-existing C1–C10 for dayIndex — all pass] ...
ℹ tests 81
ℹ pass 81
ℹ fail 0
ℹ duration_ms 330.687667
```

Note on test names: `streak.test.js` already used `C1`–`C10` for pre-existing
`dayIndex` clock-guard tests before this slice. The new client test files
independently use `C1`–`C19` per the arch doc's own naming (§10). Node's test
runner does not require globally unique test titles, so this collides only
in display, never in execution — both suites' full 81 tests ran and passed.
Flagging it rather than silently renaming either side, since the arch doc's
C-numbering is normative for the new files.

## Real request transcript (server started, fetched, killed)

```
$ PORT=3911 node src/server.js &
streak-seed listening on 127.0.0.1:3911

$ curl -sD - -o /tmp/index_body.html http://127.0.0.1:3911/
HTTP/1.1 200 OK
content-type: text/html; charset=utf-8
content-length: 481
cache-control: no-store
x-content-type-options: nosniff
content-security-policy: default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'

$ diff /tmp/index_body.html src/client/index.html
(no output — IDENTICAL)

$ curl -sD - -o /dev/null http://127.0.0.1:3911/app.js | grep -i content-type
content-type: text/javascript; charset=utf-8
x-content-type-options: nosniff

$ curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:3911/app.js
404

$ for p in /app.css/../server.js /%2e%2e/server.js /../src/server.js /client/app.js /app.js%00.txt /APP.JS; do
    curl -s -o /dev/null -w "$p -> %{http_code}\n" "http://127.0.0.1:3911$p"; done
/app.css/../server.js -> 404
/%2e%2e/server.js -> 404
/../src/server.js -> 404
/client/app.js -> 404
/app.js%00.txt -> 404
/APP.JS -> 404
```

### Live escaping check — a real habit created through the API, rendered through the real pipeline

```
$ curl -s -X POST http://127.0.0.1:3911/habits \
    -H "x-user-id: escape-check" -H "content-type: application/json" \
    -d '{"name":"<img src=x onerror=alert(1)>"}'
{"habit":{"habitId":"habit_1","name":"<img src=x onerror=alert(1)>","currentStreak":0,"longestStreak":0,"atRisk":false,"lastCompletedDate":null}}

$ curl -s http://127.0.0.1:3911/habits -H "x-user-id: escape-check"
{"habits":[{"habitId":"habit_1","name":"<img src=x onerror=alert(1)>", ...}]}
```

Then, in a Node script, fetched that exact response, ran it through the real
`render.js` (`HabitRow(view)`) and `dom.js` (`mount(root, vnode)`) against a
hostile stub `document` whose `innerHTML` setter throws:

```
Raw name from API: "<img src=x onerror=alert(1)>"
Name appears as a text-node child only, never in a prop value: true
Text nodes created during real mount(): [
 "<img src=x onerror=alert(1)>. Current streak 0 days. Longest streak 0 days. Not started yet.",
 "<img src=x onerror=alert(1)>",
 "Current streak", "0 days", "Longest streak", "0 days",
 "<img src=x onerror=alert(1)>",
 "Log today",
 " <img src=x onerror=alert(1)>"
]
Hostile name present as a plain text node: true
```

The `innerHTML` trap never fired — `mount()` never reached for it. This is
the same assertion C4/C11 make, exercised here end-to-end against a live
server response instead of a synthetic fixture, confirming C4 genuinely
asserts *text*, not merely the absence of a JS-executing alert.

```
$ kill 26450   # the PORT=3911 server
$ curl -s -o /dev/null -w "%{http_code}" --max-time 1 http://127.0.0.1:3911/health
000  (connection refused — server confirmed down)
```

No server was left running.

## Deviations from the arch doc, summarized

1. **Component signatures gained optional trailing parameters**
   (`onLog`, `inlineErrorMessage`) beyond the single-arg table in §2.3 — see
   "A deviation from the literal component table" above. Rationale: keeps
   `dom.js` as the sole DOM-touching file, which is a stronger, non-negotiable
   requirement than the table's literal arity.
2. **`copy.js` carries more than the 17 constant strings** — it also owns
   `days(n)`, the four `sr*` sentence builders, and `liveLogAnnouncement`,
   which the arch doc's §6.1 table lists as copy values with `{n}`/`{m}`
   placeholders but doesn't specify where the template-filling code should
   live. Kept them in `copy.js` rather than `render.js` so every string
   destined for the screen — including its templated form — stays in the one
   file C1 checks, per the arch doc's own stated goal ("no string literal
   destined for the screen appears anywhere else in the client").
3. **`ErrorNotice` renders with `role="alert"`** — not specified either way
   in the arch doc; `role` is already in `dom.js`'s `ALLOWED_PROPS`, so this
   is additive and harmless, not a bypass of anything.
4. **A 404 from the log-completion POST removes that habit from the client's
   in-memory list** rather than setting a separate "not found" flag — this
   makes list and detail agree for free (§4.1's non-oracle) without a second
   piece of state that could go stale or drift from the list. Not specified
   by the arch doc at this level of detail; consistent with §4's "the client
   has exactly one source of habit existence."

None of these touch the escaping boundary, the CSP, the static route table,
or the S24 widening — the security-relevant surfaces are implemented exactly
as specified.

## Rollback

One line: delete the seven entries from the `STATIC` table (or the one
`else if (matched === "static")`/`Object.hasOwn(STATIC, pathname)` branch
pair) in `src/server.js` — every asset path then 404s again and the JSON API
is byte-identical to pre-slice, per the arch doc's §9 surgical rollback plan.

## Rework — QA round 1 (focus restoration)

QA (`03-qa.md` §8, verdict FAIL) found that focus is lost after logging: `mount()`
does an unconditional `parent.replaceChildren(create(vnode))` on every render,
tearing down the just-clicked log-control button, and nothing re-focused its
replacement, so `document.activeElement` reverted to `<body>` — a violation of
`01-arch.md` §7.2 ("After logging, focus stays on the control. Nothing steals
focus — no toast, modal, or scroll-into-view.") and `runs/greenfield/04-ui.md`
§4 ("After logging, focus stays on the same control; nothing steals focus to
a toast, modal, or animation.").

### What changed

- **`src/client/render.js`** — added `logControlId(habitId)` (`` `log-${habitId}` ``),
  a small pure helper exported alongside the other pieces, and gave
  `LogTodayControl` an `id` prop built from it. `habitId` is server-assigned
  (never the untrusted display name), so no new escaping concern; `id` was
  already in `dom.js`'s `ALLOWED_PROPS` and goes through `setAttribute`, not a
  markup path. Both `HabitRow` and `HabitDetail` render through
  `LogTodayControl`, so the id — and the fix — applies in both list and
  detail view, matching how QA reproduced the defect in both.
- **`src/client/dom.js`** (the only file that touches the DOM, unchanged as
  an invariant) — added one exported function:
  ```js
  export function restoreFocus(preferredId, fallback) {
    const preferred = preferredId ? byId(preferredId) : null;
    (preferred ?? fallback)?.focus();
  }
  ```
  This is the only DOM call added (`.focus()`, via the existing `byId`/
  `document.getElementById` path already used elsewhere in this file).
- **`src/client/index.html`** — added `tabindex="-1"` to `<main id="app">`,
  making the app landmark programmatically focusable (but not tab-stoppable)
  as the fallback landing spot described below. No inline script/style, so
  C9 is unaffected.
- **`src/client/app.js`** — imports `logControlId` and `restoreFocus`. Added
  one helper inside `start()`:
  ```js
  function renderAndRestoreFocus(focusHabitId) {
    render();
    restoreFocus(focusHabitId ? logControlId(focusHabitId) : null, root);
  }
  ```
  and replaced the three `render()` calls inside `handleLog`'s post-request
  branches (`"gone"`, `"failed"`, success, and the `catch`) with
  `renderAndRestoreFocus(...)`. `render()` calls elsewhere (initial paint,
  `hashchange`) are untouched — this fix is scoped to the log flow, which is
  the only place the spec makes a focus claim and the only place QA found a
  defect.

### Where focus goes, and why

- **Normal case (success, failed, or a caught fetch error):** the habit's row
  still exists after the render, so focus goes back to
  `logControlId(habitId)` — the *same logical control*, re-resolved by id
  after the remount, not the destroyed node (which no longer exists and
  can't be refocused).
- **The "gone" case (404 — the habit was deleted or never existed):** the row
  disappears from the list entirely, so there is no control left to
  refocus. Per the task's instruction to "focus something sensible and
  predictable rather than nothing," focus falls back to `#app` (the `<main>`
  landmark, now `tabindex="-1"`). This means a screen reader announces the
  main landmark again — not ideal, but predictable and never `<body>`/lost
  context, and it only fires on an edge case (concurrent deletion) rather
  than the common path QA exercised.

### Regression test, and the non-vacuous proof

Added to `test/client-dom.test.js` (the file that already exercises `dom.js`
against a hostile stub `document`). The stub needed two additions to make the
test meaningful rather than trivially green: (1) elements now track `.focus()`
and the stub gained `doc.activeElement`, defaulting to a `doc.body` stand-in;
(2) `getElementById` now resolves against a real registry of ids that were
actually `setAttribute`'d (only for elements built via `create()` — the
pre-existing ad hoc `getElementById("app")`/`("live-region")` root-container
fabrication used by every other test in the file is untouched), and
`replaceChildren` unregisters ids and resets `activeElement` to `body` when
the currently-focused node's subtree is torn down — modeling the exact
browser behavior QA's live probe observed
(`activeElement: BODY` after the click). One subtlety handled explicitly: since
`mount()` evaluates `create(vnode)` (which can re-register the *same* id on a
*new* element) before calling `replaceChildren`, the stub's cleanup only
deletes a registry entry if it still points at the specific old element being
removed — otherwise a normal same-id re-render would falsely wipe out the
just-registered replacement.

Three new tests:

1. **`regression: mount() alone loses focus to <body>...`** — reproduces the
   defect itself with no fix involved: focuses a control, remounts, asserts
   `activeElement === doc.body`. This documents the QA-confirmed root cause
   and would have failed before this rework (there was no code path that
   could have prevented it).
2. **`regression: restoreFocus() puts focus back on the re-rendered
   control's replacement...`** — same setup, then calls `restoreFocus(
   "log-habit_1", root)` and asserts `activeElement` is the *new* button
   object (`notEqual` to the destroyed old one).
3. **`regression: restoreFocus() falls back to a predictable landing
   spot...`** — remounts to a tree with no matching id (the "gone" case),
   asserts `getElementById` genuinely returns `null` first, then asserts
   `restoreFocus` lands on the given fallback.

**Non-vacuity, proven by deliberately breaking the real fix (not a scratch
copy this time, since the target is app-level wiring, not the escaping
boundary):**

```
$ npm test   # before breaking anything — baseline
ℹ tests 84
ℹ pass 84
```

Edited `src/client/dom.js`'s `restoreFocus` in place to a no-op:

```js
export function restoreFocus(preferredId, fallback) {
  // TEMPORARY BREAK for non-vacuity proof (QA round 1 rework) — restored immediately after.
}
```

```
$ npm test
✔ regression: mount() alone loses focus to <body>...                          (unaffected — doesn't call restoreFocus)
✖ regression: restoreFocus() puts focus back on the re-rendered control's replacement, not the stale destroyed node
  AssertionError: restoreFocus must move focus to the NEW node sharing the control's id
✖ regression: restoreFocus() falls back to a predictable landing spot when the control's row no longer exists after the render
  AssertionError: must land on the given fallback, not silently stay lost at <body>
```

Both tests that actually exercise the fix failed with the expected assertion
messages the moment the fix was disabled — confirming they are not vacuous
(they don't pass regardless of whether the fix exists). Then restored
`restoreFocus` to its real implementation (shown above) and re-ran every gate
clean:

```
$ npm run typecheck
typecheck ok

$ npm test
ℹ tests 84
ℹ pass 84
ℹ fail 0

$ npm run build
build ok

$ npm run qa:mvp
ℹ tests 84
ℹ pass 84
ℹ fail 0
```

`grep -rn "innerHTML|console\.|\bDate\b" src/client/` → no matches; no banned
token was introduced. `dom.js` remains the only file in the client that calls
a `document.*`/DOM-instance API — the one new DOM call (`.focus()`) lives
there, reached through the existing `byId` path.

### Scope note

This rework is deliberately narrow (smoke depth, per instructions): it fixes
only the focus-loss defect QA reported, adds one regression test file's worth
of coverage for it, and does not touch the escaping boundary, copy, S24, the
non-oracle, or any of the other surfaces QA already passed. `handleLog`'s
`render()` calls outside the log flow (initial paint, `hashchange`) are
intentionally left alone — the spec makes no focus claim there and QA found
no defect there.
