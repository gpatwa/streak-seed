# Security & Privacy Review — StreakKeeper browser client

> Stage 5 (Security & Privacy) · Owner: Security & Privacy (adversarial, independent)
> Slice: `browser-client` · Depth: **standard**, with an approved overrun spent on
> the rendering boundary (§1), because this slice introduces the product's first
> XSS surface.
>
> Scope: `src/client/*`, `src/server.js` static route and headers, against
> `01-arch.md` (design), `02-impl.md` (including `## Rework — QA round 1`), and
> `03-qa.md` (QA's FAIL, now fixed). Every claim below was re-derived: a
> purpose-built adversarial probe against the real `dom.js`/`render.js`, a live
> server, and a live Chromium session. Nothing here is taken from QA on trust —
> where I reached the same conclusion, I say so and say by what independent means.
>
> **No source file was modified by this review.** The probe server was started on
> port 3971 and killed afterwards (confirmed connection-refused).

---

## Summary of findings

| # | Area | Finding | Classification |
|---|------|---------|----------------|
| — | §1 Rendering boundary | The "unsafe path does not exist" claim **holds**. No value reaches the DOM as markup. | **PASS** |
| F-1 | §1 `setProp` href guard | `String(value)` is evaluated **twice** — once to validate, once to set. A stateful `toString` defeats the guard. Unreachable today; CSP blocks the outcome. | Advisory (latent) |
| F-2 | §1 `create()` tag handling | `vnode.tag` is passed to `createElement` unvalidated; `script`/`iframe`/`object`/`base` all construct. Unreachable today — no data-derived tag exists. | Advisory + precondition |
| — | §2 CSP | Correctly delivered, genuinely **enforcing**, covers what it claims. Nothing needs `unsafe-inline`. | **PASS** |
| F-3 | §2 CSP | No `require-trusted-types-for 'script'` — the markup-sink ban is review-enforced, not browser-enforced. | Advisory |
| — | §3 Static route | No traversal surface. Verified against 30 probes including encoded, NUL, case, and prototype-key confusion. | **PASS** |
| F-4 | §3 Headers | JSON responses omit `x-content-type-options: nosniff` — and the JSON route is the **only** response carrying free text. Not reachable by navigation today. | Advisory + precondition |
| — | §4 Invariant §6 in the browser | No habit name in logs, console, `document.title`, or any URL. 68 live log lines, zero free text. | **PASS** |
| — | §5 Non-oracle under the UI | Survives, and is **stronger** in the client than at the HTTP layer: zero network requests for foreign *or* fake. | **PASS** |
| — | §6 The focus fix | The derived id cannot become an injection or a leak. | **PASS** |

**Verdict: PASS.** No blockers, no required fixes. Four advisories, two of which
carry preconditions for future slices (§7).

---

## 1. The rendering boundary — is the unsafe path absent, or merely unused?

The design's central claim (`01-arch.md` §3.1): *"there is no escaping, because
there is no markup… the client never constructs markup from data."* Its strength
rests on a representational argument — a vnode child can only be a string or
another vnode, so a caller **cannot express** "this string is markup."

I did not accept that argument. I built an independent probe
(scratchpad, not in the repo) that mounts the **real** `render.js` + `dom.js`
against a recording DOM stub which (a) traps `innerHTML`, `outerHTML`,
`insertAdjacentHTML`, `srcdoc`, `src`, `href`, `style`, `onclick`, `onerror`,
`textContent`, `document.write`, `createRange`, `createElementNS` and
`document.title`, (b) records **every** `createElement` tag, **every**
`setAttribute` name and value, and **every** text node, and (c) mimics the real
DOM's name validation so that an invalid tag or attribute name throws as it
would in a browser. This differs from QA's probe in kind: QA asked "did a trap
fire?"; I additionally asked "what is the complete set of tags and attribute
names this pipeline can produce, and can any of them be steered?"

### 1.1 Untrusted free text — 12 hostile names, whole-pipeline

Twelve names through `HabitRow` + `HabitDetail` + the live-region `setText`,
including `<img src=x onerror=alert(1)>`, `</span><script>alert(document.domain)</script>`,
`" onmouseover="alert(1)`, `<svg><animate onbegin=alert(1)>`,
`<iframe srcdoc="<script>…">`, `<style>*{background:url(//evil)}</style>`,
`<base href="//evil/">`, `<!--<script>-->`, `]]><script>…`, `javascript:alert(1)`,
`__proto__`, `constructor`.

Result for **all twelve**: the name appeared only ever as `createTextNode`
argument content (7 text nodes per pass — row, sr-sentence, link label, detail
heading, button label, live region), **attribute leaks = 0**, **sink trips = 0**,
no exception. The exhaustive sets the pipeline produced across every case:

- tags: `li, span, a, button, div, h1, p, ul` — all literals from `render.js`
- attribute names: `class, aria-hidden, href, type, id` — all literals

That is the point worth stating precisely: the name is not *escaped* into an
attribute or a markup string, it never enters one. **There is no attribute,
URL, script, or style context anywhere in the client that a habit name can
reach.** The set of attribute values in the whole client is closed and
author-written.

Confirmed live in Chromium (§1.5), which is the evidence that matters: each
hostile name is a **single node of type 3 (text)**, re-serialising as
`&lt;img src=x onerror=alert(1)&gt;`. Zero `img`, `iframe`, `svg`, `style`, or
`base` elements exist in the document; `script` count stays at 1 (`boot.js`).

### 1.2 Attribute allowlist — 28 bypass attempts

`style`, `src`, `srcdoc`, `formaction`, `xlink:href`, `is`, `name`, `target`,
`rel`, `data-x`, `toString`, `constructor`, and a newline-embedded `"href\nx"`
all throw `attribute not allowed`. `onclick`, `onClick`, `ONCLICK`, `oNerRor`
throw `event-handler attributes are not settable` — the `/^on/i` test is
correctly case-insensitive, and correctly sits **before** the allowlist check so
the error message cannot itself become a distinguisher. `href` with
`javascript:`, `data:text/html,…`, `//evil.example`, and a leading-space
` #/ok` all throw; only `#/…` passes.

Prototype pollution: a `props` object produced by `JSON.parse('{"__proto__":…}')`
has a genuine **own** `__proto__` key, so `Object.entries` yields it — and it
hits the allowlist and throws. `Object.prototype` was verified unpolluted after.
The `on` prop rejects a non-function listener (`on: {click: "alert(1)"}` and
`on: "click"` both throw); it does not restrict the event *name*, which is
correct and harmless since only a function value can ever be registered.

**No bypass found.** The allowlist is a genuine allowlist, not a denylist with
gaps.

### 1.3 F-1 — `setProp`'s href guard evaluates `String(value)` twice *(advisory, latent)*

`src/client/dom.js:28-31` validates one stringification and then sets a
**second, independently computed** one:

```js
if (name === "href" && !String(value).startsWith("#/")) {
  throw new TypeError("href must be an in-app hash route");
}
el.setAttribute(name, String(value));
```

A value whose `toString` is stateful passes the guard and then delivers
something else. Probed directly:

```
href = object whose toString flips after the startsWith check
        ok: ["a","href","javascript:alert(1)"]
```

The guard was defeated. This is a real shape defect in a control the arch doc
explicitly cites (§3.3), and it is the one thing in the boundary I found that
the authors did not.

**Why it is advisory and not a blocker**, stated honestly rather than
minimised: `href` is set at exactly one call site — `detailHref(view.habitId)`
in `render.js:94` — which returns a template literal, i.e. always a primitive
string, for which double-stringification is a no-op. No path in this slice can
deliver a non-primitive to a prop. And the outcome is independently blocked: I
confirmed live that a `javascript:` URL navigation on this page is blocked by
CSP (`script-src-elem`, disposition `enforce`, §2.2) — so even a reachable
version of this bug would not execute in a compliant browser.

**Recommended one-line fix** (not a gate condition): stringify once —
`const v = String(value);` — then validate and set `v`. It costs nothing and
turns a discipline-dependent control into a structural one, which is the
design's own stated philosophy.

### 1.4 F-2 — `create()` does not validate `vnode.tag` *(advisory + precondition)*

`create()` passes `vnode.tag` straight to `createElement`. The comment says
*"tag is always a literal from render.js"* — true today, and I verified it
(§1.1: the produced tag set is exactly the eight literals). But it is an
invariant maintained by `render.js` discipline, asserted in a comment, in the
one module that carries the whole safety claim. Probed:

```
tag = "script" | "iframe" | "object" | "embed" | "base" | "link" | "meta" | "style"  -> all construct
tag = "<img>" | "img src=x" | 42 | null                                              -> all throw
```

Two things are worth separating. First, **no markup path exists even here**:
`createElement` validates against the XML Name production, so `"<img src=x…>"`
throws `InvalidCharacterError` rather than being parsed. What is unconstrained
is the *element type*, not the syntax. Second, reachability: to choose a tag an
attacker would have to place a vnode-shaped **object** into `children` where a
string is expected. The only data entering the tree is the `HabitView` from
`GET /habits`, and `src/server.js:313` rejects a non-string `name` at creation,
so a habit name can never be an object. Under the current data flow this is
unreachable.

Related and genuinely good: the failure mode is **fail-closed**. A `null`,
number, or array child throws rather than rendering — so a future author writing
`{cond && vnode}` gets a loud crash, not a silent hole.

The precondition this generates is in §7.

### 1.5 Live browser confirmation

Real Chromium against the real server, four seeded habits (three hostile names,
one ordinary), user `local`:

```
names[].childNodeTypes : [3] for all four            (single text node each)
names[].innerHTML      : &lt;img src=x onerror=alert(1)&gt;  (entity-escaped on re-serialisation)
#app element types     : UL, LI, SPAN, A, BUTTON     (five, all author-chosen)
#app attribute names   : class, aria-hidden, href, type, id
img/iframe/svg/style/base in document : 0 / 0 / 0 / 0 / 0
<script> in document   : 1   (boot.js, from index.html)
document.title         : "StreakKeeper"  (unchanged)
```

The live-region announcement — which interpolates the habit name into a
sentence, the one place a name is *concatenated* with other copy — is likewise a
single text node: `liveRegionChildTypes: [3]`, `innerHTML` entity-escaped.

### 1.6 Verdict on the claim

**The unsafe path does not exist. The claim holds, and it holds structurally,
not by luck.** The reason it holds is worth recording, because it is the part a
future slice can break without noticing:

1. `dom.js` has **no parameter anywhere that means "HTML"** — not a flag, not an
   alternative child kind. The unsafe request is unrepresentable at the type
   level, so it cannot be made accidentally at a call site.
2. The one place a string becomes a node is `createTextNode`, on the `typeof
   child === "string"` branch. There is no second string sink.
3. Attributes are a closed allowlist of 12 names, checked before any write, with
   the `/^on/i` rejection ahead of it, and every value in the client is an
   author-written literal.
4. `document` is referenced in exactly four places, all in `dom.js`, all safe
   APIs (`createElement`, `createTextNode`, `getElementById`) — verified by grep;
   `app.js` and `render.js` touch no DOM at all.
5. CSP is a real second layer, not a claimed one (§2).

The two advisories (F-1, F-2) do not weaken this verdict: both are latent shape
defects in a boundary that is otherwise sound, neither is reachable, and one of
the two is independently covered by CSP. I flag them because the design's own
argument is *"safety should not be a property of discipline at N call sites"* —
and these two are exactly where discipline is still load-bearing.

---

## 2. The CSP — effective, correctly delivered, and actually enforcing?

### 2.1 Delivery

Live against a running server:

```
GET /        200  content-security-policy: default-src 'none'; script-src 'self'; style-src 'self';
                  connect-src 'self'; img-src 'none'; font-src 'none'; base-uri 'none';
                  form-action 'none'; frame-ancestors 'none'
                  x-content-type-options: nosniff · content-type: text/html; charset=utf-8 · cache-control: no-store
GET /app.js  200  (no CSP — correct; CSP governs documents, not subresources)
```

Delivered as a **response header**, not a `<meta>` tag (confirmed:
`document.querySelector('meta[http-equiv]')` is `null`), which is the stronger
form — a header-delivered policy applies to the document from the first byte and
can express `frame-ancestors`, which `<meta>` cannot. It is attached in
`src/server.js:60` to the `/` entry only, and `/` is the only route that serves
HTML, so coverage is complete rather than accidentally partial.

### 2.2 Enforcement — verified, not assumed

A header being present is not evidence a policy works. I attached a
`securitypolicyviolation` listener in the live page and then attempted five
violations:

```
inline <script> injected into the document   -> blocked, script-src-elem, disposition "enforce", did NOT run
javascript: URL navigation via <a>.click()   -> blocked, script-src-elem, disposition "enforce", did NOT run
inline on*= handler attribute + .click()     -> did NOT run
cross-origin <link rel=stylesheet>           -> blocked, style-src-elem
same-origin <img src=/app.css>               -> blocked, img-src
<iframe src=http://example.com>              -> blocked, frame-src
```

Every disposition is `enforce`, not `report`. Two of these matter beyond
box-ticking:

- **The `javascript:` URL block is the layer behind F-1.** The one latent defect
  I found in the escaping boundary produces, at worst, a `javascript:` href —
  and that is independently dead on this page.
- **`img-src 'none'` closes CSS-based exfiltration.** If a future author ever
  interpolated user text into a `class` attribute (allowed by the allowlist, and
  harmless for markup since it goes through `setAttribute`), the classic
  CSS-selector data-exfil technique needs an outbound request. `default-src
  'none'` with `img-src 'none'` and `font-src 'none'` means the page cannot make
  one at all. That is real defense in depth, not a coincidence.

### 2.3 Does anything require `unsafe-inline` in practice?

**No — verified by construction, not by reading the header.** All scripts are
external ES modules (`<script type="module" src="/boot.js">`); the only
stylesheet is `<link href="/app.css">`; `app.css` contains zero `url()`,
`@import`, `expression`, or `behavior` (grepped); event handlers are registered
with `addEventListener` via `dom.js`'s `on` prop, which CSP does not restrict;
and `dom.js`'s allowlist has no `style` attribute, so no inline style can be set
even by a buggy caller. The policy is not aspirational — the app runs under it
with no violations of its own (the only violations recorded were the ones I
injected).

Coverage check against the directives that matter and are *absent*: `object-src`,
`frame-src`, `media-src`, `worker-src`, `manifest-src` are all correctly
inherited from `default-src 'none'`. `base-uri 'none'` blocks the `<base>`
injection a markup bug would otherwise enable; `form-action 'none'` blocks
exfil-by-form; `frame-ancestors 'none'` covers clickjacking (so a separate
`X-Frame-Options` is redundant, not missing). No `Referrer-Policy` is set, but
there is no referrer surface: `href` is restricted to `#/` fragments, fragments
are never sent in `Referer`, and there are zero outbound links.

### 2.4 F-3 — no Trusted Types *(advisory)*

`require-trusted-types-for 'script'` is not in the policy. Adding it would make
the design's own central rule — "no markup sinks" — **enforced by the browser at
runtime** rather than by a source-text scan (C8) plus review. Today an
`innerHTML` assignment introduced in a future edit is caught by C8; with Trusted
Types it would additionally throw in the browser even if the scan were bypassed
(e.g. by string concatenation of the property name, which C8's plain-text match
would miss). Advisory rather than required because (a) enforcement is
Chromium-only, so it is defense in depth and not a control to rely on, and (b)
the sinks genuinely are not there today.

**§2 verdict: PASS.** The CSP is correctly delivered, genuinely enforcing,
covers everything it claims, and requires no `unsafe-inline`. It is a real
second layer and I would cite it as one.

---

## 3. The static route — is "no traversal surface" true?

The claim (`src/server.js:16-26`): a frozen allowlist mapping request pathname →
asset, with no path ever joined onto a directory, so "the absence of `path.join`
is the control."

**Verified, and the mechanism is stronger than the comment claims.** Three
independent reasons traversal cannot occur:

1. **No join, no filesystem call per request.** `pathname` is used only as a
   lookup key. `readFileSync` runs once at *import*, over `new URL(file,
   CLIENT_DIR)` where `file` comes from the frozen table — never from a request.
   Confirmed by reading the module: there is no `fs` call inside `handleRequest`.
2. **`Object.hasOwn`, not `in` or `[]`.** This is the detail that would have been
   easy to get wrong. `/constructor`, `/__proto__`, `/toString`, `/valueOf`,
   `/hasOwnProperty` all 404 — prototype-key confusion cannot select a route or
   produce a truthy match against a missing asset.
3. **No decoding anywhere.** `pathname` is `req.url` sliced at the first `?`,
   never `decodeURIComponent`'d, so an encoded traversal is a literal string that
   simply is not a key.

Live probe, 30 paths (superset of QA's six):

```
200  /  /app.css  /app.js  /boot.js  /copy.js  /app.js?x=%3Cscript%3E
404  /../src/server.js   /%2e%2e/server.js   /%2E%2E%2Fserver.js   /%2f%2fapp.js
404  /app.js%00   /app.js%00.txt   /app%2Ejs   /app.js%20   //app.js   /./app.js   /app.js/
404  /APP.JS   /App.js                                   (exact-match, case-sensitive)
404  /constructor  /__proto__  /toString  /valueOf  /hasOwnProperty
404  /index.html  /client/app.js  /src/client/app.js  /.git/config  /package.json
```

Note `/index.html` is 404 — the file is reachable only through `/`, so there is
exactly one URL per asset (pinned by test C10, which also asserts the mapping is
bijective with the contents of `src/client/`).

**Can asset bytes be influenced?** No. They are read once at import from
literal filenames and frozen; nothing request-derived reaches `readFileSync`,
and `sendStatic` writes `asset.body` verbatim. A consequence worth recording for
operations: assets are a **boot-time snapshot**, so editing `src/client/*` on a
running server changes nothing until restart. That is a hardening property (no
TOCTOU between check and serve), and it is also why a stale deploy would be
silent — `npm run build` exists to catch the missing-file case at import time.

Headers on static responses are right: `nosniff`, explicit `charset` on both
HTML and JS, `no-store`, and an accurate `content-length` computed from the
buffer.

### 3.1 F-4 — JSON responses omit `nosniff` *(advisory + precondition)*

```
GET /habits  200  content-type: application/json   cache-control: no-store   (no x-content-type-options)
```

`send()` and `sendAndClose()` in `src/server.js` set no `x-content-type-options`,
and no `charset` on the content type. The asymmetry is worth naming precisely:
the static route — which serves author-written, byte-identical-for-everyone
content — has `nosniff`; the JSON route — which is the **only** response in the
system carrying user free text (habit names, verified live returning
`{"name":"<img src=x onerror=alert(1)>",…}`) — does not.

**Not exploitable today**, and I want to be exact about why rather than hand-wave
it: every response that contains a habit name requires an `x-user-id` request
header, which a top-level browser navigation cannot send. Navigating to
`/habits` without the header yields a 400 whose body is a fixed constant. So
there is no way to get user-controlled bytes into a document a browser will
render, regardless of sniffing. It is a missing defense-in-depth header, not a
live vulnerability.

The precondition it generates is in §7.

**§3 verdict: PASS.** No traversal surface; the claim is accurate and the
mechanism is sound for reasons beyond the one the comment gives.

---

## 4. Invariant §6 over the browser

*"Audit / telemetry may carry habit IDs, counts, and streak numbers — never
habit names or other free text."* The invariant predates any markup path, so
the question is whether the browser introduced new sinks.

**Method — mine, and why QA's was sound too.** QA verified this by grep plus an
end-to-end read of `app.js`. That is a valid method for the client (the sink set
is small and the file is 178 lines) and I reproduced it, but grep alone cannot
prove a *runtime* sink stays clean. So I additionally drove the live app with
hostile-named habits and inspected both ends: the server's access log after the
full browser session, and the browser's own observable surfaces.

**Server access log — 68 lines from the entire hostile session**, including a
habit created with the name `<img src=x onerror=alert(1)> ‮evil`, a POST to
`/habits/%3Cscript%3E/completions`, and a GET with
`?name=<script>alert(1)</script>`:

```
$ grep -vE '^(GET|POST) (route-template-alternation) [0-9]{3} [0-9]+ms$'  srv.log
streak-seed listening on 127.0.0.1:3971          <- the startup banner, the only non-matching line
$ grep -cE '<|img|script|alert|Normal'  srv.log
0
```

Zero occurrences of any free text. The mechanism is sound and I checked it, not
just the output: `routeTemplate` is either a literal, `"(unmatched)"`, or — for
the static route — `pathname` itself, which is only assigned *after*
`Object.hasOwn(STATIC, pathname)` succeeds, so it is provably byte-equal to one
of seven literal keys. Request-derived in provenance, but not in content.

**Browser-side sinks:**

| Sink | Result |
|------|--------|
| `console.*` | Zero occurrences anywhere in `src/client/` (grep); zero console output in the live session. The `catch` blocks in `app.js` drop the rejected value rather than logging it. |
| `document.title` | Static `"StreakKeeper"` from `index.html`; confirmed unchanged live after logging a hostile-named habit. Never assigned (banned token in C8). |
| URLs | The only URLs the client constructs are `#/habit/<habitId>` and `/habits/<habitId>/completions` — both `habitId` (`habit_N`, server-assigned), both `encodeURIComponent`'d. Live: `location.href` stayed `http://127.0.0.1:3971/` and hashes were `#/habit/habit_2`. No name, ever. No query strings, no `history.pushState`. |
| Audit events | `habits.js` emits `{habitId}` and `{habitId, dayIndex, currentStreak, longestStreak}` — no name. Unchanged by this slice. |
| `localStorage` | Holds only the user id; never rendered, never in a URL, used solely as a `fetch` header value. |

The habit name appears in the DOM and the aria-live region — which is the
product, not a violation; §6 governs logs and telemetry.

**§4 verdict: PASS.** The invariant holds over the browser, verified at both
ends with hostile input.

---

## 5. The non-oracle survives the UI

The requirement: a real-but-foreign habit and a fabricated one must be
indistinguishable — to a user, and to anything observable in the client.

Live in Chromium, comparing the rendered `#app` subtree across four hash
navigations (`habit_1` is real but owned by another user; `habit_nope_99999`
never existed; the third is a hostile id):

```
#/habit/habit_1        (FOREIGN) -> <p class="error-notice error-notice-region" role="alert">This habit couldn't be found.</p>
#/habit/habit_nope_99999 (FAKE)  -> byte-identical
#/habit/"><script>alert(1)</script> -> byte-identical
identical_foreign_vs_fake            : true      (innerHTML AND textContent)
identical_foreign_vs_hostileId       : true
document.title in all cases          : "StreakKeeper"  (unchanged — no title-based distinguisher)

networkRequestsDuringForeign : 0
networkRequestsDuringFake    : 0
```

Two observations beyond QA's, which reached the same conclusion by reading
`renderDetail`/`mapLogResponse` and comparing live 404 bodies:

1. **The client's non-oracle is strictly stronger than the server's.** The
   HTTP layer makes foreign and fake return a byte-identical 404; the client
   never asks at all. `renderDetail` resolves habit existence entirely from
   `state.habits` — the array from the user's own `GET /habits` — so a foreign
   or fake id produces **zero network requests** (measured via
   `performance.getEntriesByType('resource')`, not inferred). There is no
   response body to compare, no status code, and no timing channel, because
   there is no request. This is the strongest form of the property and it
   should be preserved deliberately.
2. **The 404 path from `handleLog` is also non-distinguishing.** `mapLogResponse`
   returns `{kind:"gone"}` on status 404 **without reading the body** — so two
   different server error bodies could not produce two different UI states even
   if a future slice differentiated them. The client is defensively
   non-oracular, not merely passively so.

I also confirmed the dropped-habit path cannot leak: on `"gone"` the habit is
filtered out of `state.habits` and focus falls back to the `#app` landmark, and
the subsequent detail render for that id is the same constant as for a fake id.

**§5 verdict: PASS.** Foreign and fake are indistinguishable in the DOM, in
`document.title`, in the URL, and on the network.

---

## 6. The focus fix — can the derived id become an injection or a leak?

The rework added the client's only `.focus()` and a DOM id derived from
`habitId`: `logControlId(habitId)` → `` `log-${habitId}` ``. The brief's concern
is right to raise — ids are attacker-influenced *if* `habitId` ever is.

**Is `habitId` attacker-influenced?** No. `src/services/habits.js:44` assigns
`` `habit_${++seq}` `` from a server-side counter. It is never derived from the
habit name and never accepted from a request. (`parseHash` *does* produce an
attacker-controlled string from the URL fragment, but it is only ever used as a
lookup key into `state.habits`; a value that does not match a server-assigned id
never reaches `logControlId`.) So the id is not attacker-influenced today.

**Would it matter if it were?** I probed the hostile case directly rather than
resting on that:

```
logControlId('" onmouseover="alert(1)')          -> 'log-" onmouseover="alert(1)'
  ...set via el.setAttribute("id", …)            -> stored as an attribute VALUE; setAttribute does not parse markup
restoreFocus('#app, script', fallback)           -> reaches document.getElementById('#app, script')  (returns null)
detailHref('javascript:alert(1)')                -> '#/habit/javascript%3Aalert(1)'
detailHref('../../evil')                         -> '#/habit/..%2F..%2Fevil'
detailHref('" onmouseover="alert(1)') -> setProp -> href='#/habit/%22%20onmouseover%3D%22alert(1)'
```

- **Not an injection.** The lookup is `document.getElementById`, **not**
  `querySelector` — so the id is a key, never a selector, and a value containing
  `"`, `>`, or `,` cannot escape into selector syntax. `render.js:27` calls this
  out explicitly and it is accurate. The write side is `setAttribute("id", …)`
  with a literal name, which validates the name (not the value) and creates no
  markup context.
- **Not a leak.** `log-<habitId>` exposes an id that is already present in the
  same row's `href` and in the client's own API calls, all within the user's own
  document. It contains no part of the habit name (verified live:
  `ids: ["app","log-habit_2","log-habit_3","log-habit_4","log-habit_5","live-region"]`
  for four habits whose names were hostile markup). The `log-` prefix also
  guarantees no collision with the two author-chosen ids (`app`, `live-region`),
  and ids cannot shadow the globals the client uses — `location`, `fetch`,
  `localStorage`, and `document` are accessors on `Window.prototype`, which takes
  precedence over the named-property object in the prototype chain, so DOM
  clobbering is not available here even in principle.

**The fix also works**, which I verified rather than assumed, since a
non-functional fix would return the slice to QA:

```
before click : activeElement id="log-habit_2"  (the <img src=x onerror=…> habit)
after  click : activeElement id="log-habit_2"  tag=BUTTON  label="Logged <img src=x onerror=alert(1)>"
sameNode     : false     <- the node WAS torn down and rebuilt; focus was genuinely re-acquired by id
```

`sameNode: false` is the meaningful assertion: it confirms the fix restores
focus to a *new* element rather than the test accidentally passing because
nothing re-rendered. QA's original defect (`activeElement: BODY`) does not
reproduce.

**§6 verdict: PASS.** The id derivation cannot become an injection or a leak,
and the fix does what it claims.

---

## 7. Preconditions for future slices

These are carried forward as conditions on *future* work, not conditions on this
slice's release.

1. **`dom.js` must validate `tag` before any client builds a vnode from data.**
   (From F-2.) Today `render.js` supplies only literal tags, so `create()` never
   sees a data-derived tag. The moment any slice constructs a vnode from server
   or user input — a rich-text field, a data-driven icon, a plugin — `create()`
   must (a) require `typeof vnode.tag === "string"` against a tag allowlist and
   (b) reject children that are neither a string nor a well-formed vnode. Without
   that, "you cannot express HTML in this representation" becomes "you cannot
   express HTML *provided render.js stays disciplined*."
2. **Stringify once in `setProp`.** (From F-1.) Any slice that passes a
   non-primitive prop value — a URL object, a number, anything with a custom
   `toString` — makes the double-evaluation reachable. Fix it before then, not
   after; it is one line.
3. **Add `nosniff` to JSON responses before habit data becomes reachable by
   navigation.** (From F-4.) The current safety rests entirely on `x-user-id`
   being a required *request header*. Any move to cookie/session auth, a
   query-parameter user id, or an HTML-rendering endpoint makes the
   free-text-carrying JSON response navigable, at which point the missing header
   matters. Adding `x-content-type-options: nosniff` and
   `charset=utf-8` to `send()`/`sendAndClose()` now removes the dependency.
4. **Preserve "the client never asks."** (From §5.) The non-oracle in the client
   is currently absolute because a foreign/fake detail view generates zero
   network traffic. Introducing a `GET /habits/:habitId` endpoint, prefetching,
   or any analytics beacon on the detail route would reintroduce a timing and
   traffic side channel that the HTTP-layer 404 alone does not close. This is a
   stronger form of the precondition `runs/greenfield/08-security.md` carried
   into the HTTP slice, and it must survive the same way.
5. **`habitId` remains sequentially enumerable** (`habit_${++seq}`), already
   dispositioned in `runs/greenfield/08-security.md` and reaffirmed in
   `runs/http-layer/04-security.md`. This slice does not change it: exposing the
   id in a URL fragment and a DOM id adds no reachability beyond what the API
   response already gave the same user. The ownership gate in `logCompletion`
   remains the sole IDOR defense and is still correctly placed before any `Set`
   touch. **Not re-raised as a new finding.**
6. **CSP must move with the app.** If a future slice adds an image, a font, an
   external API, or an inline style, the correct response is to add the narrowest
   directive — never to reach for `unsafe-inline`, which would silently retire
   the second layer that currently backstops F-1.

---

## 8. What I did not find

Stated so the absence is on record rather than implied:

- No markup path from a habit name — not via attributes, `href`, event handlers,
  `<style>`, SVG, or `srcdoc`. Each was probed individually (§1.1–§1.2).
- No CSP bypass, and no directive that the app's own behavior forces open (§2.3).
- No path traversal, encoded or otherwise, and no way to influence asset bytes
  (§3).
- No habit name in any log, console, title, or URL (§4).
- No distinguisher between foreign and fake, including timing and network
  traffic (§5).
- No injection or leak via the focus fix's derived id (§6).

I did not audit: the streak/day-boundary logic (unchanged this slice, covered by
`runs/greenfield/08-security.md`), the 413/body-cap path (covered by
`runs/http-layer/04-security.md`), or the loopback bind (unchanged, `127.0.0.1`,
verified still explicit at `src/server.js:395`).

---

## Verdict: **PASS**

No blockers. No required fixes. No conditions on release.

The design's central claim — *there is no escaping, because the client never
constructs markup* — **is true, and it is true structurally**. `dom.js` exposes
no parameter that means "HTML"; every string child becomes a `createTextNode`;
the attribute allowlist is a genuine allowlist that survived 28 bypass attempts
including case-varied handlers and a real own `__proto__` key; the tag and
attribute-name sets the whole client can produce are closed and author-written;
and a header-delivered `default-src 'none'` CSP was confirmed *enforcing* — not
merely present — in a live browser, blocking inline script, `javascript:` URLs,
and every outbound request class. Twelve hostile habit names rendered as literal
text in real Chromium, each as a single text node, with zero elements of any
dangerous type created. This is a better outcome than an escaping-based design
would have produced, and the reason is the one the arch doc gives: safety here is
a property of the representation, not of discipline at N call sites.

Four advisories are recorded, none reachable: the `href` guard's double
stringification (F-1, and CSP independently blocks its outcome), the unvalidated
`vnode.tag` (F-2), the absent Trusted Types directive (F-3), and the missing
`nosniff` on JSON responses (F-4). Three of them generate preconditions for
future slices (§7) — which is the honest characterisation: they are places where
the boundary still depends on authorial discipline, in a design whose whole
argument is that it should not.

QA's blocking finding is fixed and re-verified independently: focus returns to
the log control after logging, on a genuinely rebuilt node, and the id the fix
introduced is neither an injection vector nor a leak.

**Cleared for Release.**
