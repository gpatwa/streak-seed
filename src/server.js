// Dependency-free HTTP surface over the StreakKeeper services (node:http
// only). Honors the safety invariants over HTTP: userId comes from a header
// only, single source (§4); no date/clock input is ever bound from a
// request — dayIndex()'s own guard in src/services/streak.js is the actual
// enforcement point (§1, §2.5); one undifferentiated 404 for foreign-or-fake
// habitId, mechanism not intention (§3/§4 non-oracle); and access logs carry
// a route TEMPLATE only — never a raw path, query string, or habit name
// (§6). See runs/http-layer/01-arch.md.
import http from "node:http";
import { createHabit, listHabits, logCompletion } from "./services/habits.js";

const MAX_BODY_BYTES = 8_192; // 8 KiB — ~10x the largest legitimate body (a 200-char name)
const COMPLETIONS_RE = /^\/habits\/([^/]+)\/completions$/;

// Closed error-phrase set (§2.6). Each is a single frozen object referenced
// from exactly one call site below, so a given failure is byte-identical no
// matter which request triggers it.
const ERR = Object.freeze({
  userIdRequired: Object.freeze({ error: "x-user-id header required" }),
  nameRequired: Object.freeze({ error: "name required" }),
  nameTooLong: Object.freeze({ error: "name too long" }),
  invalidJson: Object.freeze({ error: "invalid json" }),
  payloadTooLarge: Object.freeze({ error: "payload too large" }),
  notFound: Object.freeze({ error: "not found" }),
  internalError: Object.freeze({ error: "internal error" }),
});

// The one response for foreign-or-fake habitId (§3). A single frozen
// constant with a single call site below is the entire non-oracle mechanism:
// the handler receives `null` from logCompletion and has no way to tell a
// real-but-foreign habit from a fake one, because the service deliberately
// does not tell it. No second lookup, no habits.has() pre-check, ever.
const HABIT_NOT_FOUND = Object.freeze({ error: "habit not found" });

function send(res, status, obj) {
  const payload = JSON.stringify(obj);
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store", // personal habit data must never be cached
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

// Used only for the 413 path: write the response and confirm it has been
// handed off to the socket BEFORE destroying anything. Never destroy first —
// that would risk truncating a response that was never delivered (§2.1).
function sendAndDestroy(req, res, status, obj) {
  const payload = JSON.stringify(obj);
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload, () => {
    req.destroy();
  });
}

// Collect chunks in an array and decode ONCE with Buffer.concat (§2.1).
// Unlike `data += chunk` (stash-seed's pattern), this cannot split a
// multi-byte UTF-8 character — habit names are explicitly Unicode — across a
// chunk boundary into a corrupted replacement character. Enforces
// MAX_BODY_BYTES for every request, regardless of route: a resource-
// protection concern, not a per-route one.
function readBodyCapped(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    function cleanup() {
      req.removeListener("data", onData);
      req.removeListener("end", onEnd);
      req.removeListener("error", onError);
    }
    function onData(chunk) {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        settled = true;
        cleanup();
        const err = new Error("payload too large");
        err.status = 413;
        reject(err);
        return;
      }
      chunks.push(chunk);
    }
    function onEnd() {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks));
    }
    function onError(err) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    }
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });
}

// Empty body -> {}. A parsed value that is not a plain object (array,
// string, null) -> {} too — the handlers only ever read named fields, so a
// non-object simply has none of them and falls through to the normal
// required-field errors. Only a genuine JSON.parse failure is a 400 (§2.2).
function parseJsonBody(buf) {
  if (buf.length === 0) return {};
  let parsed;
  try {
    parsed = JSON.parse(buf.toString("utf8"));
  } catch {
    const err = new Error("invalid json");
    err.status = 400;
    throw err;
  }
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed;
  }
  return {};
}

// Single source of userId: the X-User-Id header, trimmed, required non-empty
// (§2.3, §4). Never read from the body or the query — there is no second
// channel that could disagree with the first.
function identify(req) {
  const raw = req.headers["x-user-id"];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function handleRequest(req, res, log) {
  const started = Date.now();
  const method = req.method;
  const qIdx = req.url.indexOf("?");
  const pathname = qIdx === -1 ? req.url : req.url.slice(0, qIdx);

  // Route match is a pure string/regex decision, independent of the body —
  // it determines both which handler runs and the route TEMPLATE used for
  // logging (§6). habitId, when present, is the raw path segment: NOT
  // decoded, NOT trimmed, passed verbatim to the service (§2.4) — shape-
  // checking it would split the id space and weaken the non-oracle (§3).
  let routeTemplate = "(unmatched)";
  let matched = null;
  let habitId = null;

  if (method === "GET" && pathname === "/health") {
    routeTemplate = "/health";
    matched = "health";
  } else if (method === "POST" && pathname === "/habits") {
    routeTemplate = "/habits";
    matched = "createHabit";
  } else if (method === "GET" && pathname === "/habits") {
    routeTemplate = "/habits";
    matched = "listHabits";
  } else {
    const m = pathname.match(COMPLETIONS_RE);
    if (method === "POST" && m) {
      routeTemplate = "/habits/:habitId/completions";
      matched = "logCompletion";
      habitId = m[1];
    }
  }

  const finish = (status) => {
    log(`${method} ${routeTemplate} ${status} ${Date.now() - started}ms\n`);
  };

  // §2.1 body size — ahead of everything else, for every request regardless
  // of route: a resource-protection concern, not a per-route one.
  let bodyBuf;
  try {
    bodyBuf = await readBodyCapped(req);
  } catch (err) {
    if (err && err.status === 413) {
      sendAndDestroy(req, res, 413, ERR.payloadTooLarge);
      finish(413);
    } else {
      // Client/stream error (e.g. aborted mid-upload) — best-effort cleanup;
      // nothing reliable left to respond to.
      try {
        req.destroy();
      } catch {
        /* already gone */
      }
      try {
        res.destroy();
      } catch {
        /* already gone */
      }
    }
    return;
  }

  if (!matched) {
    send(res, 404, ERR.notFound);
    finish(404);
    return;
  }

  // §2.2 JSON parse — only a recognized route ever looks at the body.
  let body;
  try {
    body = parseJsonBody(bodyBuf);
  } catch {
    send(res, 400, ERR.invalidJson);
    finish(400);
    return;
  }

  try {
    if (matched === "health") {
      // No X-User-Id required — this route carries no user data.
      send(res, 200, { status: "ok" });
      finish(200);
      return;
    }

    // §2.3 identity — every remaining route needs it.
    const userId = identify(req);
    if (userId === null) {
      send(res, 400, ERR.userIdRequired);
      finish(400);
      return;
    }

    if (matched === "createHabit") {
      const rawName = body.name;
      if (typeof rawName !== "string" || rawName.trim().length === 0) {
        send(res, 400, ERR.nameRequired);
        finish(400);
        return;
      }
      const name = rawName.trim();
      if (name.length > 200) {
        send(res, 400, ERR.nameTooLong);
        finish(400);
        return;
      }
      const habit = createHabit(userId, name);
      send(res, 201, { habit });
      finish(201);
      return;
    }

    if (matched === "listHabits") {
      const habits = listHabits(userId);
      send(res, 200, { habits });
      finish(200);
      return;
    }

    if (matched === "logCompletion") {
      // Fixed arity, never a third argument — `now` is never bound from
      // request data anywhere in this file (§1, §2.5; structurally asserted
      // by test S15).
      const result = logCompletion(userId, habitId);
      if (result === null) {
        send(res, 404, HABIT_NOT_FOUND); // the ONLY branch that returns this
        finish(404);
        return;
      }
      const { changed, ...habit } = result;
      send(res, 200, { habit, changed });
      finish(200);
      return;
    }
  } catch {
    // Any TypeError that still escapes a service here is a bug, not an
    // input problem — the boundary above exists to make this unreachable
    // (§2.6). Never leak the underlying message, stack, or type.
    send(res, 500, ERR.internalError);
    finish(500);
  }
}

/**
 * @param {{log?: (line: string) => void}} [opts] `log` is a test seam (S24),
 *   defaulting to process.stdout.write. Not bindable from a request.
 */
export function createStreakServer({ log = process.stdout.write.bind(process.stdout) } = {}) {
  return http.createServer((req, res) => {
    handleRequest(req, res, log).catch(() => {
      // Last-resort safety net: a bug above must never crash the process or
      // hang the socket.
      try {
        if (!res.headersSent) send(res, 500, ERR.internalError);
      } catch {
        /* socket already gone */
      }
      try {
        res.end();
      } catch {
        /* already ended */
      }
    });
  });
}

// Start only when run directly — import-safe for tests and the build check
// (S28): importing this module starts no listener and binds no port.
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || 3000;
  // Loopback only (BIND-1, runs/http-layer/04-security.md §3.1): the spec's
  // entire justification for trusting a self-asserted X-User-Id header is
  // that this surface is local and unreachable. Omitting the host argument
  // here binds every interface (0.0.0.0/::), silently making that untrue.
  // Exposing this beyond loopback is a rule-3 human-approval action, not a
  // default. Bound host is echoed in the log line so a wildcard bind would
  // be obvious at a glance, not just correct-by-omission.
  const host = "127.0.0.1";
  createStreakServer().listen(port, host, () => {
    process.stdout.write(`streak-seed listening on ${host}:${port}\n`);
  });
}
