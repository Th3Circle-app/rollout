import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Layers,
  Package,
  Rocket,
  Settings,
  Upload,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";

type Distributor = {
  key: string;
  name: string;
  url: string;
  note: string;
  turnaround: string;
};

// Real submission URLs — this opens the actual distributor flow.
const DISTRIBUTORS: Distributor[] = [
  { key: "distrokid", name: "DistroKid", url: "https://distrokid.com/new/", note: "Fastest turnaround, annual fee", turnaround: "1–3 days" },
  { key: "tunecore", name: "TuneCore", url: "https://www.tunecore.com/dashboard", note: "Per-release pricing", turnaround: "2–5 days" },
  { key: "cdbaby", name: "CD Baby", url: "https://members.cdbaby.com/", note: "One-time fee, keeps working forever", turnaround: "3–7 days" },
  { key: "amuse", name: "Amuse", url: "https://artist.amuse.io/", note: "Free tier available", turnaround: "5–7 days" },
  { key: "unitedmasters", name: "UnitedMasters", url: "https://unitedmasters.com/releases", note: "Brand deal network", turnaround: "3–7 days" },
];

function loadState(slugKey: string) {
  try {
    return JSON.parse(localStorage.getItem(`rollout_dist_${slugKey}`) || "null");
  } catch {
    return null;
  }
}

export default function App() {
  const { release, go } = useStore();
  const r = release ?? {
    filename: "Fail Safe Xkaii.wav",
    title: "Fail Safe",
    artist: "Xkaii",
    key: "C minor",
    bpm: 99,
    duration: "3:56",
    moods: ["emotional", "moody", "driving"],
    keywords: [],
    coverUrl: "",
  };

  const stateKey = `${r.artist}-${r.title}`.toLowerCase().replace(/\s+/g, "-");
  const [picked, setPicked] = useState<string>("");
  const [submittedAt, setSubmittedAt] = useState<string>("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const s = loadState(stateKey);
    if (s) { setPicked(s.picked || ""); setSubmittedAt(s.submittedAt || ""); }
  }, [stateKey]);

  const persist = (p: string, s: string) => {
    try {
      localStorage.setItem(`rollout_dist_${stateKey}`, JSON.stringify({ picked: p, submittedAt: s }));
    } catch { /* ignore */ }
  };

  const copyMeta = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(""), 1200);
  };

  const dist = DISTRIBUTORS.find((d) => d.key === picked);

  const markSubmitted = () => {
    const now = new Date().toISOString();
    setSubmittedAt(now);
    persist(picked, now);
  };

  const daysSince = submittedAt
    ? Math.floor((Date.now() - new Date(submittedAt).getTime()) / 86400000)
    : 0;

  const META: [string, string][] = [
    ["Track title", r.title],
    ["Artist name", r.artist],
    ["Key / BPM (for credits)", `${r.key} · ${r.bpm} BPM`],
    ["Duration", r.duration],
  ];

  return (
    <div className="text-neutral-50 min-h-screen">
      {/* main */}
      <div className="overflow-y-auto flex-1 h-screen">
        <div className="flex px-12 pt-8 justify-between items-center">
          <div className="text-[#9A96AD] text-sm">
            Releases<span className="text-[#9A96AD]/50 mx-1">/</span>{r.title}
            <span className="text-[#9A96AD]/50 mx-1">/</span>
            <span className="text-neutral-50">Distribution</span>
          </div>
          {submittedAt && dist && (
            <div className="font-mono rounded-full text-xs border-1 border-solid border-[#46E0A8]/40 text-[#46E0A8] bg-[#46E0A8]/5 px-3 py-1.5">
              ● submitted to {dist.name} · day {daysSince} of {dist.turnaround}
            </div>
          )}
        </div>

        <div className="px-12 py-8 flex flex-col gap-8 max-w-3xl">
          <div className="flex flex-col gap-2">
            <h1 className="font-bold text-3xl tracking-tight">Hand it to the distributor.</h1>
            <p className="text-[#9A96AD] text-sm">
              Pick your distributor, copy your metadata straight in, and mark it submitted — Rollout starts the dead-zone plan the second you do.
            </p>
          </div>

          {/* 1. pick distributor */}
          <div className="flex flex-col gap-3">
            <div className="uppercase text-[#9A96AD] text-xs tracking-widest">1 · Choose distributor</div>
            <div className="grid grid-cols-2 gap-3">
              {DISTRIBUTORS.map((d) => (
                <button
                  key={d.key}
                  onClick={() => { setPicked(d.key); persist(d.key, submittedAt); }}
                  className={
                    "rounded-2xl border p-4 text-left transition-all " +
                    (picked === d.key
                      ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500/40"
                      : "border-white/10 bg-[#15151C] hover:border-white/20")
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{d.name}</span>
                    <span className="font-mono text-[10px] text-[#9A96AD]">{d.turnaround}</span>
                  </div>
                  <div className="mt-1 text-xs text-[#9A96AD]">{d.note}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 2. metadata to paste */}
          <div className="flex flex-col gap-3">
            <div className="uppercase text-[#9A96AD] text-xs tracking-widest">2 · Your metadata (click to copy)</div>
            <div className="rounded-2xl border border-white/10 bg-[#15151C] divide-y divide-white/5">
              {META.map(([label, value]) => (
                <button
                  key={label}
                  onClick={() => copyMeta(label, value)}
                  className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-white/[.03]"
                >
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-[#5e5a72]">{label}</div>
                    <div className="text-sm text-neutral-50">{value}</div>
                  </div>
                  {copied === label
                    ? <Check className="size-4 text-[#46E0A8]" />
                    : <Copy className="size-4 text-[#5e5a72]" />}
                </button>
              ))}
            </div>
            <p className="text-xs text-[#5e5a72]">
              Cover art: export the 3000×3000 PNG from the Cover screen — that's the file distributors want.
            </p>
          </div>

          {/* 3. go submit */}
          <div className="flex flex-col gap-3">
            <div className="uppercase text-[#9A96AD] text-xs tracking-widest">3 · Submit &amp; mark it</div>
            <div className="flex items-center gap-3">
              <Button
                disabled={!dist}
                onClick={() => dist && window.open(dist.url, "_blank")}
                className="btn-glow text-white gap-2 disabled:opacity-40"
              >
                <ExternalLink className="size-4" />
                Open {dist ? dist.name : "distributor"} upload
              </Button>
              <Button
                disabled={!dist || !!submittedAt}
                onClick={markSubmitted}
                variant="ghost"
                className="text-[#9A96AD] gap-2 disabled:opacity-40"
              >
                <Check className="size-4" />
                {submittedAt ? "Marked submitted" : "I submitted it"}
              </Button>
            </div>
          </div>

          {/* dead-zone kickoff */}
          {submittedAt && dist && (
            <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-6 flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm text-[#F2F0F7]">The dead zone starts now.</div>
                <p className="mt-1 text-sm text-[#9A96AD]">
                  {dist.name} usually takes {dist.turnaround}. Don't sit idle — your calendar and captions are ready.
                </p>
              </div>
              <Button onClick={() => go("Plan")} className="shrink-0 btn-glow text-white gap-2">
                Open release plan <ArrowRight className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
