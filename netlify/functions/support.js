// Emails a support message to support@xkaii.com via Resend.
// RESEND_API_KEY is a Netlify env secret (functions scope). xkaii.com is a
// verified Resend sending domain, so we send from support@xkaii.com and set the
// user's address as reply-to so replies go straight back to them.
export default async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return json({ ok: false, error: "email not configured" }, 500);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad request" }, 400);
  }

  const message = String(body.message || "").slice(0, 5000).trim();
  const email = String(body.email || "").slice(0, 200).trim();
  if (!message) return json({ ok: false, error: "empty message" }, 400);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Rollout Support <support@xkaii.com>",
        to: ["support@xkaii.com"],
        reply_to: email || undefined,
        subject: `Rollout support — ${email || "unknown user"}`,
        text: `New support message from Rollout\n\nFrom: ${email || "unknown"}\n\n${message}`,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return json({ ok: false, error: t.slice(0, 200) }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e).slice(0, 200) }, 502);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
