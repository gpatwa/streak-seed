// Source-text assertions over src/client/ — no DOM, no dependencies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CLIENT_DIR = fileURLToPath(new URL("../src/client/", import.meta.url));

function readClientFile(name) {
  return readFileSync(`${CLIENT_DIR}${name}`, "utf8");
}

function clientFiles() {
  return readdirSync(CLIENT_DIR).filter((f) => !f.startsWith("."));
}

// ---------------------------------------------------------------------------
// C7 — no gamifying motion
// ---------------------------------------------------------------------------

test("C7: app.css has zero @keyframes, animation, or transition", () => {
  const css = readClientFile("app.css");
  assert.equal((css.match(/@keyframes/g) ?? []).length, 0);
  assert.equal((css.match(/\banimation\b/gi) ?? []).length, 0);
  assert.equal((css.match(/\btransition\b/gi) ?? []).length, 0);
});

// ---------------------------------------------------------------------------
// C8 — banned tokens (arch doc §3.5), matched over every file in src/client/
// as plain text, comments included.
// ---------------------------------------------------------------------------

const BANNED_RE =
  /innerHTML|outerHTML|insertAdjacentHTML|document\.write|createContextualFragment|\beval\s*\(|new\s+Function|\bdocument\.title|\bconsole\.|\bDate\b|srcdoc|javascript:|\bon\w+\s*=\s*["']|debugger/g;

test("C8: the banned-token regex matches zero times across every file in src/client/", () => {
  for (const file of clientFiles()) {
    const text = readClientFile(file);
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const matches = lines[i].match(BANNED_RE);
      assert.equal(
        matches,
        null,
        `banned token ${JSON.stringify(matches)} found in ${file}:${i + 1}: ${lines[i]}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// C9 — index.html is inert
// ---------------------------------------------------------------------------

test("C9: index.html has only src-only module scripts, no inline script content, no on*=, no style=, no inline <style>, exactly one aria-live region", () => {
  const html = readClientFile("index.html");

  const scriptTags = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(scriptTags.length >= 1, "expected at least one <script> tag");
  for (const [full, inner] of scriptTags) {
    assert.match(full, /\bsrc=/, `script tag has no src=: ${full}`);
    assert.match(full, /\btype=["']module["']/, `script tag is not type="module": ${full}`);
    assert.equal(inner.trim(), "", `script tag has inline content: ${full}`);
  }

  assert.doesNotMatch(html, /\son\w+\s*=/i, "index.html must not have any on*= attribute");
  assert.doesNotMatch(html, /\sstyle\s*=/i, "index.html must not have any style= attribute");
  assert.doesNotMatch(html, /<style[\s>]/i, "index.html must not have an inline <style> element");

  const ariaLiveMatches = html.match(/aria-live\s*=/gi) ?? [];
  assert.equal(ariaLiveMatches.length, 1, "expected exactly one aria-live region");
});

// ---------------------------------------------------------------------------
// C10 — allowlist and disk agree
// ---------------------------------------------------------------------------

test("C10: every STATIC key maps to a file that exists, and every src/client/ file is reachable through exactly one key", async () => {
  const { STATIC } = await import("../src/server.js");
  assert.ok(STATIC, "src/server.js must export STATIC for this test to pin against");

  const keys = Object.keys(STATIC);
  const mappedFiles = keys.map((k) => STATIC[k].file);
  const diskFiles = clientFiles();

  for (const file of mappedFiles) {
    assert.ok(diskFiles.includes(file), `STATIC maps to "${file}", which does not exist on disk`);
  }

  assert.deepEqual([...mappedFiles].sort(), [...diskFiles].sort(), "every file in src/client/ must be reachable through exactly one STATIC key, and vice versa");

  // No duplicate mapping (two keys pointing at the same file).
  assert.equal(new Set(mappedFiles).size, mappedFiles.length, "two STATIC keys must not map to the same file");
});
