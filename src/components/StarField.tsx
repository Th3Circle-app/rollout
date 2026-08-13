import { useEffect, useRef } from "react";

// A quiet night sky: twinkling stars with the occasional shooting star streaking
// across. Plain Canvas 2D (cheap), sits behind the smoke + headphones. Freezes to
// a static field for reduced-motion. Pointer-events off.
export default function StarField({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let W = 0, H = 0;
    type Star = { x: number; y: number; r: number; b: number; ph: number; tw: number };
    let stars: Star[] = [];
    const seed = () => {
      const count = Math.round((W * H) / 8500);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.2 + 0.3,
        b: Math.random() * 0.5 + 0.3,
        ph: Math.random() * Math.PI * 2,
        tw: Math.random() * 1.5 + 0.4,
      }));
    };
    const resize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };
    resize();
    window.addEventListener("resize", resize);

    type Shoot = { x: number; y: number; vx: number; vy: number; life: number; max: number };
    let shoots: Shoot[] = [];
    let nextShoot = 1.6;
    const spawn = () => {
      const ang = Math.PI * 0.15 + Math.random() * 0.14; // down-right
      const sp = 720 + Math.random() * 460;
      shoots.push({
        x: Math.random() * W * 0.8,
        y: Math.random() * H * 0.35,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 0,
        max: 0.85 + Math.random() * 0.5,
      });
    };

    const drawStars = (t: number) => {
      for (const s of stars) {
        const a = reduce ? s.b : s.b * (0.55 + 0.45 * Math.sin(t * s.tw + s.ph));
        ctx.beginPath();
        ctx.fillStyle = `rgba(226,224,255,${a})`;
        ctx.arc(s.x, s.y, s.r, 0, 6.283);
        ctx.fill();
      }
    };

    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = now / 1000;
      ctx.clearRect(0, 0, W, H);
      drawStars(t);
      nextShoot -= dt;
      if (nextShoot <= 0) { spawn(); nextShoot = 2.6 + Math.random() * 4.5; }
      shoots = shoots.filter((s) => s.life < s.max);
      for (const sh of shoots) {
        sh.life += dt; sh.x += sh.vx * dt; sh.y += sh.vy * dt;
        const k = 1 - sh.life / sh.max;
        const mag = Math.hypot(sh.vx, sh.vy);
        const tailLen = 130;
        const tx = sh.x - (sh.vx / mag) * tailLen;
        const ty = sh.y - (sh.vy / mag) * tailLen;
        const grad = ctx.createLinearGradient(sh.x, sh.y, tx, ty);
        grad.addColorStop(0, `rgba(255,255,255,${0.9 * k})`);
        grad.addColorStop(1, "rgba(180,148,255,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${k})`;
        ctx.arc(sh.x, sh.y, 1.6, 0, 6.283);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };

    if (reduce) {
      ctx.clearRect(0, 0, W, H);
      drawStars(0);
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 1, pointerEvents: "none", ...style }}
    />
  );
}
