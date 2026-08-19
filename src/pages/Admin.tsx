import { useEffect, useState } from "react";
import { Loader2, TrendingUp, Users, DollarSign, UserCheck } from "lucide-react";
import { useStore } from "@/store";
import { supabase } from "@/lib/supabase";

// Private founder dashboard (borrowed from open-saas' admin). Server-gated: the
// stats come from a SECURITY DEFINER RPC that raises unless the caller is an
// admin, so RLS still hides everyone's rows from everyone else.
type Stats = {
  total_signups: number;
  free_users: number;
  artist_users: number;
  studio_users: number;
  paying_users: number;
  signups_7d: number;
  signups_30d: number;
  estimated_mrr: number;
  recent: { email: string; plan: string; created_at: string }[];
};

function fmtDate(d: string) {
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "" : dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function Admin() {
  const { isAdmin, go } = useStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!isAdmin || !supabase) return;
    (async () => {
      const { data, error } = await supabase.rpc("rollout_admin_stats");
      if (error) { setErr("Couldn't load stats."); return; }
      setStats(data as Stats);
    })();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
        <h1 className="page-title text-3xl">Not authorized</h1>
        <p className="text-[#9A96AD] text-sm">This area is for the Rollout team.</p>
        <button onClick={() => go("Dashboard")} className="btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold text-white">
          Back to Releases
        </button>
      </div>
    );
  }

  const conversion = stats && stats.total_signups > 0
    ? Math.round((stats.paying_users / stats.total_signups) * 100)
    : 0;

  const Card = ({ icon: Icon, label, value, sub }: { icon: typeof Users; label: string; value: string; sub?: string }) => (
    <div className="panel rounded-3xl p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="section-label">{label}</span>
        <Icon className="size-4 text-violet-400" />
      </div>
      <span className="font-bold text-[#F2F0F7] text-3xl leading-9 tracking-tight tabular-nums">{value}</span>
      {sub && <span className="font-mono text-[11px] text-[#5E5A72]">{sub}</span>}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col flex-1">
      <div className="flex px-6 xl:px-12 pt-8 pb-6 flex-col gap-1">
        <span className="kicker">Founder</span>
        <h1 className="page-title text-[40px]">Metrics</h1>
        <p className="text-[#9A96AD] text-[17px] leading-7">How Rollout is doing, live from the database.</p>
      </div>

      <div className="flex px-6 xl:px-12 pb-12 flex-col gap-8 max-w-[900px]">
        {err && <div className="panel rounded-3xl p-5 text-sm text-red-400">{err}</div>}
        {!stats && !err && (
          <div className="flex items-center gap-2 text-[#9A96AD]"><Loader2 className="size-4 animate-spin" /> Loading metrics…</div>
        )}

        {stats && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card icon={Users} label="Signups" value={String(stats.total_signups)} sub={`+${stats.signups_7d} this week`} />
              <Card icon={UserCheck} label="Paying" value={String(stats.paying_users)} sub={`${conversion}% conversion`} />
              <Card icon={DollarSign} label="Est. MRR" value={`$${stats.estimated_mrr}`} sub="monthly-equivalent" />
              <Card icon={TrendingUp} label="New (30d)" value={String(stats.signups_30d)} sub="last 30 days" />
            </div>

            <div className="panel rounded-3xl p-6 flex flex-col gap-4">
              <span className="section-label">Plan breakdown</span>
              <div className="flex flex-col gap-3">
                {[
                  { label: "Free", n: stats.free_users, color: "bg-[#9A96AD]" },
                  { label: "Artist", n: stats.artist_users, color: "bg-violet-400" },
                  { label: "Studio", n: stats.studio_users, color: "bg-violet-600" },
                ].map((row) => {
                  const pct = stats.total_signups > 0 ? Math.round((row.n / stats.total_signups) * 100) : 0;
                  return (
                    <div key={row.label} className="flex items-center gap-3">
                      <span className="w-16 text-sm text-[#F2F0F7]">{row.label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#1E1E28]">
                        <div className={"h-full rounded-full " + row.color} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-16 text-right font-mono text-xs text-[#9A96AD] tabular-nums">{row.n} · {pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="panel rounded-3xl p-6 flex flex-col gap-4">
              <span className="section-label">Recent signups</span>
              <div className="flex flex-col divide-y divide-white/5">
                {stats.recent.length === 0 && <span className="text-sm text-[#5E5A72]">No signups yet.</span>}
                {stats.recent.map((u, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5">
                    <span className="text-sm text-[#F2F0F7] truncate">{u.email}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={
                        "rounded-full px-2 py-0.5 text-[10px] font-medium " +
                        (u.plan === "free" ? "bg-[#9A96AD]/10 text-[#9A96AD]" : "bg-violet-500/15 text-violet-300")
                      }>
                        {u.plan}
                      </span>
                      <span className="font-mono text-[11px] text-[#5E5A72] w-12 text-right">{fmtDate(u.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="font-mono text-[11px] text-[#5E5A72]">
              MRR is a monthly-equivalent estimate from plan counts (Artist $15, Studio $29). For exact billed revenue, check Stripe.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
