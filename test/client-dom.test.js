// dom.js against a hostile stub `document` — no dependencies. The stub is a
// trap, not a serializer: elements throw on assignment to innerHTML/
// outerHTML or a call to insertAdjacentHTML, so passing means dom.js
// genuinely never reaches for those APIs, not merely that no test happened
// to notice.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mount, setText, byId, restoreFocus } from "../src/client/dom.js";

function makeStubDocument() {
  const calls = { createElement: [], createTextNode: [], setAttribute: [], addEventListener: [], focus: [] };

  // Real elements that have carried an `id` (i.e. went through setAttribute,
  // meaning dom.js's create() actually built them from a vnode) are tracked
  // here so getElementById can genuinely answer "does this id still exist in
  // the mounted tree" — including "no" after a replaceChildren tore it down.
  // Ids that were never set this way (e.g. the "app"/"live-region" root
  // containers every other test in this file hands to mount() directly, and
  // which never pass through create()) keep the old ad hoc fabrication
  // behavior below, unaffected by any of this.
  const idRegistry = new Map();
  const everRegisteredIds = new Set();

  function collectIdElements(node, out) {
    if (!node || node.nodeType !== 1) return;
    if (node.id) out.push(node);
    for (const child of node.childNodes ?? []) collectIdElements(child, out);
  }

  function containsNode(root, target) {
    if (root === target) return true;
    for (const child of root.childNodes ?? []) {
      if (containsNode(child, target)) return true;
    }
    return false;
  }

  function makeElement(tag) {
    const el = {
      tagName: tag,
      attributes: {},
      childNodes: [],
      listeners: {},
      ownerDocument: null,
      nodeType: 1,
      id: "",
      appendChild(child) {
        this.childNodes.push(child);
        return child;
      },
      replaceChildren(...children) {
        // Model real DOM behavior for the two things the focus-restoration
        // regression test needs: (a) ids belonging to a subtree being torn
        // down stop resolving via getElementById, same as a real remount
        // (arch doc §7.2's "just-clicked control" is destroyed on every
        // mount()); (b) removing the currently-focused element resets
        // document.activeElement to <body> — the exact defect QA reproduced
        // (activeElement === BODY after logging).
        // create(vnode) (which may re-register the SAME id on a brand-new
        // element) runs before replaceChildren() is called — see mount() in
        // dom.js, `replaceChildren(...(vnode ? [create(vnode)] : []))` — so
        // by this point idRegistry may already point at the *new* element
        // for a given id. Only remove a registry entry if it still points at
        // the specific old element being torn down, so a same-id
        // replacement (the common re-render case) is never falsely erased.
        const removed = [];
        for (const old of this.childNodes) collectIdElements(old, removed);
        for (const el of removed) {
          if (idRegistry.get(el.id) === el) idRegistry.delete(el.id);
        }
        if (doc.activeElement && this.childNodes.some((c) => containsNode(c, doc.activeElement))) {
          doc.activeElement = doc.body;
        }
        this.childNodes = children;
      },
      setAttribute(name, value) {
        calls.setAttribute.push({ tag, name, value });
        this.attributes[name] = value;
        if (name === "id") {
          this.id = value;
          idRegistry.set(value, el);
          everRegisteredIds.add(value);
        }
      },
      addEventListener(ev, fn) {
        calls.addEventListener.push({ tag, ev, fn });
        this.listeners[ev] = fn;
      },
      focus() {
        calls.focus.push({ tag, id: this.id });
        doc.activeElement = el;
      },
    };
    // Hostile traps: assignment to these must throw, proving dom.js never
    // reaches for a markup-injection shortcut.
    Object.defineProperty(el, "innerHTML", {
      set() {
        throw new Error("innerHTML must never be assigned");
      },
      get() {
        throw new Error("innerHTML must never be read either");
      },
    });
    Object.defineProperty(el, "outerHTML", {
      set() {
        throw new Error("outerHTML must never be assigned");
      },
    });
    el.insertAdjacentHTML = () => {
      throw new Error("insertAdjacentHTML must never be called");
    };
    return el;
  }

  function makeTextNode(text) {
    return { nodeType: 3, textContent: text, data: text };
  }

  const doc = {
    body: { tagName: "BODY", nodeType: 1, id: "", focus() {} },
    activeElement: null,
    createElement(tag) {
      calls.createElement.push(tag);
      const el = makeElement(tag);
      el.ownerDocument = doc;
      return el;
    },
    createTextNode(text) {
      calls.createTextNode.push(text);
      return makeTextNode(text);
    },
    getElementById(id) {
      if (idRegistry.has(id)) return idRegistry.get(id);
      if (everRegisteredIds.has(id)) return null; // was real, now torn down
      const el = makeElement("div"); // unchanged ad hoc fabrication for root containers
      el.id = id;
      el.ownerDocument = doc;
      return el;
    },
  };
  doc.activeElement = doc.body;

  return { doc, calls };
}

let restoreDocument;

beforeEach(() => {
  const hadDocument = "document" in globalThis;
  const previous = globalThis.document;
  restoreDocument = () => {
    if (hadDocument) globalThis.document = previous;
    else delete globalThis.document;
  };
});

afterEach(() => {
  restoreDocument();
});

// ---------------------------------------------------------------------------
// C11 — the name arrives as character data
// ---------------------------------------------------------------------------

test("C11: mounting a row for a hostile name produces exactly one matching createTextNode, zero tainted setAttribute calls, and never touches an html-parsing sink", () => {
  const { doc, calls } = makeStubDocument();
  globalThis.document = doc;

  const hostileName = "<img src=x onerror=\"alert(1)\">";
  const vnode = {
    tag: "li",
    props: { class: "row" },
    children: [
      { tag: "span", props: { class: "name" }, children: [hostileName] },
    ],
  };

  const root = doc.getElementById("app");
  mount(root, vnode);

  const matching = calls.createTextNode.filter((t) => t === hostileName);
  assert.equal(matching.length, 1, "expected exactly one createTextNode carrying the hostile name");

  for (const call of calls.setAttribute) {
    assert.ok(!String(call.value).includes(hostileName), `setAttribute leaked the hostile name: ${JSON.stringify(call)}`);
  }
});

// ---------------------------------------------------------------------------
// C12 — attribute refusals
// ---------------------------------------------------------------------------

test("C12: setProp throws for on* names (any case) and for any name outside the allowlist", () => {
  const { doc } = makeStubDocument();
  globalThis.document = doc;

  const onNames = ["onclick", "ONERROR", "OnLoad", "onMouseOver"];
  for (const name of onNames) {
    assert.throws(() => {
      mount(doc.getElementById("app"), { tag: "div", props: { [name]: "x" }, children: [] });
    }, TypeError, `expected setProp to throw for ${name}`);
  }

  const disallowedNames = ["src", "srcdoc", "style", "formaction", "onmouseover", "action"];
  for (const name of disallowedNames) {
    assert.throws(() => {
      mount(doc.getElementById("app"), { tag: "div", props: { [name]: "x" }, children: [] });
    }, TypeError, `expected setProp to throw for ${name}`);
  }
});

// ---------------------------------------------------------------------------
// C13 — href is scheme-proof
// ---------------------------------------------------------------------------

test("C13: href throws for non-#/ schemes and accepts an in-app hash route", () => {
  const { doc } = makeStubDocument();
  globalThis.document = doc;

  const bad = ["javascript:alert(1)", "data:text/html,x", "//evil.example", "http://x"];
  for (const href of bad) {
    assert.throws(() => {
      mount(doc.getElementById("app"), { tag: "a", props: { href }, children: [] });
    }, TypeError, `expected href to throw for ${href}`);
  }

  assert.doesNotThrow(() => {
    mount(doc.getElementById("app"), { tag: "a", props: { href: "#/habit/habit_1" }, children: [] });
  });
});

// ---------------------------------------------------------------------------
// C14 — listeners are functions only
// ---------------------------------------------------------------------------

test("C14: on:{click:fn} calls addEventListener; on:{click:'alert(1)'} throws", () => {
  const { doc, calls } = makeStubDocument();
  globalThis.document = doc;

  let clicked = false;
  mount(doc.getElementById("app"), {
    tag: "button",
    props: { type: "button", on: { click: () => (clicked = true) } },
    children: ["Log today"],
  });
  assert.equal(calls.addEventListener.length, 1);
  assert.equal(calls.addEventListener[0].ev, "click");
  calls.addEventListener[0].fn();
  assert.equal(clicked, true);

  assert.throws(() => {
    mount(doc.getElementById("app"), {
      tag: "button",
      props: { on: { click: "alert(1)" } },
      children: [],
    });
  }, TypeError);
});

// ---------------------------------------------------------------------------
// setText / byId — the same text-node path, and the one permitted document
// lookup.
// ---------------------------------------------------------------------------

test("setText replaces content with exactly one createTextNode carrying the given text", () => {
  const { doc, calls } = makeStubDocument();
  globalThis.document = doc;
  const el = doc.getElementById("live-region");
  setText(el, "Meditate logged for today. Current streak 5 days.");
  assert.equal(calls.createTextNode.at(-1), "Meditate logged for today. Current streak 5 days.");
});

test("byId delegates to document.getElementById", () => {
  const { doc } = makeStubDocument();
  globalThis.document = doc;
  const el = byId("app");
  assert.equal(el.id, "app");
});

// ---------------------------------------------------------------------------
// Regression — focus restoration after a remount (QA round 1, arch doc §7.2 /
// 04-ui.md §4: "after logging, focus stays on the control"). QA found that
// mount()'s unconditional replaceChildren destroys the just-clicked button
// and nothing re-focused its replacement, dropping a keyboard/screen-reader
// user's focus to <body>.
// ---------------------------------------------------------------------------

test("regression: mount() alone loses focus to <body> when the focused control's subtree is torn down (reproduces the QA-confirmed defect)", () => {
  const { doc } = makeStubDocument();
  globalThis.document = doc;

  const root = doc.getElementById("app");
  mount(root, {
    tag: "button",
    props: { type: "button", id: "log-habit_1" },
    children: ["Log today"],
  });
  const firstButton = doc.getElementById("log-habit_1");
  firstButton.focus();
  assert.equal(doc.activeElement, firstButton, "setup: the control should be focused before the re-render");

  // Simulate the re-render every successful log triggers (app.js's render()
  // -> mount()) — a brand-new tree, same logical control, new object.
  mount(root, {
    tag: "button",
    props: { type: "button", id: "log-habit_1" },
    children: ["Logged"],
  });

  assert.equal(
    doc.activeElement,
    doc.body,
    "mount() by itself must lose focus to <body> here — this assertion documents the defect QA found; " +
      "the next test proves restoreFocus() fixes it",
  );
});

test("regression: restoreFocus() puts focus back on the re-rendered control's replacement, not the stale destroyed node", () => {
  const { doc, calls } = makeStubDocument();
  globalThis.document = doc;

  const root = doc.getElementById("app");
  mount(root, { tag: "button", props: { type: "button", id: "log-habit_1" }, children: ["Log today"] });
  const firstButton = doc.getElementById("log-habit_1");
  firstButton.focus();

  mount(root, { tag: "button", props: { type: "button", id: "log-habit_1" }, children: ["Logged"] });
  const secondButton = doc.getElementById("log-habit_1");
  assert.notEqual(secondButton, firstButton, "setup: the re-render must produce a genuinely new node");
  assert.equal(doc.activeElement, doc.body, "setup: focus was lost by the remount, as in the test above");

  restoreFocus("log-habit_1", root);

  assert.equal(doc.activeElement, secondButton, "restoreFocus must move focus to the NEW node sharing the control's id");
  assert.notEqual(doc.activeElement, firstButton, "must not (cannot) refocus the destroyed node");
  assert.equal(calls.focus.at(-1).id, "log-habit_1");
});

test("regression: restoreFocus() falls back to a predictable landing spot when the control's row no longer exists after the render", () => {
  const { doc } = makeStubDocument();
  globalThis.document = doc;

  const root = doc.getElementById("app");
  mount(root, { tag: "button", props: { type: "button", id: "log-habit_1" }, children: ["Log today"] });
  doc.getElementById("log-habit_1").focus();

  // Simulates the "gone" (404) path: the habit is dropped from state.habits,
  // so the re-render produces a tree with no control for that id at all.
  mount(root, { tag: "p", props: {}, children: ["This habit couldn't be found."] });
  assert.equal(doc.getElementById("log-habit_1"), null, "setup: the control's id must genuinely no longer resolve");

  restoreFocus("log-habit_1", root);

  assert.equal(doc.activeElement, root, "must land on the given fallback, not silently stay lost at <body>");
});
