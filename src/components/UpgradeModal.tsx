import { Check, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";

const PRO_PERKS = [
  "Unlimited AI covers + regenerates",
  "Social video cutdowns (TikTok, Reels, Shorts)",
  "Lyric video generator",
  "Ad center (Meta + Google)",
  "Custom domain on your release page",
];

export default function UpgradeModal() {
  const { upgrade, closeUpgrade, setPlan } = useStore();
  if (!upgrade.open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={closeUpgrade}
    >
      <div
        className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#15151C] p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={closeUpgrade} className="absolute right-5 top-5 text-[#5E5A72] hover:text-white">
          <X className="size-5" />
        </button>

        <div className="mb-5 flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-xl btn-glow">
            <Sparkles className="size-5 text-white" />
          </div>
          <span className="font-semibold uppercase tracking-[3px] text-violet-500 text-xs">Rollout Pro</span>
        </div>

        <h2 className="text-2xl font-bold tracking-tight text-white">
          {upgrade.feature || "Unlock the full rollout"}
        </h2>
        <p className="mt-2 text-sm text-[#9A96AD]">
          Free gives you the analysis, one cover, and one release page. Pro opens everything else.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          {PRO_PERKS.map((p) => (
            <div key={p} className="flex items-center gap-3">
              <Check className="size-4 shrink-0 text-[#46E0A8]" />
              <span className="text-sm text-[#F2F0F7]">{p}</span>
            </div>
          ))}
        </div>

        <div className="mt-7 flex items-end justify-between rounded-2xl bg-[#15151C] border border-white/10 px-5 py-4">
          <div>
            <div className="text-2xl font-bold text-white">$12<span className="text-sm font-normal text-[#9A96AD]">/mo</span></div>
            <div className="text-xs text-[#5e5a72]">Cancel anytime</div>
          </div>
          <Button
            onClick={() => { setPlan("pro"); closeUpgrade(); }}
            className="btn-glow rounded-xl px-6 py-5 font-semibold text-white"
          >
            Go Pro
          </Button>
        </div>
        <p className="mt-3 text-center text-[11px] text-[#5e5a72]">
          Demo: this flips you to Pro instantly. In production this is Stripe checkout.
        </p>
      </div>
    </div>
  );
}
