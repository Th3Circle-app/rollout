import { useState } from "react";
import { Check, Zap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TIERS } from "@/components/UpgradeModal";
import { useStore, checkoutUrl, trialUrl, TRIAL_PRICE, TRIAL_DAYS, FREE_SONG_LIMIT } from "@/store";
import { cloudEnabled } from "@/lib/supabase";

// Standalone plans page (borrowed from open-saas' PricingPage) — a browsable,
// linkable comparison that reuses the same tier data + Stripe checkout wiring as
// the upgrade modal, and adds the Free column.
export default function Pricing() {
  const { plan, session, setPlan, refreshPlan, go } = useStore();
  const [interval, setIntervalState] = useState<"month" | "year">("month");
  const [waiting, setWaiting] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);

  const buy = (tier: "artist" | "studio") => {
    if (!cloudEnabled) { setPlan(tier); return; }
    if (!session?.user?.id) { setNeedsAuth(true); return; }
    window.open(checkoutUrl(tier, interval, session.user.id, session.user.email ?? undefined), "_blank", "noopener,noreferrer");
    setWaiting(true);
  };
  const startTrial = () => {
    if (!cloudEnabled) { setPlan("artist"); return; }
    if (!session?.user?.id) { setNeedsAuth(true); return; }
    window.open(trialUrl(session.user.id, session.user.email ?? undefined), "_blank", "noopener,noreferrer");
    setWaiting(true);
  };

  return (
    <div className="min-h-screen flex flex-col flex-1">
      <div className="flex px-6 xl:px-12 pt-10 flex-col items-center gap-2 text-center">
        <span className="kicker kicker-center">Plans</span>
        <h1 className="page-title text-[44px]">Pick your rollout.</h1>
        <p className="max-w-lg text-[#9A96AD] text-[17px] leading-7">
          Start free. Upgrade when you're ready to release properly and market like a machine.
        </p>

        {/* interval toggle */}
        <div className="mt-4 inline-flex rounded-full border border-white/10 p-1">
          {(["month", "year"] as const).map((iv) => (
            <button
              key={iv}
              onClick={() => setIntervalState(iv)}
              className={
                "rounded-full px-4 py-1.5 text-xs font-medium transition-colors " +
                (interval === iv ? "bg-violet-500 text-white" : "text-[#9A96AD] hover:text-[#F2F0F7]")
              }
            >
              {iv === "month" ? "Monthly" : "Annual · 2 months free"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex px-6 xl:px-12 pt-8 pb-16 justify-center">
        <div className="grid w-full max-w-4xl gap-4 md:grid-cols-3">
          {/* Free */}
          <div className="panel flex flex-col rounded-3xl p-6">
            <div className="flex items-baseline justify-between">
              <span className="font-bold text-[#F2F0F7]">Free</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#5E5A72]">Try it</span>
            </div>
            <div className="mt-2 text-3xl font-bold text-white">$0</div>
            <div className="mt-4 flex flex-1 flex-col gap-2.5">
              {[`${FREE_SONG_LIMIT} free song`, "10 AI cover generations", "Vibe + cover preview", "Release plan (7-day)"].map((p) => (
                <div key={p} className="flex items-center gap-2.5">
                  <Check className="size-3.5 shrink-0 text-[#46E0A8]" />
                  <span className="text-[13px] text-[#F2F0F7]">{p}</span>
                </div>
              ))}
            </div>
            <Button
              onClick={() => go("Import")}
              disabled={plan === "free"}
              className="mt-5 w-full rounded-xl border border-white/12 bg-transparent py-5 font-semibold text-[#F2F0F7] hover:bg-white/5"
            >
              {plan === "free" ? "Your plan" : "Start free"}
            </Button>
          </div>

          {/* Paid tiers */}
          {TIERS.map((t) => {
            const current = plan === t.id;
            const price = interval === "month" ? t.month : t.year;
            const featured = t.id === "studio";
            return (
              <div
                key={t.id}
                className={"panel flex flex-col rounded-3xl p-6 " + (featured ? "ring-1 ring-violet-500/40" : "")}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-bold text-[#F2F0F7]">{t.name}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#5E5A72]">{t.tag}</span>
                </div>
                <div className="mt-2 text-3xl font-bold text-white">
                  ${price}
                  <span className="text-sm font-normal text-[#9A96AD]">/{interval === "month" ? "mo" : "yr"}</span>
                </div>
                <div className="mt-4 flex flex-1 flex-col gap-2.5">
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
                  className={"mt-5 w-full rounded-xl py-5 font-semibold " + (featured ? "btn-primary text-white" : "bg-[#F2F0F7] text-[#0B0B0F] hover:bg-white")}
                >
                  {current ? "Your plan" : `Get ${t.name}`}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* trial + status footer */}
      <div className="flex px-6 xl:px-12 pb-16 flex-col items-center gap-3 text-center">
        {plan === "free" && (
          <button
            onClick={startTrial}
            className="flex items-center gap-3 rounded-2xl border border-violet-400/40 bg-gradient-to-r from-violet-500/15 to-violet-500/[0.03] px-5 py-3 transition-colors hover:border-violet-400/70"
          >
            <Zap className="size-5 text-violet-400" fill="currentColor" />
            <span className="text-sm text-[#F2F0F7]">
              Or try everything for <b>${TRIAL_PRICE}</b> for {TRIAL_DAYS} days, then $15/mo. Cancel anytime.
            </span>
          </button>
        )}
        {needsAuth && cloudEnabled && !session?.user?.id ? (
          <p className="text-[12px] text-[#F0A45B]">Sign in first so your plan attaches to your account.</p>
        ) : waiting && cloudEnabled ? (
          <button onClick={() => refreshPlan()} className="flex items-center gap-2 text-xs text-[#9A96AD] hover:text-[#F2F0F7]">
            <RefreshCw className="size-3" /> Paid in the other tab? Click to refresh your plan.
          </button>
        ) : (
          <p className="text-[11px] text-[#5E5A72]">Secure checkout by Stripe. Cancel anytime.</p>
        )}
      </div>
    </div>
  );
}
