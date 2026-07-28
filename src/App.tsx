import Import from "./pages/Import";
import Build from "./pages/Build";
import Dashboard from "./pages/Dashboard";
import Cover from "./pages/Cover";
import Distribute from "./pages/Distribute";
import Plan from "./pages/Plan";
import Lyrics from "./pages/Lyrics";
import Landing from "./pages/Landing";
import Ads from "./pages/Ads";
import Ship from "./pages/Ship";
import Settings from "./pages/Settings";
import { useEffect, useState } from "react";
import Auth from "./components/Auth";
import Sidebar from "./components/Sidebar";
import UpgradeModal from "./components/UpgradeModal";
import { TourProvider } from "./components/Tour";
import { StoreProvider, useStore } from "./store";

// Per-screen document titles — real products name their tabs.
const TITLES: Record<string, string> = {
  Import: "Import a track",
  Build: "Building your rollout",
  Dashboard: "Releases",
  Cover: "Cover Canvas",
  Distribute: "Distribution",
  Plan: "Release Plan",
  Lyrics: "Lyric Video",
  Landing: "Fan Page",
  Ads: "Ad Center",
  Ship: "Launch",
  Settings: "Settings",
};

// IA per the Flowstep originals: Import / Releases (hub) / Assets / Settings.
// Release tools hang off the Dashboard hub, breadcrumbs lead back.
const PAGES: Record<string, React.ComponentType> = {
  Import,
  Build,
  Dashboard,
  Cover,
  Distribute,
  Plan,
  Lyrics,
  Landing,
  Ads,
  Ship,
  Settings,
};

function Shell() {
  const { page, cloud, session } = useStore();
  const Current = PAGES[page] ?? Import;

  useEffect(() => {
    document.title = `${TITLES[page] ?? "Rollout"} · Rollout`;
  }, [page]);

  // Rollout is a desktop studio. Phones get a designed hand-off, not a
  // broken layout. (Mobile companion is roadmap.)
  const [tooSmall, setTooSmall] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 960
  );
  useEffect(() => {
    const onResize = () => setTooSmall(window.innerWidth < 960);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // multi-tenant: cloud mode requires an account
  if (cloud && !session) {
    return <Auth />;
  }

  if (tooSmall) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[#0B0B0F] px-8 text-center">
        <div className="size-12 rounded-xl bg-violet-500 flex items-center justify-center">
          <span className="font-bold text-[#0B0B0F] text-xl">⚡</span>
        </div>
        <h1 className="font-bold text-[#F2F0F7] text-2xl tracking-tight">Rollout is a studio.</h1>
        <p className="max-w-xs text-[#9A96AD] text-sm leading-6">
          Cover canvases, lyric editors, and release plans need room to breathe.
          Open Rollout on your computer to build your drop.
        </p>
        <span className="font-mono text-[#5E5A72] text-xs">mobile companion coming after launch</span>
      </div>
    );
  }

  return (
    <div className="app-bg flex min-h-screen text-neutral-50">
      <Sidebar />
      <main key={page} className="page-enter min-w-0 flex-1">
        <Current />
      </main>
      <UpgradeModal />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <TourProvider>
        <Shell />
      </TourProvider>
    </StoreProvider>
  );
}
