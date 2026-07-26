// Pure day-cutoff + streak math (SAFETY_INVARIANTS §1/§2 — the crux invariant).
// No state, no I/O, no Date.now() calls anywhere in this file: every function
// takes the day-set and/or todayIndex as arguments, so it is exhaustively
// testable with pinned indices and zero store setup. See runs/greenfield/05-arch.md §3.

const MS_PER_DAY = 86_400_000;

/** UTC day-index: whole UTC days since 1970-01-01. Same UTC calendar day → same int. */
export function dayIndex(now = Date.now()) {
  const ms = now instanceof Date ? now.getTime() : now;
  return Math.floor(ms / MS_PER_DAY);
}

/** Inverse, date-only: day-index -> "YYYY-MM-DD" (UTC). */
export function isoDateUTC(idx) {
  return new Date(idx * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Completed yesterday and not yet today — false in every other case. */
export function atRisk(daySet, todayIndex) {
  return daySet.has(todayIndex - 1) && !daySet.has(todayIndex);
}

/** Consecutive days up to today, holding yesterday's count during the grace day. */
export function currentStreak(daySet, todayIndex) {
  if (daySet.size === 0) return 0;
  let last = -Infinity;
  for (const d of daySet) if (d > last) last = d;
  if (last < todayIndex - 1) return 0;          // ≥1 full empty day elapsed → broken
  let streak = 0, d = last;                      // last is today or yesterday
  while (daySet.has(d)) { streak++; d--; }        // walk the run back from last
  return streak;
}

/** Longest run of consecutive day-indices anywhere in history. */
export function longestStreak(daySet) {
  let best = 0;
  for (const d of daySet) {
    if (!daySet.has(d - 1)) {                      // d starts a run
      let len = 1, n = d + 1;
      while (daySet.has(n)) { len++; n++; }
      if (len > best) best = len;
    }
  }
  return best;
}

/** Bundle the three, plus lastCompletedDate, from one (daySet, todayIndex). */
export function computeView(daySet, todayIndex) {
  let last = null;
  for (const d of daySet) if (last === null || d > last) last = d;
  return {
    currentStreak: currentStreak(daySet, todayIndex),
    longestStreak: longestStreak(daySet),
    atRisk: atRisk(daySet, todayIndex),
    lastCompletedDate: last === null ? null : isoDateUTC(last),
  };
}
