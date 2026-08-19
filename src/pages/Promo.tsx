import { useEffect, useState } from "react";
import { Check, Clapperboard, Download, Loader2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";
import ProGate from "@/components/ProGate";
import FontSelect from "@/components/FontSelect";
import { saveVideo, listVideos, deleteVideo, type SavedVideo } from "@/lib/videoStore";
import { API_BASE as API } from "@/lib/api";

// Promo Clips — auto-cut a 15s vertical teaser from the song's HOOK (highest
// energy window, found server-side with librosa) over vibe-matched b-roll, with
// a punchy headline sequence. Reuses the same $0 render engine as the lyric
// video; no lyrics required. Built on the Opus-Clip-style "clip the hook" idea.
export default function Promo() {
  const { release, session, go } = useStore();
  const r = release ?? {
    filename: "Afterglow Nova.wav", title: "Afterglow", artist: "Nova",
    key: "A minor", bpm: 120, duration: "3:24", moods: ["emotional", "driving"], keywords: [], coverUrl: "",
  };
  const fileId = (r as { file_id?: string }).file_id || "";
  const audioKey = session?.user?.id && fileId ? `${session.user.id}/${fileId}` : "";
  const hasAudio = Boolean(fileId);
  const slug = `${r.title}-${r.artist}`.toLowerCase();

  const [caption, setCaption] = useState("OUT NOW");
  const [font, setFont] = useState<string>("anton");
  const [bg, setBg] = useState<"broll" | "cover">("broll");
  const [brollUp, setBrollUp] = useState(false);
  const [status, setStatus] = useState<"idle" | "rendering" | "done" | "error">("idle");
  const [videoUrl, setVideoUrl] = useState("");
  const [err, setErr] = useState("");
  const [rprog, setRprog] = useState(0);
  const [rstage, setRstage] = useState("");
  const [saved, setSaved] = useState<SavedVideo[]>([]);

  useEffect(() => {
    fetch(`${API}/health`).then((res) => res.json())
      .then((j) => setBrollUp(Boolean(j.broll))).catch(() => setBrollUp(false));
  }, []);

  const reloadSaved = () => { listVideos(slug).then(setSaved).catch(() => {}); };
  useEffect(() => { reloadSaved(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug]);

  useEffect(() => {
    if (status !== "rendering") return;
    const stages = ["Loading your track", "Finding the hook", "Pulling b-roll footage", "Rendering frames", "Muxing audio + video"];
    setRprog(5); setRstage(stages[0]);
    let t = 0;
    const iv = setInterval(() => {
      t += 1;
      setRprog((p) => (p < 94 ? p + Math.max(0.4, (94 - p) * 0.035) : 94));
      setRstage(stages[Math.min(stages.length - 1, Math.floor(t / 14))]);
    }, 500);
    return () => clearInterval(iv);
  }, [status]);
  useEffect(() => { if (status === "done") setRprog(100); }, [status]);

  const render = async () => {
    if (!hasAudio) return;
    setStatus("rendering"); setErr("");
    try {
      const fd = new FormData();
      fd.append("title", r.title);
      fd.append("artist", r.artist);
      fd.append("caption", caption);
      fd.append("cover_url", r.coverUrl || "");
      fd.append("file_id", fileId);
      fd.append("audio_key", audioKey);
      fd.append("moods", (r.moods || []).join(","));
      try { fd.append("style", localStorage.getItem("rollout_style") || "auto"); } catch { /* ignore */ }
      fd.append("font", font);
      fd.append("bg", bg === "broll" && brollUp ? "broll" : "cover");
      const res = await fetch(`${API}/promoclip`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Render failed");
      const blob = await res.blob();
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl(URL.createObjectURL(blob));
      setStatus("done");
      try {
        await saveVideo({ id: `p_${Date.now()}`, song: slug, label: `${r.title} · promo`, bg: "promo", createdAt: Date.now(), blob });
        reloadSaved();
      } catch { /* best-effort */ }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Render failed — is the engine running?");
      setStatus("error");
    }
  };

  const download = () => {
    if (!videoUrl) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `${r.title || "promo"}-promo.mp4`.replace(/\s+/g, "-");
    a.click();
  };
  const removeSaved = async (id: string) => { try { await deleteVideo(id); } catch { /* ignore */ } reloadSaved(); };

  return (
    <ProGate
      feature="Promo Clips"
      blurb="Auto-cut a 15s vertical teaser from your song's hook — ready for TikTok, Reels, and Shorts."
      tier="artist"
    >
      <div className="min-h-screen flex flex-col flex-1">
        <div className="flex px-6 xl:px-12 pt-8 flex-col gap-1">
          <span className="kicker">Releases / {r.title} / Promo</span>
          <h1 className="page-title text-[40px]">Promo Clips</h1>
          <p className="text-[#9A96AD] text-[17px] leading-7">
            A shareable vertical teaser cut from your hook. Post it to TikTok, Reels, and Shorts.
          </p>
        </div>

        <div className="flex px-6 xl:px-12 pt-6 pb-12 flex-1 gap-8 flex-wrap xl:flex-nowrap">
          {/* controls */}
          <div className="flex-1 min-w-[320px] flex flex-col gap-5">
            {!hasAudio && (
              <div className="panel rounded-3xl p-5 text-sm text-[#F0A45B]">
                Import a track first — the promo clip is cut from its hook.{" "}
                <button onClick={() => go("Import")} className="underline">Go to Import</button>.
              </div>
            )}

            <div className="panel rounded-3xl p-5 flex flex-col gap-4">
              <span className="section-label">Headline</span>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-[#9A96AD]">Call to action</label>
                <input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="OUT NOW"
                  maxLength={40}
                  className="rounded-xl panel-inset px-3 py-2.5 text-sm text-neutral-50 placeholder:text-[#5E5A72] focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                />
                <span className="font-mono text-[11px] text-[#5E5A72]">
                  The clip shows your title, artist name, then this line. Try "OUT AUG 29" or "PRE-SAVE NOW".
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="section-label w-20 shrink-0">Font</span>
                <FontSelect value={font} onChange={setFont} className="max-w-xs flex-1" />
              </div>

              <div className="flex items-center gap-3">
                <span className="section-label w-20 shrink-0">Background</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setBg("broll")}
                    disabled={!brollUp}
                    className={
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-colors " +
                      (bg === "broll" && brollUp
                        ? "bg-violet-500/15 border border-violet-500/40 text-[#F2F0F7]"
                        : "border border-white/10 text-[#9A96AD] hover:text-[#F2F0F7] disabled:opacity-40")
                    }
                  >
                    Moving b-roll{!brollUp ? " (offline)" : ""}
                  </button>
                  <button
                    onClick={() => setBg("cover")}
                    className={
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-colors " +
                      (bg === "cover"
                        ? "bg-violet-500/15 border border-violet-500/40 text-[#F2F0F7]"
                        : "border border-white/10 text-[#9A96AD] hover:text-[#F2F0F7]")
                    }
                  >
                    Cover art
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                disabled={!hasAudio || status === "rendering"}
                onClick={render}
                className="btn-primary rounded-xl text-white gap-2 disabled:opacity-40"
              >
                {status === "rendering" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {status === "rendering" ? "Rendering…" : "Generate promo clip"}
              </Button>
              {status === "rendering" && (
                <div className="flex flex-col gap-1.5">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#1E1E28]">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400 transition-[width] duration-500 ease-out" style={{ width: `${Math.round(rprog)}%` }} />
                  </div>
                  <div className="flex justify-between font-mono text-[10px] text-[#5E5A72]">
                    <span>{rstage || "Working"}…</span>
                    <span>{Math.round(rprog)}%</span>
                  </div>
                  <span className="font-mono text-[10px] text-[#5E5A72]">A 15s clip takes about a minute (longer on the first render while the engine warms up).</span>
                </div>
              )}
              {status === "error" && <span className="text-xs text-red-400">{err}</span>}
            </div>

            {/* saved clips for this song */}
            {saved.length > 0 && (
              <div className="panel rounded-3xl p-5 flex flex-col gap-3">
                <span className="section-label">Saved clips</span>
                {saved.map((v) => (
                  <div key={v.id} className="panel flex items-center gap-3 rounded-xl p-2.5">
                    <video src={URL.createObjectURL(v.blob)} className="h-12 w-8 rounded-md object-cover" muted />
                    <div className="flex flex-1 flex-col">
                      <span className="text-sm text-[#F2F0F7]">{v.label}</span>
                      <span className="font-mono text-[10px] text-[#5E5A72]">{v.bg === "promo" ? "promo" : v.bg}</span>
                    </div>
                    <a href={URL.createObjectURL(v.blob)} download={`${r.title}-${v.id}.mp4`} aria-label="Download" className="rounded-xl border border-white/10 p-2 text-[#9A96AD] hover:text-[#F2F0F7]">
                      <Download className="size-4" />
                    </a>
                    <button onClick={() => removeSaved(v.id)} aria-label="Delete" className="rounded-xl border border-white/10 p-2 text-[#9A96AD] hover:text-red-400 hover:border-red-400/40">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* phone preview */}
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-[36px] border border-white/10 bg-black p-3">
              <div className="flex h-[560px] w-[315px] flex-col items-center justify-center overflow-hidden rounded-3xl bg-[#0B0B0F]">
                {status === "done" && videoUrl ? (
                  <video src={videoUrl} controls autoPlay loop className="h-full w-full object-cover" />
                ) : status === "rendering" ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="size-6 animate-spin text-violet-500" />
                    <span className="font-mono text-xs text-[#9A96AD]">{rstage || "rendering"}…</span>
                    <span className="font-mono text-[11px] text-violet-300">{Math.round(rprog)}%</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-[#5E5A72]">
                    <Clapperboard className="size-6" />
                    <span className="font-mono text-xs">your promo clip renders here</span>
                  </div>
                )}
              </div>
            </div>
            {status === "done" && (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button onClick={() => go("Dashboard")} className="btn-primary rounded-xl text-white gap-2">
                  <Check className="size-4" /> Done — back to release
                </Button>
                <Button variant="ghost" onClick={download} className="gap-2 text-[#9A96AD] hover:text-[#F2F0F7]">
                  <Download className="size-4" /> Download MP4
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProGate>
  );
}
