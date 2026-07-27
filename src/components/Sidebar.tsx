import { Layers, Package, Settings, Upload, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";

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
  { label: "Assets", icon: Layers, target: "Cover", group: ["Cover", "Lyrics"] },
  { label: "Settings", icon: Settings, target: "Settings", group: ["Settings"] },
];

export default function Sidebar() {
  const { page, go, release } = useStore();
  const initials = (release?.artist || "R").slice(0, 2).toUpperCase();

  return (
    <div className="shrink-0 bg-[#0B0B0F] border-white/8 border-t-0 border-r-1 border-b-0 border-l-0 border-solid flex px-4 py-8 flex-col items-center w-55 h-screen sticky top-0">
      <button onClick={() => go("Import")} className="flex mb-12 items-center gap-2">
        <div className="size-6 rounded-md bg-violet-500 flex justify-center items-center">
          <Zap className="size-4 text-[#0B0B0F]" fill="#0B0B0F" />
        </div>
        <span className="font-bold text-[15px] tracking-tight text-[#F2F0F7]">Rollout</span>
      </button>
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
                  ? "bg-[#1E1E28] text-[#F2F0F7] px-3 py-2 justify-start gap-3 w-full"
                  : "text-[#9A96AD] px-3 py-2 justify-start gap-3 w-full hover:text-[#F2F0F7]"
              }
            >
              <Icon className={active ? "size-4 text-violet-500" : "size-4"} />
              <span className="font-medium text-sm leading-5">{n.label}</span>
            </Button>
          );
        })}
      </div>
      <div className="border-white/8 border-t-1 border-r-0 border-b-0 border-l-0 border-solid flex mt-auto pt-6 justify-center items-center w-full">
        <button
          onClick={() => go("Settings")}
          aria-label="Account settings"
          className="size-8 rounded-full bg-[#1E1E28] border-white/8 border-1 border-solid flex justify-center items-center"
        >
          <span className="font-medium text-[#9A96AD] text-xs leading-4">{initials}</span>
        </button>
      </div>
    </div>
  );
}
