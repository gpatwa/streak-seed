# Tech Spec — StreakKeeper browser client

> Stage 2 (Architecture) · Owner: Software Architect · Slice: `browser-client`
> Depth: **standard**, per `runs/browser-client/00-slice-plan.md` and
> `RUN_ECONOMICS.md`. Sources: `00-slice-plan.md`, `runs/greenfield/04-ui.md`
> (copy is authoritative and verbatim), `runs/greenfield/03-ux.md`,
> `src/server.js`, `.agentic/SAFETY_INVARIANTS.md`.

## 0. Shape of the slice

A dependency-free browser client — vanilla HTML/CSS/JS, no framework, no build
step, no CDN — served by the existing `src/server.js` from a fixed asset
allowlist, talking to the existing JSON API over `fetch`.

The whole slice is **additive**. It adds files under `src/client/`, one static
route block in `src/server.js`, and three test files. It changes no service, no
streak math, no status code, and no response body. One existing test assertion
is widened (§9.1) and that widening is called out explicitly rather than
buried.

### The one thing this slice actually risks

Habit names are user free-text, and this is the first code in the repo that
puts them on a screen. The headless API only ever put them inside
`JSON.stringify`, which is not a markup context. Invariant §6 covers *logs*,
not *markup*, so nothing existing constrains this. §3 is therefore the
load-bearing section of this document; everything else is ordinary plumbing.

### Depth note (why §3 goes further than `standard`)

`standard` was budgeted for architecture, and §1, §2, §6–§10 are written at
that depth. §3 goes deeper — attribute sinks, URL-scheme sinks, `document.title`
and history, a second enforcement layer via CSP — for a recorded reason: the
slice plan pre-authorises extra depth *on the escaping boundary specifically*,
and the design decision there is not "which escaping function" but "whether the
unsafe path exists in the codebase at all." That is an architecture-time,
one-way decision: if the render layer accepts HTML strings, every later slice
inherits a sink, and Security is reduced to auditing call sites forever. Making
it structurally absent costs about thirty lines now and nothing afterwards.
Depth was **not** raised for any other section.

### What the client is allowed to assume

- The server is loopback-only and the user is self-asserted via `X-User-Id`
  (unchanged; auth is out of scope per the slice plan).
- Every value the client renders comes from one shape, `HabitView`:
  `{ habitId, name, currentStreak, longestStreak, atRisk, lastCompletedDate }`.
- `name` is untrusted, up to 200 characters, arbitrary Unicode.
- `habitId` is server-generated. The client still treats it as opaque and
  never shape-checks it (shape-checking splits the id space and weakens the
  non-oracle — the same reasoning as `runs/http-layer/01-arch.md` §2.4).

## 1. Static serving

### 1.1 A frozen allowlist, not a filesystem path

The route table is an explicit map from **request pathname → asset**. No
pathname is ever joined onto a directory, so there is no path-traversal
surface to defend: `/../../etc/passwd`, `%2e%2e%2f`, and `/app.js%00` all miss
the map and fall through to the existing `(unmatched)` 404. The absence of
`path.join` is the control.

```js
// src/server.js — near the top, beside ERR and HABIT_NOT_FOUND
const CLIENT_DIR = new URL("./client/", import.meta.url);

// pathname -> { file, type }. The KEY is also the route template used for
// access logging (§1.4): every key is a literal in this file, never
// request-derived text.
const STATIC = Object.freeze({
  "/":          { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.css":   { file: "app.css",    type: "text/css; charset=utf-8" },
  "/boot.js":   { file: "boot.js",    type: "text/javascript; charset=utf-8" },
  "/app.js":    { file: "app.js",     type: "text/javascript; charset=utf-8" },
  "/render.js": { file: "render.js",  type: "text/javascript; charset=utf-8" },
  "/dom.js":    { file: "dom.js",     type: "text/javascript; charset=utf-8" },
  "/copy.js":   { file: "copy.js",    type: "text/javascript; charset=utf-8" },
});
```

Content types come from the table, never from the request and never from a
file extension parsed out of the URL.

### 1.2 Read once at module load

Each asset is read with `readFileSync` at module load into a frozen
`Map<pathname, {body: Buffer, type, length}>`. Two reasons:

- Request handling stays pure — no per-request filesystem call, no `fs` error
  path inside `handleRequest`, no way for a request to influence which bytes
  are read.
- A missing or unreadable asset fails at **import** time, which means
  `npm run build` (`scripts/build-check.mjs`, which imports `src/server.js`)
  catches it. That is where you want to find it.

This preserves import-safety in the sense the existing code means it
(`src/server.js:310` — "importing this module starts no listener and binds no
port"). Reading seven small local files at import binds nothing and listens on
nothing. The trade-off is stated rather than assumed: the server no longer
imports cleanly if `src/client/` is deleted. That is intentional — the build
check is the intended detector.

### 1.3 Where it plugs into `handleRequest`

Inside the existing route-match ladder, as a new `else if` **before** the
`COMPLETIONS_RE` branch:

```js
} else if (method === "GET" && Object.hasOwn(STATIC, pathname)) {
  routeTemplate = pathname;   // a literal key of the frozen table
  matched = "static";
}
```

Rules that fall out of the existing structure and must be preserved:

- **`GET` only.** `POST /app.js` misses the branch and 404s exactly as today.
- **No `X-User-Id`.** Static assets are byte-identical for every user and
  carry no user data, so they get the same carve-out `/health` already has.
  The identity check stays exactly where it is; the `static` branch returns
  before reaching it, next to the `health` branch.
- **The 8 KiB body cap still runs first**, unchanged, for every request
  regardless of route — including a `GET /` with a body. The 413 path keeps
  its `Connection: close` behaviour (the fix this slice was gated behind).
- **No new query handling.** `?v=2` on an asset is ignored, because pathname
  is already split from the query string upstream.

### 1.4 Response headers

```js
function sendStatic(res, asset) {
  res.writeHead(200, {
    "content-type": asset.type,
    "content-length": asset.length,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...(asset.csp ? { "content-security-policy": asset.csp } : {}),
  });
  res.end(asset.body);
}
```

- `no-store` everywhere, matching the existing rule. The assets hold no
  personal data, but one cache rule is simpler than two and this is a local
  seed with no cache-invalidation story to get wrong.
- `nosniff` so a `text/javascript` response can never be re-interpreted.
- **CSP, on the HTML document only** (the second layer described in §3.6):

  ```
  default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self';
  img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none';
  frame-ancestors 'none'
  ```

  `default-src 'none'` means anything not enumerated is refused. This forces
  every script and stylesheet into its own file — no inline `<script>`, no
  inline `<style>`, no inline `on*=` handler can execute — which is why
  `boot.js` exists as a two-line entry point instead of an inline module
  script in `index.html`.

### 1.5 Access logging (§6 stays true)

`routeTemplate` for a static hit is the **table key**, which is a literal in
`src/server.js`. Nothing request-derived enters a log line, so the §6 property
the HTTP slice established is unchanged in kind — the closed set of templates
just grew by seven fixed strings. Existing test S24 asserts that closed set and
must be widened; see §9.1.

### 1.6 What is *not* added

No `HEAD`, no ETag, no conditional requests, no compression, no directory
listing, no `/favicon.ico` (it 404s as JSON like any other unmatched path; a
browser tolerates that). No new endpoint of any kind — in particular **no
`GET /habits/:habitId`**, which matters in §4.

## 2. Client structure

### 2.1 Files

```
src/client/
  index.html   author-written markup shell. The ONLY markup in the slice.
  app.css      all styling. No CSS-in-JS, no inline style attributes.
  boot.js      2 lines: import { start } from "./app.js"; start();
  app.js       fetch, state machine, event wiring, mount calls. Exports start().
  render.js    HabitView -> vnode tree. PURE. No DOM, no fetch, no clock.
  dom.js       vnode -> real DOM. The ONLY file that touches the DOM.
  copy.js      frozen COPY object: every user-facing string, verbatim.
```

Module graph is a DAG with exactly one DOM sink:

```
boot.js -> app.js -> render.js -> copy.js
                  -> dom.js
```

`render.js`, `copy.js`, and `dom.js` contain **no top-level DOM access** — no
`document`, `window`, or `fetch` reference outside a function body. That is a
deliberate design rule, not an accident: it makes all three importable in plain
Node with zero dependencies, which is the entire reason the test plan in §10
can exist without jsdom. `app.js` obeys the same rule (its top level only
defines things), so its state machine and its 404 mapping are unit-testable
too. `boot.js` is the only module with a side effect at import, and it is two
lines with nothing to test.

`npm run typecheck` (`node --check` over `src/**`) covers all five client `.js`
files for free, because they are syntactically ordinary ESM.

### 2.2 The vnode representation

`render.js` produces plain data, never DOM:

```js
{ tag: "li", props: { class: "row" }, children: [ "text", {…vnode} ] }
```

- `children` entries are **either** a string (becomes a text node, always) or a
  nested vnode. There is no third kind. There is no `html` child, no
  `dangerouslySetInnerHTML`, no raw-string escape hatch — the representation
  cannot express "this string is markup," so no caller can ask for it.
- `props` is a flat map of attribute name → string, plus one reserved key
  `on: { click: fn }` for event listeners. Listeners are **functions**, never
  strings, and are attached with `addEventListener` — the `on*`-attribute path
  does not exist (`dom.js` throws on any prop name matching `/^on/i`; see §3.3).

Splitting render (data) from mount (DOM) is what makes the untrusted string's
journey auditable in one place: it enters `render.js` as a `children` entry and
leaves `dom.js` as a text node. There is no branch in between.

### 2.3 The seven components

All seven live in `render.js` as pure functions from data to vnode. Naming
matches `04-ui.md` §5 one-for-one so the UI spec and the code share a
vocabulary.

| Component | Signature | Notes |
|---|---|---|
| `HabitRow(view)` | `HabitView -> vnode` | `<li>`: sr-only sentence, visual cluster, `LogTodayControl`. |
| `StreakFigure(label, n)` | `(string, number) -> vnode` | Label + numeral + pluralised unit. Same component for current and longest; differentiated by label text and a CSS class only — never colour (`04-ui.md` §5). |
| `StateTag(state)` | `"at-risk"\|"broken" -> vnode\|null` | Returns `null` for the two states that have no tag. One component for both tagged states, deliberately (§5 of the UI spec). |
| `LogTodayControl(view)` | `HabitView -> vnode` | Real `<button type="button">`. Label swaps `Log today` / `Logged`. Never disabled (see §7.2). |
| `EmptyState()` | `() -> vnode` | Heading + body, replaces the list region. |
| `HabitDetail(view)` | `HabitView -> vnode` | Name as heading, both figures, optional tag, last-logged line, log control. |
| `ErrorNotice(message, variant)` | `(string, "region"\|"inline") -> vnode` | `variant` chooses full-region vs inline placement. Message is always a `COPY` constant — never a server string, never an exception message (§5.2). |

No `Loading` component: `04-ui.md` §5 deliberately declines to design one, so
loading is a single line of text rendered by `app.js` from `COPY.loading`.

### 2.4 State derivation — and the client has no clock

`render.js` derives the four per-habit states from the `HabitView` alone:

```js
if (view.lastCompletedDate === null) return "not-started";
if (view.atRisk) return "at-risk";
if (view.currentStreak === 0) return "broken";
return "healthy";
```

Total over the four cases, in the order that makes them mutually exclusive.
Note what is absent: **no `Date`, no `Date.now()`, no timezone, no comparison
against the browser's clock.** Invariant §1 says the day boundary is
server-authoritative and never client-supplied; the cheapest way to keep that
true forever is for the client to have no clock at all. `lastCompletedDate`
already arrives as a `YYYY-MM-DD` UTC string and is rendered verbatim, so no
date formatting is needed either. `Date` is therefore a **banned token** in
`src/client/`, enforced by the same static scan as the markup sinks (§3.5).

### 2.5 Data flow and navigation

- `GET /habits` with the `X-User-Id` header is the only read. One request,
  the whole list.
- Detail view is client-side selection out of that same list, keyed by
  `habitId`, reached by `location.hash` (`#/habit/<id>`). No new endpoint, no
  second request — which is also what preserves the non-oracle (§4).
- `POST /habits/:habitId/completions` is the only write.
- The user id comes from `localStorage["streakkeeper.userId"]`, defaulting to
  the constant `"local"`. Auth is out of scope; this is a loopback seed. The
  user id is never rendered and never placed in a URL.
- **A fresh `npm start` has an empty store, so the honest first screen is the
  empty state.** Seeding habits is a `curl`/`scripts/demo.mjs` concern, not a
  UI feature — habit creation is out of this slice's scope per the slice plan.

## 3. The escaping boundary

### 3.1 The stance: there is no escaping, because there is no markup

The instinct is to write `escapeHtml(name)` and audit every call site. This
spec rejects that, because it makes safety a property of *discipline at N call
sites* and N grows with every future slice.

Instead: **the client never constructs markup from data.** The only markup in
the slice is `index.html`, which is author-written, static, and contains zero
interpolation — the server does not template it, does not know a habit exists,
and serves the same bytes to every user. Every dynamic node is created with
`document.createElement`, and every dynamic string becomes a **text node**.

A text node is not escaped text; it is *not text in a markup context at all*.
`document.createTextNode("<img src=x onerror=alert(1)>")` produces character
data. The browser's HTML parser is never handed those bytes, so there is no
parse to get wrong, no context (attribute / URL / script / style) to escape
differently for, and no double-encoding bug to introduce. The boundary is the
DOM API itself.

**The single boundary is `src/client/dom.js`.** It is the only file in the
repository that touches the DOM, it is roughly forty lines, and it is the only
file Security needs to read closely.

### 3.2 What `dom.js` can and cannot do

```js
// src/client/dom.js — the entire trusted surface of the client.
export function mount(parent, vnode) { … }   // replaces parent's children
function create(vnode) {
  const el = document.createElement(vnode.tag);       // tag from render.js only
  for (const [k, v] of Object.entries(vnode.props ?? {})) setProp(el, k, v);
  for (const child of vnode.children ?? []) {
    el.appendChild(
      typeof child === "string"
        ? document.createTextNode(child)   // <- EVERY untrusted string, always
        : create(child)
    );
  }
  return el;
}
```

- It accepts **vnodes and strings**. It has no parameter, anywhere, that means
  "HTML". A caller cannot express the unsafe request.
- `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`,
  `createContextualFragment`, `eval`, and `new Function` **do not appear in
  this file or any other client file** — see §3.5. This includes the "static
  chrome" carve-out the brief asks about: **`innerHTML` is not permitted
  anywhere, not even for constant template chrome.** There is no need for it —
  static chrome lives in `index.html`, which the browser parses once from a
  file no request can influence — so allowing it would buy nothing and would
  cost the single-token static scan that makes §3.5 cheap.
- Clearing a container uses `replaceChildren()`, never `innerHTML = ""`. Same
  effect; keeps the banned token genuinely absent so the scan needs no
  exceptions, and an exception list is exactly how this kind of control rots.

### 3.3 Attributes: an allowlist with two hard refusals

Attributes are a real sink even without `innerHTML` — `onclick` executes, and
`href`/`src` execute under a `javascript:` scheme. `setProp` refuses both
categories structurally:

```js
const ALLOWED_PROPS = new Set([
  "class", "id", "type", "role", "hidden", "tabindex", "lang",
  "aria-hidden", "aria-live", "aria-atomic", "aria-label", "href",
]);

function setProp(el, name, value) {
  if (name === "on") { /* value: {event: fn} */
    for (const [ev, fn] of Object.entries(value)) {
      if (typeof fn !== "function") throw new TypeError("listener must be a function");
      el.addEventListener(ev, fn);
    }
    return;
  }
  if (/^on/i.test(name)) throw new TypeError("event-handler attributes are not settable");
  if (!ALLOWED_PROPS.has(name)) throw new TypeError("attribute not allowed");
  if (name === "href" && !String(value).startsWith("#/")) {
    throw new TypeError("href must be an in-app hash route");
  }
  el.setAttribute(name, String(value));
}
```

Three properties worth naming:

1. **Event handlers can only be functions.** The string-valued `on*` path
   throws, so `onerror="…"` cannot be constructed even by a buggy future
   caller. Listeners are closures over the habit, which is also why no
   `data-habit-id` attribute is needed.
2. **`href` is scheme-proof by construction.** The only `href` in the app is
   built by one helper, `detailHref(id)` → `` `#/habit/${encodeURIComponent(id)}` ``,
   a hard-coded prefix plus an encoded segment. A value that does not start
   with `#/` throws, so `javascript:`, `data:`, and protocol-relative URLs are
   unreachable — including via a hypothetical hostile `habitId`.
3. **Untrusted text never goes in an attribute at all.** The habit name is a
   `children` entry, always. Where a screen reader needs the name inside an
   accessible name, the design uses a visually-hidden `<span>` with a text
   child rather than `aria-label` (§7.3) — so the name's *only* representation
   in the DOM is character data. `aria-label` remains in the allowlist for
   constant strings, and a test asserts no prop value in a rendered tree ever
   contains the habit name (§10, C4).

### 3.4 Sinks outside the DOM tree

Three places that are not markup but still leak or execute, closed explicitly:

- **`document.title` stays the constant `"StreakKeeper"`.** Writing a habit
  name into the title would put it in the browser tab, window switcher, and
  browser history — a privacy leak in the same family as §6, and one nobody
  thinks of as "rendering". Banned token: `document.title`.
- **The URL never contains a habit name.** Hash routes carry `habitId` only.
  No query strings, no `history.pushState` with data.
- **No `console`** — §5.

### 3.5 The static scan (the enforcement that does not rely on review)

A test reads every file under `src/client/` as text and asserts a banned-token
regex matches **zero times**:

```
innerHTML | outerHTML | insertAdjacentHTML | document\.write |
createContextualFragment | \beval\s*\( | new\s+Function | \bdocument\.title |
\bconsole\. | \bDate\b | srcdoc | javascript: | \bon\w+\s*=\s*["']
```

Plus, for `index.html` specifically: no `<script>` element with inline content
(every script is `src=`-only and `type="module"`), and no `on*=` attribute.

This is the same species of control the repo already uses — S15 structurally
asserts `logCompletion` is never called with a third argument, and S28 asserts
import-safety. It is a *grep as an invariant*: cheap, has no false negatives
for the thing it checks, and fails loudly the moment someone reaches for the
convenient path. Adding a token to the banned list is a one-line change that
shows up in review as a deliberate act.

### 3.6 CSP as the second, independent layer

§1.4 sends `default-src 'none'; script-src 'self'; …` on the HTML document.
This is not the primary control — the primary control is that markup is never
constructed. It is the layer that holds **if the primary control is wrong**:
under this policy an injected inline `<script>` or `onerror=` handler does not
execute even if it somehow reached the parser, and `default-src 'none'`
prevents exfiltration to any other origin.

The two layers fail independently: layer one is a property of `dom.js`, layer
two is a property of a response header in `src/server.js`. Defeating both
requires changing two files with different owners and reasons to change.

### 3.7 Why bypass is not a matter of remembering

Not a mathematical impossibility — an honest statement of what it takes. To
render a habit name as markup, someone must:

1. add a code path to `dom.js` that accepts an HTML string (the vnode
   representation cannot carry one), **and**
2. use a banned token, or add an exception to the banned-token list, **and**
3. get past the CSP, or edit the header in `src/server.js` too, **and**
4. do it in a diff where all three of those changes are visible.

There is no way to do it *by accident*, no ambient `innerHTML` sitting in a
utility waiting to be called, and no call site whose safety depends on the
author having read this document.

### 3.8 What this does *not* protect against (stated, not hidden)

- **Unicode/visual spoofing inside the name.** Bidi overrides, zero-width
  characters, and homoglyphs render as-is within the name's own text node.
  They cannot escape the element or alter structure, so this is a display
  concern, not an injection one. Out of scope for this slice; worth a note to
  Security rather than silence.
- **Layout abuse via a long or newline-heavy name.** The server already caps
  names at 200 characters; `app.css` uses `overflow-wrap: anywhere` so a
  200-character unbroken string cannot push the log control off-screen.
- **A malicious server.** The client trusts `127.0.0.1` to return well-formed
  `HabitView` objects. If the server is hostile the client has already lost,
  and no client-side control changes that.

## 4. How the `null` non-oracle survives the UI

The server's mechanism (`runs/http-layer/01-arch.md` §3, test S17/S18/S19) is
that `logCompletion` returns `null` for both "not yours" and "does not exist",
and the handler has exactly one call site returning one frozen
`HABIT_NOT_FOUND` constant. The handler cannot tell the two apart because the
service refuses to tell it.

A UI is a new way to leak that distinction, through four channels the HTTP
layer did not have: a different rendered state, a different control being
present or absent, different timing, or a different navigation outcome. All
four are closed the same way — **by making the client structurally unable to
know**, not by making it careful.

### 4.1 The client has exactly one source of habit existence

`GET /habits` returns the caller's own habits and nothing else (invariant §4,
enforced in `listHabits`). That response is the client's **only** knowledge of
which habits exist. There is no `GET /habits/:habitId` endpoint and §1.6 says
this slice does not add one — so there is no request the client can make that
distinguishes a foreign habit from a fictional one.

Detail view is therefore a lookup in an array the user owns:

```js
const view = habits.find((h) => h.habitId === id) ?? null;
if (view === null) return ErrorNotice(COPY.errorHabitNotFound, "region");
```

`#/habit/habit_9999` (never existed) and `#/habit/habit_3` (belongs to another
user) both miss the array and produce the **same** branch, the same constant
string — *This habit couldn't be found.* — the same DOM, and the same timing,
because both are a failed `Array.find` over data already in memory. There is no
second code path to diverge.

### 4.2 The log action maps every 404 to one state

`POST /habits/:habitId/completions` can return 404 for a foreign-or-fake id.
The client mirrors the server's single-constant discipline:

```js
// The ONLY place a log response becomes UI state.
if (res.status === 404) return { kind: "gone" };      // one branch, one constant
if (!res.ok)            return { kind: "failed" };    // everything else
```

- **One branch.** The response body is never inspected on the 404 path — not
  read, not parsed, not compared. Two different `{error: …}` bodies could not
  cause two different UI states even if the server started sending them.
- **One string.** `kind: "gone"` renders `COPY.errorHabitNotFound` — the same
  constant §4.1 uses. A user cannot distinguish "someone else's habit" from
  "typed a wrong id" by comparing screens.
- **No retry asymmetry.** Neither branch retries. A retry on one and not the
  other is a timing oracle.
- **No enumeration affordance.** The UI offers no way to type a habit id; ids
  only ever come from the user's own list. Hand-editing the hash is possible
  and lands in §4.1's single branch.

### 4.3 The rule for future work

Any future client code that treats "habit not found" differently from "habit
not yours" is a defect, not a feature — and the reason it cannot be written
today is that the client is never told which one it is.

## 5. Nothing sensitive reaches the browser console (§6, extended)

Invariant §6 says audit and telemetry may carry habit ids, counts, and streak
numbers — never habit names or free text. The client introduces a second
logging surface the invariant never contemplated: **the browser console**,
which is a persisted, copy-pasteable, screen-shareable sink.

### 5.1 Zero `console.` tokens in `src/client/`

The rule is not "do not log names," it is **the client contains no `console`
calls at all**, enforced by the banned-token scan in §3.5. Reasons for the
absolute form:

- `console.error(err)` is the realistic leak: an exception raised while
  handling a habit could carry the name in its message, and a `fetch` rejection
  can carry a URL. Banning the token removes the judgement call.
- A conditional "debug mode" would be a switch someone flips at exactly the
  wrong moment. There isn't one.
- `debugger` is banned by the same scan.

Failures surface where the user can act on them — as an `ErrorNotice` in the
DOM — which is also better product behaviour than a silent console message.

### 5.2 Errors are constants, never carriers

`ErrorNotice` renders **only** strings from the frozen `COPY` object. It never
renders a caught exception's `message`, a `Response.statusText`, or a parsed
server `{error: …}` body. Server error strings are a closed set today
(`runs/http-layer/01-arch.md` §2.6), but rendering them would couple the UI to
that set and create a path for server text to reach the screen — the same
category of mistake as rendering a name as markup.

Rejected values are dropped, not stored: `catch { return {kind: "failed"}; }`
with no binding, so there is no variable holding an error object that a future
edit could log.

### 5.3 What the server logs is unchanged

Static routes log a literal template (§1.5). `GET /habits` and the completions
POST log exactly what they logged before this slice. No new server-side log
line contains anything derived from a request.

## 6. States and copy

### 6.1 `copy.js` — one frozen object, verbatim

Every user-facing string lives in `src/client/copy.js` as
`export const COPY = Object.freeze({…})`. No string literal destined for the
screen appears anywhere else in the client. This makes "the copy is
authoritative" a checkable property (test C1) instead of a habit.

| Key | String (verbatim from `04-ui.md` §3) |
|---|---|
| `currentStreakLabel` | Current streak |
| `longestStreakLabel` | Longest streak |
| `logDefault` | Log today |
| `logDone` | Logged |
| `notStarted` | Not started yet. Log today to begin. |
| `healthy` | Logged today. |
| `atRiskDetail` | Logged yesterday. Not yet today. |
| `atRiskTag` | Not yet today |
| `brokenDetail` | Not logged yesterday. Today starts a new streak. |
| `brokenTag` | New streak |
| `lastLogged(date)` | Last logged {date} |
| `emptyHeading` | No habits yet. |
| `emptyBody` | Once a habit is added, its current and longest streaks will appear here. |
| `loading` | Loading habits… |
| `errorList` | Something went wrong loading your habits. Try again. |
| `errorHabitNotFound` | This habit couldn't be found. |
| `errorLogFailed` | That didn't go through. Try again. |

**Character-exactness matters and was verified against the source file:**
`loading` ends with U+2026 HORIZONTAL ELLIPSIS (bytes `e2 80 a6`), not three
periods; `couldn't` and `didn't` use ASCII `'` (U+0027), not U+2019. Test C1
compares bytes.

Two rules the copy carries with it, from `04-ui.md` §3:

- **`days(n)` pluralises**: `1 day`, `0 days`, `2 days`. A one-day streak gets
  correct grammar like any other length.
- **"broken" is never printed.** It is a state name in code only. `StateTag`
  renders `New streak`; the detail line renders *Not logged yesterday. Today
  starts a new streak.* A test asserts the rendered text of every state
  contains no case-insensitive "broken" and no "!" (C1).

### 6.2 Every state, and what renders it

| State | Trigger | List view | Detail view |
|---|---|---|---|
| **No habits** | `GET /habits` → `[]` | `EmptyState()` replaces the list region: heading *No habits yet.* + body *Once a habit is added, its current and longest streaks will appear here.* No CTA (creation is out of scope). | n/a |
| **Not started** | `lastCompletedDate === null` | Ordinary row. No tag, no dimming, no "inactive" styling. Current streak `0 days`, longest `0 days`, both in the same weight and colour as any other row. | Same, plus the status line *Not started yet. Log today to begin.* No last-logged line. |
| **Healthy** | logged today (`currentStreak ≥ 1`, `atRisk false`) | Ordinary row, no tag, no highlight ring. Log control reads **Logged**. | Status line *Logged today.* Last-logged line present. |
| **At-risk** | `atRisk === true` | `StateTag` → *Not yet today*, beside the current-streak figure. The number is **unchanged from yesterday** (invariant §2). Tag is plain neutral ink — no red/orange/amber, no icon, no chip border. | Full line *Logged yesterday. Not yet today.* on its own line below the figure — never overlaid on the number. |
| **Broken** | `currentStreak === 0` and `lastCompletedDate !== null` | `StateTag` → *New streak*. Longest streak still shown and still nonzero — that pairing is what tells the story. | Full line *Not logged yesterday. Today starts a new streak.* |
| **Loading** | first `GET /habits` in flight | List region shows *Loading habits…* as plain static text. **No spinner animation, no skeleton shimmer** — `04-ui.md` permits a generic spinner, but any animation here would be the one moving thing on the page, and §7.5 is cheaper to keep absolute. | n/a |
| **Error — list load** | `fetch` rejects or `!res.ok` on `GET /habits` | `ErrorNotice(COPY.errorList, "region")` replaces the list region: *Something went wrong loading your habits. Try again.* | n/a |
| **Error — habit not found** | hash route id not in the user's list, or 404 from the log POST | `ErrorNotice(COPY.errorHabitNotFound, "region")`: *This habit couldn't be found.* (see §4) | same |
| **Error — log failed** | non-404 failure on the completions POST | `ErrorNotice(COPY.errorLogFailed, "inline")` **inline, next to the control that failed** — never a full-region takeover: *That didn't go through. Try again.* | same |

Note on loading: it is shown on the **first** load only. A re-render after a
successful log does not re-enter the loading state — flicker on every tap
would be both ugly and, per §7.4, an extra announcement.

### 6.3 Visual rules inherited from the UI spec

Recorded here so the implementer does not have to re-derive them, because in
this product they are *ethical* constraints wearing CSS clothing:

- **No per-row visual ranking.** No colour grading, no size scaling by streak
  length, no ordering by streak. Every row carries identical weight — the
  product's non-goals rule out cross-habit comparison, even implicit.
- **The current-streak numeral is body-adjacent in the list**, never hero
  scale, never colour-filled, never icon-wrapped. Detail view is the single
  place it gets real size.
- **Longest streak is always rendered, in every state, including 0.** Never
  conditional — a number that appears only after a break is a consolation
  prize.
- `StateTag` must be tonally indistinguishable at a glance from a date. One
  shared component for both tagged states, so they cannot drift apart.
- No flame, trophy, badge, progress bar, or gradient anywhere. No emoji.

## 7. Accessibility

### 7.1 Structure and focus order

The list is a `<ul>`, one `<li>` per habit. Tab order runs straight down the
list. Per habit there are exactly **two** focus stops, in DOM order: the habit
name (a link into detail) and the log control. `04-ui.md` §4 allows the name as
a stop precisely when the row links to detail, which it does here.

Streak figures and `StateTag` are static text — not focusable, not
`tabindex="0"`, not buttons dressed as text.

### 7.2 Keyboard

- `LogTodayControl` is a real `<button type="button">`: Enter and Space work,
  for free, because it is a button rather than a `div` with a click handler.
- **No hover-only affordance, no press-and-hold to confirm.** Hold-to-confirm
  is a small gamified friction pattern and is ruled out on tone grounds as much
  as access grounds (`03-ux.md` §5).
- **After logging, focus stays on the control.** Nothing steals focus — no
  toast, no modal, no scroll-into-view.
- The control is **never `disabled`**, including in the `Logged` state.
  Disabling would silently drop it out of tab order and out of some screen
  readers' element lists, so the state change would be invisible to exactly the
  users who need it announced. The already-logged case is a no-op in the
  handler instead (§7.4).
- Detail navigation uses a real `<a href="#/habit/…">`, so Back works and the
  link is announced as a link.

### 7.3 Screen-reader phrasing

`04-ui.md` §4 fixes one field order — name, current streak, longest streak,
then the state fact — so a scanning listener hears the same pattern regardless
of state. The visible layout uses a different order (name, current, tag,
longest, control), so the two are reconciled with a visually-hidden sentence
per row:

```
<li>
  <span class="sr-only">{the fixed-order sentence}</span>
  <span class="row-visual" aria-hidden="true"> … name, figures, tag … </span>
  <a href="#/habit/…"><span class="sr-only">{name}</span></a>
  <button type="button">Log today<span class="sr-only"> {name}</span></button>
</li>
```

The sentences, verbatim from `04-ui.md` §4:

- Not started — *{habit}. Current streak 0 days. Longest streak 0 days. Not started yet.*
- Healthy — *{habit}. Current streak {n} days. Longest streak {m} days. Logged today.*
- At-risk — *{habit}. Current streak {n} days. Longest streak {m} days. Logged yesterday; not yet logged today.*
- Broken — *{habit}. Current streak 0 days. Longest streak {m} days. Not logged yesterday; today starts a new streak.*

Two design consequences:

- The at-risk fact is carried **as text**, never by colour or an icon alone.
  Streak counts likewise — never encoded only in a glyph.
- The sr-only span uses a **text child**, not `aria-label`. That is the §3.3
  rule paying off: the habit name has exactly one representation in the DOM
  (character data), which is both the safe path and the one screen readers
  handle most predictably. The log button's accessible name becomes
  "Log today {habit}" so buttons are distinguishable when navigating by
  control.
- `.sr-only` is the standard clip-rect pattern in `app.css` — off-screen but
  in the accessibility tree. Never `display: none`.

### 7.4 The live region

One `aria-live="polite" aria-atomic="true"` region in `index.html`, updated by
`textContent` via the same `dom.js` path.

- Fires **exactly once**, on a successful log where the server reports
  `changed: true`: *{habit} logged for today. Current streak {n} days.*
- `polite`, never `assertive`. Flat statement, no exclamation, not framed as an
  achievement.
- **A second tap on an already-logged habit does nothing at all** — the
  handler returns early on local state, so no request, no re-render, no
  re-announcement. Logging is idempotent server-side (invariant §5), and it is
  idempotent *visibly* here. Nothing may read as a correction, because the user
  did nothing wrong.
- `changed: false` from the server also produces no announcement.

### 7.5 No gamifying motion — hard constraint

`app.css` contains **no `@keyframes`, no `animation`, and no `transition`**.
Enforced as a static assertion (test C7), not a review note, because
`03-ux.md` §5 is explicit that its absence is load-bearing: animated urgency is
the mechanism gamified trackers use to manufacture loss-aversion.

Concretely ruled out: count-up animation on any numeral, confetti or
celebration on logging, progress-bar fill, flame/icon growth with streak
length, shake or pulse on at-risk, shatter or decay on broken. State changes
render immediately and statically — a number simply reads differently
afterwards, the way it would after a page refresh.

This also removes any need for `prefers-reduced-motion` handling: there is no
motion to reduce.

### 7.6 Colour and contrast

All text meets WCAG AA against its background. No state is signalled by colour
alone anywhere — every state fact has a text form. `StateTag` is deliberately
in the row's normal ink: scoreboard-red is both a contrast failure for
colourblind users and precisely the cue the tone stance argues against.

## 8. Invariant preservation

| Invariant | How this slice keeps it |
|---|---|
| **§1** One server-side day boundary | The client has **no clock**: no `Date`, no timezone, no client-side day comparison (§2.4). State is derived from server-computed fields only, and `lastCompletedDate` is rendered as the UTC string the server sent. `Date` is a banned token (§3.5), so a future edit cannot quietly introduce a second, client-side boundary. |
| **§2** A streak is never silently zeroed | At-risk rows render `currentStreak` exactly as the server sent it — yesterday's intact count — with the tag layered beside it, never replacing or dimming the number (§6.2). Longest streak is rendered in every state including 0 and is never conditional. The UI has no code that computes or reduces a streak. |
| **§3** No guilt / loss-aversion mechanics | No leaderboard, no cross-habit aggregate, no ranking, no points/badges/avatars, no "protect your streak" affordance. No gamifying motion, enforced by a CSS scan (§7.5). "Broken" is never printed; the reframe copy ships verbatim. |
| **§4** A user only ever affects their own data | The client sends one `X-User-Id` per session and renders only what `GET /habits` returns for it. No cross-user view exists to build, and no client-side filtering is trusted — scoping stays in `listHabits`. |
| **§5** Logging is idempotent per day | A second activation of an already-logged control is a no-op locally: no request, no re-render, no announcement (§7.4). The server-side idempotency is unchanged and remains the actual guarantee. |
| **§6** No sensitive content in logs | Extended to the client: zero `console` calls, no habit name in `document.title` or any URL, and static routes log a literal template (§5). |

## 9. Rollback plan

The slice is additive, in-memory, and has no persistence, no schema, and no
migration. **Rollback needs no data cleanup of any kind** — worst case the
process is restarted and the store is empty, which it already is on every boot.

**Primary — revert the commit.** One commit adds `src/client/*`, the static
block in `src/server.js`, the four test files, and the S24 widening. `git
revert` restores the pre-slice HTTP surface exactly.

**Surgical — disable serving without reverting.** Delete the seven entries from
the `STATIC` table (or the one `else if` in the route ladder). Every asset path
then falls through to the existing `(unmatched)` 404, and the JSON API is
byte-identical to today. Four lines, one file, no client code removed.

An env-var kill switch (`STREAK_CLIENT=off`) was **rejected**: it adds
configuration surface and a second code path that would itself need testing, to
save a four-line edit in a local seed.

**Verification after rollback:** `npm run qa:mvp` green, and `GET /` returns
`404 {"error":"not found"}` again.

### 9.1 Blast radius — what could break, and what detects it

| Change | Risk | Detector |
|---|---|---|
| New branch in the route ladder | Shadowing an existing route | Branch is `GET` + exact-key match on a frozen table; `/habits`, `/health`, and the completions regex are untouched. Existing `test/server.test.js` is the detector. |
| Assets read at import | `src/client/` missing ⇒ `src/server.js` no longer imports | `npm run build` (S28 / `scripts/build-check.mjs`) fails immediately. Intentional. |
| **`GET /` changes from 404 JSON to 200 HTML** | A consumer expecting 404 on `/` | Deliberate and is the point of the slice. Verified: no existing test asserts anything about `/`. S11 asserts `/nope`, which is unaffected. |
| **The access-log template set grows** | Existing test S24 fails | See below. This is the one existing assertion that changes. |

**The one existing test that changes.** `test/server.test.js` S24 asserts every
captured log line matches a closed regex of route templates
(`/health|/habits|/habits/:habitId/completions|\(unmatched\)`). The seven
static templates must be added to that alternation.

This is a **widening, not a weakening**, and the distinction is worth stating
because loosening a safety test is normally a red flag: the added alternatives
are seven fixed string literals that are keys of a frozen table in
`src/server.js`. They are not patterns, they cannot match request-derived text,
and the property S24 exists to prove — *every log line is one of a closed set
of templates, and no request data reaches a log line* — is preserved intact.
New test C18 pins the new alternatives to the `STATIC` keys so the two cannot
drift.

Alternative considered: log every static hit under a single `(static)` template
for a one-literal diff. Rejected — it discards which asset was requested for no
safety gain, since the literals are equally constant either way.

## 10. Test plan

### 10.0 Why the state coverage is unit-level (a constraint worth knowing)

**At-risk and broken cannot be produced through the HTTP API.** Logging always
counts toward the server's today, and no endpoint accepts a date (invariant
§1, and deliberately so). Over HTTP, a fresh store can only ever reach *not
started* and *healthy*. Two states out of four are therefore unreachable
end-to-end by design.

So state coverage is asserted where it is actually reachable: as pure functions
over synthetic `HabitView` objects, in Node, with no DOM and no dependencies.
That is not a compromise — it is the reason `render.js` was specified as pure
in the first place. QA may additionally seed at-risk/broken **in-process**
using the services' existing injectable clock (a test seam, never an HTTP
surface) to eyeball them in a real browser.

All four files run under the existing `node --test`; no new dependency, no new
script.

### `test/client-render.test.js` — pure, imports `render.js` / `copy.js` / `app.js`

- **C1 — copy is verbatim.** Every `COPY` value byte-equals the `04-ui.md` §3
  table, including U+2026 in `Loading habits…` and ASCII `'` in *couldn't* /
  *didn't*. Plus: no `!` in any value; no case-insensitive `broken` in any
  rendered output for the broken state; the word `best` appears nowhere.
- **C2 — every state renders.** All seven: no habits, not started, healthy,
  at-risk, broken, loading, error (each of the three error strings). Asserts
  the right copy, the right presence/absence of `StateTag`, that the log
  control reads `Logged` only in the healthy state, that **longest streak is
  present in all four habit states including 0**, and that at-risk renders the
  server's `currentStreak` unchanged. Explicitly asserts not-started and broken
  differ *only* by tag and longest-streak value, since they share the digit 0.
- **C3 — pluralisation.** `days(0) === "0 days"`, `days(1) === "1 day"`,
  `days(2) === "2 days"`, asserted through a rendered figure, not just the
  helper.
- **C4 — escaping, data half (the one that matters).** Render a habit named
  `<img src=x onerror="alert(1)">`, and also `"><script>alert(1)</script>`,
  `javascript:alert(1)`, `" onmouseover="x`, `__proto__`, and a 200-char
  string. For each: walk the whole vnode tree and assert (a) the name appears
  as a **string child**, byte-identical, (b) **no** vnode `tag` is derived from
  it — every tag is in a fixed allowlist of element names, (c) **no** prop
  value anywhere in the tree contains any part of the name, and (d) no vnode
  carries a key named `html`, `innerHTML`, or `dangerouslySetInnerHTML`. Also:
  `detailHref("javascript:alert(1)")` still starts with `#/habit/`.
- **C5 — screen-reader sentences.** The four fixed-field-order sentences from
  `04-ui.md` §4 render verbatim for the four states, and the live-region string
  renders verbatim for a `changed: true` log.
- **C6 — the non-oracle over the UI.** Selecting `#/habit/<never-existed>` and
  `#/habit/<belongs-to-another-user>` (which, to the client, is simply an id
  absent from its list) produce **deep-equal** vnode trees — same branch, same
  constant, same DOM. And `mapLogResponse` returns a deep-equal `{kind:"gone"}`
  for two 404 responses with *different bodies*, proving the body is never
  inspected.

### `test/client-static.test.js` — source-text assertions over `src/client/`

- **C7 — no gamifying motion.** `app.css` contains no `@keyframes`, no
  `animation`, no `transition`. Zero matches.
- **C8 — banned tokens.** The §3.5 regex matches zero times across every file
  in `src/client/`: `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
  `document.write`, `createContextualFragment`, `eval(`, `new Function`,
  `document.title`, `console.`, `Date`, `srcdoc`, `javascript:`, `on*="`,
  `debugger`. Failure message names the file and line.
- **C9 — `index.html` is inert.** Every `<script>` is `src`-only with
  `type="module"` and no inline content; no `on*=` attribute; no `style=`
  attribute; no inline `<style>`; exactly one `aria-live` region.
- **C10 — allowlist and disk agree.** Every `STATIC` key maps to a file that
  exists, and every file in `src/client/` is reachable through exactly one key
  — no unserved file, no missing asset.

### `test/client-dom.test.js` — `dom.js` against a hostile stub document

A ~60-line stub `document` built in the test file (zero dependencies) that
records `createElement` / `createTextNode` / `setAttribute` /
`addEventListener` calls, and whose elements **throw** on assignment to
`innerHTML` / `outerHTML` or on `insertAdjacentHTML`. It is a trap, not a
serializer: it proves what `dom.js` actually reaches for.

- **C11 — the name arrives as character data.** Mounting a row for
  `<img src=x onerror="alert(1)">` results in exactly one `createTextNode` call
  carrying the byte-identical string, zero `setAttribute` calls whose value
  contains any part of it, and zero touches of any HTML-parsing sink.
- **C12 — attribute refusals.** `setProp` throws for `onclick`, `ONERROR`, and
  any `/^on/i` name; and for `src`, `srcdoc`, `style`, `formaction`, and any
  name outside `ALLOWED_PROPS`.
- **C13 — `href` is scheme-proof.** Throws for `javascript:alert(1)`,
  `data:text/html,x`, `//evil.example`, `http://x`; accepts `#/habit/habit_1`.
- **C14 — listeners are functions only.** `on: {click: fn}` calls
  `addEventListener`; `on: {click: "alert(1)"}` throws.

### `test/client-server.test.js` — the static route over real HTTP

Same harness style as `test/server.test.js` (ephemeral port, captured log).

- **C15 — `GET /`.** 200; `content-type: text/html; charset=utf-8`;
  `cache-control: no-store`; `x-content-type-options: nosniff`; a CSP header
  containing `default-src 'none'` and **not** containing `unsafe-inline` or
  `unsafe-eval`; body byte-equals `src/client/index.html`.
- **C16 — the other six assets and the negative space.** Each declared path
  returns 200 with its declared content type. `POST /app.js` → 404 JSON.
  `/app.css/../server.js`, `/%2e%2e/server.js`, `/../src/server.js`,
  `/client/app.js`, `/app.js%00.txt`, `/APP.JS` → all 404 JSON
  `{"error":"not found"}`, and no response body ever contains a byte of
  `src/server.js`.
- **C17 — assets carry no user data.** 200 without an `X-User-Id` header, and
  byte-identical bodies for two different user ids.
- **C18 — logging.** Every static hit logs a template drawn from exactly the
  `STATIC` keys (pinned against the table, per §9.1), and a request for
  `/nope?name=<script>alert(1)</script>` still logs `(unmatched)` with no
  request-derived text.
- **C19 — nothing else moved.** `/health`, `GET|POST /habits`, the completions
  404 non-oracle, and the 413 `Connection: close` path behave exactly as before
  — i.e. the existing suite passes unmodified apart from the S24 widening.

### Manual check (QA, not automated)

One pass in a real browser: tab through the list (two stops per row, in order),
activate the log control with Space and confirm focus does not move, confirm
the live region announces once, and view a habit named with markup to confirm
it displays as literal text. Recorded in the QA artefact, not asserted in CI —
no browser automation is being added to a dependency-free repo.

## 11. Handoff

**To Implementation.** Build order that keeps the risky part first and testable
before anything renders: `copy.js` → `render.js` (+ C1–C6) → `dom.js`
(+ C11–C14) → `index.html`/`app.css` (+ C7–C10) → `app.js`/`boot.js` → the
static route in `src/server.js` (+ C15–C19, and the S24 widening). Do not
start with the HTML.

**To Security.** The whole trusted surface is `src/client/dom.js` (~40 lines)
plus `sendStatic` in `src/server.js`. §3.7 states what a bypass would require;
§3.8 states what this design does not claim to stop. The escaping boundary is
where extra depth is pre-authorised.

**Known follow-ons, not silently assumed away:** per-user timezone correctness
(already flagged in `03-ux.md` §4); real authentication (still self-asserted
`X-User-Id`, still loopback-only); habit creation from the UI (out of scope, so
a fresh instance shows the empty state); Unicode/bidi display spoofing inside a
habit name (§3.8).
