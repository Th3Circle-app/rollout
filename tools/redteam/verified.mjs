#!/usr/bin/env node
/**
 * VERIFIED-FEATURE TRIPWIRE — a regression guard for work that was built, tested,
 * and confirmed with Harrison. If an edit (mine, a future session's, or the
 * red-team loop's own "cleanup") removes a verified feature or re-introduces a
 * trap we already escaped, this FAILS loudly instead of silently shipping it.
 *
 * This exists because the landing atmosphere kept getting removed/re-broken
 * mid-iteration. Each invariant below is a thing we PROVED works on Harrison's
 * real browser — do not delete an invariant to make this pass; fix the code.
 *
 * Run: node tools/redteam/verified.mjs
 */
import { readFileSync, existsSync } from "node:fs";

const INVARIANTS = [
  // ---- Landing / auth atmosphere: ONE WebGL context or it whites out --------
  {
    feature: "Blob + smoke live INSIDE the 3D headphones' single WebGL canvas",
    file: "src/components/Headphones3D.tsx",
    must: ["BLOB_FRAG", "SMOKE_FRAG", "function Blob(", "function Smoke(", "<Blob", "<Smoke"],
    mustNot: [],
    why: "A 2nd standalone WebGL canvas on the landing gets evicted → hero paints WHITE.",
  },
  {
    feature: "Headphones canvas has NO post-processing (opaque-frame trap)",
    file: "src/components/Headphones3D.tsx",
    must: [],
    mustNot: ["EffectComposer", "@react-three/postprocessing"],
    why: "EffectComposer writes an OPAQUE frame that painted the whole hero white.",
  },
  {
    feature: "Blob uniforms update on the material (not a frozen local object)",
    file: "src/components/Headphones3D.tsx",
    must: ["mat.current?.uniforms"],
    mustNot: [],
    why: "Mutating a local uniforms object leaves the blob frozen (no move/morph).",
  },
  {
    feature: "GlassBackground is a dark base div, NOT a 2nd WebGL canvas",
    file: "src/components/GlassBackground.tsx",
    must: [],
    mustNot: ['getContext("webgl"', "getContext('webgl'"],
    why: "A WebGL GlassBackground competes with the 3D canvas and whites out.",
  },
  {
    feature: "SmokeLayer stays a no-op (smoke moved into the 3D canvas)",
    file: "src/components/SmokeLayer.tsx",
    must: ["return null"],
    mustNot: ['getContext("webgl"'],
    why: "A separate WebGL smoke canvas on the landing evicts → white.",
  },
  {
    feature: "Landing mounts the full atmosphere",
    file: "src/components/RolloutLanding.tsx",
    must: ["<GlassBackground", "<StarField", "<SmokeLayer", "<Headphones3D"],
    mustNot: [],
    why: "Blob/stars/smoke/headphones are the verified hero.",
  },
  {
    feature: "Login window has the starfield",
    file: "src/components/Auth.tsx",
    must: ["<StarField"],
    mustNot: [],
    why: "Stars were added to the login window and confirmed.",
  },
  {
    feature: "Studio pages carry stars + smoke",
    file: "src/App.tsx",
    must: ["<StarField", "<SmokeField"],
    mustNot: [],
    why: "Every studio page got the atmosphere; don't drop it from the Shell.",
  },
  {
    feature: "StarField stays a 2D canvas (never WebGL — that's why it survives)",
    file: "src/components/StarField.tsx",
    must: ['getContext("2d")'],
    mustNot: ['getContext("webgl"'],
    why: "2D canvas can't be evicted; making it WebGL would reintroduce the trap.",
  },
  // ---- Billing: the Stripe ordering guard -----------------------------------
  {
    feature: "Stripe webhook keeps the atomic high-water-mark ordering guard",
    file: "supabase/functions/stripe-webhook/logic.mjs",
    must: ["stripe_event_ts"],
    mustNot: [],
    why: "Removing the ordering guard lets a reordered/redelivered event re-grant a cancelled plan.",
  },
  // ---- SSRF: the netguard hardening -----------------------------------------
  {
    feature: "netguard blocks CGNAT metadata range + restricts ports",
    file: "backend/netguard.py",
    must: ["100.64.0.0/10", "_ALLOWED_PORTS"],
    mustNot: [],
    why: "CGNAT 100.64/10 is where Alibaba metadata lives; the stdlib flags miss it.",
  },
];

let fails = 0;
for (const inv of INVARIANTS) {
  if (!existsSync(inv.file)) {
    console.log(`  x  ${inv.feature}\n       MISSING FILE: ${inv.file} — ${inv.why}`);
    fails++;
    continue;
  }
  const src = readFileSync(inv.file, "utf8");
  const missing = (inv.must || []).filter((m) => !src.includes(m));
  const present = (inv.mustNot || []).filter((m) => src.includes(m));
  if (missing.length || present.length) {
    console.log(`  x  ${inv.feature}  (${inv.file})`);
    if (missing.length) console.log(`       removed / missing: ${missing.join(", ")}`);
    if (present.length) console.log(`       trap re-introduced: ${present.join(", ")}`);
    console.log(`       why it matters: ${inv.why}`);
    fails++;
  } else {
    console.log(`  ok  ${inv.feature}`);
  }
}

console.log("");
if (fails) {
  console.log(`VERIFIED-FEATURE TRIPWIRE: ${fails} regression(s). A verified feature was removed or a known trap came back.`);
  console.log("Do NOT delete an invariant to pass — fix the code, or if the removal is intentional, update this file deliberately.");
  process.exit(1);
} else {
  console.log(`VERIFIED-FEATURE TRIPWIRE: all ${INVARIANTS.length} invariants intact.`);
}
