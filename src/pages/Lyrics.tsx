import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Clapperboard,
  Download,
  Loader2,
  Music,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ProGate from "@/components/ProGate";
import { useStore } from "@/store";

const API = "http://127.0.0.1:8000";

type Word = { word: string; start: number; end: number; conf?: number };

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
    keywords: [],
    coverUrl: "",
  };

  const fileRef = useRef<HTMLInputElement>(null);
  const [lyrics, setLyrics] = useState((release?.lyrics ?? "").trim());
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detectErr, setDetectErr] = useState("");
  const [hookStart, setHookStart] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "rendering" | "done" | "error">("idle");
  const [videoUrl, setVideoUrl] = useState("");
  const [err, setErr] = useState("");
  const [bg, setBg] = useState<"cover" | "broll">("cover");
  const [brollUp, setBrollUp] = useState(false);
  useEffect(() => {
    fetch(`${API}/health`).then((r) => r.json())
      .then((j) => setBrollUp(Boolean(j.broll))).catch(() => setBrollUp(false));
  }, []);

  const fileId = (r as { file_id?: string }).file_id || "";
  const hasAudio = Boolean(fileId || audioFile);

  const fmtTime = (s: number) => {
    const total = (hookStart ?? 0) + s;
    return `${Math.floor(total / 60)}:${String(Math.floor(total % 60)).padStart(2, "0")}`;
  };

  // 1 · auto-detect the sung words with exact timing
  const detect = async () => {
    if (!fileId) return;
    setDetecting(true);
    setDetectErr("");
    try {
      const res = await fetch(`${API}/detectlyrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId }),
      });
      if (!res.ok) throw new Error("detection failed");
      const j = await res.json();
      setHookStart(j.hook_start);
      setWords(j.words);
      if (!j.words.length) setDetectErr("Couldn't hear clear words in the hook — paste your lyrics below instead.");
    } catch {
      setDetectErr("Detection failed — is the engine running?");
    } finally {
      setDetecting(false);
    }
  };

  // 2 · map pasted lyrics onto the detected timing
  const applyLyrics = async () => {
    if (!lyrics.trim() || !words.length) return;
    try {
      const res = await fetch(`${API}/correctwords`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words, lyrics }),
      });
      if (res.ok) setWords((await res.json()).words);
    } catch {
      /* keep current words */
    }
  };

  const editWord = (i: number, value: string) =>
    setWords((ws) => ws.map((w, j) => (j === i ? { ...w, word: value, conf: 1 } : w)));
  const dropWord = (i: number) => setWords((ws) => ws.filter((_, j) => j !== i));

  // 3 · render with the exact approved words
  const render = async () => {
    if (!hasAudio || (!lyrics.trim() && !words.length)) return;
    setStatus("rendering");
    setErr("");
    try {
      const fd = new FormData();
      fd.append("lyrics", lyrics);
      fd.append("title", r.title);
      fd.append("artist", r.artist);
      fd.append("cover_url", r.coverUrl || "");
      if (words.length) fd.append("words_json", JSON.stringify(words));
      fd.append("bg", bg);
      fd.append("moods", (r.moods || []).join(","));
      try { fd.append("style", localStorage.getItem("rollout_style") || "auto"); } catch { /* ignore */ }
      if (audioFile) fd.append("file", audioFile);
      else fd.append("file_id", fileId);
      const res = await fetch(`${API}/lyricvideo`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Render failed");
      const blob = await res.blob();
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl(URL.createObjectURL(blob));
      setStatus("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Render failed — is the engine running?");
      setStatus("error");
    }
  };

  const download = () => {
    if (!videoUrl) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `${r.title}-lyric.mp4`.replace(/\s+/g, "-");
    a.click();
  };

  const lowConf = (w: Word) => (w.conf ?? 1) < 0.5;

  return (
    <ProGate
      feature="Kinetic lyric videos"
      blurb="Rollout finds the hook in your track and cuts a beat-synced 15s vertical lyric video, ready for TikTok."
    >
      <div className="text-neutral-50 min-h-screen">
        <div className="overflow-y-auto flex-1 h-screen">
          <div className="flex px-12 pt-8 justify-between items-center">
            <div className="text-[#9A96AD] text-sm">
              Releases<span className="text-[#9A96AD]/50 mx-1">/</span>{r.title}
              <span className="text-[#9A96AD]/50 mx-1">/</span>
              <span className="text-neutral-50">Lyric Video</span>
            </div>
            {hookStart !== null && (
              <div className="font-mono rounded-full text-xs border-1 border-solid border-[#46E0A8]/40 text-[#46E0A8] bg-[#46E0A8]/5 px-3 py-1.5">
                ● hook found at {fmtTime(0)}
              </div>
            )}
          </div>

          <div className="flex px-12 py-8 items-start gap-10">
            {/* controls */}
            <div className="flex flex-col gap-6 max-w-xl flex-1">
              <div className="flex flex-col gap-2">
                <h1 className="font-bold text-3xl tracking-tight">Cut the hook.</h1>
                <p className="text-[#9A96AD] text-sm">
                  Auto-detect the words straight from your vocal, fix anything it misheard, and render a karaoke-style clip with exact timing.
                </p>
              </div>

              {!fileId && (
                <div className="flex flex-col gap-2">
                  <div className="uppercase text-[#9A96AD] text-xs tracking-widest">Audio</div>
                  <input ref={fileRef} type="file" accept="audio/*" className="hidden"
                    onChange={(e) => setAudioFile(e.target.files?.[0] || null)} />
                  <Button variant="ghost" onClick={() => fileRef.current?.click()}
                    className="justify-start gap-2 border border-white/10 text-[#9A96AD] hover:text-[#F2F0F7] hover:border-white/20 transition-colors">
                    <Music className="size-4" />
                    {audioFile ? audioFile.name : "Choose the track (or re-import first)"}
                  </Button>
                </div>
              )}

              {/* step 1 — detect */}
              <div className="edge rounded-2xl bg-[#15151C] border-white/8 border-1 border-solid p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium uppercase text-[#9A96AD] text-xs leading-4 tracking-[2.4px]">
                    1 · Detect the words
                  </span>
                  <Button
                    onClick={detect}
                    disabled={!fileId || detecting}
                    className="rounded-xl h-9 px-4 gap-2 disabled:opacity-40"
                  >
                    {detecting
                      ? (<><Loader2 className="size-3.5 animate-spin" />Listening (~40s)…</>)
                      : (<><AudioLines className="size-3.5" />Detect from vocals</>)}
                  </Button>
                </div>
                {fileId && hookStart !== null && (
                  <audio controls src={`${API}/hookclip/${fileId}`} className="w-full h-9" />
                )}
                {detectErr && <span className="text-sm text-[#F0A45B]">{detectErr}</span>}

                {/* editable word chips — the correction editor */}
                {words.length > 0 && (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {words.map((w, i) => (
                        <span
                          key={i}
                          className={
                            "group flex items-center gap-1 rounded-lg border px-2 py-1 " +
                            (lowConf(w)
                              ? "border-[#F0A45B]/40 bg-[#F0A45B]/10"
                              : "border-white/8 bg-[#1E1E28]")
                          }
                          title={`${fmtTime(w.start)} · confidence ${(w.conf ?? 1).toFixed(2)}`}
                        >
                          <input
                            value={w.word}
                            onChange={(e) => editWord(i, e.target.value)}
                            aria-label={`Word ${i + 1}`}
                            className="bg-transparent font-mono text-xs text-[#F2F0F7] focus:outline-none"
                            style={{ width: `${Math.max(2, w.word.length)}ch` }}
                          />
                          <button
                            onClick={() => dropWord(i)}
                            aria-label={`Remove word ${i + 1}`}
                            className="text-[#5E5A72] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[#F2F0F7]"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <span className="font-mono text-[11px] text-[#5E5A72]">
                      {words.length} words · amber = low confidence, click any word to fix it · timing stays locked to the vocal
                    </span>
                  </>
                )}
              </div>

              {/* step 2 — correct with real lyrics */}
              <div className="edge rounded-2xl bg-[#15151C] border-white/8 border-1 border-solid p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium uppercase text-[#9A96AD] text-xs leading-4 tracking-[2.4px] flex items-center gap-2">
                    2 · Or fix with your lyrics
                    {release?.lyrics && (
                      <span className="normal-case tracking-normal rounded-full bg-[#46E0A8]/10 text-[#46E0A8] text-[10px] px-2 py-0.5">imported with the track</span>
                    )}
                  </span>
                  <Button
                    variant="ghost"
                    onClick={applyLyrics}
                    disabled={!lyrics.trim() || !words.length}
                    className="border border-white/8 text-[#9A96AD] hover:text-[#F2F0F7] rounded-xl h-9 px-3 gap-1.5 disabled:opacity-40"
                  >
                    <Wand2 className="size-3.5" />
                    Apply to timing
                  </Button>
                </div>
                <Textarea
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  placeholder={"Paste the full lyrics — detection finds the timing,\nyour words replace anything misheard."}
                  className="min-h-28 font-mono rounded-lg bg-[#1E1E28] text-neutral-50 text-sm border-white/10 border-1 border-solid"
                />
              </div>

              {/* background choice */}
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-[#5E5A72]">Background</span>
                <button
                  onClick={() => setBg("cover")}
                  className={"rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                    (bg === "cover" ? "border-violet-500 bg-violet-500/15 text-[#F2F0F7]" : "border-white/10 text-[#9A96AD] hover:border-white/20")}
                >
                  Cover art
                </button>
                <button
                  onClick={() => brollUp && setBg("broll")}
                  disabled={!brollUp}
                  title={brollUp ? "Aesthetic footage cut on the beat" : "Needs the free Pexels key on the engine (PEXELS_KEY)"}
                  className={"rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                    (bg === "broll" ? "border-violet-500 bg-violet-500/15 text-[#F2F0F7]"
                      : brollUp ? "border-white/10 text-[#9A96AD] hover:border-white/20"
                      : "border-white/8 text-[#5E5A72] opacity-60 cursor-not-allowed")}
                >
                  B-roll footage{!brollUp && <span className="ml-1.5 font-mono text-[9px] uppercase tracking-wider text-[#F0A45B]">key</span>}
                </button>
              </div>

              {/* step 3 — render */}
              <Button
                disabled={!hasAudio || (!lyrics.trim() && !words.length) || status === "rendering"}
                onClick={render}
                className="rounded-xl text-white gap-2 w-full py-6 font-semibold disabled:opacity-40"
              >
                {status === "rendering"
                  ? (<><Loader2 className="size-4 animate-spin" />Rendering with your exact words (~1-2 min)…</>)
                  : (<><Clapperboard className="size-4" />3 · Generate 15s lyric video</>)}
              </Button>
              {err && <div className="text-sm text-red-400">{err}</div>}
            </div>

            {/* phone preview */}
            <div className="shrink-0 flex flex-col items-center gap-3">
              <div className="rounded-[36px] border-white/10 border-1 border-solid bg-black p-3">
                <div className="relative rounded-3xl bg-[#15151C] overflow-hidden" style={{ width: 300, height: 533 }}>
                  {videoUrl ? (
                    <video src={videoUrl} controls loop className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-[#5E5A72]">
                      {status === "rendering"
                        ? (<><Loader2 className="size-6 animate-spin text-violet-500" /><span className="text-xs font-mono">rendering…</span></>)
                        : (<><Clapperboard className="size-6" /><span className="text-xs font-mono">your clip renders here</span></>)}
                    </div>
                  )}
                </div>
              </div>
              {status === "done" && (
                <Button variant="ghost" onClick={download} className="text-[#9A96AD] hover:text-[#F2F0F7] transition-colors gap-2">
                  <Download className="size-4" />Download MP4
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </ProGate>
  );
}
