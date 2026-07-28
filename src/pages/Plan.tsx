import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Check,
  Copy,
  Layers,
  Link2,
  Loader2,
  Lock,
  Package,
  Settings,
  Upload,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";

const API = "http://127.0.0.1:8000";

type Caption = {
  id: string;
  phase: "pre-release" | "release-day" | "post-release";
  platform: string;
  label: string;
  text: string;
};

const PHASE_STYLE: Record<string, string> = {
  "pre-release": "text-[#9A96AD] bg-[#1E1E28]",
  "release-day": "text-[#F2F0F7] bg-violet-500/15",
  "post-release": "text-[#46E0A8] bg-[#46E0A8]/10",
};

// Calendar offsets (days relative to release) per caption id
const SCHEDULE: Record<string, number> = {
  announce: -7,
  countdown: -3,
  behind: -1,
  dropday: 0,
  dropday_short: 0,
  post1: 3,
  thanks: 7,
};

function fmtDay(base: Date | null, offset: number) {
  if (!base) return offset === 0 ? "Drop day" : offset < 0 ? `T${offset}` : `T+${offset}`;
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function App() {
  const {
    release, plan, openUpgrade,
    releaseDate: date, setReleaseDate: setDate,
    streamingLink: link, setStreamingLink: setLink,
  } = useStore();
  const r = release ?? {
    filename: "Fail Safe Xkaii.wav",
    title: "Fail Safe",
    artist: "Xkaii",
    key: "C minor",
    bpm: 99,
    duration: "3:56",
    moods: ["emotional", "moody", "driving"],
    keywords: ["dramatic light", "deep shadow", "film grain"],
  };
  const [caps, setCaps] = useState<Caption[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [copiedId, setCopiedId] = useState("");

  const releaseDate = useMemo(() => {
    const d = new Date(date);
    return date && !isNaN(d.getTime()) ? d : null;
  }, [date]);

  // Real caption generation from the actual vibe; link injects live (Step 6).
  // Debounced so typing in the link field doesn't fire a request per keystroke.
  useEffect(() => {
    let dead = false;
    setLoading(true);
    setErr("");
    const t = setTimeout(() => {
      fetch(`${API}/captions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: r.title,
          artist: r.artist,
          moods: r.moods,
          keywords: r.keywords,
          lyrics: (release?.lyrics ?? ""),
          date: releaseDate
            ? releaseDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : "",
          link,
        }),
      })
        .then((res) => res.json())
        .then((j) => { if (!dead) setCaps(j.captions); })
        .catch(() => { if (!dead) setErr("Caption engine offline — start the backend."); })
        .finally(() => { if (!dead) setLoading(false); });
    }, 400);
    return () => { dead = true; clearTimeout(t); };
  }, [r.title, r.artist, link, releaseDate]);

  const copy = async (c: Caption) => {
    // Doc freemium spec: text copying is paywalled.
    if (plan !== "pro") {
      openUpgrade("Copy captions to clipboard");
      return;
    }
    await navigator.clipboard.writeText(c.text);
    setCopiedId(c.id);
    setTimeout(() => setCopiedId(""), 1400);
  };

  // One-click publishing hand-off: caption to clipboard, platform opens.
  const SOCIALS: { key: string; label: string; url: (text: string) => string }[] = [
    { key: "tiktok", label: "TikTok", url: () => "https://www.tiktok.com/tiktokstudio/upload" },
    { key: "ig", label: "Reels", url: () => "https://www.instagram.com/" },
    { key: "x", label: "X", url: (text) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}` },
    { key: "yt", label: "Shorts", url: () => "https://studio.youtube.com/" },
  ];

  const handOff = async (c: Caption, s: (typeof SOCIALS)[number]) => {
    if (plan !== "pro") {
      openUpgrade("One-click posting to your socials");
      return;
    }
    await navigator.clipboard.writeText(c.text);
    setCopiedId(c.id);
    setTimeout(() => setCopiedId(""), 1400);
    window.open(s.url(c.text), "_blank");
  };

  const sorted = [...caps].sort(
    (a, b) => (SCHEDULE[a.id] ?? 0) - (SCHEDULE[b.id] ?? 0)
  );
  const linkLive = link.trim().length > 0;

  return (
    <div className="text-neutral-50 min-h-screen">
      {/* main */}
      <div className="overflow-y-auto flex-1 h-screen">
        <div className="flex px-6 xl:px-12 pt-8 justify-between items-center">
          <div className="text-[#9A96AD] text-sm">
            Releases<span className="text-[#9A96AD]/50 mx-1">/</span>{r.title}
            <span className="text-[#9A96AD]/50 mx-1">/</span>
            <span className="text-neutral-50">Release Plan</span>
          </div>
          <div className={"font-mono rounded-full text-xs border-1 border-solid px-3 py-1.5 " + (linkLive ? "border-[#46E0A8]/40 text-[#46E0A8] bg-[#46E0A8]/5" : "border-white/10 text-[#9A96AD] bg-[#15151C]")}>
            {linkLive ? "● link live — injected into all captions" : "○ waiting on streaming link"}
          </div>
        </div>

        <div className="px-6 xl:px-12 py-8 flex flex-col gap-8 max-w-4xl">
          <div className="flex flex-col gap-2">
            <h1 className="font-bold text-3xl tracking-tight">The dead zone, handled.</h1>
            <p className="text-[#9A96AD] text-sm">
              While the distributor processes, your calendar and captions are already written — seeded from the real vibe of {r.title}.
            </p>
          </div>

          {/* controls: date + live link sync (Step 6) */}
          <div className="flex flex-wrap gap-6">
            <div className="flex flex-col gap-2">
              <div className="uppercase text-[#9A96AD] text-xs tracking-widest">Release date</div>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg bg-[#1E1E28] border border-white/10 px-3 py-2 text-sm text-neutral-50 focus:outline-none focus:ring-2 focus:ring-violet-500/40 [color-scheme:dark]"
              />
            </div>
            <div className="flex flex-col gap-2 flex-1 min-w-64">
              <div className="uppercase text-[#9A96AD] text-xs tracking-widest flex items-center gap-1.5">
                <Link2 className="size-3" /> Streaming link (paste when live)
              </div>
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://open.spotify.com/track/..."
                className="rounded-lg bg-[#1E1E28] border border-white/10 px-3 py-2 text-sm text-neutral-50 placeholder:text-[#5E5A72] focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
            </div>
          </div>

          {/* calendar + captions */}
          {err && <div className="text-sm text-red-400">{err}</div>}
          {loading && caps.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-[#9A96AD]">
              <Loader2 className="size-4 animate-spin text-violet-500" /> Writing your captions...
            </div>
          )}

          <div className="flex flex-col gap-4">
            {sorted.map((c) => (
              <div key={c.id} className="rounded-2xl border border-white/10 bg-[#15151C] p-5 flex gap-5">
                <div className="shrink-0 w-20 text-center">
                  <div className="font-mono text-sm font-bold text-neutral-50">
                    {fmtDay(releaseDate, SCHEDULE[c.id] ?? 0)}
                  </div>
                  <div className={"mt-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold " + (PHASE_STYLE[c.phase] || "")}>
                    {c.phase.replace("-", " ")}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold text-sm">{c.label}</span>
                    <span className="rounded-full bg-[#1E1E28] px-2 py-0.5 text-[10px] text-[#9A96AD]">{c.platform}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-[#9A96AD] leading-relaxed">
                    {c.text.split("{LINK}").map((part, i, arr) => (
                      <span key={i}>
                        {part}
                        {i < arr.length - 1 && (
                          <span className="rounded bg-[#F0A45B]/15 px-1.5 py-0.5 font-mono text-[11px] text-[#F0A45B]">
                            link drops in when live
                          </span>
                        )}
                      </span>
                    ))}
                  </p>
                  {/* one-click hand-off: copies caption, opens the platform */}
                  <div className="mt-3 flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[#5e5a72]">Post to</span>
                    {SOCIALS.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => handOff(c, s)}
                        className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-medium text-[#9A96AD] transition-colors hover:border-violet-500/60 hover:text-white"
                      >
                        {s.label}
                      </button>
                    ))}
                    {plan !== "pro" && <Lock className="size-3 text-[#5e5a72]" />}
                  </div>
                </div>
                <div className="shrink-0">
                  <Button
                    variant="ghost"
                    onClick={() => copy(c)}
                    className="text-[#9A96AD] gap-2"
                  >
                    {copiedId === c.id ? (
                      <><Check className="size-4 text-[#46E0A8]" />Copied</>
                    ) : plan === "pro" ? (
                      <><Copy className="size-4" />Copy</>
                    ) : (
                      <><Lock className="size-4" />Copy<span className="text-[10px] font-semibold opacity-80">PRO</span></>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
