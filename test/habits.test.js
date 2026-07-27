import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createHabit,
  listHabits,
  logCompletion,
  _reset as resetHabits,
} from "../src/services/habits.js";
import {
  listAuditEvents,
  _reset as resetAudit,
} from "../src/services/audit.js";

const MS_PER_DAY = 86_400_000;
// Pinned clock for every service-level test — 2026-01-10T00:00:00Z.
const NOW = Date.UTC(2026, 0, 10);

function resetAll() {
  resetHabits();
  resetAudit();
}

// T2 — First-ever log.
test("T2: first-ever log sets current/longest to 1 and changed=true", () => {
  resetAll();
  const created = createHabit("u1", "Meditate");

  const result = logCompletion("u1", created.habitId, NOW);

  assert.equal(result.changed, true);
  assert.equal(result.currentStreak, 1);
  assert.equal(result.longestStreak, 1);
  assert.equal(result.atRisk, false);
  assert.equal(result.lastCompletedDate, "2026-01-10");
});

// T4 (service half) — a gap breaks the streak but longest survives, via listHabits.
test("T4 (service): a gap breaks the streak but longest survives, via listHabits", () => {
  resetAll();
  const { habitId } = createHabit("u1", "Meditate");

  logCompletion("u1", habitId, NOW);
  logCompletion("u1", habitId, NOW + MS_PER_DAY);

  const later = NOW + MS_PER_DAY + 3 * MS_PER_DAY; // jump +3 days past the last log
  const [view] = listHabits("u1", later);
  assert.equal(view.currentStreak, 0);
  assert.equal(view.longestStreak, 2);
});

// T5 — Same-day double-log idempotency.
test("T5: a same-day re-log is a no-op — changed=false, no duplicate audit event", () => {
  resetAll();
  const { habitId } = createHabit("u1", "Meditate");

  const first = logCompletion("u1", habitId, NOW);
  const second = logCompletion("u1", habitId, NOW);

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(second.currentStreak, first.currentStreak);
  assert.equal(second.longestStreak, first.longestStreak);
  assert.equal(second.lastCompletedDate, first.lastCompletedDate);

  const logged = listAuditEvents("u1").filter(
    (e) => e.type === "habit.completion_logged",
  );
  assert.equal(logged.length, 1);
});

// T6 — User isolation.
test("T6: a user only ever sees or affects their own habits", () => {
  resetAll();
  const { habitId } = createHabit("u1", "Meditate");
  logCompletion("u1", habitId, NOW);

  // u2 sees no habits at all.
  assert.deepEqual(listHabits("u2", NOW), []);

  const beforeU2Attempt = listHabits("u1", NOW)[0];

  // u2 cannot log against u1's habit.
  const result = logCompletion("u2", habitId, NOW);
  assert.equal(result, null);

  // u1's habit is unaffected by u2's rejected attempt.
  const afterU2Attempt = listHabits("u1", NOW)[0];
  assert.deepEqual(afterU2Attempt, beforeU2Attempt);

  // Neither user accrued an audit event from the rejected attempt.
  assert.equal(listAuditEvents("u2").length, 0);
  const u1Logged = listAuditEvents("u1").filter(
    (e) => e.type === "habit.completion_logged",
  );
  assert.equal(u1Logged.length, 1); // only u1's own successful log
});

// T7 — No habit name in audit.
test("T7: audit events never carry the habit name", () => {
  resetAll();
  const { habitId } = createHabit("u1", "Meditate");
  logCompletion("u1", habitId, NOW);

  const events = listAuditEvents("u1");
  assert.ok(!JSON.stringify(events).includes("Meditate"));

  const logged = events.find((e) => e.type === "habit.completion_logged");
  assert.deepEqual(
    Object.keys(logged.metadata).sort(),
    ["currentStreak", "dayIndex", "habitId", "longestStreak"].sort(),
  );
});

// T8 — Longest never decreases across a break.
test("T8: longestStreak survives a break and is still returned", () => {
  resetAll();
  const { habitId } = createHabit("u1", "Meditate");

  logCompletion("u1", habitId, NOW);
  logCompletion("u1", habitId, NOW + MS_PER_DAY);
  logCompletion("u1", habitId, NOW + 2 * MS_PER_DAY);

  const later = NOW + 2 * MS_PER_DAY + 3 * MS_PER_DAY; // skip well past the run
  const [view] = listHabits("u1", later);
  assert.equal(view.currentStreak, 0);
  assert.equal(view.longestStreak, 3);
});

// T9 — At-risk clears same day.
test("T9: logging on an at-risk day clears atRisk and extends the streak", () => {
  resetAll();
  const { habitId } = createHabit("u1", "Meditate");
  logCompletion("u1", habitId, NOW); // day 1 -> current 1

  const nextDay = NOW + MS_PER_DAY;
  const [beforeLog] = listHabits("u1", nextDay);
  assert.equal(beforeLog.atRisk, true);
  assert.equal(beforeLog.currentStreak, 1);

  const result = logCompletion("u1", habitId, nextDay);
  assert.equal(result.atRisk, false);
  assert.equal(result.currentStreak, 2);
});

// T11 — Input guards.
test("T11: input guards throw TypeError before any mutation or audit", () => {
  resetAll();

  assert.throws(() => createHabit("", "Meditate"), TypeError);
  assert.throws(() => createHabit(null, "Meditate"), TypeError);
  assert.throws(() => createHabit("u1", ""), TypeError);
  assert.equal(listHabits("u1", NOW).length, 0);
  assert.equal(listAuditEvents("u1").length, 0);

  const { habitId } = createHabit("u1", "Meditate");
  resetAudit(); // isolate the guard checks below from the creation event

  assert.throws(() => logCompletion("", habitId, NOW), TypeError);
  assert.throws(() => logCompletion(null, habitId, NOW), TypeError);
  assert.throws(() => logCompletion("u1", "", NOW), TypeError);
  assert.throws(() => listHabits(""), TypeError);
  assert.throws(() => listHabits(null), TypeError);

  // No mutation happened from any guarded call: the habit is still unlogged.
  const [view] = listHabits("u1", NOW);
  assert.equal(view.currentStreak, 0);
  assert.equal(listAuditEvents("u1").length, 0);
});

// --- Clock guard: pre-mutation proof (runs/http-layer/01-arch.md §2.5/§7 "H" cases) ---
// The regression that matters: a bad clock must throw BEFORE touching a Set,
// with zero collateral damage to any other habit for the same user.

// H1 — invalid Date form.
test("H1: a bad-clock log throws before mutation; a later valid log succeeds; no collateral damage to a second habit", () => {
  resetAll();
  const h1 = createHabit("u1", "Habit One");
  const h2 = createHabit("u1", "Habit Two");

  assert.throws(() => logCompletion("u1", h1.habitId, new Date("garbage")), TypeError);

  // A subsequent valid log on the same habit still succeeds.
  const result = logCompletion("u1", h1.habitId, NOW);
  assert.equal(result.changed, true);
  assert.equal(result.currentStreak, 1);

  // listHabits returns BOTH habits — no partial mutation, no permanent
  // corruption, no collateral damage to the untouched second habit.
  const all = listHabits("u1", NOW);
  assert.equal(all.length, 2);
  const untouched = all.find((v) => v.habitId === h2.habitId);
  assert.equal(untouched.currentStreak, 0);
});

// H2 — finite-but-astronomical form; identical assertions to H1.
test("H2: dayIndex(8.64e18) via logCompletion throws before mutation, same as H1", () => {
  resetAll();
  const h1 = createHabit("u1", "Habit One");
  const h2 = createHabit("u1", "Habit Two");

  assert.throws(() => logCompletion("u1", h1.habitId, 8.64e18), TypeError);

  const result = logCompletion("u1", h1.habitId, NOW);
  assert.equal(result.changed, true);
  assert.equal(result.currentStreak, 1);

  const all = listHabits("u1", NOW);
  assert.equal(all.length, 2);
  const untouched = all.find((v) => v.habitId === h2.habitId);
  assert.equal(untouched.currentStreak, 0);
});

// H3 — the read path (listHabits) throws too, and recovers on a valid call.
test("H3: listHabits(u, 8.64e18) throws; a subsequent valid listHabits still returns everything", () => {
  resetAll();
  createHabit("u1", "Habit One");
  createHabit("u1", "Habit Two");

  assert.throws(() => listHabits("u1", 8.64e18), TypeError);

  const all = listHabits("u1", NOW);
  assert.equal(all.length, 2);
});
