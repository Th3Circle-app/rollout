import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, cloudEnabled } from "./lib/supabase";

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
  id?: string; // cloud row id (rollout_releases)
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
  session: Session | null;
  cloud: boolean;
  signOut: () => void;
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
    // demo Pro flip syncs to the cloud profile (Stripe replaces this)
    if (supabase && sessionRef.current) {
      supabase.from("rollout_artists").update({ plan: p }).eq("id", sessionRef.current.user.id).then(() => {});
    }
  };

  // ── cloud session + profile + release sync (no-op in local mode) ────────
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      sessionRef.current = data.session;
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSession(sess);
      sessionRef.current = sess;
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // on sign-in: ensure profile, hydrate plan/usage + latest release
  useEffect(() => {
    if (!supabase || !session) return;
    (async () => {
      const uid = session.user.id;
      const meta = (session.user.user_metadata || {}) as { artist_name?: string };
      await supabase.from("rollout_artists").upsert(
        { id: uid, email: session.user.email || "", artist_name: meta.artist_name || "" },
        { onConflict: "id", ignoreDuplicates: false }
      );
      const { data: prof } = await supabase.from("rollout_artists").select("plan,songs_used").eq("id", uid).single();
      if (prof) {
        setPlanState(prof.plan as Plan);
        setSongs((old) => (old.length >= prof.songs_used ? old : Array.from({ length: prof.songs_used }, (_, i) => old[i] ?? `cloud-${i}`)));
      }
      // hydrate the most recent release if local is empty
      if (!release) {
        const { data: rows } = await supabase
          .from("rollout_releases").select("*").eq("artist_id", uid)
          .order("updated_at", { ascending: false }).limit(1);
        const row = rows?.[0];
        if (row) {
          setRelease({
            id: row.id, filename: row.filename, title: row.title,
            artist: row.artist_name, key: row.key_sig, bpm: row.bpm,
            duration: row.duration, moods: row.moods || [], keywords: row.keywords || [],
            genre: row.genre || "", lyrics: row.lyrics || "",
            coverUrl: row.cover_url || "", file_id: row.file_id || "",
          });
          if (row.release_date) setReleaseDateState(String(row.release_date));
          if (row.streaming_link) setStreamingLinkState(row.streaming_link);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // debounced release upsert whenever the work changes
  useEffect(() => {
    if (!supabase || !session || !release) return;
    const sb = supabase;
    const t = setTimeout(async () => {
      const id = release.id || crypto.randomUUID();
      if (!release.id) setReleaseState({ ...release, id }); // keep id locally (avoid loop via direct state)
      await sb.from("rollout_releases").upsert({
        id,
        artist_id: session.user.id,
        title: release.title, artist_name: release.artist,
        filename: release.filename, file_id: release.file_id || "",
        key_sig: release.key, bpm: release.bpm, duration: release.duration,
        moods: release.moods, keywords: release.keywords,
        genre: release.genre || "", lyrics: release.lyrics || "",
        cover_url: release.coverUrl || "",
        release_date: releaseDate || null,
        streaming_link: streamingLink || "",
        slug: slugify(`${release.artist}-${release.title}`) || null,
      });
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, release, releaseDate, streamingLink]);

  const signOut = () => {
    if (supabase) supabase.auth.signOut();
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
        session,
        cloud: cloudEnabled,
        signOut,
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
