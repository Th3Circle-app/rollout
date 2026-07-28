// Rollout plan enforcement: Stripe webhook -> rollout_artists.plan
// Signature-verified; needs only the webhook signing secret (no API key).
// Tier truth comes from price IDs + payment-link metadata in the event itself.
import { createClient } from "npm:@supabase/supabase-js@2";

const PRICE_TIER: Record<string, string> = {
  "price_1TyGoVRwEqAVdib6uCxPyAZE": "artist", // monthly
  "price_1TyGolRwEqAVdib6LmieUdOX": "artist", // annual
  "price_1TyGq5RwEqAVdib6I5FnGqPk": "studio", // monthly
  "price_1TyGqFRwEqAVdib6Xp8K5YMY": "studio", // annual
};

const enc = new TextEncoder();

async function verify(payload: string, sigHeader: string, secret: string) {
  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => p.split("=") as [string, string])
  );
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  // tolerate 5 min clock skew
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === v1;
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
    if (event.type === "checkout.session.completed") {
      const s = event.data.object;
      const uid = s.client_reference_id;
      const tier = s.metadata?.tier;
      if (uid && (tier === "artist" || tier === "studio")) {
        await db.from("rollout_artists").update({
          plan: tier,
          stripe_customer_id: s.customer ?? null,
          stripe_subscription_id: s.subscription ?? null,
        }).eq("id", uid);
      }
    } else if (event.type === "customer.subscription.updated") {
      const sub = event.data.object;
      const price = sub.items?.data?.[0]?.price?.id ?? "";
      const tier = PRICE_TIER[price];
      const active = ["active", "trialing", "past_due"].includes(sub.status);
      if (tier) {
        await db.from("rollout_artists").update({
          plan: active ? tier : "free",
          stripe_subscription_id: sub.id,
        }).eq("stripe_customer_id", sub.customer);
      }
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      await db.from("rollout_artists").update({
        plan: "free", stripe_subscription_id: null,
      }).eq("stripe_customer_id", sub.customer);
    }
  } catch (e) {
    console.error("webhook handling failed", e);
    return new Response("error", { status: 500 });
  }
  return new Response("ok", { status: 200 });
});
