// HabitView -> vnode. PURE: no DOM, no fetch, no clock — the JS clock
// constructor is itself a banned token in src/client/, enforced by the
// static scan in client-static.test.js (this comment deliberately does not
// spell it, since the scan matches every file as plain text, comments
// included) — see runs/browser-client/01-arch.md §2.4 and §3.5.
//
// A vnode is plain data: { tag, props, children }. `children` entries are
// EITHER a string (always becomes a text node in dom.js) OR a nested vnode.
// There is no third kind — no `html` child, no raw-string escape hatch. The
// representation cannot express "this string is markup," so no caller here
// can ask dom.js for one (arch doc §2.2, §3.1).
import { COPY } from "./copy.js";

function h(tag, props, children) {
  return { tag, props: props ?? {}, children: children ?? [] };
}

function detailHref(id) {
  return `#/habit/${encodeURIComponent(id)}`;
}

/** The stable DOM id of a habit's log control, in both list and detail view
 * (arch doc §7.2 / 04-ui.md §4: focus must stay on the control after
 * logging). Exported so app.js can ask dom.js to refocus this same id after
 * a remount, without app.js touching the DOM itself. Built from `habitId`
 * (server-assigned, never the untrusted display name), and passed to
 * `document.getElementById` only — never a selector — so no escaping is
 * needed for the attribute-set path either (dom.js's `setProp` already goes
 * through `setAttribute`). */
function logControlId(habitId) {
  return `log-${habitId}`;
}

/** Total, mutually exclusive state derivation over a HabitView alone. No
 * clock of any kind is read here — see arch doc §2.4. */
function stateOf(view) {
  if (view.lastCompletedDate === null) return "not-started";
  if (view.atRisk) return "at-risk";
  if (view.currentStreak === 0) return "broken";
  return "healthy";
}

// ---------------------------------------------------------------------------
// Components (arch doc §2.3)
// ---------------------------------------------------------------------------

function StreakFigure(label, n, extraClass) {
  return h("span", { class: `streak-figure ${extraClass}` }, [
    h("span", { class: "streak-figure-label" }, [label]),
    h("span", { class: "streak-figure-value" }, [COPY.days(n)]),
  ]);
}

function StateTag(state) {
  if (state === "at-risk") return h("span", { class: "state-tag" }, [COPY.atRiskTag]);
  if (state === "broken") return h("span", { class: "state-tag" }, [COPY.brokenTag]);
  return null;
}

// `onLog`, when supplied, is threaded into the vnode's reserved `on` prop
// (arch doc §2.2) so dom.js — and only dom.js — ever calls addEventListener.
// render.js stays a pure function of data even though a function value passes
// through it: no DOM is touched here, nothing is called, nothing is read.
// Omitting `onLog` (as the pure unit tests do) simply omits the `on` prop.
function LogTodayControl(view, alreadyLoggedToday, onLog) {
  const label = alreadyLoggedToday ? COPY.logDone : COPY.logDefault;
  const props = { type: "button", class: "log-control", id: logControlId(view.habitId) };
  if (onLog) props.on = { click: onLog };
  return h("button", props, [label, h("span", { class: "sr-only" }, [` ${view.name}`])]);
}

function srSentence(view, state) {
  if (state === "not-started") return COPY.srNotStarted(view.name);
  if (state === "healthy") return COPY.srHealthy(view.name, view.currentStreak, view.longestStreak);
  if (state === "at-risk") return COPY.srAtRisk(view.name, view.currentStreak, view.longestStreak);
  return COPY.srBroken(view.name, view.longestStreak);
}

function HabitRow(view, onLog, inlineErrorMessage) {
  const state = stateOf(view);
  const alreadyLoggedToday = state === "healthy";
  const tag = StateTag(state);

  const visualChildren = [
    h("span", { class: "row-name" }, [view.name]),
    StreakFigure(COPY.currentStreakLabel, view.currentStreak, "streak-figure-current"),
  ];
  if (tag) visualChildren.push(tag);
  visualChildren.push(StreakFigure(COPY.longestStreakLabel, view.longestStreak, "streak-figure-longest"));

  const children = [
    h("span", { class: "sr-only" }, [srSentence(view, state)]),
    h("span", { class: "row-visual", "aria-hidden": "true" }, visualChildren),
    h("a", { class: "row-link", href: detailHref(view.habitId) }, [
      h("span", { class: "sr-only" }, [view.name]),
    ]),
    LogTodayControl(view, alreadyLoggedToday, onLog),
  ];
  if (inlineErrorMessage) children.push(ErrorNotice(inlineErrorMessage, "inline"));

  return h("li", { class: "habit-row" }, children);
}

function EmptyState() {
  return h("div", { class: "empty-state" }, [
    h("h2", { class: "empty-heading" }, [COPY.emptyHeading]),
    h("p", { class: "empty-body" }, [COPY.emptyBody]),
  ]);
}

function statusLine(view, state) {
  if (state === "not-started") return COPY.notStarted;
  if (state === "healthy") return COPY.healthy;
  if (state === "at-risk") return COPY.atRiskDetail;
  return COPY.brokenDetail;
}

function HabitDetail(view, onLog, inlineErrorMessage) {
  const state = stateOf(view);
  const alreadyLoggedToday = state === "healthy";
  const tag = StateTag(state);

  const children = [
    h("h1", { class: "detail-heading" }, [view.name]),
    StreakFigure(COPY.currentStreakLabel, view.currentStreak, "streak-figure-current streak-figure-hero"),
  ];
  if (tag) children.push(tag);
  children.push(StreakFigure(COPY.longestStreakLabel, view.longestStreak, "streak-figure-longest"));
  children.push(h("p", { class: "status-line" }, [statusLine(view, state)]));
  if (view.lastCompletedDate !== null) {
    children.push(h("p", { class: "last-logged" }, [COPY.lastLogged(view.lastCompletedDate)]));
  }
  children.push(LogTodayControl(view, alreadyLoggedToday, onLog));
  if (inlineErrorMessage) children.push(ErrorNotice(inlineErrorMessage, "inline"));

  return h("div", { class: "habit-detail" }, children);
}

function ErrorNotice(message, variant) {
  return h("p", { class: `error-notice error-notice-${variant}`, role: "alert" }, [message]);
}

export { h, detailHref, logControlId, stateOf, HabitRow, StreakFigure, StateTag, LogTodayControl, EmptyState, HabitDetail, ErrorNotice, srSentence };
