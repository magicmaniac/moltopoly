// season.mjs
// Moltopoly v1.7 — Season Mode Aggregator + Visual Upgrades
// Adds:
// 1) Click drilldown heatmap (cell click -> details + top rent events + match files)
// 2) Rivalry cards with badges
// 3) Trend sparks (last 10 games: wins, bankrupts, rent received)
// 4) "Match of the Season" tiles (closest finish, longest game, most bailouts, most auctions, biggest rug)
//
// Usage:
//   node season.mjs
//   node season.mjs out
//   node season.mjs out --last 50
//   node season.mjs out --minVersion 0.7

import fs from "node:fs";
import path from "node:path";

function argFlag(name, defVal = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return defVal;
  const v = process.argv[i + 1];
  return v ?? defVal;
}
function toInt(x, defVal) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.floor(n) : defVal;
}
function toNumVersion(v) {
  if (v == null) return 0;
  const s = String(v).trim();
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  const m = s.match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}
function readJson(fp) {
  const txt = fs.readFileSync(fp, "utf8");
  return JSON.parse(txt);
}
function listMatchFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const items = fs.readdirSync(dir);
  return items
    .filter((f) => /^match_\d+\.json$/i.test(f))
    .map((f) => path.join(dir, f))
    .sort((a, b) => {
      const an = Number(path.basename(a).match(/match_(\d+)/)?.[1] ?? 0);
      const bn = Number(path.basename(b).match(/match_(\d+)/)?.[1] ?? 0);
      return an - bn;
    });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function fmtMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  const sign = x < 0 ? "-" : "";
  const v = Math.abs(x);
  return `${sign}$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function fmtPct(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "";
  return `${(n * 100).toFixed(1)}%`;
}
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function computeMatchStats(match, fileBase) {
  const log = Array.isArray(match.log) ? match.log : [];
  const auctions = log.filter((e) => e?.type === "auction").length;
  const bailouts = log.filter((e) => e?.type === "bailout").length;

  const rents = log.filter((e) => e?.type === "rent" && typeof e.amount === "number");
  let biggestRug = null;
  for (const r of rents) {
    if (!biggestRug || (r.amount ?? 0) > (biggestRug.amount ?? 0)) biggestRug = r;
  }

  const perkByPlayer = new Map(); // name -> { count, amount, byType }
  const rentByPlayer = new Map(); // name -> { paid, received, countPaid, countRecv }
  const rentPairs = new Map();    // "from->to" -> total $
  const rentEvents = [];          // list of rent events (for drilldown)

  function ensurePerk(name) {
    if (!perkByPlayer.has(name)) perkByPlayer.set(name, { count: 0, amount: 0, byType: {} });
    return perkByPlayer.get(name);
  }
  function ensureRent(name) {
    if (!rentByPlayer.has(name)) rentByPlayer.set(name, { paid: 0, received: 0, countPaid: 0, countRecv: 0 });
    return rentByPlayer.get(name);
  }

  for (const e of log) {
    if (!e || typeof e !== "object") continue;

    if (e.type === "perk") {
      const who = e.who;
      const perk = e.perk || "unknown";
      const amt = typeof e.amount === "number" ? e.amount : 0;
      if (!who) continue;

      const p = ensurePerk(who);
      p.count += 1;
      p.amount += amt;

      if (!p.byType[perk]) p.byType[perk] = { count: 0, amount: 0 };
      p.byType[perk].count += 1;
      p.byType[perk].amount += amt;
    }

    if (e.type === "rent") {
      const from = e.from;
      const to = e.to;
      const amt = typeof e.amount === "number" ? e.amount : 0;

      if (from) {
        const r = ensureRent(from);
        r.paid += amt;
        r.countPaid += 1;
      }
      if (to) {
        const r = ensureRent(to);
        r.received += amt;
        r.countRecv += 1;
      }

      if (from && to && amt > 0) {
        const key = `${from}->${to}`;
        rentPairs.set(key, (rentPairs.get(key) ?? 0) + amt);

        // keep event for drilldown
        rentEvents.push({
          from,
          to,
          amount: amt,
          t: e.t ?? null,
          square: e.square ?? null,
        });
      }
    }
  }

  const turns = Number(match.turns_played ?? 0);
  const winner = match.winner ?? null;

  const final = Array.isArray(match.final) ? match.final : [];
  const finalByName = new Map(final.map((x) => [x.name, x]));

  // Compute finish margin (net_worth based)
  let finish = null;
  const finalsNW = final
    .filter((x) => typeof x?.net_worth === "number")
    .map((x) => ({ name: x.name, net: x.net_worth }));
  finalsNW.sort((a, b) => b.net - a.net);
  if (finalsNW.length >= 2) {
    finish = {
      first: finalsNW[0],
      second: finalsNW[1],
      margin: finalsNW[0].net - finalsNW[1].net,
    };
  } else if (finalsNW.length === 1) {
    finish = { first: finalsNW[0], second: null, margin: null };
  }

  const players = (match.players || []).map((p) => ({
    name: p.name,
    style: p.style ?? null,
  }));

  return {
    file: fileBase,
    version: toNumVersion(match.version),
    created_at: match.created_at ?? null,
    turns,
    winner,
    auctions,
    bailouts,
    biggestRug: biggestRug
      ? { t: biggestRug.t ?? null, amount: biggestRug.amount ?? null, from: biggestRug.from ?? null, to: biggestRug.to ?? null, square: biggestRug.square ?? null }
      : null,
    finish,
    finalByName,
    players,
    perkByPlayer,
    rentByPlayer,
    rentPairs,
    rentEvents,
  };
}

function summarizePerks(byType) {
  const entries = Object.entries(byType || {});
  entries.sort((a, b) => (b[1].amount - a[1].amount) || (b[1].count - a[1].count));
  const top = entries.slice(0, 3).map(([k, v]) => `${k}:${v.count}(${fmtMoney(v.amount)})`);
  const restCount = entries.length - top.length;
  return top.join(" · ") + (restCount > 0 ? ` · +${restCount} more` : "");
}
function topBy(obj) {
  let bestK = null;
  let bestV = -Infinity;
  for (const [k, v] of Object.entries(obj)) {
    if (v > bestV) { bestV = v; bestK = k; }
  }
  return bestK ? { name: bestK, amount: bestV } : null;
}

function buildSeason(matches) {
  const playersSet = new Set();
  for (const m of matches) for (const p of m.players) playersSet.add(p.name);
  const players = [...playersSet].sort();

  // aggregate leader stats
  const agg = {};
  for (const name of players) {
    agg[name] = {
      name,
      games: 0,
      wins: 0,
      avgTurns: 0,
      avgAuctions: 0,
      avgBailouts: 0,
      avgNetWorth: 0,
      avgCash: 0,
      bankrupts: 0,
      styles: new Set(),

      perkCount: 0,
      perkAmount: 0,
      perkByType: {},

      rentPaid: 0,
      rentReceived: 0,
      rentCountPaid: 0,
      rentCountRecv: 0,

      // for trends
      recent: [], // per match snapshot
    };
  }

  let globalBigRug = null;

  const rentReceivedAll = {}; // name -> $
  const rentPaidAll = {};     // name -> $
  const rentPairAll = {};     // "from->to" -> $

  // drilldown details: pair -> list of big rent events (from logs)
  const rentPairEvents = {}; // "from->to" -> [{amount,t,square,file}...]

  // Match of the Season candidates
  let matchLongest = null;
  let matchMostBailouts = null;
  let matchMostAuctions = null;
  let matchClosest = null; // smallest margin

  for (const m of matches) {
    // biggest rug
    if (m.biggestRug && (!globalBigRug || (m.biggestRug.amount ?? 0) > (globalBigRug.amount ?? 0))) {
      globalBigRug = { ...m.biggestRug, file: m.file };
    }

    // season “match of season” tiles
    if (!matchLongest || (m.turns ?? 0) > (matchLongest.turns ?? 0)) {
      matchLongest = { file: m.file, turns: m.turns ?? 0, winner: m.winner ?? null };
    }
    if (!matchMostBailouts || (m.bailouts ?? 0) > (matchMostBailouts.bailouts ?? 0)) {
      matchMostBailouts = { file: m.file, bailouts: m.bailouts ?? 0, winner: m.winner ?? null };
    }
    if (!matchMostAuctions || (m.auctions ?? 0) > (matchMostAuctions.auctions ?? 0)) {
      matchMostAuctions = { file: m.file, auctions: m.auctions ?? 0, winner: m.winner ?? null };
    }
    if (m.finish && typeof m.finish.margin === "number") {
      if (!matchClosest || m.finish.margin < matchClosest.margin) {
        matchClosest = {
          file: m.file,
          margin: m.finish.margin,
          first: m.finish.first,
          second: m.finish.second,
        };
      }
    }

    const inMatch = new Set(m.players.map((p) => p.name));
    for (const p of m.players) agg[p.name].styles.add(p.style || "—");

    // per-player aggregates
    for (const name of inMatch) {
      const a = agg[name];
      if (!a) continue;

      a.games += 1;
      a.avgTurns += m.turns || 0;
      a.avgAuctions += m.auctions || 0;
      a.avgBailouts += m.bailouts || 0;

      const fin = m.finalByName.get(name);
      const alive = fin ? (fin.alive !== false) : true;
      const netWorth = fin && typeof fin.net_worth === "number" ? fin.net_worth : null;
      const cash = fin && typeof fin.cash === "number" ? fin.cash : null;

      if (fin) {
        if (fin.alive === false) a.bankrupts += 1;
        if (typeof fin.net_worth === "number") a.avgNetWorth += fin.net_worth;
        if (typeof fin.cash === "number") a.avgCash += fin.cash;
      }

      // perks
      const ps = m.perkByPlayer.get(name);
      if (ps) {
        a.perkCount += ps.count;
        a.perkAmount += ps.amount;
        for (const [perk, v] of Object.entries(ps.byType)) {
          if (!a.perkByType[perk]) a.perkByType[perk] = { count: 0, amount: 0 };
          a.perkByType[perk].count += v.count;
          a.perkByType[perk].amount += v.amount;
        }
      }

      // rent
      const rs = m.rentByPlayer.get(name);
      let rentPaid = 0, rentReceived = 0;
      if (rs) {
        a.rentPaid += rs.paid;
        a.rentReceived += rs.received;
        a.rentCountPaid += rs.countPaid;
        a.rentCountRecv += rs.countRecv;
        rentPaid = rs.paid ?? 0;
        rentReceived = rs.received ?? 0;
      }

      // trends snapshot per match (in chronological order)
      a.recent.push({
        file: m.file,
        win: m.winner === name ? 1 : 0,
        bankrupt: alive ? 0 : 1,
        rentReceived,
        rentPaid,
        netWorth,
        cash,
      });
    }

    // global rent totals
    for (const [name, rs] of m.rentByPlayer.entries()) {
      rentPaidAll[name] = (rentPaidAll[name] ?? 0) + (rs.paid ?? 0);
      rentReceivedAll[name] = (rentReceivedAll[name] ?? 0) + (rs.received ?? 0);
    }

    // pair totals + pair events
    for (const [k, amt] of (m.rentPairs?.entries?.() ?? [])) {
      rentPairAll[k] = (rentPairAll[k] ?? 0) + (amt ?? 0);
    }
    for (const ev of (m.rentEvents ?? [])) {
      const key = `${ev.from}->${ev.to}`;
      if (!rentPairEvents[key]) rentPairEvents[key] = [];
      rentPairEvents[key].push({
        amount: ev.amount,
        t: ev.t,
        square: ev.square,
        file: m.file,
      });
    }

    if (m.winner && agg[m.winner]) agg[m.winner].wins += 1;
  }

  const topBully = topBy(rentReceivedAll);
  const topVictim = topBy(rentPaidAll);

  let worstMatchup = null;
  for (const [k, v] of Object.entries(rentPairAll)) {
    if (!worstMatchup || v > worstMatchup.amount) {
      const [from, to] = k.split("->");
      worstMatchup = { from, to, amount: v };
    }
  }

  // Heatmap matrix (rows payers, cols receivers)
  const matrix = {};
  for (const from of players) {
    matrix[from] = {};
    for (const to of players) matrix[from][to] = 0;
  }

  let maxCell = 0;
  for (const [k, v] of Object.entries(rentPairAll)) {
    const [from, to] = k.split("->");
    if (!from || !to) continue;
    if (!matrix[from]) matrix[from] = {};
    matrix[from][to] = (matrix[from][to] ?? 0) + v;
    maxCell = Math.max(maxCell, matrix[from][to]);
  }

  const rowTotals = {};
  const colTotals = {};
  for (const from of players) {
    let sum = 0;
    for (const to of players) sum += matrix[from]?.[to] ?? 0;
    rowTotals[from] = sum;
  }
  for (const to of players) {
    let sum = 0;
    for (const from of players) sum += matrix[from]?.[to] ?? 0;
    colTotals[to] = sum;
  }

  const heatmap = { players, matrix, maxCell, rowTotals, colTotals };

  // Rivalry Engine (per player)
  const rivalries = {};
  for (const me of players) {
    let nemesis = null;        // max paidTo
    let favoriteVictim = null; // max receivedFrom
    let danger = null;         // min netVs
    let safe = null;           // max netVs

    for (const other of players) {
      if (other === me) continue;

      const paidTo = matrix?.[me]?.[other] ?? 0;
      const receivedFrom = matrix?.[other]?.[me] ?? 0;
      const netVs = receivedFrom - paidTo;

      if (!nemesis || paidTo > nemesis.paidTo) nemesis = { other, paidTo };
      if (!favoriteVictim || receivedFrom > favoriteVictim.receivedFrom) favoriteVictim = { other, receivedFrom };

      if (!danger || netVs < danger.netVs) danger = { other, netVs, paidTo, receivedFrom };
      if (!safe || netVs > safe.netVs) safe = { other, netVs, paidTo, receivedFrom };
    }

    rivalries[me] = {
      nemesis: nemesis ? { name: nemesis.other, paidTo: nemesis.paidTo } : null,
      favoriteVictim: favoriteVictim ? { name: favoriteVictim.other, receivedFrom: favoriteVictim.receivedFrom } : null,
      dangerZone: danger ? { name: danger.other, netVs: danger.netVs, paidTo: danger.paidTo, receivedFrom: danger.receivedFrom } : null,
      safeZone: safe ? { name: safe.other, netVs: safe.netVs, paidTo: safe.paidTo, receivedFrom: safe.receivedFrom } : null,
    };
  }

  // Trend sparks: last 10 for each player
  const trends = {};
  for (const name of players) {
    const rec = agg[name].recent;
    const last10 = rec.slice(Math.max(0, rec.length - 10));
    // normalize rentReceived spark within player last10
    const rrVals = last10.map(x => x.rentReceived ?? 0);
    const rrMax = Math.max(1, ...rrVals);
    trends[name] = {
      last10: last10.map((x) => ({
        file: x.file,
        win: x.win,
        bankrupt: x.bankrupt,
        rentReceived: x.rentReceived ?? 0,
        rentReceivedN: (x.rentReceived ?? 0) / rrMax,
      })),
    };
  }

  // Drilldown: keep top 10 rent events per pair by amount
  const pairDetails = {};
  for (const [pair, list] of Object.entries(rentPairEvents)) {
    const top = list
      .slice()
      .sort((a, b) => (b.amount - a.amount) || ((b.t ?? 0) - (a.t ?? 0)))
      .slice(0, 10);
    pairDetails[pair] = top;
  }

  // finalize leaderboard rows
  const rows = Object.values(agg).map((p) => {
    const g = p.games || 1;
    const winRate = p.games ? p.wins / p.games : 0;
    const rentNet = p.rentReceived - p.rentPaid;

    return {
      name: p.name,
      games: p.games,
      wins: p.wins,
      winRate,
      avgTurns: p.avgTurns / g,
      avgAuctions: p.avgAuctions / g,
      avgBailouts: p.avgBailouts / g,
      avgNetWorth: p.avgNetWorth / g,
      avgCash: p.avgCash / g,
      bankrupts: p.bankrupts,
      styles: [...p.styles].sort().join(", "),

      perkCount: p.perkCount,
      perkAmount: p.perkAmount,
      perkBreakdown: summarizePerks(p.perkByType),

      rentPaid: p.rentPaid,
      rentReceived: p.rentReceived,
      rentNet,
    };
  });

  rows.sort((a, b) =>
    (b.winRate - a.winRate) ||
    (b.wins - a.wins) ||
    (b.avgNetWorth - a.avgNetWorth) ||
    (b.rentNet - a.rentNet) ||
    (b.perkAmount - a.perkAmount)
  );

  const matchOfSeason = {
    closest: matchClosest,
    longest: matchLongest,
    mostBailouts: matchMostBailouts,
    mostAuctions: matchMostAuctions,
  };

  return {
    rows,
    globalBigRug,
    topBully,
    topVictim,
    worstMatchup,
    heatmap,
    rivalries,
    trends,
    pairDetails,
    matchOfSeason,
  };
}

function heatAlpha(value, max) {
  if (!max || max <= 0) return 0;
  const t = clamp01(value / max);
  return Math.pow(t, 0.65);
}

function seasonHtml(meta, globalBigRug, rows, topBully, topVictim, worstMatchup, heatmap, rivalries, trends, pairDetails, matchOfSeason) {
  const rug = globalBigRug;
  const players = heatmap?.players ?? [];
  const maxCell = heatmap?.maxCell ?? 0;

  // Leaderboard table
  const lbRows = rows.map((r, idx) => `
    <tr>
      <td class="muted">${idx + 1}</td>
      <td><span class="mono">${esc(r.name)}</span></td>
      <td class="right">${r.games}</td>
      <td class="right">${r.wins}</td>
      <td class="right">${fmtPct(r.winRate)}</td>

      <td class="right">${r.avgTurns.toFixed(1)}</td>
      <td class="right">${r.avgAuctions.toFixed(1)}</td>
      <td class="right">${r.avgBailouts.toFixed(1)}</td>

      <td class="right">${fmtMoney(r.avgNetWorth)}</td>
      <td class="right">${fmtMoney(r.avgCash)}</td>
      <td class="right">${r.bankrupts}</td>

      <td class="right">${r.perkCount}</td>
      <td class="right">${fmtMoney(r.perkAmount)}</td>
      <td class="right">${fmtMoney(r.rentReceived)}</td>
      <td class="right">${fmtMoney(r.rentPaid)}</td>
      <td class="right">${fmtMoney(r.rentNet)}</td>

      <td class="muted">${esc(r.perkBreakdown || "")}</td>
      <td class="muted">${esc(r.styles)}</td>
    </tr>
  `).join("");

  // Heatmap
  const headCols = players.map(p => `<th class="right mono">${esc(p)}</th>`).join("");
  const heatRows = players.map((from) => {
    const cells = players.map((to) => {
      const v = heatmap.matrix?.[from]?.[to] ?? 0;
      const a = heatAlpha(v, maxCell);
      const isSelf = from === to;
      const cls = isSelf ? "cell self" : "cell";
      const title = `${from} → ${to}: ${fmtMoney(v)}`;
      const txt = v > 0 ? fmtMoney(v) : "";
      const key = `${from}->${to}`;
      return `<td class="${cls} right mono heatcell"
                data-from="${esc(from)}"
                data-to="${esc(to)}"
                data-key="${esc(key)}"
                data-val="${v}"
                title="${esc(title)}"
                style="--a:${a.toFixed(3)}">${esc(txt)}</td>`;
    }).join("");

    const rowTotal = heatmap.rowTotals?.[from] ?? 0;
    return `
      <tr>
        <th class="mono">${esc(from)}</th>
        ${cells}
        <td class="right mono total">${fmtMoney(rowTotal)}</td>
      </tr>
    `;
  }).join("");

  const colTotals = players.map((to) => {
    const v = heatmap.colTotals?.[to] ?? 0;
    return `<td class="right mono total">${fmtMoney(v)}</td>`;
  }).join("");

  const grandTotal = players.reduce((s, p) => s + (heatmap.colTotals?.[p] ?? 0), 0);

  const heatmapTable = players.length
    ? `
    <div class="card scroll" style="margin-top:12px;">
      <div class="muted">Heatmap — Rent paid (rows) → Rent received (cols)</div>
      <div class="heatwrap">
        <div class="heattable">
          <table class="heat">
            <thead>
              <tr>
                <th></th>
                ${headCols}
                <th class="right mono">ROW Σ</th>
              </tr>
            </thead>
            <tbody>
              ${heatRows}
            </tbody>
            <tfoot>
              <tr>
                <th class="mono">COL Σ</th>
                ${colTotals}
                <td class="right mono total">${fmtMoney(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
          <div class="muted" style="margin-top:8px;font-size:12px;">
            Tip: click a cell to lock it and see drilldown. Click again to clear.
          </div>
        </div>

        <div class="heatpanel" id="heatpanel">
          <div class="muted">Drilldown</div>
          <div class="mono" id="heatpanelTitle" style="margin-top:8px;">Click a heatmap cell</div>
          <div class="muted" id="heatpanelSub" style="margin-top:8px;font-size:12px;"></div>
          <div id="heatpanelList" style="margin-top:10px;"></div>
        </div>
      </div>
    </div>
  `
    : "";

  // Rivalry cards w/ badges + Trends sparks
  const rivalryCards = players.length
    ? `
    <div class="card" style="margin-top:12px;">
      <div class="muted">Rivalry Engine + Trends (last 10)</div>
      <div class="rgrid">
        ${players.map((p) => {
          const r = rivalries?.[p];
          const t = trends?.[p]?.last10 ?? [];

          const nem = r?.nemesis;
          const fav = r?.favoriteVictim;
          const dz = r?.dangerZone;
          const sz = r?.safeZone;

          const badge = (cls, label) => `<span class="badge ${cls}">${esc(label)}</span>`;
          const line = (b, body) => `
            <div class="rline">
              <div class="rleft">${b}</div>
              <div class="rright mono">${body}</div>
            </div>
          `;

          const nemTxt = nem ? `${esc(nem.name)} · ${fmtMoney(nem.paidTo)} paid` : "—";
          const favTxt = fav ? `${esc(fav.name)} · ${fmtMoney(fav.receivedFrom)} received` : "—";
          const dzTxt = dz ? `${esc(dz.name)} · net ${fmtMoney(dz.netVs)}` : "—";
          const szTxt = sz ? `${esc(sz.name)} · net ${fmtMoney(sz.netVs)}` : "—";

          // Sparks: 10 tiny bars
          const winBars = t.map(x => `<span class="sparkbar ${x.win ? "on" : ""}" title="${esc(x.file)}"></span>`).join("");
          const bkBars = t.map(x => `<span class="sparkbar ${x.bankrupt ? "bad" : ""}" title="${esc(x.file)}"></span>`).join("");
          const rrBars = t.map(x => {
            const a = clamp01(x.rentReceivedN ?? 0);
            return `<span class="sparkbar rr" style="--h:${(4 + 14 * a).toFixed(1)}px" title="${esc(x.file)} · rent+ ${fmtMoney(x.rentReceived)}"></span>`;
          }).join("");

          return `
            <div class="rcard">
              <div class="rtitle mono">${esc(p)}</div>

              ${line(badge("nemesis", "Nemesis"), nemTxt)}
              ${line(badge("victim", "Favorite victim"), favTxt)}
              ${line(badge("danger", "Danger zone"), dzTxt)}
              ${line(badge("safe", "Safe zone"), szTxt)}

              <div class="sparks">
                <div class="sparkrow">
                  <div class="sparklabel muted">Wins</div>
                  <div class="spark">${winBars}</div>
                </div>
                <div class="sparkrow">
                  <div class="sparklabel muted">Bankrupts</div>
                  <div class="spark">${bkBars}</div>
                </div>
                <div class="sparkrow">
                  <div class="sparklabel muted">Rent+</div>
                  <div class="spark">${rrBars}</div>
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `
    : "";

  // Match of Season tiles
  const mos = matchOfSeason ?? {};
  const mosTile = (title, body) => `
    <div class="tile">
      <div class="muted">${esc(title)}</div>
      <div class="mono" style="margin-top:8px;">${body}</div>
    </div>
  `;

  const closestBody = mos.closest
    ? `${esc(mos.closest.first?.name ?? "—")} beat ${esc(mos.closest.second?.name ?? "—")} by ${fmtMoney(mos.closest.margin)}<br/><span class="muted">file: ${esc(mos.closest.file)}</span>`
    : "—";

  const longestBody = mos.longest
    ? `${esc(mos.longest.winner ?? "—")} won in ${esc(mos.longest.turns)} turns<br/><span class="muted">file: ${esc(mos.longest.file)}</span>`
    : "—";

  const bailoutsBody = mos.mostBailouts
    ? `${esc(mos.mostBailouts.bailouts)} bailouts<br/><span class="muted">winner: ${esc(mos.mostBailouts.winner ?? "—")} · file: ${esc(mos.mostBailouts.file)}</span>`
    : "—";

  const auctionsBody = mos.mostAuctions
    ? `${esc(mos.mostAuctions.auctions)} auctions<br/><span class="muted">winner: ${esc(mos.mostAuctions.winner ?? "—")} · file: ${esc(mos.mostAuctions.file)}</span>`
    : "—";

  const biggestRugBody = rug
    ? `${fmtMoney(rug.amount)} — ${esc(rug.from)} → ${esc(rug.to)}<br/>${esc(rug.square)} (t=${esc(rug.t)})<br/><span class="muted">file: ${esc(rug.file)}</span>`
    : "—";

  // Embed drilldown data
  const drillJson = JSON.stringify({ pairDetails }, null, 0);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Moltopoly Season</title>
  <style>
    :root{--bg:#0b0f14;--card:#121926;--muted:#8aa0b8;--text:#e8eef6;--line:#223046;}
    body{margin:0;background:linear-gradient(180deg,#070a0f,#0b0f14 30%);color:var(--text);
         font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;}
    header{padding:16px 18px;border-bottom:1px solid var(--line);position:sticky;top:0;background:rgba(11,15,20,.85);backdrop-filter: blur(8px);z-index:5;}
    h1{margin:0 0 6px 0;font-size:16px;letter-spacing:.4px;}
    .sub{color:var(--muted);font-size:12px;display:flex;gap:10px;flex-wrap:wrap;}
    .pill{padding:5px 8px;border-radius:999px;border:1px solid #2b3f63;background:#0f1624;color:#cfe0f5;font-size:12px;}
    .wrap{max-width:1700px;margin:0 auto;padding:16px 18px 36px;}
    .card{background:rgba(18,25,38,.9);border:1px solid var(--line);border-radius:14px;padding:14px;}
    .scroll{overflow:auto;}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-top:10px;}
    th,td{padding:8px 8px;border-bottom:1px solid rgba(34,48,70,.65);vertical-align:top;white-space:nowrap;}
    th{text-align:left;color:#cfe0f5;font-weight:600;}
    tr:last-child td{border-bottom:none;}
    .right{text-align:right;}
    .muted{color:var(--muted);}
    .mono{font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;}

    .kpi{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;}
    @media(max-width:980px){.kpi{grid-template-columns:1fr;}}

    /* Match of season tiles */
    .tiles{display:grid;grid-template-columns:repeat(5, minmax(220px, 1fr));gap:12px;margin-top:12px;}
    @media(max-width:1400px){.tiles{grid-template-columns:repeat(2, minmax(220px, 1fr));}}
    @media(max-width:700px){.tiles{grid-template-columns:1fr;}}
    .tile{border:1px solid rgba(34,48,70,.8);background:#0f1624;border-radius:14px;padding:12px;}

    /* Heatmap layout */
    .heatwrap{display:grid;grid-template-columns: 1.35fr 0.65fr;gap:12px;margin-top:10px;align-items:start;}
    @media(max-width:1100px){.heatwrap{grid-template-columns:1fr;}}
    .heatpanel{border:1px solid rgba(34,48,70,.8);background:#0f1624;border-radius:14px;padding:12px;min-height:220px;}
    .heatpanel .item{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px solid rgba(34,48,70,.35);}
    .heatpanel .item:first-child{border-top:none;}
    .heatpanel .small{font-size:11px;color:var(--muted);}

    /* Heatmap styling */
    table.heat th, table.heat td{border-bottom:1px solid rgba(34,48,70,.55);}
    table.heat thead th{position:sticky;top:0;background:rgba(18,25,38,.95);backdrop-filter: blur(6px);z-index:3;}
    table.heat tfoot th, table.heat tfoot td{border-top:1px solid rgba(34,48,70,.75);background:#0f1624;}
    td.cell{
      --a: 0;
      background: rgba(255, 75, 75, var(--a));
      border-left: 1px solid rgba(34,48,70,.35);
      cursor:pointer;
      transition: outline .12s ease, transform .06s ease;
    }
    td.cell:hover{outline:1px solid rgba(255,255,255,.25); transform: translateY(-1px);}
    td.cell.self{
      background: rgba(120, 170, 255, 0.10);
      color: rgba(232,238,246,.45);
      cursor:default;
    }
    td.cell.selected{outline:2px solid rgba(120,170,255,.65);}
    td.total{background:#0f1624;}

    /* Rivalry cards */
    .rgrid{display:grid;grid-template-columns:repeat(4, minmax(240px, 1fr));gap:12px;margin-top:12px;}
    @media(max-width:1300px){.rgrid{grid-template-columns:repeat(2, minmax(240px, 1fr));}}
    @media(max-width:750px){.rgrid{grid-template-columns:1fr;}}
    .rcard{border:1px solid rgba(34,48,70,.8);background:#0f1624;border-radius:14px;padding:12px;}
    .rtitle{font-size:13px;margin-bottom:8px;}
    .rline{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px solid rgba(34,48,70,.35);align-items:center;}
    .rline:first-of-type{border-top:none;}
    .badge{font-size:11px;border:1px solid rgba(255,255,255,.10);padding:2px 8px;border-radius:999px;}
    .badge.nemesis{background:rgba(255,75,75,.12);}
    .badge.victim{background:rgba(110,255,170,.10);}
    .badge.danger{background:rgba(255,180,80,.12);}
    .badge.safe{background:rgba(120,170,255,.12);}
    .rleft{display:flex;gap:8px;align-items:center;}

    /* Sparks */
    .sparks{margin-top:10px;border-top:1px solid rgba(34,48,70,.35);padding-top:10px;}
    .sparkrow{display:flex;gap:10px;align-items:center;margin-top:6px;}
    .sparklabel{width:72px;font-size:11px;}
    .spark{display:flex;gap:4px;align-items:flex-end;}
    .sparkbar{width:10px;height:10px;border-radius:3px;background:rgba(232,238,246,.12);border:1px solid rgba(255,255,255,.06);}
    .sparkbar.on{background:rgba(110,255,170,.22);}
    .sparkbar.bad{background:rgba(255,75,75,.22);}
    .sparkbar.rr{height: var(--h, 8px); background:rgba(120,170,255,.22);}
  </style>
</head>
<body>
<header>
  <h1>🦞 Moltopoly Season (v1.7)</h1>
  <div class="sub">
    <span class="pill">matches: ${meta.matches}</span>
    <span class="pill">generated: ${esc(meta.generated_at)}</span>
    <span class="pill">folder: ${esc(meta.folder)}</span>
  </div>
</header>

<div class="wrap">

  <div class="tiles">
    ${mosTile("Biggest rug", biggestRugBody)}
    ${mosTile("Closest finish", closestBody)}
    ${mosTile("Longest game", longestBody)}
    ${mosTile("Most bailouts", bailoutsBody)}
    ${mosTile("Most auctions", auctionsBody)}
  </div>

  <div class="kpi">
    <div class="card">
      <div class="muted">Bully / Victim</div>
      <div style="margin-top:8px" class="mono">
        <div><span class="muted">Top bully (rent received):</span><br/>
          ${topBully ? `${esc(topBully.name)} — ${fmtMoney(topBully.amount)}` : "—"}
        </div>
        <br/>
        <div><span class="muted">Top victim (rent paid):</span><br/>
          ${topVictim ? `${esc(topVictim.name)} — ${fmtMoney(topVictim.amount)}` : "—"}
        </div>
        <br/>
        <div><span class="muted">Worst matchup:</span><br/>
          ${worstMatchup ? `${esc(worstMatchup.from)} → ${esc(worstMatchup.to)} — ${fmtMoney(worstMatchup.amount)}` : "—"}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="muted">How to update</div>
      <div style="margin-top:8px" class="mono">
        Run: <b>node season.mjs</b><br/>
        It scans: <span class="muted">out/match_*.json</span><br/>
        Outputs: <span class="muted">season.json + season.html</span>
      </div>
    </div>
  </div>

  ${heatmapTable}
  ${rivalryCards}

  <div class="card scroll" style="margin-top:12px;">
    <div class="muted">Leaderboard</div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Player</th>
          <th class="right">Games</th>
          <th class="right">Wins</th>
          <th class="right">Win%</th>

          <th class="right">Avg Turns</th>
          <th class="right">Avg Auctions</th>
          <th class="right">Avg Bailouts</th>

          <th class="right">Avg Net</th>
          <th class="right">Avg Cash</th>
          <th class="right">Bankrupts</th>

          <th class="right">Perk#</th>
          <th class="right">Perk$</th>
          <th class="right">Rent+</th>
          <th class="right">Rent-</th>
          <th class="right">RentNet</th>

          <th>Perks (breakdown)</th>
          <th>Styles</th>
        </tr>
      </thead>
      <tbody>
        ${lbRows || `<tr><td class="muted" colspan="18">No matches found.</td></tr>`}
      </tbody>
    </table>
  </div>

</div>

<script>
  // embedded drilldown data
  window.SEASON_DRILL = ${drillJson};

  const panel = document.getElementById("heatpanel");
  const titleEl = document.getElementById("heatpanelTitle");
  const subEl = document.getElementById("heatpanelSub");
  const listEl = document.getElementById("heatpanelList");

  function clearPanel() {
    titleEl.textContent = "Click a heatmap cell";
    subEl.textContent = "";
    listEl.innerHTML = "";
  }

  function renderPanel(from, to, total) {
    const key = from + "->" + to;
    const items = (window.SEASON_DRILL?.pairDetails?.[key] || []).slice(0, 10);

    titleEl.textContent = from + " → " + to;
    subEl.textContent = "Total rent paid: " + total;

    if (!items.length) {
      listEl.innerHTML = '<div class="muted">No rent events logged for this pair.</div>';
      return;
    }

    listEl.innerHTML = items.map((x) => {
      const sq = x.square ? (" · " + x.square) : "";
      const t = (x.t != null) ? ("t=" + x.t) : "t=?";
      const file = x.file || "";
      return \`
        <div class="item">
          <div>
            <div class="mono">\${x.amount.toLocaleString()}$</div>
            <div class="small">\${t}\${sq}</div>
          </div>
          <div class="small mono">\${file}</div>
        </div>
      \`;
    }).join("");
  }

  let selected = null;

  document.querySelectorAll(".heatcell").forEach((td) => {
    td.addEventListener("click", () => {
      if (td.classList.contains("self")) return;

      // toggle off if same cell clicked
      if (selected === td) {
        td.classList.remove("selected");
        selected = null;
        clearPanel();
        return;
      }

      // clear previous selection
      if (selected) selected.classList.remove("selected");
      selected = td;
      td.classList.add("selected");

      const from = td.dataset.from;
      const to = td.dataset.to;
      const v = Number(td.dataset.val || 0);
      renderPanel(from, to, "$" + v.toLocaleString());
    });
  });

  clearPanel();
</script>

</body>
</html>`;
}

function main() {
  const OUT_DIR = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "out";
  const LAST_N = toInt(argFlag("--last", "0"), 0);
  const MIN_VERSION = argFlag("--minVersion", "0") || "0";

  const filesAll = listMatchFiles(OUT_DIR);
  if (!filesAll.length) {
    console.log(`No match files found in ${OUT_DIR}/ (expected match_*.json)`);
    process.exit(1);
  }

  const files = LAST_N > 0 ? filesAll.slice(Math.max(0, filesAll.length - LAST_N)) : filesAll;

  const minV = toNumVersion(MIN_VERSION);
  const matches = [];

  for (const fp of files) {
    try {
      const obj = readJson(fp);
      const v = toNumVersion(obj.version);
      if (v < minV) continue;
      matches.push(computeMatchStats(obj, path.basename(fp)));
    } catch (e) {
      console.log(`Skip (bad JSON): ${fp} (${e.message})`);
    }
  }

  /* 👇 ADD THIS RIGHT HERE */

  if (!matches.length) {
    console.log("No usable match files found.");
    process.exit(1);
  }

  const anyPlayers = matches.some(m => (m.players?.length ?? 0) > 0);
  const anyTurns = matches.some(m => (m.turns ?? 0) > 0);

  if (!anyPlayers) {
    console.log("Matches loaded, but no players found in match files.");
    process.exit(1);
  }

  if (!anyTurns) {
    console.log("Matches loaded, but no turns were played.");
    process.exit(1);
  }


  
  const {
    rows, globalBigRug, topBully, topVictim, worstMatchup,
    heatmap, rivalries, trends, pairDetails, matchOfSeason
  } = buildSeason(matches);

  const meta = {
    generated_at: new Date().toISOString(),
    matches: matches.length,
    minVersion: minV,
    folder: OUT_DIR,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const season = {
    meta,
    globalBigRug,
    topBully,
    topVictim,
    worstMatchup,
    heatmap,
    rivalries,
    trends,
    pairDetails,
    matchOfSeason,
    leaderboard: rows,
  };

  const seasonJsonPath = path.join(OUT_DIR, "season.json");
  fs.writeFileSync(seasonJsonPath, JSON.stringify(season, null, 2));

  const seasonHtmlPath = path.join(OUT_DIR, "season.html");
  fs.writeFileSync(
    seasonHtmlPath,
    seasonHtml(meta, globalBigRug, rows, topBully, topVictim, worstMatchup, heatmap, rivalries, trends, pairDetails, matchOfSeason),
    "utf8"
  );

  console.log(`✅ Wrote ${seasonJsonPath}`);
  console.log(`✅ Wrote ${seasonHtmlPath}`);
  console.log(`Open: ${seasonHtmlPath}`);
}

main();

