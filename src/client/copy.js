// Every user-facing string in the client, verbatim from runs/greenfield/04-ui.md
// §3. This is the ONLY place a string destined for the screen may be written —
// no other client file may contain a string literal meant for display. That
// makes "the copy is authoritative" a checkable property (test C1), not a
// habit any one author has to remember.
//
// Character-exactness matters and was verified against the source file:
// `loading` ends with U+2026 HORIZONTAL ELLIPSIS (bytes e2 80 a6), not three
// periods; `couldn't` and `didn't` use ASCII `'` (U+0027), not U+2019.

export const COPY = Object.freeze({
  currentStreakLabel: "Current streak",
  longestStreakLabel: "Longest streak",
  logDefault: "Log today",
  logDone: "Logged",
  notStarted: "Not started yet. Log today to begin.",
  healthy: "Logged today.",
  atRiskDetail: "Logged yesterday. Not yet today.",
  atRiskTag: "Not yet today",
  brokenDetail: "Not logged yesterday. Today starts a new streak.",
  brokenTag: "New streak",
  lastLogged: (date) => `Last logged ${date}`,
  emptyHeading: "No habits yet.",
  emptyBody: "Once a habit is added, its current and longest streaks will appear here.",
  loading: "Loading habits…",
  errorList: "Something went wrong loading your habits. Try again.",
  errorHabitNotFound: "This habit couldn't be found.",
  errorLogFailed: "That didn't go through. Try again.",
  // Pluralized unit helper (§6.1 of the arch doc): days(0) === "0 days",
  // days(1) === "1 day", days(2) === "2 days".
  days: (n) => `${n} ${n === 1 ? "day" : "days"}`,
  // Screen-reader field-order sentences (04-ui.md §4) and the live-region
  // announcement (§7.4 of the arch doc). Kept here, not inline in render.js,
  // so C1/C5 can check them byte-for-byte in one place too.
  srNotStarted: (habit) => `${habit}. Current streak 0 days. Longest streak 0 days. Not started yet.`,
  srHealthy: (habit, n, m) => `${habit}. Current streak ${COPY.days(n)}. Longest streak ${COPY.days(m)}. Logged today.`,
  srAtRisk: (habit, n, m) =>
    `${habit}. Current streak ${COPY.days(n)}. Longest streak ${COPY.days(m)}. Logged yesterday; not yet logged today.`,
  srBroken: (habit, m) =>
    `${habit}. Current streak 0 days. Longest streak ${COPY.days(m)}. Not logged yesterday; today starts a new streak.`,
  liveLogAnnouncement: (habit, n) => `${habit} logged for today. Current streak ${COPY.days(n)}.`,
});
