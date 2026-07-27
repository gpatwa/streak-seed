import { test } from "node:test";
import assert from "node:assert/strict";
import { dayIndex, isoDateUTC, computeView } from "../src/services/streak.js";

// Pinned "today" day-index for every pure test below — 2026-01-10 UTC.
const T = dayIndex(Date.UTC(2026, 0, 10));

// T1 — Day boundary: at-risk and broken can never both be true (§1).
test("T1: at-risk and broken are mutually exclusive across the day boundary", () => {
  const daySet = new Set([T - 1]); // logged exactly one day, yesterday relative to T

  // At T-1 itself (the day it was logged): healthy.
  let view = computeView(daySet, T - 1);
  assert.equal(view.currentStreak, 1);
  assert.equal(view.atRisk, false);
  assert.ok(!(view.atRisk && view.currentStreak === 0 && view.longestStreak > 0));

  // At T: logged yesterday, not yet today -> at-risk, streak intact, not broken.
  view = computeView(daySet, T);
  assert.equal(view.atRisk, true);
  assert.equal(view.currentStreak, 1);
  assert.ok(!(view.atRisk && view.currentStreak === 0 && view.longestStreak > 0));

  // At T+1: a full empty day has elapsed -> broken (current 0), not at-risk.
  view = computeView(daySet, T + 1);
  assert.equal(view.atRisk, false);
  assert.equal(view.currentStreak, 0);
  assert.equal(view.longestStreak, 1);
  assert.ok(!(view.atRisk && view.currentStreak === 0 && view.longestStreak > 0));
});

// T3 — A streak of exactly 1 is not special-cased; behaves like any longer run.
test("T3: a streak of length 1 behaves the same as any longer run", () => {
  const daySet = new Set([T]);

  let view = computeView(daySet, T + 1);
  assert.equal(view.atRisk, true);
  assert.equal(view.currentStreak, 1);

  view = computeView(daySet, T + 2);
  assert.equal(view.currentStreak, 0);
  assert.equal(view.atRisk, false);
});

// T4 (pure half) — a broken streak leaves longestStreak unchanged, atRisk false.
test("T4 (pure): a broken streak leaves longestStreak unchanged and atRisk false", () => {
  const daySet = new Set([T - 3, T - 2]); // a 2-day run, then a gap up to T
  const view = computeView(daySet, T);
  assert.equal(view.currentStreak, 0);
  assert.equal(view.longestStreak, 2);
  assert.equal(view.atRisk, false);
});

// T10 — not-started and broken share the digit 0 but differ in longestStreak.
test("T10: not-started and broken share currentStreak 0 but differ in longestStreak", () => {
  const notStarted = computeView(new Set(), T);
  assert.equal(notStarted.currentStreak, 0);
  assert.equal(notStarted.longestStreak, 0);

  const broken = computeView(new Set([T - 3, T - 2]), T);
  assert.equal(broken.currentStreak, 0);
  assert.equal(broken.longestStreak, 2);
});

// T12 — dayIndex is the single UTC cutoff: same day -> same index, boundary -> +1.
test("T12: dayIndex maps instants to a single UTC calendar day", () => {
  const startOfDay = Date.UTC(2026, 0, 10, 0, 0, 0);
  const endOfDay = Date.UTC(2026, 0, 10, 23, 59, 59);
  assert.equal(dayIndex(startOfDay), dayIndex(endOfDay));

  const startOfNextDay = Date.UTC(2026, 0, 11, 0, 0, 0);
  assert.equal(dayIndex(startOfNextDay) - dayIndex(endOfDay), 1);

  // Accepts either a Date instance or a raw epoch-ms number, and they match.
  assert.equal(dayIndex(new Date(startOfDay)), dayIndex(startOfDay));

  // isoDateUTC is the exact inverse (date-only) of dayIndex.
  assert.equal(isoDateUTC(dayIndex(startOfDay)), "2026-01-10");
});

// --- Clock guard (runs/http-layer/01-arch.md §2.5) ---
// Carried precondition from runs/greenfield/08-security.md §4: a bad `now`
// must throw a TypeError BEFORE any caller can mutate a completion Set.
const MAX_TIME = 8_640_000_000_000_000; // ECMA-262 max representable time value

test("C1: a pinned epoch-ms and its equivalent Date produce the same index (no behavior change for valid input)", () => {
  const ms = Date.UTC(2026, 0, 10);
  assert.equal(dayIndex(ms), dayIndex(new Date(ms)));
});

test('C2: dayIndex(new Date("garbage")) throws TypeError, not RangeError', () => {
  assert.throws(() => dayIndex(new Date("garbage")), TypeError);
});

test("C3: dayIndex(new Date(1e300)) throws TypeError — the Invalid Date form", () => {
  assert.throws(() => dayIndex(new Date(1e300)), TypeError);
});

test("C4: dayIndex(8.64e18) throws TypeError — finite-but-astronomical, defeats a naive finiteness-on-the-index check", () => {
  // Math.floor(8.64e18 / 86_400_000) === 1e11, and Number.isFinite(1e11) is
  // true — this is exactly the case a finiteness-only guard on the INDEX
  // (rather than the input) would miss.
  assert.equal(Number.isFinite(Math.floor(8.64e18 / 86_400_000)), true);
  assert.throws(() => dayIndex(8.64e18), TypeError);
});

test("C5: dayIndex(1e300) throws TypeError — same class as C4, index ~1.16e292", () => {
  assert.throws(() => dayIndex(1e300), TypeError);
});

test("C6: dayIndex succeeds at the exact representable bounds (±8.64e15 -> ±1e8)", () => {
  assert.equal(dayIndex(MAX_TIME), 1e8);
  assert.equal(dayIndex(-MAX_TIME), -1e8);
});

test("C7: dayIndex(8.64e15 + 1000) throws — the near-boundary epoch a round-trip-only guard would silently clamp to day 1e8", () => {
  assert.throws(() => dayIndex(MAX_TIME + 1000), TypeError);
});

test("C8: Infinity, -Infinity, and NaN all throw", () => {
  assert.throws(() => dayIndex(Infinity), TypeError);
  assert.throws(() => dayIndex(-Infinity), TypeError);
  assert.throws(() => dayIndex(NaN), TypeError);
});

test("C9: non-number/non-Date values throw instead of silently coercing to day 0 (1970-01-01)", () => {
  for (const bad of [null, true, false, "2020-01-01", {}, []]) {
    assert.throws(
      () => dayIndex(bad),
      TypeError,
      `dayIndex(${JSON.stringify(bad)}) should throw instead of coercing`,
    );
  }
});

test("C10: postcondition sweep — isoDateUTC never throws on any index dayIndex can return", () => {
  for (const now of [0, 1, -1, MAX_TIME, -MAX_TIME, Date.UTC(2026, 0, 10)]) {
    const idx = dayIndex(now);
    assert.doesNotThrow(() => isoDateUTC(idx));
  }
});
