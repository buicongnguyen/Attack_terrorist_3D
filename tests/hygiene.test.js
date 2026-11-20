// Code hygiene (5.1 X1): every name src exports is imported somewhere, and no 'TODO 5.1' marker
// is left. An export counts as used when a file in src, tests or tools imports it by name, or
// imports its module whole (`import * as ns`) and reads `ns.name`. The modules main.js hands to
// the qa API (window.__TIDELOCK_STRIKE__, _RESCUE_, _HARBOUR_) also count a name the browser
// suites read through that object. Anything else needs an ALLOW entry with its reason.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CODE = /\.(m?js)$/;

// "file:name" -> why it stays exported though nothing imports it.
export const ALLOW = {
  // The shared iPhone gesture helper is copied verbatim from the mobile-game-support rollout;
  // its API is kept whole so the copies stay identical across the games.
  "src/mobile-game-support.mjs:*": "shared helper, kept identical to the other games' copies",
};

function files(dir) {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const path = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) continue;
    if (statSync(join(ROOT, path)).isDirectory()) out.push(...files(path));
    else if (CODE.test(name)) out.push(path.replaceAll("\\", "/"));
  }
  return out;
}

const read = (path) => readFileSync(join(ROOT, path), "utf8");
// Comments out, so a name in a comment never counts as a use; strings stay (import specifiers).
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

export function exportedNames(text) {
  const names = new Set();
  const src = code(text);
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  // export const { a, b } = ... is not used here; export { a, b as c } is.
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}\s*(?:from\s*["'][^"']+["'])?/gm))
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) names.add(name);
    }
  // export const a = 1, b = 2; (commas inside brackets, parameter lists and strings don't count)
  for (const m of src.matchAll(/^export\s+(?:const|let|var)\s+/gm)) {
    let depth = 0;
    for (let i = m.index + m[0].length; i < src.length; i++) {
      const c = src[i];
      if (c === '"' || c === "'" || c === "`") {
        for (i++; i < src.length && src[i] !== c; i++) if (src[i] === "\\") i++;
      } else if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) depth--;
      else if (depth === 0 && c === ";") break;
      else if (depth === 0 && c === ",") {
        const next = src.slice(i + 1).match(/^\s*([A-Za-z_$][\w$]*)\s*=(?!=)/);
        if (next) names.add(next[1]);
      }
    }
  }
  return names;
}

// What `from` imports of `target`: { names, namespaces } with namespace aliases.
export function importsOf(text, from, target) {
  const names = new Set(),
    namespaces = [];
  const src = code(text);
  const re = /import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of src.matchAll(re)) {
    const spec = m[2] || m[3];
    if (!spec?.startsWith(".")) continue;
    const path = relative(ROOT, resolve(ROOT, dirname(from), spec)).replaceAll("\\", "/");
    if (path !== target) continue;
    if (m[3]) {
      // A dynamic import: every name read off it counts (rare; tests only).
      namespaces.push(null);
      continue;
    }
    const clause = m[1];
    const ns = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (ns) namespaces.push(ns[1]);
    const braces = clause.match(/\{([\s\S]*)\}/);
    if (braces)
      for (const part of braces[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0];
        if (name) names.add(name);
      }
  }
  return { names, namespaces, src };
}

const QA_OBJECTS = { "src/strike-data.js": "__TIDELOCK_STRIKE__", "src/rescue-data.js": "__TIDELOCK_RESCUE__", "src/harbour-data.js": "__TIDELOCK_HARBOUR__" };

export function unusedExports() {
  const sources = files("src");
  const all = [...sources, ...files("tests"), ...files("tools")];
  const texts = new Map(all.map((f) => [f, read(f)]));
  const unused = [];
  for (const file of sources) {
    if (ALLOW[`${file}:*`]) continue;
    const used = new Set();
    let dynamic = false;
    for (const [other, text] of texts) {
      if (other === file) continue;
      const { names, namespaces, src } = importsOf(text, other, file);
      for (const n of names) used.add(n);
      for (const ns of namespaces) {
        if (ns === null) dynamic = true;
        else for (const m of src.matchAll(new RegExp(`\\b${ns.replace(/\$/g, "\\$")}\\.([A-Za-z_$][\\w$]*)`, "g"))) used.add(m[1]);
      }
      const qa = QA_OBJECTS[file];
      if (qa && src.includes(qa)) for (const m of src.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) used.add(m[1]);
    }
    if (dynamic) continue;
    for (const name of exportedNames(texts.get(file))) if (!used.has(name) && !ALLOW[`${file}:${name}`]) unused.push(`${file}:${name}`);
  }
  return unused;
}

test("every export in src is imported somewhere (or allow-listed with a reason)", () => {
  assert.deepEqual(unusedExports(), []);
});

test("allow-list entries name files that exist and carry a reason", () => {
  for (const [key, why] of Object.entries(ALLOW)) {
    const [file] = key.split(":");
    assert.ok(statSync(join(ROOT, file)).isFile(), key);
    assert.ok(why.length > 10, key);
  }
});

test("no 'TODO 5.1' marker is left in src, tests or tools", () => {
  const marker = ["TODO", "5.1"].join(" ");
  const left = [...files("src"), ...files("tests"), ...files("tools"), "index.html"].filter((f) => f !== "tests/hygiene.test.js" && read(f).includes(marker));
  assert.deepEqual(left, []);
});

test("the scanner sees every export form and import form", () => {
  const names = exportedNames(
    "export function a() {}\nexport async function b() {}\nexport class C {}\nexport const d = 1, e = 2;\nexport { f, g as h };\n// export const nope = 1;\nexport const k = (x, y = 2) => [x, y];\nexport const s = 'a, b = 1';\n",
  );
  assert.deepEqual([...names].sort(), ["C", "a", "b", "d", "e", "f", "h", "k", "s"]);
  const { names: imported, namespaces } = importsOf('import { a, b as x } from "../src/m.js";\nimport * as M from "../src/m.js";\n', "tests/t.js", "src/m.js");
  assert.deepEqual([...imported], ["a", "b"]);
  assert.deepEqual(namespaces, ["M"]);
});

test("the release is 5.1 wherever it is stored or shown (package.json, Mission control)", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.version, /^5\.1\.\d+$/);
  const shown = read("index.html").match(/<p id="build-version">Tidelock (\d+\.\d+)\b/);
  assert.equal(shown?.[1], pkg.version.split(".").slice(0, 2).join("."));
});
