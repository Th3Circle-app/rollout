import { useState } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore, checkoutUrl } from "@/store";
import { cloudEnabled } from "@/lib/supabase";

// Two paid tiers. Artist = release properly. Studio = market like a machine.
const TIERS: {
  id: "artist" | "studio";
  name: string;
  month: number;
  year: number;
  tag: string;
  perks: string[];
}[] = [
  {
    id: "artist",
    name: "Artist",
    month: 15,
    year: 150,
    tag: "Release properly",
    perks: [
      "Unlimited songs",
      "3000×3000 cover exports",
      "Captions + one-click posting",
      "Photo-to-cover (all modes)",
      "Your own fan page",
    ],
  },
  {
    id: "studio",
    name: "Studio",
    month: 20,
    year: 200,
    tag: "Market like a machine",
    perks: [
      "Everything in Artist",
      "Beat-synced lyric videos",
      "B-roll video montages",
      "Ad Center (Meta + Google)",
      "First access to premium AI models",
    ],
  },
];

export default function UpgradeModal() {
  const { upgrade, closeUpgrade, setPlan, plan, session, refreshPlan } = useStore();
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [waiting, setWaiting] = useState(false);
  if (!upgrade.open) return null;

  const buy = (tier: "artist" | "studio") => {
    if (!cloudEnabled) {
      setPlan(tier); // local demo mode
      closeUpgrade();
      return;
    }
    const url = checkoutUrl(tier, interval, session?.user.id, session?.user.email ?? undefined);
    window.open(url, "_blank");
    setWaiting(true);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={closeUpgrade}
    >
      <div
        className="edge relative w-full max-w-2xl rounded-3xl border border-white/10 bg-[#15151C] p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={closeUpgrade} aria-label="Close" className="absolute right-5 top-5 text-[#5E5A72] hover:text-white">
          <X className="size-5" />
        </button>

        <h2 className="text-2xl font-bold tracking-tight text-white pr-8">
          {upgrade.feature || "Unlock the full rollout"}
        </h2>
        <p className="mt-2 text-sm text-[#9A96AD]">
          Your free song showed you what Rollout hears. Pick how far you want to take the next one.
        </p>

        {/* interval toggle */}
        <div className="mt-5 inline-flex rounded-full border border-white/10 p-1">
          {(["month", "year"] as const).map((iv) => (
            <button
              key={iv}
              onClick={() => setInterval(iv)}
              className={
                "rounded-full px-4 py-1.5 text-xs font-medium transition-colors " +
                (interval === iv ? "bg-violet-500 text-white" : "text-[#9A96AD] hover:text-[#F2F0F7]")
              }
            >
              {iv === "month" ? "Monthly" : "Annual · 2 months free"}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {TIERS.map((t) => {
            const current = plan === t.id;
            const price = interval === "month" ? t.month : t.year;
            return (
              <div
                key={t.id}
                className={
                  "edge flex flex-col rounded-2xl border p-5 " +
                  (t.id === "studio" ? "border-violet-500/50 bg-violet-500/[.04]" : "border-white/10 bg-[#0B0B0F]")
                }
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-bold text-[#F2F0F7]">{t.name}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#5E5A72]">{t.tag}</span>
                </div>
                <div className="mt-2 text-3xl font-bold text-white">
                  ${price}
                  <span className="text-sm font-normal text-[#9A96AD]">/{interval === "month" ? "mo" : "yr"}</span>
                </div>
                <div className="mt-4 flex flex-col gap-2.5 flex-1">
                  {t.perks.map((p) => (
                    <div key={p} className="flex items-center gap-2.5">
                      <Check className="size-3.5 shrink-0 text-[#46E0A8]" />
                      <span className="text-[13px] text-[#F2F0F7]">{p}</span>
                    </div>
                  ))}
                </div>
                <Button
                  onClick={() => buy(t.id)}
                  disabled={current}
                  className={
                    "mt-5 w-full rounded-xl py-5 font-semibold " +
                    (t.id === "studio" ? "bg-violet-500 hover:bg-[#7C4DEC] text-white" : "bg-[#F2F0F7] text-[#0B0B0F] hover:bg-white")
                  }
                >
                  {current ? "Your plan" : `Get ${t.name}`}
                </Button>
              </div>
            );
          })}
        </div>

        {waiting && cloudEnabled ? (
          <button
            onClick={() => refreshPlan()}
            className="mt-4 flex w-full items-center justify-center gap-2 text-xs text-[#9A96AD] hover:text-[#F2F0F7]"
          >
            <RefreshCw className="size-3" />
            Paid in the other tab? Click to refresh your plan.
          </button>
        ) : (
          <p className="mt-4 text-center text-[11px] text-[#5E5A72]">
            {cloudEnabled ? "Secure checkout by Stripe. Cancel anytime." : "Demo mode: flips instantly."}
          </p>
        )}
      </div>
    </div>
  );
}
