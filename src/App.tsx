import Import from "./pages/Import";
import Build from "./pages/Build";
import Dashboard from "./pages/Dashboard";
import Library from "./pages/Library";
import Cover from "./pages/Cover";
import Distribute from "./pages/Distribute";
import Plan from "./pages/Plan";
import Lyrics from "./pages/Lyrics";
import Promo from "./pages/Promo";
import Landing from "./pages/Landing";
import Ads from "./pages/Ads";
import Ship from "./pages/Ship";
import Rewards from "./pages/Rewards";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import Pricing from "./pages/Pricing";
import { useEffect, useState } from "react";
import Auth from "./components/Auth";
import Sidebar from "./components/Sidebar";
import UpgradeModal from "./components/UpgradeModal";
import { TourProvider } from "./components/Tour";
import { StoreProvider, useStore } from "./store";
import { API_BASE } from "./lib/api";
import FanPage from "./pages/FanPage";
import GlassBackground from "./components/GlassBackground";
import StarField from "./components/StarField";
import RolloutLanding from "./components/RolloutLanding";
import ErrorBoundary from "./components/ErrorBoundary";
import SupportChat from "./components/SupportChat";

// Fallback when a page component throws — recover instead of blanking the app.
function PageError() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-[#F2F0F7]">Something went wrong on this screen.</h1>
      <p className="max-w-sm text-sm text-[#9A96AD]">Give it another go, or head back to your releases.</p>
      <button
        onClick={() => { window.location.search = "?page=Dashboard"; }}
        className="rounded-xl bg-violet-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#7c4dec]"
      >
        Back to Releases
      </button>
    </div>
  );
}

// Per-screen document titles — real products name their tabs.
const TITLES: Record<string, string> = {
  Import: "Import a track",
  Build: "Building your rollout",
  Dashboard: "Releases",
  Library: "Library",
  Cover: "Cover Canvas",
  Distribute: "Distribution",
  Plan: "Release Plan",
  Lyrics: "Lyric Video",
  Promo: "Promo Clips",
  Landing: "Fan Page",
  Ads: "Ad Center",
  Ship: "Launch",
  Rewards: "Rewards",
  Settings: "Settings",
  Admin: "Metrics",
  Pricing: "Plans & Pricing",
};

// IA per the Flowstep originals: Import / Releases (hub) / Assets / Settings.
// Release tools hang off the Dashboard hub, breadcrumbs lead back.
const PAGES: Record<string, React.ComponentType> = {
  Import,
  Build,
  Dashboard,
  Library,
  Cover,
  Distribute,
  Plan,
  Lyrics,
  Promo,
  Landing,
  Ads,
  Ship,
  Rewards,
  Settings,
  Admin,
  Pricing,
};

function Shell() {
  const { page, cloud, session } = useStore();
  const Current = PAGES[page] ?? Import;
  const [showAuth, setShowAuth] = useState(false);

  // The analysis engine scales to zero when idle (~2GB model → 30-60s cold boot).
  // Warm it the instant a signed-in artist opens the studio so it's ready by the
  // time they scan a track or generate art, instead of a cold start under them.
  useEffect(() => {
    if (cloud && session) fetch(`${API_BASE}/health`).catch(() => {});
  }, [cloud, session]);

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

  // Dev-only design preview: ?preview=1 renders the studio with each page's demo
  // fallback data so the UI can be screenshotted without a login. Gated to
  // import.meta.env.DEV so it can NEVER bypass auth in the deployed build.
  const preview = import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("preview") === "1";

  // logged out: the marketing landing is the front door; "Start free" opens the
  // auth wall. (The landing is responsive and shows on phones too — only the
  // studio itself is desktop-gated below.)
  if (cloud && !session && !preview) {
    return showAuth ? <Auth onBack={() => setShowAuth(false)} /> : <RolloutLanding onStart={() => setShowAuth(true)} />;
  }

  if (tooSmall && !preview) {
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
    <div className="app-bg relative flex min-h-screen text-neutral-50">
      <GlassBackground style={{ background: "#060609" }} />
      <div aria-hidden className="studio-atmo" />
      <StarField />
      <div className="relative z-10 flex min-h-screen w-full">
        <Sidebar />
        <main key={page} className="page-enter min-w-0 flex-1">
          <ErrorBoundary fallback={<PageError />}>
            <Current />
          </ErrorBoundary>
        </main>
      </div>
      <UpgradeModal />
      <SupportChat />
    </div>
  );
}

export default function App() {
  // Public release pages (/r/{slug}) are unauthenticated and bypass the whole
  // app shell, auth wall, and desktop gate — fans land here from a smart link.
  if (typeof window !== "undefined") {
    const m = window.location.pathname.match(/^\/r\/([^/]+)\/?$/);
    if (m) return <FanPage slug={decodeURIComponent(m[1])} />;
  }
  return (
    <StoreProvider>
      <TourProvider>
        <Shell />
      </TourProvider>
    </StoreProvider>
  );
}
