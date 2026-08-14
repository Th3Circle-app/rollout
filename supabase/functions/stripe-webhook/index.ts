// Rollout plan enforcement: Stripe webhook -> rollout_artists.plan
// Signature-verified; needs only the webhook signing secret (no API key).
// Handles first-purchase (subscription.created), changes (updated), and cancels.
import { createClient } from "npm:@supabase/supabase-js@2";
// Pure event-routing/ordering logic lives in logic.mjs so it can be unit-tested
// under Node (see tools/redteam/webhook_test.mjs). This file keeps only the
// Deno/HTTP concerns: signature verification and client creation.
// @ts-expect-error — .mjs sibling has no type declarations; Deno resolves it at runtime.
import { handleEvent } from "./logic.mjs";

const enc = new TextEncoder();

// constant-time compare of two equal-length hex strings (no early-exit leak)
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verify(payload: string, sigHeader: string, secret: string) {
  const parts = sigHeader.split(",").map((p) => p.trim());
  const t = parts.find((p) => p.startsWith("t="))?.slice(2);
  // Stripe can send multiple v1 signatures during secret rotation — accept any.
  const v1s = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || v1s.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // 5-min skew
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return v1s.some((v1) => timingSafeEqual(hex, v1));
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  const sig = req.headers.get("stripe-signature") ?? "";
  const payload = await req.text();
  if (!secret || !(await verify(payload, sig, secret))) {
    return new Response("bad signature", { status: 400 });
  }

  const event = JSON.parse(payload);
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // All event routing + the atomic ordering guard live in logic.mjs so they can
    // be exercised by the Node red-team suite without Deno. We do NOT bind by
    // email (client-writable, non-unique → cross-account escalation); checkout
    // binds the Stripe customer to the trusted uid, and subscription events set
    // the plan + high-water mark authoritatively — see logic.mjs for the reasoning.
    const { status, note } = await handleEvent(db, event);
    return new Response(note, { status });
  } catch (e) {
    console.error("webhook handling failed", e);
    return new Response("error", { status: 500 });
  }
});
