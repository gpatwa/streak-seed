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
