import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Eye,
  EyeOff,
  Layers,
  Loader2,
  Lock,
  Package,
  RefreshCw,
  Settings,
  Upload,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore, getSeeds, rotateSeeds } from "@/store";
import { loadImgConn } from "@/pages/Settings";
import { renderStack, DEFAULT_LAYERS, type Layers as LayerStack, type BlendMode } from "@/compositor";

// $0, keyless image generation. Built-in AI must never cost us money.
const IMG = (prompt: string, seed: number) =>
  `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
  `?width=1024&height=1024&seed=${seed}&nologo=true&model=flux`;

const fullPrompt = (direction: string, keywords: string[], moods: string[]) => {
  const kws = keywords.length ? keywords.join(", ") : "abstract texture";
  const md = moods.length ? moods.join(", ") : "cinematic";
  const dir = direction.trim();
  return (
    `album cover art, ${dir ? dir + ", " : ""}${kws}, ${md} mood, ` +
    `no text, no lettering, no words, high detail, cinematic lighting, ` +
    `square composition, professional music artwork`
  );
};



const BLENDS: BlendMode[] = ["overlay", "multiply", "screen", "soft-light", "color"];
const FONTS = ["Arial Black", "Georgia", "Courier New", "Helvetica Neue"];

export default function App() {
  const { release, setRelease, go, plan, openUpgrade } = useStore();

  // Fall back to Fail Safe so the screen still demos if opened directly.
  const r = release ?? {
    filename: "Fail Safe Xkaii.wav",
    title: "Fail Safe",
    artist: "Xkaii",
    key: "C minor",
    bpm: 99,
    duration: "3:56",
    moods: ["emotional", "moody", "driving"],
    keywords: ["dramatic light", "deep shadow", "film grain", "dark tones", "neon glow"],
  };

  const [direction, setDirection] = useState("");
  const [seeds, setSeeds] = useState<number[]>(getSeeds());
  const [selected, setSelected] = useState(0);
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
  const [downloading, setDownloading] = useState(false);
  const [layers, setLayers] = useState<LayerStack>(DEFAULT_LAYERS);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseImgRef = useRef<HTMLImageElement | null>(null);
  const subjectImgRef = useRef<HTMLImageElement | null>(null);
  const subjectBlobRef = useRef<Blob | null>(null);
  const [subjectPrompt, setSubjectPrompt] = useState("");
  // restore the subject cut-out across reloads (it's part of the work)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("rollout_subject");
      if (saved) {
        const img = new Image();
        img.onload = () => { subjectImgRef.current = img; draw(); };
        img.src = saved;
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistSubject = (blob: Blob) => {
    try {
      const fr = new FileReader();
      fr.onload = () => {
        try { localStorage.setItem("rollout_subject", String(fr.result)); }
        catch { /* over quota — preview still works this session */ }
      };
      fr.readAsDataURL(blob);
    } catch { /* ignore */ }
  };
  // model catalog — artists pick a model like a filter, zero API knowledge
  type CatalogModel = { id: string; label: string; provider: string; model: string; tier: string; available: boolean };
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [pick, setPick] = useState<string>(() => {
    try { return localStorage.getItem("rollout_model") || "builtin"; } catch { return "builtin"; }
  });
  const choose = (id: string) => {
    setPick(id);
    try { localStorage.setItem("rollout_model", id); } catch { /* ignore */ }
  };
  useEffect(() => {
    fetch("http://127.0.0.1:8000/imagemodels")
      .then((r) => r.json())
      .then((j) => setCatalog(j.models))
      .catch(() => setCatalog([]));
  }, []);
  const [subjectBusy, setSubjectBusy] = useState(false);
  // Hidden self-test (?page=Cover&autotest=composite): runs the REAL pipeline
  // end-to-end and displays the flattened composite full-screen for review.
  const [autotestUrl, setAutotestUrl] = useState("");
  // art direction: album-cover design knowledge drives the prompt + layers
  const [styles, setStyles] = useState<{ id: string; label: string }[]>([]);
  const [style, setStyle] = useState<string>(() => {
    try { return localStorage.getItem("rollout_style") || "auto"; } catch { return "auto"; }
  });
  const [artPrompt, setArtPrompt] = useState("");
  useEffect(() => {
    fetch("http://127.0.0.1:8000/artstyles")
      .then((r) => r.json())
      .then((j) => setStyles(j.styles))
      .catch(() => setStyles([]));
  }, []);
  // fetch direction whenever style / vibe / user direction changes (debounced)
  useEffect(() => {
    let dead = false;
    const t = setTimeout(() => {
      fetch("http://127.0.0.1:8000/artdirect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moods: r.moods, keywords: r.keywords, direction, style, genre: (r as { genre?: string }).genre || "" }),
      })
        .then((res) => res.json())
        .then((j) => {
          if (dead) return;
          setArtPrompt(j.prompt);
          // apply the archetype's layer recipe (user can still tweak after)
          const L = j.layers;
          setLayers((prev) => ({
            ...prev,
            wash: { ...prev.wash, color1: L.wash.color1, color2: L.wash.color2, blend: L.wash.blend, opacity: L.wash.opacity },
            texture: { ...prev.texture, kind: L.texture.kind, opacity: L.texture.opacity },
            light: { ...prev.light, kind: L.light.kind, color: L.light.color ?? prev.light.color, opacity: L.light.opacity },
            type: { ...prev.type, layout: L.type.layout, font: L.type.font },
          }));
        })
        .catch(() => { if (!dead) setArtPrompt(""); });
    }, 350);
    return () => { dead = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, direction, r.filename]);
  const chooseStyle = (id: string) => {
    setStyle(id);
    try { localStorage.setItem("rollout_style", id); } catch { /* ignore */ }
  };

  // --- start from a photo: exact composite / AI restyle / essence ---------
  const photoRef = useRef<HTMLInputElement>(null);
  const [photoB64, setPhotoB64] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [photoBusy, setPhotoBusy] = useState<"" | "exact" | "restyle" | "essence">("");
  const [photoMsg, setPhotoMsg] = useState("");

  const onPhoto = (f: File) => {
    const fr = new FileReader();
    fr.onload = () => {
      setPhotoB64(String(fr.result).split(",")[1] || "");
      setPhotoName(f.name);
      setPhotoMsg("");
    };
    fr.readAsDataURL(f);
  };

  // Mode 1 — pixel-exact: cut the person out, design the cover around them
  const photoExact = async () => {
    if (!photoB64) return;
    setPhotoBusy("exact");
    setPhotoMsg("");
    try {
      const res = await fetch("http://127.0.0.1:8000/removebg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ b64: photoB64 }),
      });
      if (!res.ok) throw new Error("cut-out failed");
      const blob = await res.blob();
      persistSubject(blob);
      const img = new Image();
      img.onload = () => {
        subjectImgRef.current = img;
        setLayers((L) => ({ ...L, subject: { ...L.subject, visible: true } }));
        draw();
        setPhotoMsg("✓ you're on the cover — exactly as photographed");
      };
      img.src = URL.createObjectURL(blob);
    } catch {
      setPhotoMsg("cut-out failed — is the engine running?");
    } finally {
      setPhotoBusy("");
    }
  };

  // Mode 2 — AI restyle: whole photo redrawn in the style, identity kept
  const photoRestyle = async () => {
    if (!photoB64) return;
    setPhotoBusy("restyle");
    setPhotoMsg("");
    try {
      const conn = loadImgConn();
      const res = await fetch("http://127.0.0.1:8000/genimage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: conn.provider, key: conn.key, model: conn.model,
          base_url: conn.base_url, prompt, image_b64: photoB64, seed: seeds[selected],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      byoBlobs.current[selected] = blob;
      const url = URL.createObjectURL(blob);
      setUrls((u) => u.map((x, i) => (i === selected ? url : x)));
      setPhotoMsg("✓ restyled — your photo, redrawn in this style");
    } catch (e) {
      setPhotoMsg(String(e instanceof Error ? e.message : e).slice(0, 90));
    } finally {
      setPhotoBusy("");
    }
  };

  // Mode 3 — essence: new art that FEELS like their photo
  const photoEssence = async () => {
    if (!photoB64) return;
    setPhotoBusy("essence");
    setPhotoMsg("");
    try {
      const res = await fetch("http://127.0.0.1:8000/photoessence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ b64: photoB64 }),
      });
      if (!res.ok) throw new Error("essence read failed");
      const j = await res.json();
      if (j.palette?.length >= 2) {
        setLayers((L) => ({ ...L, wash: { ...L.wash, color1: j.palette[0], color2: j.palette[1] } }));
      }
      setDirection((d) => (j.character + (d ? ", " + d : "")));
      setPhotoMsg("✓ essence captured — palette + mood now drive new concepts");
    } catch {
      setPhotoMsg("essence read failed — is the engine running?");
    } finally {
      setPhotoBusy("");
    }
  };

  useEffect(() => {
    setDirection(r.keywords.slice(0, 3).join(", "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.filename]);

  const localPrompt = useMemo(
    () => fullPrompt(direction, r.keywords, r.moods),
    [direction, r.keywords, r.moods]
  );
  // art-directed prompt (design knowledge) wins; local build is the fallback
  const prompt = artPrompt || localPrompt;
  const builtinUrls = useMemo(() => seeds.map((s) => IMG(prompt, s)), [prompt, seeds]);
  // BYO provider chain: generate through the artist's connected account,
  // auto-fallback to the built-in generator on any failure.
  const [urls, setUrls] = useState<string[]>(builtinUrls);
  const byoBlobs = useRef<Record<number, Blob>>({});
  useEffect(() => {
    const conn = loadImgConn();
    const cat = catalog.find((m) => m.id === pick);
    // resolve the generation source: catalog platform model > BYO account > builtin
    let source: { provider: string; model: string; key: string; base_url: string } | null = null;
    if (cat && cat.available && cat.provider === "platform") {
      source = { provider: "platform", model: cat.model, key: "", base_url: "" };
    } else if (conn.provider !== "builtin") {
      source = { provider: conn.provider, model: conn.model, key: conn.key, base_url: conn.base_url };
    }
    let dead = false;
    byoBlobs.current = {};
    if (!source) {
      setUrls(builtinUrls);
      return;
    }
    setLoaded({});
    setUrls(["", "", "", ""]);
    (async () => {
      const out: string[] = [...builtinUrls];
      await Promise.all(
        seeds.map(async (seed, i) => {
          try {
            const res = await fetch("http://127.0.0.1:8000/genimage", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...source, prompt, seed, size: 1024 }),
            });
            if (!res.ok) throw new Error(await res.text());
            const blob = await res.blob();
            byoBlobs.current[i] = blob;
            out[i] = URL.createObjectURL(blob);
          } catch {
            out[i] = builtinUrls[i]; // graceful fallback per-variant
          }
        })
      );
      if (!dead) setUrls([...out]);
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builtinUrls, pick, catalog]);

  // Load the selected base image, then re-render the stack.
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      baseImgRef.current = img;
      draw();
    };
    img.src = urls[selected];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls, selected]);

  const draw = () => {
    if (canvasRef.current) {
      renderStack(canvasRef.current, 840, layers, baseImgRef.current, r.title, r.artist, subjectImgRef.current);
    }
  };

  // Generate an isolated subject: AI image on plain bg -> rembg cut-out
  const makeSubject = async (override?: string) => {
    const subjPrompt = (override ?? subjectPrompt).trim();
    if (!subjPrompt) return;
    setSubjectBusy(true);
    try {
      const srcUrl = IMG(
        `studio photo of ${subjPrompt}, single subject, centered, plain solid background, no text`,
        Math.floor(Math.random() * 1_000_000)
      );
      const res = await fetch("http://127.0.0.1:8000/removebg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: srcUrl }),
      });
      if (!res.ok) throw new Error("cutout failed");
      const blob = await res.blob();
      subjectBlobRef.current = blob;
      persistSubject(blob);
      const img = new Image();
      img.onload = () => {
        subjectImgRef.current = img;
        draw();
      };
      img.src = URL.createObjectURL(blob);
    } catch {
      /* leave subject empty */
    } finally {
      setSubjectBusy(false);
    }
  };
  // Re-render whenever the stack changes
  useEffect(draw, [layers, r.title, r.artist]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!window.location.search.includes("autotest=composite")) return;
    let dead = false;
    (async () => {
      const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
      for (let i = 0; i < 90 && !baseImgRef.current; i++) await wait(1000);
      await makeSubject("lone astronaut in a spacesuit");
      for (let i = 0; i < 90 && !subjectImgRef.current; i++) await wait(1000);
      if (dead) return;
      try {
        const out = document.createElement("canvas");
        renderStack(out, 1500, layers, baseImgRef.current, r.title, r.artist, subjectImgRef.current);
        setAutotestUrl(out.toDataURL("image/jpeg", 0.92));
      } catch (e) {
        setAutotestUrl("error:" + String(e));
      }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = <K extends keyof LayerStack>(key: K, p: Partial<LayerStack[K]>) =>
    setLayers((L) => ({ ...L, [key]: { ...L[key], ...p } }));

  const regenerate = () => {
    if (plan === "free") {
      openUpgrade("Unlimited AI covers");
      return;
    }
    setLoaded({});
    setSeeds(rotateSeeds());
  };

  const download = async () => {
    // Doc freemium spec: high-res asset exporting is paywalled.
    if (plan === "free") {
      openUpgrade("High-res export (3000×3000)");
      return;
    }
    try {
      setDownloading(true);
      // Fetch a genuinely upscaled base through the backend, then run the
      // SAME layer stack at 3000px — export is the composite, not raw AI.
      let upBody: Record<string, unknown> = { url: urls[selected], size: 3000 };
      const blob0 = byoBlobs.current[selected];
      if (blob0) {
        const b64 = await new Promise<string>((ok) => {
          const fr = new FileReader();
          fr.onload = () => ok(String(fr.result).split(",")[1] || "");
          fr.readAsDataURL(blob0);
        });
        upBody = { b64, size: 3000 };
      }
      const res = await fetch("http://127.0.0.1:8000/upscale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(upBody),
      });
      if (!res.ok) throw new Error("upscale failed");
      const blob = await res.blob();
      const hi = new Image();
      await new Promise<void>((ok, err) => {
        hi.onload = () => ok();
        hi.onerror = () => err(new Error("load failed"));
        hi.src = URL.createObjectURL(blob);
      });
      const out = document.createElement("canvas");
      renderStack(out, 3000, layers, hi, r.title, r.artist, subjectImgRef.current);
      URL.revokeObjectURL(hi.src);
      const png: Blob = await new Promise((ok, err) =>
        out.toBlob((b) => (b ? ok(b) : err(new Error("encode failed"))), "image/png")
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(png);
      a.download = `${r.title || "cover"}-cover-3000.png`.replace(/\s+/g, "-");
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(urls[selected], "_blank");
    } finally {
      setDownloading(false);
    }
  };

  // --- layer row UI helpers -----------------------------------------------
  const Row = ({
    name,
    k,
    children,
  }: {
    name: string;
    k: keyof LayerStack;
    children?: React.ReactNode;
  }) => (
    <div className="rounded-xl border border-white/10 bg-[#15151C] p-3 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-50">{name}</span>
        <button aria-label={`Toggle ${name} layer`} onClick={() => patch(k, { visible: !layers[k].visible } as never)}>
          {layers[k].visible
            ? <Eye className="size-3.5 text-violet-500" />
            : <EyeOff className="size-3.5 text-[#5e5a72]" />}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-[#5e5a72] w-12">opacity</span>
        <input
          type="range" min={0} max={100}
          value={Math.round(layers[k].opacity * 100)}
          onChange={(e) => patch(k, { opacity: Number(e.target.value) / 100 } as never)}
          className="flex-1 accent-violet-500 h-1"
        />
      </div>
      {children}
    </div>
  );

  const Pills = ({ options, value, onPick }: { options: string[]; value: string; onPick: (v: string) => void }) => (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onPick(o)}
          className={
            "rounded-full border px-2 py-0.5 text-[10px] transition-colors " +
            (value === o ? "border-violet-500 bg-violet-500/15 text-[#F2F0F7]" : "border-white/10 text-[#9A96AD]")
          }
        >
          {o}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      {autotestUrl && (
        autotestUrl.startsWith("error:") ? (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0B0B0F] font-mono text-sm text-red-400 p-8">{autotestUrl}</div>
        ) : (
          <img src={autotestUrl} alt="composite self-test result" className="fixed inset-0 z-[200] h-full w-full object-contain bg-[#0B0B0F]" />
        )
      )}
      <div className="text-neutral-50 min-h-screen">
        {/* main */}
        <div className="overflow-y-auto flex-1 h-screen">
          <div className="flex px-6 xl:px-12 pt-8 justify-between items-center">
            <div className="text-[#9A96AD] text-sm leading-5">
              Releases<span className="text-[#9A96AD]/50 mx-1">/</span>{r.title}
              <span className="text-[#9A96AD]/50 mx-1">/</span>
              <span className="text-neutral-50">Cover Canvas</span>
            </div>
            <div className="font-mono rounded-full bg-[#15151C] text-[#9A96AD] text-xs border-white/10 border-1 border-solid px-3 py-1.5">
              layered composite — not raw AI output
            </div>
          </div>

          {/* art direction — album-cover design archetypes */}
          {styles.length > 0 && (
            <div className="flex px-12 pt-5 items-center gap-2 flex-wrap">
              <span className="font-mono text-[11px] uppercase tracking-wider text-[#5E5A72]">Style</span>
              {styles.map((s) => (
                <button
                  key={s.id}
                  onClick={() => chooseStyle(s.id)}
                  className={
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                    (style === s.id
                      ? "border-violet-500 bg-violet-500/15 text-[#F2F0F7]"
                      : "border-white/10 text-[#9A96AD] hover:border-white/20")
                  }
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* model catalog — pick a generator like a filter */}
          {catalog.length > 0 && (
            <div className="flex px-12 pt-5 items-center gap-2 flex-wrap">
              <span className="font-mono text-[11px] uppercase tracking-wider text-[#5E5A72]">Model</span>
              {catalog.map((m) => (
                <button
                  key={m.id}
                  onClick={() => m.available && choose(m.id)}
                  disabled={!m.available}
                  title={m.available ? m.label : "Platform credits arrive at launch"}
                  className={
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                    (pick === m.id && m.available
                      ? "border-violet-500 bg-violet-500/15 text-[#F2F0F7]"
                      : m.available
                        ? "border-white/10 text-[#9A96AD] hover:border-white/20"
                        : "border-white/8 text-[#5E5A72] opacity-60 cursor-not-allowed")
                  }
                >
                  {m.label}
                  {!m.available && <span className="ml-1.5 font-mono text-[9px] uppercase tracking-wider text-[#F0A45B]">soon</span>}
                </button>
              ))}
            </div>
          )}

          <div className="flex px-6 xl:px-12 py-8 items-start gap-8">
            {/* base variants — Screen 6 style: rounded-2xl + amber AI badge */}
            <div className="shrink-0 flex flex-col gap-4 w-32">
              <div className="uppercase text-[#9A96AD] text-xs tracking-widest mb-1">Options</div>
              {[0, 1, 2, 3].map((i) => (
                <button
                  key={i}
                  onClick={() => setSelected(i)}
                  className={
                    "relative cursor-pointer rounded-2xl w-32 h-32 overflow-hidden border-2 border-solid transition-all " +
                    (selected === i ? "border-violet-500" : "border-transparent hover:border-white/20")
                  }
                >
                  {!loaded[i] && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#15151C]">
                      <Loader2 className="size-4 animate-spin text-violet-500" />
                    </div>
                  )}
                  <img
                    src={urls[i]}
                    alt={`Base ${i + 1}`}
                    className="object-cover w-full h-full"
                    onLoad={() => setLoaded((l) => ({ ...l, [i]: true }))}
                  />
                  <div className="rounded-sm bg-[#0B0B0F]/70 border-[#F0A45B]/40 border-1 border-solid absolute left-1.5 top-1.5 px-1.5 py-0.5">
                    <span className="font-mono text-[#F0A45B] text-[9px]">AI</span>
                  </div>
                </button>
              ))}
              <Button onClick={regenerate} variant="ghost" className="border border-white/10 text-[#9A96AD] gap-1.5 text-xs h-9">
                {plan !== "free" ? <RefreshCw className="size-3.5" /> : <Lock className="size-3.5" />}
                New set
              </Button>
            </div>

            {/* live composite preview */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative aspect-square rounded-3xl border-white/10 border-1 border-solid w-80 xl:w-105 overflow-hidden bg-[#15151C]">
                <canvas ref={canvasRef} className="w-full h-full" />
              </div>
              <div className="font-mono text-[#9A96AD] text-xs">
                5-layer composite · preview 840px · exports 3000×3000 PNG
              </div>
              <div className="flex gap-2">
                <Button onClick={download} disabled={downloading} className="bg-[#F2F0F7] text-[#0B0B0F] gap-2">
                  {downloading ? <Loader2 className="size-4 animate-spin" /> : plan !== "free" ? <Download className="size-4" /> : <Lock className="size-4" />}
                  Export 3000px
                </Button>
                <Button
                  onClick={() => {
                    setRelease({ ...r, coverUrl: urls[selected] });
                    go("Distribute"); // doc order: cover -> distributor hand-off
                  }}
                  className="btn-glow text-white"
                >
                  Use this cover
                </Button>
              </div>
            </div>

            {/* layers panel */}
            <div className="shrink-0 edge rounded-2xl bg-[#15151C] border-white/10 border-1 border-solid flex p-5 flex-col gap-3 w-80">
              {/* start from a photo */}
              <div className="rounded-xl border border-white/10 bg-[#15151C] p-3 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-50">Start from your photo</span>
                  <button
                    onClick={() => photoRef.current?.click()}
                    className="font-mono text-[11px] text-violet-500 hover:text-[#F2F0F7] transition-colors"
                  >
                    {photoName ? "change" : "upload"}
                  </button>
                  <input
                    ref={photoRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); }}
                  />
                </div>
                {photoName && (
                  <span className="font-mono text-[10px] text-[#5E5A72] truncate">{photoName}</span>
                )}
                {photoB64 && (
                  <div className="flex flex-col gap-1.5">
                    <button onClick={photoExact} disabled={!!photoBusy}
                      className="rounded-lg border border-white/10 px-2.5 py-1.5 text-left text-[11px] text-[#9A96AD] hover:border-violet-500/60 hover:text-[#F2F0F7] transition-colors disabled:opacity-40">
                      <span className="font-semibold text-[#F2F0F7]">{photoBusy === "exact" ? "Cutting you out…" : "Keep me exact"}</span>
                      <span className="block text-[10px]">you, untouched — cover designed around you</span>
                    </button>
                    <button onClick={photoRestyle} disabled={!!photoBusy}
                      className="rounded-lg border border-white/10 px-2.5 py-1.5 text-left text-[11px] text-[#9A96AD] hover:border-violet-500/60 hover:text-[#F2F0F7] transition-colors disabled:opacity-40">
                      <span className="font-semibold text-[#F2F0F7]">{photoBusy === "restyle" ? "Restyling…" : "Restyle me"}</span>
                      <span className="block text-[10px]">AI redraws the photo in this style, identity kept</span>
                    </button>
                    <button onClick={photoEssence} disabled={!!photoBusy}
                      className="rounded-lg border border-white/10 px-2.5 py-1.5 text-left text-[11px] text-[#9A96AD] hover:border-violet-500/60 hover:text-[#F2F0F7] transition-colors disabled:opacity-40">
                      <span className="font-semibold text-[#F2F0F7]">{photoBusy === "essence" ? "Reading essence…" : "Inspired by"}</span>
                      <span className="block text-[10px]">all-new art that feels like your photo</span>
                    </button>
                  </div>
                )}
                {photoMsg && (
                  <span className={"font-mono text-[10px] " + (photoMsg.startsWith("✓") ? "text-[#46E0A8]" : "text-[#F0A45B]")}>{photoMsg}</span>
                )}
              </div>

              <div className="uppercase text-[#9A96AD] text-xs tracking-widest flex items-center gap-2">
                <Layers className="size-3.5" /> Layers
              </div>

              <Row name="5 · Typography" k="type">
                <Pills options={FONTS} value={layers.type.font} onPick={(v) => patch("type", { font: v })} />
                <Pills options={["bottom", "center", "top"]} value={layers.type.layout}
                  onPick={(v) => patch("type", { layout: v as LayerStack["type"]["layout"] })} />
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-[#5e5a72] w-12">color</span>
                  <input type="color" value={layers.type.color}
                    onChange={(e) => patch("type", { color: e.target.value })}
                    className="h-6 w-10 rounded border border-white/10 bg-transparent" />
                </div>
              </Row>

              <Row name="4 · Light" k="light">
                <Pills options={["vignette", "leak"]} value={layers.light.kind}
                  onPick={(v) => patch("light", { kind: v as LayerStack["light"]["kind"] })} />
                {layers.light.kind === "leak" && (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-[#5e5a72] w-12">color</span>
                    <input type="color" value={layers.light.color}
                      onChange={(e) => patch("light", { color: e.target.value })}
                      className="h-6 w-10 rounded border border-white/10 bg-transparent" />
                  </div>
                )}
              </Row>

              <Row name="3 · Texture" k="texture">
                <Pills options={["grain", "halftone", "scanlines"]} value={layers.texture.kind}
                  onPick={(v) => patch("texture", { kind: v as LayerStack["texture"]["kind"] })} />
              </Row>

              <Row name="2b · Subject cut-out" k="subject">
                <div className="flex gap-1.5">
                  <input
                    value={subjectPrompt}
                    onChange={(e) => setSubjectPrompt(e.target.value)}
                    placeholder="lone astronaut, rose, statue..."
                    className="flex-1 rounded-lg bg-[#1E1E28] border border-white/10 px-2.5 py-1.5 font-mono text-[11px] text-neutral-50 placeholder:text-[#5E5A72] focus:outline-none focus:ring-1 focus:ring-violet-500/40"
                  />
                  <button
                    onClick={() => makeSubject()}
                    disabled={subjectBusy || !subjectPrompt.trim()}
                    className="rounded-lg bg-violet-500 px-2.5 text-[11px] font-semibold text-white disabled:opacity-40"
                  >
                    {subjectBusy ? "…" : "Cut"}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-[#5e5a72] w-12">size</span>
                  <input type="range" min={30} max={120} value={Math.round(layers.subject.scale * 100)}
                    onChange={(e) => patch("subject", { scale: Number(e.target.value) / 100 })}
                    className="flex-1 accent-violet-500 h-1" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-[#5e5a72] w-12 shrink-0">pos</span>
                  <input type="range" min={0} max={100} value={Math.round(layers.subject.x * 100)}
                    onChange={(e) => patch("subject", { x: Number(e.target.value) / 100 })}
                    className="flex-1 accent-violet-500 h-1" />
                  <input type="range" min={0} max={100} value={Math.round(layers.subject.y * 100)}
                    onChange={(e) => patch("subject", { y: Number(e.target.value) / 100 })}
                    className="flex-1 accent-violet-500 h-1" />
                </div>
              </Row>

              <Row name="2 · Color wash" k="wash">
                <div className="flex items-center gap-2">
                  <input type="color" value={layers.wash.color1}
                    onChange={(e) => patch("wash", { color1: e.target.value })}
                    className="h-6 w-10 rounded border border-white/10 bg-transparent" />
                  <input type="color" value={layers.wash.color2}
                    onChange={(e) => patch("wash", { color2: e.target.value })}
                    className="h-6 w-10 rounded border border-white/10 bg-transparent" />
                  <input
                    type="range" min={0} max={360} value={layers.wash.angle}
                    onChange={(e) => patch("wash", { angle: Number(e.target.value) })}
                    className="flex-1 accent-violet-500 h-1"
                  />
                </div>
                <Pills options={BLENDS} value={layers.wash.blend}
                  onPick={(v) => patch("wash", { blend: v as BlendMode })} />
              </Row>

              <Row name="1 · Base art (AI)" k="base">
                <textarea
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                  className="min-h-16 w-full resize-none rounded-lg bg-[#1E1E28] border border-white/10 px-2.5 py-2 font-mono text-[11px] text-neutral-50 focus:outline-none focus:ring-1 focus:ring-violet-500/40"
                />
              </Row>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
