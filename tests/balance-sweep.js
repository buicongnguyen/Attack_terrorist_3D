// Balance sweep (5.1 G1): which cells a sweep plays and the rates it reports. A cell is one
// mission, player and mode, keyed like a golden row ('9/idle/normal') and played for several
// seeds. tests/balance-browser.mjs plays the cells; nothing here touches the disk or a browser.

import { MISSIONS, missionNumber } from "../src/data.js";
import { rowKey } from "./golden-diff.js";

export const SWEEP_MODES = ["easy", "normal", "hard"];
export const SWEEP_PLAYERS = ["pilot", "naive", "idle"];
const MODE_ORDER = ["easy", "normal", "hard", "crazy"];

// 'pilot' stands for each mission's own scripted pilot; any other name is a player in `plays`
// ({ name: [missions it plays] }). A player is swept only on the missions it plays. A filter that
// leaves no cell throws: an empty sweep would report itself complete and replace the last one.
export function sweepCells({ missions, modes = SWEEP_MODES, players = SWEEP_PLAYERS }, plays, pilots) {
  const names = players.flatMap((p) => (p === "pilot" ? pilots : [p]));
  for (const name of names) if (!plays[name]) throw new Error(`Unknown player ${name}; use pilot, ${Object.keys(plays).join(", ")}`);
  for (const mode of modes) if (!MODE_ORDER.includes(mode)) throw new Error(`Unknown mode ${mode}`);
  const cells = new Map();
  for (const mode of modes)
    for (const index of [...missions].sort((a, b) => a - b))
      for (const player of names) if (plays[player].includes(index)) cells.set(rowKey(index, player, mode), { key: rowKey(index, player, mode), index, player, mode });
  if (!cells.size) throw new Error(`No cell to sweep: no player in ${players.join(",") || "(none)"} plays missions ${[...missions].join(",") || "(none)"} on ${modes.join(",") || "no mode"}`);
  return [...cells.values()];
}

export function missionLabel(index) {
  return `${MISSIONS[index].chapter + 1}.${missionNumber(index)}`;
}

// How a run ended: 'success', 'playing' (still going at its step cap) or the reason it failed.
export const outcome = (run) => (run.status === "failed" ? run.reason || "failed" : run.status);

const mean = (runs, pick) => Math.round((runs.reduce((sum, run) => sum + pick(run), 0) / runs.length) * 100) / 100;

// A cell's rates over its runs (each a golden row with its attempt n). A loss counts 0 stars.
export function summarize(cell, runs) {
  const outcomes = {};
  for (const run of runs) outcomes[outcome(run)] = (outcomes[outcome(run)] || 0) + 1;
  const wins = outcomes.success || 0;
  return {
    key: cell.key,
    mission: missionLabel(cell.index),
    player: cell.player,
    mode: cell.mode,
    seeds: runs.length,
    wins,
    winRate: Math.round((wins / runs.length) * 1000) / 1000,
    meanStars: mean(runs, (run) => run.stars),
    meanEndTime: mean(runs, (run) => run.endTime),
    outcomes,
    runs,
  };
}

// '5/8 (63%) · ★0.75 · 61.2 s · hull 3': wins, mean stars, mean end time, then how the rest ended.
export function cellText(s) {
  const rest = Object.entries(s.outcomes)
    .filter(([name]) => name !== "success")
    .map(([name, n]) => `${name} ${n}`);
  return [`${s.wins}/${s.seeds} (${Math.round(s.winRate * 100)}%)`, `★${s.meanStars.toFixed(2)}`, `${s.meanEndTime.toFixed(1)} s`, ...rest].join(" · ");
}

// A Markdown table: one line per mission and player (the pilot, then the naive clicker, then the
// do-nothing player), one column per mode swept.
export function balanceTable(summaries) {
  const modes = MODE_ORDER.filter((m) => summaries.some((s) => s.mode === m));
  const rank = (player) => ["naive", "idle"].indexOf(player);
  const parts = (s) => s.key.split("/");
  const sorted = [...summaries].sort((a, b) => Number(parts(a)[0]) - Number(parts(b)[0]) || rank(parts(a)[1]) - rank(parts(b)[1]));
  const lines = new Map();
  for (const s of sorted) {
    const [index, player] = parts(s);
    const id = `${index}/${player}`;
    if (!lines.has(id)) lines.set(id, { label: missionLabel(Number(index)), player, by: {} });
    lines.get(id).by[s.mode] = cellText(s);
  }
  const head = `| Mission | Player | ${modes.map((m) => m[0].toUpperCase() + m.slice(1)).join(" | ")} |`;
  const rule = `|---|---|${modes.map(() => "---").join("|")}|`;
  const body = [...lines.values()].map((l) => `| ${l.label} | ${l.player} | ${modes.map((m) => l.by[m] ?? "not measured").join(" | ")} |`);
  return [head, rule, ...body].join("\n");
}
