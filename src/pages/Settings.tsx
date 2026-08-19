import { useEffect, useState } from "react";
import { Check, Compass, ExternalLink, Loader2, Mail, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTour } from "@/components/Tour";
import { useStore, FREE_SONG_LIMIT, PLAN_LABEL } from "@/store";
import { supabase } from "@/lib/supabase";

import { API_BASE as API } from "@/lib/api";

// Generic preset avatars for artists who don't want to upload a personal photo.
// Rendered as inline SVG gradient data-URIs (no upload, no storage) and stored
// straight into avatar_url, so they render everywhere a photo would.
const AVATAR_GRADS: [string, string][] = [
  ["#7c3aed", "#4f46e5"], ["#2563eb", "#06b6d4"], ["#059669", "#0d9488"],
  ["#db2777", "#7c3aed"], ["#f59e0b", "#ef4444"], ["#0ea5e9", "#6366f1"],
  ["#ec4899", "#f43f5e"], ["#f97316", "#eab308"],
];
const presetAvatar = (a: string, b: string) =>
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>` +
      `<rect width="128" height="128" fill="url(#g)"/>` +
      `<circle cx="44" cy="38" r="54" fill="rgba(255,255,255,0.14)"/>` +
    `</svg>`
  );
const PRESET_AVATARS = AVATAR_GRADS.map(([a, b]) => presetAvatar(a, b));

// BYO image providers — the artist's key, their bill, our $0.
// "free" group = the key itself costs nothing (free API tiers).
const IMG_PROVIDERS = [
  { key: "builtin", label: "Built-in", group: "free", hint: "" },
  { key: "aihorde", label: "AI Horde", group: "free", hint: "no key needed — free key at aihorde.net skips the queue" },
  { key: "gemini", label: "Google Gemini", group: "free", hint: "free key at aistudio.google.com/apikey" },
  { key: "huggingface", label: "Hugging Face", group: "free", hint: "free token at huggingface.co/settings/tokens" },
  { key: "cloudflare", label: "Cloudflare", group: "free", hint: "free token + account ID from dash.cloudflare.com (10k free/day)" },
  { key: "together", label: "Together AI", group: "paid", hint: "api key from api.together.ai (has a free FLUX model)" },
  { key: "replicate", label: "Replicate", group: "paid", hint: "api key from replicate.com/account" },
  { key: "stability", label: "Stability AI", group: "paid", hint: "api key from platform.stability.ai" },
  { key: "openai", label: "OpenAI", group: "paid", hint: "api key from platform.openai.com" },
  { key: "custom", label: "Custom endpoint", group: "paid", hint: "any OpenAI-compatible image API" },
];

// Short "how to get your key" tutorial per provider — a link + numbered steps.
const KEY_GUIDES: Record<string, { url: string; steps: string[] }> = {
  aihorde: { url: "https://aihorde.net/register", steps: ["Open aihorde.net/register", "Sign up (free, no card)", "Copy your API key"] },
  gemini: { url: "https://aistudio.google.com/apikey", steps: ["Open aistudio.google.com/apikey", "Sign in with Google", "Click “Create API key” and copy it"] },
  huggingface: { url: "https://huggingface.co/settings/tokens", steps: ["Open huggingface.co/settings/tokens", "New token → Read access", "Copy the token"] },
  cloudflare: { url: "https://dash.cloudflare.com/profile/api-tokens", steps: ["In dash.cloudflare.com, copy your Account ID (right sidebar)", "Profile → API Tokens → Create Token → Workers AI", "Paste the token + Account ID below"] },
  together: { url: "https://api.together.ai/settings/api-keys", steps: ["Open api.together.ai and sign up (free FLUX included)", "Settings → API Keys", "Copy your key"] },
  replicate: { url: "https://replicate.com/account/api-tokens", steps: ["Open replicate.com/account/api-tokens", "Copy your API token"] },
  stability: { url: "https://platform.stability.ai/account/keys", steps: ["Open platform.stability.ai", "Account → API Keys", "Copy your key"] },
  openai: { url: "https://platform.openai.com/api-keys", steps: ["Open platform.openai.com/api-keys", "Create new secret key", "Copy it"] },
  custom: { url: "", steps: ["Use any OpenAI-compatible image API", "Paste its API key and base URL below"] },
};

export type ImgConn = { provider: string; key: string; model: string; base_url: string };

export function loadImgConn(): ImgConn {
  try {
    return { provider: "builtin", key: "", model: "", base_url: "", ...JSON.parse(localStorage.getItem("rollout_imgconn") || "{}") };
  } catch {
    return { provider: "builtin", key: "", model: "", base_url: "" };
  }
}

// Stripe customer-portal login page: subscribers enter their email, get a magic
// link, and can update payment, view invoices, or cancel (at period end) — the
// compliant self-serve cancel path. Config: bpc_1U5ZmHRwEqAVdib6kLboeNMw.
const BILLING_PORTAL_URL = "https://billing.stripe.com/p/login/00w00lgJrcSXgT97X528800";

export default function App() {
  const { plan, songsUsed, release, session, cloud, signOut, openUpgrade, avatarUrl, updateAvatar, go } = useStore();
  const initials = (release?.artist || "R").slice(0, 2).toUpperCase();
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarErr, setAvatarErr] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Self-service account deletion: wipe content + auth identity via the RPC,
  // then sign out and drop to the landing with a clean local slate.
  const deleteAccount = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    if (!supabase) return;
    setDeleting(true);
    try { await supabase.rpc("rollout_delete_account"); } catch { /* still sign out below */ }
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    try { localStorage.clear(); } catch { /* ignore */ }
    window.location.href = "/";
  };
  const pickAvatar = async (file: File) => {
    if (!supabase || !session) return;
    if (!file.type.startsWith("image/")) { setAvatarErr("Please choose an image file."); return; }
    if (file.size > 5 * 1024 * 1024) { setAvatarErr("Image must be under 5MB."); return; }
    setAvatarBusy(true); setAvatarErr("");
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${session.user.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      await updateAvatar(data.publicUrl);
    } catch {
      setAvatarErr("Upload failed. Try again.");
    } finally {
      setAvatarBusy(false);
    }
  };
  const { start } = useTour();
  const [engineUp, setEngineUp] = useState<boolean | null>(null);
  const [conn, setConn] = useState<ImgConn>(loadImgConn);
  const [testState, setTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testMsg, setTestMsg] = useState("");

  // Set/change an account password. Works for Google sign-in accounts too —
  // Supabase adds a password to the existing account, so they can then sign in
  // with email + password from any device (not just the Google button).
  const [pw, setPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const savePassword = async () => {
    if (!supabase) return;
    if (pw.length < 8) { setPwMsg({ kind: "err", text: "Use at least 8 characters." }); return; }
    setPwBusy(true);
    setPwMsg(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwBusy(false);
    if (error) setPwMsg({ kind: "err", text: error.message });
    else {
      setPw("");
      setPwMsg({ kind: "ok", text: "Password set. You can now sign in with your email + password on any device." });
    }
  };

  const saveConn = (patch: Partial<ImgConn>) => {
    const next = { ...conn, ...patch };
    setConn(next);
    setTestState("idle");
    try { localStorage.setItem("rollout_imgconn", JSON.stringify(next)); } catch { /* ignore */ }
  };

  const testConn = async () => {
    setTestState("testing");
    setTestMsg("");
    try {
      const res = await fetch(`${API}/genimage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...conn, prompt: "abstract dark texture, test", size: 512, seed: 1 }),
      });
      if (res.ok) {
        setTestState("ok");
      } else {
        setTestState("fail");
        setTestMsg(await res.text());
      }
    } catch {
      setTestState("fail");
      setTestMsg("engine offline");
    }
  };

  useEffect(() => {
    fetch(`${API}/health`)
      .then((r) => setEngineUp(r.ok))
      .catch(() => setEngineUp(false));
  }, []);

  const TIER_PERKS: { label: string; need: "artist" | "studio" }[] = [
    { label: "Unlimited releases", need: "artist" },
    { label: "High-res 3000×3000 exports", need: "artist" },
    { label: "Captions + one-click posting", need: "artist" },
    { label: "Photo-to-cover modes", need: "artist" },
    { label: "Kinetic lyric videos + b-roll", need: "studio" },
    { label: "Ad Center", need: "studio" },
    { label: "Premium AI models (first access)", need: "studio" },
  ];

  return (
    <div className="min-h-screen flex flex-col flex-1">
      <div className="flex px-6 xl:px-12 pt-8 justify-end">
        <div className="font-mono rounded-full bg-[#15151C] text-[#9A96AD] text-xs leading-4 border-white/8 border-1 border-solid px-3 py-1.5">
          {engineUp === null ? "checking engine…" : engineUp ? "engine online" : "engine offline"}
        </div>
      </div>
      <div className="mx-auto flex w-full px-6 xl:px-12 pt-6 pb-12 flex-col gap-8 max-w-[860px]">
        <div className="flex flex-col gap-2">
          <h1 className="page-title text-[38px]">Settings</h1>
          <p className="text-[#9A96AD] text-sm leading-5">Plan, account, and your AI setup.</p>
        </div>

        {/* profile picture */}
        {cloud && session && (
          <div className="panel rounded-3xl p-6 flex flex-col gap-5">
            <div className="flex items-center gap-5">
              <div className="size-16 shrink-0 overflow-hidden rounded-full bg-[#1E1E28] border border-white/8 flex items-center justify-center">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <span className="font-medium text-[#9A96AD] text-lg">{initials}</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <span className="font-medium uppercase text-[#9A96AD] text-xs leading-4 tracking-[2.4px]">Profile picture</span>
                <div className="flex items-center gap-3">
                  <label className="btn-primary inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white">
                    {avatarBusy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                    {avatarUrl ? "Change photo" : "Upload photo"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) pickAvatar(f); e.currentTarget.value = ""; }}
                    />
                  </label>
                  {avatarUrl && (
                    <button onClick={() => updateAvatar("")} className="text-xs text-[#9A96AD] hover:text-[#F2F0F7] transition-colors">
                      Remove
                    </button>
                  )}
                </div>
                {avatarErr ? (
                  <span className="text-xs text-red-400">{avatarErr}</span>
                ) : (
                  <span className="font-mono text-[11px] text-[#5E5A72]">JPG or PNG, up to 5MB.</span>
                )}
              </div>
            </div>

            {/* generic presets — pick one instead of uploading a personal photo */}
            <div className="flex flex-col gap-2.5 border-t border-white/8 pt-4">
              <span className="font-mono text-[11px] uppercase tracking-wider text-[#5E5A72]">Or pick a preset</span>
              <div className="flex flex-wrap gap-2.5">
                {PRESET_AVATARS.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => updateAvatar(src)}
                    aria-label={`Preset avatar ${i + 1}`}
                    className={
                      "size-10 overflow-hidden rounded-full border-2 transition-transform hover:scale-110 " +
                      (avatarUrl === src ? "border-violet-400" : "border-transparent hover:border-white/25")
                    }
                  >
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* plan */}
        <div className="panel rounded-3xl p-6 flex flex-col gap-5">
          <span className="font-medium uppercase text-[#9A96AD] text-xs leading-4 tracking-[2.4px]">Plan</span>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="font-bold text-[#F2F0F7] text-2xl leading-8 tracking-tight">
                {PLAN_LABEL[plan]}
              </span>
              <span className="font-mono text-[#5E5A72] text-xs leading-4">
                {plan === "studio"
                  ? "$29/mo · everything unlocked"
                  : plan === "artist"
                  ? "$15/mo · unlimited releases"
                  : `${Math.max(0, FREE_SONG_LIMIT - songsUsed)} of ${FREE_SONG_LIMIT} free ${FREE_SONG_LIMIT === 1 ? "song" : "songs"} left`}
              </span>
            </div>
            {plan === "free" ? (
              <Button onClick={() => openUpgrade("Unlock the full rollout")} className="btn-primary rounded-xl text-white gap-2">
                <Sparkles className="size-4" />
                Upgrade
              </Button>
            ) : plan === "artist" ? (
              <Button onClick={() => openUpgrade("Step up to Studio")} className="btn-primary rounded-xl text-white gap-2">
                <Sparkles className="size-4" />
                Get Studio
              </Button>
            ) : null}
          </div>
          <div className="border-white/8 border-t-1 border-r-0 border-b-0 border-l-0 border-solid pt-5 flex flex-col gap-3">
            {TIER_PERKS.map(({ label, need }) => {
              const has = need === "artist" ? plan !== "free" : plan === "studio";
              return (
                <div key={label} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={"size-5 rounded-full flex justify-center items-center " + (has ? "bg-[#46E0A8]/15" : "bg-[#1E1E28]")}>
                      <Check className={"size-3 " + (has ? "text-[#46E0A8]" : "text-[#5E5A72]")} />
                    </div>
                    <span className={(has ? "text-[#F2F0F7]" : "text-[#9A96AD]") + " text-sm leading-5"}>{label}</span>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#5E5A72]">
                    {need === "artist" ? "Artist" : "Studio"}
                  </span>
                </div>
              );
            })}
          </div>
          <button onClick={() => go("Pricing")} className="self-start text-xs text-violet-400 hover:underline">
            Compare all plans →
          </button>
          {plan !== "free" && (
            <div className="border-white/8 border-t-1 border-r-0 border-b-0 border-l-0 border-solid pt-5 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-[#F2F0F7] text-sm leading-5">Manage subscription</span>
                <span className="font-mono text-[11px] text-[#5E5A72]">Update payment, view invoices, or cancel anytime.</span>
              </div>
              <a
                href={BILLING_PORTAL_URL}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-xl border border-white/12 px-4 py-2.5 text-sm font-medium text-[#F2F0F7] hover:border-white/25 hover:bg-white/[0.03] transition-colors inline-flex items-center gap-2"
              >
                Manage billing
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          )}
        </div>

        {/* password / account access */}
        {cloud && session && (
          <div className="panel rounded-3xl p-6 flex flex-col gap-4">
            <span className="font-medium uppercase text-[#9A96AD] text-xs leading-4 tracking-[2.4px]">Password</span>
            <p className="text-[#9A96AD] text-sm leading-5">
              Set a password to sign in with your email on any device.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && savePassword()}
                placeholder="New password (8+ characters)"
                aria-label="New password"
                autoComplete="new-password"
                className="flex-1 rounded-xl bg-[#1E1E28] border border-white/10 px-4 py-3 text-sm text-neutral-50 placeholder:text-[#5E5A72] focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
              <Button
                onClick={savePassword}
                disabled={pwBusy || pw.length < 8}
                className="btn-primary rounded-xl text-white h-12 px-6 disabled:opacity-40"
              >
                {pwBusy ? "Saving…" : "Set password"}
              </Button>
            </div>
            {pwMsg && (
              <p className={"text-sm " + (pwMsg.kind === "ok" ? "text-[#46E0A8]" : "text-red-400")}>{pwMsg.text}</p>
            )}
            <p className="font-mono text-[11px] text-[#5E5A72]">Signed in as {session.user.email}</p>
          </div>
        )}

        {/* current release */}
        <div className="panel rounded-3xl p-6 flex flex-col gap-4">
          <span className="font-medium uppercase text-[#9A96AD] text-xs leading-4 tracking-[2.4px]">Current release</span>
          {release ? (
            <div className="flex flex-col gap-1">
              <span className="font-bold text-[#F2F0F7] text-lg leading-7 tracking-tight">
                {release.title} — {release.artist}
              </span>
              <span className="font-mono text-[#5E5A72] text-xs leading-4">
                {release.key} · {release.bpm} BPM · {release.duration}
                {release.lyrics ? " · lyrics imported" : " · no lyrics yet"}
              </span>
            </div>
          ) : (
            <span className="text-[#9A96AD] text-sm leading-5">No release yet — import a track to start.</span>
          )}
        </div>

        {/* AI image connections */}
        <div className="panel rounded-3xl p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <span className="font-medium uppercase text-[#9A96AD] text-xs leading-4 tracking-[2.4px]">
              AI image generator
            </span>
            <span className="font-mono text-[11px] text-[#5E5A72]">your key · your account · never stored</span>
          </div>
          <p className="-mt-2 text-[#9A96AD] text-sm leading-6">
            The built-in generator is free. Add your own key for instant, unlimited covers — it stays on your device and is never stored.
          </p>
          {(["free", "paid"] as const).map((grp) => (
            <div key={grp} className="flex flex-col gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#5E5A72]">
                {grp === "free" ? "Free" : "Your paid account"}
              </span>
              <div className="flex flex-wrap gap-2">
                {IMG_PROVIDERS.filter((p) => p.group === grp).map((p) => (
                  <button
                    key={p.key}
                    onClick={() => saveConn({ provider: p.key })}
                    className={
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                      (conn.provider === p.key
                        ? "border-violet-500 bg-violet-500/15 text-[#F2F0F7]"
                        : "border-white/10 text-[#9A96AD] hover:border-white/20")
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {conn.provider !== "builtin" && (
            <div className="flex flex-col gap-2.5">
              {KEY_GUIDES[conn.provider] && (
                <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-[#F2F0F7]">How to get your key</span>
                    {KEY_GUIDES[conn.provider].url && (
                      <a href={KEY_GUIDES[conn.provider].url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] font-medium text-violet-300 hover:text-violet-200">
                        Open <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                  <ol className="mt-2 flex flex-col gap-1.5">
                    {KEY_GUIDES[conn.provider].steps.map((s, i) => (
                      <li key={i} className="flex gap-2.5 text-[12px] leading-5 text-[#9A96AD]">
                        <span className="font-mono text-[11px] text-violet-300">{i + 1}.</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <input
                type="password"
                value={conn.key}
                onChange={(e) => saveConn({ key: e.target.value })}
                placeholder={conn.provider === "aihorde" ? "API key (optional — anonymous works)" : "API key"}
                className="rounded-xl panel-inset px-3 py-2 font-mono text-sm text-neutral-50 placeholder:text-[#5E5A72] focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
              <div className="flex gap-2.5">
                <input
                  value={conn.model}
                  onChange={(e) => saveConn({ model: e.target.value })}
                  placeholder="model (optional — sensible default used)"
                  className="flex-1 rounded-xl panel-inset px-3 py-2 font-mono text-sm text-neutral-50 placeholder:text-[#5E5A72] focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                />
                {(conn.provider === "custom" || conn.provider === "cloudflare") && (
                  <input
                    value={conn.base_url}
                    onChange={(e) => saveConn({ base_url: e.target.value })}
                    placeholder={conn.provider === "cloudflare" ? "Cloudflare account ID" : "https://api.yourprovider.com/v1"}
                    className="flex-1 rounded-xl panel-inset px-3 py-2 font-mono text-sm text-neutral-50 placeholder:text-[#5E5A72] focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                  />
                )}
              </div>
              <p className="font-mono text-[11px] text-[#5E5A72]">
                Custom endpoint = any OpenAI-compatible image API (OpenArt, Higgsfield API access, gateways).
              </p>

              <div className="flex items-start gap-2.5 rounded-xl border border-[#46E0A8]/20 bg-[#46E0A8]/[0.04] px-3.5 py-2.5">
                <ShieldCheck className="size-4 shrink-0 text-[#46E0A8]" />
                <span className="text-[12px] leading-5 text-[#9A96AD]">Saved only in this browser and used once per generation to call your provider. Never logged or stored on our side.</span>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={testConn}
              disabled={testState === "testing"}
              className="border border-white/8 text-[#9A96AD] hover:text-[#F2F0F7] rounded-xl gap-2 disabled:opacity-40"
            >
              {testState === "testing" ? "Testing…" : "Test connection"}
            </Button>
            {testState === "ok" && <span className="font-mono text-xs text-[#46E0A8]">● works — covers will use this</span>}
            {testState === "fail" && <span className="font-mono text-xs text-[#F0A45B] truncate max-w-xs" title={testMsg}>● failed: {testMsg.slice(0, 60) || "check the key"}</span>}
          </div>
        </div>

        {/* account */}
        {cloud && session && (
          <div className="panel rounded-3xl p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="font-medium uppercase text-[#9A96AD] text-xs leading-4 tracking-[2.4px]">Account</span>
                <span className="font-mono text-[#5E5A72] text-xs leading-4">{session.user.email}</span>
              </div>
              <Button variant="ghost" onClick={signOut} className="border border-white/8 text-[#9A96AD] hover:text-[#F2F0F7] rounded-xl">
                Sign out
              </Button>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-white/8 pt-5">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-[#F2F0F7]">Delete account</span>
                <span className="font-mono text-[11px] text-[#5E5A72]">
                  {confirmDelete
                    ? "This permanently deletes your account and all content. This can't be undone."
                    : "Permanently remove your account and everything in it."}
                </span>
              </div>
              <button
                onClick={deleteAccount}
                onMouseLeave={() => !deleting && setConfirmDelete(false)}
                disabled={deleting}
                className={
                  "shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors " +
                  (confirmDelete
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "border border-red-500/40 text-red-400 hover:bg-red-500/10")
                }
              >
                {deleting ? <Loader2 className="size-4 animate-spin" /> : confirmDelete ? "Yes, delete forever" : "Delete account"}
              </button>
            </div>
          </div>
        )}

        {/* help & about */}
        <div className="panel rounded-3xl p-6 flex flex-col gap-5">
          <span className="font-medium uppercase text-[#9A96AD] text-xs leading-4 tracking-[2.4px]">Help &amp; about</span>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" onClick={start} className="border border-white/8 text-[#9A96AD] hover:text-[#F2F0F7] gap-2 rounded-xl">
              <Compass className="size-4" />
              Replay the product tour
            </Button>
            <Button
              variant="ghost"
              onClick={() => { window.location.href = "mailto:support@th3circle.app?subject=Rollout%20support"; }}
              className="border border-white/8 text-[#9A96AD] hover:text-[#F2F0F7] gap-2 rounded-xl"
            >
              <Mail className="size-4" />
              Contact support
            </Button>
          </div>
          <div className="border-white/8 border-t-1 border-r-0 border-b-0 border-l-0 border-solid pt-4 flex flex-col gap-1">
            <span className="font-mono text-[#5E5A72] text-xs leading-4">Rollout v0.1.0 · a Th3Circle product</span>
            <span className="font-mono text-[#5E5A72] text-xs leading-4">Terms &amp; privacy ship with the public launch.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
