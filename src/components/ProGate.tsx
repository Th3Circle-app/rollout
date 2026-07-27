import type { ReactNode } from "react";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";

// Wraps a Pro-only feature. Free users see it blurred behind an upgrade CTA.
export default function ProGate({
  feature,
  blurb,
  children,
}: {
  feature: string;
  blurb: string;
  children: ReactNode;
}) {
  const { plan, setPlan } = useStore();
  if (plan === "pro") return <>{children}</>;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-sm brightness-[.4]">{children}</div>
      <div className="absolute inset-0 z-40 flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#15151C] p-8 text-center backdrop-blur">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-violet-500/15">
            <Lock className="size-5 text-violet-500" />
          </div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-[3px] text-violet-500">
            Rollout Pro
          </div>
          <h2 className="text-xl font-bold text-white">{feature}</h2>
          <p className="mt-2 text-sm text-[#9A96AD]">{blurb}</p>
          <Button
            onClick={() => setPlan("pro")}
            className="mt-6 w-full gap-2 rounded-xl bg-violet-500 py-5 font-semibold text-white"
          >
            <Sparkles className="size-4" />
            Unlock with Pro — $12/mo
          </Button>
          <p className="mt-3 text-[11px] text-[#5e5a72]">Demo: flips to Pro instantly.</p>
        </div>
      </div>
    </div>
  );
}
