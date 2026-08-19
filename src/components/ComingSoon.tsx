import { Sparkles, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";

/**
 * Full-page "Coming Soon" state for a studio feature that's parked until it's
 * hardened for release (e.g. the AI Cover Studio — held back until revenue funds
 * a fast, reliable generator). Keeps the studio feeling finished rather than
 * shipping a half-working tool.
 */
export default function ComingSoon({
  title = "Coming soon",
  blurb = "We're polishing this one before it ships.",
}: { title?: string; blurb?: string }) {
  const { go } = useStore();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-8 text-center">
      <div className="grid size-16 place-items-center rounded-2xl bg-white/[0.05] border border-white/10">
        <Sparkles className="size-7 text-violet-300/80" />
      </div>
      <div className="flex flex-col gap-2 max-w-md">
        <span className="mx-auto rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-violet-300">
          In development
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">{title}</h1>
        <p className="text-[#9A96AD] leading-relaxed">{blurb}</p>
      </div>
      <Button
        onClick={() => go("Dashboard")}
        variant="ghost"
        className="rounded-full h-10 px-5 gap-2 border border-white/10 text-[#9A96AD] hover:text-white"
      >
        <ArrowLeft className="size-4" /> Back to your release
      </Button>
    </div>
  );
}
