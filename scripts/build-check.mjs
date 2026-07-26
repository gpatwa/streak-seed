// Build check: every shipped module must import cleanly. The repo is
// dependency-free, so "build" = prove each module loads without a runtime
// error.
const modules = [
  "../src/services/streak.js",
  "../src/services/habits.js",
  "../src/services/audit.js",
];

for (const m of modules) {
  await import(new URL(m, import.meta.url));
}
console.log("build ok");
