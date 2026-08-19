import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, cloudEnabled } from "./lib/supabase";
import { clearAllVideos } from "./lib/videoStore";

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
  lyricVideoDone?: boolean; // a lyric video was rendered + kept for this release
  pagePublished?: boolean;  // the fan release page has been published
  id?: string; // cloud row id (rollout_releases)
} | null;

// Every browser-local artifact of a workspace. Wiped when a DIFFERENT account
// signs in on the same browser, so nothing leaks between accounts and a brand
// new account always starts fresh. Cloud data (rollout_releases) is RLS-scoped
// and reloads per-account on its own.
const ACTIVE_UID_KEY = "rollout_active_uid";
export function resetLocalWorkspace() {
  try {
    const kill: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("rollout_") && k !== ACTIVE_UID_KEY) kill.push(k);
    }
    kill.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
  // rendered lyric videos live in IndexedDB — clear those too (best-effort)
  clearAllVideos().catch(() => { /* ignore */ });
}

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

export type Plan = "free" | "artist" | "studio";

// Tier helpers: Artist = release properly, Studio = market like a machine.
export const isPaid = (p: Plan) => p !== "free";
export const isStudio = (p: Plan) => p === "studio";
export const PLAN_LABEL: Record<Plan, string> = {
  free: "Free", artist: "Rollout Artist", studio: "Rollout Studio",
};

// Live Stripe payment links (Th3Circle account). Studio re-priced to $29/$290
// on 2026-08-17; Artist stays $15/$150.
export const PAYMENT_LINKS: Record<string, string> = {
  "artist:month": "https://buy.stripe.com/aFa4gB8cV5qv7izfpx2880g",
  "artist:year": "https://buy.stripe.com/28EcN7bp7cSXfP53GP2880h",
  "studio:month": "https://buy.stripe.com/fZu5kFgJr5qv6evdhp2880k",
  "studio:year": "https://buy.stripe.com/6oU28t2SB3in0Ub6T12880l",
};

// $7 for 7 days of full access, then $15/mo Artist. One-time $7 + Artist price
// on a 7-day trial. The webhook maps the Artist price -> 'artist' during trial.
export const TRIAL_LINK = "https://buy.stripe.com/bJebJ3gJrbOT6evfpx2880m";
export const TRIAL_PRICE = 7;
export const TRIAL_DAYS = 7;

// Append the signed-in uid (client_reference_id) so the webhook can bind the
// Stripe customer to this account, plus prefill their email.
export function withRef(base: string, uid?: string, email?: string) {
  const params = new URLSearchParams();
  if (uid) params.set("client_reference_id", uid);
  if (email) params.set("prefilled_email", email);
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

export function checkoutUrl(tier: "artist" | "studio", interval: "month" | "year",
                            uid?: string, email?: string) {
  return withRef(PAYMENT_LINKS[`${tier}:${interval}`], uid, email);
}

export function trialUrl(uid?: string, email?: string) {
  return withRef(TRIAL_LINK, uid, email);
}

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
  refreshPlan: () => Promise<void>;
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
  avatarUrl: string;
  updateAvatar: (url: string) => Promise<void>;
  isAdmin: boolean;
};

const Ctx = createContext<Store | null>(null);

// Turn "Afterglow Nova.wav" -> { title: "Afterglow", artist: "Nova" }
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
  // Cloud mode: the plan is server truth (Stripe webhook -> DB -> hydration).
  // Never seed it from localStorage — a user could set rollout_plan="studio"
  // and unlock paid UI in the window before the profile hydrates. Start free
  // and let the sign-in hydration set the real plan.
  if (cloudEnabled) return "free";
  try {
    const p = localStorage.getItem("rollout_plan");
    if (p === "pro" || p === "studio") return "studio"; // migrate old demo value
    if (p === "artist") return "artist";
    return "free";
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
  "Import", "Build", "Dashboard", "Library", "Cover", "Distribute", "Plan",
  "Lyrics", "Promo", "Landing", "Ads", "Ship", "Rewards", "Settings", "Admin", "Pricing",
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

  // In cloud mode the plan is SERVER truth (Stripe webhook -> DB -> here);
  // setPlan only works as a demo toggle in local mode.
  const setPlan = (p: Plan) => {
    if (cloudEnabled) return;
    setPlanState(p);
    try {
      localStorage.setItem("rollout_plan", p);
    } catch {
      /* ignore */
    }
  };

  // Re-pull the plan after checkout ("I've paid" refresh + window refocus)
  const refreshPlan = async () => {
    if (!supabase || !sessionRef.current) return;
    const { data } = await supabase.from("rollout_artists")
      .select("plan").eq("id", sessionRef.current.user.id).single();
    if (data?.plan) setPlanState(data.plan as Plan);
  };
  useEffect(() => {
    const onFocus = () => { refreshPlan(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── cloud session + profile + release sync (no-op in local mode) ────────
  const [session, setSession] = useState<Session | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const sessionRef = useRef<Session | null>(null);
  // Which uid we've already run the workspace-isolation check for, so it fires
  // once per account per load — not on every token refresh (which would risk
  // wiping a just-created release before its first sync completes).
  const verifiedUidRef = useRef<string | null>(null);
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
      // Account separation on a shared browser: wipe every local artifact so a
      // new account never inherits the previous one's release/campaigns/videos.
      //  1. a DIFFERENT uid was active here before, OR
      //  2. the cached local release simply doesn't belong to this account
      //     (covers browsers contaminated before uid-tracking existed).
      let switched = false;
      if (verifiedUidRef.current !== uid) {
        try {
          const prevUid = localStorage.getItem(ACTIVE_UID_KEY);
          if (prevUid && prevUid !== uid) switched = true;
        } catch { /* ignore */ }
        if (!switched && release) {
          // Any locally-cached release that isn't backed by a cloud row for THIS
          // account is stale (deleted, or from another account) → drop it so a
          // wiped/empty account never shows leftover content.
          let owned = false;
          if (release.id) {
            const { data } = await supabase
              .from("rollout_releases").select("id")
              .eq("id", release.id).eq("artist_id", uid).maybeSingle();
            owned = Boolean(data);
          }
          if (!owned) switched = true;
        }
        if (switched) {
          resetLocalWorkspace();
          setReleaseState(null);
          setReleaseDateState("");
          setStreamingLinkState("");
          setSongs([]);
          setAvatarUrl("");
          setIsAdmin(false);
        }
        try { localStorage.setItem(ACTIVE_UID_KEY, uid); } catch { /* ignore */ }
        verifiedUidRef.current = uid;
      }

      const meta = (session.user.user_metadata || {}) as { artist_name?: string };
      await supabase.from("rollout_artists").upsert(
        { id: uid, email: session.user.email || "", artist_name: meta.artist_name || "" },
        { onConflict: "id", ignoreDuplicates: false }
      );
      const { data: prof } = await supabase.from("rollout_artists").select("plan,songs_used,avatar_url,is_admin").eq("id", uid).single();
      if (prof) {
        setPlanState(prof.plan as Plan);
        setSongs((old) => (old.length >= prof.songs_used ? old : Array.from({ length: prof.songs_used }, (_, i) => old[i] ?? `cloud-${i}`)));
        setAvatarUrl((prof as { avatar_url?: string }).avatar_url || "");
        setIsAdmin(Boolean((prof as { is_admin?: boolean }).is_admin));
      }
      // hydrate the most recent release if local is empty (or was just wiped)
      if (switched || !release) {
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
            lyricVideoDone: Boolean(row.lyric_video_done),
            pagePublished: Boolean(row.page_published),
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
      // persist the id (localStorage + state), else a reload before the next
      // setRelease loses it and mints a new UUID -> a duplicate rollout_releases row
      if (!release.id) setRelease({ ...release, id });
      await sb.from("rollout_releases").upsert({
        id,
        artist_id: session.user.id,
        title: release.title, artist_name: release.artist,
        filename: release.filename, file_id: release.file_id || "",
        key_sig: release.key, bpm: release.bpm, duration: release.duration,
        moods: release.moods, keywords: release.keywords,
        genre: release.genre || "", lyrics: release.lyrics || "",
        cover_url: release.coverUrl || "",
        lyric_video_done: release.lyricVideoDone || false,
        page_published: release.pagePublished || false,
        release_date: releaseDate || null,
        streaming_link: streamingLink || "",
        // suffix with the id slice so two artists with the same "Artist - Title"
        // don't collide on the GLOBAL-unique slug column (which would silently
        // fail the second artist's save)
        slug: (slugify(`${release.artist}-${release.title}`) || "release") + "-" + id.slice(0, 6),
      });
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, release, releaseDate, streamingLink]);

  const signOut = () => {
    if (supabase) supabase.auth.signOut();
  };

  // Persist the artist's profile picture URL (avatar_url is a non-privileged
  // column, so the owner's own UPDATE is allowed by RLS + the protect trigger).
  const updateAvatar = async (url: string) => {
    setAvatarUrl(url);
    if (supabase && sessionRef.current) {
      try {
        await supabase.from("rollout_artists")
          .update({ avatar_url: url }).eq("id", sessionRef.current.user.id);
      } catch { /* best-effort; local state already reflects it */ }
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
        refreshPlan,
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
        avatarUrl,
        updateAvatar,
        isAdmin,
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
