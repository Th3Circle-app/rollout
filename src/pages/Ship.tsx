import { useEffect, useState } from "react";
import { ArrowRight, Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";

function useCountdown(target: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const end = new Date(target).getTime();
  const diff = Math.max(0, end - now);
  return {
    days: Math.floor(diff / 86400000),
    hrs: Math.floor((diff % 86400000) / 3600000),
    min: Math.floor((diff % 3600000) / 60000),
    sec: Math.floor((diff % 60000) / 1000),
    valid: !isNaN(end),
  };
}

export default function App() {
  const { release, go, releaseDate, streamingLink } = useStore();
  const r = release ?? {
    filename: "Fail Safe Xkaii.wav", title: "Fail Safe", artist: "Xkaii",
    key: "C minor", bpm: 99, duration: "3:56",
    moods: [], keywords: [], coverUrl: "", lyrics: "",
  };
  const cd = useCountdown(releaseDate);
  const [scheduled, setScheduled] = useState<boolean>(() => {
    try { return localStorage.getItem("rollout_scheduled") === "1"; } catch { return false; }
  });

  let submitted = false;
  try {
    const k = `rollout_dist_${(r.artist + "-" + r.title).toLowerCase().replace(/\s+/g, "-")}`;
    submitted = Boolean(JSON.parse(localStorage.getItem(k) || "null")?.submittedAt);
  } catch { /* ignore */ }

  const GOING_LIVE: { label: string; ok: boolean; note?: string }[] = [
    { label: "Cover Art", ok: Boolean(r.coverUrl) },
    { label: "Lyric Video", ok: Boolean(r.lyrics) },
    { label: "Release Plan", ok: Boolean(releaseDate), note: releaseDate ? "captions ready" : undefined },
    { label: "Distribution", ok: submitted },
    { label: "Release Page", ok: Boolean(streamingLink) },
  ];
  const DIST = ["Spotify", "Apple Music", "TikTok", "Instagram", "YouTube"].map((p, i) => ({
    label: p,
    ok: streamingLink ? true : submitted && i < 2,
  }));

  const dateLabel = releaseDate
    ? new Date(releaseDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  const schedule = () => {
    setScheduled(true);
    try { localStorage.setItem("rollout_scheduled", "1"); } catch { /* ignore */ }
  };

  const Cell = ({ v, unit, violet }: { v: number; unit: string; violet?: boolean }) => (
    <div className="flex flex-col items-center gap-2">
      <span className={"tabular-nums font-mono font-bold text-6xl leading-15 " + (violet ? "text-violet-500" : "text-[#F2F0F7]")}>
        {String(v).padStart(2, "0")}
      </span>
      <span className="uppercase text-[#5E5A72] text-[10px] tracking-[3.2px]">{unit}</span>
    </div>
  );

  return (
    <div className="flex px-16 py-12 flex-col items-center flex-1 min-h-screen">
      <div className="max-w-[720px] flex mb-10 justify-between items-center w-full">
        <div className="text-[#5E5A72] text-sm leading-5">
          <button className="text-[#9A96AD]" onClick={() => go("Dashboard")}>Releases</button>
          <span className="mx-2">/</span>
          <span className="text-[#9A96AD]">{r.title}</span>
          <span className="mx-2">/</span>
          <span className="text-[#F2F0F7]">Launch</span>
        </div>
        <div className="font-mono rounded-full bg-[#15151C] text-[#9A96AD] text-xs leading-4 border-white/8 border-1 border-solid px-3 py-1.5">
          {r.key} · {r.bpm} BPM
        </div>
      </div>

      <div className="max-w-[720px] text-center flex mb-12 flex-col items-center gap-4 w-full">
        <span className="font-medium uppercase text-[#46E0A8] text-xs leading-4 tracking-[3.2px]">
          Ready to launch
        </span>
        <h1 className="leading-tight font-bold text-[#F2F0F7] text-5xl leading-12 tracking-tight">
          Everything's ready. Ship it.
        </h1>
      </div>

      <div className="max-w-[720px] edge rounded-2xl bg-[#15151C] border-white/8 border-1 border-solid flex mb-8 p-6 items-center gap-6 w-full">
        <div className="size-24 shrink-0 rounded-xl overflow-hidden bg-[#1E1E28]">
          {r.coverUrl ? (
            <img alt={`${r.title} cover art`} className="object-cover w-full h-full" src={r.coverUrl} />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-mono text-[10px] text-[#5E5A72]">no art</div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-bold text-[#F2F0F7] text-2xl leading-8 tracking-tight">{r.title}</span>
          <span className="text-[#9A96AD] text-sm leading-5">{r.artist}</span>
          <span className="font-mono text-[#9A96AD] text-xs leading-4 mt-1">
            {r.key.toUpperCase()} · {r.bpm} BPM · {r.duration}
          </span>
        </div>
      </div>

      <div className="max-w-[720px] edge rounded-2xl bg-[#15151C] border-white/8 border-1 border-solid flex mb-12 p-8 flex-col items-center gap-3 w-full">
        <span className="font-mono uppercase text-[#5E5A72] text-xs leading-4 tracking-[2.4px]">
          {dateLabel ? `Releases ${dateLabel}` : "Set your release date on the Release Plan"}
        </span>
        {cd.valid && releaseDate ? (
          <div className="flex items-start gap-6">
            <Cell v={cd.days} unit="Days" />
            <span className="font-mono font-bold text-[#5E5A72] text-6xl leading-15 mt-0">:</span>
            <Cell v={cd.hrs} unit="Hrs" />
            <span className="font-mono font-bold text-[#5E5A72] text-6xl leading-15 mt-0">:</span>
            <Cell v={cd.min} unit="Min" />
            <span className="font-mono font-bold text-[#5E5A72] text-6xl leading-15 mt-0">:</span>
            <Cell v={cd.sec} unit="Sec" violet />
          </div>
        ) : (
          <Button variant="ghost" onClick={() => go("Plan")} className="text-[#9A96AD] border border-white/8 rounded-xl">
            Pick a date
          </Button>
        )}
      </div>

      <div className="max-w-[720px] grid grid-cols-2 mb-8 gap-6 w-full">
        <div className="edge rounded-2xl bg-[#15151C] border-white/8 border-1 border-solid p-6">
          <span className="block font-medium uppercase text-[#5E5A72] text-xs leading-4 tracking-[3.2px] mb-4">
            Going live
          </span>
          <div className="flex flex-col gap-4">
            {GOING_LIVE.map((item) => (
              <div key={item.label} className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  {item.ok ? (
                    <div className="size-5 rounded-full bg-[#46E0A8]/15 flex justify-center items-center">
                      <Check className="size-3 text-[#46E0A8]" />
                    </div>
                  ) : (
                    <div className="size-5 rounded-full bg-[#1E1E28] flex justify-center items-center">
                      <Circle className="size-3 text-[#5E5A72]" />
                    </div>
                  )}
                  <span className={(item.ok ? "text-[#F2F0F7]" : "text-[#9A96AD]") + " text-sm leading-5"}>
                    {item.label}
                  </span>
                </div>
                {item.note && <span className="text-[#5E5A72] text-xs leading-4">{item.note}</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="edge rounded-2xl bg-[#15151C] border-white/8 border-1 border-solid p-6">
          <span className="block font-medium uppercase text-[#5E5A72] text-xs leading-4 tracking-[3.2px] mb-4">
            Distribution
          </span>
          <div className="flex flex-col gap-4">
            {DIST.map((d) => (
              <div key={d.label} className="flex items-center gap-3">
                {d.ok ? (
                  <div className="size-5 rounded-full bg-[#46E0A8]/15 flex justify-center items-center">
                    <Check className="size-3 text-[#46E0A8]" />
                  </div>
                ) : (
                  <div className="size-5 rounded-full bg-[#1E1E28] flex justify-center items-center">
                    <Circle className="size-3 text-[#5E5A72]" />
                  </div>
                )}
                <span className={(d.ok ? "text-[#F2F0F7]" : "text-[#9A96AD]") + " text-sm leading-5"}>{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[720px] flex flex-col items-center gap-3 w-full">
        <Button
          onClick={schedule}
          disabled={scheduled || !releaseDate}
          className="font-semibold rounded-2xl bg-violet-500 hover:bg-[#7c4dec] text-white text-base leading-6 flex justify-center items-center gap-2 w-full h-14 disabled:opacity-50"
        >
          <span>{scheduled ? "Release scheduled" : "Schedule release"}</span>
          {!scheduled && <ArrowRight className="size-4" />}
        </Button>
        {scheduled && dateLabel ? (
          <span className="text-[#46E0A8] text-sm leading-5">
            Your release has been scheduled for {dateLabel}.
          </span>
        ) : (
          <span className="text-[#5E5A72] text-sm leading-5">
            {dateLabel ? `Everything goes live automatically on ${dateLabel}.` : "Pick a date to schedule the release."}
          </span>
        )}
      </div>
    </div>
  );
}
