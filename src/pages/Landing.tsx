import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore, slugify } from "@/store";
import { supabase } from "@/lib/supabase";
import { PUBLIC_BASE } from "@/lib/api";

type Link = { key: string; label: string; color: string; url: string };

const DEFAULT_LINKS: Link[] = [
  { key: "spotify", label: "Spotify", color: "#1DB954", url: "" },
  { key: "apple", label: "Apple Music", color: "#FA57C1", url: "" },
  { key: "youtube", label: "YouTube", color: "#FF0000", url: "" },
  { key: "soundcloud", label: "SoundCloud", color: "#FF5500", url: "" },
];

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildHtml(o: {
  title: string; artist: string; cover: string; date: string; links: Link[];
}) {
  // only real http(s) links — drops javascript:/data:/etc. so a pasted
  // "javascript:..." can't become an executable href
  const active = o.links.filter((l) => /^https?:\/\//i.test(l.url.trim()));
  const buttons = active
    .map(
      (l) => `      <a class="btn" style="--c:${l.color}" href="${esc(l.url.trim())}" target="_blank" rel="noopener">
        <span>${esc(l.label)}</span><span class="arrow">Play &rsaquo;</span>
      </a>`
    )
    .join("\n");
  const dateLine = o.date
    ? `<div class="date">Out ${esc(o.date)}</div>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(o.title)} — ${esc(o.artist)}</title>
<meta property="og:title" content="${esc(o.title)} — ${esc(o.artist)}" />
<meta property="og:image" content="${esc(o.cover)}" />
<meta name="theme-color" content="#0b0b0f" />
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0b0b0f;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .bg{position:fixed;inset:-40px;background:url('${esc(o.cover)}') center/cover;filter:blur(60px) brightness(.5);transform:scale(1.1);z-index:0}
  .card{position:relative;z-index:1;width:min(92vw,420px);padding:32px 24px 28px;text-align:center}
  .cover{width:100%;aspect-ratio:1;border-radius:20px;object-fit:cover;box-shadow:0 30px 80px rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.08)}
  h1{font-size:30px;font-weight:800;letter-spacing:-.02em;margin-top:22px;text-transform:uppercase}
  .artist{color:#9A96AD;font-size:15px;letter-spacing:.18em;text-transform:uppercase;margin-top:6px}
  .date{color:#5E5A72;font-size:12px;letter-spacing:.1em;margin-top:10px;text-transform:uppercase}
  .btns{display:flex;flex-direction:column;gap:10px;margin-top:26px}
  .btn{display:flex;align-items:center;justify-content:space-between;padding:15px 18px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;text-decoration:none;font-weight:600;font-size:15px;transition:.15s;backdrop-filter:blur(6px)}
  .btn:hover{background:var(--c);border-color:var(--c);transform:translateY(-1px)}
  .arrow{color:#9A96AD;font-weight:500;font-size:13px}
  .btn:hover .arrow{color:#fff}
  .foot{margin-top:26px;color:#5e5a72;font-size:11px;letter-spacing:.06em}
  .foot a{color:#5E5A72;text-decoration:none}
</style>
</head>
<body>
  <div class="bg"></div>
  <div class="card">
    <img class="cover" src="${esc(o.cover)}" alt="${esc(o.title)} cover" />
    <h1>${esc(o.title)}</h1>
    <div class="artist">${esc(o.artist)}</div>
    ${dateLine}
    <div class="btns">
${buttons || '      <div class="foot">Add your streaming links to get started</div>'}
    </div>
    <div class="foot">Made with <a href="https://th3circle.app" target="_blank" rel="noopener">Rollout</a></div>
  </div>
</body>
</html>`;
}

export default function App() {
  const { release, session, go, setRelease } = useStore();
  const r = release ?? {
    filename: "Afterglow Nova.wav",
    title: "Afterglow",
    artist: "Nova",
    key: "A minor",
    bpm: 120,
    duration: "3:24",
    moods: ["emotional", "moody", "driving"],
    keywords: ["dramatic light", "deep shadow", "film grain"],
    coverUrl:
      "https://image.pollinations.ai/prompt/album%20cover%20art%2C%20dramatic%20light%2C%20deep%20shadow%2C%20film%20grain%2C%20dark%20tones%2C%20neon%20glow%2C%20emotional%2C%20moody%2C%20driving%20mood%2C%20no%20text%2C%20high%20detail%2C%20cinematic%20lighting%2C%20square%20composition?width=1024&height=1024&seed=424242&nologo=true&model=flux",
  };

  const [links, setLinks] = useState<Link[]>(DEFAULT_LINKS);
  const [date, setDate] = useState("");
  const [copied, setCopied] = useState(false);
  const [pubState, setPubState] = useState<"idle" | "publishing" | "done" | "err">("idle");

  // fan-page slug is suffixed with a slice of the cloud release id so two
  // artists with the same title never collide on one public URL
  const baseSlug = slugify(`${r.artist}-${r.title}`) || "release";
  const slug = r.id ? `${baseSlug}-${r.id.slice(0, 6)}` : baseSlug;
  const publicUrl = `${PUBLIC_BASE}/r/${slug}`;
  const publicHost = publicUrl.replace(/^https?:\/\//, "");
  const canPublish = Boolean(supabase && session && r.id);
  const cover = r.coverUrl || "";

  const html = useMemo(
    () => buildHtml({ title: r.title, artist: r.artist, cover, date, links }),
    [r.title, r.artist, cover, date, links]
  );

  const setUrl = (key: string, url: string) =>
    setLinks((ls) => ls.map((l) => (l.key === key ? { ...l, url } : l)));

  // editing the page after publishing makes the live version stale — nudge a
  // republish by dropping the "done" badge whenever the content changes
  useEffect(() => {
    setPubState((s) => (s === "done" ? "idle" : s));
  }, [html]);

  // Build the fully self-contained HTML (cover inlined as a data URI so the
  // page can never lose its art to a purged remote URL). Falls back to the URL
  // version if the cover can't be fetched. Used by both download and publish.
  const selfContainedHtml = async (): Promise<string> => {
    if (!cover) return html;
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 8000); // don't hang Publish on a stalled cover
      const res = await fetch(cover, { signal: ctrl.signal });
      const blob = await res.blob();
      clearTimeout(to);
      const dataUri: string = await new Promise((ok, err) => {
        const fr = new FileReader();
        fr.onload = () => ok(String(fr.result));
        fr.onerror = () => err(new Error("read failed"));
        fr.readAsDataURL(blob);
      });
      return buildHtml({ title: r.title, artist: r.artist, cover: dataUri, date, links });
    } catch {
      return html;
    }
  };

  const download = async () => {
    const exportHtml = await selfContainedHtml();
    const blob = new Blob([exportHtml], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "index.html";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Publish to Supabase so the page is live at PUBLIC_BASE/r/{slug}. Upsert on
  // slug; RLS (owner_all) guarantees an artist can only write their own row,
  // and public_read exposes it to fans only once published = true.
  const publish = async () => {
    if (!supabase || !session || !r.id) return;
    setPubState("publishing");
    try {
      const exportHtml = await selfContainedHtml();
      const { error } = await supabase.from("rollout_fan_pages").upsert(
        {
          slug,
          release_id: r.id,
          artist_id: session.user.id,
          html: exportHtml,
          published: true,
        },
        { onConflict: "slug" }
      );
      if (error) throw error;
      setPubState("done");
      // Mark the release page step complete so the Dashboard chip turns green.
      if (release && !release.pagePublished) setRelease({ ...release, pagePublished: true });
    } catch {
      setPubState("err");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="text-neutral-50 min-h-screen">
      {/* main */}
      <div className="overflow-y-auto flex-1 h-screen">
        <div className="flex px-6 xl:px-12 pt-8 justify-between items-center">
          <div className="text-[#9A96AD] text-sm">
            Releases<span className="text-[#9A96AD]/50 mx-1">/</span>{r.title}
            <span className="text-[#9A96AD]/50 mx-1">/</span>
            <span className="text-neutral-50">Landing Page</span>
          </div>
          <div className="font-mono rounded-full bg-[#15151C] text-[#9A96AD] text-xs border-white/10 border-1 border-solid px-3 py-1.5 flex items-center gap-2">
            {pubState === "done" && <span className="size-1.5 rounded-full bg-[#46E0A8]" />}
            {publicHost}
          </div>
        </div>

        <div className="flex px-6 xl:px-12 py-8 items-start gap-10">
          {/* live preview = the exact exported file */}
          <div className="shrink-0 flex flex-col items-center gap-3">
            <div className="rounded-[36px] border-white/10 border-1 border-solid bg-black p-3 ">
              <iframe
                title="Landing preview"
                srcDoc={html}
                sandbox="allow-popups"
                className="rounded-3xl bg-black"
                style={{ width: 300, height: 600, border: "none" }}
              />
            </div>
            <div className="font-mono text-[#5e5a72] text-xs">Live preview · what fans see</div>
          </div>

          {/* controls */}
          <div className="flex flex-col gap-8 max-w-md flex-1">
            <div className="flex flex-col gap-2">
              <h1 className="page-title text-3xl">Release page</h1>
              <p className="text-[#9A96AD] text-[17px] leading-7">
                One link for the drop. Hosted on Th3Circle, owned by you, no third-party smart-link tax.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="section-label">Streaming links</div>
              {links.map((l) => (
                <div key={l.key} className="flex items-center gap-3">
                  <span className="size-2.5 rounded-full shrink-0" style={{ background: l.color }} />
                  <span className="w-24 shrink-0 text-sm text-[#F2F0F7]">{l.label}</span>
                  <input
                    value={l.url}
                    onChange={(e) => setUrl(l.key, e.target.value)}
                    placeholder={`https://...`}
                    className="flex-1 rounded-xl bg-[#1E1E28] border border-white/10 px-3 py-2 text-sm text-neutral-50 placeholder:text-[#5E5A72] focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <div className="section-label">Release date</div>
              <input
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="Aug 15"
                className="rounded-xl bg-[#1E1E28] border border-white/10 px-3 py-2 text-sm text-neutral-50 placeholder:text-[#5E5A72] focus:outline-none focus:ring-2 focus:ring-violet-500/40 w-40"
              />
            </div>

            <div className="border-white/10 border-t-1 border-solid flex pt-6 flex-col gap-3">
              <Button
                onClick={publish}
                disabled={!canPublish || pubState === "publishing"}
                className="btn-primary rounded-xl text-white gap-2 w-full disabled:opacity-50"
              >
                {pubState === "publishing" ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}
                {pubState === "done" ? "Update live page" : pubState === "publishing" ? "Publishing…" : "Publish page"}
              </Button>

              {pubState === "done" && (
                <div className="rounded-xl bg-[#46E0A8]/10 border border-[#46E0A8]/30 px-3 py-2 text-center text-[13px] text-[#46E0A8]">
                  Live at <span className="font-mono">{publicHost}</span>
                </div>
              )}
              {pubState === "done" && (
                <Button onClick={() => go("Dashboard")} className="btn-primary rounded-xl text-white gap-2 w-full">
                  <Check className="size-4" /> Done — back to release
                </Button>
              )}
              {pubState === "err" && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-center text-[13px] text-red-400">
                  Couldn't publish. Try again in a moment.
                </div>
              )}
              {!canPublish && (
                <div className="text-center text-[12px] text-[#5E5A72]">
                  {supabase ? "Saving your release… publish unlocks in a moment." : "Sign in to publish a live page."}
                </div>
              )}

              <Button
                onClick={copyLink}
                variant="ghost"
                disabled={pubState !== "done"}
                className="text-[#9A96AD] gap-2 w-full disabled:opacity-40"
              >
                {copied ? <Check className="size-4 text-[#46E0A8]" /> : <Copy className="size-4" />}
                {copied ? "Link copied" : "Copy live link"}
              </Button>
              <Button onClick={download} variant="ghost" className="text-[#9A96AD] gap-2 w-full">
                <Download className="size-4" />Download page (.html)
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
