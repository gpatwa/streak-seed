# Security & Privacy Re-gate — security-hardening

> Stage 4 · Owner: Security & Privacy · Depth: **standard** (one item taken to
> adversarial depth by instruction: "did the new validation code open a surface
> of its own?")
> Scope of the gate: the uncommitted working tree against `HEAD` (`c607707`).
> This is a re-gate of my own prior review, `runs/browser-client/04-security.md`,
> whose §1.3 / §1.4 / §2.4 / §3.1 findings are the specification for this slice.

## Verdict (stated up front)

# **CONDITIONAL PASS**

One new **required-fix** finding (**F-5**), raised against the F-2 fix itself.
It is **not reachable under the current data flow** — hence not a blocker, and
not a FAIL. It is not an advisory either, because it is the *exact defect class
this slice exists to eliminate*, reproduced inside the fix that was supposed to
eliminate it, and because leaving it unfixed makes the slice's own record
inaccurate: precondition §7.1 would be struck when it has only been narrowed.

The condition and its two discharge routes are in §8. Everything else in the
slice is closed by the mechanism claimed.

| # | Finding | Severity | Reachable today? |
|---|---------|----------|------------------|
| F-1 | `setProp` double stringification | **CLOSED** | — |
| F-2 | `create()` unvalidated `vnode.tag` | **CLOSED for a plain-data `tag`; see F-5** | — |
| F-3 | CSP lacks Trusted Types | **CLOSED** | — |
| F-4 | JSON responses lack `nosniff` | **CLOSED** | — |
| **F-5** | **`create()` reads `vnode.tag` three times — validates one read, uses another** | **required-fix** | **No** (needs a data-derived vnode *object*; none exists) |

---

## 0. Method — and what I refused to take on trust

I did not accept `01-impl.md` or `02-qa.md`. Specifically:

| Claim | Their evidence | My independent means |
|---|---|---|
| The four fixes are present as described | diff quoted in `01-impl.md` | `git diff` read directly; `src/client/dom.js` and `src/server.js` read at their current state, not as quoted |
| The tag allowlist is neither too narrow nor too wide | derivation narrated in `01-impl.md` §F-2 | re-derived by grep over `src/client/*.js` (§3 below) — produced the identical 9-element set from source, without reading their derivation first |
| `npm test` is green and no test was lost | 90/90 reported | ran `npm test` myself: **tests 90 / pass 90 / fail 0**, ≥ the 84 required by success criterion 2 |
| The new validation opens no new surface | C21/C21b assert the fix works | **60+ hostile inputs driven through `mount()` against a stub `document`** in a scratchpad probe — the standard my predecessor set: *does the unsafe path exist, or is it merely unused* (§4). This is what found F-5, which no existing test covers |
| No JSON path escapes the `nosniff` fix | S32/S32b cover `send`/`sendAndClose` | enumerated **every** `writeHead` in `src/server.js` (3 total) and confirmed each is covered (§6) |

Probe files live only in the scratchpad; nothing was written to the repo outside
`runs/security-hardening/`. I did not modify `src/` or `test/`.

---

## 1. F-1 — `setProp` stringifies once *(CLOSED)*

The fix, as landed:

```js
const v = String(value);
if (name === "href" && !v.startsWith("#/")) throw new TypeError(...);
el.setAttribute(name, v);
```

**Is `String(value)` genuinely single-evaluation on every path through
`setProp`?** Traced all four exits:

| Path | Behaviour |
|---|---|
| `name === "on"` | returns before `const v` is reached — `String` is never called at all; the branch only does `Object.entries(value)` and a `typeof fn === "function"` check |
| `/^on/i.test(name)` | throws before `const v` |
| `!ALLOWED_PROPS.has(name)` | throws before `const v` |
| allowlisted prop (incl. `href`) | **exactly one** `String(value)`, and the same binding `v` is both validated and written |

There is no second `String(value)` anywhere in the function, and `v` is a `const`
so it cannot be rebound between the check and the write.

Confirmed empirically rather than by reading (probe P4):

```
href stateful toString (#/ok then javascript:)  -> OK
  toString calls: 1   setAttribute: [["a","href","#/ok","string"]]
class stateful toString (non-href prop)         -> OK
  toString calls: 1   setAttribute: [["div","class","v1","string"]]
```

`toStringCalls === 1` is the load-bearing assertion — stronger than "the
attribute value is safe", because it proves *there is no second conversion to
win*, not merely that this particular attacker lost. Note the non-`href` case:
even props with no content guard are now written from the single conversion, so
a stateful value cannot deliver a different `class`/`id`/`aria-label` than the
one that passed through the function. That is a small bonus the finding did not
ask for.

**Failure modes of the single conversion** (asked explicitly in the brief), all
probed:

| Input | Result | Assessment |
|---|---|---|
| `toString` throws (`RangeError`) | the `RangeError` propagates out of `setProp` → `create` → `mount`; **`replaceChildren` is never reached**, so the previous DOM stands and nothing partial is attached | fail-closed, acceptable |
| `toString` returns a Symbol | `TypeError: Cannot convert a Symbol value to a string` from `String()` itself | fail-closed |
| value *is* a Symbol | `String(sym)` is special-cased and yields `"Symbol(#/x)"`, which fails `startsWith("#/")` → `TypeError: href must be an in-app hash route` | fail-closed, and correctly so |
| `Symbol.toPrimitive` present | invoked once, result used for both check and write | consistent with the fix |
| value `null` | `"null"` written to a non-`href` prop; would fail the `href` guard | unchanged pre-existing behaviour |

The distinction that matters: the pre-fix bug was a **silent** bypass (no
exception, hostile value delivered). Every failure mode above is a *loud* one.
There is no input I found that produces a silent divergence between the
validated and the written value.

**F-1 is closed by the mechanism claimed, and it is closed structurally** — the
unsafe path does not exist, rather than being unused.

---

## 2. F-2 — `create()` validates `vnode.tag` *(closed for a plain-data tag; see F-5)*

The fix, as landed:

```js
if (typeof vnode.tag !== "string" || !ALLOWED_TAGS.has(vnode.tag)) {
  throw new TypeError("tag not allowed");
}
const el = document.createElement(vnode.tag);
```

plus the child-kind check inside the loop.

### 2.1 The allowlist itself — re-derived, not accepted

`01-impl.md` narrates a derivation. I did not read it before deriving my own.
Independent extraction from source:

```
$ grep -oE 'h\("[a-z0-9]+"' src/client/render.js | sort -u
h("a" h("button" h("div" h("h1" h("h2" h("li" h("p" h("span"

$ grep -rnE '\btag\s*:' src/client/*.js
src/client/app.js:60:  mount(root, { tag: "p",  props: { class: "loading" },     children: [COPY.loading] });
src/client/app.js:87:  mount(root, { tag: "ul", props: { class: "habit-list" },  children: rows });
```

Union = `{a, button, div, h1, h2, li, p, span, ul}` — **exactly** the 9 members
of `ALLOWED_TAGS`, in the same set. Not one tag wider (no theatre), not one
narrower (no breakage).

I also checked the first argument of every `h(` call site for a non-literal:
the only non-literal occurrences of `h(` in `render.js` are the definition on
line 14 and identifiers named `tag`/`children` being pushed into arrays — i.e.
**no computed tag exists anywhere in the client.** This matters more than the
set membership: it is the fact that makes F-5 (below) unreachable today, and it
is the fact a future slice would break first.

Probe P7 confirms all 9 still construct; probe P2/P3 confirm `script`,
`iframe`, `object`, `embed`, `base`, `link`, `meta`, `style` do not.

### 2.2 Order of operations — is there a gap where a prop is set before the tag is validated?

No. `create()` validates `vnode.tag` as its **first statement**, before
`createElement`, before `Object.entries(vnode.props)`, before any child. There
is no ordering in which an attribute reaches an element whose tag was not
checked.

The subtler ordering question is the recursion: the parent element is created
and its props are set *before* its children are validated. I probed whether that
leaks a partially-built tree into the live DOM:

```
after good mount, root children: 1 ['ul']
failed mount threw: tag not allowed
after FAILED mount, root children: 1 ['ul']      <- previous DOM intact
createElement during failed build: ['div']       <- detached, discarded
setAttribute during failed build: [['div','class','leaked']]
virgin root after failed mount, children: 0      <- nothing attached, ever
```

`mount()` is `parent.replaceChildren(...(vnode ? [create(vnode)] : []))` —
`create()` is evaluated as an *argument*, so a throw anywhere in the recursion
means `replaceChildren` is never called. The half-built element is unreachable
garbage; `addEventListener`/`setAttribute` calls made on it during the failed
build affect a detached node with no document connection. **Mount is atomic and
fails closed.** No ordering gap.

### 2.3 The child-kind check — does it reject everything non-vnode?

`typeof child === "string"` → text node (unchanged, still the only string sink).
Otherwise `child === null || Array.isArray(child) || typeof child !== "object"`
throws. Everything surviving that is a non-null, non-array object — which then
re-enters `create()` and must satisfy the tag check. Probed exhaustively:

| Child | Outcome |
|---|---|
| function | `TypeError: child must be a string or a vnode` |
| `undefined` | same |
| Symbol | same |
| `null` / number / array | same — **the pre-existing fail-closed behaviour survives**, which was the property my prior review called "genuinely good" (§1.4). It was worth checking: a check that admits `{cond && vnode}` silently would have been a regression dressed as a fix |
| `new String("hi")` / `new Number(1)` (boxed primitives) | pass the child check (they *are* objects), then fail on `tag` → `TypeError: tag not allowed`. Correct outcome by a second gate, not the first |
| `Object.create(null)` | `tag not allowed` — note this works only because `ALLOWED_TAGS` is a `Set`; see §4.1 |
| array-like `{length:1, 0:"x"}` | `tag not allowed` |
| `Proxy` over `[]` | `Array.isArray` pierces the Proxy → rejected by the child check |
| `{ tag: new String("div") }` | `typeof !== "string"` → rejected. A boxed tag cannot pass |
| object with a plain `tag` getter returning `"script"` | `tag not allowed` |
| object with a **stateful** `tag` getter | **CONSTRUCTS `<script>` — see F-5** |

So the child-kind check does its job: nothing that is not an object reaches
`create()`, and nothing whose `tag` is not a plain allowlisted string survives
the tag check — *provided `tag` reads the same value each time*. It does not.

---

## 3. F-5 (new) — `create()` reads `vnode.tag` three times *(required-fix, not reachable today)*

**This is the F-1 defect, reproduced inside the F-2 fix.**

```js
if (typeof vnode.tag !== "string" || !ALLOWED_TAGS.has(vnode.tag)) {   // read 1, read 2
  throw new TypeError("tag not allowed");
}
const el = document.createElement(vnode.tag);                          // read 3
```

`vnode.tag` is a property access, not a binding. If it is an accessor — or a
Proxy trap — the three reads can return three different values. The validation
inspects reads 1 and 2; `createElement` consumes read 3.

Reproduced directly (probe P1):

```
tag getter: returns "div" on reads 1-2, "script" on read 3
  -> OK   created=[script]        tag reads observed: 3

same object as a nested CHILD vnode
  -> OK   created=[div, script]   child tag reads observed: 3

Proxy vnode whose get('tag') is stateful
  -> OK   created=[iframe]        proxy tag reads: 3
```

No exception. `<script>` and `<iframe>` were constructed by the very function
whose new first statement exists to prevent exactly that. This is precisely the
shape my prior review recorded at §1.3: *"validates one stringification and then
sets a second, independently computed one."* Here it is *validates one property
read and then constructs from a third*.

### Is it reachable? No — and I want to be exact about why, not hand-wave it

To exploit F-5 an attacker must place an **object carrying an accessor for
`tag`** into the vnode tree. The only data entering the tree is the `HabitView`
list from `GET /habits`, and:

- `src/server.js:314` rejects a non-string `name` at creation
  (`typeof rawName !== "string" || rawName.trim().length === 0` → 400), so a
  habit name is always a primitive string;
- the response is parsed by `JSON.parse`, which cannot produce an accessor;
- **no client call site computes a tag** — verified by grep in §2.1: every
  `create()` input is an object literal written by an author, with a string
  literal `tag`.

So the same reachability argument that made F-2 an advisory makes F-5 an
advisory-by-reachability. **It is not exploitable in this build and I am not
claiming it is.** CSP is also still a real second layer behind it: an injected
`<script>` cannot execute under `script-src 'self'`, `<iframe>`/`<object>` fall
back to `default-src 'none'`, `<base>` is barred by `base-uri 'none'`.

### Why it is a **required-fix** and not an advisory

Three reasons, stated so the Release Manager can overrule them knowingly:

1. **The slice's stated purpose is to eliminate this defect class.** F-1 and
   F-5 are the same bug. Shipping a slice that closes one and opens the other
   in the adjacent function is not a partial win; it is the win being reported
   inaccurately.
2. **Without the fix, precondition §7.1 cannot be struck** (see §8). The record
   would say "`create()` now validates `tag` against an allowlist" — a
   statement a future author will rely on when they build the first
   data-derived vnode, which is the exact moment F-5 becomes live. A safety
   record that overstates a guarantee is worse than a precondition that is
   honestly still open.
3. **The fix is one line, in a file this slice already has open, and is
   in-scope rather than scope creep** — it is F-1's own remedy applied to F-2's
   code:

   ```js
   const tag = vnode.tag;                                   // read once
   if (typeof tag !== "string" || !ALLOWED_TAGS.has(tag)) {
     throw new TypeError("tag not allowed");
   }
   const el = document.createElement(tag);
   ```

   A regression test in C21's style — a stateful `tag` getter asserting exactly
   one construction, of the validated tag — would be the F-2 analogue of C20,
   which is the test C21 should arguably have been in the first place.

I am not proposing the fix as an edit: I do not repair what I gate. It goes
back per `.claude/protocols/FAILURE_LOOP.md`.

### Why QA and Implementation both missed it

Not a criticism — worth recording because it generalises. C21 asserts the fix
*works* against plain-data hostile tags (`tag: "script"` as a string literal).
That is a true assertion and a non-vacuous test. But "the fix works against the
attack the fix was written for" and "the unsafe path does not exist" are
different claims, and only the second is what this slice promised. The gap is
the exact one my predecessor's §1.6 framing exists to catch, which is why the
brief's item 2 pointed the adversarial budget here.

---

## 4. Did the new validation code open any *other* surface?

F-5 above is one answer. Here is the rest of the adversarial sweep, so the
absence of further findings is on record rather than implied.

### 4.1 Can the allowlists be reached with a prototype-chain key?

**No — and the reason is a design choice worth naming, because it is one edit
away from being wrong.** Both allowlists are `Set`s, checked with `Set.prototype.has`:

```js
const ALLOWED_PROPS = new Set([...]);   // pre-existing
const ALLOWED_TAGS  = new Set([...]);   // new this slice
```

`Set.has` performs a SameValueZero lookup over the set's own contents; it does
not consult any prototype. Had the new allowlist been written as an object
literal with `ALLOWED_TAGS[tag]` or `tag in ALLOWED_TAGS`, then
`tag = "constructor"` / `"toString"` / `"valueOf"` would have been truthy and
`createElement("constructor")` would have followed. Probed all five:

```
tag = __proto__ | constructor | toString | hasOwnProperty | valueOf
  -> all THROW TypeError: tag not allowed
prop __proto__ | constructor | toString | hasOwnProperty
  -> all THROW TypeError: attribute not allowed
```

The implementer matched the existing `Set` idiom rather than introducing a
second style. That is the correct call and it is load-bearing, not cosmetic.

### 4.2 Can hostile `props` reach `setProp` by a route the allowlist does not see?

- **Inherited props**: `Object.entries(vnode.props)` returns own enumerable
  string-keyed pairs only. A props object whose *prototype* carries
  `href: "javascript:x"` yields zero entries and zero `setAttribute` calls —
  the inherited prop is simply invisible. Probed: `OK, created=[a]`, no
  attribute written.
- **Getter props**: an own enumerable accessor *is* enumerated and its value
  read — but `Object.entries` reads it once, into the `v` binding destructured
  in the `for...of`, and `setProp` then does its own single `String(v)`. No
  double-read path. (This is the same protection F-5 lacks; `props` got it for
  free from `Object.entries`, `tag` did not because it is a direct property
  access.)
- **Event-handler smuggling**: `onclick`, `OnClick` (mixed case) both throw
  `event-handler attributes are not settable`; `on: { click: "alert(1)" }`
  throws `listener must be a function`. Unchanged and still correct.

### 4.3 Did the new code introduce a new sink, a new `document` reference, or a new network call?

No. Independent grep over the whole client:

```
$ grep -rniE "innerHTML|outerHTML|insertAdjacent|document\.write|srcdoc|\beval\(|new Function|setHTML" src/client/ src/server.js
(no matches)
```

The diff adds `document.createTextNode` and `document.createElement` calls?
— no: it *reorganises* the existing ones. Net `document.*` call sites in
`dom.js` are unchanged (`createElement`, `createTextNode`, `getElementById`),
and `document` is still referenced nowhere outside `dom.js`. No `fetch`, no
`XMLHttpRequest`, no beacon is added anywhere in the diff — see §7.2.

### 4.4 Does the child-kind check change what a *legitimate* render does?

No. For a string child the code path is byte-for-byte the old one
(`createTextNode`), reached via an early `continue` instead of a ternary. For a
vnode child the path is `create(child)` as before. The only behavioural delta is
that some previously-`TypeError`-from-the-DOM inputs now `TypeError` from
`dom.js` earlier and with a clearer message. All 9 legitimate tags construct
(probe P7); the full suite is green (§7.4).

---

## 5. F-3 — Trusted Types in the CSP *(CLOSED)*

**Delivered, verbatim, on the wire.** I started the server on an ephemeral
loopback port and read the real response rather than reading the source
constant:

```
GET /   200  content-type: text/html; charset=utf-8  x-content-type-options: nosniff
  CSP: default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self';
       img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none';
       frame-ancestors 'none'; require-trusted-types-for 'script'
```

All eight pre-existing directives present and unmodified; one directive added;
none removed or weakened. The CSP is still attached **only** to the HTML
response (`asset.csp` is set only for `pathname === "/"`), which is correct —
it is a document policy.

**Does it break the app?** Two independent lines of evidence, one mine, one QA's:

- *Structural (mine):* the grep in §4.3 shows the client contains **zero**
  Trusted-Types-guarded injection sinks. `setAttribute("href", …)` on an `<a>`
  is not a TT sink (the sink set is `script.src`/`.text`, `innerHTML`,
  `outerHTML`, `insertAdjacentHTML`, `iframe.srcdoc`, `document.write`, `eval`,
  `Function`). `replaceChildren`, `createTextNode`, `createElement`,
  `getElementById`, `addEventListener` are all node-level APIs outside the TT
  surface. So there is nothing for the directive to throw on.
- *Runtime (QA's, and I read the evidence rather than the conclusion):* a real
  Chromium session across five app states with zero `Runtime.exceptionThrown`
  and zero `Log` security entries — **and a non-vacuity probe** that
  deliberately assigned `#app.innerHTML` and got
  `TypeError: … requires 'TrustedHTML' assignment` with `appHtmlChanged: false`.
  That probe is what makes the zero-violations result meaningful rather than a
  broken collector. I accept this evidence; it is exactly the check the slice
  plan's Risk 1 demanded, and it was run correctly.

This finding is genuinely closed, and it upgrades the design's central rule
from "enforced by a source-text scan plus review" to "additionally enforced by
the browser at runtime" — which is what §2.4 asked for.

---

## 6. F-4 — `nosniff` + charset on JSON *(CLOSED)*

The fix touches `send()` and `sendAndClose()`. The question a targeted test
cannot answer is **whether those two are the only JSON writers.** I enumerated
every response write in `src/server.js`:

| Site | Function | Headers |
|---|---|---|
| `res.writeHead(200, …)` line 68 | `sendStatic` | already had `nosniff` before this slice (unchanged) |
| `res.writeHead(status, …)` line 100 | `send` | **`nosniff` + `charset=utf-8` added** |
| `res.writeHead(status, …)` line 119 | `sendAndClose` | **`nosniff` + `charset=utf-8` added** |
| `res.end()` line 379 | last-resort net | runs only *after* `send(res, 500, …)`, so it inherits `send`'s headers |

There is no fourth writer, and no route bypasses these. Verified against a live
server over every response class the API can produce:

```
GET /                     200  ct=text/html; charset=utf-8         nosniff=nosniff
GET /app.js               200  ct=text/javascript; charset=utf-8   nosniff=nosniff
GET /app.css              200  ct=text/css; charset=utf-8          nosniff=nosniff
GET /health               200  ct=application/json; charset=utf-8  nosniff=nosniff
GET /habits (no user hdr) 400  ct=application/json; charset=utf-8  nosniff=nosniff
GET /habits               200  ct=application/json; charset=utf-8  nosniff=nosniff
POST /habits              201  ct=application/json; charset=utf-8  nosniff=nosniff
POST …/completions        200  ct=application/json; charset=utf-8  nosniff=nosniff
POST …/completions (foreign) 404  ct=application/json; charset=utf-8  nosniff=nosniff
GET /nope                 404  ct=application/json; charset=utf-8  nosniff=nosniff
POST oversized            413  ct=application/json; charset=utf-8  nosniff=nosniff
PUT /habits               404  ct=application/json; charset=utf-8  nosniff=nosniff
```

**100% coverage across every status code the service emits**, including the two
paths a targeted test is most likely to miss (the 400 before identity is
established, and the unrouted 404). `cache-control: no-store` is present on all
of them and unchanged. The asymmetry my §3.1 named — static route protected,
free-text-carrying JSON route not — is gone.

**No habit name reaches a log via this change** (brief item 5). The header
change adds no logging. Verified live with a habit named
`Meditate ‮ secret`: the entire access log for the session was

```
POST /habits 201 1ms
POST /habits/:habitId/completions 404 1ms
POST /habits/:habitId/completions 404 1ms
```

— method, **route template** (never the raw path), status, duration. The name
does not appear (`includes("Meditate") === false`). **SAFETY_INVARIANTS §6
holds.**

---

## 7. Regressions, invariants, and the standing scans

### 7.1 Regression check against my prior PASS findings

`runs/browser-client/04-security.md` recorded PASS on six things. Each re-checked
against *this* diff:

| Prior PASS | Still holds? | Independent evidence |
|---|---|---|
| **The rendering boundary** (§1.6): no parameter means "HTML"; the only string sink is `createTextNode` | **Yes — strengthened** | The string branch is byte-identical (early `continue` replacing a ternary). Grep in §4.3 shows still zero markup sinks. The boundary now additionally rejects non-allowlisted tags and malformed children. F-5 is a gap in the *new* control, not a regression in the old one: pre-slice, **every** tag was accepted; post-slice, only an accessor-bearing vnode escapes. Strictly better than `HEAD`, in every input class |
| **CSP delivery** (§2.1) | **Yes** | Read off the wire in §5: eight pre-existing directives intact, one added |
| **The static route** (§3) | **Yes** | `sendStatic` untouched by the diff; `STATIC` read-once-at-import unchanged; still `nosniff`; no path handling altered |
| **Invariant §6 in the browser** (§4) | **Yes** | Live access log in §6 with a hostile-named habit: route templates only, no name. No logging added anywhere in the diff |
| **The non-oracle — "the client never asks"** (§5, §7.4) | **Yes** | Two ways. (a) *Static:* the diff adds no `fetch`, no `XMLHttpRequest`, no beacon, no new endpoint — `src/client/app.js` is not in the diff at all. (b) *Dynamic:* foreign vs fake habit, replayed live — status, **all headers**, and body byte-identical: `404 / content-length: 27 / {"error":"habit not found"}` for both. The new `nosniff` and `charset` are added unconditionally to `send`, so they cannot become a distinguisher. `content-length` is unchanged because no body changed |
| **The focus fix** (§6) | **Yes** | `restoreFocus`/`byId` are untouched by the diff |

### 7.2 SAFETY_INVARIANTS — all seven

| # | Invariant | Verdict | Basis |
|---|---|---|---|
| 1 | One server-side day boundary | **Holds** | `src/services/streak.js` not in the diff; no clock, cutoff, or date code touched |
| 2 | A streak is never silently zeroed | **Holds** | No streak math in the diff; 90/90 tests including the T-series day-boundary suite |
| 3 | No guilt / loss-aversion mechanics | **Holds** | No copy, no UI, no feature added. `copy.js` untouched |
| 4 | A user only ever affects their own data | **Holds** | Ownership gate in `logCompletion` untouched; foreign-habit probe still returns the constant 404 (§7.1) |
| 5 | Logging is idempotent per day | **Holds** | Not touched; covered by the green suite |
| 6 | No sensitive content in logs | **Holds** | Live access log with a hostile name contains no name (§6). This is the invariant the plan flagged as adjacent to F-4, and it is the one I verified at runtime rather than by reading |
| 7 | Server reachable only from the host it runs on | **Holds** | `const host = "127.0.0.1"` still explicit at `src/server.js:398`; `server.js`'s only diff hunks are the CSP string and two header objects. No bind change, no new listener, no port change |

**No invariant is weakened by this diff.** Four are untouched by construction
(the diff spans two files, neither containing streak, day-boundary, ownership,
or copy logic); three are verified positively above.

### 7.3 Secrets / credentials / PII scan on the diff

```
$ git diff -U0 | grep '^+' | grep -iE "(api[_-]?key|secret|passwd|password|token|bearer|
    authorization|private[_-]?key|BEGIN .*PRIVATE|aws_|sk-[A-Za-z0-9]{16,}|ghp_|eyJ…)"
SECRETS SCAN: no matches on added lines

$ git status --porcelain -uall | grep -iE "\.env|\.pem|\.key|credential|\.p12"
NO credential/.env files added

$ git diff -U0 | grep '^+' | grep -iE "console\.|log\(|process\.stdout"
no log statements added by the diff
```

- **No secret, key, token or credential** on any added line.
- **No `.env` or credential file** added; the only new path in the working tree
  is `runs/security-hardening/` (this slice's artefacts).
- **No new log statement anywhere in the diff** — so there is no new PII sink to
  assess. The one existing log call (`src/server.js:244`) is unmodified and
  emits `method routeTemplate status duration`.
- **No new dependency.** `package.json` is not in the diff; the repo remains
  dependency-free per `LOCAL_COMMANDS`.

### 7.4 Gate re-run (independent)

```
$ npm test
ℹ tests 90   ℹ pass 90   ℹ fail 0   ℹ cancelled 0   ℹ skipped 0   ℹ todo 0
```

90 ≥ the 84 required by success criterion 2, and 6 more than the baseline —
consistent with 6 new tests (C20, C21, C21b, C22, S32, S32b) and **no test
removed or weakened**. I checked that last point specifically: the diff to the
three test files is purely additive (`+153 / -0` across them; no `-` line in any
test file).

### 7.5 Adapter boundary / real-client / anti-bot checks

Recorded so the absence is on record: **no adapter, placeholder or otherwise,
exists in this repo**; no LLM client, model call, or network egress was added
(`HUMAN_APPROVAL_RULES` rule 5 not engaged); there is no CAPTCHA, anti-bot, or
rate-limit control in the codebase to weaken, and none was added or removed.
The audit mechanism (`recordAuditEvent` / `listAuditEvents` in
`src/services/audit.js`, user-scoped, append-only) is **not in the diff at all**
— no call site added, removed, or renamed, and no event `type` string changed.
`src/server.js` emits no audit events directly and that is unchanged. **No audit
event was removed, renamed, or weakened**, and the diff adds no state-changing
function that would require a new one: `create`/`setProp` mutate detached DOM
nodes in the browser, and the two server edits add response headers only.

---

## 8. Preconditions — struck, rewritten, and new

Precision matters here: *"a precondition that is now enforced in code is struck;
one that is only partly addressed must be rewritten, not deleted."*

### §7.1 (from F-2) — **REWRITTEN, not struck**

> *Original:* "`dom.js` must validate `tag` before any client builds a vnode
> from data … `create()` must (a) require `typeof vnode.tag === 'string'`
> against a tag allowlist and (b) reject children that are neither a string nor
> a well-formed vnode."

Clause (a) and clause (b) are both now in code, and I verified both. But the
precondition's *purpose* — "you cannot express HTML in this representation"
ceasing to depend on `render.js` discipline — is not yet achieved, because F-5
means the allowlist can be walked past by a vnode that is an object rather than
a literal. And "a vnode built from data" is exactly the condition under which
such an object appears. **Carried forward, narrowed:**

> **§7.1′ — `create()` must read `vnode.tag` exactly once.** The allowlist and
> the child-kind check are in place (this slice), but `create()` performs three
> separate reads of `vnode.tag` and validates only the first two. Before any
> slice constructs a vnode from server or user input, `create()` must bind the
> tag once (`const tag = vnode.tag`) and validate and construct from that
> binding — the same remedy F-1 applied to `setProp`. Until then the tag
> allowlist is defeatable by an accessor or a Proxy.

**If F-5 is fixed in this slice, §7.1 is struck in full** and §7.1′ never needs
to exist. That is the cheaper outcome and the one I recommend.

### §7.2 (from F-1) — **STRUCK**

> *Original:* "Stringify once in `setProp`. Any slice that passes a
> non-primitive prop value … makes the double-evaluation reachable."

Enforced in code. `String(value)` is called exactly once per `setProp`
invocation on every path, the result is a `const`, and the same binding is both
validated and written (§1, verified by call-count instrumentation, not by
reading). A future slice *may* now pass a non-primitive prop value safely. **Struck.**

### §7.3 (from F-4) — **STRUCK**

> *Original:* "Add `nosniff` to JSON responses before habit data becomes
> reachable by navigation … Adding `x-content-type-options: nosniff` and
> `charset=utf-8` to `send()`/`sendAndClose()` now removes the dependency."

Enforced in code, on **every** JSON response the service can emit, verified on
the wire across 9 distinct status/route combinations (§6). The safety of the
free-text-carrying JSON response no longer rests on `x-user-id` being a request
header. A future slice may adopt cookie/session auth or a query-parameter user
id without this particular header becoming a problem. **Struck** — though note
that such a slice has its *own* separate obligations (CSRF, the `x-user-id`
self-assertion, invariant §7); §7.3 discharged is not a licence for that change.

### Unchanged preconditions, restated so nothing is silently dropped

- **§7.4 — "the client never asks."** Still carried, still unbroken by this
  slice: no network call added, foreign and fake remain byte-identical
  including headers (§7.1 of this document). Not this slice's to strike.
- **§7.5 — `habitId` remains sequentially enumerable.** Unchanged, still
  dispositioned as not-a-finding across four reviews now. Not re-raised.
- **§7.6 — CSP must move with the app.** Still carried, and now slightly
  stronger: reaching for `unsafe-inline` would retire the second layer *and*
  sit incoherently beside `require-trusted-types-for 'script'`.

### New precondition from this slice

> **§7.7 — widening `ALLOWED_TAGS` or `ALLOWED_PROPS` is a safety-control
> change.** Both sets are now real, enforced controls rather than comments.
> Adding an entry to either is *weakening* a control in the
> `HUMAN_APPROVAL_RULES` rule-4 sense, and must be argued in the slice plan
> rather than slipped in alongside a feature. The bar: a new tag must be one
> the client's own render code emits as a literal (re-derive by grep, as §2.1
> does — the derivation is mechanical, so there is no excuse for guessing), and
> a new prop must not be a URL-bearing or behaviour-bearing attribute unless it
> gets a content guard of its own, as `href` has. Note the fail-closed
> asymmetry that makes this safe to enforce strictly: forgetting to widen the
> list breaks rendering *loudly* in a test, while widening it wrongly fails
> *silently*. Prefer the loud failure.

---

## 9. The slice plan's rule-4 reasoning — checked, not assumed

Brief item 6. The plan claims `HUMAN_APPROVAL_RULES` rule 4 does not trip
because every change strengthens a control and none weakens one. I read the
rule's text rather than the plan's summary of it:

> **### 4. Changes to safety controls** — "This includes: Disabling an approval
> gate. Disabling an audit event. Removing a CAPTCHA / anti-bot guard. Skipping
> a release gate. Bypassing a pre-commit or pre-push hook."

**Confirmed: rule 4 does not trip.** Checked each enumerated action against the
diff independently:

| Rule 4 action | Present in the diff? | Evidence |
|---|---|---|
| Disabling an approval gate | No | No approval gate exists in this codebase; none added or removed. No send/submit/publish/deploy path exists (there is no outbound network call anywhere in `src/`) |
| Disabling an audit event | No | `src/services/audit.js` not in the diff; no `recordAuditEvent` call site changed (§7.5) |
| Removing a CAPTCHA / anti-bot guard | No | None exists; none removed. No fingerprint-spoofing, rate-limit-evasion, or bypass logic added |
| Skipping a release gate | No | I re-ran `npm test` myself (90/90); no gate was skipped, and the QA stage ran in full including the live check the plan's Risk 1 mandated |
| Bypassing a hook | No | No `--no-verify`; nothing is committed at all — the slice is in the working tree, as the plan says |

And the directional test the plan applies is the right one: rule 4's enumerated
actions are all *weakening* ones, and every change here moves the other way —
the CSP gains a directive and loses none (verified on the wire, §5), `create()`
gains validation it did not have, `setProp` closes a bypass, and the JSON route
gains two headers. **I confirm the plan's reasoning and its conclusion. No
approval was required and none was bypassed.**

Two things I want to add rather than merely agree:

1. **The reasoning is only sound because the direction was verified, not
   assumed.** "Strengthening" is a claim about the diff, and a diff can
   strengthen one thing while quietly relaxing another. The specific way this
   diff could have weakened a control while looking like a hardening slice is
   an over-wide `ALLOWED_TAGS` — an allowlist is a control, and widening one is
   weakening it. I re-derived the set independently (§2.1) and it is exactly the
   9 tags the client emits. Had it contained, say, `img` or `iframe` "for
   future use", rule 4 *would* have tripped and the plan's blanket
   "every change strengthens" would have been false. It does not, so it is true.
2. **This is why §7.7 exists.** The plan's rule-4 argument is correct *for this
   slice* but is not reusable as a template: the next slice that edits these
   same two `Set`s may well be weakening them. §7.7 records that so a future
   plan cannot cite this one as precedent for waving rule 4 past.

**No approval bypass found. Rule 3 (no push, no deploy) is also honoured — the
diff is uncommitted and there is no remote ref in the working tree state.**

---

## 10. Findings

| ID | Severity | Finding | Reachable? | Disposition |
|---|---|---|---|---|
| **F-5** | **required-fix** | `create()` reads `vnode.tag` three times (`typeof`, `Set.has`, `createElement`). A stateful accessor or Proxy passes validation on reads 1–2 and delivers an arbitrary tag to read 3. Reproduced live: `<script>` and `<iframe>` constructed with no exception. This is the F-1 defect inside the F-2 fix | **No.** Requires a vnode *object* carrying an accessor for `tag`. Habit names are string-validated at `src/server.js:314`; `JSON.parse` cannot produce accessors; no client call site computes a tag. CSP is an independent second layer behind it | Back to Implementation. One line: bind `const tag = vnode.tag` once, validate and construct from the binding. Plus a C20-style regression test asserting the tag is read once. **Or** — if the Release Manager ships as-is — §7.1 must be carried forward as §7.1′ (§8) instead of struck |
| A-1 | advisory | `create()` does not validate `vnode.props`: a non-object `props` (e.g. a number) yields `Object.entries(5) === []` and is silently ignored rather than throwing, unlike every other malformed input in the function, which fails loudly | No, and harmless if reached — the result is an element with no attributes, never an unsafe one | Record for the EM. Not worth a slice of its own; fold into whichever future slice touches `dom.js`. Consistency with the file's fail-closed style is the only argument for it, not safety |
| A-2 | advisory | `children` given a bare string (not an array) iterates per character, rendering `"hi"` as two text nodes rather than throwing | No. Every character still goes through `createTextNode` — text, never markup. A rendering oddity, not a boundary hole | Record only. Explicitly **not** worth widening the child check to catch, which would add surface to fix cosmetics |

Nothing else. In particular: **no blocker**, no secret, no PII sink, no approval
bypass, no audit-event change, no adapter or real-client change, no anti-bot
change, no invariant weakened.

### Advisories carried from before, still open and still not this slice's job

None re-raised. §7.5 (`habitId` enumerability) remains dispositioned as
not-a-finding for the fourth review running.

---

## 11. What I did not audit

Stated so the boundary of this gate is explicit rather than implied:

- The streak / day-boundary math and the ownership gate — **not in the diff**;
  covered by `runs/greenfield/08-security.md` and `runs/http-layer/04-security.md`
  and re-confirmed only to the extent of "unchanged" (§7.2).
- The 413 / body-cap path beyond its headers — covered by
  `runs/http-layer/04-security.md`.
- I did not re-run the full live Chromium session. QA's §3 did, with a
  non-vacuity probe I read and judged sound; I spent my live budget instead on
  the adversarial input probes QA did not run, which is where F-5 was found.
- Agentic-threat surfaces (OWASP ASI) — **not applicable**: this slice adds no
  agent, no tool integration, and no persisted agent memory. There is no
  untrusted-content-to-instruction path because there is no instruction
  consumer in this codebase.

---

## 12. Recommendation to the Release Manager

**CONDITIONAL PASS — go, conditional on one of two routes being taken and
recorded.**

The diff is a **strict security improvement over `HEAD` in every input class I
tested.** Nothing in it is worse than what is on `main` today; three of the four
advisories are closed structurally and the fourth (F-2) is closed against every
attack except one the original finding did not contemplate. There is no reason
to revert anything, and F-3 in particular — the slice's one genuine functional
risk — is proven safe both structurally and at runtime.

The condition is about **accuracy of the safety record**, not about exposure:

- **Route A (recommended).** Send back to Implementation for the one-line F-5
  fix plus its regression test, per `.claude/protocols/FAILURE_LOOP.md`. Re-run
  `npm run qa:mvp`. This costs one small edit, keeps the slice's promise intact,
  and lets §7.1 be **struck in full** — which is worth more to the next slice
  than the fix itself, because the next author gets a guarantee rather than a
  caveat. The live Chromium check does **not** need repeating: the fix touches
  no CSP, no header, and no rendering behaviour for valid input.
- **Route B.** Ship as-is. Legitimate — F-5 is not reachable — but then the
  release notes and `STATE.md` must say **"F-2 partially closed"**, precondition
  **§7.1′ must be carried forward** rather than §7.1 struck, and F-5 must be
  named as the first item of the next slice that touches `dom.js`. The thing
  that must *not* happen is Route B recorded as if it were Route A.

Either route, **§7.7 (widening an allowlist is a rule-4 change) should be
carried forward** — it is the precondition this slice generates regardless of
how F-5 is dispositioned.

`.agentic/CURRENT_MVP_STATUS.md` should be updated on release to note that
`SAFETY_INVARIANTS` §6 was re-verified at runtime with a hostile-named habit,
and that JSON responses now carry `nosniff`.

---

## Handoff — Security & Privacy → Release Manager

| Field | Value |
|---|---|
| **From** | Security & Privacy Agent |
| **To** | Release Manager |
| **Slice** | `security-hardening` |
| **Artefact** | `runs/security-hardening/03-security.md` (this document) |
| **Verdict** | **CONDITIONAL PASS** |
| **Blockers** | **None** |
| **Required fixes** | **1** — F-5 (§3). Not reachable; one line; Route A recommended |
| **Advisories** | 2 — A-1, A-2 (§10), both for the EM's backlog, neither gating |
| **Invariants** | All 7 hold; none weakened (§7.2). §6 verified at runtime, not by reading |
| **Approval** | Rule 4 confirmed not tripped — plan's reasoning independently checked and endorsed, with one caveat about its reusability (§9). No approval bypass |
| **Audit events** | None removed, renamed, or weakened (§7.5) |
| **Secrets / PII** | Clean (§7.3) |
| **Gates** | `npm test` re-run independently: 90/90 |
| **Preconditions** | §7.2 **struck**, §7.3 **struck**, §7.1 **rewritten as §7.1′** (struck outright if Route A is taken), §7.4/§7.5/§7.6 carried unchanged, **§7.7 new** (§8) |
| **Decision the RM owns** | Route A (send back for the one-line fix) vs Route B (ship, and record F-2 as partially closed). Security owns the severity; the RM owns whether it ships |

**Environment left clean:** both probe servers used ephemeral loopback ports and
were closed explicitly (`server closed` confirmed); no probe process remains
(`pgrep -f scratchpad` → none). The two `127.0.0.1:5173/5174` listeners on this
machine belong to an unrelated project (`scalable-rag-pipeline`, started before
this session) and were not touched. No probe file was written inside the repo;
all probes live in the session scratchpad. **`src/` and `test/` are unmodified
by me** — `git diff --numstat` is identical to what QA handed over.

---

# Re-verify — F-5 rework

> Appended after the Orchestrator took **Route A** and the F-5 rework landed.
> Depth: **smoke**, as briefed. The four original advisories are *not*
> re-derived and the live Chromium check is *not* repeated — my own Route A
> said it was unnecessary, and the delta confirms why: the rework touches no
> CSP, no header, and no rendering behaviour for valid input.
>
> **Delta reviewed:** `src/client/dom.js` `create()` head (4 lines) plus test
> `C21c`. `git diff --numstat` confirms `src/server.js` (6/3) and the other two
> test files (27/0, 30/0) are byte-identical to what I gated before; only
> `src/client/dom.js` (23/8 → **24/8**) and `test/client-dom.test.js`
> (96/0 → **144/0**) moved. Independently re-run: `npm test` **91/91**,
> `npm run build` **ok**.

## R1. Is F-5 closed, by the mechanism claimed?

**Yes.** The mechanism claimed is *bind once, validate and construct from the
binding*:

```js
const tag = vnode.tag;                                   // the only read
if (typeof tag !== "string" || !ALLOWED_TAGS.has(tag)) throw new TypeError("tag not allowed");
const el = document.createElement(tag);
```

`tag` is a `const` local; the two checks and `createElement` all consume that
binding, and `vnode.tag` appears exactly once in the function. There is no
second read for a stateful accessor to win.

I re-ran the three exploits that produced the finding, plus two new failure
modes, with read-count instrumentation:

```
tag getter div,div,then script          -> OK    created=[div]     tag reads: 1
same as a nested CHILD vnode            -> OK    created=[div,span] child tag reads: 1
Proxy vnode, stateful tag               -> OK    created=[div]     proxy tag reads: 1
tag getter: FIRST read is "script"      -> THROW tag not allowed   created=[]   tag reads: 1
tag getter throws on read 1             -> THROW RangeError        created=[]   tag reads: 1
```

All three previously constructed `<script>` / `<iframe>` silently; none does
now. Note the fourth line, which is the case that proves the fix is not merely
*count* reduction: when the single read returns a forbidden tag, it is
rejected — the binding is validated, not trusted. And the fifth: a throwing
getter propagates out before `createElement`, so the failure stays loud and
`mount()` stays atomic.

**F-5: CLOSED.**

## R2. The generalisation — are `vnode.props` and `vnode.children` really single-read?

The implementer's claim, which the brief asked me to confirm or refute rather
than accept. **Confirmed — refuting it would have been the same bug a third
time, so I checked it three independent ways rather than by reading the `??`
semantics.**

Static reading first: `Object.entries(vnode.props ?? {})` and
`for (const child of vnode.children ?? [])` each contain **one** textual
occurrence of the property, and `??` evaluates its left operand once. Then,
empirically:

| Probe | Result |
|---|---|
| vnode with **accessor** `props` / `children` (returning benign values on read 1, `{onclick:"alert(1)"}` / `[{tag:"script"}]` after) | `props reads: 1`, `children reads: 1`; the benign values are what got used (`setAttribute("class","ok")`, text node `"safe"`). The hostile second values were never fetched |
| **Proxy** vnode counting `get` traps for `props` and `children` | `proxy props reads: 1`, `proxy children reads: 1` — the trap count is the ground truth, independent of any assumption about `??` |
| accessor on a **prop value** (`props: { get class(){…} }`) | `props VALUE reads: 1`; `setAttribute("div","class","good")` — the first and only read is what is written. This is F-1's guarantee holding one level down |
| **Proxy props whose `getOwnPropertyDescriptor` and `get` disagree** (the one exotic way `Object.entries` could read twice) | `getOwnPropertyDescriptor traps: 1`, `get traps: 1`, and the value written came from `get` — one read, no validate-then-differ gap |

The last row is the one worth recording: `Object.entries` consults
`[[OwnPropertyKeys]]` and `[[GetOwnProperty]]` for *enumerability* but takes the
value from `[[Get]]`, so even a Proxy that reports one value in the descriptor
and another from `get` yields a single value, which is then the single thing
`setProp` validates and writes. **No multi-read remains anywhere in `create()`.**

Also re-confirmed the sibling fix did not regress: `href` stateful `toString`
→ `toString calls: 1`, `setAttribute("a","href","#/ok")`.

## R3. Does `C21c` pin the invariant, or pass for an incidental reason?

**It pins it — but only in combination with `C21`, and that is worth stating
plainly rather than letting the pair be assumed.**

First, the fail-first re-derivation, done independently rather than accepted:
I reconstructed the pre-rework three-read `create()` in the scratchpad (current
source with the four fix lines textually reverted — no repo file touched) and
ran `C21c`'s exact three assertions against both:

```
--- REWORKED (src/client/dom.js) ---
   doesNotThrow: PASS   tagReads === 1: PASS   createElement === ['div']: PASS
   observed: tagReads=1  createElement=["div"]

--- PRE-REWORK (three-read) ---
   doesNotThrow: PASS   tagReads === 1: FAIL — actual 3
                        createElement === ['div']: FAIL — actual ["script"]
   observed: tagReads=3  createElement=["script"]
```

Exactly the `3 !== 1` the implementer reported, **and** a real `<script>`
constructed. Two of the three assertions fail against the unfixed code, for two
different reasons — the read count (the mechanism) and the constructed element
(the outcome). That is a well-shaped test: it would still catch the defect if
one assertion were later loosened.

**On the assertion shape.** Asserting success rather than a throw is *correct*,
and I would have objected to a throw assertion: with the fix, the single read
returns `"div"`, which genuinely is allowlisted, so throwing would mean the
allowlist had become wrong. Note also that `doesNotThrow` passes against *both*
versions — it is the weakest of the three and carries none of the load. The
load is entirely on `tagReads === 1` and `createElement === ["div"]`.

To check it does not pass incidentally, I mutation-tested it:

| Mutant | `C21c` | `C21` |
|---|---|---|
| M1 — read once, **allowlist check deleted** | **PASS** | **FAIL (no throw)** — caught |
| M2 — two reads, construct a hardcoded `"div"` | **FAIL** — caught (`tagReads` 2) | PASS |
| M3 — allowlist **widened** to include `script` | **PASS** | **FAIL (no throw)** — caught |

`C21c` catches the multi-read regression it was written for, including a
two-read variant subtler than the original three-read bug. It does *not* catch
allowlist removal or widening — nor should it; that is `C21`'s job, and `C21`
catches both. **The pair is complete; neither test alone is.** This is the same
division of labour as `C20` (single-evaluation) beside the `href` guard tests,
which is the symmetry my §3 asked for.

## R4. Does the rework introduce anything new?

**No.** Same standard as before — does an unsafe path exist, or is it merely
unused.

- **Surface:** the delta adds one `const` binding. No new API, no new
  `document` reference, no new branch, no new sink, no network call, no
  dependency. `git diff` on `dom.js` shows the rework as a 4-line replacement
  of the `create()` head; everything else in the file is what I already gated.
- **Rejections unchanged:** `script`, `iframe`, `object`, `embed`, `base`,
  `link`, `meta`, `style`, `__proto__`, `constructor`, `toString` all still
  throw `tag not allowed`; function / `undefined` / `null` / number / array
  children still throw `child must be a string or a vnode`; boxed primitives
  and `Object.create(null)` still fail on the tag gate. The `Set.has` lookup is
  unchanged, so §4.1 still holds.
- **Acceptances unchanged:** all nine legitimate tags construct.
- **Invariants:** none of the seven is touched by a `const` binding in the
  browser's vnode-to-DOM function; §6 in particular is unaffected (no logging
  in the delta). `src/server.js` is byte-identical to the version I gated, so
  §5, §6 and §7 of this document stand unmodified.
- **A-1 and A-2 remain open and remain advisory** — unchanged by the rework,
  still not reachable, still not worth a slice.

## R5. Precondition §7.1

**Struck in full.** The original text required `create()` to "(a) require
`typeof vnode.tag === 'string'` against a tag allowlist and (b) reject children
that are neither a string nor a well-formed vnode." Both clauses are enforced in
code, and the reason I withheld the strike — that the allowlist could be walked
past by an accessor or Proxy, so the guarantee was still discipline-dependent on
*what kind of object* a vnode was — is gone. A future slice may now build a
vnode from server or user data and the tag gate will hold against it.

**§7.1′ is withdrawn; it never needs to exist.** That is the outcome Route A was
recommended for, and it is worth more to the next slice than the one-line fix
itself: the next author inherits a guarantee instead of a caveat.

**§7.7 remains carried forward regardless**, as briefed and as it always was —
widening `ALLOWED_TAGS` or `ALLOWED_PROPS` is weakening a control in the
`HUMAN_APPROVAL_RULES` rule-4 sense and must be argued in a slice plan. The
mutation table above is now direct evidence for why: **M3 shows a one-word
widening of the allowlist is invisible to the read-once test and is caught only
by `C21`'s explicit forbidden-tag list.** A slice that widens the set and
updates `C21` to match would leave no test failing at all. That is exactly the
silent-failure asymmetry §7.7 exists to force into a plan.

## Final verdict for the slice

# **PASS**

No blockers. **No required fixes.** No conditions on release.

All five findings this slice was answerable for are closed by the mechanism
claimed, and closed structurally rather than by disuse:

| # | Status |
|---|---|
| F-1 | **CLOSED** — `String(value)` once per `setProp`, proven by call count |
| F-2 | **CLOSED** — tag allowlist enforced, re-derived as exactly the 9 tags the client emits |
| F-3 | **CLOSED** — Trusted Types delivered on the wire; zero sinks, non-vacuously verified live |
| F-4 | **CLOSED** — `nosniff` + charset on every JSON response, all 12 route/status combos |
| F-5 | **CLOSED** — `vnode.tag` read exactly once; `props`/`children` independently confirmed single-read too |

Preconditions `browser-client/04-security.md` **§7.1, §7.2 and §7.3 are all
struck**; §7.4/§7.5/§7.6 carry unchanged; **§7.7 is new**. Advisories A-1 and
A-2 go to the EM's backlog and gate nothing.

The slice did what it set out to do: three discipline-dependent controls became
structural ones, a fourth layer of browser enforcement was added, and the one
defect the slice introduced along the way was found by the gate and closed
before release — which is the pipeline working, not the pipeline failing.

**Recommendation to the Release Manager: GO, unconditional.** Tier 2, local
only; no push, no deploy (rule 3 unengaged). On release, update
`.agentic/CURRENT_MVP_STATUS.md` to record that JSON responses now carry
`nosniff`, that the client's rendering boundary is allowlist-enforced, and that
`SAFETY_INVARIANTS` §6 was re-verified at runtime with a hostile-named habit.

**Environment left clean:** this re-verify ran no server and no browser — every
probe was an in-process import against a stub `document`. No process was
started, so no port was opened. All probe files (including the reconstructed
pre-rework source and the three mutants) live in the session scratchpad; **no
file was written inside the repo except this artefact and `STATE.md`, and
`src/` and `test/` are unmodified by me** — `git diff --numstat` matches the
Orchestrator's handoff exactly.
