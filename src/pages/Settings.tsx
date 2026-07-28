import { useEffect, useState } from "react";
import { Check, Compass, Mail, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTour } from "@/components/Tour";
import { useStore, FREE_SONG_LIMIT } from "@/store";

const API = "http://127.0.0.1:8000";

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

export type ImgConn = { provider: string; key: string; model: string; base_url: string };

export function loadImgConn(): ImgConn {
  try {
    return { provider: "builtin", key: "", model: "", base_url: "", ...JSON.parse(localStorage.getItem("rollout_imgconn") || "{}") };
  } catch {
    return { provider: "builtin", key: "", model: "", base_url: "" };
  }
}

export default function App() {
  const { plan, setPlan, songsUsed, release } = useStore();
  const { start } = useTour();
  const [engineUp, setEngineUp] = useState<boolean | null>(null);
  const [conn, setConn] = useState<ImgConn>(loadImgConn);
  const [testState, setTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testMsg, setTestMsg] = useState("");

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

  const PRO_PERKS = [
    "Unlimited releases",
    "High-res 3000×3000 exports",
    "Caption copying + one-click posting",
    "Kinetic lyric videos",
    "Ad Center",
  ];

  return (
    <div className="min-h-screen flex flex-col flex-1">
      <div className="flex px-6 xl:px-12 pt-8 justify-end">
        <div className="font-mono rounded-full bg-[#15151C] text-[#9A96AD] text-xs leading-4 border-white/8 border-1 border-solid px-3 py-1.5">
          {engineUp === null ? "checking engine…" : engineUp ? "engine online" : "engine offline"}
        </div>
      </div>
      <div className="flex px-6 xl:px-12 pt-6 pb-12 flex-col gap-8 max-w-[720px]">
        <div className="flex flex-col gap-2">
          <h1 className="font-bold text-[#F2F0F7] text-4xl leading-10 tracking-tight">Settings</h1>
          <p className="text-[#9A96AD] text-sm leading-5">Your plan, usage, and engine status.</p>
        </div>

        {/* plan */}
        <div className="edge rounded-2xl bg-[#15151C] border-white/8 border-1 border-solid p-6 flex flex-col gap-5">
          <span className="font-medium uppercase text-[#9A96AD] text-xs leading-4 tracking-[2.4px]">Plan</span>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="font-bold text-[#F2F0F7] text-2xl leading-8 tracking-tight">
                {plan === "pro" ? "Rollout Pro" : "Free"}
              </span>
              <span className="font-mono text-[#5E5A72] text-xs leading-4">
                {plan === "pro"
                  ? "$12/mo · unlimited releases"
                  : `${Math.max(0, FREE_SONG_LIMIT - songsUsed)} of ${FREE_SONG_LIMIT} free ${FREE_SONG_LIMIT === 1 ? "song" : "songs"} left`}
              </span>
            </div>
            {plan === "pro" ? (
              <Button variant="ghost" onClick={() => setPlan("free")} className="text-[#9A96AD] border border-white/8 rounded-xl">
                Cancel Pro
              </Button>
            ) : (
              <Button onClick={() => setPlan("pro")} className="rounded-xl bg-violet-500 hover:bg-[#7c4dec] text-white gap-2">
                <Sparkles className="size-4" />
                Go Pro
              </Button>
            )}
          </div>
          <div className="border-white/8 border-t-1 border-r-0 border-b-0 border-l-0 border-solid pt-5 flex flex-col gap-3">
            {PRO_PERKS.map((p) => (
              <div key={p} className="flex items-center gap-3">
                <div className={"size-5 rounded-full flex justify-center items-center " + (plan === "pro" ? "bg-[#46E0A8]/15" : "bg-[#1E1E28]")}>
                  <Check className={"size-3 " + (plan === "pro" ? "text-[#46E0A8]" : "text-[#5E5A72]")} />
                </div>
                <span className={(plan === "pro" ? "text-[#F2F0F7]" : "text-[#9A96AD]") + " text-sm leading-5"}>{p}</span>
              </div>
            ))}
          </div>
        </div>

        {/* current release */}
        <div className="edge rounded-2xl bg-[#15151C] border-white/8 border-1 border-solid p-6 flex flex-col gap-4">
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
        <div className="edge rounded-2xl bg-[#15151C] border-white/8 border-1 border-solid p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <span className="font-medium uppercase text-[#9A96AD] text-xs leading-4 tracking-[2.4px]">
              AI image generator
            </span>
            <span className="font-mono text-[11px] text-[#5E5A72]">your key · your account · never stored</span>
          </div>
          <p className="text-[#9A96AD] text-sm leading-5 -mt-2">
            Covers use our free built-in generator by default. Gemini and Hugging Face keys are also
            free — grab one in two minutes. If a provider ever fails, Rollout falls back to the built-in automatically.
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
          {(() => {
            const cur = IMG_PROVIDERS.find((p) => p.key === conn.provider);
            return cur?.hint ? (
              <p className="font-mono text-[11px] text-[#5E5A72] -mt-1">→ {cur.hint}</p>
            ) : null;
          })()}
          {conn.provider !== "builtin" && (
            <div className="flex flex-col gap-2.5">
              <input
                type="password"
                value={conn.key}
                onChange={(e) => saveConn({ key: e.target.value })}
                placeholder={conn.provider === "aihorde" ? "API key (optional — anonymous works)" : "API key"}
                className="rounded-lg bg-[#1E1E28] border border-white/10 px-3 py-2 font-mono text-sm text-neutral-50 placeholder:text-[#5E5A72] focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
              <div className="flex gap-2.5">
                <input
                  value={conn.model}
                  onChange={(e) => saveConn({ model: e.target.value })}
                  placeholder="model (optional — sensible default used)"
                  className="flex-1 rounded-lg bg-[#1E1E28] border border-white/10 px-3 py-2 font-mono text-sm text-neutral-50 placeholder:text-[#5E5A72] focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                />
                {(conn.provider === "custom" || conn.provider === "cloudflare") && (
                  <input
                    value={conn.base_url}
                    onChange={(e) => saveConn({ base_url: e.target.value })}
                    placeholder={conn.provider === "cloudflare" ? "Cloudflare account ID" : "https://api.yourprovider.com/v1"}
                    className="flex-1 rounded-lg bg-[#1E1E28] border border-white/10 px-3 py-2 font-mono text-sm text-neutral-50 placeholder:text-[#5E5A72] focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                  />
                )}
              </div>
              <p className="font-mono text-[11px] text-[#5E5A72]">
                Custom endpoint = any OpenAI-compatible image API (OpenArt, Higgsfield API access, gateways).
              </p>
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

        {/* help & about */}
        <div className="edge rounded-2xl bg-[#15151C] border-white/8 border-1 border-solid p-6 flex flex-col gap-5">
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
