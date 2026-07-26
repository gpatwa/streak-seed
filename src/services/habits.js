// Habit service (in-memory for the seed): stores + createHabit / listHabits /
// logCompletion. The single source of "today" is the injectable `now` clock
// (default Date.now()), which is never client-supplied — a real request
// handler calls these with no clock argument, so server time is authoritative
// (SAFETY_INVARIANTS §1). See runs/greenfield/05-arch.md §1/§2.
import { dayIndex, computeView } from "./streak.js";
import { recordAuditEvent } from "./audit.js";

/** @type {Map<string, {habitId:string,userId:string,name:string,createdAt:string}>} */
const habits = new Map();

/** @type {Map<string, Set<number>>} */
const completionDays = new Map(); // habitId -> Set of UTC day-indices logged

let seq = 0;

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} required`);
  }
}

/** Build the caller-facing view for one habit as of todayIndex. */
function viewOf(habit, todayIndex) {
  const days = completionDays.get(habit.habitId) ?? new Set();
  return {
    habitId: habit.habitId,
    name: habit.name, // UI display text — never audit metadata (§6)
    ...computeView(days, todayIndex),
  };
}

/**
 * Create a habit for a user. Emits `habit.created` (habitId only, never name).
 * @param {string} userId
 * @param {string} name
 * @returns {object} initial view (all zeros, atRisk false, lastCompletedDate null)
 * @throws {TypeError} on empty/non-string userId or name (before any mutation/audit)
 */
export function createHabit(userId, name) {
  assertNonEmptyString(userId, "userId");
  assertNonEmptyString(name, "name");

  const habitId = `habit_${++seq}`;
  const habit = { habitId, userId, name, createdAt: new Date().toISOString() };
  habits.set(habitId, habit);
  recordAuditEvent(userId, "habit.created", { habitId });
  return viewOf(habit, dayIndex());
}

/**
 * List a user's habits as computed views, as of `now`. Read-only; no audit.
 * Scoped: returns ONLY habits whose record.userId === userId (§4).
 * @param {string} userId
 * @param {number|Date} [now=Date.now()]  injectable clock; NOT client-supplied (§3)
 * @returns {object[]}
 * @throws {TypeError} on empty/non-string userId
 */
export function listHabits(userId, now = Date.now()) {
  assertNonEmptyString(userId, "userId");
  const today = dayIndex(now);
  const out = [];
  for (const habit of habits.values()) {
    if (habit.userId === userId) out.push(viewOf(habit, today));
  }
  return out;
}

/**
 * Log a completion for TODAY (per the server cutoff). Idempotent per day (§5).
 * Ownership-gated: an unknown or foreign habitId returns null with NO mutation
 * and NO audit event (§4) — it never reveals or touches another user's data.
 * @param {string} userId
 * @param {string} habitId
 * @param {number|Date} [now=Date.now()]  injectable clock; NOT client-supplied (§3)
 * @returns {(object & { changed: boolean }) | null}
 *          null if habit not found / not owned; changed=false on a same-day re-log.
 * @throws {TypeError} on empty/non-string userId or habitId (before any lookup)
 */
export function logCompletion(userId, habitId, now = Date.now()) {
  assertNonEmptyString(userId, "userId");
  assertNonEmptyString(habitId, "habitId");

  const habit = habits.get(habitId);
  if (!habit || habit.userId !== userId) return null; // §4: checked before any Set touch

  const today = dayIndex(now);
  let days = completionDays.get(habitId);
  if (!days) {
    days = new Set();
    completionDays.set(habitId, days);
  }

  const changed = !days.has(today);
  if (changed) days.add(today); // §5: Set membership makes a re-log a structural no-op

  const view = viewOf(habit, today);

  if (changed) {
    // One event per (habit, day) — never on a same-day re-log (§5, §6).
    recordAuditEvent(userId, "habit.completion_logged", {
      habitId,
      dayIndex: today,
      currentStreak: view.currentStreak,
      longestStreak: view.longestStreak,
    });
  }

  return { ...view, changed };
}

/** Test helper — clears habits, completionDays, and seq. */
export function _reset() {
  habits.clear();
  completionDays.clear();
  seq = 0;
}
