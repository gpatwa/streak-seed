// The static route over real HTTP. Same harness style as test/server.test.js
// (ephemeral port, captured log).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createStreakServer, STATIC } from "../src/server.js";
import { _reset as resetHabits } from "../src/services/habits.js";
import { _reset as resetAudit } from "../src/services/audit.js";

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

const CLIENT_DIR = fileURLToPath(new URL("../src/client/", import.meta.url));

// ---------------------------------------------------------------------------
// C15 — GET /
// ---------------------------------------------------------------------------

test("C15: GET / -> 200 html, no-store, nosniff, CSP without unsafe-inline/unsafe-eval, byte-equal body", async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");

  const csp = res.headers.get("content-security-policy");
  assert.ok(csp, "expected a Content-Security-Policy header on GET /");
  assert.ok(csp.includes("default-src 'none'"), `CSP missing default-src 'none': ${csp}`);
  assert.ok(!csp.includes("unsafe-inline"), `CSP must not contain unsafe-inline: ${csp}`);
  assert.ok(!csp.includes("unsafe-eval"), `CSP must not contain unsafe-eval: ${csp}`);

  const body = await res.text();
  const expected = readFileSync(`${CLIENT_DIR}index.html`, "utf8");
  assert.equal(body, expected);
});

// ---------------------------------------------------------------------------
// C16 — the other six assets and the negative space
// ---------------------------------------------------------------------------

test("C16: every declared static path serves its declared content type, and traversal/negative paths all 404", async () => {
  for (const [pathname, { type }] of Object.entries(STATIC)) {
    if (pathname === "/") continue; // covered by C15
    const res = await fetch(`${base}${pathname}`);
    assert.equal(res.status, 200, `expected 200 for ${pathname}`);
    assert.equal(res.headers.get("content-type"), type, `wrong content-type for ${pathname}`);
  }

  const postAppJs = await fetch(`${base}/app.js`, { method: "POST" });
  assert.equal(postAppJs.status, 404);
  assert.deepEqual(await postAppJs.json(), { error: "not found" });

  const negativePaths = [
    "/app.css/../server.js",
    "/%2e%2e/server.js",
    "/../src/server.js",
    "/client/app.js",
    "/app.js%00.txt",
    "/APP.JS",
  ];
  const serverSrc = readFileSync(fileURLToPath(new URL("../src/server.js", import.meta.url)), "utf8");
  for (const p of negativePaths) {
    const res = await fetch(`${base}${p}`);
    assert.equal(res.status, 404, `expected 404 for ${p}, got ${res.status}`);
    const text = await res.text();
    assert.equal(text, JSON.stringify({ error: "not found" }), `expected the standard 404 body for ${p}`);
    assert.ok(!text.includes(serverSrc.slice(0, 40)), `response for ${p} must not leak server source`);
  }
});

// ---------------------------------------------------------------------------
// C17 — assets carry no user data
// ---------------------------------------------------------------------------

test("C17: static assets serve 200 without X-User-Id, and are byte-identical for two different user ids", async () => {
  const noHeader = await fetch(`${base}/app.css`);
  assert.equal(noHeader.status, 200);

  const asUserA = await fetch(`${base}/app.css`, { headers: { "x-user-id": "u-c17-a" } });
  const asUserB = await fetch(`${base}/app.css`, { headers: { "x-user-id": "u-c17-b" } });
  assert.equal(asUserA.status, 200);
  assert.equal(asUserB.status, 200);
  assert.equal(await asUserA.text(), await asUserB.text());
});

// ---------------------------------------------------------------------------
// C18 — logging
// ---------------------------------------------------------------------------

test("C18: every static hit logs a template drawn from exactly the STATIC keys, and an unmatched path with a hostile query still logs (unmatched) with no request-derived text", async () => {
  logs.length = 0;
  for (const pathname of Object.keys(STATIC)) {
    await fetch(`${base}${pathname}`);
  }
  const staticLines = logs.filter((l) => /^GET \S+ 200 \d+ms$/.test(l.trim()));
  assert.equal(staticLines.length, Object.keys(STATIC).length);
  for (const line of staticLines) {
    const template = line.trim().split(" ")[1];
    assert.ok(Object.hasOwn(STATIC, template), `log line used a template not in STATIC: ${JSON.stringify(line)}`);
  }

  logs.length = 0;
  const evilQuery = "/nope?name=<script>alert(1)</script>";
  await fetch(`${base}${evilQuery}`);
  assert.equal(logs.length, 1);
  const line = logs[0].trim();
  assert.match(line, /^GET \(unmatched\) \d{3} \d+ms$/);
  assert.ok(!line.includes("<script>"));
  assert.ok(!line.includes("name="));
});

// ---------------------------------------------------------------------------
// C19 — nothing else moved
// ---------------------------------------------------------------------------

test("C19: /health, GET|POST /habits, the completions 404 non-oracle, and the 413 path are unaffected by the static route", async () => {
  resetAll();

  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });

  const created = await fetch(`${base}/habits`, {
    method: "POST",
    headers: { "x-user-id": "u-c19" },
    body: JSON.stringify({ name: "Read" }),
  });
  assert.equal(created.status, 201);
  const createdBody = await created.json();

  const list = await fetch(`${base}/habits`, { headers: { "x-user-id": "u-c19" } });
  assert.equal(list.status, 200);

  const fake404 = await fetch(`${base}/habits/habit_999999/completions`, {
    method: "POST",
    headers: { "x-user-id": "u-c19" },
  });
  assert.equal(fake404.status, 404);
  assert.deepEqual(await fake404.json(), { error: "habit not found" });

  const foreign404 = await fetch(`${base}/habits/${createdBody.habit.habitId}/completions`, {
    method: "POST",
    headers: { "x-user-id": "u-c19-other" },
  });
  assert.equal(foreign404.status, 404);
  assert.equal(await foreign404.text(), JSON.stringify({ error: "habit not found" }));

  const big = await fetch(`${base}/habits`, {
    method: "POST",
    headers: { "x-user-id": "u-c19" },
    body: "a".repeat(9000),
  });
  assert.equal(big.status, 413);
  assert.deepEqual(await big.json(), { error: "payload too large" });
});
