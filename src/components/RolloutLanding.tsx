import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, Plus, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import GlassBackground from "@/components/GlassBackground";
import SmokeLayer from "@/components/SmokeLayer";
import StarField from "@/components/StarField";
import ErrorBoundary from "@/components/ErrorBoundary";

// Sponsors shown on the landing. Add an entry to feature a brand:
//   { name: "Acme", logo: "/sponsors/acme.svg", url: "https://acme.com" }
// Empty slots + a "Become a sponsor" tile render automatically.
const SPONSORS: { name: string; logo?: string; url?: string }[] = [];

// three.js is heavy; code-split it so the landing's copy + layout paint
// instantly and the 3D hero streams in right after.
const Headphones3D = lazy(() => import("@/components/Headphones3D"));

// Rollout's marketing front door — the page a logged-out artist (or an ad
// click) lands on before signing in. Premium motion-design treatment: a kinetic
// 3D hero, scroll-revealed story sections, glass pricing. "Start free" hands off
// to the auth wall; it doubles as the funnel into Th3Circle.

// scroll-triggered reveal: fades + rises into place the first time it enters view
function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${inView ? "in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

// kinetic headline — each word rises + unskews in, staggered
function Kinetic({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {text.split(" ").map((w, i) => (
        <span key={i} className="kinetic-word" style={{ ["--i" as string]: i } as React.CSSProperties}>
          {w}
          {i < text.split(" ").length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

// 3D tilt wrapper — the card leans toward the cursor for a tactile, premium feel
function TiltCard({ children, className = "", max = 7 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateY(${px * max}deg) rotateX(${-py * max}deg) translateY(-4px)`;
  };
  const onLeave = () => {
    if (ref.current) ref.current.style.transform = "";
  };
  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} className={"tilt " + className}>
      {children}
    </div>
  );
}

const STEPS: { n: string; title: string; body: string; accent: string; visual: ReactNode }[] = [
  {
    n: "01",
    title: "It starts with the music.",
    body: "Drop a finished track. Rollout reads the key, the tempo, and the actual mood of the record, then turns that reading into the whole visual and marketing direction. No briefs, no mood boards.",
    accent: "#8B5CF6",
    visual: (
      <div className="flex flex-col gap-3">
        <div className="flex items-end gap-[3px] h-16">
          {[6, 11, 16, 9, 13, 16, 7, 12, 15, 8, 5, 14, 16, 10, 6, 13, 9, 15, 7, 12].map((h, i) => (
            <div key={i} className="w-1.5 rounded-full bg-violet-500/70" style={{ height: h * 4 }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {["A minor", "112 BPM", "dreamy", "warm", "cinematic"].map((t) => (
            <span key={t} className="rounded-full border border-white/10 bg-[#1E1E28] px-3 py-1 font-mono text-[11px] text-[#9A96AD]">{t}</span>
          ))}
        </div>
      </div>
    ),
  },
  {
    n: "02",
    title: "Cover art that doesn't look AI-made.",
    body: "A layered canvas, not a slot-machine prompt. Start from your own photo or a generated base, then push color, texture, light, and type. Export at a clean 3000 by 3000 ready for every store.",
    accent: "#F0A45B",
    visual: (
      <div className="grid grid-cols-2 gap-2">
        {[1, 2, 3, 4].map((n) => (
          <img
            key={n}
            src={`/covers/cover${n}.jpg`}
            alt="Album cover generated in Rollout"
            loading="lazy"
            className="aspect-square w-full rounded-lg border border-white/10 object-cover"
          />
        ))}
      </div>
    ),
  },
  {
    n: "03",
    title: "A lyric video in one click.",
    body: "Rollout finds the hook, aligns the sung words to the beat, and renders a vertical, motion-synced lyric video sized for TikTok and Reels. The part that used to eat an editor's afternoon.",
    accent: "#46E0A8",
    visual: (
      <div className="mx-auto w-32 rounded-[1.7rem] border border-white/10 bg-black p-2 shadow-2xl">
        <div className="relative aspect-[9/16] overflow-hidden rounded-2xl">
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src="/videos/lyric-loop.mp4"
            poster="/videos/lyric-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
          />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(11,11,15,0.9), rgba(11,11,15,0.12) 55%, rgba(11,11,15,0.5))" }} />
          <div className="absolute inset-x-0 bottom-0 p-3 text-center">
            <span className="font-bold uppercase leading-tight text-white text-sm [text-shadow:0_2px_8px_rgba(0,0,0,0.8)]">hold on<br />to the night</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    n: "04",
    title: "The dead zone, handled.",
    body: "While the distributor processes, your calendar is already built and your captions are already written, seeded from the real vibe of the song and dated to your release. Copy, post, done.",
    accent: "#8B5CF6",
    visual: (
      <div className="flex flex-col gap-2">
        {[["Aug 12", "pre-release", "#8B5CF6"], ["Aug 15", "release day", "#46E0A8"], ["Aug 19", "post-release", "#F0A45B"]].map(([d, p, c]) => (
          <div key={d} className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#1E1E28] px-3 py-2.5">
            <span className="font-mono text-xs font-bold text-[#F2F0F7] w-14">{d}</span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${c}22`, color: c as string }}>{p}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    n: "05",
    title: "One link. You own the fans.",
    body: "Every release gets a hosted page on your own domain, with your streaming links and your art. No smart-link tax, no algorithm sitting between you and the people who follow you. The fans are yours to keep.",
    accent: "#46E0A8",
    visual: (
      <div className="rounded-2xl border border-white/10 bg-[#0b0b0f] p-4 text-center">
        <img
          src="/covers/fanpage.jpg"
          alt="Release cover"
          loading="lazy"
          className="mx-auto mb-3 h-20 w-20 rounded-xl border border-white/10 object-cover"
        />
        <div className="font-bold uppercase tracking-wide text-white text-sm">Afterglow</div>
        <div className="mt-0.5 font-mono text-[10px] text-[#5E5A72]">Nova Reyes</div>
        <div className="mt-3 flex flex-col gap-1.5">
          {["Spotify", "Apple Music", "YouTube"].map((s) => (
            <div key={s} className="rounded-lg border border-white/10 py-1.5 text-[11px] text-[#9A96AD]">{s}</div>
          ))}
        </div>
      </div>
    ),
  },
];

const TIERS: { name: string; price: string; per: string; blurb: string; feats: string[]; cta: string; featured?: boolean }[] = [
  {
    name: "Free",
    price: "$0",
    per: "one release",
    blurb: "Run your first song through the whole pipeline. See it before you pay.",
    feats: ["Full vibe analysis", "Cover canvas + export", "Release plan + captions", "One hosted release page"],
    cta: "Start free",
  },
  {
    name: "Artist",
    price: "$15",
    per: "per month",
    blurb: "Release properly, every drop, with no limits.",
    feats: ["Everything in Free", "Unlimited releases", "Lyric video renders", "Your own model keys (BYO)", "Priority pipeline"],
    cta: "Go Artist",
    featured: true,
  },
  {
    name: "Studio",
    price: "$29",
    per: "per month",
    blurb: "Market like a machine. The full campaign engine.",
    feats: ["Everything in Artist", "Ad campaign builder", "Advanced art direction", "Everything, unlocked"],
    cta: "Go Studio",
  },
];

export default function RolloutLanding({ onStart }: { onStart: () => void }) {
  const featuresRef = useRef<HTMLDivElement>(null);
  const scrollToFeatures = () => featuresRef.current?.scrollIntoView({ behavior: "smooth" });
  const [scrolled, setScrolled] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
      const el = progressRef.current;
      if (el) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        el.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="relative min-h-screen bg-[#0B0B0F] text-neutral-50">
      {/* premium finish: scroll-progress line + fixed film grain over everything */}
      <div ref={progressRef} className="scroll-progress" aria-hidden />
      <div className="grain" aria-hidden />
      {/* fixed depth layer — the orb + 3D headphones persist across the whole
          page as you scroll, instead of living only in the hero */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <GlassBackground style={{ position: "absolute", opacity: 0.95 }} />
        {/* twinkling stars + shooting stars (z1), over the blob's dark sky */}
        <StarField style={{ position: "absolute" }} />
        {/* smoke drifts BEHIND the headphones (z2) — depth without fogging the hero */}
        <SmokeLayer style={{ position: "absolute" }} />
        <ErrorBoundary>
          <Suspense fallback={null}>
            <Headphones3D style={{ position: "absolute", zIndex: 3 }} scaleMul={0.8} offsetY={-0.3} />
          </Suspense>
        </ErrorBoundary>
      </div>
      <div className="relative z-10">
      {/* nav */}
      <nav className={"fixed inset-x-0 top-0 z-50 transition-colors duration-300 " + (scrolled ? "border-b border-white/8 bg-[#0B0B0F]/70 backdrop-blur-xl" : "")}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="glass flex items-center gap-2 rounded-full px-4 py-2">
            <div className="flex size-6 items-center justify-center rounded-lg bg-violet-500">
              <Zap className="size-3.5 text-[#0B0B0F]" fill="#0B0B0F" />
            </div>
            <span className="font-bold tracking-tight">Rollout</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onStart} className="hidden rounded-full px-4 py-2 text-sm text-[#9A96AD] transition-colors hover:text-white sm:block">
              Sign in
            </button>
            <Button onClick={onStart} className="btn-glow rounded-full px-5 py-2 text-sm font-semibold text-white">
              Start free
            </Button>
          </div>
        </div>
      </nav>

      {/* hero */}
      <section className="relative flex h-screen min-h-[720px] items-center justify-center overflow-hidden">
        {/* legibility scrim so the headline reads cleanly over the fixed 3D + orb */}
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{ background: "radial-gradient(ellipse 58% 48% at 50% 44%, rgba(11,11,15,0.5), rgba(11,11,15,0) 74%)" }}
        />
        <div className="relative z-20 mx-auto max-w-4xl px-6 text-center">
          <div className="mb-6 flex justify-center">
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[3px] text-[#9A96AD] backdrop-blur">
              For independent artists
            </span>
          </div>
          <h1 className="text-balance font-bold leading-[0.96] tracking-[-0.03em] text-[#F2F0F7] text-5xl sm:text-7xl">
            <Kinetic text="Drop one song." />
            <br />
            <Kinetic text="Get a whole release." className="text-violet-400" />
          </h1>
          <p className="mx-auto mt-7 max-w-xl text-pretty text-base leading-7 text-[#9A96AD] rise-3 sm:text-lg">
            Rollout reads your track and builds the cover, the lyric video, the release plan,
            the fan page, and the ad campaign. You keep the fans.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row rise-3">
            <Button onClick={onStart} className="btn-glow group h-12 rounded-xl px-7 text-base font-semibold text-white">
              Start free <ArrowRight className="ml-1 size-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
            <button onClick={scrollToFeatures} className="h-12 rounded-xl border border-white/12 px-7 text-base font-medium text-[#F2F0F7] transition-colors hover:border-white/25">
              See how it works
            </button>
          </div>
          <button onClick={onStart} className="mt-4 rise-3 font-mono text-[12px] text-[#9A96AD] transition-colors hover:text-violet-300">
            or unlock everything — <span className="font-semibold text-violet-300">7 days for $7</span>, then $15/mo
          </button>
        </div>
        <button
          onClick={scrollToFeatures}
          aria-label="Scroll to features"
          className="absolute bottom-8 left-1/2 z-20 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[3px] text-[#5E5A72] transition-colors hover:text-[#9A96AD]"
        >
          scroll
          <div className="mx-auto mt-2 h-8 w-px animate-pulse bg-gradient-to-b from-[#5E5A72] to-transparent" />
        </button>
      </section>

      {/* one-line thesis */}
      <section className="relative border-y border-white/8 bg-[#0B0B0F]/45 py-20">
        <div className="mx-auto max-w-4xl px-6">
          <Reveal>
            <p className="text-balance text-center text-2xl font-semibold leading-snug tracking-tight text-[#F2F0F7] sm:text-4xl">
              A release used to take a designer, an editor, a marketer, and two weeks.
              <span className="text-[#5E5A72]"> Now it takes one upload.</span>
            </p>
          </Reveal>
        </div>
      </section>

      {/* story sections */}
      <section className="relative bg-[#0B0B0F]/45">
      <div ref={featuresRef} className="mx-auto max-w-6xl px-6 py-24">
        <div className="flex flex-col gap-28">
          {STEPS.map((s, i) => (
            <div key={s.n} className={"grid items-center gap-10 md:grid-cols-2 " + (i % 2 === 1 ? "md:[direction:rtl]" : "")}>
              <Reveal className="md:[direction:ltr]">
                <div className="flex flex-col gap-5">
                  <span className="font-mono text-sm tracking-[4px]" style={{ color: s.accent }}>{s.n}</span>
                  <h2 className="text-balance text-3xl font-bold leading-tight tracking-tight text-[#F2F0F7] sm:text-4xl">
                    {s.title}
                  </h2>
                  <p className="max-w-md text-pretty text-base leading-7 text-[#9A96AD]">{s.body}</p>
                </div>
              </Reveal>
              <Reveal delay={120} className="md:[direction:ltr]">
                <TiltCard>
                  <div className="glass card-premium glass-edge rounded-3xl p-8">{s.visual}</div>
                </TiltCard>
              </Reveal>
            </div>
          ))}
        </div>
      </div>
      </section>

      {/* pricing */}
      <section className="relative border-t border-white/8 bg-[#0B0B0F]/45 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <div className="mb-14 text-center">
              <span className="font-mono text-[11px] uppercase tracking-[3px] text-violet-400">Pricing</span>
              <h2 className="mt-3 text-balance text-4xl font-bold tracking-tight text-[#F2F0F7] sm:text-5xl">
                Free to try. Cheap to run.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-[#9A96AD]">
                Your first release is free, all the way through. Upgrade only when you want to do it again.
              </p>
            </div>
          </Reveal>
          <div className="grid gap-5 md:grid-cols-3">
            {TIERS.map((t, i) => (
              <Reveal key={t.name} delay={i * 100}>
                <TiltCard max={5} className="h-full">
                <div className={"glass card-premium glass-edge flex h-full flex-col rounded-3xl p-7 " + (t.featured ? "ring-1 ring-violet-500/60" : "")}>
                  {t.featured && (
                    <span className="mb-4 w-fit rounded-full bg-violet-500/15 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-violet-300">
                      Most popular
                    </span>
                  )}
                  <div className="font-mono text-[11px] uppercase tracking-wider text-[#5E5A72]">{t.name}</div>
                  <div className="mt-2 flex items-end gap-1.5">
                    <span className="text-4xl font-bold tracking-tight text-[#F2F0F7]">{t.price}</span>
                    <span className="mb-1 font-mono text-xs text-[#5E5A72]">{t.per}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#9A96AD]">{t.blurb}</p>
                  <div className="my-6 h-px bg-white/8" />
                  <ul className="flex flex-1 flex-col gap-3">
                    {t.feats.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm text-[#F2F0F7]">
                        <Check className="mt-0.5 size-4 shrink-0 text-[#46E0A8]" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={onStart}
                    className={"mt-7 h-11 w-full rounded-xl font-semibold " + (t.featured ? "btn-glow text-white" : "border border-white/12 bg-transparent text-[#F2F0F7] hover:bg-white/5")}
                  >
                    {t.cta}
                  </Button>
                </div>
                </TiltCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* sponsors */}
      <section className="relative border-t border-white/8 bg-[#0B0B0F]/45 py-24">
        <div className="mx-auto max-w-5xl px-6">
          <Reveal>
            <div className="mb-10 text-center">
              <span className="font-mono text-[11px] uppercase tracking-[3px] text-violet-400">Sponsors</span>
              <h2 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-[#F2F0F7] sm:text-3xl">
                Backed by brands who believe in independent artists.
              </h2>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {SPONSORS.length > 0 &&
                SPONSORS.map((s) => (
                  <a
                    key={s.name}
                    href={s.url || "#"}
                    target={s.url ? "_blank" : undefined}
                    rel="noreferrer"
                    className="flex h-24 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.02] px-6 transition-colors hover:border-white/20"
                  >
                    {s.logo ? (
                      <img src={s.logo} alt={s.name} className="max-h-10 max-w-full object-contain opacity-80" />
                    ) : (
                      <span className="text-sm font-semibold text-[#CFCADB]">{s.name}</span>
                    )}
                  </a>
                ))}

              {/* open slots so the wall never looks empty */}
              {Array.from({ length: Math.max(0, 3 - SPONSORS.length) }).map((_, i) => (
                <div
                  key={`ghost-${i}`}
                  className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.01]"
                >
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[#5E5A72]">Your brand here</span>
                </div>
              ))}

              {/* become a sponsor — the "+" that lets more brands join */}
              <a
                href="mailto:harrison@xkaii.com?subject=Sponsor%20Rollout&body=Hi%2C%20I%27d%20like%20to%20sponsor%20Rollout."
                onClick={(e) => {
                  // mailto can silently no-op when no mail client is set as the
                  // default handler — open a Gmail compose as a guaranteed
                  // in-browser fallback so the click always does something.
                  const gmail =
                    "https://mail.google.com/mail/?view=cm&fs=1&to=harrison@xkaii.com" +
                    "&su=" + encodeURIComponent("Sponsor Rollout") +
                    "&body=" + encodeURIComponent("Hi, I'd like to sponsor Rollout.");
                  window.open(gmail, "_blank", "noopener");
                  e.preventDefault();
                }}
                className="group relative z-10 flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-violet-500/5 transition-colors hover:border-violet-400/50 hover:bg-violet-500/10"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-violet-500/15 text-violet-300 transition-colors group-hover:bg-violet-500/25">
                  <Plus className="size-5" />
                </span>
                <span className="text-xs font-medium text-[#CFCADB] group-hover:text-white">Become a sponsor</span>
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* final CTA — no local background; the fixed 3D layer shows through here */}
      <section className="relative overflow-hidden border-t border-white/8 py-32">
        <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
          <Reveal>
            <h2 className="text-balance text-4xl font-bold leading-tight tracking-tight text-[#F2F0F7] sm:text-6xl">
              Your next release starts here.
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-lg text-[#9A96AD]">
              Upload one song and watch Rollout build the rest. No card to start.
            </p>
            <div className="mt-9 flex justify-center">
              <Button onClick={onStart} className="btn-glow group h-14 rounded-xl px-8 text-base font-semibold text-white">
                Start free <ArrowRight className="ml-1 size-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* footer */}
      <footer className="relative border-t border-white/8 bg-[#0B0B0F]/45 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex size-5 items-center justify-center rounded-md bg-violet-500">
              <Zap className="size-3 text-[#0B0B0F]" fill="#0B0B0F" />
            </div>
            <span className="text-sm font-semibold">Rollout</span>
            <span className="ml-2 font-mono text-[11px] text-[#5E5A72]">part of Th3Circle</span>
          </div>
          <div className="flex items-center gap-6 font-mono text-[11px] text-[#5E5A72]">
            <button onClick={onStart} className="transition-colors hover:text-[#9A96AD]">Sign in</button>
            <a href="/blog/" className="transition-colors hover:text-[#9A96AD]">Blog</a>
            <a href="https://th3circle.app" target="_blank" rel="noopener" className="transition-colors hover:text-[#9A96AD]">Th3Circle</a>
          </div>
        </div>
        <div className="mx-auto mt-6 max-w-6xl px-6 text-center font-mono text-[10px] leading-4 text-[#3a3648]">
          3D headphones by{" "}
          <a href="https://sketchfab.com/marukanha31" target="_blank" rel="noopener" className="hover:text-[#5E5A72]">marukanha31</a>,{" "}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener" className="hover:text-[#5E5A72]">CC BY 4.0</a>
        </div>
      </footer>
      </div>
    </div>
  );
}
