import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { useStore } from "@/store";

function fmtDate(d: string) {
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? ""
    : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function App() {
  const { release, go, releaseDate, streamingLink } = useStore();
  const r = release ?? {
    filename: "Fail Safe Xkaii.wav", title: "Fail Safe", artist: "Xkaii",
    key: "C minor", bpm: 99, duration: "3:56",
    moods: ["emotional", "moody", "driving"], keywords: [], coverUrl: "", lyrics: "",
  };

  // real readiness — each flag is actual product state
  let submitted = false;
  try {
    const k = `rollout_dist_${(r.artist + "-" + r.title).toLowerCase().replace(/\s+/g, "-")}`;
    submitted = Boolean(JSON.parse(localStorage.getItem(k) || "null")?.submittedAt);
  } catch { /* ignore */ }
  const flags = [Boolean(r.coverUrl), Boolean(r.lyrics), Boolean(releaseDate), submitted, Boolean(streamingLink)];
  const pct = Math.round((flags.filter(Boolean).length / flags.length) * 100);
  const daysToGo = releaseDate
    ? Math.max(0, Math.ceil((new Date(releaseDate).getTime() - Date.now()) / 86400000))
    : null;

  const linkLive = Boolean(streamingLink);

  const ASSETS: {
    label: string; sub?: string; page: string; ready: boolean; readyLabel?: string; img?: string; wide?: boolean;
  }[] = [
    { label: "Cover Art", page: "Cover", ready: Boolean(r.coverUrl), img: r.coverUrl },
    { label: "Lyric Video", sub: "15s vertical clip", page: "Lyrics", ready: Boolean(r.lyrics), readyLabel: r.lyrics ? "Ready" : "Needs lyrics" },
    { label: "Release Plan", sub: "calendar + captions", page: "Plan", ready: Boolean(releaseDate), readyLabel: releaseDate ? "Ready" : "Set a date" },
    { label: "Distribution", page: "Distribute", ready: submitted, readyLabel: submitted ? "Submitted" : "Needs review" },
    { label: "Release Page", page: "Landing", ready: linkLive, readyLabel: linkLive ? "Ready" : "Needs review", wide: true },
  ];

  const Chip = ({ ok, label }: { ok: boolean; label?: string }) => (
    <span className={
      "font-medium rounded-full text-[10px] px-2 py-0.5 " +
      (ok ? "bg-[#46E0A8]/10 text-[#46E0A8]" : "bg-[#F0A45B]/10 text-[#F0A45B]")
    }>
      {label || (ok ? "Ready" : "Needs review")}
    </span>
  );

  return (
    <div className="min-h-screen flex flex-col flex-1">
      <div className="flex px-6 xl:px-12 pt-8 justify-end">
        <div className="font-mono rounded-full bg-[#15151C] text-[#9A96AD] text-xs leading-4 border-white/8 border-1 border-solid px-3 py-1.5">
          {r.key} · {r.bpm} BPM · {r.duration}
        </div>
      </div>
      <div className="flex px-6 xl:px-12 pt-6 pb-12 flex-1 gap-8">
        <div className="max-w-[820px] flex flex-col flex-1 gap-8">
          {/* header */}
          <div className="border-white/8 border-t-0 border-r-0 border-b-1 border-l-0 border-solid flex pb-8 justify-between items-center">
            <div className="flex items-center gap-5">
              <div className="size-16 shrink-0 rounded-xl bg-[#1E1E28] border-white/8 border-1 border-solid overflow-hidden">
                {r.coverUrl ? (
                  <img alt={`${r.title} cover art thumbnail`} className="object-cover w-full h-full" src={r.coverUrl} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-mono text-[10px] text-[#5E5A72]">no art</div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <h1 className="font-bold text-[#F2F0F7] text-4xl leading-10 tracking-tight">{r.title}</h1>
                <p className="text-[#9A96AD] text-sm leading-5">{r.artist}</p>
                <div className="flex mt-1 items-center gap-3">
                  <div className="flex items-end gap-0.5 h-4">
                    <div className="rounded-full bg-violet-500/60 w-0.5 h-2" />
                    <div className="rounded-full bg-violet-500/70 w-0.5 h-3" />
                    <div className="rounded-full bg-violet-500 w-0.5 h-4" />
                    <div className="rounded-full bg-violet-500/50 w-0.5 h-2" />
                    <div className="rounded-full bg-violet-500/70 w-0.5 h-3" />
                    <div className="rounded-full bg-violet-500/40 w-0.5 h-1" />
                    <div className="rounded-full bg-violet-500/60 w-0.5 h-3" />
                  </div>
                  <span className="font-mono text-[#9A96AD] text-xs leading-4">
                    {r.key.toUpperCase()} · {r.bpm} BPM · {r.duration}
                  </span>
                </div>
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-center gap-2">
              <div
                className="relative size-16 rounded-full flex justify-center items-center"
                style={{ background: `conic-gradient(#8B5CF6 0deg, #8B5CF6 ${pct * 3.6}deg, rgba(255,255,255,0.08) ${pct * 3.6}deg, rgba(255,255,255,0.08) 360deg)` }}
              >
                <div className="size-12 rounded-full bg-[#0B0B0F] flex justify-center items-center">
                  <span className="font-mono font-semibold text-[#F2F0F7] text-xs leading-4">{pct}%</span>
                </div>
              </div>
              <span className="uppercase text-[#9A96AD] text-[10px] tracking-wider">{pct}% ready</span>
            </div>
          </div>

          {/* asset kit */}
          <div className="flex flex-col gap-4">
            <span className="font-medium uppercase text-[#9A96AD] text-xs leading-4 tracking-[2.4px]">Asset Kit</span>
            <div className="grid grid-cols-2 gap-4">
              {ASSETS.map((a) => (
                <Card
                  key={a.label}
                  onClick={() => go(a.page)}
                  className={
                    "shadow-none rounded-2xl bg-[#15151C] border-white/8 border-1 border-solid p-4 gap-3 cursor-pointer transition-colors hover:border-white/20 " +
                    (a.wide ? "col-span-2" : "")
                  }
                >
                  <div className="rounded-xl bg-[#1E1E28] border-white/8 border-1 border-solid h-28 overflow-hidden">
                    {a.img ? (
                      <img src={a.img} alt={`${a.label} preview`} className="object-cover w-full h-full" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-mono text-[10px] text-[#5E5A72]">
                        open to create
                      </div>
                    )}
                  </div>
                  <CardContent className="flex p-0 flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="font-semibold text-[#F2F0F7] text-sm leading-5">{a.label}</span>
                        {a.sub && <span className="text-[#9A96AD] text-xs leading-4">{a.sub}</span>}
                      </div>
                      <Chip ok={a.ready} label={a.readyLabel} />
                    </div>
                    <span className="inline-flex font-medium uppercase rounded-sm bg-[#F0A45B]/10 text-[#F0A45B] text-[9px] tracking-wide px-1.5 py-0.5 w-fit">
                      AI Generated
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>

        {/* right rail */}
        <div className="shrink-0 w-80">
          <Card className="sticky flex flex-col shadow-none rounded-2xl bg-[#15151C] border-white/8 border-1 border-solid top-8 p-6 gap-6">
            <CardHeader className="p-0 gap-3">
              <span className="font-medium uppercase text-[#9A96AD] text-xs leading-4 tracking-[2.4px]">Release</span>
              <div className="flex flex-col gap-1">
                <span className="font-bold text-[#F2F0F7] text-3xl leading-9 tracking-tight">
                  {releaseDate ? fmtDate(releaseDate) : "No date yet"}
                </span>
                <span className="font-mono text-[#9A96AD] text-xs leading-4">
                  {daysToGo !== null ? `${daysToGo} days to go` : "set it on the Release Plan"}
                </span>
              </div>
            </CardHeader>
            <CardContent className="flex p-0 flex-col gap-3">
              <span className="font-medium uppercase text-[#9A96AD] text-xs leading-4 tracking-[2.4px]">Distribution</span>
              <div className="flex flex-col gap-3">
                {["Spotify", "Apple Music", "TikTok", "Instagram", "YouTube"].map((p, i) => {
                  const ok = linkLive ? true : submitted && i < 2;
                  return (
                    <div key={p} className="flex items-center gap-3">
                      {ok ? (
                        <div className="size-5 rounded-full bg-[#46E0A8]/15 border-[#46E0A8] border-1 border-solid flex justify-center items-center">
                          <Check className="size-3 text-[#46E0A8]" />
                        </div>
                      ) : (
                        <div className="size-5 rounded-full border-white/15 border-1 border-solid" />
                      )}
                      <span className={(ok ? "text-[#F2F0F7]" : "text-[#9A96AD]") + " text-sm leading-5"}>{p}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
            <CardFooter className="p-0">
              <Button onClick={() => go("Ship")} className="rounded-xl bg-violet-500 hover:bg-[#7c4dec] text-white w-full h-11">
                Review &amp; publish
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
