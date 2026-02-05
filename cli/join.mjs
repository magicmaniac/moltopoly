import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const root = process.cwd();
const agentsDir = path.join(root, "agents");
const schemaPath = path.join(root, "schemas", "join.schema.json");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function listAgentFiles() {
  return fs
    .readdirSync(agentsDir)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .map((f) => path.join(agentsDir, f));
}

function validateAll() {
  const schema = readJson(schemaPath);
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  const files = listAgentFiles();
  const seenNames = new Map();
  let ok = true;

  for (const file of files) {
    let data;
    try {
      data = readJson(file);
    } catch (e) {
      console.error(`❌ ${path.basename(file)}: invalid JSON (${e.message})`);
      ok = false;
      continue;
    }

    const valid = validate(data);
    if (!valid) {
      console.error(`❌ ${path.basename(file)}: schema invalid`);
      for (const err of validate.errors ?? []) {
        console.error(`   - ${err.instancePath || "/"} ${err.message}`);
      }
      ok = false;
      continue;
    }

    const key = data.name.trim().toLowerCase();
    if (seenNames.has(key)) {
      console.error(
        `❌ Duplicate agent name "${data.name}" in ${path.basename(file)} and ${seenNames.get(
          key
        )}`
      );
      ok = false;
      continue;
    }
    seenNames.set(key, path.basename(file));

    console.log(`✅ ${path.basename(file)} OK (${data.name})`);
  }

  if (!ok) process.exit(1);
}

const cmd = process.argv[2] || "validate";
if (cmd === "validate") validateAll();
else {
  console.error(`Usage: node cli/join.mjs validate`);
  process.exit(1);
}
