import type { ReactNode } from "react";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore, isPaid, isStudio } from "@/store";

// Wraps a paid feature. tier="artist" unlocks for any paid plan;
// tier="studio" needs the top plan. CTA opens the tier picker.
export default function ProGate({
  feature,
  blurb,
  tier = "artist",
  children,
}: {
  feature: string;
  blurb: string;
  tier?: "artist" | "studio";
  children: ReactNode;
}) {
  const { plan, openUpgrade } = useStore();
  const unlocked = tier === "studio" ? isStudio(plan) : isPaid(plan);
  if (unlocked) return <>{children}</>;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-sm brightness-[.4]">{children}</div>
      <div className="absolute inset-0 z-40 flex items-center justify-center p-6">
        <div className="edge w-full max-w-sm rounded-3xl border border-white/10 bg-[#15151C] p-8 text-center backdrop-blur">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-violet-500/15">
            <Lock className="size-5 text-violet-500" />
          </div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-[3px] text-violet-500">
            {tier === "studio" ? "Rollout Studio" : "Rollout Artist"}
          </div>
          <h2 className="text-xl font-bold text-white">{feature}</h2>
          <p className="mt-2 text-sm text-[#9A96AD]">{blurb}</p>
          <Button
            onClick={() => openUpgrade(feature)}
            className="mt-6 w-full gap-2 rounded-xl bg-violet-500 hover:bg-[#7C4DEC] py-5 font-semibold text-white"
          >
            <Sparkles className="size-4" />
            {tier === "studio" ? "Unlock with Studio — $20/mo" : "Unlock with Artist — $15/mo"}
          </Button>
        </div>
      </div>
    </div>
  );
}
