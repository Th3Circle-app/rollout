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
import { useEffect } from "react";
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
  const { page } = useStore();
  const Current = PAGES[page] ?? Import;

  useEffect(() => {
    document.title = `${TITLES[page] ?? "Rollout"} · Rollout`;
  }, [page]);

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
