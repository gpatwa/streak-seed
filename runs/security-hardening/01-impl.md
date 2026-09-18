# Implementation — security-hardening

> Stage 2 (Implementation) · Owner: Frontend Developer · Slice: `security-hardening`
> Depth: **standard**. Design spec: `runs/browser-client/04-security.md` §1.3 (F-1),
> §1.4 (F-2), §2.4 (F-3), §3.1 (F-4), §7 (preconditions 1–3). No Architecture
> stage ran for this slice — that document already prescribes each fix.

This artefact is written incrementally, fix by fix, as each lands and its test
is verified fail-first. Nothing here is written after the fact.

## Baseline

`npm test` before any change: **84/84 passing**, 0 failing. (Full output at the
bottom of this document, under Gates.)

---

## F-1 — `setProp` stringifies `href` twice (`src/client/dom.js`)

### The fix

Stringify once, validate and set the same value, per §1.3's recommendation
verbatim (`src/client/dom.js`, `setProp`):

```js
const v = String(value);
if (name === "href" && !v.startsWith("#/")) {
  throw new TypeError("href must be an in-app hash route");
}
el.setAttribute(name, v);
```

### Test — `test/client-dom.test.js` C20

Added `C20: a stateful toString cannot defeat the href guard — setProp must
validate and set the same stringification`. The probe's `toString` returns
`"#/ok"` on its first call (the guard's stringification) and
`"javascript:alert(1)"` on every call thereafter (the set site's, if a second,
independent stringification exists). The assertion checks the actual value
delivered to `setAttribute("href", …)` equals `"#/ok"` — the same value that
was validated.

**Fail-first, verified by reverting the source change** (`git stash push --
src/client/dom.js`, re-run, `git stash pop`):

```
✖ C20: a stateful toString cannot defeat the href guard — setProp must validate and set the same stringification (0.798708ms)
  AssertionError [ERR_ASSERTION]: setProp must set the SAME stringification it validated — a stateful toString must not be able to deliver a second, hostile value
  + actual - expected

  + 'javascript:alert(1)'
  - '#/ok'
```

Against the unfixed code the guard evaluates `String(value)` once to pass
validation (`"#/ok"`, satisfies `startsWith("#/")`) and a second,
independently-computed `String(value)` to set the attribute
(`"javascript:alert(1)"`) — the bypass is silent, no exception, exactly as
§1.3 describes. After the fix: 1 call to `setProp`, 1 stringification, 1
`setAttribute("href", "#/ok")`, no hostile value ever produced.

`test/client-dom.test.js` full run after the fix: 10/10 passing (see Gates
below for the full-suite run).

---

## F-2 — `create()` does not validate `vnode.tag` (`src/client/dom.js`)

### Design call 1 — deriving the tag allowlist

The brief and §1.4 both say to derive the allowlist from what the pipeline
actually emits, not to guess or pad it. I read `src/client/render.js` and
`src/client/app.js` (the only two files that construct a vnode literal — a
`{tag, props, children}` object or an `h(tag, …)` call — anywhere reachable by
`dom.js`'s `create()`), and enumerated every literal `tag` string.

**`src/client/render.js`** — every `h("...", …)` call site:

```
$ grep -n 'h("' src/client/render.js | grep -oE 'h\("[a-z0-9]+"' | sort -u
h("a"
h("button"
h("div"
h("h1"
h("h2"
h("li"
h("p"
h("span"
```

Eight literal tags: `a, button, div, h1, h2, li, p, span`.

**`src/client/app.js`** — the two places `app.js` builds a vnode object
literal directly, bypassing `render.js`'s `h()` helper (both go through the
same `mount()` → `create()` path, so `create()` sees them too):

```
line 60: mount(root, { tag: "p", props: { class: "loading" }, children: [COPY.loading] });
line 87: mount(root, { tag: "ul", props: { class: "habit-list" }, children: rows });
```

`p` is already in the `render.js` set; `ul` is new. Union across both files:
**nine** literal tags — `a, button, div, h1, h2, li, p, span, ul`.

**Note on the number in `04-security.md` §1.1/§1.4.** That review recorded a
*live-DOM-observed* set of eight tags (`li, span, a, button, div, h1, p, ul`)
from one probe scenario, which happened to always have at least one habit
present. That scenario never hit `EmptyState()` (`render.js`, only rendered
when `state.habits.length === 0`), which is the sole producer of `h2`. Their
"eight literal tags" is therefore the live-traffic-observed set for that run,
not the full static set the source can produce. `h2` was never wrong or
unsafe in their analysis — it just wasn't exercised by their specific
scenario (no seeded user ever had zero habits). Building the allowlist from
only what one browser session happened to render, rather than from the full
source, would make the empty-habits screen throw in production — a real
behaviour break, and exactly the kind of gap the brief warns against ("too
narrow breaks rendering"). So the allowlist below is nine tags, derived from
both files, not eight.

`ul` is likewise legitimate: it is a real, static, author-written literal in
`app.js`, not a data-derived tag — it just isn't in `render.js`.

### Design call — children validation

Per §7.1 verbatim: `create()` must require `typeof vnode.tag === "string"`
against the allowlist, and reject children that are neither a string nor a
"well-formed vnode." A well-formed vnode, minimally and matching what `h()`
always produces, is a non-null object carrying a `tag` (validated recursively
by the same `create()` call, since children are rendered via a recursive
`create(child)` call already) — so the child check only needs to reject a
child that is not a string AND not an object (or is `null`/an array, which
`typeof x === "object"` would otherwise wrongly admit). This preserves the
existing fail-closed behaviour the review called out as "genuinely good": a
`null`, a number, or an array child must still throw loudly, not render
silently. `Array.isArray` is checked explicitly because `typeof [] ===
"object"` would otherwise let an array through to `create()`, where it has no
`.tag` and would throw a *different*, less clear error — checking it here
keeps the error message accurate ("vnode" vs. array).

### The fix

```js
const ALLOWED_TAGS = new Set(["a", "button", "div", "h1", "h2", "li", "p", "span", "ul"]);

function create(vnode) {
  if (typeof vnode.tag !== "string" || !ALLOWED_TAGS.has(vnode.tag)) {
    throw new TypeError("tag not allowed");
  }
  const el = document.createElement(vnode.tag);
  for (const [k, v] of Object.entries(vnode.props ?? {})) setProp(el, k, v);
  for (const child of vnode.children ?? []) {
    if (typeof child === "string") {
      el.appendChild(document.createTextNode(child));
      continue;
    }
    if (child === null || Array.isArray(child) || typeof child !== "object") {
      throw new TypeError("child must be a string or a vnode");
    }
    el.appendChild(create(child));
  }
  return el;
}
```

A malformed child that happens to be a well-formed-looking object (e.g. one
whose `tag` is `"script"`) is still caught — it recurses into `create(child)`,
which re-runs the same tag check and throws there.

### Test — `test/client-dom.test.js` C21 / C21b

**C21** asserts every constructible-but-forbidden tag the review probed
(`script, iframe, object, embed, base, link, meta, style`) now throws, and
every one of the nine legitimate tags derived above still constructs without
error.

**C21b** asserts: an object with no `.tag` at all is rejected as a malformed
child; a vnode-shaped child whose own `tag` is `"script"` is rejected (via the
recursive re-check); and the existing fail-closed behaviour for `null` /
`42` / `[]` children survives.

**Fail-first, verified against the pre-fix code** (ran before the fix was
written, i.e. with the old unvalidated `create()`):

```
✖ C21: create() throws for a constructible-but-forbidden tag, and still constructs every tag render.js/app.js legitimately emit (0.445209ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception (TypeError): expected create() to reject tag "script"

✖ C21b: create() rejects a malformed child (not a string, not a well-formed vnode) while still failing closed on null/number/array children (0.142208ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception (TypeError): expected create() to reject a childless-tag object as a malformed child
```

Both new tests failed against the unfixed code — `create("script", ...)`
constructed without error, and a childless malformed object silently rendered
as `<undefined>` rather than throwing. **A finding worth being honest about**:
before this fix, the "existing fail-closed" premise held only for a `null`
child (`null.tag` throws natively); a bare `42` or `[]` child did *not*
already throw — `(42).tag`/`([]).tag` is `undefined`, and
`document.createElement(undefined)` coerces to the (syntactically valid) tag
name `"undefined"` and silently constructs an `<undefined>` element with no
exception, in both this repo's DOM stub and a real browser. The brief's
"preserve the existing fail-closed behaviour" is therefore honored by the
fix, not by the pre-existing code — after F-2, all three (`null`, `42`, `[]`)
throw, `null` for the same pre-existing reason and `42`/`[]` newly, as a
side-effect of the tag-allowlist check now running before `createElement`.

After the fix, all 12 tests in `test/client-dom.test.js` pass (see Gates).

---

## F-3 — no `require-trusted-types-for 'script'` in `HTML_CSP` (`src/server.js`)

### The fix

One directive appended, per §2.4 and the slice plan's non-goal ("no other
directive, none removed"):

```js
const HTML_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; " +
  "img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; " +
  "require-trusted-types-for 'script'";
```

### Test — `test/client-server.test.js` C22

`C22: GET / serves a CSP containing require-trusted-types-for 'script'`
asserts the new directive is present on the `/` response, and separately
asserts every one of the eight pre-existing directives is still present
byte-for-byte — a regression guard against the non-goal ("no other directive
added, none removed").

**Fail-first, verified before the fix was applied:**

```
✖ C22: GET / serves a CSP containing require-trusted-types-for 'script' (0.941166ms)
  AssertionError [ERR_ASSERTION]: CSP missing require-trusted-types-for 'script': default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

After the fix, `test/client-server.test.js` is 6/6 passing (see Gates).

### Design call 2 — the Trusted Types risk assessment

I cannot run a browser (Read/Write/Edit/Bash/Grep/Glob is my tool boundary, no
browser tools) — this is a **static-analysis prediction**, and the slice plan
is explicit that a **live Chromium check is QA's job**, not mine. I did not
verify this live, and I am not claiming to.

`require-trusted-types-for 'script'` makes the browser throw on assignment to
any **injection sink** — the DOM properties/methods whose argument the HTML
spec's Trusted Types integration treats as potentially-executable markup or
script (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `Document.write`,
`Document.writeln`, `<script>.src`/`.text`/`.textContent`/`.innerText`,
`<iframe>.srcdoc`, `Element.setAttribute` for a handful of specific
event-handler-content-attributes, `eval`, `Function`, `setTimeout`/
`setInterval` with a string body) — when a plain string (not a `TrustedHTML`/
`TrustedScript`/`TrustedScriptURL` object) is assigned.

I grepped every DOM-touching call in the client (the two files that touch
`document`/`el`/`location`/`localStorage`: `src/client/dom.js`, the sole
DOM-touching module by design, and `src/client/app.js`, which touches
`localStorage`, `location.hash`, and `fetch` but no DOM node directly).
Enumerating every call against the Trusted Types sink list:

| Call | File | Trusted Types sink? |
|---|---|---|
| `document.createElement(tag)` | `dom.js` | No — takes a tag name, not markup/script. |
| `document.createTextNode(text)` | `dom.js` (×2 call sites) | No — always produces a `Text` node; the spec explicitly does not treat this as a sink, which is the entire reason `dom.js`'s design routes every untrusted string through it. |
| `el.setAttribute(name, v)` | `dom.js` `setProp` | No, **for the attributes this client ever sets.** `setAttribute` is a sink *only* for a small set of event-handler-content attributes (e.g. `onclick`) and certain `<script>`/`<iframe>` attributes when the element+attribute pair matches the spec's sink table. `setProp`'s own allowlist (`class, id, type, role, hidden, tabindex, lang, aria-hidden, aria-live, aria-atomic, aria-label, href`) contains none of those — `href` is explicitly *not* a sink (confirmed in `04-security.md` §1.3, "`setAttribute("href", …)` is not a Trusted Types sink," and independently: `href` is a URL attribute, not a script/markup attribute, and Trusted Types' `setAttribute` interception is keyed on `(tagName, attributeName)` pairs like `(script, src)`, `(iframe, srcdoc)`, `(*, onclick)` — none of which any element/attribute pair in `ALLOWED_PROPS` can express, since `/^on/i` is rejected before the allowlist check even runs). |
| `el.appendChild(node)` | `dom.js` `create`, `mount` | No — takes a `Node`, not a string; not in the sink list at all. |
| `parent.replaceChildren(...)` | `dom.js` `mount`, `setText` | No — same shape as `appendChild`, takes `Node`s/strings-as-text, not markup. (Trusted Types does not intercept `replaceChildren`; it is not a markup-parsing API.) |
| `document.getElementById(id)` | `dom.js` `byId` | No — a read, not a write to any sink. |
| `el.focus()` | `dom.js` `restoreFocus` | No — takes no string argument at all. |
| `el.addEventListener(ev, fn)` | `dom.js` `setProp`'s `on` handling | No — `fn` is asserted `typeof fn === "function"` before this call (line 21); Trusted Types only intercepts a *string* passed where a callback is expected (the old `setTimeout("code")`-style coercion), never a real function reference. |
| `localStorage.getItem` | `app.js` | No — a read. |
| `location.hash` | `app.js` | No — a read (`parseHash`); nothing in the client ever assigns to `location.href`/`.hash`/etc. with untrusted data — the only navigation the client performs is via `<a href="#/...">` markup rendered through the already-audited `href` allowlist above, not a script-level assignment. |
| `fetch(url, opts)` | `app.js` | No — `fetch` is not a Trusted Types sink; only `Request`'s / `<script src>`-style resource-URL sinks are, and `fetch`'s URL argument accepts `TrustedScriptURL` only for **module-worker**-style specifiers, not plain fetch (and even where the browser's tightest profile does intercept it, the URL here is a same-origin literal string built with `encodeURIComponent`, never a `javascript:`/markup value). |

**Conclusion (prediction, not verified live): zero sinks.** Every DOM write
in `dom.js` — the sole DOM-touching module — goes through `createElement`
(tag-name argument), `createTextNode` (explicitly non-sink), `setAttribute`
restricted to a closed allowlist that excludes every sink-eligible
attribute/element pair, `appendChild`/`replaceChildren` (`Node` arguments,
not markup), and `addEventListener` with a function-typed, pre-validated
callback. `require-trusted-types-for 'script'` should not throw anywhere in
this client, on any of the flows the app exercises today (loading, empty
state, list, detail, log success, log failure, log 404, hash navigation).

**This is a static-analysis prediction. Live Chromium verification —
navigating the real app with the new CSP active and confirming no
`SecurityPolicyViolation` fires and every state still renders — is QA's job
per the slice plan (success criterion 4), not mine, and I did not perform
it.**

---

## F-4 — JSON responses omit `nosniff`/`charset` (`src/server.js` `send`/`sendAndClose`)

### The fix

Matches `sendStatic`'s existing style (`"x-content-type-options": "nosniff"`)
rather than inventing a new one, per the brief. No status code, no body, no
other header changed.

```js
function send(res, status, obj) {
  const payload = JSON.stringify(obj);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
    "x-content-type-options": "nosniff",
  });
  res.end(payload);
}

function sendAndClose(res, status, obj) {
  const payload = JSON.stringify(obj);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
    "x-content-type-options": "nosniff",
    connection: "close",
  });
  res.end(payload);
}
```

### SAFETY_INVARIANTS §6 check

§6 forbids habit names or other free text reaching a log. This change touches
only response *headers* and the `content-type` value; it does not read,
construct, or forward any request/response body content into `log()`, and
`log()`'s call sites (`finish(status)`) are untouched by this diff. No new
echo path was introduced. Verified by inspection of the diff (two header-map
literals) — nothing here reads `obj` for any purpose other than the existing
`JSON.stringify(obj)`/`Buffer.byteLength(payload)` calls that already existed.

### Test — `test/server.test.js` S32 / S32b

**S32** asserts a normal `POST /habits` 201 response carries
`content-type: application/json; charset=utf-8` and
`x-content-type-options: nosniff`, and that the status code (201) and body
shape are unchanged. **S32b** asserts the same on the `sendAndClose` 413 path,
plus that the body is byte-identical to the pre-existing constant.

**Fail-first, verified before the fix was applied:**

```
✖ S32: send() JSON responses carry x-content-type-options: nosniff and a charset=utf-8 content-type
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  + 'application/json'
  - 'application/json; charset=utf-8'

✖ S32b: sendAndClose() (the 413 path) also carries nosniff and a charset=utf-8 content-type
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  + 'application/json'
  - 'application/json; charset=utf-8'
```

After the fix, `test/server.test.js` is 33/33 passing (see Gates).

---

## Gates

All commands run from the repo root after all four fixes landed. Real output,
not a summary.

### `npm run typecheck`

```
> streak-seed@0.1.0 typecheck
> for f in $(find src scripts -type f \( -name '*.js' -o -name '*.mjs' \)); do node --check "$f" || exit 1; done; echo "typecheck ok"

typecheck ok
```

### Targeted tests first (`node --test test/client-dom.test.js test/client-server.test.js test/server.test.js`) — 51/51

```
ℹ tests 51
ℹ suites 0
ℹ pass 51
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

(Individual lines for C20, C21, C21b, C22, S32, S32b all shown passing above,
in each fix's own section.)

### `npm test` (full suite) — 90/90

```
> streak-seed@0.1.0 test
> node --test
...
ℹ tests 90
ℹ suites 0
ℹ pass 90
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 324.2175
```

84 baseline + 6 new (C20, C21, C21b, C22, S32, S32b) = 90, zero failures. Meets
success criterion "no fewer than the 84 tests... today" with margin, and the
brief's "≥ 84 plus your new tests, with zero failures."

### `npm run build`

```
> streak-seed@0.1.0 build
> node scripts/build-check.mjs

build ok
```

### `npm run qa:mvp`

```
> streak-seed@0.1.0 qa:mvp
> npm run typecheck && npm run test

> streak-seed@0.1.0 typecheck
> for f in $(find src scripts -type f \( -name '*.js' -o -name '*.mjs' \)); do node --check "$f" || exit 1; done; echo "typecheck ok"

typecheck ok

> streak-seed@0.1.0 test
> node --test
...
ℹ tests 90
ℹ pass 90
ℹ fail 0
```

All four gates pass.

---

## Scope check

`git diff --stat`:

```
 src/client/dom.js          | 31 +++++++++++----
 src/server.js               |  9 +++--
 test/client-dom.test.js     | 96 ++++++++++++++++++++++++++++++++++++++++++++++
 test/client-server.test.js  | 27 +++++++++++++
 test/server.test.js         | 30 +++++++++++++++
 5 files changed, 182 insertions(+), 11 deletions(-)
```

Two source files touched — exactly `src/client/dom.js` (F-1, F-2) and
`src/server.js` (F-3, F-4) — and three test files, matching the fixes'
locations. `src/services/streak.js`, `habits.js`, and `audit.js` are
untouched. No new route, no response-body shape change, no status-code
change, no copy change, no UI change: every diff above is either a validation
addition that throws on inputs the client never legitimately produces, or a
response-header addition. No dependency was added (`package.json` untouched,
confirmed by `git status`/`git diff` showing no `package.json` or
`package-lock.json` change).

---

## SAFETY_INVARIANTS re-check

- §1/§2 (day cutoff, streak math): untouched — no file in
  `src/services/streak.js`/`habits.js`/`audit.js` appears in this diff.
- §3 (no guilt/loss-aversion mechanics): not implicated — no product feature
  added.
- §4 (user-scoped access): not implicated — no change to routing or identity.
- §5 (idempotent logging): not implicated.
- §6 (no sensitive content in logs): explicitly re-checked for F-4 above; the
  header/content-type change does not read or forward any body content into
  `log()`.
- §7 (loopback bind only): untouched — `createStreakServer().listen(port,
  host, …)` at `src/server.js:396` is unchanged by this diff, confirmed by the
  diff above showing no change near that line, and by `S29`/`S30` (loopback
  pinning tests) passing unmodified.

None weakened.

---

## Open design calls — summary

1. **F-2 allowlist**: nine tags (`a, button, div, h1, h2, li, p, span, ul`),
   derived by reading `render.js`'s eight `h()` call sites plus `app.js`'s two
   inline vnode literals (`p`, `ul` — `ul` not otherwise in `render.js`). See
   the F-2 section above for the full derivation and the note on why this
   differs by one tag (`h2`) from the security review's own live-observed set.
2. **F-3 Trusted Types risk**: static-analysis table of every DOM API call in
   the client against the Trusted Types sink list — zero sinks found, stated
   as a prediction. **Live Chromium verification is QA's job**, not done here.

---

## What was not done

- No live browser verification of F-3 (Trusted Types) — by design, outside
  this role's tool boundary (no browser tool) and explicitly assigned to QA
  by the slice plan (success criterion 4).
- No push, no commit — left in the working tree per the slice plan's non-goal
  and this role's constraints.
- No change beyond the four fixes — `dom.js`'s surrounding code (e.g. the
  `on` prop's per-event-name looseness, noted as "correct and harmless" by
  the review) was left alone, per the non-goals.

---

## Handoff to QA

**No commit was made** (per the slice's explicit non-goal and this role's
constraint) — all changes are in the working tree, uncommitted. QA should
work from the working tree directly, not from a SHA.

**Files changed:**
- `src/client/dom.js` — F-1 (single stringification in `setProp`), F-2 (tag
  allowlist + child validation in `create`)
- `src/server.js` — F-3 (`require-trusted-types-for 'script'` in `HTML_CSP`),
  F-4 (`nosniff` + `charset=utf-8` in `send`/`sendAndClose`)
- `test/client-dom.test.js` — added C20 (F-1), C21 + C21b (F-2)
- `test/client-server.test.js` — added C22 (F-3)
- `test/server.test.js` — added S32 + S32b (F-4)

**Targeted tests added:** C20, C21, C21b, C22, S32, S32b — all verified
fail-first against the pre-fix source (see each fix's section above for the
actual failure output), all passing after the fix.

**What to spot-check:**
1. **F-3 live Chromium verification is the one open item this role could not
   do** — start the server, load `/` with DevTools open, confirm no
   `SecurityPolicyViolation` fires for `require-trusted-types-for 'script'`
   across every UI state (loading, empty, list, detail, log success, log
   failure/404, hash navigation) — this is success criterion 4 of the slice
   plan and the risk explicitly flagged in the slice plan's Risks §1.
2. Confirm the F-2 allowlist derivation in this document against the actual
   `render.js`/`app.js` source — nine tags, not eight; the discrepancy from
   the security review's own count is explained above and worth an
   independent look.
3. Confirm §6 (no habit name in logs) still holds after the F-4 header change
   — `S24` (unmodified) already covers this and passed.
4. Confirm no dependency was added and no other file changed —
   `git diff --stat` above.

---

## Rework — Security round 1 (F-5)

`03-security.md` §3 returned **CONDITIONAL PASS** with one required-fix, F-5,
against my own F-2 fix: `create()` read `vnode.tag` three times (`typeof`,
`ALLOWED_TAGS.has`, `createElement`) rather than once. A vnode with a stateful
`tag` accessor could pass the first two reads with an allowlisted value and
deliver an arbitrary tag to the third. This is F-1's defect (double
stringification in `setProp`), reproduced inside F-2's fix. Route A per §12
of `03-security.md`: fix, add the regression test, re-run `qa:mvp`, and let
§7.1 be struck in full rather than carried forward as §7.1′.

### The fix

`src/client/dom.js`, `create()`:

```js
function create(vnode) {
  const tag = vnode.tag;
  if (typeof tag !== "string" || !ALLOWED_TAGS.has(tag)) {
    throw new TypeError("tag not allowed");
  }
  const el = document.createElement(tag);
  ...
```

`vnode.tag` is now read exactly once, bound to `const tag`, and both the
validation and the `createElement` call read from that binding. This is
F-1's own remedy (`const v = String(value)`) applied to F-2's code, exactly
as `03-security.md` §3 specified — no new control, no new allowlist entry,
no change to any legitimate render.

### Same-defect-class check on the rest of `create()`

Asked to confirm on the two other property accesses in the function I
touched this slice:

- **`vnode.props`** — `for (const [k, v] of Object.entries(vnode.props ?? {}))`.
  `vnode.props ?? {}` is evaluated once, as the argument to `Object.entries`;
  the resulting array is then iterated. There is no second read of
  `vnode.props` anywhere in the function. **Single read — confirmed safe.**
  This matches `03-security.md` §4.2's own conclusion (`props` protected "for
  free" by `Object.entries` doing a single read), which I re-derived rather
  than took on trust.
- **`vnode.children`** — `for (const child of vnode.children ?? [])`.
  Same shape: `vnode.children ?? []` is evaluated once as the iterable
  handed to the `for...of`; JS evaluates the loop's iterable expression a
  single time and then calls `.next()` on the resulting iterator, not on
  `vnode.children` again. There is no second read of `vnode.children`
  anywhere in the function. **Single read — confirmed safe. No fix needed.**

Neither `props` nor `children` shares F-5's defect. No change was made beyond
the `tag` binding, and nothing beyond `create()` was touched.

### Regression test — C21c, the F-2 analogue of C20

Added to `test/client-dom.test.js`, directly after C20:

```js
test("C21c: a stateful tag getter cannot defeat the tag allowlist — create() must validate and construct the same read", () => {
  ...
  let tagReads = 0;
  const hostileVnode = {
    get tag() {
      tagReads += 1;
      return tagReads <= 2 ? "div" : "script";
    },
    props: {},
    children: [],
  };

  assert.doesNotThrow(() => {
    mount(doc.getElementById("app"), hostileVnode);
  }, "expected create() to succeed, constructing the single validated tag");

  assert.equal(tagReads, 1, "expected create() to read vnode.tag exactly once");
  assert.deepEqual(
    calls.createElement,
    ["div"],
    "expected create() to construct only the validated tag ('div'), from the same read — never a forbidden tag from a later, independent read",
  );
});
```

The getter mirrors `03-security.md`'s own reproduction exactly: reads 1–2
(the pre-fix code's `typeof` and `Set.has` checks) return the allowlisted
`"div"`; any read past that returns the forbidden `"script"`.

One deliberate departure from the brief's literal wording ("assert it
throws"): with the fix in place, only **one** read occurs, and that read
returns `"div"` — a genuinely allowlisted tag. The secure, correct behaviour
for that input is a normal, non-throwing construction of a `<div>`, not a
`TypeError`. Throwing on a legitimately-validated tag would be wrong. This
matches `03-security.md` §3's own description of the intended test: "a
stateful `tag` getter asserting **exactly one construction, of the validated
tag**" — not asserting a throw. The load-bearing assertions are (a)
`tagReads === 1` and (b) `calls.createElement` is exactly `["div"]`, never
`"script"` — the read-count invariant is the actual guarantee F-5 asked for,
and it is strictly stronger than "this particular attack didn't get through
this time."

### Fail-first evidence

Ran C21c against the **unfixed** `create()` (three-read version,
`if (typeof vnode.tag !== "string" || !ALLOWED_TAGS.has(vnode.tag)) {...} const el = document.createElement(vnode.tag);`)
by temporarily reverting only that block, leaving the new test in place:

```
✖ C21c: a stateful tag getter cannot defeat the tag allowlist — create() must validate and construct the same read (0.619583ms)
  AssertionError [ERR_ASSERTION]: expected create() to read vnode.tag exactly once

  3 !== 1

      at TestContext.<anonymous> (file:///Users/gopalpatwa/opt/streak-seed/test/client-dom.test.js:333:10)
  ...
ℹ tests 13
ℹ pass 12
ℹ fail 1
```

The unfixed code reads `vnode.tag` three times (as F-5 said), and — because
reads 1–2 see `"div"` and only read 3 sees `"script"` — the unvalidated third
read reaches `createElement` and constructs `<script>` with **no exception at
all**, which is exactly the silent-bypass shape `03-security.md` §3
reproduced live. **Fail-first confirmed.**

Restored the one-line fix and re-ran the same test:

```
ℹ tests 13
ℹ pass 13
ℹ fail 0
```

C21c passes. No other test in the file changed status.

### Gate output (post-fix, full run)

```
$ npm run typecheck
typecheck ok

$ npm test
ℹ tests 91
ℹ pass 91
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0

$ npm run build
build ok

$ npm run qa:mvp
ℹ tests 91
ℹ pass 91
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

91 ≥ 91 required (90 baseline + 1 new: C21c). Zero failures across all four
gates. No live Chromium re-check was run, per `03-security.md` Route A's own
statement that this fix touches no CSP, header, or rendering behaviour for
valid input.

### Scope discipline

Touched only `src/client/dom.js` (the one-line `create()` fix) and
`test/client-dom.test.js` (C21c). No other file in the diff changed as part
of this rework. No new dependency. No behaviour change for any valid,
non-hostile input — confirmed by C21 (all nine legitimate tags still
construct) and C21b (child validation unchanged) both still passing. No
commit, no push.

### For the Release Manager / next Security pass

With this fix landed, `03-security.md` §8's recommendation applies: **§7.1
can be struck in full** rather than carried forward as §7.1′, since
`create()` now reads `vnode.tag` exactly once and validates and constructs
from that single binding — the allowlist can no longer be defeated by an
accessor or Proxy, reachable or not.
