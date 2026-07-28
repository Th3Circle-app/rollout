import { useRef, useState } from "react";
import {
  ArrowRight, AudioLines, FileText, Layers, Package, Settings, Upload, X, Zap, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore, deriveTitleArtist, FREE_SONG_LIMIT } from "@/store";
import { supabase } from "@/lib/supabase";

const API = "http://127.0.0.1:8000";

type Result = {
  filename: string; key: string; bpm: number; duration: string;
  moods: string[]; keywords: string[]; file_id?: string; genre?: string;
};

export default function App() {
  const { go, setRelease, plan, openUpgrade, songsUsed, useSongSlot } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const lyricFileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "analyzing" | "done" | "error">("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [lyrics, setLyrics] = useState("");

  async function handleFile(f: File) {
    // Cloud mode: the SERVER meters free slots (client can't cheat).
    if (supabase) {
      try {
        const { data, error } = await supabase.rpc("rollout_consume_song_slot", { fname: f.name });
        if (!error && data && data.ok === false) {
          openUpgrade("Your free song is used — unlock unlimited releases");
          return;
        }
      } catch { /* engine of record unavailable — fall through to local gate */ }
    }
    // Local-mode gate (and belt-and-suspenders alongside cloud)
    if (plan !== "pro" && songsUsed >= FREE_SONG_LIMIT) {
      openUpgrade(
        FREE_SONG_LIMIT === 1
          ? "Your free song is used — unlock unlimited releases"
          : `Your ${FREE_SONG_LIMIT} free songs are used — unlock unlimited releases`
      );
      return;
    }
    setName(f.name);
    setStatus("analyzing");
    setErr("");
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch(`${API}/analyze`, { method: "POST", body: fd });
      if (!r.ok) throw new Error("Analysis failed");
      setResult(await r.json());
      setStatus("done");
      useSongSlot(f.name); // burn a free slot only on success
    } catch (e: any) {
      setErr(e?.message || "Could not reach the analyzer");
      setStatus("error");
    }
  }

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const fmt = (name.split(".").pop() || "wav").toUpperCase();
  const chip = (t: string) => (
    <div key={t} className="rounded-lg bg-[#1E1E28] border-white/8 border-1 border-solid flex px-3 py-1.5 items-center gap-2">
      <span className="font-mono text-[#F2F0F7] text-xs leading-4">{t}</span>
      <span className="font-semibold uppercase rounded-sm bg-[#F0A45B]/10 text-[#F0A45B] text-[9px] tracking-wider px-1.5 py-0.5">detected</span>
    </div>
  );

  return (
    <div>
      <div className="text-neutral-50 min-h-screen">
        {/* main */}
        <div className="min-h-screen flex flex-col flex-1">
          <div className="flex px-6 xl:px-12 pt-8 justify-end">
            <div className="rounded-full bg-[#15151C] border-white/8 border-1 border-solid flex px-3 py-1.5 items-center gap-2">
              <span className="font-mono text-[#5E5A72] text-[11px] tracking-wide">
                {plan === "pro"
                  ? "unlimited releases"
                  : `${Math.max(0, FREE_SONG_LIMIT - songsUsed)} of ${FREE_SONG_LIMIT} free ${FREE_SONG_LIMIT === 1 ? "song" : "songs"} left`}
              </span>
            </div>
          </div>

          <div className="flex px-6 xl:px-12 pb-16 flex-col justify-center items-center flex-1">
            <div className="max-w-[720px] text-center flex mb-10 flex-col items-center gap-3 w-full">
              <span className="font-semibold uppercase text-violet-500 text-[11px] tracking-[3.2px]">New Release</span>
              <h1 className="font-bold text-[#F2F0F7] text-5xl leading-12 tracking-tight">Start a release.</h1>
              <p className="text-[#9A96AD] text-base leading-6">Drop a finished track. Rollout reads it and builds the rest.</p>
            </div>

            <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={onPick} />

            {/* IDLE: dropzone */}
            {status === "idle" && (
              <div
                onClick={() => fileRef.current?.click()}
                onDrop={onDrop}
                onDragOver={(e) => e.preventDefault()}
                className="max-w-[720px] edge rounded-3xl bg-[#15151C] border-white/16 border-1 border-dashed flex p-16 flex-col items-center gap-4 w-full cursor-pointer hover:border-violet-500/60 transition-colors"
              >
                <div className="size-14 rounded-2xl bg-[#1E1E28] border-white/8 border-1 border-solid flex justify-center items-center">
                  <Upload className="size-6 text-violet-500" />
                </div>
                <span className="font-bold text-[#F2F0F7] text-lg">Drop your track</span>
                <span className="font-mono text-[#5E5A72] text-xs">WAV, MP3, or AIFF · click to browse</span>
              </div>
            )}

            {/* ANALYZING / DONE / ERROR: result card */}
            {status !== "idle" && (
              <div className="max-w-[720px] edge rounded-3xl bg-[#15151C] border-white/16 border-1 border-dashed flex p-10 flex-col gap-8 w-full">
                <div className="flex justify-between items-start gap-6">
                  <div className="flex items-center gap-4">
                    <div className="size-12 rounded-2xl bg-[#1E1E28] border-white/8 border-1 border-solid flex justify-center items-center">
                      <AudioLines className="size-5 text-violet-500" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="font-bold text-[#F2F0F7] text-lg leading-7 tracking-tight">{name}</span>
                      <span className="font-mono text-[#5E5A72] text-xs leading-4 flex items-center gap-1.5">
                        {status === "analyzing" && (<><Loader2 className="size-3 animate-spin" /> Analyzing vibe...</>)}
                        {status === "done" && "Analysis complete"}
                        {status === "error" && <span className="text-red-400">{err}</span>}
                      </span>
                    </div>
                  </div>
                  <button aria-label="Clear file" onClick={() => { setStatus("idle"); setResult(null); }}><X className="size-4 text-[#5E5A72]" /></button>
                </div>

                <div className={"flex px-1 items-end gap-[3px] h-16 " + (status === "analyzing" ? "animate-pulse" : "")}>
                  {[4,8,12,16,10,6,14,16,9,5,11,15,8,6,13,16,10,4,12,7,14,9,16,6].map((h, i) => (
                    <div key={i} className="rounded-full bg-violet-500/70 w-1" style={{ height: h * 4 }} />
                  ))}
                </div>

                {status === "done" && result && (
                  <>
                    <div className="border-white/8 border-t-1 border-solid flex pt-4 flex-wrap items-center gap-3">
                      {[result.key, `${result.bpm} BPM`, result.duration, fmt].map(chip)}
                    </div>
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap gap-2">
                        <span className="font-mono text-[#5E5A72] text-[11px] uppercase tracking-wider pt-1">Vibe</span>
                        {result.genre && (
                          <span className="rounded-full bg-violet-500/15 border border-violet-500/40 text-[#F2F0F7] text-xs px-3 py-1 capitalize">{result.genre}</span>
                        )}
                        {result.moods.map((m) => (
                          <span key={m} className="rounded-full bg-[#1E1E28] text-[#F2F0F7] border border-white/8 text-xs px-3 py-1 capitalize">{m}</span>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="font-mono text-[#5E5A72] text-[11px] uppercase tracking-wider pt-1">Visual keywords</span>
                        {result.keywords.map((k) => (
                          <span key={k} className="rounded-full bg-[#1E1E28] text-[#9A96AD] text-xs px-3 py-1">{k}</span>
                        ))}
                      </div>
                    </div>

                    {/* lyric import — powers the lyric video + caption quotes */}
                    <div className="border-white/8 border-t-1 border-solid flex pt-6 flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[#5E5A72] text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                          <FileText className="size-3" /> Lyrics
                          <span className="normal-case tracking-normal text-[#5E5A72]">— unlocks the synced lyric video &amp; lyric-quote captions</span>
                        </span>
                        <button
                          onClick={() => lyricFileRef.current?.click()}
                          className="font-mono text-[11px] text-violet-500 hover:text-[#F2F0F7]"
                        >
                          upload .txt
                        </button>
                        <input
                          ref={lyricFileRef}
                          type="file"
                          accept=".txt,text/plain"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (f) setLyrics(await f.text());
                          }}
                        />
                      </div>
                      <textarea
                        value={lyrics}
                        onChange={(e) => setLyrics(e.target.value)}
                        placeholder={"Paste the full lyrics here...\n(optional — but the lyric video needs them)"}
                        className="min-h-32 w-full resize-y rounded-xl bg-[#1E1E28] border border-white/8 px-4 py-3 font-mono text-sm text-[#F2F0F7] placeholder:text-[#5E5A72] focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                      />
                      {lyrics.trim() && (
                        <span className="font-mono text-[11px] text-[#46E0A8]">
                          ✓ {lyrics.trim().split(/\s+/).length} words — lyric video &amp; quote captions unlocked
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex mt-8 items-center gap-4">
              <Button
                disabled={status !== "done"}
                onClick={async () => {
                  if (!result) return;
                  const { title, artist } = deriveTitleArtist(result.filename || name);
                  let refined = result;
                  // lyrics refine the vibe (fast — audio embedding is cached)
                  if (lyrics.trim() && result.file_id) {
                    try {
                      const res = await fetch(`${API}/revibe`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          file_id: result.file_id, lyrics: lyrics.trim(),
                          mode: result.key.toLowerCase().includes("minor") ? "minor" : "major",
                          bpm: result.bpm,
                        }),
                      });
                      if (res.ok) {
                        const v = await res.json();
                        refined = { ...result, moods: v.moods, genre: v.genre };
                      }
                    } catch { /* keep original read */ }
                  }
                  setRelease({ ...refined, title, artist: artist || "", lyrics: lyrics.trim() });
                  go("Build"); // original flow: Import -> Building -> Ready -> hub
                }}
                className="font-semibold rounded-xl bg-violet-500 hover:bg-[#7c4dec] text-white text-sm leading-5 p-6 gap-2 disabled:opacity-40"
              >
                Build my rollout <ArrowRight className="size-4" />
              </Button>
              <Button variant="ghost" onClick={() => fileRef.current?.click()} className="font-medium rounded-xl text-[#9A96AD] text-sm leading-5 p-6">
                {status === "idle" ? "Browse files" : "Choose a different file"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
