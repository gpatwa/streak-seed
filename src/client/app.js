// fetch, state machine, event wiring, mount calls. Exports start().
//
// This file's top level only defines things — no document/window/fetch
// reference outside a function body (arch doc §2.1) — so the pure pieces
// (getUserId, parseHash, findHabit, mapLogResponse) are unit-testable with no
// DOM at all. All DOM reads/writes go through dom.js's byId/mount/setText;
// this file never calls document.* directly, keeping dom.js the sole
// DOM-touching module in the client.
import { COPY } from "./copy.js";
import { HabitRow, HabitDetail, EmptyState, ErrorNotice, stateOf, logControlId } from "./render.js";
import { mount, setText, byId, restoreFocus } from "./dom.js";

const USER_ID_KEY = "streakkeeper.userId";
const DEFAULT_USER_ID = "local";

/** localStorage-backed user id, defaulting to "local" (arch doc §2.5). Never
 * rendered, never placed in a URL. */
export function getUserId() {
  try {
    const stored = localStorage.getItem(USER_ID_KEY);
    return stored && stored.length > 0 ? stored : DEFAULT_USER_ID;
  } catch {
    return DEFAULT_USER_ID;
  }
}

/** `#/habit/<id>` -> decoded id, or null for any other hash (including ""
 * and "#"). Pure string parsing — no DOM, no fetch. */
export function parseHash(hash) {
  const m = /^#\/habit\/(.+)$/.exec(hash ?? "");
  return m ? decodeURIComponent(m[1]) : null;
}

/** The client's one source of habit existence: a lookup in the array the
 * user's own GET /habits returned (arch doc §4.1). */
export function findHabit(habits, id) {
  return habits.find((entry) => entry.habitId === id) ?? null;
}

// The ONLY place a log response becomes UI state (arch doc §4.2). On 404 the
// body is never read — not parsed, not compared — so two different {error}
// bodies from the server could never produce two different UI states.
export async function mapLogResponse(res) {
  if (res.status === 404) return { kind: "gone" };
  if (!res.ok) return { kind: "failed" };
  const body = await res.json();
  return { kind: "ok", habit: body.habit, changed: body.changed };
}

export function start() {
  const root = byId("app");
  const live = byId("live-region");
  const userId = getUserId();

  // status: "loading" (first GET /habits in flight) | "load-error" | "loaded"
  const state = { status: "loading", habits: [], inlineErrorId: null };

  function render() {
    if (state.status === "loading") {
      mount(root, { tag: "p", props: { class: "loading" }, children: [COPY.loading] });
      return;
    }
    if (state.status === "load-error") {
      mount(root, ErrorNotice(COPY.errorList, "region"));
      return;
    }
    const habitId = parseHash(location.hash);
    if (habitId !== null) {
      renderDetail(habitId);
    } else {
      renderList();
    }
  }

  function renderList() {
    if (state.habits.length === 0) {
      mount(root, EmptyState());
      return;
    }
    const rows = state.habits.map((view) =>
      HabitRow(
        view,
        () => handleLog(view.habitId),
        state.inlineErrorId === view.habitId ? COPY.errorLogFailed : null,
      ),
    );
    mount(root, { tag: "ul", props: { class: "habit-list" }, children: rows });
  }

  function renderDetail(habitId) {
    // The client's only knowledge of which habits exist is state.habits, so
    // a foreign id and a fictional id both miss this lookup and land on the
    // same branch, same constant, same DOM (arch doc §4.1).
    const view = findHabit(state.habits, habitId);
    if (view === null) {
      mount(root, ErrorNotice(COPY.errorHabitNotFound, "region"));
      return;
    }
    mount(
      root,
      HabitDetail(
        view,
        () => handleLog(view.habitId),
        state.inlineErrorId === view.habitId ? COPY.errorLogFailed : null,
      ),
    );
  }

  // Every render() triggered by a log attempt tears down and rebuilds the
  // just-clicked control (mount()'s replaceChildren), so focus must be
  // explicitly asked back afterward (arch doc §7.2 / 04-ui.md §4: "focus
  // stays on the control"). `focusHabitId` is the habit whose log control
  // should get focus back, or null when that row no longer exists after the
  // render (e.g. a 404 dropped the habit from state.habits) — in which case
  // focus lands on the #app landmark (tabindex="-1" in index.html) rather
  // than being lost to <body> with no context.
  function renderAndRestoreFocus(focusHabitId) {
    render();
    restoreFocus(focusHabitId ? logControlId(focusHabitId) : null, root);
  }

  async function handleLog(habitId) {
    const view = findHabit(state.habits, habitId);
    if (view === null) return;
    // A second tap on an already-logged habit is a no-op: no request, no
    // re-render, no re-announcement (arch doc §7.4).
    if (stateOf(view) === "healthy") return;

    state.inlineErrorId = null;
    try {
      const res = await fetch(`/habits/${encodeURIComponent(habitId)}/completions`, {
        method: "POST",
        headers: { "x-user-id": userId },
      });
      const mapped = await mapLogResponse(res);

      if (mapped.kind === "gone") {
        // Mirrors §4.1: the client updates its one source of truth so list
        // and detail agree — the habit simply no longer resolves.
        state.habits = state.habits.filter((entry) => entry.habitId !== habitId);
        renderAndRestoreFocus(null);
        return;
      }
      if (mapped.kind === "failed") {
        state.inlineErrorId = habitId;
        renderAndRestoreFocus(habitId);
        return;
      }

      state.habits = state.habits.map((entry) => (entry.habitId === habitId ? mapped.habit : entry));
      if (mapped.changed) {
        setText(live, COPY.liveLogAnnouncement(view.name, mapped.habit.currentStreak));
      }
      renderAndRestoreFocus(habitId);
    } catch {
      // Rejected value is dropped, not stored — no console, ever (§5.2).
      state.inlineErrorId = habitId;
      renderAndRestoreFocus(habitId);
    }
  }

  async function load() {
    try {
      const res = await fetch("/habits", { headers: { "x-user-id": userId } });
      if (!res.ok) throw new Error("load failed");
      const body = await res.json();
      state.status = "loaded";
      state.habits = body.habits;
    } catch {
      state.status = "load-error";
    }
    render();
  }

  window.addEventListener("hashchange", render);
  render(); // paints the loading line immediately
  load();
}
