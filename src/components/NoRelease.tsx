import { Music, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";

/**
 * Shown by any studio tool page when the account has no release yet.
 * Replaces the old hardcoded "Afterglow / Nova" demo track so a fresh or
 * wiped account never sees leftover-looking content — it invites an import.
 */
export default function NoRelease({ tool = "this" }: { tool?: string }) {
  const { go } = useStore();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-8 text-center">
      <div className="grid size-16 place-items-center rounded-2xl bg-white/[0.05] border border-white/10">
        <Music className="size-7 text-violet-300/80" />
      </div>
      <div className="flex flex-col gap-2 max-w-sm">
        <h1 className="text-2xl font-extrabold tracking-tight text-white">No track yet</h1>
        <p className="text-[#9A96AD] leading-relaxed">
          Import a finished track first, then {tool} unlocks around it.
        </p>
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
