import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import net from "node:net";
import os from "node:os";
import { createStreakServer } from "../src/server.js";
import { logCompletion, _reset as resetHabits } from "../src/services/habits.js";
import { listAuditEvents, _reset as resetAudit } from "../src/services/audit.js";

let server;
let base;
const logs = [];

before(async () => {
  server = createStreakServer({ log: (line) => logs.push(line) });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

function resetAll() {
  resetHabits();
  resetAudit();
}

const CLOSED_KEYS = ["habitId", "name", "currentStreak", "longestStreak", "atRisk", "lastCompletedDate"];

async function createHabitHttp(userId, name) {
  const res = await fetch(`${base}/habits`, {
    method: "POST",
    headers: { "x-user-id": userId },
    body: JSON.stringify({ name }),
  });
  return res.json();
}

// ---------------------------------------------------------------------------
// Happy paths
// ---------------------------------------------------------------------------

test("S1: GET /health -> 200 {status:ok}, no X-User-Id required", async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
});

test("S2: POST /habits -> 201, zeroed HabitView, name stored trimmed", async () => {
  resetAll();
  const res = await fetch(`${base}/habits`, {
    method: "POST",
    headers: { "x-user-id": "u-s2" },
    body: JSON.stringify({ name: "  Drink water  " }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.habit.name, "Drink water");
  assert.equal(body.habit.currentStreak, 0);
  assert.equal(body.habit.longestStreak, 0);
  assert.equal(body.habit.atRisk, false);
  assert.equal(body.habit.lastCompletedDate, null);
  assert.ok(typeof body.habit.habitId === "string" && body.habit.habitId.length > 0);
});

test("S3: POST /habits/:id/completions -> 200, changed:true, currentStreak:1, lastCompletedDate = today UTC", async () => {
  resetAll();
  const created = await createHabitHttp("u-s3", "Meditate");

  const res = await fetch(`${base}/habits/${created.habit.habitId}/completions`, {
    method: "POST",
    headers: { "x-user-id": "u-s3" },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.changed, true);
  assert.equal(body.habit.currentStreak, 1);
  const todayUTC = new Date().toISOString().slice(0, 10);
  assert.equal(body.habit.lastCompletedDate, todayUTC);
});

test("S4: GET /habits -> 200, array of views; [] for a user with none", async () => {
  resetAll();
  const empty = await fetch(`${base}/habits`, { headers: { "x-user-id": "u-s4-empty" } });
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { habits: [] });

  await createHabitHttp("u-s4", "Read");
  const res = await fetch(`${base}/habits`, { headers: { "x-user-id": "u-s4" } });
  const body = await res.json();
  assert.equal(body.habits.length, 1);
  assert.equal(body.habits[0].name, "Read");
});

// ---------------------------------------------------------------------------
// Validation failures
// ---------------------------------------------------------------------------

test("S5: missing X-User-Id on every user route -> 400 x-user-id header required", async () => {
  const calls = [
    () => fetch(`${base}/habits`, { method: "POST", body: JSON.stringify({ name: "x" }) }),
    () => fetch(`${base}/habits/habit_1/completions`, { method: "POST" }),
    () => fetch(`${base}/habits`),
  ];
  for (const call of calls) {
    const res = await call();
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "x-user-id header required" });
  }
});

test("S6: whitespace-only X-User-Id -> 400 (trim + non-empty)", async () => {
  const res = await fetch(`${base}/habits`, { headers: { "x-user-id": "   " } });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "x-user-id header required" });
});

test("S7: missing / non-string / whitespace-only name -> 400 name required", async () => {
  const bodies = [{}, { name: 42 }, { name: "   " }];
  for (const b of bodies) {
    const res = await fetch(`${base}/habits`, {
      method: "POST",
      headers: { "x-user-id": "u-s7" },
      body: JSON.stringify(b),
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "name required" });
  }
});

test("S8: name of 201 chars -> 400 name too long; the rejected name does not appear in the response body", async () => {
  const longName = "x".repeat(201);
  const res = await fetch(`${base}/habits`, {
    method: "POST",
    headers: { "x-user-id": "u-s8" },
    body: JSON.stringify({ name: longName }),
  });
  assert.equal(res.status, 400);
  const text = await res.text();
  assert.equal(text, JSON.stringify({ error: "name too long" }));
  assert.ok(!text.includes("xxxx"));
});

test("S9: malformed JSON body -> 400 invalid json", async () => {
  const res = await fetch(`${base}/habits`, {
    method: "POST",
    headers: { "x-user-id": "u-s9" },
    body: "{not valid json",
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "invalid json" });
});

test("S10: body > 8 KiB -> 413 payload too large, and the response is actually delivered", async () => {
  const res = await fetch(`${base}/habits`, {
    method: "POST",
    headers: { "x-user-id": "u-s10" },
    body: "a".repeat(9000),
  });
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { error: "payload too large" });
});

test("S11: unmatched route and unmatched method -> 404 not found", async () => {
  const r1 = await fetch(`${base}/nope`);
  assert.equal(r1.status, 404);
  assert.deepEqual(await r1.json(), { error: "not found" });

  const r2 = await fetch(`${base}/habits`, { method: "DELETE", headers: { "x-user-id": "u-s11" } });
  assert.equal(r2.status, 404);
  assert.deepEqual(await r2.json(), { error: "not found" });
});

test("S12: closed error set — every failure body has exactly one key, value in the documented allow-list, no internals leaked", async () => {
  const allowList = new Set([
    "x-user-id header required",
    "name required",
    "name too long",
    "invalid json",
    "payload too large",
    "habit not found",
    "not found",
    "internal error",
  ]);

  const responses = await Promise.all([
    fetch(`${base}/habits`),
    fetch(`${base}/habits`, { method: "POST", headers: { "x-user-id": "u-s12" }, body: JSON.stringify({}) }),
    fetch(`${base}/habits`, {
      method: "POST",
      headers: { "x-user-id": "u-s12" },
      body: JSON.stringify({ name: "x".repeat(201) }),
    }),
    fetch(`${base}/habits`, { method: "POST", headers: { "x-user-id": "u-s12" }, body: "{bad" }),
    fetch(`${base}/habits`, { method: "POST", headers: { "x-user-id": "u-s12" }, body: "a".repeat(9000) }),
    fetch(`${base}/habits/does-not-exist/completions`, { method: "POST", headers: { "x-user-id": "u-s12" } }),
    fetch(`${base}/nope`),
  ]);

  for (const res of responses) {
    const text = await res.text();
    const body = JSON.parse(text);
    assert.deepEqual(Object.keys(body), ["error"]);
    assert.ok(allowList.has(body.error), `unexpected error phrase: ${body.error}`);
    assert.ok(!text.includes("stack"));
    assert.ok(!text.includes("TypeError"));
    assert.ok(!text.includes("RangeError"));
    assert.ok(!text.includes("at Object"));
    assert.ok(!/\/Users\/|\/home\/|[A-Za-z]:\\/.test(text), "no file path leaked");
    assert.ok(!text.includes("now"));
  }
});

// ---------------------------------------------------------------------------
// Clock guard over HTTP
// ---------------------------------------------------------------------------

test("S13: date/now/timestamp fields in the completion body are ignored — the server's today wins", async () => {
  resetAll();
  const created = await createHabitHttp("u-s13", "Stretch");
  const habitId = created.habit.habitId;

  const res1 = await fetch(`${base}/habits/${habitId}/completions`, {
    method: "POST",
    headers: { "x-user-id": "u-s13" },
    body: JSON.stringify({ date: "1999-01-01", now: 0, today: "x", timestamp: 8.64e18 }),
  });
  assert.equal(res1.status, 200);
  const body1 = await res1.json();
  const todayUTC = new Date().toISOString().slice(0, 10);
  assert.equal(body1.habit.lastCompletedDate, todayUTC);

  // Repeat, same UTC day per the server -> changed:false. If a client date
  // had reached the cutoff, this would land on a different day instead.
  const res2 = await fetch(`${base}/habits/${habitId}/completions`, {
    method: "POST",
    headers: { "x-user-id": "u-s13" },
    body: JSON.stringify({ date: "2999-01-01" }),
  });
  assert.equal(res2.status, 200);
  const body2 = await res2.json();
  assert.equal(body2.changed, false);
});

test("S14: query-string date/now params on GET /habits are ignored — identical to the no-query request", async () => {
  resetAll();
  await createHabitHttp("u-s14", "Journal");
  const withQuery = await fetch(`${base}/habits?date=1999-01-01&now=8.64e18`, {
    headers: { "x-user-id": "u-s14" },
  });
  const withoutQuery = await fetch(`${base}/habits`, { headers: { "x-user-id": "u-s14" } });
  assert.equal(withQuery.status, 200);
  assert.deepEqual(await withQuery.json(), await withoutQuery.json());
});

test("S15: call-site arity guard — service calls never take a client-derived clock argument (structural)", () => {
  const src = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");

  const logCalls = src.match(/logCompletion\([^)]*\)/g) ?? [];
  assert.equal(logCalls.length, 1, "expected exactly one logCompletion(...) call site");
  assert.match(logCalls[0], /^logCompletion\(\s*userId\s*,\s*habitId\s*\)$/);

  const listCalls = src.match(/listHabits\([^)]*\)/g) ?? [];
  assert.equal(listCalls.length, 1, "expected exactly one listHabits(...) call site");
  assert.match(listCalls[0], /^listHabits\(\s*userId\s*\)$/);

  assert.ok(!src.includes("new Date("), "server.js must never construct a Date from request data");
});

test("S16: a client-supplied astronomical now never produces a 500, and no error line is logged", async () => {
  resetAll();
  const created = await createHabitHttp("u-s16", "Focus");

  logs.length = 0;
  const res = await fetch(`${base}/habits/${created.habit.habitId}/completions`, {
    method: "POST",
    headers: { "x-user-id": "u-s16" },
    body: JSON.stringify({ now: 8.64e18 }),
  });
  assert.equal(res.status, 200);
  for (const line of logs) {
    assert.ok(!/ 5\d\d /.test(line), `unexpected 5xx in log line: ${JSON.stringify(line)}`);
  }
});

// ---------------------------------------------------------------------------
// The non-oracle
// ---------------------------------------------------------------------------

test("S17: foreign and fake habitId produce byte-identical 404 responses, with no audit trace on either side", async () => {
  resetAll();
  const a = await createHabitHttp("u-s17-a", "A's habit");
  const realForeignId = a.habit.habitId;
  const fakeId = "habit_999999";

  const foreignRes = await fetch(`${base}/habits/${realForeignId}/completions`, {
    method: "POST",
    headers: { "x-user-id": "u-s17-b" },
  });
  const fakeRes = await fetch(`${base}/habits/${fakeId}/completions`, {
    method: "POST",
    headers: { "x-user-id": "u-s17-b" },
  });

  assert.equal(foreignRes.status, 404);
  assert.equal(fakeRes.status, 404);

  const foreignText = await foreignRes.text();
  const fakeText = await fakeRes.text();
  assert.equal(foreignText, fakeText);
  assert.equal(foreignText, JSON.stringify({ error: "habit not found" }));

  assert.equal(foreignRes.headers.get("content-type"), fakeRes.headers.get("content-type"));
  assert.equal(foreignRes.headers.get("content-length"), fakeRes.headers.get("content-length"));
  assert.deepEqual([...foreignRes.headers.keys()].sort(), [...fakeRes.headers.keys()].sort());

  assert.equal(listAuditEvents("u-s17-b").length, 0);
  const aEvents = listAuditEvents("u-s17-a");
  assert.ok(
    aEvents.every((e) => e.type === "habit.created"),
    "A must not have accrued any event from B's probes",
  );
});

test("S18: enumeration sweep — habit_1..habit_20 all produce byte-identical 404s to a non-owner", async () => {
  resetAll();
  // Mixed ownership across two other users; none belong to the prober "u-s18-b".
  for (let i = 0; i < 10; i++) {
    await createHabitHttp(i % 2 === 0 ? "u-s18-a" : "u-s18-c", `habit ${i}`);
  }

  const fakeRes = await fetch(`${base}/habits/habit_999999/completions`, {
    method: "POST",
    headers: { "x-user-id": "u-s18-b" },
  });
  const fakeText = await fakeRes.text();
  assert.equal(fakeRes.status, 404);

  for (let i = 1; i <= 20; i++) {
    const res = await fetch(`${base}/habits/habit_${i}/completions`, {
      method: "POST",
      headers: { "x-user-id": "u-s18-b" },
    });
    assert.equal(res.status, 404);
    assert.equal(await res.text(), fakeText);
  }
});

test("S19: garbage habitIds (%20, __proto__, constructor, 1KB string) -> the same 404 as a foreign id", async () => {
  resetAll();
  await createHabitHttp("u-s19-owner", "Owner's habit");

  const fakeRes = await fetch(`${base}/habits/habit_999999/completions`, {
    method: "POST",
    headers: { "x-user-id": "u-s19-prober" },
  });
  const fakeText = await fakeRes.text();

  const garbageIds = ["%20", "__proto__", "constructor", "g".repeat(1024)];
  for (const id of garbageIds) {
    const res = await fetch(`${base}/habits/${id}/completions`, {
      method: "POST",
      headers: { "x-user-id": "u-s19-prober" },
    });
    assert.equal(res.status, 404);
    assert.equal(await res.text(), fakeText, `garbage id ${JSON.stringify(id)} produced a different body`);
  }
});

test("S20: log lines for foreign vs fake completions are byte-identical apart from duration", async () => {
  resetAll();
  const owner = await createHabitHttp("u-s20-owner", "Owner's habit");

  logs.length = 0;
  await fetch(`${base}/habits/${owner.habit.habitId}/completions`, {
    method: "POST",
    headers: { "x-user-id": "u-s20-prober" },
  });
  const foreignLine = logs.at(-1);

  await fetch(`${base}/habits/habit_999999/completions`, {
    method: "POST",
    headers: { "x-user-id": "u-s20-prober" },
  });
  const fakeLine = logs.at(-1);

  const stripDuration = (line) => line.replace(/\d+ms/, "<ms>");
  assert.equal(stripDuration(foreignLine), stripDuration(fakeLine));
});

// ---------------------------------------------------------------------------
// §5 idempotency over HTTP
// ---------------------------------------------------------------------------

test("S21: two completions on the same day -> both 200, byte-identical habit objects except changed, exactly one audit event", async () => {
  resetAll();
  const created = await createHabitHttp("u-s21", "Walk");
  const habitId = created.habit.habitId;

  const first = await fetch(`${base}/habits/${habitId}/completions`, {
    method: "POST",
    headers: { "x-user-id": "u-s21" },
  });
  const second = await fetch(`${base}/habits/${habitId}/completions`, {
    method: "POST",
    headers: { "x-user-id": "u-s21" },
  });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const firstBody = await first.json();
  const secondBody = await second.json();
  assert.equal(firstBody.changed, true);
  assert.equal(secondBody.changed, false);
  assert.deepEqual(firstBody.habit, secondBody.habit);
  assert.equal(firstBody.habit.currentStreak, secondBody.habit.currentStreak);

  const logged = listAuditEvents("u-s21").filter((e) => e.type === "habit.completion_logged");
  assert.equal(logged.length, 1);
});

// ---------------------------------------------------------------------------
// §4 cross-user
// ---------------------------------------------------------------------------

test("S22: A never sees B's habits and vice versa; a failed cross-user log doesn't mutate A", async () => {
  resetAll();
  const aCreated = await createHabitHttp("u-s22-a", "A's habit");
  await createHabitHttp("u-s22-b", "B's habit");

  const aList = await (await fetch(`${base}/habits`, { headers: { "x-user-id": "u-s22-a" } })).json();
  const bList = await (await fetch(`${base}/habits`, { headers: { "x-user-id": "u-s22-b" } })).json();
  assert.ok(!aList.habits.some((h) => h.name === "B's habit"));
  assert.ok(!bList.habits.some((h) => h.name === "A's habit"));

  const attempt = await fetch(`${base}/habits/${aCreated.habit.habitId}/completions`, {
    method: "POST",
    headers: { "x-user-id": "u-s22-b" },
  });
  assert.equal(attempt.status, 404);

  const aAfter = await (await fetch(`${base}/habits`, { headers: { "x-user-id": "u-s22-a" } })).json();
  assert.equal(aAfter.habits[0].currentStreak, 0);
});

test("S23: identity cannot be smuggled via a body userId field", async () => {
  resetAll();
  const res = await fetch(`${base}/habits`, {
    method: "POST",
    headers: { "x-user-id": "u-s23-a" },
    body: JSON.stringify({ userId: "u-s23-b", name: "sneaky" }),
  });
  assert.equal(res.status, 201);

  const bList = await (await fetch(`${base}/habits`, { headers: { "x-user-id": "u-s23-b" } })).json();
  assert.deepEqual(bList.habits, []);

  const aList = await (await fetch(`${base}/habits`, { headers: { "x-user-id": "u-s23-a" } })).json();
  assert.equal(aList.habits.length, 1);
  assert.equal(aList.habits[0].name, "sneaky");
});

// ---------------------------------------------------------------------------
// §6 no names in logs
// ---------------------------------------------------------------------------

test("S24: habit names never reach the log sink, on any route including error paths", async () => {
  resetAll();
  logs.length = 0;

  const names = ["喝水八杯", "habit_1", "<script>x</script>"];
  const created = [];
  for (const name of names) {
    created.push(await createHabitHttp("u-s24", name));
  }

  await fetch(`${base}/health`);
  await fetch(`${base}/habits`, { headers: { "x-user-id": "u-s24" } });
  await fetch(`${base}/habits/${created[0].habit.habitId}/completions`, {
    method: "POST",
    headers: { "x-user-id": "u-s24" },
  });
  await fetch(`${base}/habits/${created[0].habit.habitId}/completions`, {
    method: "POST",
    headers: { "x-user-id": "u-s24" },
  }); // repeat -> changed:false
  await fetch(`${base}/habits/habit_999999/completions`, {
    method: "POST",
    headers: { "x-user-id": "u-s24" },
  }); // fake -> 404
  await fetch(`${base}/habits`); // missing x-user-id -> 400
  await fetch(`${base}/habits`, {
    method: "POST",
    headers: { "x-user-id": "u-s24" },
    body: "{bad",
  }); // invalid json -> 400
  await fetch(`${base}/nope`); // unmatched -> 404
  await fetch(`${base}/habits/${encodeURIComponent(names[2])}/completions`, {
    method: "POST",
    headers: { "x-user-id": "u-s24" },
  }); // a name used AS an id

  const templateRe = /^(GET|POST) (\/health|\/habits|\/habits\/:habitId\/completions|\(unmatched\)) \d{3} \d+ms$/;
  assert.ok(logs.length > 0, "expected at least one log line to have been captured");
  for (const line of logs) {
    const trimmed = line.replace(/\n$/, "");
    assert.match(trimmed, templateRe, `log line does not match the fixed template: ${JSON.stringify(line)}`);
    for (const name of names) {
      assert.ok(!trimmed.includes(name), `log line leaked a habit name: ${JSON.stringify(line)}`);
    }
  }
});

test("S25: name is body-only — a name in the query string is not read, and the log line carries no query", async () => {
  resetAll();
  logs.length = 0;
  const res = await fetch(`${base}/habits?name=Drink%20water`, {
    method: "POST",
    headers: { "x-user-id": "u-s25" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "name required" });

  const line = logs.at(-1);
  assert.ok(!line.includes("?"));
  assert.ok(!line.includes("name="));
  assert.match(line.replace(/\n$/, ""), /^POST \/habits 400 \d+ms$/);
});

// ---------------------------------------------------------------------------
// §2 / §3
// ---------------------------------------------------------------------------

test("S26: an at-risk habit is returned over HTTP with its streak intact, not zeroed", async () => {
  resetAll();
  const created = await createHabitHttp("u-s26", "Stretch");

  // Seed "yesterday" directly via the service's test-only clock seam — NOT
  // reachable from HTTP (S15 proves the HTTP layer never binds a third arg).
  logCompletion("u-s26", created.habit.habitId, Date.now() - 86_400_000);

  const res = await fetch(`${base}/habits`, { headers: { "x-user-id": "u-s26" } });
  const body = await res.json();
  assert.equal(body.habits[0].atRisk, true);
  assert.equal(body.habits[0].currentStreak, 1);
});

test("S27: every HabitView in every response has exactly the closed key set", async () => {
  resetAll();
  const created = await createHabitHttp("u-s27", "Read");
  assert.deepEqual(Object.keys(created.habit).sort(), [...CLOSED_KEYS].sort());

  const logged = await (
    await fetch(`${base}/habits/${created.habit.habitId}/completions`, {
      method: "POST",
      headers: { "x-user-id": "u-s27" },
    })
  ).json();
  assert.deepEqual(Object.keys(logged.habit).sort(), [...CLOSED_KEYS].sort());
  assert.deepEqual(Object.keys(logged).sort(), ["changed", "habit"].sort());

  const list = await (await fetch(`${base}/habits`, { headers: { "x-user-id": "u-s27" } })).json();
  for (const h of list.habits) {
    assert.deepEqual(Object.keys(h).sort(), [...CLOSED_KEYS].sort());
  }
});

// ---------------------------------------------------------------------------
// Import safety
// ---------------------------------------------------------------------------

test("S28: server.js exports createStreakServer and only listens when run directly", async () => {
  const mod = await import("../src/server.js");
  assert.equal(typeof mod.createStreakServer, "function");

  const src = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(
    src,
    /if\s*\(\s*import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`\s*\)/,
    "listen() must be guarded to run only when the module is executed directly",
  );
});

// ---------------------------------------------------------------------------
// Network bind (BIND-1 regression — runs/http-layer/04-security.md §3.1,
// fixed in runs/http-layer/02-impl.md "Rework — Security round 1 blocker")
// ---------------------------------------------------------------------------
//
// The bug was `.listen(port, cb)` with no host, which binds every interface.
// createStreakServer() itself was never the problem — the top-level guarded
// block at the bottom of src/server.js is, and that block only runs when the
// file is *executed*, not imported (see S28), so it cannot be exercised by
// constructing a server in-process the way every other test in this file
// does. It has to be run the same way Security and QA ran it: as a real
// `node src/server.js` OS process (see runs/http-layer/03-qa.md §6 and
// 04-security.md §4 for why the in-process harness is insufficient here too).

test("S29: startup code is pinned to an explicit loopback host, not a bare port", () => {
  const src = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(
    src,
    /const\s+host\s*=\s*["']127\.0\.0\.1["']/,
    "the production startup block must bind an explicit loopback host constant",
  );
  assert.match(
    src,
    /\.listen\(\s*port\s*,\s*host\s*,/,
    ".listen() must be called with (port, host, ...) — a bare (port, cb) binds every interface",
  );
});

test("S30: node src/server.js (the real entry point) is reachable via 127.0.0.1 but not via the host's LAN address", async (t) => {
  const lanAddress = Object.values(os.networkInterfaces())
    .flat()
    .find((a) => a && a.family === "IPv4" && !a.internal)?.address;

  if (!lanAddress) {
    t.skip("no non-loopback IPv4 interface on this host — cannot exercise the wildcard-bind regression check");
    return;
  }

  const serverPath = fileURLToPath(new URL("../src/server.js", import.meta.url));

  // Grab a free port from the OS, then hand that exact number to the child
  // process — avoids colliding with any other test's ephemeral listener.
  const port = await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port: p } = probe.address();
      probe.close((err) => (err ? reject(err) : resolve(p)));
    });
  });

  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (c) => (stdout += c));
  child.stderr.on("data", (c) => (stderr += c));

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`server did not log startup within 5s; stdout=${stdout} stderr=${stderr}`)),
        5000,
      );
      const check = () => {
        if (stdout.includes("listening on")) {
          clearTimeout(timer);
          resolve();
        }
      };
      child.stdout.on("data", check);
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`server exited early (code ${code}) before logging startup; stderr=${stderr}`));
      });
      check();
    });

    // Requirement: the bound host is visible in the startup log line, so a
    // wildcard bind would be obvious at a glance, not silent.
    assert.match(
      stdout,
      new RegExp(`listening on 127\\.0\\.0\\.1:${port}\\b`),
      `startup line must show the loopback host explicitly, got: ${stdout}`,
    );

    // Positive control — loopback must still work.
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 200);

    // The actual regression check, mirroring exactly how Security reproduced
    // BIND-1 live (04-security.md §3.1): reach the process via the host's
    // real non-loopback interface address. A connection succeeding here means
    // the server bound the wildcard address again.
    await new Promise((resolve, reject) => {
      const sock = net.connect({ host: lanAddress, port });
      const timer = setTimeout(() => {
        sock.destroy();
        resolve(); // no response off loopback within the window = not reachable = correct
      }, 1500);
      sock.once("connect", () => {
        clearTimeout(timer);
        sock.destroy();
        reject(
          new Error(
            `connected to ${lanAddress}:${port} over a non-loopback interface — ` +
              `server is reachable off loopback (BIND-1 regressed)`,
          ),
        );
      });
      sock.once("error", () => {
        clearTimeout(timer);
        resolve(); // ECONNREFUSED/EHOSTUNREACH etc. = not reachable = correct
      });
    });
  } finally {
    child.kill();
  }
});

// ── 413 keep-alive (carried from runs/http-layer/04-security.md) ───────────
// The 413 used to advertise keep-alive and then RST the socket, breaking the
// client's NEXT, unrelated request on a pooled connection. It must announce
// `Connection: close` so the client never reuses it. Uses node:http only —
// this repo is dependency-free.

const rawRequest = (agent, path, method, body) =>
  new Promise((resolve, reject) => {
    const u = new URL(base);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path,
        method,
        agent,
        headers: {
          "X-User-Id": "u1",
          "content-type": "application/json",
          ...(body ? { "content-length": Buffer.byteLength(body) } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });

test("S31: 413 announces Connection: close even when the client asked to keep alive", async () => {
  // keepAlive:true is load-bearing: with keepAlive:false the CLIENT sends
  // `Connection: close` and Node echoes it back, so this would pass even
  // without the fix. The client must request reuse for the assertion to bite.
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  try {
    const res = await rawRequest(agent, "/habits", "POST", JSON.stringify({ name: "x".repeat(20_000) }))
      .catch((e) => ({ error: e }));
    assert.ok(!res.error, `413 response must arrive, got ${res.error}`);
    assert.equal(res.status, 413);
    assert.equal(
      res.headers.connection,
      "close",
      "a 413 that advertises keep-alive and then drops the socket breaks the client's next request",
    );
    assert.deepEqual(JSON.parse(res.body), { error: "payload too large" });
  } finally {
    agent.destroy();
  }
});

// NOTE: there is deliberately no test asserting "the next pooled request still
// succeeds". Node's http.Agent transparently replaces a dead socket, so such a
// test passes with or without the fix — a vacuous guard, which RUN_ECONOMICS
// §7 says is worse than none. The `Connection: close` assertion above is the
// real, deterministic guard: it is what stops the client reusing the socket.
