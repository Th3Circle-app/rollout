import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Layers,
  Megaphone,
  Package,
  Settings,
  Upload,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ProGate from "@/components/ProGate";
import { useStore, slugify } from "@/store";

// Interest targeting seeds derived from the real vibe analysis
const MOOD_INTERESTS: Record<string, string[]> = {
  emotional: ["Alternative R&B", "Singer-songwriter", "Sad music playlists"],
  moody: ["Dark pop", "Night drive playlists", "The Weeknd"],
  driving: ["EDM", "Workout music", "Car culture"],
  bright: ["Pop music", "Summer hits"],
  uplifting: ["Motivational content", "Fitness"],
  energetic: ["Hip hop", "Gym playlists", "Festival culture"],
  mellow: ["Lo-fi", "Chillhop", "Study playlists"],
  crisp: ["Audiophile", "Music production"],
  warm: ["Indie folk", "Coffee shop playlists"],
};

export default function App() {
  const { release } = useStore();
  const r = release ?? {
    filename: "Fail Safe Xkaii.wav",
    title: "Fail Safe",
    artist: "Xkaii",
    key: "C minor",
    bpm: 99,
    duration: "3:56",
    moods: ["emotional", "moody", "driving"],
    keywords: ["dramatic light", "deep shadow"],
    coverUrl: "",
  };

  const [objective, setObjective] = useState<"pre" | "post">("pre");
  const [budget, setBudget] = useState(10);
  const [copied, setCopied] = useState("");

  const slug = slugify(`${r.artist}-${r.title}`) || "release";
  const landing = `https://th3circle.app/r/${slug}`;

  const interests = useMemo(() => {
    const out: string[] = [];
    for (const m of r.moods) out.push(...(MOOD_INTERESTS[m.toLowerCase()] || []));
    return [...new Set(out)].slice(0, 8);
  }, [r.moods]);

  const primaryText =
    objective === "pre"
      ? `"${r.title}" drops soon. Be first — presave + join the circle at the link. No algorithm, just the music.`
      : `"${r.title}" by ${r.artist} is out now. Stream it, then come get the exclusives only fans on the inside get.`;
  const headline = objective === "pre" ? `${r.title} — coming soon` : `${r.title} — out now`;

  const campaign: [string, string][] = [
    ["Campaign name", `${r.artist} - ${r.title} - ${objective === "pre" ? "Pre-release hype" : "Release push"}`],
    ["Objective", objective === "pre" ? "Traffic (landing page views)" : "Traffic + Conversions"],
    ["Daily budget", `$${budget}/day`],
    ["Destination URL (the moat)", landing],
    ["Audience age", "18-34"],
    ["Interest targeting", interests.join(", ")],
    ["Primary text", primaryText],
    ["Headline", headline],
    ["Creative", "Cover art (3000×3000 export) + 15s lyric video (vertical)"],
  ];

  const copyField = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(""), 1200);
  };

  return (
    <ProGate
      tier="studio"
      feature="Ad Center"
      blurb="Template-driven Meta + Google campaigns pointed at your algorithm-free Th3Circle page — where you keep the fan data."
    >
      <div className="text-neutral-50 min-h-screen">
        {/* main */}
        <div className="overflow-y-auto flex-1 h-screen">
          <div className="flex px-6 xl:px-12 pt-8 justify-between items-center">
            <div className="text-[#9A96AD] text-sm">
              Releases<span className="text-[#9A96AD]/50 mx-1">/</span>{r.title}
              <span className="text-[#9A96AD]/50 mx-1">/</span>
              <span className="text-neutral-50">Ad Center</span>
            </div>
            <div className="font-mono rounded-full bg-[#15151C] text-[#9A96AD] text-xs border-white/10 border-1 border-solid px-3 py-1.5">
              destination: your page, your data
            </div>
          </div>

          <div className="px-6 xl:px-12 py-8 flex flex-col gap-8 max-w-3xl">
            <div className="flex flex-col gap-2">
              <h1 className="font-bold text-3xl tracking-tight">Point ads at a page you own.</h1>
              <p className="text-[#9A96AD] text-sm">
                Rollout builds the whole campaign from your vibe — audience, copy, creative, budget — aimed at your Th3Circle page instead of a streaming app that keeps the fan data.
              </p>
            </div>

            {/* objective + budget */}
            <div className="flex flex-wrap items-end gap-8">
              <div className="flex flex-col gap-2">
                <div className="uppercase text-[#9A96AD] text-xs tracking-widest">Phase</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setObjective("pre")}
                    className={"rounded-xl border px-4 py-2 text-sm font-medium transition-colors " + (objective === "pre" ? "border-violet-500 bg-violet-500/15 text-[#F2F0F7]" : "border-white/10 text-[#9A96AD]")}
                  >
                    Pre-release
                  </button>
                  <button
                    onClick={() => setObjective("post")}
                    className={"rounded-xl border px-4 py-2 text-sm font-medium transition-colors " + (objective === "post" ? "border-violet-500 bg-violet-500/15 text-[#F2F0F7]" : "border-white/10 text-[#9A96AD]")}
                  >
                    Post-release
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-2 flex-1 min-w-56">
                <div className="uppercase text-[#9A96AD] text-xs tracking-widest">
                  Daily budget — <span className="text-neutral-50 font-bold">${budget}/day</span> (~${budget * 30}/mo)
                </div>
                <input
                  type="range" min={5} max={100} step={5} value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="accent-violet-500"
                />
              </div>
            </div>

            {/* the generated campaign */}
            <div className="flex flex-col gap-3">
              <div className="uppercase text-[#9A96AD] text-xs tracking-widest">Your campaign (click any field to copy)</div>
              <div className="rounded-2xl border border-white/10 bg-[#15151C] divide-y divide-white/5">
                {campaign.map(([label, value]) => (
                  <button
                    key={label}
                    onClick={() => copyField(label, value)}
                    className="flex w-full items-center justify-between gap-6 px-5 py-3.5 text-left hover:bg-white/[.03]"
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-wider text-[#5e5a72]">{label}</div>
                      <div className="text-sm text-neutral-50 break-words">{value}</div>
                    </div>
                    {copied === label
                      ? <Check className="size-4 shrink-0 text-[#46E0A8]" />
                      : <Copy className="size-4 shrink-0 text-[#5e5a72]" />}
                  </button>
                ))}
              </div>
            </div>

            {/* launch */}
            <div className="flex flex-col gap-3">
              <div className="uppercase text-[#9A96AD] text-xs tracking-widest">Launch</div>
              <div className="flex gap-3">
                <Button
                  onClick={() => window.open("https://adsmanager.facebook.com/adsmanager/manage/campaigns", "_blank")}
                  className="bg-[#1877F2] text-white gap-2"
                >
                  <ExternalLink className="size-4" />Open Meta Ads Manager
                </Button>
                <Button
                  onClick={() => window.open("https://ads.google.com/aw/campaigns/new", "_blank")}
                  variant="ghost"
                  className="border border-white/10 text-neutral-50 gap-2"
                >
                  <ExternalLink className="size-4" />Open Google Ads
                </Button>
              </div>
              <p className="text-xs text-[#5e5a72]">
                Honest scope: Rollout preps the full campaign and you paste it into Ads Manager. Direct API launching needs Meta business verification — on the roadmap, not faked.
              </p>
            </div>
          </div>
        </div>
      </div>
    </ProGate>
  );
}
