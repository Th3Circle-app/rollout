// Dependency-free Node red-team suite for the Stripe webhook's event-ordering
// logic (supabase/functions/stripe-webhook/logic.mjs). Deno is not installed;
// this runs under plain `node`. It stands up an in-memory mock that mirrors the
// EXACT Supabase query chain the webhook uses, then replays the reordering /
// redelivery races Stripe inflicts and asserts the final row state.
//
//   node tools/redteam/webhook_test.mjs
//
// Exits 1 if any scenario fails.

import { handleEvent, applySubscription } from "../../supabase/functions/stripe-webhook/logic.mjs";

// ---- in-memory mock of the Supabase query chain -----------------------------
// Supports exactly:
//   db.from(t).update(patch).eq(c,v).or(filter).select(cols)
//   db.from(t).update(patch).eq(c,v).eq(c2,v2).or(filter).select(cols)
//   db.from(t).select(cols).eq(c,v).limit(n)
// Each builder is awaitable (thenable) and resolves to { data, error }.
// UPDATE applies the patch to rows matching ALL .eq filters AND the .or ordering
// filter, then returns the affected rows via .select. SELECT returns matches.

class Query {
  constructor(rows) {
    this.rows = rows;          // live reference to the table's row array
    this.op = null;            // 'update' | 'select'
    this.patch = null;
    this.eqs = [];             // [{ col, val }]
    this.orFilter = null;
    this.limitN = null;
    this.selectCols = null;
  }
  update(patch) { this.op = "update"; this.patch = patch; return this; }
  select(cols) { if (!this.op) this.op = "select"; this.selectCols = cols; return this; }
  eq(col, val) { this.eqs.push({ col, val }); return this; }
  or(filter) { this.orFilter = filter; return this; }
  limit(n) { this.limitN = n; return this; }

  _matchEqs(row) {
    return this.eqs.every(({ col, val }) => row[col] === val);
  }
  // Evaluate a PostgREST .or() string: comma-joined `col.op.value` conditions,
  // OR'd together. We only implement the two operators the webhook uses:
  //   `<col>.is.null`  and  `<col>.lt.<number>`
  _matchOr(row) {
    if (!this.orFilter) return true;
    return this.orFilter.split(",").some((cond) => {
      const dot1 = cond.indexOf(".");
      const dot2 = cond.indexOf(".", dot1 + 1);
      const col = cond.slice(0, dot1);
      const op = cond.slice(dot1 + 1, dot2);
      const valStr = cond.slice(dot2 + 1);
      const cell = row[col];
      if (op === "is" && valStr === "null") return cell === null || cell === undefined;
      if (op === "lt") return cell !== null && cell !== undefined && Number(cell) < Number(valStr);
      throw new Error("mock db: unsupported .or() condition: " + cond);
    });
  }
  _pick(row) {
    if (!this.selectCols) return { ...row };
    const out = {};
    for (const c of this.selectCols.split(",").map((s) => s.trim())) out[c] = row[c];
    return out;
  }
  _exec() {
    if (this.op === "update") {
      // Match BEFORE mutating so the ordering guard reads pre-patch state.
      const affected = this.rows.filter((r) => this._matchEqs(r) && this._matchOr(r));
      for (const r of affected) Object.assign(r, this.patch);
      const data = this.selectCols ? affected.map((r) => this._pick(r)) : null;
      return { data, error: null };
    }
    // select
    let matched = this.rows.filter((r) => this._matchEqs(r) && this._matchOr(r));
    if (this.limitN != null) matched = matched.slice(0, this.limitN);
    return { data: matched.map((r) => this._pick(r)), error: null };
  }
  then(resolve, reject) {
    try { resolve(this._exec()); } catch (e) { reject(e); }
  }
}

function makeDb(rows) {
  return {
    from(table) {
      if (table !== "rollout_artists") throw new Error("mock db: unknown table " + table);
      return new Query(rows);
    },
  };
}

// ---- event builders ---------------------------------------------------------
const PRICE_STUDIO_MONTHLY = "price_1TyGq5RwEqAVdib6I5FnGqPk";
const PRICE_UNMAPPED = "price_NOT_IN_MAP_deadbeef";
const NOW = Math.floor(Date.now() / 1000); // keep events "recent" so 30m retry window applies

const checkout = (uid, customer, created) => ({
  type: "checkout.session.completed",
  created,
  data: { object: { client_reference_id: uid, customer } },
});
const subEvent = (kind, { customer, subId, status = "active", price = PRICE_STUDIO_MONTHLY, created }) => ({
  type: "customer.subscription." + kind, // created | updated | deleted
  created,
  data: { object: { id: subId, customer, status, items: { data: [{ price: { id: price } }] } } },
});

// ---- tiny assertion harness -------------------------------------------------
let failures = 0;
function eq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Every handleEvent is async; run the suite sequentially inside one async main.
async function main() {
  // (a) Normal happy path: checkout binds customer, then created(active studio) → studio
  await runScenario("(a) normal: checkout then created(active studio) → studio", async () => {
    const rows = [{ id: "u1", plan: "free", stripe_customer_id: null, stripe_subscription_id: null, stripe_event_ts: null }];
    const db = makeDb(rows);
    const r1 = await handleEvent(db, checkout("u1", "cus_1", NOW));
    eq(r1.status, 200, "checkout status");
    eq(rows[0].stripe_customer_id, "cus_1", "customer bound");
    const r2 = await handleEvent(db, subEvent("created", { customer: "cus_1", subId: "sub_1", created: NOW + 1 }));
    eq(r2.status, 200, "created status");
    eq(rows[0].plan, "studio", "plan");
    eq(rows[0].stripe_subscription_id, "sub_1", "sub id");
    eq(rows[0].stripe_event_ts, NOW + 1, "high-water mark");
  });

  // (b) Sub-before-checkout: created is unbound → 409; then checkout; retry → applied
  await runScenario("(b) sub before checkout → 409, then checkout, retry → applied", async () => {
    const rows = [{ id: "u1", plan: "free", stripe_customer_id: null, stripe_subscription_id: null, stripe_event_ts: null }];
    const db = makeDb(rows);
    const created = subEvent("created", { customer: "cus_1", subId: "sub_1", created: NOW });
    const r1 = await handleEvent(db, created);
    eq(r1.status, 409, "unbound created retries");
    eq(rows[0].plan, "free", "plan untouched while unbound");
    const rC = await handleEvent(db, checkout("u1", "cus_1", NOW));
    eq(rC.status, 200, "checkout status");
    const r2 = await handleEvent(db, created); // Stripe redelivers the same created event
    eq(r2.status, 200, "retry applies");
    eq(rows[0].plan, "studio", "plan after retry");
    eq(rows[0].stripe_event_ts, NOW, "hwm after retry");
  });

  // (c) Cancel then stale reactivation: deleted(T3)→free; redelivered updated(T2<T3)→stale, stays free
  await runScenario("(c) cancel(T3) then reordered older updated(T2) → stays free", async () => {
    const rows = [{ id: "u1", plan: "studio", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", stripe_event_ts: NOW + 1 }];
    const db = makeDb(rows);
    const T3 = NOW + 3, T2 = NOW + 2;
    const rDel = await handleEvent(db, subEvent("deleted", { customer: "cus_1", subId: "sub_1", status: "canceled", created: T3 }));
    eq(rDel.status, 200, "delete status");
    eq(rows[0].plan, "free", "plan free after cancel");
    eq(rows[0].stripe_event_ts, T3, "hwm advanced to T3");
    // Stripe redelivers an OLDER active update (T2 < T3). Must NOT resurrect the plan.
    const res = await applySubscription(db, subEvent("updated", { customer: "cus_1", subId: "sub_1", created: T2 }).data.object, T2);
    eq(res, "stale", "older update is stale");
    eq(rows[0].plan, "free", "plan stays free");
    eq(rows[0].stripe_event_ts, T3, "hwm unchanged");
  });

  // (d) Re-subscribe then late delete of OLD sub A: 0 rows, plan B survives
  await runScenario("(d) resubscribe, then late delete of old sub A → new plan survives", async () => {
    const rows = [{ id: "u1", plan: "free", stripe_customer_id: "cus_1", stripe_subscription_id: null, stripe_event_ts: null }];
    const db = makeDb(rows);
    const T1 = NOW, T2 = NOW + 1, T3 = NOW + 2, T4 = NOW + 3;
    await handleEvent(db, subEvent("created", { customer: "cus_1", subId: "sub_A", created: T1 }));
    await handleEvent(db, subEvent("deleted", { customer: "cus_1", subId: "sub_A", status: "canceled", created: T2 }));
    await handleEvent(db, subEvent("created", { customer: "cus_1", subId: "sub_B", created: T3 }));
    eq(rows[0].plan, "studio", "plan studio on sub_B");
    eq(rows[0].stripe_subscription_id, "sub_B", "bound to sub_B");
    // Late delete of the OLD sub A arrives now (id no longer bound → 0 rows).
    const rLate = await handleEvent(db, subEvent("deleted", { customer: "cus_1", subId: "sub_A", status: "canceled", created: T4 }));
    eq(rLate.status, 200, "late delete ack (bound customer, wrong sub → no-op)");
    eq(rows[0].plan, "studio", "plan B survives late delete of A");
    eq(rows[0].stripe_subscription_id, "sub_B", "still bound to sub_B");
    eq(rows[0].stripe_event_ts, T3, "hwm still at sub_B create");
  });

  // (e) Same-second: checkout(T1) then created(created=T1) → plan set (is.null guard, not lt)
  await runScenario("(e) same-second checkout(T1) + created(T1) → plan set", async () => {
    const rows = [{ id: "u1", plan: "free", stripe_customer_id: null, stripe_subscription_id: null, stripe_event_ts: null }];
    const db = makeDb(rows);
    const T1 = NOW;
    await handleEvent(db, checkout("u1", "cus_1", T1));
    const r = await handleEvent(db, subEvent("created", { customer: "cus_1", subId: "sub_1", created: T1 }));
    eq(r.status, 200, "created status");
    eq(rows[0].plan, "studio", "plan set despite equal timestamp");
    eq(rows[0].stripe_event_ts, T1, "hwm at T1");
  });

  // (f) Unmapped active price → unbound (retry / 409), NOT silently free
  await runScenario("(f) unmapped active price → retry, plan NOT downgraded", async () => {
    const rows = [{ id: "u1", plan: "studio", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", stripe_event_ts: NOW }];
    const db = makeDb(rows);
    const evt = subEvent("updated", { customer: "cus_1", subId: "sub_1", price: PRICE_UNMAPPED, created: NOW + 1 });
    const res = await applySubscription(db, evt.data.object, NOW + 1);
    eq(res, "unbound", "unmapped active price → unbound");
    const r = await handleEvent(db, evt);
    eq(r.status, 409, "config drift retries");
    eq(rows[0].plan, "studio", "paying customer NOT stranded on free");
    eq(rows[0].stripe_event_ts, NOW, "hwm untouched");
  });

  // (g) Duplicate / redelivered identical event → idempotent no-op
  await runScenario("(g) duplicate identical created event → idempotent no-op", async () => {
    const rows = [{ id: "u1", plan: "free", stripe_customer_id: "cus_1", stripe_subscription_id: null, stripe_event_ts: null }];
    const db = makeDb(rows);
    const evt = subEvent("created", { customer: "cus_1", subId: "sub_1", created: NOW });
    const r1 = await handleEvent(db, evt);
    eq(r1.status, 200, "first delivery status");
    eq(rows[0].plan, "studio", "plan after first");
    const before = JSON.stringify(rows[0]);
    const res2 = await applySubscription(db, evt.data.object, NOW); // exact redelivery
    eq(res2, "stale", "redelivery is stale (no-op)");
    const r2 = await handleEvent(db, evt);
    eq(r2.status, 200, "redelivery acked 200");
    eq(JSON.stringify(rows[0]), before, "row byte-identical after redelivery");
  });

  if (failures > 0) {
    console.log(`\n${failures} scenario(s) FAILED`);
    process.exit(1);
  }
  console.log("\nAll scenarios PASS");
}

// Run one scenario, awaiting its async body and recording pass/fail.
async function runScenario(name, fn) {
  try {
    await fn();
    console.log("PASS  " + name);
  } catch (e) {
    failures++;
    console.log("FAIL  " + name + "\n        " + e.message);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
