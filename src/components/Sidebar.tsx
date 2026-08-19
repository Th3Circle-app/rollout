import { ArrowLeft, BarChart3, Gift, Layers, Library, Package, Settings, Sparkles, Upload, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";

// A contextual "back" for the deep tool pages, so you're never stuck on a
// sub-screen. Hub pages (Import/Dashboard/Library/Rewards/Settings) show none.
const BACK_TARGET: Record<string, { to: string; label: string }> = {
  Build: { to: "Import", label: "Import" },
  Cover: { to: "Dashboard", label: "Releases" },
  Lyrics: { to: "Dashboard", label: "Releases" },
  Promo: { to: "Dashboard", label: "Releases" },
  Plan: { to: "Dashboard", label: "Releases" },
  Distribute: { to: "Dashboard", label: "Releases" },
  Ads: { to: "Dashboard", label: "Releases" },
  Ship: { to: "Dashboard", label: "Releases" },
  Landing: { to: "Dashboard", label: "Releases" },
};

// Canonical IA from the Flowstep originals: four items. Everything release-
// specific lives under Releases and is reached from the hub + breadcrumbs.
const NAV: { label: string; icon: typeof Upload; target: string; group: string[] }[] = [
  { label: "Import", icon: Upload, target: "Import", group: ["Import", "Build"] },
  {
    label: "Releases",
    icon: Package,
    target: "Dashboard",
    group: ["Dashboard", "Distribute", "Plan", "Landing", "Ads", "Ship"],
  },
  { label: "Library", icon: Library, target: "Library", group: ["Library"] },
  { label: "Assets", icon: Layers, target: "Cover", group: ["Cover", "Lyrics", "Promo"] },
  { label: "Rewards", icon: Gift, target: "Rewards", group: ["Rewards"] },
  { label: "Settings", icon: Settings, target: "Settings", group: ["Settings"] },
];

export default function Sidebar() {
  const { page, go, release, plan, openUpgrade, avatarUrl, isAdmin } = useStore();
  const initials = (release?.artist || "R").slice(0, 2).toUpperCase();
  const planLabel = plan === "studio" ? "Studio" : plan === "artist" ? "Artist" : "Free";

  return (
    <div className="shrink-0 bg-[#0B0B0F] border-white/8 border-t-0 border-r-1 border-b-0 border-l-0 border-solid flex px-4 py-8 flex-col items-center w-55 h-screen sticky top-0">
      <button onClick={() => go("Import")} className="flex mb-12 items-center gap-2">
        <div className="size-6 rounded-md bg-violet-500 flex justify-center items-center">
          <Zap className="size-4 text-[#0B0B0F]" fill="#0B0B0F" />
        </div>
        <span className="font-bold text-[15px] tracking-tight text-[#F2F0F7]">Rollout</span>
      </button>
      {BACK_TARGET[page] && (
        <button
          onClick={() => go(BACK_TARGET[page].to)}
          className="mb-4 flex w-full items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-[#9A96AD] transition-colors hover:border-white/20 hover:text-[#F2F0F7]"
        >
          <ArrowLeft className="size-3.5" /> Back to {BACK_TARGET[page].label}
        </button>
      )}
      <div className="flex flex-col items-center flex-1 gap-2 w-full">
        {NAV.map((n) => {
          const active = n.group.includes(page);
          const Icon = n.icon;
          return (
            <Button
              key={n.label}
              variant="ghost"
              onClick={() => go(n.target)}
              className={
                active
                  ? "bg-gradient-to-r from-violet-500/[0.18] to-transparent text-white rounded-lg px-3 py-2 justify-start gap-3 w-full"
                  : "text-[#9A96AD] rounded-lg px-3 py-2 justify-start gap-3 w-full hover:text-white hover:bg-white/[0.04]"
              }
            >
              <Icon className={active ? "size-4 text-violet-400" : "size-4"} />
              <span className="font-medium text-sm leading-5">{n.label}</span>
            </Button>
          );
        })}
        {isAdmin && (
          <Button
            variant="ghost"
            onClick={() => go("Admin")}
            className={
              page === "Admin"
                ? "bg-gradient-to-r from-violet-500/[0.18] to-transparent text-white rounded-lg px-3 py-2 justify-start gap-3 w-full"
                : "text-[#9A96AD] rounded-lg px-3 py-2 justify-start gap-3 w-full hover:text-white hover:bg-white/[0.04]"
            }
          >
            <BarChart3 className={page === "Admin" ? "size-4 text-violet-400" : "size-4"} />
            <span className="font-medium text-sm leading-5">Metrics</span>
          </Button>
        )}
      </div>
      <div className="mt-auto flex w-full flex-col gap-4 pt-6">
        {plan === "free" ? (
          <button
            onClick={() => openUpgrade("Unlock unlimited releases and full marketing")}
            className="btn-primary flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white"
          >
            <Sparkles className="size-4" /> Upgrade
          </button>
        ) : (
          <button
            onClick={() => go("Settings")}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-300 transition-colors hover:bg-violet-500/15"
          >
            <Sparkles className="size-3.5" /> {planLabel} plan
          </button>
        )}
        <div className="border-white/8 border-t-1 border-r-0 border-b-0 border-l-0 border-solid flex pt-6 justify-center items-center w-full">
          <button
            onClick={() => go("Settings")}
            aria-label="Account settings"
            className="size-8 overflow-hidden rounded-full bg-[#1E1E28] border-white/8 border-1 border-solid flex justify-center items-center"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <span className="font-medium text-[#9A96AD] text-xs leading-4">{initials}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
