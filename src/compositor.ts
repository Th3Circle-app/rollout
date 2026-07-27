// Rollout layered cover compositor — Illustrator-style layer stack rendered
// onto a single canvas. The preview and the 3000px export run the exact same
// code, so what you see is what ships.

export type BlendMode = "multiply" | "overlay" | "screen" | "soft-light" | "color";

export type Layers = {
  base: { visible: boolean; opacity: number };
  subject: {
    visible: boolean;
    opacity: number;
    scale: number; // 0.3 - 1.2 of canvas
    x: number; // 0-1 center position
    y: number;
  };
  wash: {
    visible: boolean;
    opacity: number;
    color1: string;
    color2: string;
    blend: BlendMode;
    angle: number; // degrees
  };
  texture: {
    visible: boolean;
    opacity: number;
    kind: "grain" | "halftone" | "scanlines";
    scale: number; // 1-3
  };
  light: {
    visible: boolean;
    opacity: number;
    kind: "vignette" | "leak";
    color: string;
  };
  type: {
    visible: boolean;
    opacity: number;
    font: string;
    layout: "bottom" | "center" | "top";
    color: string;
  };
};

export const DEFAULT_LAYERS: Layers = {
  base: { visible: true, opacity: 1 },
  subject: { visible: true, opacity: 1, scale: 0.72, x: 0.5, y: 0.52 },
  wash: { visible: true, opacity: 0.35, color1: "#8B5CF6", color2: "#F0A45B", blend: "overlay", angle: 135 },
  texture: { visible: true, opacity: 0.22, kind: "grain", scale: 1 },
  light: { visible: true, opacity: 0.55, kind: "vignette", color: "#000000" },
  type: { visible: true, opacity: 1, font: "Arial Black", layout: "bottom", color: "#FFFFFF" },
};

// --- procedural texture tiles (cached per kind+scale) ---------------------
const tileCache = new Map<string, HTMLCanvasElement>();

function textureTile(kind: Layers["texture"]["kind"], scale: number): HTMLCanvasElement {
  const key = `${kind}:${scale}`;
  const hit = tileCache.get(key);
  if (hit) return hit;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  if (kind === "grain") {
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(Math.random() * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  } else if (kind === "halftone") {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000";
    const step = 8 * scale;
    for (let y = 0; y < size; y += step) {
      for (let x = 0; x < size; x += step) {
        const r = (Math.random() * step) / 3 + step / 8;
        ctx.beginPath();
        ctx.arc(x + step / 2, y + step / 2, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000";
    const step = 4 * scale;
    for (let y = 0; y < size; y += step) ctx.fillRect(0, y, size, Math.max(1, step / 3));
  }
  tileCache.set(key, c);
  return c;
}

// --- main render ----------------------------------------------------------
export function renderStack(
  canvas: HTMLCanvasElement,
  size: number,
  layers: Layers,
  baseImg: HTMLImageElement | null,
  title: string,
  artist: string,
  subjectImg: HTMLImageElement | null = null
) {
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  // L1 base art
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  if (layers.base.visible && baseImg && baseImg.complete && baseImg.naturalWidth > 0) {
    ctx.globalAlpha = layers.base.opacity;
    const r = Math.max(size / baseImg.naturalWidth, size / baseImg.naturalHeight);
    const w = baseImg.naturalWidth * r;
    const h = baseImg.naturalHeight * r;
    ctx.drawImage(baseImg, (size - w) / 2, (size - h) / 2, w, h);
  } else {
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, "#15151C");
    g.addColorStop(1, "#0B0B0F");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  // L2 subject cut-out (rembg) — the composite's "clipping" layer
  if (
    layers.subject.visible &&
    subjectImg &&
    subjectImg.complete &&
    subjectImg.naturalWidth > 0
  ) {
    ctx.globalAlpha = layers.subject.opacity;
    ctx.globalCompositeOperation = "source-over";
    const target = size * layers.subject.scale;
    const r = Math.min(target / subjectImg.naturalWidth, target / subjectImg.naturalHeight);
    const w = subjectImg.naturalWidth * r;
    const h = subjectImg.naturalHeight * r;
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = size * 0.02;
    ctx.shadowOffsetY = size * 0.008;
    ctx.drawImage(
      subjectImg,
      layers.subject.x * size - w / 2,
      layers.subject.y * size - h / 2,
      w,
      h
    );
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  // L3 color wash
  if (layers.wash.visible) {
    const a = (layers.wash.angle * Math.PI) / 180;
    const cx = size / 2;
    const r = size / 2;
    const g = ctx.createLinearGradient(
      cx - Math.cos(a) * r, cx - Math.sin(a) * r,
      cx + Math.cos(a) * r, cx + Math.sin(a) * r
    );
    g.addColorStop(0, layers.wash.color1);
    g.addColorStop(1, layers.wash.color2);
    ctx.globalAlpha = layers.wash.opacity;
    ctx.globalCompositeOperation = layers.wash.blend as GlobalCompositeOperation;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  // L3 texture
  if (layers.texture.visible) {
    const tile = textureTile(layers.texture.kind, layers.texture.scale);
    ctx.globalAlpha = layers.texture.opacity;
    ctx.globalCompositeOperation = "overlay";
    const pat = ctx.createPattern(tile, "repeat")!;
    // scale pattern with output size so grain reads the same at 3000px
    const s = size / 1024;
    ctx.save();
    ctx.scale(s, s);
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, size / s, size / s);
    ctx.restore();
  }

  // L4 light
  if (layers.light.visible) {
    ctx.globalAlpha = layers.light.opacity;
    if (layers.light.kind === "vignette") {
      ctx.globalCompositeOperation = "multiply";
      const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.35, size / 2, size / 2, size * 0.75);
      g.addColorStop(0, "#FFFFFF");
      g.addColorStop(1, layers.light.color);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    } else {
      ctx.globalCompositeOperation = "screen";
      const g = ctx.createRadialGradient(size * 0.85, size * 0.1, 0, size * 0.85, size * 0.1, size * 0.9);
      g.addColorStop(0, layers.light.color);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
  }

  // L5 typography
  if (layers.type.visible && (title || artist)) {
    ctx.globalAlpha = layers.type.opacity;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = layers.type.color;
    ctx.textAlign = layers.type.layout === "center" ? "center" : "left";
    const pad = size * 0.07;
    const x = layers.type.layout === "center" ? size / 2 : pad;
    const titleSize = size * 0.075;
    const artistSize = size * 0.028;
    let yTitle: number, yArtist: number;
    if (layers.type.layout === "bottom") {
      yArtist = size - pad;
      yTitle = yArtist - artistSize * 2.2;
    } else if (layers.type.layout === "top") {
      yTitle = pad + titleSize;
      yArtist = yTitle + artistSize * 2.6;
    } else {
      yTitle = size / 2;
      yArtist = yTitle + artistSize * 2.8;
    }
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = size * 0.012;
    ctx.font = `900 ${titleSize}px "${layers.type.font}", sans-serif`;
    ctx.fillText(title.toUpperCase(), x, yTitle);
    ctx.font = `500 ${artistSize}px "Helvetica Neue", sans-serif`;
    const prevTracking = ctx.letterSpacing;
    try { ctx.letterSpacing = `${size * 0.008}px`; } catch { /* older browsers */ }
    ctx.fillText(artist.toUpperCase(), x, yArtist);
    try { ctx.letterSpacing = prevTracking; } catch { /* ignore */ }
    ctx.shadowBlur = 0;
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
