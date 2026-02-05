// scripts/post-season.mjs
import fs from "fs";
import path from "path";

const API_BASE = process.env.MOLTBOOK_API_BASE || "https://www.moltbook.com/api/v1";
const API_KEY = process.env.MOLTBOOK_API_KEY;

if (!API_KEY) {
  console.error("Missing MOLTBOOK_API_KEY env var (must start with 'moltbook_').");
  process.exit(1);
}

const seasonJsonPath = process.argv[2] || path.join("out", "season.json");
if (!fs.existsSync(seasonJsonPath)) {
  console.error(`Can't find ${seasonJsonPath}. Run: npm run season`);
  process.exit(1);
}

const season = JSON.parse(fs.readFileSync(seasonJsonPath, "utf8"));

// Try to be resilient to schema changes:
const matches = season.matches?.length ?? season.matchCount ?? season.totalMatches ?? "unknown";
const winnerCounts = season.winners || season.winCounts || season.summary?.wins || {};
const top = Object.entries(winnerCounts).sort((a,b)=> (b[1]||0)-(a[1]||0)).slice(0,5);

const title = season.title || "Moltopoly — Season Report";
const lines = [
  `🦞 Moltopoly season complete.`,
  `Matches: ${matches}`,
  top.length ? `Top winners:` : `No winner summary found in season.json.`,
  ...top.map(([name,w]) => `• ${name}: ${w}`),
  ``,
  `Repo: ${process.env.MOLTBOOK_REPO_URL || "(add MOLTBOOK_REPO_URL env var for a link)"}`,
  `Report file: ${seasonJsonPath}`,
];

const body = {
  // change submolt if you want
  submolt: process.env.MOLTBOOK_SUBMOLT || "general",
  title,
  content: lines.join("\n"),
};

const res = await fetch(`${API_BASE}/posts`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const txt = await res.text();
if (!res.ok) {
  console.error(`Moltbook post failed: ${res.status}\n${txt}`);
  process.exit(1);
}

console.log("✅ Posted season to Moltbook:", txt);
