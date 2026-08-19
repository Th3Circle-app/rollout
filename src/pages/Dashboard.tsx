import { ArrowRight, Calendar, Check, Clapperboard, Film, Globe, Image as ImageIcon, Music, Play, Share2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";

function fmtDate(d: string) {
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? ""
    : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function App() {
  const { release, go, releaseDate, streamingLink } = useStore();

  // Empty account → invite to import, never a fake demo track.
  if (!release) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-8 text-center">
        <div className="grid size-16 place-items-center rounded-2xl bg-white/[0.05] border border-white/10">
          <Music className="size-7 text-violet-300/80" />
        </div>
        <div className="flex flex-col gap-2 max-w-sm">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Start your first release</h1>
          <p className="text-[#9A96AD] leading-relaxed">Drop a finished track and Rollout builds the cover, videos, plan, and fan page around it.</p>
        </div>
        <Button
          onClick={() => go("Import")}
          className="rounded-full h-11 px-7 gap-2 bg-white text-black font-semibold hover:bg-white/90"
        >
          <Upload className="size-4" /> Import a track
        </Button>
      </div>
    );
  }

  const r = release;

  let submitted = false;
  try {
    const k = `rollout_dist_${(r.artist + "-" + r.title).toLowerCase().replace(/\s+/g, "-")}`;
    submitted = Boolean(JSON.parse(localStorage.getItem(k) || "null")?.submittedAt);
  } catch { /* ignore */ }

  const lyricVideoDone = Boolean((r as { lyricVideoDone?: boolean }).lyricVideoDone);
  const pagePublished = Boolean((r as { pagePublished?: boolean }).pagePublished);
  const pageReady = pagePublished || Boolean(streamingLink);
  // Cover Art is parked as "Coming soon" (AI generator held for hardening), so it
  // no longer counts toward release progress — otherwise 100% would be unreachable.
  const flags = [lyricVideoDone, Boolean(releaseDate), submitted, pageReady];
  const pct = Math.round((flags.filter(Boolean).length / flags.length) * 100);
  const daysToGo = releaseDate
    ? Math.max(0, Math.ceil((new Date(releaseDate).getTime() - Date.now()) / 86400000))
    : null;

  const ASSETS: { label: string; sub: string; page: string; ready: boolean; soon?: boolean; status: string; img?: string; grad: string; icon: typeof ImageIcon }[] = [
    { label: "Cover Art", sub: "AI studio in the works", page: "Cover", ready: false, soon: true, status: "Coming soon", grad: "linear-gradient(135deg,#7c3aed,#4f46e5)", icon: ImageIcon },
    { label: "Lyric Video", sub: "15s vertical clip", page: "Lyrics", ready: lyricVideoDone, status: lyricVideoDone ? "Ready" : "Create", grad: "linear-gradient(135deg,#4f46e5,#0ea5e9)", icon: Clapperboard },
    { label: "Promo Clip", sub: "TikTok / Reels teaser", page: "Promo", ready: false, status: "Create", grad: "linear-gradient(135deg,#db2777,#7c3aed)", icon: Film },
    { label: "Release Plan", sub: "calendar + captions", page: "Plan", ready: Boolean(releaseDate), status: releaseDate ? "Ready" : "Set date", grad: "linear-gradient(135deg,#059669,#0d9488)", icon: Calendar },
    { label: "Distribution", sub: "to every platform", page: "Distribute", ready: submitted, status: submitted ? "Sent" : "Send", grad: "linear-gradient(135deg,#2563eb,#06b6d4)", icon: Share2 },
    { label: "Release Page", sub: "the fan smart-link", page: "Landing", ready: pageReady, status: pageReady ? "Live" : "Build", grad: "linear-gradient(135deg,#f59e0b,#ef4444)", icon: Globe },
  ];

  const firstTodo = ASSETS.find((a) => !a.ready && !a.soon)?.page ?? "Ship";

  return (
    <div className="min-h-screen">
      {/* album header — gradient wash + big artwork, like a streaming album page */}
      <div className="relative">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[380px]"
          style={{ background: "linear-gradient(180deg, rgba(124,58,237,0.2), rgba(124,58,237,0.03) 46%, rgba(11,11,15,0) 92%)" }}
        />
        <div className="relative px-8 pt-16 pb-8 xl:px-14">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-end">
            <div
              className="size-[200px] shrink-0 overflow-hidden rounded-2xl"
              style={{ boxShadow: "0 30px 60px -18px rgba(0,0,0,0.85)" }}
            >
              {r.coverUrl ? (
                <img alt={`${r.title} cover`} referrerPolicy="no-referrer" className="h-full w-full object-cover" src={r.coverUrl} />
              ) : (
                <div className="flex h-full w-full items-center justify-center" style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)" }}>
                  <ImageIcon className="size-9 text-white/70" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3 pb-1">
              <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/75">Single</span>
              <h1 className="text-5xl font-extrabold leading-[0.98] tracking-tight text-white sm:text-7xl">{r.title}</h1>
              <div className="flex flex-wrap items-center gap-2 text-[14px] text-[#cfcadb]">
                <span className="font-semibold text-white">{r.artist}</span>
                <span className="text-white/40">•</span><span>{r.key}</span>
                <span className="text-white/40">•</span><span>{r.bpm} BPM</span>
                <span className="text-white/40">•</span><span>{r.duration}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <Button onClick={() => go(firstTodo)} className="h-11 gap-2 rounded-full bg-white px-6 font-bold text-black hover:bg-white/90">
                  <Play className="size-4 fill-black" /> Continue release
                </Button>
                <div className="flex items-center gap-2.5">
                  <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/12">
                    <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[13px] font-medium text-[#cfcadb]">{pct}% ready</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* release kit — imagery-forward tiles */}
      <div className="px-8 pb-16 xl:px-14">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="text-[19px] font-bold text-white">Your release kit</h2>
          <span className="text-[13px] text-[#8b879a]">
            {releaseDate ? `${daysToGo} days to release` : "no release date set"}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ASSETS.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.label}
                onClick={() => go(a.page)}
                className="group overflow-hidden rounded-xl border border-white/10 bg-white/[0.05] text-left backdrop-blur-xl transition-all hover:-translate-y-1 hover:border-white/20"
                style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), 0 20px 44px -24px rgba(0,0,0,0.85)" }}
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  {a.img ? (
                    <img src={a.img} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center transition-transform duration-500 group-hover:scale-[1.04]"
                      style={{ background: "radial-gradient(130% 120% at 50% -10%, rgba(124,58,237,0.16), rgba(124,58,237,0) 58%), #101014" }}
                    >
                      <Icon className="size-7 text-white/40" />
                    </div>
                  )}
                  <span
                    className={
                      "absolute right-3 top-3 rounded-full font-semibold backdrop-blur " +
                      (a.soon
                        ? "px-4 py-2 text-sm uppercase tracking-wide bg-[#F0A45B]/20 text-[#F7B96A] ring-1 ring-[#F0A45B]/40 shadow-lg"
                        : a.ready
                          ? "px-2.5 py-1 text-[11px] bg-black/45 text-[#5ce6a8]"
                          : "px-2.5 py-1 text-[11px] bg-black/45 text-white/90")
                    }
                  >
                    {a.ready && !a.soon && <Check className="mr-1 inline size-3 align-[-1px]" />}
                    {a.status}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3.5">
                  <div>
                    <div className="text-[15px] font-semibold text-white">{a.label}</div>
                    <div className="text-[12px] text-[#8b879a]">{a.sub}</div>
                  </div>
                  <ArrowRight className="size-4 text-[#8b879a] transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
