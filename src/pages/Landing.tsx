import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Layers,
  Link2,
  Package,
  Settings,
  Upload,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore, slugify } from "@/store";

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
  const active = o.links.filter((l) => l.url.trim());
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
  const { release } = useStore();
  const r = release ?? {
    filename: "Fail Safe Xkaii.wav",
    title: "Fail Safe",
    artist: "Xkaii",
    key: "C minor",
    bpm: 99,
    duration: "3:56",
    moods: ["emotional", "moody", "driving"],
    keywords: ["dramatic light", "deep shadow", "film grain"],
    coverUrl:
      "https://image.pollinations.ai/prompt/album%20cover%20art%2C%20dramatic%20light%2C%20deep%20shadow%2C%20film%20grain%2C%20dark%20tones%2C%20neon%20glow%2C%20emotional%2C%20moody%2C%20driving%20mood%2C%20no%20text%2C%20high%20detail%2C%20cinematic%20lighting%2C%20square%20composition?width=1024&height=1024&seed=424242&nologo=true&model=flux",
  };

  const [links, setLinks] = useState<Link[]>(DEFAULT_LINKS);
  const [date, setDate] = useState("");
  const [copied, setCopied] = useState(false);

  const slug = slugify(`${r.artist}-${r.title}`) || "release";
  const cover = r.coverUrl || "";

  const html = useMemo(
    () => buildHtml({ title: r.title, artist: r.artist, cover, date, links }),
    [r.title, r.artist, cover, date, links]
  );

  const setUrl = (key: string, url: string) =>
    setLinks((ls) => ls.map((l) => (l.key === key ? { ...l, url } : l)));

  const download = () => {
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "index.html";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`https://th3circle.app/r/${slug}`);
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
        <div className="flex px-12 pt-8 justify-between items-center">
          <div className="text-[#9A96AD] text-sm">
            Releases<span className="text-[#9A96AD]/50 mx-1">/</span>{r.title}
            <span className="text-[#9A96AD]/50 mx-1">/</span>
            <span className="text-neutral-50">Landing Page</span>
          </div>
          <div className="font-mono rounded-full bg-[#15151C] text-[#9A96AD] text-xs border-white/10 border-1 border-solid px-3 py-1.5">
            th3circle.app/r/{slug}
          </div>
        </div>

        <div className="flex px-12 py-8 items-start gap-10">
          {/* live preview = the exact exported file */}
          <div className="shrink-0 flex flex-col items-center gap-3">
            <div className="rounded-[36px] border-white/10 border-1 border-solid bg-black p-3 ">
              <iframe
                title="Landing preview"
                srcDoc={html}
                className="rounded-3xl bg-black"
                style={{ width: 340, height: 680, border: "none" }}
              />
            </div>
            <div className="font-mono text-[#5e5a72] text-xs">Live preview · what fans see</div>
          </div>

          {/* controls */}
          <div className="flex flex-col gap-8 max-w-md flex-1">
            <div className="flex flex-col gap-2">
              <h1 className="font-bold text-3xl tracking-tight">Release page</h1>
              <p className="text-[#9A96AD] text-sm">
                One link for the drop. Hosted on Th3Circle, owned by you, no third-party smart-link tax.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="uppercase text-[#9A96AD] text-xs tracking-widest">Streaming links</div>
              {links.map((l) => (
                <div key={l.key} className="flex items-center gap-3">
                  <span className="size-2.5 rounded-full shrink-0" style={{ background: l.color }} />
                  <span className="w-24 shrink-0 text-sm text-[#F2F0F7]">{l.label}</span>
                  <input
                    value={l.url}
                    onChange={(e) => setUrl(l.key, e.target.value)}
                    placeholder={`https://...`}
                    className="flex-1 rounded-lg bg-[#1E1E28] border border-white/10 px-3 py-2 text-sm text-neutral-50 placeholder:text-[#5E5A72] focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <div className="uppercase text-[#9A96AD] text-xs tracking-widest">Release date</div>
              <input
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="Aug 15"
                className="rounded-lg bg-[#1E1E28] border border-white/10 px-3 py-2 text-sm text-neutral-50 placeholder:text-[#5E5A72] focus:outline-none focus:ring-2 focus:ring-violet-500/40 w-40"
              />
            </div>

            <div className="border-white/10 border-t-1 border-solid flex pt-6 flex-col gap-3">
              <Button onClick={download} className="btn-glow text-white gap-2 w-full">
                <Download className="size-4" />Download page (.html)
              </Button>
              <Button onClick={copyLink} variant="ghost" className="text-[#9A96AD] gap-2 w-full">
                {copied ? <Check className="size-4 text-[#46E0A8]" /> : <Copy className="size-4" />}
                {copied ? "Link copied" : `Copy th3circle.app/r/${slug}`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
