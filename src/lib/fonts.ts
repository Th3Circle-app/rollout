// One font library used everywhere fonts appear (cover typography, lyric video,
// …). Files live in public/fonts (browser) AND backend/fonts (engine), keyed by
// the same `id`, so what you pick on screen is what renders in the export.

export type FontDef = {
  id: string;        // slug: filename stem + engine key + registered CSS family (file fonts)
  label: string;     // display name
  family: string;    // CSS font-family to apply (== id for bundled, a system stack otherwise)
  file: string | null;
  category: string;
};

const FILE = (id: string, label: string, category: string): FontDef =>
  ({ id, label, family: id, file: `${id}.ttf`, category });
const SYS = (id: string, label: string, family: string, category: string): FontDef =>
  ({ id, label, family, file: null, category });

export const FONT_LIBRARY: FontDef[] = [
  SYS("arialblack", "Arial Black", "'Arial Black', sans-serif", "Sans"),
  SYS("helvetica", "Helvetica", "'Helvetica Neue', Helvetica, Arial, sans-serif", "Sans"),
  SYS("georgia", "Georgia", "Georgia, serif", "Serif"),
  SYS("times", "Times New Roman", "'Times New Roman', serif", "Serif"),
  SYS("courier", "Courier", "'Courier New', monospace", "Mono"),
  FILE("anton", "Anton", "Display"),
  FILE("archivoblack", "Archivo Black", "Display"),
  FILE("alfaslab", "Alfa Slab One", "Slab"),
  FILE("titanone", "Titan One", "Display"),
  FILE("passion", "Passion One", "Display"),
  FILE("russo", "Russo One", "Display"),
  FILE("righteous", "Righteous", "Display"),
  FILE("bungee", "Bungee", "Display"),
  FILE("shrikhand", "Shrikhand", "Display"),
  FILE("monoton", "Monoton", "Retro"),
  FILE("bebas", "Bebas Neue", "Condensed"),
  FILE("staatliches", "Staatliches", "Condensed"),
  FILE("fjalla", "Fjalla One", "Condensed"),
  FILE("kanit", "Kanit", "Sans"),
  FILE("poppins", "Poppins", "Sans"),
  FILE("abril", "Abril Fatface", "Serif"),
  FILE("dmserif", "DM Serif", "Serif"),
  FILE("pacifico", "Pacifico", "Script"),
  FILE("lobster", "Lobster", "Script"),
  FILE("sacramento", "Sacramento", "Script"),
  FILE("marker", "Permanent Marker", "Marker"),
  FILE("bangers", "Bangers", "Comic"),
  FILE("typewriter", "Special Elite", "Typewriter"),
];

// CSS font-family for an id (falls back to the raw value, so a user-uploaded
// custom font family still resolves).
export function fontFamily(id: string): string {
  return FONT_LIBRARY.find((f) => f.id === id)?.family || id;
}

// Register every bundled font once so the canvas + CSS can render them. Idempotent.
let loading: Promise<void> | null = null;
export function ensureFontsLoaded(): Promise<void> {
  if (loading) return loading;
  if (typeof document === "undefined" || !("fonts" in document)) return Promise.resolve();
  const base = import.meta.env.BASE_URL || "/";
  loading = Promise.all(
    FONT_LIBRARY.filter((f) => f.file).map(async (f) => {
      try {
        const face = new FontFace(f.family, `url("${base}fonts/${f.file}")`);
        await face.load();
        document.fonts.add(face);
      } catch { /* a font that fails to load is simply skipped */ }
    })
  ).then(() => {});
  return loading;
}
