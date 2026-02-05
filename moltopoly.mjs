// moltopoly.mjs
// Moltopoly v0.8 + Join System v1
// Run:
//   node moltopoly.mjs
//   node moltopoly.mjs --agents agents --maxPlayers 6
//
// Requires:
//   ./src/join.mjs  (from the "build the join system" step)

import fs from "node:fs";
import path from "node:path";
import { loadAgentsOrDefault } from "./src/join.mjs";

/* ===================== UTIL ===================== */
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function getArgValue(flag, defVal = null) {
  const args = process.argv.slice(2);
  const i = args.indexOf(flag);
  if (i === -1) return defVal;
  const v = args[i + 1];
  if (v === undefined || v === null) return defVal;
  if (String(v).startsWith("--")) return defVal;
  return v;
}

function getArgInt(flag, defVal = 0) {
  const v = getArgValue(flag, null);
  const n = Number(v);
  return Number.isFinite(n) ? n : defVal;
}

/* ================= CONFIG ================= */
const CONFIG = {
  seedMoney: 1650,
  goMoney: 225,
  maxTurns: 260,

  jailTurns: 2,

  bailoutOnce: true,
  bailoutCash: 300,

  // Logging to terminal
  logMode: "events", // "events" | "all" | "none"
  snapshotEvery: 10,

  // Anti-snowball upkeep
  upkeepRate: 0.03,
  upkeepMinPerSquare: 2,
  whalePropertyCap: 10,
  whaleExtraFee: 50,
};

/* ================ BOARD ================== */
const BOARD = [
  { type: "GO", name: "GO" },
  { type: "PROP", name: "Mediterranean", price: 60, rent: 4, color: "BROWN" },
  { type: "CARD", name: "MOLT CHEST" },
  { type: "PROP", name: "Baltic", price: 60, rent: 8, color: "BROWN" },
  { type: "TAX", name: "Tax", amount: 110 },

  { type: "RAIL", name: "Reading Rail", price: 200, rent: 25 },
  { type: "PROP", name: "Oriental", price: 100, rent: 10, color: "LIGHTBLUE" },
  { type: "CHANCE", name: "CHANCE" },
  { type: "PROP", name: "Vermont", price: 100, rent: 12, color: "LIGHTBLUE" },
  { type: "PROP", name: "Connecticut", price: 120, rent: 14, color: "LIGHTBLUE" },

  { type: "JAIL", name: "JAIL" },
  { type: "PROP", name: "St Charles", price: 140, rent: 16, color: "PINK" },
  { type: "UTIL", name: "Electric", price: 150, rent: 22 },
  { type: "PROP", name: "States", price: 140, rent: 16, color: "PINK" },
  { type: "PROP", name: "Virginia", price: 160, rent: 18, color: "PINK" },

  { type: "RAIL", name: "Penn Rail", price: 200, rent: 25 },
  { type: "PROP", name: "St James", price: 180, rent: 20, color: "ORANGE" },
  { type: "CARD", name: "MOLT CHEST" },
  { type: "PROP", name: "Tennessee", price: 180, rent: 20, color: "ORANGE" },
  { type: "PROP", name: "New York", price: 200, rent: 22, color: "ORANGE" },

  { type: "FREE", name: "FREE" },
  { type: "PROP", name: "Kentucky", price: 220, rent: 24, color: "RED" },
  { type: "CHANCE", name: "CHANCE" },
  { type: "PROP", name: "Indiana", price: 220, rent: 24, color: "RED" },
  { type: "PROP", name: "Illinois", price: 240, rent: 26, color: "RED" },

  { type: "GOTOJAIL", name: "GO TO JAIL" },
  { type: "PROP", name: "Atlantic", price: 260, rent: 28, color: "YELLOW" },
  { type: "UTIL", name: "Water", price: 150, rent: 22 },
  { type: "PROP", name: "Ventnor", price: 260, rent: 28, color: "YELLOW" },
  { type: "PROP", name: "Marvin", price: 280, rent: 30, color: "YELLOW" },

  { type: "RAIL", name: "B&O Rail", price: 200, rent: 25 },
  { type: "PROP", name: "Pacific", price: 300, rent: 32, color: "GREEN" },
  { type: "CHANCE", name: "CHANCE" },
  { type: "PROP", name: "NC Ave", price: 300, rent: 32, color: "GREEN" },
  { type: "PROP", name: "Penn Ave", price: 320, rent: 34, color: "GREEN" },

  { type: "TAX", name: "Luxury Tax", amount: 130 },
  { type: "PROP", name: "Park Place", price: 350, rent: 42, color: "BLUE" },
  { type: "CARD", name: "MOLT CHEST" },
  { type: "PROP", name: "Boardwalk", price: 400, rent: 52, color: "BLUE" },
];

/* ================ CARDS ================== */
const CHANCE = [
  { name: "Pump +170", delta: +170 },
  { name: "Rug -150", delta: -150 },
  { name: "Warp +5", warp: 5 },
  { name: "Jail", jail: true },
];

const CHEST = [
  { name: "Airdrop +130", delta: +130 },
  { name: "Gas -80", delta: -80 },
  { name: "Bonus +95", delta: +95 },
  { name: "Bad Trade -120", delta: -120 },
];

/* ================= JOIN SYSTEM ================= */
const DEFAULTS = [
  { name: "CLAWBER", style: "AGGRO" },
  { name: "CLAWSUM", style: "SAFE" },
  { name: "MOLT-X", style: "CHAOS" },
  { name: "SHELLSHOCK", style: "BUILDER" },
];

const AGENTS_DIR = getArgValue("--agents", "agents") || "agents";
const MAX_PLAYERS = getArgInt("--maxPlayers", 0);

let players = loadAgentsOrDefault(AGENTS_DIR, DEFAULTS, {
  maxPlayers: MAX_PLAYERS,
  verbose: true,
});

players = shuffle(players).map((a) => ({
  name: a.name,
  style: String(a.style).toUpperCase(),
  risk: a.risk ?? (0.92 + Math.random() * 0.26),

  cash: CONFIG.seedMoney,
  pos: 0,
  jail: 0,
  alive: true,
  usedBailout: false,
}));

/* ================= GAME STATE ================= */
const owned = new Map(); // index -> ownerName
let GAME = { turn: 0 };

// Match log (for replay/season tools)
const MATCH_LOG = [];
function event(type, data = {}) {
  MATCH_LOG.push({ t: GAME.turn, type, ...data });
}

/* ================= TERMINAL LOGGING ================= */
function logAll(msg = "") {
  if (CONFIG.logMode === "all") console.log(msg);
}
function logEvent(msg = "") {
  if (CONFIG.logMode === "events" || CONFIG.logMode === "all") console.log(msg);
}

/* ================= HELPERS ================= */
function alivePlayers() {
  return players.filter((p) => p.alive);
}
function getPlayer(name) {
  return players.find((p) => p.name === name);
}
function isOwnable(sq) {
  return sq.type === "PROP" || sq.type === "RAIL" || sq.type === "UTIL";
}
function countOwned(ownerName) {
  let c = 0;
  for (const [, o] of owned.entries()) if (o === ownerName) c++;
  return c;
}
function countOwnedType(ownerName, type) {
  let c = 0;
  for (const [i, o] of owned.entries()) if (o === ownerName && BOARD[i]?.type === type) c++;
  return c;
}
function countOwnedColor(ownerName, color) {
  let c = 0;
  for (const [i, o] of owned.entries()) if (o === ownerName && BOARD[i]?.color === color) c++;
  return c;
}
function totalColor(color) {
  return BOARD.filter((s) => s.color === color).length;
}
function netWorth(p) {
  let v = p.cash;
  for (const [i, o] of owned.entries()) {
    if (o === p.name) v += BOARD[i]?.price || 0;
  }
  return v;
}

/* ================= MOVEMENT ================= */
function move(p, steps) {
  let pos = p.pos + steps;

  while (pos >= BOARD.length) {
    pos -= BOARD.length;
    p.cash += CONFIG.goMoney;
    logAll(`  ↪ ${p.name} passed GO (+$${CONFIG.goMoney})`);
    event("pass_go", { who: p.name, amount: CONFIG.goMoney });
  }

  const from = p.pos;
  p.pos = pos;

  logAll(`  🎲 ${p.name} (${from}→${p.pos}) -> ${BOARD[pos].name}`);
  event("move", { who: p.name, from, to: p.pos, square: BOARD[p.pos].name, steps });
}

function sendToJail(p) {
  const jailIndex = BOARD.findIndex((s) => s.type === "JAIL");
  p.pos = jailIndex >= 0 ? jailIndex : 10;
  p.jail = CONFIG.jailTurns;
  logEvent(`  🚓 ${p.name} goes to JAIL (${CONFIG.jailTurns})`);
  event("jail", { who: p.name, turns: CONFIG.jailTurns });
}

/* ================= ECONOMY ================= */
function rentFor(square, ownerName) {
  const t = clamp(GAME.turn / CONFIG.maxTurns, 0, 1);
  const ramp = 0.9 + t * 0.9;

  if (square.type === "RAIL") {
    const rails = countOwnedType(ownerName, "RAIL");
    return Math.floor((25 * clamp(rails, 1, 4)) * ramp);
  }
  if (square.type === "UTIL") {
    return Math.floor(24 * ramp);
  }
  if (square.type === "PROP") {
    return Math.floor((square.rent || 0) * ramp);
  }
  return 0;
}

function reserveFor(p) {
  const base =
    p.style === "SAFE" ? 480 :
    p.style === "AGGRO" ? 360 :
    p.style === "BUILDER" ? 360 :
    220;

  const t = clamp(GAME.turn / CONFIG.maxTurns, 0, 1);
  const late = 1.0 + t * 0.25;
  return Math.floor(base * p.risk * late);
}

function wantsToBuy(p, sq) {
  if (p.cash < (sq.price || 0)) return false;
  const left = p.cash - (sq.price || 0);
  const reserve = reserveFor(p);

  if (p.style === "AGGRO") return left >= reserve;

  if (p.style === "SAFE") {
    const t = GAME.turn / CONFIG.maxTurns;
    const adj = t > 0.45 ? Math.floor(reserve * 0.8) : reserve;
    return left >= adj;
  }

  if (p.style === "BUILDER") {
    if (sq.color) {
      const have = countOwnedColor(p.name, sq.color);
      const tot = totalColor(sq.color);
      if (have + 1 === tot) return left >= Math.floor(reserve * 0.65);
      if (have >= 1) return left >= Math.floor(reserve * 0.9);
    }
    return left >= reserve;
  }

  if (p.style === "CHAOS") {
    const coin = Math.random() < 0.78;
    return coin && left >= Math.floor(reserve * 0.65);
  }

  return left >= reserve;
}

/* ================= AUCTIONS ================= */
function maxAuctionBid(p, sq) {
  const t = clamp(GAME.turn / CONFIG.maxTurns, 0, 1);
  const reserve = reserveFor(p);

  let synergy = 1.0;
  if (p.style === "BUILDER" && sq.color) {
    const have = countOwnedColor(p.name, sq.color);
    if (have >= 1) synergy += 0.25;
    if (have + 1 === totalColor(sq.color)) synergy += 0.4;
  }

  const style =
    p.style === "SAFE" ? 0.85 :
    p.style === "AGGRO" ? 0.95 :
    p.style === "CHAOS" ? 0.95 :
    1.0;

  const spendable = p.cash - reserve;
  if (spendable <= 0) return 0;

  const lateBoost = 1.0 + t * 0.35;
  const cap = Math.floor((sq.price || 0) * 1.12 * lateBoost * synergy * style);
  return Math.floor(clamp(spendable, 0, cap));
}

function runAuction(sqIndex) {
  const sq = BOARD[sqIndex];
  if (!sq || !isOwnable(sq)) return;
  if (owned.get(sqIndex)) return;

  const bidders = alivePlayers();
  if (bidders.length <= 1) return;

  const bids = [];
  for (const p of bidders) {
    const maxBid = maxAuctionBid(p, sq);
    if (maxBid <= 0) continue;

    let bid;
    if (p.style === "SAFE") bid = Math.floor(maxBid * (0.62 + Math.random() * 0.22));
    else if (p.style === "AGGRO") bid = Math.floor(maxBid * (0.7 + Math.random() * 0.2));
    else if (p.style === "BUILDER") bid = Math.floor(maxBid * (0.72 + Math.random() * 0.28));
    else bid = Math.floor(maxBid * (0.55 + Math.random() * 0.45));

    bid = Math.max(1, bid);
    bids.push({ name: p.name, bid });
  }

  if (bids.length === 0) return;

  bids.sort((a, b) => b.bid - a.bid);
  const top = bids[0];
  const winner = getPlayer(top.name);
  if (!winner?.alive) return;
  if (winner.cash < top.bid) return;

  winner.cash -= top.bid;
  owned.set(sqIndex, winner.name);

  logEvent(`  🔥 AUCTION: ${sq.name} -> ${winner.name} for $${top.bid}`);
  event("auction", { square: sq.name, index: sqIndex, winner: winner.name, bid: top.bid, bids });
}

/* ================= BANKRUPT / BAILOUT ================= */
function bankruptTransferAll(fromName, toNameOrNull) {
  // Emit explicit transfer events so replay stays correct.
  for (const [i, o] of owned.entries()) {
    if (o !== fromName) continue;
    const sq = BOARD[i];

    if (toNameOrNull) {
      owned.set(i, toNameOrNull);
      event("transfer", {
        index: i,
        square: sq?.name ?? `#${i}`,
        type: sq?.type ?? "?",
        price: sq?.price ?? null,
        from: fromName,
        to: toNameOrNull,
        reason: "bankruptcy",
      });
    } else {
      owned.delete(i);
      event("transfer", {
        index: i,
        square: sq?.name ?? `#${i}`,
        type: sq?.type ?? "?",
        price: sq?.price ?? null,
        from: fromName,
        to: "BANK",
        reason: "bankruptcy",
      });
    }
  }
}

function settle(p, amount, toName) {
  // subtract amount; if negative -> bailout once else bankrupt
  p.cash -= amount;
  if (p.cash >= 0) return;

  if (CONFIG.bailoutOnce && !p.usedBailout) {
    p.usedBailout = true;
    p.cash = CONFIG.bailoutCash;
    logEvent(`  🛟 ${p.name} gets ONE BAILOUT (cash=$${p.cash})`);
    event("bailout", { who: p.name, cash: p.cash });
    return;
  }

  p.alive = false;
  logEvent(`  💀 ${p.name} BANKRUPT${toName ? ` (to ${toName})` : ""}`);
  event("bankrupt", { who: p.name, to: toName ?? "BANK" });

  // For now, bankruptcy returns assets to BANK (or to creditor if you pass toName)
  const creditor = toName && getPlayer(toName)?.alive ? toName : null;
  bankruptTransferAll(p.name, creditor);
}

/* ================= UPKEEP ================= */
function applyUpkeep() {
  for (const p of alivePlayers()) {
    let fee = 0;
    let props = 0;

    for (const [i, o] of owned.entries()) {
      if (o !== p.name) continue;
      const sq = BOARD[i];
      props++;
      const price = sq?.price || 0;
      const u = Math.max(CONFIG.upkeepMinPerSquare, Math.floor(price * CONFIG.upkeepRate));
      fee += u;
    }

    if (props > CONFIG.whalePropertyCap) fee += CONFIG.whaleExtraFee;

    if (fee > 0) {
      logEvent(`  🧰 UPKEEP: ${p.name} pays $${fee} (owned=${props})`);
      event("upkeep", { who: p.name, amount: fee, owned: props });
      settle(p, fee, null);
    }
  }
}

/* ================= RESOLVE SQUARE ================= */
function resolveSquare(p) {
  const sq = BOARD[p.pos];

  if (sq.type === "GOTOJAIL") {
    event("gotojail", { who: p.name });
    return sendToJail(p);
  }

  if (sq.type === "TAX") {
    logEvent(`  🧾 ${p.name} pays tax $${sq.amount}`);
    event("tax", { who: p.name, amount: sq.amount, square: sq.name });
    return settle(p, sq.amount, null);
  }

  if (sq.type === "CHANCE") {
    const c = pick(CHANCE);
    logEvent(`  🎴 ${p.name} draws CHANCE: ${c.name}`);
    event("chance", { who: p.name, card: c.name });

    if (typeof c.delta === "number") p.cash += c.delta;
    if (typeof c.warp === "number") move(p, c.warp);
    if (c.jail) sendToJail(p);
    return;
  }

  if (sq.type === "CARD") {
    const c = pick(CHEST);
    logEvent(`  📦 ${p.name} opens CHEST: ${c.name}`);
    event("chest", { who: p.name, card: c.name });
    if (typeof c.delta === "number") p.cash += c.delta;
    return;
  }

  if (isOwnable(sq)) {
    const owner = owned.get(p.pos);

    if (!owner) {
      if (wantsToBuy(p, sq)) {
        p.cash -= sq.price;
        owned.set(p.pos, p.name);
        logEvent(`  🏷️ ${p.name} BUYS ${sq.name} (-$${sq.price})`);
        event("buy", { who: p.name, square: sq.name, index: p.pos, price: sq.price });
      } else {
        logEvent(`  🤝 ${p.name} SKIPS ${sq.name} -> AUCTION`);
        event("skip", { who: p.name, square: sq.name, index: p.pos });
        runAuction(p.pos);
      }
      return;
    }

    if (owner === p.name) {
      logAll(`  🧠 ${p.name} lands on own ${sq.name}`);
      event("land_own", { who: p.name, square: sq.name, index: p.pos });
      return;
    }

    const r = rentFor(sq, owner);
    logEvent(`  💸 ${p.name} pays ${owner} $${r} for ${sq.name}`);
    event("rent", { from: p.name, to: owner, amount: r, square: sq.name, index: p.pos });

    const o = getPlayer(owner);
    if (o?.alive) o.cash += r;

    return settle(p, r, owner);
  }

  event("land", { who: p.name, square: sq.name, index: p.pos });
}

/* ================= TURN LOOP ================= */
function takeTurn(p) {
  if (!p.alive) return;

  if (p.jail > 0) {
    p.jail--;
    logEvent(`  🔒 ${p.name} is in jail (${p.jail} left)`);
    event("jail_wait", { who: p.name, left: p.jail });
    return;
  }

  const roll = randInt(2, 12);
  move(p, roll);
  resolveSquare(p);

  if (p.alive && p.cash < 0) settle(p, 0, null);
}

/* ================= SAVE MATCH ================= */
function saveMatchLog(winnerName) {
  fs.mkdirSync("./moltopoly_out", { recursive: true });
  const fname = `./moltopoly_out/match_${Date.now()}.json`;

  const ownership = [];
  for (let i = 0; i < BOARD.length; i++) {
    const sq = BOARD[i];
    if (!isOwnable(sq)) continue;
    ownership.push({
      index: i,
      square: sq.name,
      type: sq.type,
      price: sq.price,
      owner: owned.get(i) ?? null,
    });
  }

  const payload = {
    version: "0.8",
    created_at: new Date().toISOString(),
    config: CONFIG,
    players: players.map((p) => ({ name: p.name, style: p.style, risk: p.risk })),
    turns_played: GAME.turn,
    winner: winnerName,
    final: players.map((p) => ({
      name: p.name,
      alive: p.alive,
      cash: p.cash,
      net_worth: netWorth(p),
      owned: countOwned(p.name),
      used_bailout: p.usedBailout,
    })),
    ownership,
    log: MATCH_LOG,
  };

  fs.writeFileSync(fname, JSON.stringify(payload, null, 2));
  console.log(`\n🗂️ Saved match log: ${fname}`);
}

/* ================= RUN GAME ================= */
function run() {
  GAME = { turn: 0 };

  console.log(`\n🦞 MOLTOPOLY v0.8 — Join Enabled\n`);
  console.log(`Agents dir: ${AGENTS_DIR}${MAX_PLAYERS ? ` | maxPlayers=${MAX_PLAYERS}` : ""}`);
  console.log(`Order: ${players.map((p) => p.name).join(" → ")}`);
  console.log(`Start: $${CONFIG.seedMoney} | GO: $${CONFIG.goMoney} | Turns: ${CONFIG.maxTurns}\n`);

  event("start", {
    order: players.map((p) => p.name),
    seedMoney: CONFIG.seedMoney,
    goMoney: CONFIG.goMoney,
    maxTurns: CONFIG.maxTurns,
  });

  while (alivePlayers().length > 1 && GAME.turn < CONFIG.maxTurns) {
    GAME.turn++;

    for (const p of players) {
      if (alivePlayers().length <= 1) break;
      if (!p.alive) continue;
      takeTurn(p);
    }

    applyUpkeep();

    if (CONFIG.snapshotEvery > 0 && GAME.turn % CONFIG.snapshotEvery === 0) {
      const snap = alivePlayers().map((p) => `${p.name}:$${p.cash}`).join(" | ");
      console.log(`📊 Turn ${GAME.turn}: ${snap}`);
      event("snapshot", {
        turn: GAME.turn,
        alive: alivePlayers().map((p) => ({ name: p.name, cash: p.cash })),
      });
    }
  }

  const w = alivePlayers()[0];
  const winnerName = w ? w.name : null;

  console.log(`\n================`);
  if (winnerName) console.log(`🏆 WINNER: ${winnerName} | cash=$${w.cash} | net=$${netWorth(w)}`);
  else console.log(`🤝 DRAW (turn limit)`);

  event("end", { winner: winnerName });
  saveMatchLog(winnerName);
}

run();
