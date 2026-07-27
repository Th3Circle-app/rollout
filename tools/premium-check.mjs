#!/usr/bin/env node
/**
 * ROLLOUT PREMIUM CHECK — strict, extensive design-craft grader.
 *
 * Grades every screen + shared component against the design contract
 * (Flowstep-Challenge/PROMPT.md) and the craft bar of the reference class
 * (Linear / Arc / Vercel): palette-as-signal, typography discipline,
 * crafted microstates, consistent surfaces, honest content, a11y basics.
 *
 * Bands: PLATINUM >= 95 · GOLD >= 85 · SILVER >= 70 · NEEDS WORK < 70
 * Usage: node tools/premium-check.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

// ---------------------------------------------------------------- files
const files = [];
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|ts|css)$/.test(e.name) && !/vite-env|tw-animate/.test(e.name)) files.push(p);
  }
}
walk(SRC);

// ---------------------------------------------------------------- palette
// The contract: color is a signal, not decoration.
const ALLOWED_HEX = new Set(
  [
    "0B0B0F", "15151C", "1E1E28", "F2F0F7", "9A96AD", "5E5A72", // core
    "8B5CF6", "7C4DEC", // violet primary + hover
    "F0A45B", // amber AI signal
    "46E0A8", // mint ready signal
    "08080C", "0A0A0F", // body base
    // brand colors (platform buttons only)
    "1DB954", "FA57C1", "FF0000", "FF5500", "1877F2",
    // compositor/canvas art internals (not UI chrome)
    "FFFFFF", "000000",
  ].map((s) => s.toUpperCase())
);
const BANNED_TW = [
  /\bbg-neutral-(?!950\b)\d+/g, // neutral surfaces (except page fallback)
  /\btext-neutral-(?!50\b)\d+/g,
  /\b(?:bg|text|border)-(?:amber|emerald|sky|blue|green|yellow|orange|pink|rose|indigo|fuchsia|cyan|teal|lime|slate|zinc|stone|gray)-\d+/g,
  /\b(?:bg|text|border)-violet-(?!500\b)\d+/g, // violet only as the one accent
  /gradient-to-(?![t]\b)/g, // gradients only for image-overlay fades (to-t)
];

// ---------------------------------------------------------------- rules
const isPage = (p) => p.includes("/pages/");
const isComponent = (p) => p.includes("/components/");
const UI_FILES = files.filter((p) => /\.tsx$/.test(p) && (isPage(p) || isComponent(p)));

const report = []; // {file, line, cat, msg, weight}
const add = (file, line, cat, msg, weight = 1) =>
  report.push({ file: relative(ROOT, file), line, cat, msg, weight });

for (const f of UI_FILES) {
  const src = readFileSync(f, "utf8");
  const lines = src.split("\n");
  const inCompositor = f.endsWith("compositor.ts");

  lines.forEach((ln, i) => {
    const n = i + 1;

    // --- PALETTE ---------------------------------------------------
    if (!inCompositor) {
      for (const m of ln.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
        if (!ALLOWED_HEX.has(m[1].toUpperCase()))
          add(f, n, "palette", `off-contract hex #${m[1]}`, 2);
      }
      for (const re of BANNED_TW) {
        re.lastIndex = 0;
        for (const m of ln.matchAll(re)) add(f, n, "palette", `off-contract class "${m[0]}"`, 2);
      }
      if (/#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/.test(ln) && /className/.test(ln))
        add(f, n, "palette", "3-digit hex in UI", 1);
    }

    // --- TYPOGRAPHY ------------------------------------------------
    if (/font-serif/.test(ln)) add(f, n, "type", "serif font in UI", 2);
    if (/\btext-(6xl|7xl|8xl)\b/.test(ln) && !f.endsWith("Ship.tsx"))
      add(f, n, "type", "display size outside countdown", 1);
    if (/uppercase/.test(ln) && /text-(\[9px\]|\[10px\]|\[11px\]|xs)/.test(ln) && !/tracking/.test(ln))
      add(f, n, "type", "uppercase micro-label without letter-spacing", 1);

    // --- SURFACES / CONSISTENCY ------------------------------------
    if (/\bshadow-(sm|md|lg|xl|2xl)\b/.test(ln) && !/shadow-none/.test(ln))
      add(f, n, "surface", "drop shadow on dark surface (contract: flat)", 1);
    // rounded-md IS in the original vocabulary (Screen 1 logo) — no rule.
    if (/border-white\/(?!6|8|10|15|16|20)\d+/.test(ln))
      add(f, n, "surface", "off-scale border alpha", 1);
    if (/backdrop-blur/.test(ln) && !/UpgradeModal|ProGate/.test(f))
      add(f, n, "surface", "glassmorphism outside modal layer", 1);

    // --- HONESTY ---------------------------------------------------
    if (/80 messages|Jordan M\.|>JM</.test(ln)) add(f, n, "honesty", "leftover mock content", 2);
    if (/Unsplash|unsplash\.com/i.test(ln)) add(f, n, "honesty", "stock placeholder imagery", 2);

    // --- LAYOUT ----------------------------------------------------
    if (/w-screen|min-w-screen|max-w-screen\b/.test(ln))
      add(f, n, "layout", "viewport-width hack (shell owns width)", 1);
    if (/h-fit h-fit/.test(ln)) add(f, n, "layout", "duplicated utility", 1);
  });

  // --- per-file structural checks ----------------------------------
  if (isPage(f)) {
    const interactive = (src.match(/onClick=/g) || []).length;
    const stated = (src.match(/hover:|transition|disabled:/g) || []).length;
    if (interactive > 2 && stated < Math.ceil(interactive * 0.5))
      add(f, 0, "microstates", `${interactive} interactive elements but only ${stated} state styles`, 2);
    if (!/font-mono/.test(src)) add(f, 0, "type", "no mono data styling on page", 1);
    if (/<img(?![^>]*alt=)/.test(src)) add(f, 0, "a11y", "img without alt", 2);
  }
}

// --- global checks --------------------------------------------------
const css = readFileSync(join(SRC, "index.css"), "utf8");
if (!/focus-visible/.test(css) && !UI_FILES.some((f) => /focus-visible/.test(readFileSync(f, "utf8"))))
  add(join(SRC, "index.css"), 0, "microstates", "no global focus-visible treatment (keyboard users see nothing)", 3);
if (/radial-gradient|linear-gradient/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")) && /app-bg[^}]*gradient/.test(css))
  add(join(SRC, "index.css"), 0, "palette", "ambient gradient background (contract: flat)", 3);
const btn = readFileSync(join(SRC, "components/ui/button.tsx"), "utf8");
if (!/transition/.test(btn)) add(join(SRC, "components/ui/button.tsx"), 0, "microstates", "buttons without transition", 2);

// ---------------------------------------------------------------- score
const CATS = {
  palette: { label: "Palette discipline", weight: 20 },
  type: { label: "Typography discipline", weight: 15 },
  microstates: { label: "Crafted microstates", weight: 20 },
  surface: { label: "Surface consistency", weight: 15 },
  layout: { label: "Layout rhythm", weight: 10 },
  honesty: { label: "Honest content", weight: 10 },
  a11y: { label: "Accessibility basics", weight: 10 },
};
let total = 0;
const catScores = {};
for (const [key, cfg] of Object.entries(CATS)) {
  const hits = report.filter((r) => r.cat === key);
  const penalty = hits.reduce((s, r) => s + r.weight, 0);
  // each weighted violation costs 12% of the category, floor 0
  const score = Math.max(0, cfg.weight * (1 - penalty * 0.12));
  catScores[key] = { ...cfg, penalty, hits: hits.length, score };
  total += score;
}
total = Math.round((total / Object.values(CATS).reduce((s, c) => s + c.weight, 0)) * 100);
const band =
  total >= 95 ? "PLATINUM" : total >= 85 ? "GOLD" : total >= 70 ? "SILVER" : "NEEDS WORK";

// ---------------------------------------------------------------- print
console.log("\nROLLOUT PREMIUM CHECK");
console.log("=".repeat(64));
for (const [key, c] of Object.entries(catScores)) {
  const bar = "#".repeat(Math.round((c.score / c.weight) * 20)).padEnd(20, ".");
  console.log(
    `${c.label.padEnd(24)} [${bar}] ${c.score.toFixed(1).padStart(5)}/${c.weight}  (${c.hits} issues)`
  );
}
console.log("=".repeat(64));
console.log(`OVERALL: ${total}/100  →  ${band}\n`);
if (report.length) {
  console.log("VIOLATIONS (fix these):");
  for (const r of report.sort((a, b) => b.weight - a.weight).slice(0, 60))
    console.log(`  [${r.cat}] ${r.file}${r.line ? ":" + r.line : ""} — ${r.msg}`);
  if (report.length > 60) console.log(`  …and ${report.length - 60} more`);
} else {
  console.log("No violations. Ship it.");
}
process.exit(total >= 95 ? 0 : 1);
