import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { FONT_LIBRARY, fontFamily, ensureFontsLoaded } from "@/lib/fonts";

// A dropdown of the whole font library, each option previewed in its own font.
// value / onChange use the font `id`. Works on the cover typography, the lyric
// video, and anywhere else fonts are chosen.
export default function FontSelect({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { ensureFontsLoaded(); }, []);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const current = FONT_LIBRARY.find((f) => f.id === value);

  return (
    <div ref={ref} className={"relative " + className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/12 bg-[#1E1E28] px-3.5 py-2.5 text-sm text-[#F2F0F7] transition-colors hover:border-white/25"
      >
        <span style={{ fontFamily: fontFamily(value) }} className="truncate text-[15px]">
          {current?.label || "Choose a font"}
        </span>
        <ChevronDown className={"size-4 shrink-0 text-[#9A96AD] transition-transform " + (open ? "rotate-180" : "")} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1.5 max-h-80 w-full min-w-[220px] overflow-y-auto rounded-xl border border-white/12 bg-[#15151C] p-1 shadow-2xl">
          {FONT_LIBRARY.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => { onChange(f.id); setOpen(false); }}
              className={
                "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors " +
                (value === f.id ? "bg-violet-500/15" : "hover:bg-white/[0.05]")
              }
            >
              <span style={{ fontFamily: fontFamily(f.id) }} className="truncate text-[16px] text-[#F2F0F7]">
                {f.label}
              </span>
              <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-[#5E5A72]">{f.category}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
