// Golden scripted runs (5.1 G1): the row schema and a pure comparator. tests/golden-browser.mjs
// measures the rows; this module says what moved, decides whether a rewrite may go ahead, and
// writes the file. Nothing here touches the disk or the browser.

import { MISSIONS } from "../src/data.js";

export const SCHEMA = 1;

// Schema 1, frozen: every row carries every field, in this order. A field that does not apply to
// a mission's chapter is null. The reserved fields stay null until the item that owns them fills
// them in for its own keys: standDown and resupply (C1, the harbour), launches (K1, the canal),
// runsBroken and phase (5.3, the finale). The radio log stays empty until N1's director.
export const FIELDS = [
  "key",
  "status",
  "reason",
  "endTime",
  "window",
  "used",
  "stars",
  "score",
  "kills",
  "lost",
  "hitsTaken",
  "bargeHp",
  "shields",
  "integrity",
  "gate",
  "flaresUsed",
  "randomCalls",
  "standDown",
  "resupply",
  "launches",
  "runsBroken",
  "phase",
  "radio",
];
export const RESERVED = ["standDown", "resupply", "launches", "runsBroken", "phase"];

const MODES = ["easy", "normal", "hard", "crazy"];

// 'mission/pilot/mode', e.g. '7/harbour/normal'.
export function rowKey(index, player, mode) {
  return `${index}/${player}/${mode}`;
}

export function missionOf(key) {
  return Number(key.split("/")[0]);
}

// '--missions 0-8,18' -> {0, 1, ..., 8, 18}; no option -> null (every mission). Missions are
// indexes, not labels (1.7 is 6): anything else throws, so a typo can never select nothing and pass.
export function parseMissions(text) {
  if (text === undefined) return null;
  const set = new Set();
  for (const part of String(text).split(",")) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    const a = Number(match?.[1]),
      b = Number(match?.[2] ?? match?.[1]);
    if (!match || a > b || b >= MISSIONS.length)
      throw new Error(`--missions takes mission indexes 0-${MISSIONS.length - 1} and ranges such as 0-8,18 (1.7 is 6), not "${text}"`);
    for (let i = a; i <= b; i++) set.add(i);
  }
  return set;
}

// Mission order, then the player, then the mode from Easy to Crazy.
export function sortRows(rows) {
  const parts = (key) => key.split("/");
  return [...rows].sort((a, b) => {
    const [ia, pa, ma] = parts(a.key),
      [ib, pb, mb] = parts(b.key);
    return Number(ia) - Number(ib) || (pa < pb ? -1 : pa > pb ? 1 : 0) || MODES.indexOf(ma) - MODES.indexOf(mb);
  });
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Every difference between two row sets: one entry per changed field of a shared key, and one per
// key that only one side has (field null).
export function diffRows(before, after) {
  const old = new Map(before.map((row) => [row.key, row]));
  const changes = [];
  for (const row of sortRows(after)) {
    const was = old.get(row.key);
    old.delete(row.key);
    if (!was) {
      changes.push({ key: row.key, field: null, from: null, to: row });
      continue;
    }
    const fields = [...FIELDS.filter((f) => f in was || f in row), ...Object.keys({ ...was, ...row }).filter((f) => !FIELDS.includes(f))];
    for (const field of fields) if (!same(was[field], row[field])) changes.push({ key: row.key, field, from: was[field], to: row[field] });
  }
  for (const row of sortRows([...old.values()])) changes.push({ key: row.key, field: null, from: row, to: null });
  return changes;
}

const show = (value) => (value === undefined ? "(none)" : JSON.stringify(value));

// '7/harbour/normal used: 17 -> 15'; a whole row that appeared or went is '+ key' or '- key'.
export function formatChange(change) {
  if (change.field === null) return change.from ? `- ${change.key} (row removed)` : `+ ${change.key} (new row)`;
  return `${change.key} ${change.field}: ${show(change.from)} -> ${show(change.to)}`;
}

// '--allow 6/*/*,5/naive/normal': comma-separated key patterns, '*' standing for one whole part.
// No option -> null (any key may move). An option with no pattern in it (an empty variable in a
// script) throws, rather than let every key move.
export function parseAllow(text) {
  if (text === undefined) return null;
  const patterns = String(text)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!patterns.length) throw new Error(`--allow needs at least one key pattern, such as 6/*/*, not "${text}"`);
  return patterns;
}

export function matchKey(key, pattern) {
  const k = key.split("/"),
    p = pattern.split("/");
  return k.length === p.length && p.every((part, i) => part === "*" || part === k[i]);
}

// The keys that moved although no pattern covers them: a rewrite with --allow refuses if any.
export function outside(changes, patterns) {
  const keys = new Set(changes.map((c) => c.key));
  return [...keys].filter((key) => !patterns.some((p) => matchKey(key, p)));
}

// A recorded file and a measurement from another browser build can differ for that reason alone.
export function headerWarnings(recorded, measured) {
  const warnings = [];
  if (recorded.schema !== measured.schema) warnings.push(`schema ${recorded.schema} recorded, ${measured.schema} measured`);
  if (recorded.browser !== measured.browser)
    warnings.push(`browser differs: rows recorded on ${recorded.browser}, measured on ${measured.browser}; a change may come from the browser build`);
  return warnings;
}

// The file after a rewrite: the measured rows replace every recorded row of the missions in
// scope, so a key the run no longer produces goes, and the other missions' rows stay as they were.
export function mergeRows(recorded, measured, missions) {
  return sortRows([...recorded.filter((row) => !missions.has(missionOf(row.key))), ...measured]);
}

// One row per line, so a git diff shows exactly which rows moved.
export function serialize({ schema, browser, sha, rows }) {
  const lines = sortRows(rows).map((row) => `    ${JSON.stringify(row)}`);
  return `{\n  "schema": ${JSON.stringify(schema)},\n  "browser": ${JSON.stringify(browser)},\n  "sha": ${JSON.stringify(sha)},\n  "rows": [\n${lines.join(",\n")}\n  ]\n}\n`;
}
