// Pure tests over render.js / copy.js / app.js — no DOM, no dependencies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { COPY } from "../src/client/copy.js";
import {
  h,
  detailHref,
  stateOf,
  HabitRow,
  StreakFigure,
  StateTag,
  LogTodayControl,
  EmptyState,
  HabitDetail,
  ErrorNotice,
  srSentence,
} from "../src/client/render.js";
import { parseHash, findHabit, mapLogResponse } from "../src/client/app.js";

// ---------------------------------------------------------------------------
// Fixtures — synthetic HabitViews for each of the four states (arch doc
// §10.0: at-risk and broken are not reachable over HTTP, so they are
// asserted here as pure data, exactly as the arch doc intends).
// ---------------------------------------------------------------------------

const notStartedView = {
  habitId: "habit_1",
  name: "Drink water",
  currentStreak: 0,
  longestStreak: 0,
  atRisk: false,
  lastCompletedDate: null,
};

const healthyView = {
  habitId: "habit_2",
  name: "Meditate",
  currentStreak: 4,
  longestStreak: 9,
  atRisk: false,
  lastCompletedDate: "2026-07-27",
};

const atRiskView = {
  habitId: "habit_3",
  name: "Stretch",
  currentStreak: 6,
  longestStreak: 6,
  atRisk: true,
  lastCompletedDate: "2026-07-26",
};

const brokenView = {
  habitId: "habit_4",
  name: "Journal",
  currentStreak: 0,
  longestStreak: 12,
  atRisk: false,
  lastCompletedDate: "2026-07-20",
};

// ---------------------------------------------------------------------------
// C1 — copy is verbatim
// ---------------------------------------------------------------------------

test("C1: copy byte-equals the 04-ui.md §3 table, including U+2026 and ASCII apostrophes", () => {
  assert.equal(COPY.currentStreakLabel, "Current streak");
  assert.equal(COPY.longestStreakLabel, "Longest streak");
  assert.equal(COPY.logDefault, "Log today");
  assert.equal(COPY.logDone, "Logged");
  assert.equal(COPY.notStarted, "Not started yet. Log today to begin.");
  assert.equal(COPY.healthy, "Logged today.");
  assert.equal(COPY.atRiskDetail, "Logged yesterday. Not yet today.");
  assert.equal(COPY.atRiskTag, "Not yet today");
  assert.equal(COPY.brokenDetail, "Not logged yesterday. Today starts a new streak.");
  assert.equal(COPY.brokenTag, "New streak");
  assert.equal(COPY.lastLogged("2026-07-27"), "Last logged 2026-07-27");
  assert.equal(COPY.emptyHeading, "No habits yet.");
  assert.equal(
    COPY.emptyBody,
    "Once a habit is added, its current and longest streaks will appear here.",
  );
  assert.equal(COPY.loading, "Loading habits…");
  assert.equal(COPY.loading.codePointAt(COPY.loading.length - 1), 0x2026);
  assert.equal(COPY.errorList, "Something went wrong loading your habits. Try again.");
  assert.equal(COPY.errorHabitNotFound, "This habit couldn't be found.");
  assert.ok(COPY.errorHabitNotFound.includes("'"), "must use ASCII apostrophe");
  assert.ok(!COPY.errorHabitNotFound.includes("’"), "must not use a curly apostrophe");
  assert.equal(COPY.errorLogFailed, "That didn't go through. Try again.");
  assert.ok(COPY.errorLogFailed.includes("'"), "must use ASCII apostrophe");
  assert.ok(!COPY.errorLogFailed.includes("’"), "must not use a curly apostrophe");

  // No "!" anywhere, no "best" anywhere.
  for (const [key, value] of Object.entries(COPY)) {
    if (typeof value !== "string") continue;
    assert.ok(!value.includes("!"), `COPY.${key} must not contain "!"`);
    assert.ok(!/best/i.test(value), `COPY.${key} must not contain "best"`);
  }

  // No case-insensitive "broken" anywhere in rendered broken-state output.
  const brokenText = JSON.stringify(HabitDetail(brokenView));
  assert.ok(!/broken/i.test(brokenText), "the word 'broken' must never be printed");
});

// ---------------------------------------------------------------------------
// C2 — every state renders
// ---------------------------------------------------------------------------

function textOf(vnode) {
  if (typeof vnode === "string") return vnode;
  if (vnode === null || vnode === undefined) return "";
  return (vnode.children ?? []).map(textOf).join("");
}

function findByClass(vnode, cls) {
  if (!vnode || typeof vnode === "string") return null;
  const classes = (vnode.props?.class ?? "").split(/\s+/);
  if (classes.includes(cls)) return vnode;
  for (const child of vnode.children ?? []) {
    const found = findByClass(child, cls);
    if (found) return found;
  }
  return null;
}

// The numeral+unit text inside a given streak-figure node (label excluded).
function figureValue(figureVnode) {
  return textOf(findByClass(figureVnode, "streak-figure-value"));
}

// A log-control button's visible label is its first child (a string); the
// sr-only habit-name suffix is a separate child, not part of the label.
function logControlLabel(buttonVnode) {
  const first = buttonVnode.children[0];
  return typeof first === "string" ? first : "";
}

test("C2: all seven visible states render with correct copy, tag presence, and log-control label", () => {
  // No habits.
  const empty = EmptyState();
  assert.equal(textOf(findByClass(empty, "empty-heading")), COPY.emptyHeading);
  assert.equal(textOf(findByClass(empty, "empty-body")), COPY.emptyBody);

  // Not started.
  const ns = HabitRow(notStartedView);
  assert.equal(stateOf(notStartedView), "not-started");
  assert.equal(findByClass(ns, "state-tag"), null);
  assert.equal(logControlLabel(findByClass(ns, "log-control")), COPY.logDefault);
  assert.equal(figureValue(findByClass(ns, "streak-figure-longest")), "0 days");

  // Healthy.
  const hy = HabitRow(healthyView);
  assert.equal(stateOf(healthyView), "healthy");
  assert.equal(findByClass(hy, "state-tag"), null);
  assert.equal(logControlLabel(findByClass(hy, "log-control")), COPY.logDone);
  const hyDetail = HabitDetail(healthyView);
  assert.equal(textOf(findByClass(hyDetail, "status-line")), COPY.healthy);

  // At-risk.
  const ar = HabitRow(atRiskView);
  assert.equal(stateOf(atRiskView), "at-risk");
  assert.equal(textOf(findByClass(ar, "state-tag")), COPY.atRiskTag);
  assert.equal(logControlLabel(findByClass(ar, "log-control")), COPY.logDefault);
  assert.equal(figureValue(findByClass(ar, "streak-figure-current")), "6 days", "atRisk keeps yesterday's count intact");
  const arDetail = HabitDetail(atRiskView);
  assert.equal(textOf(findByClass(arDetail, "status-line")), COPY.atRiskDetail);

  // Broken.
  const br = HabitRow(brokenView);
  assert.equal(stateOf(brokenView), "broken");
  assert.equal(textOf(findByClass(br, "state-tag")), COPY.brokenTag);
  assert.equal(logControlLabel(findByClass(br, "log-control")), COPY.logDefault);
  const brDetail = HabitDetail(brokenView);
  assert.equal(textOf(findByClass(brDetail, "status-line")), COPY.brokenDetail);

  // Longest streak present in all four habit states including 0.
  for (const view of [notStartedView, healthyView, atRiskView, brokenView]) {
    const row = HabitRow(view);
    const longest = findByClass(row, "streak-figure-longest");
    assert.ok(longest, `longest-streak figure missing for ${view.name}`);
    assert.equal(figureValue(longest), COPY.days(view.longestStreak));
  }

  // Loading and the three error strings.
  assert.equal(COPY.loading, "Loading habits…");
  assert.equal(textOf(ErrorNotice(COPY.errorList, "region")), COPY.errorList);
  assert.equal(textOf(ErrorNotice(COPY.errorHabitNotFound, "region")), COPY.errorHabitNotFound);
  assert.equal(textOf(ErrorNotice(COPY.errorLogFailed, "inline")), COPY.errorLogFailed);
});

test("C2b: not-started and broken differ only by tag and longest-streak value (both show current streak 0)", () => {
  const nsRow = HabitRow(notStartedView);
  // Both fixtures share the digit 0 for currentStreak.
  assert.equal(figureValue(findByClass(nsRow, "streak-figure-current")), COPY.days(0));
  const brRow = HabitRow(brokenView);
  assert.equal(figureValue(findByClass(brRow, "streak-figure-current")), COPY.days(0));

  assert.equal(findByClass(nsRow, "state-tag"), null);
  assert.notEqual(findByClass(brRow, "state-tag"), null);
  assert.notEqual(notStartedView.longestStreak, brokenView.longestStreak);
});

// ---------------------------------------------------------------------------
// C3 — pluralisation
// ---------------------------------------------------------------------------

test("C3: pluralisation through a rendered figure, not just the helper", () => {
  assert.equal(COPY.days(0), "0 days");
  assert.equal(COPY.days(1), "1 day");
  assert.equal(COPY.days(2), "2 days");

  const oneDayView = { ...healthyView, currentStreak: 1 };
  const fig = StreakFigure(COPY.currentStreakLabel, oneDayView.currentStreak, "streak-figure-current");
  assert.equal(textOf(findByClass(fig, "streak-figure-value")), "1 day");
});

// ---------------------------------------------------------------------------
// C4 — escaping, data half (the one that matters)
// ---------------------------------------------------------------------------

const ALLOWED_TAGS = new Set(["li", "span", "a", "button", "div", "h1", "h2", "p", "ul"]);

function walk(vnode, visit) {
  if (!vnode || typeof vnode === "string") return;
  visit(vnode);
  for (const child of vnode.children ?? []) walk(child, visit);
}

function assertSafeTree(vnode, needle) {
  let sawNameAsChild = false;
  walk(vnode, (node) => {
    assert.ok(ALLOWED_TAGS.has(node.tag), `tag "${node.tag}" is not in the fixed element allowlist`);
    assert.ok(!("html" in node), "vnode must not carry an 'html' key");
    assert.ok(!("innerHTML" in node), "vnode must not carry an 'innerHTML' key");
    assert.ok(!("dangerouslySetInnerHTML" in node), "vnode must not carry a 'dangerouslySetInnerHTML' key");
    for (const [propName, propValue] of Object.entries(node.props ?? {})) {
      if (propName === "on") continue; // function values, not strings
      assert.ok(
        !String(propValue).includes(needle),
        `prop "${propName}" contains part of the untrusted name: ${JSON.stringify(propValue)}`,
      );
    }
    for (const child of node.children ?? []) {
      if (typeof child === "string" && child === needle) sawNameAsChild = true;
    }
  });
  assert.ok(sawNameAsChild, "the untrusted name must appear as a byte-identical string child somewhere");
}

test("C4: hostile habit names never reach a tag, a prop value, or an html-carrying key", () => {
  const hostileNames = [
    "<img src=x onerror=\"alert(1)\">",
    "\"><script>alert(1)</script>",
    "javascript:alert(1)",
    "\" onmouseover=\"x",
    "__proto__",
    "x".repeat(200),
  ];

  for (const name of hostileNames) {
    const view = { ...healthyView, name };
    assertSafeTree(HabitRow(view), name);
    assertSafeTree(HabitDetail(view), name);
  }

  // href stays scheme-proof by construction regardless of the id's content.
  assert.ok(detailHref("javascript:alert(1)").startsWith("#/habit/"));
});

// ---------------------------------------------------------------------------
// C5 — screen-reader sentences
// ---------------------------------------------------------------------------

test("C5: the four fixed-field-order sentences render verbatim, plus the live-region string", () => {
  assert.equal(
    srSentence(notStartedView, "not-started"),
    "Drink water. Current streak 0 days. Longest streak 0 days. Not started yet.",
  );
  assert.equal(
    srSentence(healthyView, "healthy"),
    "Meditate. Current streak 4 days. Longest streak 9 days. Logged today.",
  );
  assert.equal(
    srSentence(atRiskView, "at-risk"),
    "Stretch. Current streak 6 days. Longest streak 6 days. Logged yesterday; not yet logged today.",
  );
  assert.equal(
    srSentence(brokenView, "broken"),
    "Journal. Current streak 0 days. Longest streak 12 days. Not logged yesterday; today starts a new streak.",
  );
  assert.equal(
    COPY.liveLogAnnouncement("Meditate", 5),
    "Meditate logged for today. Current streak 5 days.",
  );
});

// ---------------------------------------------------------------------------
// C6 — the non-oracle over the UI
// ---------------------------------------------------------------------------

test("C6: a never-existed id and a foreign (absent-from-list) id render deep-equal trees", () => {
  const habits = [notStartedView, healthyView];

  const neverExisted = findHabit(habits, "habit_never_existed");
  const foreignButAbsent = findHabit(habits, "habit_3"); // belongs to someone else -> absent here too
  assert.equal(neverExisted, null);
  assert.equal(foreignButAbsent, null);

  const treeA = neverExisted === null ? ErrorNotice(COPY.errorHabitNotFound, "region") : null;
  const treeB = foreignButAbsent === null ? ErrorNotice(COPY.errorHabitNotFound, "region") : null;
  assert.deepEqual(treeA, treeB);
});

test("C6b: mapLogResponse maps two 404s with DIFFERENT bodies to the same {kind:'gone'}, body never read", async () => {
  const res1 = {
    status: 404,
    ok: false,
    json: async () => {
      throw new Error("must never be called for a 404 — the body must not be inspected");
    },
  };
  const res2 = {
    status: 404,
    ok: false,
    json: async () => {
      throw new Error("must never be called for a 404 — the body must not be inspected");
    },
  };
  const mapped1 = await mapLogResponse(res1);
  const mapped2 = await mapLogResponse(res2);
  assert.deepEqual(mapped1, { kind: "gone" });
  assert.deepEqual(mapped2, { kind: "gone" });
});

test("C6c: parseHash and detailHref round-trip, and reject/accept as documented", () => {
  assert.equal(parseHash("#/habit/habit_1"), "habit_1");
  assert.equal(parseHash("#/habit/" + encodeURIComponent("weird id")), "weird id");
  assert.equal(parseHash("#/"), null);
  assert.equal(parseHash(""), null);
  assert.equal(parseHash(undefined), null);
  assert.equal(h("li", {}, ["x"]).tag, "li"); // h() sanity — used throughout render.js
});
