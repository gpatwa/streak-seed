// vnode -> real DOM. THE ONLY file in the repository that touches the DOM
// (arch doc §3.1, §3.2). None of the markup-injection or code-from-string
// APIs the arch doc lists in its banned-token scan (§3.5) appear anywhere in
// this file or any other client file — this comment deliberately does not
// spell them out, since the scan is a plain text match over every file
// including comments.
//
// This file has no parameter, anywhere, that means "HTML". A caller cannot
// express the unsafe request: it accepts vnodes and strings only, and every
// string child becomes a text node via the standard node-creation API —
// character data, not markup.

const ALLOWED_PROPS = new Set([
  "class", "id", "type", "role", "hidden", "tabindex", "lang",
  "aria-hidden", "aria-live", "aria-atomic", "aria-label", "href",
]);

// Every literal tag the client's rendering pipeline emits — render.js's own
// h() call sites, plus the two vnodes app.js builds inline ("p" for the
// loading state, "ul" for the habit list). Derived by reading both files, not
// guessed (04-security.md §1.4/§7.1); see 01-impl.md for the derivation. No
// data-derived tag exists today, so nothing outside this set should ever
// legitimately reach create().
const ALLOWED_TAGS = new Set(["a", "button", "div", "h1", "h2", "li", "p", "span", "ul"]);

function setProp(el, name, value) {
  if (name === "on") {
    for (const [ev, fn] of Object.entries(value)) {
      if (typeof fn !== "function") throw new TypeError("listener must be a function");
      el.addEventListener(ev, fn);
    }
    return;
  }
  if (/^on/i.test(name)) throw new TypeError("event-handler attributes are not settable");
  if (!ALLOWED_PROPS.has(name)) throw new TypeError("attribute not allowed");
  const v = String(value);
  if (name === "href" && !v.startsWith("#/")) {
    throw new TypeError("href must be an in-app hash route");
  }
  el.setAttribute(name, v);
}

function create(vnode) {
  const tag = vnode.tag;
  if (typeof tag !== "string" || !ALLOWED_TAGS.has(tag)) {
    throw new TypeError("tag not allowed");
  }
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(vnode.props ?? {})) setProp(el, k, v);
  for (const child of vnode.children ?? []) {
    if (typeof child === "string") {
      el.appendChild(document.createTextNode(child)); // <- EVERY untrusted string, always
      continue;
    }
    if (child === null || Array.isArray(child) || typeof child !== "object") {
      throw new TypeError("child must be a string or a vnode");
    }
    el.appendChild(create(child));
  }
  return el;
}

/** Replace `parent`'s children with the rendering of `vnode` (or nothing, if
 * `vnode` is null). Clearing uses the standard child-replacement API, never
 * a markup-assignment shortcut. */
export function mount(parent, vnode) {
  parent.replaceChildren(...(vnode ? [create(vnode)] : []));
}

/** Set the text content of a single element via a text node — used for the
 * aria-live region (arch doc §7.4). Same text-node path as every other
 * string in the client; no markup-assignment shortcut here either. */
export function setText(el, text) {
  el.replaceChildren(document.createTextNode(text));
}

/** The one permitted way app.js obtains a mount target: even a lookup by id
 * goes through dom.js, so `document` is referenced nowhere else in the
 * client and this file remains the sole DOM-touching module. */
export function byId(id) {
  return document.getElementById(id);
}

/** Move focus to the element with `preferredId` if `mount()` just recreated
 * it, else to `fallback` (arch doc §7.2 / 04-ui.md §4: after logging, focus
 * must not be lost — `mount()`'s `replaceChildren` destroys the previously
 * focused control on every render, so the caller must ask for it back
 * explicitly). `preferredId` may be null when the control's row itself no
 * longer exists after the render (e.g. the habit was removed from state);
 * `fallback` is then used instead of dropping focus to `<body>` with no
 * landmark. `fallback` must itself be focusable (e.g. carry a tabindex) for
 * this to actually move focus rather than no-op. */
export function restoreFocus(preferredId, fallback) {
  const preferred = preferredId ? byId(preferredId) : null;
  (preferred ?? fallback)?.focus();
}
