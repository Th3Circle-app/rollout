import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

/**
 * A modern, futuristic audio player — a glass pill with a glowing violet
 * play control, a gradient scrubber, and a live equalizer that pulses while
 * playing. Replaces the browser's default <audio controls> chrome.
 *
 * `elRef` (optional) is attached to the underlying <audio> so a parent can read
 * currentTime (e.g. the section picker's "use this spot").
 */
export default function AudioPlayer({
  src,
  elRef,
  onLoadedMetadata,
}: {
  src: string;
  elRef?: React.RefObject<HTMLAudioElement | null>;
  onLoadedMetadata?: (e: React.SyntheticEvent<HTMLAudioElement>) => void;
}) {
  const localRef = useRef<HTMLAudioElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  const audio = () => elRef?.current ?? localRef.current;

  useEffect(() => {
    // reset when the source changes
    setPlaying(false);
    setCur(0);
  }, [src]);

  const clock = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60) || 0).padStart(2, "0")}`;

  const toggle = () => {
    const a = audio();
    if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); }
    else { a.pause(); setPlaying(false); }
  };

  const seek = (clientX: number) => {
    const a = audio();
    const bar = barRef.current;
    if (!a || !bar || !dur) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    a.currentTime = ratio * dur;
    setCur(a.currentTime);
  };

  const pct = dur ? (cur / dur) * 100 : 0;

  return (
    <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-2 backdrop-blur-md">
      <audio
        ref={(node) => {
          localRef.current = node;
          if (elRef) (elRef as React.MutableRefObject<HTMLAudioElement | null>).current = node;
        }}
        src={src}
        onTimeUpdate={(e) => setCur((e.target as HTMLAudioElement).currentTime)}
        onLoadedMetadata={(e) => { setDur((e.target as HTMLAudioElement).duration || 0); onLoadedMetadata?.(e); }}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-white transition-transform hover:scale-105 active:scale-95"
        style={{ boxShadow: "0 0 18px rgba(139,92,246,0.55), inset 0 1px 0 rgba(255,255,255,0.25)" }}
      >
        {playing ? <Pause className="size-4" fill="currentColor" /> : <Play className="ml-0.5 size-4" fill="currentColor" />}
      </button>

      {/* live equalizer — pulses only while playing */}
      <div className="flex h-5 items-end gap-[3px]" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="w-[3px] rounded-full bg-gradient-to-t from-violet-500 to-fuchsia-400"
            style={{
              height: playing ? undefined : "5px",
              animation: playing ? `eq 900ms ${i * 120}ms ease-in-out infinite` : "none",
            }}
          />
        ))}
      </div>

      {/* scrubber */}
      <div
        ref={barRef}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); seek(e.clientX); }}
        onPointerMove={(e) => { if (e.buttons === 1) seek(e.clientX); }}
        className="group relative h-4 flex-1 cursor-pointer"
      >
        <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400"
            style={{ width: `${pct}%`, boxShadow: "0 0 10px rgba(217,120,246,0.6)" }}
          />
        </div>
        <div
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 transition-opacity group-hover:opacity-100"
          style={{ left: `${pct}%`, boxShadow: "0 0 10px rgba(255,255,255,0.8)" }}
        />
      </div>

      <span className="shrink-0 font-mono text-[10px] tabular-nums text-[#9A96AD]">
        {clock(cur)} / {clock(dur)}
      </span>

      <style>{`@keyframes eq { 0%,100% { height: 5px } 50% { height: 20px } }`}</style>
    </div>
  );
}
