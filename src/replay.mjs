import fs from "node:fs";
import path from "node:path";

export function ensureOutDir(root = process.cwd()) {
  const outDir = path.join(root, "out");
  fs.mkdirSync(outDir, { recursive: true });
  return outDir;
}

export function writeReplay({ fileBase, replay, root = process.cwd() }) {
  const outDir = ensureOutDir(root);
  const p = path.join(outDir, `${fileBase}.json`);
  fs.writeFileSync(p, JSON.stringify(replay, null, 2), "utf8");
  return p;
}
