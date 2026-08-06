// Style Dictionary v4 build script for @wxpr/tokens
// Produces:
//   build/css/variables.css       (light mode :root)
//   build/css/variables-dark.css  (dark mode :root[data-theme="dark"], .dark)
//   build/css/index.css           (imports both)
//   build/ts/tokens.ts + tokens.js + index.ts/.js + .d.ts (var() refs)
//   build/tailwind/preset.cjs     (Tailwind v3 preset, CommonJS)
//
// Approach: drive everything from raw JSON sources rather than Style Dictionary
// transforms — keeps darkValue handling, typography splitting, and Tailwind
// preset generation simple and explicit. Style Dictionary is still listed as a
// devDependency so the package can adopt deeper SD features later, but the
// authoritative build runs here.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PKG_ROOT = path.resolve(__dirname, "..");
const TOKENS_DIR = path.join(PKG_ROOT, "tokens");
const BUILD_DIR = path.join(PKG_ROOT, "build");

// ---------- helpers ----------

async function readJson(p) {
  const raw = await fs.readFile(p, "utf8");
  return JSON.parse(raw);
}

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile() && entry.name.endsWith(".json")) out.push(full);
  }
  return out;
}

function isTokenLeaf(node) {
  return (
    node &&
    typeof node === "object" &&
    !Array.isArray(node) &&
    Object.prototype.hasOwnProperty.call(node, "value") &&
    Object.prototype.hasOwnProperty.call(node, "type")
  );
}

// Deep merge two plain objects
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    if (
      sv &&
      typeof sv === "object" &&
      !Array.isArray(sv) &&
      !isTokenLeaf(sv) &&
      target[key] &&
      typeof target[key] === "object" &&
      !isTokenLeaf(target[key])
    ) {
      deepMerge(target[key], sv);
    } else {
      target[key] = sv;
    }
  }
  return target;
}

// Flatten tree → [{ path: ['color','brand','primary'], token: {...} }, ...]
function flatten(tree, trail = []) {
  const out = [];
  if (isTokenLeaf(tree)) {
    out.push({ path: trail, token: tree });
    return out;
  }
  if (tree && typeof tree === "object") {
    for (const [k, v] of Object.entries(tree)) {
      out.push(...flatten(v, [...trail, k]));
    }
  }
  return out;
}

// Resolve `{a.b.c}` references against the flat map.
// `mode` = 'light' | 'dark'. Falls back to light if dark not defined.
function resolveValue(rawValue, flatMap, mode) {
  if (typeof rawValue !== "string") return rawValue;
  const m = rawValue.match(/^\{([^}]+)\}$/);
  if (!m) return rawValue;
  const refPath = m[1];
  const target = flatMap.get(refPath);
  if (!target) throw new Error(`Unresolved token reference: {${refPath}}`);
  const next =
    mode === "dark" && target.token.darkValue !== undefined
      ? target.token.darkValue
      : target.token.value;
  return resolveValue(next, flatMap, mode);
}

function toCssVarName(pathParts) {
  return "--" + pathParts.join("-");
}

// Typography composite → 4 css vars
function expandTypography(pathParts, val) {
  const base = pathParts.join("-");
  return [
    [`--${base}-font-family`, val.fontFamily],
    [`--${base}-font-size`, val.fontSize],
    [`--${base}-line-height`, val.lineHeight],
    [`--${base}-font-weight`, String(val.fontWeight)],
    [`--${base}-letter-spacing`, val.letterSpacing],
  ];
}

// ---------- main ----------

async function loadSource() {
  const files = await walk(TOKENS_DIR);
  let tree = {};
  for (const f of files.sort()) {
    const data = await readJson(f);
    deepMerge(tree, data);
  }
  return tree;
}

function buildFlatMap(tree) {
  const flat = flatten(tree);
  const map = new Map();
  for (const item of flat) map.set(item.path.join("."), item);
  return { flat, map };
}

function renderCss(flat, map, mode) {
  const selector =
    mode === "dark" ? ':root[data-theme="dark"], .dark' : ":root";
  const lines = [];
  lines.push(`/* @wxpr/tokens — ${mode} mode */`);
  lines.push(`${selector} {`);

  for (const { path: p, token } of flat) {
    const type = token.type;
    if (type === "typography") {
      const resolved = {};
      for (const [k, v] of Object.entries(token.value)) {
        resolved[k] = typeof v === "string" ? resolveValue(v, map, mode) : v;
      }
      for (const [name, value] of expandTypography(p, resolved)) {
        lines.push(`  ${name}: ${value};`);
      }
    } else {
      const raw =
        mode === "dark" && token.darkValue !== undefined
          ? token.darkValue
          : token.value;
      const value = resolveValue(raw, map, mode);
      lines.push(`  ${toCssVarName(p)}: ${value};`);
    }
  }
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

// Set a nested key on an object given path parts
function setDeep(obj, parts, value) {
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

function buildTsExport(flat) {
  // Build a JS object: same shape as source tree, but values = var(--...)
  // Typography composite stays as an object of var refs (font-family etc.)
  const out = {};
  for (const { path: p, token } of flat) {
    if (token.type === "typography") {
      const base = p.join("-");
      const composite = {
        fontFamily: `var(--${base}-font-family)`,
        fontSize: `var(--${base}-font-size)`,
        lineHeight: `var(--${base}-line-height)`,
        fontWeight: `var(--${base}-font-weight)`,
        letterSpacing: `var(--${base}-letter-spacing)`,
      };
      setDeep(out, p, composite);
    } else {
      setDeep(out, p, `var(${toCssVarName(p)})`);
    }
  }
  return out;
}

function stringifyAsTs(obj, indent = 0) {
  const pad = "  ".repeat(indent);
  const padInner = "  ".repeat(indent + 1);
  if (typeof obj === "string") return JSON.stringify(obj);
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map((v) => stringifyAsTs(v, indent + 1)).join(", ") + "]";
  }
  if (obj && typeof obj === "object") {
    const entries = Object.entries(obj);
    if (entries.length === 0) return "{}";
    const lines = entries.map(([k, v]) => {
      const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
      return `${padInner}${key}: ${stringifyAsTs(v, indent + 1)}`;
    });
    return "{\n" + lines.join(",\n") + ",\n" + pad + "}";
  }
  return "null";
}

function renderTsTokens(obj) {
  return (
    "// AUTO-GENERATED by packages/tokens/scripts/build.js. Do not edit.\n" +
    "// All values are CSS var() references — switch themes via [data-theme=\"dark\"].\n\n" +
    "export const tokens = " +
    stringifyAsTs(obj, 0) +
    " as const;\n\n" +
    "export type Tokens = typeof tokens;\n"
  );
}

function renderJsTokens(obj) {
  return (
    "// AUTO-GENERATED by packages/tokens/scripts/build.js. Do not edit.\n" +
    "export const tokens = " +
    stringifyAsTs(obj, 0) +
    ";\n"
  );
}

function renderDtsTokens(obj) {
  return (
    "// AUTO-GENERATED by packages/tokens/scripts/build.js. Do not edit.\n" +
    "export declare const tokens: " +
    stringifyAsTs(obj, 0) +
    ";\n" +
    "export type Tokens = typeof tokens;\n"
  );
}

// ---------- Tailwind preset ----------

function buildTailwindPreset(tree, flat) {
  // colors — nested object from tree.color, var() refs
  const colors = {};
  if (tree.color) {
    for (const [group, members] of Object.entries(tree.color)) {
      colors[group] = {};
      for (const [name] of Object.entries(members)) {
        colors[group][name] = `var(--color-${group}-${name})`;
      }
    }
  }

  // spacing
  const spacing = {};
  if (tree.spacing) {
    for (const key of Object.keys(tree.spacing)) {
      spacing[key] = `var(--spacing-${key})`;
    }
  }

  // border radius — map keys: none, x-small→xs, small→sm, medium→md, large→lg, x-large→xl, full
  const radiusAliasMap = {
    none: "none",
    "x-small": "xs",
    small: "sm",
    medium: "md",
    large: "lg",
    "x-large": "xl",
    full: "full",
  };
  const borderRadius = {};
  if (tree.radius) {
    for (const key of Object.keys(tree.radius)) {
      const alias = radiusAliasMap[key] || key;
      borderRadius[alias] = `var(--radius-${key})`;
      borderRadius[key] = `var(--radius-${key})`;
    }
  }

  // fontSize from typography — `${group}-${name}` → [size, { lineHeight, letterSpacing, fontWeight }]
  // Strip leading "typography" prefix from token path for Tailwind key.
  const fontSize = {};
  for (const { path: p, token } of flat) {
    if (token.type !== "typography") continue;
    const base = p.join("-");
    const trimmed = p[0] === "typography" ? p.slice(1) : p;
    const key = trimmed.join("-"); // e.g. body-medium, display-x-large, caption-default
    fontSize[key] = [
      `var(--${base}-font-size)`,
      {
        lineHeight: `var(--${base}-line-height)`,
        letterSpacing: `var(--${base}-letter-spacing)`,
        fontWeight: `var(--${base}-font-weight)`,
      },
    ];
  }

  // icon sizes
  const iconSize = {};
  if (tree.icon && tree.icon.size) {
    for (const key of Object.keys(tree.icon.size)) {
      iconSize[key] = `var(--icon-size-${key})`;
    }
  }

  const preset = {
    theme: {
      extend: {
        colors,
        spacing,
        borderRadius,
        fontFamily: {
          sans: ["Pretendard", "sans-serif"],
          mono: ["JetBrains Mono", "monospace"],
        },
        fontSize,
        iconSize,
      },
    },
  };

  // Serialize as CommonJS (Tailwind v3 reads via require())
  const header =
    "// AUTO-GENERATED by packages/tokens/scripts/build.js. Do not edit.\n" +
    "// Tailwind v3 preset. Usage:\n" +
    "//   const wxprPreset = require('@wxpr/tokens/tailwind');\n" +
    "//   module.exports = { presets: [wxprPreset], content: ['./src/**/*.{ts,tsx}'] };\n\n";
  return header + "module.exports = " + stringifyAsTs(preset, 0) + ";\n";
}

// ---------- runner ----------

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function main() {
  console.log("[tokens] writing build/ outputs …");

  console.log("[tokens] loading source JSON …");
  const tree = await loadSource();
  const { flat, map } = buildFlatMap(tree);

  // counts
  const counts = {
    color: 0,
    typography: 0,
    spacing: 0,
    radius: 0,
    iconSize: 0,
    iconAlias: 0,
  };
  for (const { path: p, token } of flat) {
    if (token.type === "color" && p[0] === "color") counts.color++;
    else if (token.type === "color" && p[0] === "icon") counts.iconAlias++;
    else if (token.type === "typography") counts.typography++;
    else if (token.type === "dimension" && p[0] === "spacing") counts.spacing++;
    else if (token.type === "dimension" && p[0] === "radius") counts.radius++;
    else if (token.type === "dimension" && p[0] === "icon") counts.iconSize++;
  }
  console.log("[tokens] counts:", counts);

  // 1. CSS
  console.log("[tokens] writing CSS …");
  const cssDir = path.join(BUILD_DIR, "css");
  await ensureDir(cssDir);
  await fs.writeFile(
    path.join(cssDir, "variables.css"),
    renderCss(flat, map, "light"),
    "utf8",
  );
  await fs.writeFile(
    path.join(cssDir, "variables-dark.css"),
    renderCss(flat, map, "dark"),
    "utf8",
  );
  await fs.writeFile(
    path.join(cssDir, "index.css"),
    "@import './variables.css';\n@import './variables-dark.css';\n",
    "utf8",
  );

  // 2. TS / JS / .d.ts
  console.log("[tokens] writing TS export …");
  const tsDir = path.join(BUILD_DIR, "ts");
  await ensureDir(tsDir);
  const tsObj = buildTsExport(flat);

  await fs.writeFile(
    path.join(tsDir, "tokens.ts"),
    renderTsTokens(tsObj),
    "utf8",
  );
  await fs.writeFile(
    path.join(tsDir, "tokens.js"),
    renderJsTokens(tsObj),
    "utf8",
  );
  await fs.writeFile(
    path.join(tsDir, "tokens.d.ts"),
    renderDtsTokens(tsObj),
    "utf8",
  );
  await fs.writeFile(
    path.join(tsDir, "index.ts"),
    "export * from './tokens';\nexport type { Tokens } from './tokens';\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(tsDir, "index.js"),
    "export * from './tokens.js';\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(tsDir, "index.d.ts"),
    "export * from './tokens';\nexport type { Tokens } from './tokens';\n",
    "utf8",
  );

  // 3. Tailwind preset
  console.log("[tokens] writing Tailwind preset …");
  const twDir = path.join(BUILD_DIR, "tailwind");
  await ensureDir(twDir);
  await fs.writeFile(
    path.join(twDir, "preset.cjs"),
    buildTailwindPreset(tree, flat),
    "utf8",
  );

  console.log("[tokens] done ✓");
}

main().catch((err) => {
  console.error("[tokens] build failed:", err);
  process.exit(1);
});
