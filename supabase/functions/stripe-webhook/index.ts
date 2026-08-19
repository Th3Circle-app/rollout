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

    // Save the subscriber into the Resend audience (email list for lifecycle
    // marketing). Isolated + best-effort: a Resend failure never affects the
    // webhook's response to Stripe.
    if (event.type === "checkout.session.completed") {
      const email = event.data?.object?.customer_details?.email;
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const audienceId = Deno.env.get("RESEND_AUDIENCE_ID");
      if (email && resendKey && audienceId) {
        try {
          const name = event.data?.object?.customer_details?.name ?? "";
          const [firstName, ...rest] = String(name).trim().split(/\s+/);
          await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              email,
              first_name: firstName || undefined,
              last_name: rest.join(" ") || undefined,
              unsubscribed: false,
            }),
          });
        } catch (e) {
          console.error("resend contact add failed (non-fatal)", e);
        }
      }
    }

    // Trial-ending reminder — Stripe fires this ~3 days before a trial converts.
    // Email the user so the auto-charge is never a surprise (subscription
    // compliance). Best-effort; never fails the webhook.
    if (event.type === "customer.subscription.trial_will_end") {
      try {
        const sub = event.data?.object;
        const { data: rows } = await db.from("rollout_artists").select("email").eq("stripe_customer_id", sub?.customer).limit(1);
        const email = rows?.[0]?.email;
        let resendKey = Deno.env.get("RESEND_API_KEY");
        if (!resendKey) {
          const { data: cfg } = await db.from("rollout_config").select("value").eq("key", "resend_api_key").limit(1);
          resendKey = cfg?.[0]?.value;
        }
        if (email && resendKey) {
          const trialEnd = sub?.trial_end
            ? new Date(sub.trial_end * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric" })
            : "soon";
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "Rollout <support@xkaii.com>",
              to: [email],
              reply_to: "support@xkaii.com",
              subject: "Your Rollout trial ends soon",
              text: `Hi,\n\nYour Rollout trial ends on ${trialEnd}. After that it moves to the Artist plan at $15/month, billed automatically.\n\nWant to keep going? You're all set, no action needed.\nWant to stop? Cancel anytime before your trial ends from Settings and you won't be charged.\n\nManage your plan: https://rollout.th3circle.app/?page=Settings\n\n— Rollout`,
            }),
          });
        }
      } catch (e) {
        console.error("trial reminder failed (non-fatal)", e);
      }
    }

    return new Response(note, { status });
  } catch (e) {
    console.error("webhook handling failed", e);
    return new Response("error", { status: 500 });
  }
});
