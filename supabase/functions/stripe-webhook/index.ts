// Rollout plan enforcement: Stripe webhook -> rollout_artists.plan
// Signature-verified; needs only the webhook signing secret (no API key).
// Handles first-purchase (subscription.created), changes (updated), and cancels.
import { createClient } from "npm:@supabase/supabase-js@2";

const PRICE_TIER: Record<string, string> = {
  "price_1TyGoVRwEqAVdib6uCxPyAZE": "artist", // monthly
  "price_1TyGolRwEqAVdib6LmieUdOX": "artist", // annual
  "price_1TyGq5RwEqAVdib6I5FnGqPk": "studio", // monthly
  "price_1TyGqFRwEqAVdib6Xp8K5YMY": "studio", // annual
};

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

// Apply a subscription event to the plan, matched by stripe_customer_id.
//   "applied" — the row was updated (or the price is unknown → intentional no-op)
//   "unbound" — no row bound to this customer yet (checkout.session.completed
//               hasn't landed) → caller asks Stripe to retry
//   "stale"   — this event is OLDER than one we've already applied (Stripe
//               reordered/redelivered) → acknowledge, do NOT overwrite
// deno-lint-ignore no-explicit-any
async function applySubscription(db: any, sub: any, created: number): Promise<"applied" | "unbound" | "stale"> {
  // scan ALL line items for a known plan price (don't assume it's items[0])
  const items = sub.items?.data ?? [];
  let tier: string | undefined;
  for (const it of items) {
    const t = PRICE_TIER[it?.price?.id ?? ""];
    if (t) { tier = t; break; }
  }
  const active = ["active", "trialing", "past_due"].includes(sub.status);
  if (!tier) {
    // Unknown price on the sub. An ACTIVE paid sub with no mapped price is almost
    // certainly PRICE_TIER config drift (a new Stripe price not added to the map):
    // surface it and let Stripe retry so a hotfix can catch it within the window,
    // instead of silently stranding a paying customer on 'free'.
    if (active) { console.warn("stripe-webhook: unmapped active price; update PRICE_TIER", sub.id); return "unbound"; }
    return "applied"; // inactive / irrelevant sub, no known price — ack no-op
  }
  // Is the customer bound at all? Distinguishes "not yet bound" (retry) from
  // "bound but this event is stale" (ack, no retry).
  const { data: bound, error: selErr } = await db.from("rollout_artists")
    .select("id").eq("stripe_customer_id", sub.customer).limit(1);
  if (selErr) throw selErr;
  if (!bound || bound.length === 0) return "unbound";
  // ATOMIC compare-and-set: the ordering guard lives in the UPDATE's WHERE, not
  // in app code, so two concurrent invocations can't both pass a prior SELECT
  // and let an older event clobber a newer one. Apply only if the stored mark is
  // null or STRICTLY older than this event; a same/older redelivery is a no-op.
  const { data: hit, error: updErr } = await db.from("rollout_artists")
    .update({ plan: active ? tier : "free", stripe_subscription_id: sub.id, stripe_event_ts: created })
    .eq("stripe_customer_id", sub.customer)
    .or(`stripe_event_ts.is.null,stripe_event_ts.lt.${created}`)
    .select("id");
  if (updErr) throw updErr;
  return (hit?.length ?? 0) > 0 ? "applied" : "stale";
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
      const created = Number(event.created) || 0;
      // Bind ONLY by the trusted client_reference_id (the signed-in uid). We do
      // NOT bind by email: email is client-writable and non-unique, so binding by
      // it would allow cross-account plan escalation. The in-app checkout always
      // sets uid; a raw payment-link opened outside the app can't be bound and
      // will dead-letter (the supported path is the in-app upgrade button).
      //
      // Checkout's ONLY job is to bind the Stripe customer to this uid so the
      // subscription events (matched by stripe_customer_id) can find the row.
      // Plan, stripe_subscription_id, AND the ordering high-water mark are all set
      // authoritatively by applySubscription when subscription.created/updated
      // lands (within seconds). Because checkout never grants a plan or advances
      // the high-water mark, a REDELIVERED checkout can never re-grant a cancelled
      // plan, and it can never block a same-second subscription.created from
      // setting the plan.
      if (uid) {
        const { data: bound } = await db.from("rollout_artists")
          .update({ stripe_customer_id: s.customer ?? null })
          .eq("id", uid).select("id");
        if ((bound?.length ?? 0) === 0) {
          // profile row not created yet — retry until the first app login upserts it
          const ageSec = Date.now() / 1000 - created;
          if (ageSec < 1800) return new Response("profile not ready; retry", { status: 409 });
        }
      }
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      // First purchase fires .created (Stripe does NOT guarantee .updated), so
      // both must run the same price->tier logic.
      const created = Number(event.created) || 0;
      const res = await applySubscription(db, event.data.object, created);
      if (res === "unbound") {
        // Not bound yet (checkout.session.completed hasn't landed). Ask Stripe to
        // retry — but only for ~30m; a genuinely unbindable event should be
        // dead-lettered (200) rather than retried for days.
        const ageSec = Date.now() / 1000 - created;
        if (ageSec < 1800) return new Response("customer not yet bound; retry", { status: 409 });
        console.warn("subscription event unbindable after 30m; dead-lettering", event.id);
      }
      // "stale" (reordered/redelivered older event) and "applied" → 200
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const created = Number(event.created) || 0;
      // Clear the plan ONLY for the CURRENTLY-bound subscription, via the same
      // atomic high-water-mark guard. A late delete of an OLD sub (customer since
      // re-subscribed) matches 0 rows (sub id no longer bound); a reordered older
      // delete is dropped by the stripe_event_ts guard.
      const { data: cleared } = await db.from("rollout_artists")
        .update({ plan: "free", stripe_subscription_id: null, stripe_event_ts: created })
        .eq("stripe_customer_id", sub.customer)
        .eq("stripe_subscription_id", sub.id)
        .or(`stripe_event_ts.is.null,stripe_event_ts.lt.${created}`)
        .select("id");
      if ((cleared?.length ?? 0) === 0) {
        // Missed. If the customer isn't bound yet, retry (symmetric with the
        // subscription-event path) so a cancel that races AHEAD of checkout can't
        // be dropped and later resurrected by the delayed create. If the customer
        // IS bound, 0 rows means this delete is for an old/superseded sub or is
        // stale — correctly a no-op.
        const { data: cust } = await db.from("rollout_artists")
          .select("id").eq("stripe_customer_id", sub.customer).limit(1);
        if ((cust?.length ?? 0) === 0) {
          const ageSec = Date.now() / 1000 - created;
          if (ageSec < 1800) return new Response("customer not yet bound; retry", { status: 409 });
        }
      }
    }
  } catch (e) {
    console.error("webhook handling failed", e);
    return new Response("error", { status: 500 });
  }
  return new Response("ok", { status: 200 });
});
