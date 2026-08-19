// Pure decision logic for the Stripe webhook, extracted from index.ts so it can
// run under Node (no Deno globals, no `npm:` imports, no TypeScript). index.ts
// keeps signature verification + createClient and delegates the routing here.
//
// The `db` argument is the exact Supabase query chain the webhook uses:
//   db.from(t).update(patch).eq(c,v).or(filter).select(cols)
//   db.from(t).update(patch).eq(c,v).eq(c2,v2).or(filter).select(cols)
//   db.from(t).select(cols).eq(c,v).limit(n)
// each awaitable, resolving to { data, error }.

const PRICE_TIER = {
  "price_1TyGoVRwEqAVdib6uCxPyAZE": "artist", // monthly $15 (also the $7 trial base)
  "price_1TyGolRwEqAVdib6LmieUdOX": "artist", // annual $150
  "price_1U5aSdRwEqAVdib6ZBSgAwrs": "studio", // monthly $29
  "price_1U5aShRwEqAVdib6LqxsiEkW": "studio", // annual $290
  // legacy $20 Studio prices — kept so any earlier sub still maps
  "price_1TyGq5RwEqAVdib6I5FnGqPk": "studio", // monthly $20 (retired)
  "price_1TyGqFRwEqAVdib6Xp8K5YMY": "studio", // annual $200 (retired)
};

// Apply a subscription event to the plan, matched by stripe_customer_id.
//   "applied" — the row was updated (or the price is unknown → intentional no-op)
//   "unbound" — no row bound to this customer yet (checkout hasn't landed) OR an
//               ACTIVE sub with an unmapped price (config drift) → caller retries
//   "stale"   — this event is OLDER/equal to one we've already applied
//               (reordered/redelivered) → acknowledge, do NOT overwrite
export async function applySubscription(db, sub, created) {
  // scan ALL line items for a known plan price (don't assume it's items[0])
  const items = sub.items?.data ?? [];
  let tier;
  for (const it of items) {
    const t = PRICE_TIER[it?.price?.id ?? ""];
    if (t) { tier = t; break; }
  }
  const active = ["active", "trialing", "past_due"].includes(sub.status);
  if (!tier) {
    // Unknown price on the sub. An ACTIVE paid sub with no mapped price is almost
    // certainly PRICE_TIER config drift: surface it and let Stripe retry rather
    // than silently stranding a paying customer on 'free'.
    if (active) { console.warn("stripe-webhook: unmapped active price; update PRICE_TIER", sub.id); return "unbound"; }
    return "applied"; // inactive / irrelevant sub, no known price — ack no-op
  }
  // Is the customer bound at all? Distinguishes "not yet bound" (retry) from
  // "bound but this event is stale" (ack, no retry).
  const { data: bound, error: selErr } = await db.from("rollout_artists")
    .select("id").eq("stripe_customer_id", sub.customer).limit(1);
  if (selErr) throw selErr;
  if (!bound || bound.length === 0) return "unbound";
  // ATOMIC compare-and-set: the ordering guard lives in the UPDATE's WHERE. Apply
  // only if the stored mark is null or STRICTLY older than this event; a
  // same/older redelivery matches 0 rows and is a no-op.
  const { data: hit, error: updErr } = await db.from("rollout_artists")
    .update({ plan: active ? tier : "free", stripe_subscription_id: sub.id, stripe_event_ts: created })
    .eq("stripe_customer_id", sub.customer)
    .or(`stripe_event_ts.is.null,stripe_event_ts.lt.${created}`)
    .select("id");
  if (updErr) throw updErr;
  // Loyalty streak anchor: stamp member_since on the FIRST paid activation only
  // (idempotent — `.is null` means a re-activation after cancel starts fresh).
  if (active) {
    await db.from("rollout_artists")
      .update({ member_since: new Date(created * 1000).toISOString() })
      .eq("stripe_customer_id", sub.customer)
      .is("member_since", null);
  }
  return (hit?.length ?? 0) > 0 ? "applied" : "stale";
}

// Route an already-parsed Stripe event. Returns { status, note }. Does NOT
// verify signatures or create clients — the caller does that.
export async function handleEvent(db, event) {
  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    const uid = s.client_reference_id;
    const created = Number(event.created) || 0;
    // Bind ONLY by the trusted client_reference_id (the signed-in uid). Checkout's
    // ONLY job is to bind the Stripe customer to this uid so subscription events
    // (matched by stripe_customer_id) can find the row. It never grants a plan or
    // advances the high-water mark, so a redelivered checkout can't re-grant a
    // cancelled plan or block a same-second subscription.created.
    if (uid) {
      const { data: bound } = await db.from("rollout_artists")
        .update({ stripe_customer_id: s.customer ?? null })
        .eq("id", uid).select("id");
      if ((bound?.length ?? 0) === 0) {
        // profile row not created yet — retry until the first app login upserts it
        const ageSec = Date.now() / 1000 - created;
        if (ageSec < 1800) return { status: 409, note: "profile not ready; retry" };
      }
    }
  } else if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    // First purchase fires .created (Stripe does NOT guarantee .updated), so both
    // must run the same price->tier logic.
    const created = Number(event.created) || 0;
    const res = await applySubscription(db, event.data.object, created);
    if (res === "unbound") {
      // Not bound yet (checkout hasn't landed) or unmapped active price. Ask Stripe
      // to retry for ~30m; a genuinely unbindable event dead-letters (200).
      const ageSec = Date.now() / 1000 - created;
      if (ageSec < 1800) return { status: 409, note: "customer not yet bound; retry" };
      console.warn("subscription event unbindable after 30m; dead-lettering", event.id);
    }
    // "stale" (reordered/redelivered older event) and "applied" → 200
  } else if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    const created = Number(event.created) || 0;
    // Clear the plan ONLY for the CURRENTLY-bound subscription, via the same atomic
    // high-water-mark guard. A late delete of an OLD sub (customer since
    // re-subscribed) matches 0 rows (sub id no longer bound); a reordered older
    // delete is dropped by the stripe_event_ts guard.
    const { data: cleared } = await db.from("rollout_artists")
      .update({ plan: "free", stripe_subscription_id: null, stripe_event_ts: created, member_since: null })
      .eq("stripe_customer_id", sub.customer)
      .eq("stripe_subscription_id", sub.id)
      .or(`stripe_event_ts.is.null,stripe_event_ts.lt.${created}`)
      .select("id");
    if ((cleared?.length ?? 0) === 0) {
      // Missed. If the customer isn't bound yet, retry (symmetric with the
      // subscription-event path) so a cancel that races AHEAD of checkout can't be
      // dropped and later resurrected by the delayed create. If the customer IS
      // bound, 0 rows means this delete is for an old/superseded sub or is stale —
      // correctly a no-op.
      const { data: cust } = await db.from("rollout_artists")
        .select("id").eq("stripe_customer_id", sub.customer).limit(1);
      if ((cust?.length ?? 0) === 0) {
        const ageSec = Date.now() / 1000 - created;
        if (ageSec < 1800) return { status: 409, note: "customer not yet bound; retry" };
      }
    }
  }
  return { status: 200, note: "ok" };
}
