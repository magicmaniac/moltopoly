import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const outDir = path.join(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const MATCHES = Number(process.env.MATCHES ?? 25);
const CLEAN = (process.env.CLEAN ?? "1") === "1";

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (CLEAN) {
  for (const f of fs.readdirSync(outDir)) {
    if (/^match_\d+\.json$/i.test(f)) fs.unlinkSync(path.join(outDir, f));
  }
}

console.log(`\n🦞 Running ${MATCHES} matches...\n`);
for (let i = 0; i < MATCHES; i++) {
  run("node", ["cli/moltopoly.mjs"]);
}

console.log(`\n📊 Building season report...\n`);
run("node", ["src/season.mjs", "out"]);

console.log(`\n✅ Done. Open: out/season.html\n`);
