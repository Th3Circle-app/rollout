import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Link2,
  Loader2,
  Lock,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";

import { API_BASE as API } from "@/lib/api";

type Caption = {
  id: string;
  day?: number;
  phase: "pre-release" | "release-day" | "post-release";
  platform: string;
  label: string;
  text: string;
};

// A saved campaign: one generated plan, kept forever (until deleted) so leaving
// and coming back never loses your work. Each Generate/Regenerate adds a new one.
type Campaign = {
  id: string;
  name: string;
  date: string;
  link: string;
  about: string;
  caps: Caption[];
  createdAt: number;
};

function loadCampaigns(slug: string): Campaign[] {
  try {
    const raw = localStorage.getItem(`rollout_campaigns_${slug}`);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

const PHASE_STYLE: Record<string, string> = {
  "pre-release": "text-[#9A96AD] bg-[#1E1E28]",
  "release-day": "text-[#F2F0F7] bg-violet-500/15",
  "post-release": "text-[#46E0A8] bg-[#46E0A8]/10",
};

// Tier → how much of the campaign you get, by DURATION around release day:
// free = the release week, artist = a full month, studio = the whole campaign.
const PLAN_WINDOW: Record<string, { min: number; max: number; label: string }> = {
  free: { min: -3, max: 3, label: "7-day plan" },
  artist: { min: -14, max: 14, label: "full-month plan" },
  studio: { min: -9999, max: 9999, label: "unlimited plan" },
};
// Tier → how many total generations (first draft + regenerations) they get.
const MAX_GENS: Record<string, number> = { free: 1, artist: 6, studio: Infinity };

// Fallback day offsets for any caption without an explicit `day` from the engine.
const SCHEDULE: Record<string, number> = {
  announce: -14, teaser: -10, behind: -7, countdown: -3, lastcall: -1,
  dropday: 0, dropday_short: 0, post1: 3, lyricpush: 5, thanks: 7,
  duet: 10, milestone: 14, playlist: 21, throwback: 28,
};

function fmtDay(base: Date | null, offset: number) {
  if (!base) return offset === 0 ? "Drop day" : offset < 0 ? `T${offset}` : `T+${offset}`;
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function App() {
  const {
    release, plan, openUpgrade,
    releaseDate: date, setReleaseDate: setDate,
    streamingLink: link, setStreamingLink: setLink,
  } = useStore();
  const r = release ?? {
    filename: "Afterglow Nova.wav",
    title: "Afterglow",
    artist: "Nova",
    key: "A minor",
    bpm: 120,
    duration: "3:24",
    moods: ["emotional", "moody", "driving"],
    keywords: ["dramatic light", "deep shadow", "film grain"],
  };

  const slug = `${r.title}-${r.artist}`.toLowerCase();

  // Saved campaigns for THIS song, newest first. Persisted so they survive
  // navigation and reloads; the most recent opens automatically.
  const [campaigns, setCampaigns] = useState<Campaign[]>(() => loadCampaigns(slug));
  const [openId, setOpenId] = useState<string | null>(() => loadCampaigns(slug)[0]?.id ?? null);
  useEffect(() => {
    try { localStorage.setItem(`rollout_campaigns_${slug}`, JSON.stringify(campaigns)); } catch { /* ignore */ }
  }, [campaigns, slug]);

  const openCampaign = useMemo(() => campaigns.find((c) => c.id === openId) ?? null, [campaigns, openId]);

  const [about, setAbout] = useState(() => {
    try { return openCampaign?.about ?? localStorage.getItem(`rollout_about_${slug}`) ?? ""; } catch { return ""; }
  });
  useEffect(() => {
    try { localStorage.setItem(`rollout_about_${slug}`, about); } catch { /* ignore */ }
  }, [about, slug]);

  const caps = openCampaign?.caps ?? [];
  const generated = campaigns.length > 0;
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [variant, setVariant] = useState(0);
  const gensUsed = campaigns.length; // each generation is a saved campaign card

  const releaseDate = useMemo(() => {
    const d = new Date(date);
    return date && !isNaN(d.getTime()) ? d : null;
  }, [date]);

  const win = PLAN_WINDOW[plan] ?? PLAN_WINDOW.free;
  const maxGens = MAX_GENS[plan] ?? 1;
  const regensLeft = maxGens === Infinity ? Infinity : Math.max(0, maxGens - gensUsed);

  const runGenerate = async (v: number): Promise<Caption[] | null> => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`${API}/captions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: r.title,
          artist: r.artist,
          moods: r.moods,
          keywords: r.keywords,
          lyrics: release?.lyrics ?? "",
          date: releaseDate ? releaseDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "",
          link,
          about,
          variant: v,
          count: 14, // request the full pool; we trim to the tier's window below
        }),
      });
      const j = await res.json();
      return Array.isArray(j.captions) ? j.captions : [];
    } catch {
      setErr("Plan engine is waking up — give it a few seconds and try again.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Every successful generation is SAVED as its own campaign card so it's never
  // lost. A default name is applied; the artist can rename it inline.
  const saveCampaign = (got: Caption[], fresh: boolean) => {
    const id = `c_${Date.now()}`;
    const n = campaigns.length + 1;
    const name = fresh ? `${r.title} — take ${n}` : `${r.title} campaign`;
    const c: Campaign = { id, name, date, link, about, caps: got, createdAt: Date.now() };
    setCampaigns((cs) => [c, ...cs]);
    setOpenId(id);
  };

  // One action: generate a NEW plan. Each one is a fresh take (variant bumps)
  // and is saved as its own campaign card.
  const generate = async () => {
    if (!about.trim()) { setErr("Add a short description of your song first — it makes the plan specific to your track."); return; }
    if (gensUsed >= maxGens) { openUpgrade("More release-plan generations"); return; }
    const v = variant + 1;
    setVariant(v);
    const got = await runGenerate(v);
    if (got && got.length) saveCampaign(got, campaigns.length > 0);
  };

  const openCard = (id: string) => {
    setOpenId(id);
    const c = campaigns.find((x) => x.id === id);
    if (c) setAbout(c.about);
  };
  const renameCampaign = (id: string, name: string) =>
    setCampaigns((cs) => cs.map((c) => (c.id === id ? { ...c, name } : c)));
  const deleteCampaign = (id: string) => {
    const next = campaigns.filter((c) => c.id !== id);
    setCampaigns(next);
    if (openId === id) setOpenId(next[0]?.id ?? null);
  };

  const copy = async (c: Caption) => {
    if (plan === "free") { openUpgrade("Copy captions to clipboard"); return; }
    try {
      await navigator.clipboard.writeText(bakeLink(c.text));
      setCopiedId(c.id);
      setTimeout(() => setCopiedId(""), 1400);
    } catch { /* clipboard unavailable */ }
  };

  const SOCIALS: { key: string; label: string; url: (text: string) => string }[] = [
    { key: "tiktok", label: "TikTok", url: () => "https://www.tiktok.com/tiktokstudio/upload" },
    { key: "ig", label: "Reels", url: () => "https://www.instagram.com/" },
    { key: "x", label: "X", url: (text) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}` },
    { key: "yt", label: "Shorts", url: () => "https://studio.youtube.com/" },
  ];

  const handOff = async (c: Caption, s: (typeof SOCIALS)[number]) => {
    if (plan === "free") { openUpgrade("Copy captions and jump straight to your socials"); return; }
    const text = bakeLink(c.text);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(c.id);
      setTimeout(() => setCopiedId(""), 1400);
    } catch { /* clipboard blocked */ }
    window.open(s.url(text), "_blank", "noopener,noreferrer");
  };

  const linkLive = link.trim().length > 0;
  // Inject the live streaming link at render, so pasting it fills every caption
  // without needing a regeneration.
  const bakeLink = (text: string) => (linkLive ? text.replaceAll("{LINK}", link.trim()) : text);

  // Trim the generated campaign to this tier's duration window, then order it.
  const dayOf = (c: Caption) => c.day ?? SCHEDULE[c.id] ?? 0;
  const sorted = [...caps]
    .filter((c) => dayOf(c) >= win.min && dayOf(c) <= win.max)
    .sort((a, b) => dayOf(a) - dayOf(b));

  return (
    <div className="text-neutral-50 min-h-screen">
      <div className="overflow-y-auto flex-1 h-screen">
        <div className="flex px-6 xl:px-12 pt-8 justify-between items-center">
          <div className="text-[#9A96AD] text-sm">
            Releases<span className="text-[#9A96AD]/50 mx-1">/</span>{r.title}
            <span className="text-[#9A96AD]/50 mx-1">/</span>
            <span className="text-neutral-50">Release Plan</span>
          </div>
          <div className={"font-mono rounded-full text-xs border-1 border-solid px-3 py-1.5 " + (linkLive ? "border-[#46E0A8]/40 text-[#46E0A8] bg-[#46E0A8]/5" : "border-white/10 text-[#9A96AD] bg-[#15151C]")}>
            {linkLive ? "● link live — injected into all captions" : "○ waiting on streaming link"}
          </div>
        </div>

        <div className="px-6 xl:px-12 py-8 flex flex-col gap-8 max-w-4xl">
          <div className="flex flex-col gap-2">
            <h1 className="page-title text-[40px]">The dead zone, handled.</h1>
            <p className="text-[#9A96AD] text-[15px] leading-relaxed">
              Tell Rollout about <span className="text-[#F2F0F7]">{r.title}</span> and it writes your whole
              posting calendar — captions, timing, and hooks, all specific to your song.
            </p>
          </div>

          {/* song description — drives the whole plan */}
          <div className="panel rounded-3xl p-6 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="section-label">Tell us about the song <span className="text-[#F0A45B]">*</span></span>
              <span className="section-label">
                {win.label}{maxGens !== Infinity ? ` · ${regensLeft} generation${regensLeft === 1 ? "" : "s"} left` : " · unlimited generations"}
              </span>
            </div>
            <textarea
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              placeholder={`What is "${r.title}" about? The story, the feeling, who it's for, what inspired it. The more you say, the more specific your plan.`}
              className="min-h-24 w-full resize-none rounded-xl panel-inset px-3.5 py-3 text-sm text-neutral-50 placeholder:text-[#5E5A72] focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={generate}
                disabled={loading || !about.trim() || regensLeft === 0}
                className="btn-primary rounded-xl text-white gap-2 disabled:opacity-40"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : regensLeft === 0 ? <Lock className="size-4" /> : <Sparkles className="size-4" />}
                {regensLeft === 0 ? "Out of generations" : campaigns.length === 0 ? "Generate my plan" : "Generate a new plan"}
              </Button>
              <span className="font-mono text-[11px] text-[#5E5A72]">Each one is saved as a card you can reopen anytime.</span>
              {regensLeft === 0 && plan !== "studio" && (
                <button onClick={() => openUpgrade("More plans + the full campaign")} className="text-xs font-medium text-violet-400 hover:text-violet-300">
                  Upgrade for more →
                </button>
              )}
            </div>
            {err && <div className="text-sm text-[#F0A45B]">{err}</div>}
          </div>

          {/* saved campaigns — every generation is archived here, click to reopen */}
          {campaigns.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="section-label">Saved campaigns</span>
              <div className="flex flex-wrap gap-3">
                {campaigns.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => openCard(c.id)}
                    className={
                      "group relative w-56 cursor-pointer rounded-xl border p-4 transition-colors " +
                      (openId === c.id ? "border-violet-500 bg-violet-500/[0.06]" : "panel card-premium hover:border-white/20")
                    }
                  >
                    <input
                      value={c.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => renameCampaign(c.id, e.target.value)}
                      className="w-[85%] bg-transparent text-sm font-semibold text-[#F2F0F7] focus:outline-none"
                      aria-label="Campaign name"
                    />
                    <div className="mt-1 font-mono text-[10px] text-[#5E5A72]">
                      {c.caps.length} posts · saved {new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                    {openId === c.id && (
                      <span className="mt-2 inline-block rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">Open</span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteCampaign(c.id); }}
                      aria-label="Delete campaign"
                      className="absolute right-2.5 top-3 text-[#5E5A72] opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* controls: date + live link sync */}
          <div className="flex flex-wrap gap-6">
            <div className="flex flex-col gap-2">
              <div className="section-label">Release date</div>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-xl panel-inset px-3 py-2 text-sm text-neutral-50 focus:outline-none focus:ring-2 focus:ring-violet-500/40 [color-scheme:dark]"
              />
            </div>
            <div className="flex flex-col gap-2 flex-1 min-w-64">
              <div className="section-label flex items-center gap-1.5">
                <Link2 className="size-3" /> Streaming link (paste when live)
              </div>
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://open.spotify.com/track/..."
                className="rounded-xl panel-inset px-3 py-2 text-sm text-neutral-50 placeholder:text-[#5E5A72] focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
            </div>
          </div>

          {/* the generated plan */}
          {loading && caps.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-[#9A96AD]">
              <Loader2 className="size-4 animate-spin text-violet-500" /> Writing your {win.label} for {r.title}...
            </div>
          )}
          {!generated && !loading && (
            <div className="rounded-xl border border-dashed border-white/10 px-6 py-10 text-center text-sm text-[#9A96AD]">
              Add a description above and hit <span className="text-[#F2F0F7]">Generate my plan</span> to get your calendar.
            </div>
          )}

          <div className="flex flex-col gap-4">
            {sorted.map((c) => {
              const off = c.day ?? SCHEDULE[c.id] ?? 0;
              return (
                <div key={c.id} className="panel card-premium rounded-xl p-5 flex gap-5">
                  <div className="shrink-0 w-20 text-center">
                    <div className="font-mono text-sm font-bold text-neutral-50">{fmtDay(releaseDate, off)}</div>
                    <div className={"mt-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold " + (PHASE_STYLE[c.phase] || "")}>
                      {c.phase.replace("-", " ")}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-sm">{c.label}</span>
                      <span className="rounded-full bg-[#1E1E28] px-2 py-0.5 text-[10px] text-[#9A96AD]">{c.platform}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-[#9A96AD] leading-relaxed">
                      {bakeLink(c.text).split("{LINK}").map((part, i, arr) => (
                        <span key={i}>
                          {part}
                          {i < arr.length - 1 && (
                            <span className="rounded bg-[#F0A45B]/15 px-1.5 py-0.5 font-mono text-[11px] text-[#F0A45B]">
                              link drops in when live
                            </span>
                          )}
                        </span>
                      ))}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="section-label">Copy + open</span>
                      {SOCIALS.map((s) => (
                        <button
                          key={s.key}
                          onClick={() => handOff(c, s)}
                          className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-medium text-[#9A96AD] transition-colors hover:border-violet-500/60 hover:text-white"
                        >
                          {s.label}
                        </button>
                      ))}
                      {plan === "free" && <Lock className="size-3 text-[#5e5a72]" />}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <Button variant="ghost" onClick={() => copy(c)} className="text-[#9A96AD] gap-2">
                      {copiedId === c.id ? (
                        <><Check className="size-4 text-[#46E0A8]" />Copied</>
                      ) : plan !== "free" ? (
                        <><Copy className="size-4" />Copy</>
                      ) : (
                        <><Lock className="size-4" />Copy<span className="text-[10px] font-semibold opacity-80">PRO</span></>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {generated && plan !== "studio" && (
            <button
              onClick={() => openUpgrade(plan === "free" ? "A full month of posts, not just the release week" : "The whole campaign — unlimited")}
              className="rounded-xl border border-violet-400/30 bg-violet-500/[0.05] px-5 py-4 text-left transition-colors hover:border-violet-400/60"
            >
              <span className="text-sm font-semibold text-[#F2F0F7]">
                {plan === "free" ? "Want more than the release week?" : "Want the full campaign?"}
              </span>
              <span className="mt-0.5 block text-[13px] text-[#9A96AD]">
                {plan === "free"
                  ? "Artist unlocks a full-month plan; Studio gives you the whole campaign with unlimited regenerations."
                  : "Studio extends the plan through the first month and beyond, with unlimited regenerations."}{" "}
                <span className="font-medium text-violet-300">Upgrade →</span>
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
