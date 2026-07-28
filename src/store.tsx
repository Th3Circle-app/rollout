import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Release = {
  filename: string;
  title: string;
  artist: string;
  key: string;
  bpm: number;
  duration: string;
  moods: string[];
  keywords: string[];
  coverUrl?: string;
  file_id?: string;
  lyrics?: string;
  genre?: string;
} | null;

// Stable cover-concept seeds per session: Cover shows the SAME 4 concepts
// across visits (and Build's prefetch actually warms them). "New set" rotates.
export function getSeeds(): number[] {
  try {
    const raw = localStorage.getItem("rollout_seeds");
    if (raw) {
      const s = JSON.parse(raw);
      if (Array.isArray(s) && s.length === 4) return s;
    }
  } catch { /* ignore */ }
  return rotateSeeds();
}

export function rotateSeeds(): number[] {
  const s = Array.from({ length: 4 }, () => Math.floor(Math.random() * 1_000_000));
  try { localStorage.setItem("rollout_seeds", JSON.stringify(s)); } catch { /* ignore */ }
  return s;
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type Plan = "free" | "pro";

// How many songs a free account can run through the pipeline.
// Harrison 2026-07-27: "first song or first two, first three" — start at 1,
// flip this constant to loosen the funnel.
export const FREE_SONG_LIMIT = 1;

type Store = {
  page: string;
  go: (name: string) => void;
  release: Release;
  setRelease: (r: Release) => void;
  plan: Plan;
  setPlan: (p: Plan) => void;
  upgrade: { open: boolean; feature: string };
  openUpgrade: (feature: string) => void;
  closeUpgrade: () => void;
  songsUsed: number;
  useSongSlot: (filename: string) => void;
  releaseDate: string;
  setReleaseDate: (d: string) => void;
  streamingLink: string;
  setStreamingLink: (l: string) => void;
};

const Ctx = createContext<Store | null>(null);

// Turn "Fail Safe Xkaii.wav" -> { title: "Fail Safe", artist: "Xkaii" }
export function deriveTitleArtist(filename: string) {
  const base = filename.replace(/\.[^.]+$/, "").trim();
  // common patterns: "Title - Artist", "Artist - Title", "Title Artist"
  if (base.includes(" - ")) {
    const [a, b] = base.split(" - ");
    return { title: a.trim(), artist: b.trim() };
  }
  const parts = base.split(/\s+/);
  if (parts.length >= 2) {
    return { title: parts.slice(0, -1).join(" "), artist: parts[parts.length - 1] };
  }
  return { title: base, artist: "" };
}

function loadPlan(): Plan {
  try {
    return localStorage.getItem("rollout_plan") === "pro" ? "pro" : "free";
  } catch {
    return "free";
  }
}

// Track distinct songs (by filename) that used a free slot.
function loadSongs(): string[] {
  try {
    return JSON.parse(localStorage.getItem("rollout_songs") || "[]");
  } catch {
    return [];
  }
}

const PAGE_NAMES = [
  "Import", "Build", "Dashboard", "Cover", "Distribute", "Plan",
  "Lyrics", "Landing", "Ads", "Ship", "Settings",
];

function initialPage(): string {
  try {
    const p = new URLSearchParams(window.location.search).get("page");
    return p && PAGE_NAMES.includes(p) ? p : "Import";
  } catch {
    return "Import";
  }
}

// The release itself must survive a reload — it's the user's work.
function loadRelease(): Release {
  try {
    return JSON.parse(localStorage.getItem("rollout_release") || "null");
  } catch {
    return null;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [page, setPageState] = useState<string>(initialPage);
  // Deep-linkable pages (?page=Plan) with a WORKING browser back button:
  // pushState on navigate, popstate to walk history.
  const setPage = (p: string) => {
    setPageState((prev) => {
      if (prev !== p) {
        try {
          const url = new URL(window.location.href);
          url.searchParams.set("page", p);
          window.history.pushState({ page: p }, "", url);
        } catch {
          /* ignore */
        }
      }
      return p;
    });
  };
  useEffect(() => {
    const onPop = () => setPageState(initialPage());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const [release, setReleaseState] = useState<Release>(loadRelease);
  const setRelease = (r: Release) => {
    setReleaseState(r);
    try {
      if (r) localStorage.setItem("rollout_release", JSON.stringify(r));
      else localStorage.removeItem("rollout_release");
    } catch {
      /* ignore */
    }
  };
  const [plan, setPlanState] = useState<Plan>(loadPlan);
  const [upgrade, setUpgrade] = useState({ open: false, feature: "" });
  const [songs, setSongs] = useState<string[]>(loadSongs);
  const [releaseDate, setReleaseDateState] = useState<string>(
    () => { try { return localStorage.getItem("rollout_date") || ""; } catch { return ""; } }
  );
  const [streamingLink, setStreamingLinkState] = useState<string>(
    () => { try { return localStorage.getItem("rollout_link") || ""; } catch { return ""; } }
  );
  const setReleaseDate = (d: string) => {
    setReleaseDateState(d);
    try { localStorage.setItem("rollout_date", d); } catch { /* ignore */ }
  };
  const setStreamingLink = (l: string) => {
    setStreamingLinkState(l);
    try { localStorage.setItem("rollout_link", l); } catch { /* ignore */ }
  };

  const setPlan = (p: Plan) => {
    setPlanState(p);
    try {
      localStorage.setItem("rollout_plan", p);
    } catch {
      /* ignore */
    }
  };

  // Re-running the same song doesn't burn another slot.
  const useSongSlot = (filename: string) => {
    if (songs.includes(filename)) return;
    const next = [...songs, filename];
    setSongs(next);
    try {
      localStorage.setItem("rollout_songs", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  return (
    <Ctx.Provider
      value={{
        page,
        go: setPage,
        release,
        setRelease,
        plan,
        setPlan,
        upgrade,
        openUpgrade: (feature) => setUpgrade({ open: true, feature }),
        closeUpgrade: () => setUpgrade({ open: false, feature: "" }),
        songsUsed: songs.length,
        useSongSlot,
        releaseDate,
        setReleaseDate,
        streamingLink,
        setStreamingLink,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used within StoreProvider");
  return s;
}
