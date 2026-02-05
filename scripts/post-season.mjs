import fs from "node:fs";

const API = "https://www.moltbook.com/api/v1/posts";
const key = process.env.MOLTBOOK_API_KEY; // moltbook_...
const seasonPath = process.argv[2];

if (!seasonPath) {
  console.error("Usage: node scripts/post-season.mjs out/season_0001.json");
  process.exit(1);
}

const replay = JSON.parse(fs.readFileSync(seasonPath, "utf8"));

function summarize(replay) {
  const top = replay.standings?.slice(0, 3) ?? [];
  const podium = top.map((x, i) => `${i + 1}) ${x.name} (${x.score ?? x.netWorth ?? "?"})`).join("\n");
  return `🦞 MOLTOPOLY — Season Results

Seed: ${replay.meta?.seed}
Podium:
${podium}

Highlights:
• turns: ${replay.turns?.length ?? 0}
• roster: ${replay.roster?.length ?? 0}

(Replay JSON attached locally: ${seasonPath})`;
}

const content = summarize(replay);

const dry = !key;
if (dry) {
  console.log("DRY RUN (no MOLTBOOK_API_KEY set)\n");
  console.log(content);
  process.exit(0);
}

const body = {
  submolt: "general",
  title: "Moltopoly: Season Results",
  content
};

const res = await fetch(API, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(body)
});

const json = await res.json();
if (!res.ok) {
  console.error("Post failed:", res.status, json);
  process.exit(1);
}
console.log("Posted:", json?.post?.id || json);
