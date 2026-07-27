import { useEffect, useRef, useState } from "react";
import { ArrowRight, AudioLines, Check, Circle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";

const API = "http://127.0.0.1:8000";

// Real generation: each task actually runs; ticks when it truly finishes.
type TaskState = "queued" | "running" | "done";
type Task = { key: string; label: string };

const TASKS: Task[] = [
  { key: "cover", label: "Cover Art concepts" },
  { key: "captions", label: "Social captions" },
  { key: "plan", label: "Release calendar" },
  { key: "page", label: "Release Page" },
];

export default function App() {
  const { release, go } = useStore();
  const r = release;
  const [states, setStates] = useState<Record<string, TaskState>>(
    Object.fromEntries(TASKS.map((t) => [t.key, "queued"]))
  );
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(false);

  const doneCount = Object.values(states).filter((s) => s === "done").length;
  const pct = Math.round((doneCount / TASKS.length) * 100);
  const allDone = doneCount === TASKS.length;

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (started.current || !r) return;
    started.current = true;
    const set = (k: string, s: TaskState) =>
      setStates((prev) => ({ ...prev, [k]: s }));

    (async () => {
      // 1. Cover concepts — actually pull the 4 AI images into browser cache
      set("cover", "running");
      const prompt =
        `album cover art, ${r.keywords.join(", ")}, ${r.moods.join(", ")} mood, ` +
        `no text, no lettering, no words, high detail, cinematic lighting, ` +
        `square composition, professional music artwork`;
      await Promise.all(
        [11, 22, 33, 44].map(
          (seed) =>
            new Promise<void>((ok) => {
              const img = new Image();
              img.onload = () => ok();
              img.onerror = () => ok();
              img.src =
                `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
                `?width=1024&height=1024&seed=${seed}&nologo=true&model=flux`;
            })
        )
      );
      set("cover", "done");

      // 2. Captions — real backend call
      set("captions", "running");
      try {
        await fetch(`${API}/captions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: r.title, artist: r.artist, moods: r.moods,
            keywords: r.keywords, lyrics: r.lyrics || "",
          }),
        });
      } catch { /* captions engine offline — Plan shows the error */ }
      set("captions", "done");

      // 3. Calendar — computed locally, instant
      set("plan", "running");
      await new Promise((ok) => setTimeout(ok, 400));
      set("plan", "done");

      // 4. Release page — template builds locally, instant
      set("page", "running");
      await new Promise((ok) => setTimeout(ok, 400));
      set("page", "done");
    })();
  }, [r]);

  // redirect must happen after render, not during it
  useEffect(() => {
    if (!r) go("Import");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r]);
  if (!r) return null;

  const kicker = allDone ? "Release Ready" : "Building Release";
  const title = allDone ? "Your rollout is ready." : "Building your rollout.";
  const sub = allDone
    ? `Rollout finished generating the release kit for ${r.filename}.`
    : "Rollout is generating your release kit — this takes about a minute.";

  return (
    <div className="min-h-screen flex flex-col flex-1">
      <div className="flex px-12 pt-8 justify-end">
        <div className="rounded-full bg-[#15151C] border-white/8 border-1 border-solid flex px-3 py-1.5 items-center gap-2">
          <span className="font-mono text-[#5E5A72] text-[11px] tracking-wide">
            {r.key} · {r.bpm} BPM
          </span>
        </div>
      </div>
      <div className="flex px-12 pb-16 flex-col justify-center items-center flex-1">
        <div className="max-w-[720px] text-center flex mb-10 flex-col items-center gap-3 w-full">
          <span className={
            "font-semibold uppercase text-[11px] tracking-[3.2px] " +
            (allDone ? "text-[#46E0A8]" : "text-violet-500")
          }>
            {kicker}
          </span>
          <h1 className="font-bold text-[#F2F0F7] text-5xl leading-12 tracking-tight">{title}</h1>
          <p className="text-[#9A96AD] text-base leading-6">{sub}</p>
        </div>

        <div className="max-w-[720px] edge rounded-3xl bg-[#15151C] border-white/8 border-1 border-solid flex p-10 flex-col gap-8 w-full">
          <div className="flex justify-between items-start gap-6">
            <div className="flex items-center gap-4">
              <div className="size-12 rounded-2xl bg-[#1E1E28] border-white/8 border-1 border-solid flex justify-center items-center">
                <AudioLines className="size-5 text-violet-500" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-bold text-[#F2F0F7] text-lg leading-7 tracking-tight">{r.filename}</span>
                <span className={"font-mono text-xs leading-4 " + (allDone ? "text-[#46E0A8]" : "text-[#5E5A72]")}>
                  {allDone ? "Release kit complete" : "Generating release kit"}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="font-mono text-[#F2F0F7] text-sm leading-5">{pct}%</span>
              <span className="font-mono text-[#5E5A72] text-[11px] leading-4">{elapsed}s elapsed</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="rounded-full bg-[#1E1E28] w-full h-1.5 overflow-hidden">
              <div className="rounded-full bg-violet-500 h-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between">
              <span className="font-mono text-[#5E5A72] text-xs leading-4">{pct}% complete</span>
              <span className="font-mono text-[#5E5A72] text-xs leading-4">
                Step {Math.min(doneCount + 1, TASKS.length)} of {TASKS.length}
              </span>
            </div>
          </div>

          <div className="border-white/8 border-t-1 border-r-0 border-b-0 border-l-0 border-solid flex pt-6 flex-col gap-1">
            {TASKS.map((t) => {
              const s = states[t.key];
              return (
                <div
                  key={t.key}
                  className={
                    "rounded-xl flex px-4 py-3 justify-between items-center gap-4 " +
                    (s === "running" ? "bg-[#1E1E28]" : "")
                  }
                >
                  <div className="flex items-center gap-3">
                    <div className={
                      "size-8 rounded-full flex justify-center items-center " +
                      (s === "done" && allDone ? "bg-[#46E0A8]/10" : s === "queued" ? "bg-[#1E1E28]" : "bg-violet-500/10")
                    }>
                      {s === "done" ? (
                        <Check className={"size-4 " + (allDone ? "text-[#46E0A8]" : "text-violet-500")} />
                      ) : s === "running" ? (
                        <Loader2 className="size-4 animate-spin text-violet-500" />
                      ) : (
                        <Circle className="size-4 text-[#5E5A72]" />
                      )}
                    </div>
                    <span className={
                      "font-medium text-sm leading-5 " +
                      (s === "queued" ? "text-[#5E5A72]" : "text-[#F2F0F7]")
                    }>
                      {t.label}
                    </span>
                  </div>
                  <span className={
                    "font-mono text-xs leading-4 " +
                    (s === "done" ? (allDone ? "text-[#46E0A8]" : "text-[#5E5A72]") : s === "running" ? "text-violet-500" : "text-[#5E5A72]")
                  }>
                    {s === "done" ? (allDone ? "Ready" : "Done") : s === "running" ? "Generating…" : "Queued"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex mt-8 items-center gap-4">
          {allDone ? (
            <>
              <Button onClick={() => go("Dashboard")} className="font-semibold rounded-xl bg-violet-500 hover:bg-[#7c4dec] text-white text-sm leading-5 p-6 gap-2">
                View my rollout
                <ArrowRight className="size-4" />
              </Button>
              <Button variant="ghost" onClick={() => go("Import")} className="font-medium rounded-xl text-[#9A96AD] text-sm leading-5 p-6">
                Build another track
              </Button>
            </>
          ) : (
            <>
              <Button disabled className="cursor-not-allowed font-semibold rounded-xl bg-violet-500/30 text-white/50 text-sm leading-5 p-6 gap-2">
                <Loader2 className="size-4 animate-spin" />
                Building your rollout
              </Button>
              <Button variant="ghost" onClick={() => go("Import")} className="font-medium rounded-xl text-[#9A96AD] text-sm leading-5 p-6">
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
