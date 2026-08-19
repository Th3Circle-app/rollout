import { useEffect, useState } from "react";
import { Award, Check, Flame, Gift, Lock, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";
import { supabase } from "@/lib/supabase";

// Loyalty milestones. As a member's tenure grows, more unlocks — the retention
// hook: the longer you stay, the more you get. `kind` drives how it's rendered
// and, for "reward", surfaces a claim action.
type Milestone = {
  months: number;
  title: string;
  reward: string;
  kind: "badge" | "perk" | "reward";
  icon: typeof Award;
};

const MILESTONES: Milestone[] = [
  { months: 1, title: "One month in", reward: "Welcome badge + your streak begins", kind: "badge", icon: Sparkles },
  { months: 3, title: "In the groove", reward: "Priority render queue on every asset", kind: "perk", icon: Zap },
  { months: 6, title: "Loyal artist", reward: "25% off your next month", kind: "reward", icon: Award },
  { months: 12, title: "Rollout Founder", reward: "A month on us + Founder badge", kind: "reward", icon: Gift },
];

const MONTH_MS = 1000 * 60 * 60 * 24 * 30.44;

function claimHref(m: Milestone) {
  const subject = encodeURIComponent(`Claim reward: ${m.title}`);
  const body = encodeURIComponent(
    `Hi Rollout team,\n\nI've hit the "${m.title}" milestone and I'd like to claim: ${m.reward}.\n\nThanks!`
  );
  return `mailto:harrison@xkaii.com?subject=${subject}&body=${body}`;
}

export default function Rewards() {
  const { plan, session, cloud } = useStore();
  const [since, setSince] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!cloud || !supabase || !session) { setSince(null); return; }
      // member_since is set on first paid activation (Stripe webhook), so the
      // streak counts PAID tenure, not account age. Null = not subscribed yet.
      const { data } = await supabase
        .from("rollout_artists")
        .select("member_since")
        .eq("id", session.user.id)
        .single();
      if (alive) setSince(data?.member_since ?? null);
    })();
    return () => { alive = false; };
  }, [cloud, session]);

  const months = since ? Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / MONTH_MS)) : 0;
  const isPaid = plan !== "free";

  const next = MILESTONES.find((m) => m.months > months);
  const prevMonths = [...MILESTONES].reverse().find((m) => m.months <= months)?.months ?? 0;
  const toNext = next ? next.months - months : 0;
  const spanPct = next
    ? Math.min(100, Math.round(((months - prevMonths) / (next.months - prevMonths)) * 100))
    : 100;

  const sinceLabel = since
    ? new Date(since).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "—";

  return (
    <div className="min-h-screen flex flex-col flex-1">
      <div className="mx-auto flex w-full max-w-[880px] px-6 xl:px-12 pt-8 pb-4 flex-col gap-1">
        <h1 className="page-title text-[40px]">Rewards</h1>
        <p className="text-[#9A96AD] text-sm leading-5">
          Stick around, get rewarded. Perks unlock the longer you're a member.
        </p>
      </div>

      <div className="mx-auto flex w-full px-6 xl:px-12 pb-12 flex-1 flex-col gap-6 max-w-[880px]">
        {/* streak header */}
        <div className="panel rounded-3xl p-6 flex items-center gap-6">
          <div className="relative size-20 shrink-0 rounded-full flex items-center justify-center"
            style={{ background: `conic-gradient(#8B5CF6 0deg, #8B5CF6 ${spanPct * 3.6}deg, rgba(255,255,255,0.08) ${spanPct * 3.6}deg 360deg)` }}>
            <div className="size-16 rounded-full bg-[#0B0B0F] flex flex-col items-center justify-center">
              <Flame className="size-4 text-violet-400" />
              <span className="font-bold text-[#F2F0F7] text-lg leading-5">{months}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-bold text-[#F2F0F7] text-2xl leading-7 tracking-tight">
              {months === 0 ? "Your streak starts now" : `${months} month${months === 1 ? "" : "s"} strong`}
            </span>
            <span className="text-[#9A96AD] text-sm">Member since {sinceLabel}</span>
            {next ? (
              <span className="font-mono text-[11px] text-violet-300 mt-1">
                {toNext} month{toNext === 1 ? "" : "s"} to “{next.title}”
              </span>
            ) : (
              <span className="font-mono text-[11px] text-[#46E0A8] mt-1">Every reward unlocked. You're a legend.</span>
            )}
          </div>
        </div>

        {!isPaid && (
          <div className="rounded-xl border border-violet-400/40 bg-violet-500/[0.06] p-4 flex items-center justify-between gap-4">
            <span className="text-sm text-[#F2F0F7]">
              Your streak builds while you're subscribed. Pick a plan to start it.
            </span>
            <a href="?page=Settings" className="shrink-0 btn-primary rounded-xl px-4 py-2 text-sm font-semibold text-white">
              See plans
            </a>
          </div>
        )}

        {/* milestone ladder */}
        <div className="flex flex-col gap-3">
          <span className="section-label">Milestones</span>
          {MILESTONES.map((m) => {
            const unlocked = months >= m.months;
            const Icon = m.icon;
            return (
              <div
                key={m.months}
                className={
                  "panel rounded-xl p-5 flex items-center gap-4 " +
                  (unlocked ? "border-violet-500/40" : "opacity-80")
                }
              >
                <div className={"size-11 shrink-0 rounded-xl flex items-center justify-center " +
                  (unlocked ? "bg-violet-500/15" : "bg-[#1E1E28]")}>
                  {unlocked ? <Icon className="size-5 text-violet-300" /> : <Lock className="size-4 text-[#5E5A72]" />}
                </div>
                <div className="flex flex-col flex-1 gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#F2F0F7] text-sm">{m.title}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[#5E5A72]">
                      {m.months} mo
                    </span>
                  </div>
                  <span className={(unlocked ? "text-[#F2F0F7]" : "text-[#9A96AD]") + " text-[13px]"}>{m.reward}</span>
                </div>
                {unlocked ? (
                  m.kind === "reward" ? (
                    <Button asChild className="btn-primary rounded-xl text-white h-9 gap-1.5 shrink-0">
                      <a href={claimHref(m)}><Gift className="size-3.5" /> Claim</a>
                    </Button>
                  ) : (
                    <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-[#46E0A8]/10 px-3 py-1 text-[11px] font-medium text-[#46E0A8]">
                      <Check className="size-3" /> Unlocked
                    </span>
                  )
                ) : (
                  <span className="shrink-0 font-mono text-[11px] text-[#5E5A72]">
                    {m.months - months} mo to go
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <p className="font-mono text-[11px] text-[#5E5A72]">
          Rewards are based on how long you've been a Rollout member. Claimed rewards are applied to your next invoice.
        </p>
      </div>
    </div>
  );
}
