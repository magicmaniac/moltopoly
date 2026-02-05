// src/join.mjs
// Moltopoly Join System v1
// - Agents self-register by dropping JSON files into /agents
// - Strict validation (fail closed; skips invalid manifests)
// - Deterministic ordering (stable), optional seed shuffle handled by game

import fs from "node:fs";
import path from "node:path";

const ALLOWED_STYLES = new Set(["SAFE", "AGGRO", "BUILDER", "CHAOS"]);
const NAME_RE = /^[A-Z0-9_ -]{2,18}$/; // simple + readable in UI

function readJson(filePath) {
  const txt = fs.readFileSync(filePath, "utf8");
  return JSON.parse(txt);
}

function validateAgent(raw, filePath) {
  const errs = [];

  if (!raw || typeof raw !== "object") errs.push("manifest must be an object");

  const name = String(raw.name ?? "").trim();
  if (!NAME_RE.test(name)) errs.push(`invalid name "${name}" (2-18 chars, A-Z/0-9/_/-/space)`);

  const style = String(raw.style ?? "").trim().toUpperCase();
  if (!ALLOWED_STYLES.has(style)) errs.push(`style must be one of: ${[...ALLOWED_STYLES].join(", ")}`);

  let risk = raw.risk;
  if (risk === undefined || risk === null || risk === "") risk = null;
  if (risk !== null) {
    const r = Number(risk);
    if (!Number.isFinite(r) || r < 0.1 || r > 2.0) errs.push("risk must be a number in [0.1, 2.0]");
    risk = r;
  }

  const entry = String(raw.entry ?? "moltopoly.join.v1").trim();
  if (!entry.startsWith("moltopoly.join.")) errs.push('entry must start with "moltopoly.join."');

  // Optional fields (safe)
  const homepage = raw.homepage ? String(raw.homepage) : null;
  const contact = raw.contact ? String(raw.contact) : null;
  const bio = raw.bio ? String(raw.bio) : null;

  const ok = errs.length === 0;

  return {
    ok,
    errs,
    agent: ok
      ? {
          name,
          style,
          risk, // null = game decides
          homepage,
          contact,
          bio,
          sourceFile: path.basename(filePath),
        }
      : null,
  };
}

export function loadAgents(dir = "agents", opts = {}) {
  const { maxPlayers = 0, verbose = true } = opts;

  if (!fs.existsSync(dir)) {
    if (verbose) console.log(`(join) No agents dir found: ${dir}`);
    return [];
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .map((f) => path.join(dir, f))
    // deterministic order so seasons are reproducible
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));

  const agents = [];
  const seenNames = new Set();

  for (const fp of files) {
    let raw;
    try {
      raw = readJson(fp);
    } catch (e) {
      if (verbose) console.log(`(join) SKIP ${path.basename(fp)} — bad JSON: ${e.message}`);
      continue;
    }

    const { ok, errs, agent } = validateAgent(raw, fp);
    if (!ok) {
      if (verbose) console.log(`(join) SKIP ${path.basename(fp)} — ${errs.join("; ")}`);
      continue;
    }

    // prevent duplicates
    if (seenNames.has(agent.name)) {
      if (verbose) console.log(`(join) SKIP ${agent.sourceFile} — duplicate name "${agent.name}"`);
      continue;
    }
    seenNames.add(agent.name);

    agents.push(agent);
    if (maxPlayers > 0 && agents.length >= maxPlayers) break;
  }

  if (verbose) console.log(`(join) Loaded ${agents.length} agent(s) from ${dir}/`);
  return agents;
}

export function loadAgentsOrDefault(dir = "agents", defaults = [], opts = {}) {
  const agents = loadAgents(dir, opts);
  if (agents.length) return agents;

  if (opts?.verbose !== false) {
    console.log(`(join) No valid agent manifests found — using defaults (${defaults.length})`);
  }
  return defaults;
}
