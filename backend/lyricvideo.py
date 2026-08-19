"""Rollout kinetic lyric video generator.

Real pipeline, $0:
  1. librosa RMS finds the highest-energy 15s window (the hook).
  2. beat_track inside that window gives the kinetic timing grid.
  3. Lyric chunks (2-4 words) advance on beats, pop-scaled on entry.
  4. Background = the AI cover, blurred + darkened, slow Ken Burns zoom.
  5. ffmpeg muxes rendered frames with the actual audio clip -> vertical MP4.
"""
import io
import math
import os
import subprocess
import tempfile
import urllib.request
import warnings

import numpy as np
import librosa
from PIL import Image, ImageDraw, ImageFilter, ImageFont

warnings.filterwarnings("ignore")

W, H = 720, 1280
FPS = 24
CLIP_SEC = 15.0

# Heavy display font, searched across OSes so the render looks the same on a
# Linux host as on the dev Mac. On a Docker/Linux box install one of these with
# `apt-get install -y fonts-liberation fonts-dejavu-core`, or point ROLLOUT_FONT
# at a bundled .ttf for fully deterministic output.
FONT_CANDIDATES = [
    os.environ.get("ROLLOUT_FONT", ""),
    # macOS
    "/System/Library/Fonts/Supplemental/Arial Black.ttf",
    "/System/Library/Fonts/Supplemental/Impact.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/SFNS.ttf",
    # Linux (Debian/Ubuntu — fonts-liberation / fonts-dejavu-core / fonts-noto)
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
    # Windows
    "C:\\Windows\\Fonts\\ariblk.ttf",
    "C:\\Windows\\Fonts\\impact.ttf",
    "C:\\Windows\\Fonts\\arialbd.ttf",
]


# Bundled font library (backend/fonts/<id>.ttf) — the SAME ids the frontend
# offers, so the picked font is exactly what renders. System ids fall back to
# the platform bold sans.
_FONTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
_FILE_FONTS = {
    "anton", "archivoblack", "alfaslab", "titanone", "passion", "russo",
    "righteous", "bungee", "shrikhand", "monoton", "bebas", "staatliches",
    "fjalla", "kanit", "poppins", "abril", "dmserif", "pacifico", "lobster",
    "sacramento", "marker", "bangers", "typewriter",
}
# script/handwritten faces read better in mixed case than ALL CAPS
_SCRIPT_FONTS = {"pacifico", "lobster", "sacramento"}


def _font(size, style="bold"):
    cands = []
    if style in _FILE_FONTS:
        cands.append(os.path.join(_FONTS_DIR, f"{style}.ttf"))
    cands += list(FONT_CANDIDATES)  # system bold fallback for any other/system id
    for p in cands:
        if p and os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    try:
        return ImageFont.load_default(size)
    except TypeError:
        return ImageFont.load_default()


def find_hook(y, sr, clip_sec=CLIP_SEC):
    """Return (start_sec) of the highest-energy window of clip_sec length."""
    hop = 1024
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    frames_per_clip = int(clip_sec * sr / hop)
    if len(rms) <= frames_per_clip:
        return 0.0
    # rolling sum of energy
    csum = np.cumsum(rms)
    windows = csum[frames_per_clip:] - csum[:-frames_per_clip]
    best = int(np.argmax(windows))
    return best * hop / sr


def chunk_lyrics(lyrics, n_slots):
    """Split lyrics into ~n_slots chunks of 2-4 words, preserving line breaks."""
    words = []
    for line in lyrics.strip().splitlines():
        line = line.strip()
        if line:
            words.extend(line.split())
    if not words:
        return ["♪"] * max(n_slots, 1)
    per = max(2, min(4, math.ceil(len(words) / max(n_slots, 1))))
    chunks = [" ".join(words[i:i + per]) for i in range(0, len(words), per)]
    return chunks


def prepare_background(cover_path_or_url):
    """Blurred, darkened square cover scaled for Ken Burns crops."""
    if cover_path_or_url and cover_path_or_url.startswith("http"):
        from netguard import fetch_url  # IP-pinned, SSRF-safe, size-capped
        raw = fetch_url(cover_path_or_url, timeout=60)
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    elif cover_path_or_url and os.path.exists(cover_path_or_url):
        img = Image.open(cover_path_or_url).convert("RGB")
    else:
        # fallback aesthetic gradient
        img = Image.new("RGB", (1024, 1024))
        px = img.load()
        for yy in range(1024):
            for xx in range(0, 1024, 8):
                v = int(18 + 30 * (yy / 1024))
                for k in range(8):
                    px[min(xx + k, 1023), yy] = (v, v - 4, v + 10)
    # cover-fill to a canvas larger than the frame so we can zoom
    scale = 1.25
    bw, bh = int(W * scale), int(H * scale)
    ratio = max(bw / img.width, bh / img.height)
    img = img.resize((int(img.width * ratio) + 1, int(img.height * ratio) + 1), Image.LANCZOS)
    left = (img.width - bw) // 2
    top = (img.height - bh) // 2
    img = img.crop((left, top, left + bw, top + bh))
    img = img.filter(ImageFilter.GaussianBlur(14))
    # darken
    img = Image.blend(img, Image.new("RGB", img.size, (8, 8, 12)), 0.55)
    return img


def render_text_card(text, artist_tag, font_style="bold", position="center", rng=None):
    """Transparent card with the chunk text — chosen font, chosen placement, and
    ALWAYS kept safely inside the 720x1280 frame (wraps + shrinks to fit)."""
    card = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(card)
    # script faces read better mixed-case; the bold/display faces want all-caps
    disp = text if font_style in _SCRIPT_FONTS else text.upper()
    size = 92
    font = _font(size, font_style)
    max_w = W - 130
    words = disp.split()
    while True:
        lines, cur = [], ""
        for w_ in words:
            trial = (cur + " " + w_).strip()
            if d.textlength(trial, font=font) <= max_w:
                cur = trial
            else:
                if cur:
                    lines.append(cur)
                cur = w_
        if cur:
            lines.append(cur)
        # shrink until it fits both the width (above) and a max of 4 lines
        if len(lines) <= 4 or size <= 40:
            break
        size -= 8
        font = _font(size, font_style)
    line_h = int(size * 1.16)
    total_h = line_h * len(lines)

    # vertical placement, clamped so text NEVER leaves the phone frame
    top_pad, bot_pad = 210, 250
    lo = top_pad
    hi = max(top_pad, H - total_h - bot_pad)
    if position == "top":
        y0 = lo
    elif position == "bottom":
        y0 = hi
    elif position == "random" and rng is not None:
        y0 = rng.randint(lo, hi) if hi > lo else lo
    else:
        y0 = (H - total_h) // 2
    y0 = max(60, min(y0, H - total_h - 60))  # hard safety clamp

    for i, ln in enumerate(lines):
        tw = d.textlength(ln, font=font)
        x = (W - tw) // 2
        y = y0 + i * line_h
        d.text((x + 3, y + 4), ln, font=font, fill=(0, 0, 0, 200))
        d.text((x, y), ln, font=font, fill=(255, 255, 255, 255))
    _ = artist_tag  # title/artist intentionally omitted — clean lyric video
    return card


VIDEO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "video")


def _save_cover(cover, dest):
    """Save the cover (URL or path) as a jpg for the Remotion comp."""
    if cover and cover.startswith("http"):
        from netguard import fetch_url  # IP-pinned, SSRF-safe, size-capped
        raw = fetch_url(cover, timeout=60)
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    elif cover and os.path.exists(cover):
        img = Image.open(cover).convert("RGB")
    else:
        img = prepare_background("")  # aesthetic fallback
    img.save(dest, quality=92)


def make_lyric_video_premium(audio_path, lyrics, cover, title, artist, out_path,
                             words_override=None, bg="cover", moods=None, style="", start_override=None):
    """Premium path: demucs + stable-ts word alignment + Remotion render.

    words_override: word list from the lyric editor — exact user-approved
    words + timing; skips detection entirely.
    Raises on any failure so the caller can fall back to the beat-grid engine.
    """
    import json as _json
    from align import align_hook

    y, sr = librosa.load(audio_path, mono=True, sr=44100)
    start = float(start_override) if start_override is not None else find_hook(y, sr)
    clip = y[int(start * sr): int((start + CLIP_SEC) * sr)]

    public = os.path.join(VIDEO_DIR, "public")
    os.makedirs(public, exist_ok=True)
    clip_wav = os.path.join(public, "clip.wav")
    import soundfile as sf
    sf.write(clip_wav, clip, sr)

    if words_override:
        words = [
            {"word": str(w["word"]), "start": float(w["start"]), "end": float(w["end"])}
            for w in words_override
            if str(w.get("word", "")).strip() and float(w.get("end", 0)) > float(w.get("start", 0))
        ]
    else:
        words = align_hook(clip_wav, lyrics)
    if len(words) < 3:
        raise RuntimeError("alignment produced too few words")
    # clamp into the clip window
    words = [
        {"word": w["word"], "start": max(0.0, min(w["start"], CLIP_SEC)),
         "end": max(0.0, min(w["end"], CLIP_SEC))}
        for w in words if w["start"] < CLIP_SEC
    ]

    _save_cover(cover, os.path.join(public, "cover.jpg"))

    # b-roll background: vibe-matched footage cut on the beat
    clips_meta = []
    if bg == "broll":
        try:
            from broll import fetch_clips
            import shutil as _sh
            import subprocess as _sp
            files = fetch_clips(style or "film", moods or [], n=4)
            if files:
                broll_dir = os.path.join(public, "broll")
                os.makedirs(broll_dir, exist_ok=True)
                tempo_b, beat_frames_b = librosa.beat.beat_track(y=clip, sr=sr)
                bts = list(librosa.frames_to_time(beat_frames_b, sr=sr))
                bounds = [0.0] + [t for i, t in enumerate(bts) if i % 2 == 1 and t < CLIP_SEC] + [CLIP_SEC]
                segs = [(bounds[i], bounds[i + 1]) for i in range(len(bounds) - 1)
                        if bounds[i + 1] - bounds[i] > 0.25]
                durs = []
                for f in files:
                    dest = os.path.join(broll_dir, os.path.basename(f))
                    if not os.path.exists(dest):
                        _sh.copy(f, dest)
                    try:
                        pr = _sp.run(["ffprobe", "-v", "error", "-show_entries",
                                      "format=duration", "-of", "csv=p=0", dest],
                                     capture_output=True, text=True, timeout=30)
                        durs.append(max(1.0, float(pr.stdout.strip())))
                    except Exception:
                        durs.append(8.0)
                for i, (t0, t1) in enumerate(segs):
                    fi = i % len(files)
                    seg_len = t1 - t0
                    src_start = (i * 2.3) % max(0.2, durs[fi] - seg_len - 0.2)
                    clips_meta.append({
                        "file": "broll/" + os.path.basename(files[fi]),
                        "start": round(t0, 3), "dur": round(seg_len, 3),
                        "srcStart": round(src_start, 3),
                    })
        except Exception:
            clips_meta = []  # fall back to cover background

    props = {
        "title": title.upper() or "UNTITLED",
        "artist": artist.upper(),
        "durationSec": CLIP_SEC,
        "audioFile": "clip.wav",
        "coverFile": "cover.jpg",
        "words": words,
        "clips": clips_meta,
    }
    props_path = os.path.join(public, "props.json")
    with open(props_path, "w") as f:
        _json.dump(props, f)

    r = subprocess.run(
        ["npx", "remotion", "render", "src/index.ts", "LyricVideo", out_path,
         f"--props={props_path}"],
        cwd=VIDEO_DIR, capture_output=True, text=True, timeout=600,
    )
    if r.returncode != 0:
        raise RuntimeError("remotion render failed: " + (r.stderr or r.stdout)[-400:])

    tempo = librosa.beat.beat_track(y=clip, sr=sr)[0]
    return {
        "hook_start": round(start, 1),
        "bpm": round(float(np.atleast_1d(tempo)[0])),
        "chunks": len(words),
        "engine": "premium",
    }


def _word_slots(words_override, offset=0.0, per_line=4):
    """Build (chunks, slot_times) from the DETECTED words so text lands on the
    actual sung timing instead of a beat grid. `offset` nudges every line earlier
    (negative) or later (positive) in seconds — the artist's manual sync control.
    Returns (None, None) when there are no usable words (pasted-lyrics-only path)."""
    ws = [w for w in (words_override or [])
          if isinstance(w, dict) and str(w.get("word", "")).strip()]
    if len(ws) < 2:
        return None, None
    chunks, slots = [], []
    for i in range(0, len(ws), per_line):
        grp = ws[i:i + per_line]
        chunks.append(" ".join(str(w["word"]).strip() for w in grp))
        slots.append(max(0.0, float(grp[0].get("start", 0) or 0) + offset))
    return chunks, slots


def make_lyric_video(audio_path, lyrics, cover, title, artist, out_path, font="bold", position="center", start_override=None, words_override=None, offset=0.0):
    y, sr = librosa.load(audio_path, mono=True, sr=44100)
    start = float(start_override) if start_override is not None else find_hook(y, sr)
    clip = y[int(start * sr): int((start + CLIP_SEC) * sr)]

    # Prefer the detected word timing (exact) over a beat grid so text lands when
    # it's actually sung; fall back to the beat grid for pasted-lyrics-only.
    chunks, slots = _word_slots(words_override, offset)
    if chunks is None:
        tempo, beat_frames = librosa.beat.beat_track(y=clip, sr=sr)
        beats = list(librosa.frames_to_time(beat_frames, sr=sr))
        if len(beats) < 4:  # fallback: even grid at ~2 chunks/sec
            beats = list(np.arange(0, CLIP_SEC, 0.75))
        slots = beats[::2]  # advance text every 2 beats so words are readable
        if not slots or slots[0] > 0.4:
            slots = [0.0] + slots
        chunks = chunk_lyrics(lyrics, len(slots))
    artist_tag = f"{title.upper()} — {artist.upper()}" if artist else title.upper()
    import random as _rnd
    rng = _rnd.Random()  # fresh so "random" placement varies each render
    cards = [render_text_card(c, artist_tag, font_style=font, position=position, rng=rng) for c in chunks]

    bg = prepare_background(cover)
    bw, bh = bg.size
    n_frames = int(CLIP_SEC * FPS)

    tmpdir = tempfile.mkdtemp(prefix="rollout_lv_")
    slot_times = slots + [CLIP_SEC + 1]

    for f in range(n_frames):
        t = f / FPS
        # ken burns: slow zoom in
        z = 1.0 + 0.10 * (t / CLIP_SEC)
        cw, ch = int(W / z * (bw / W)), int(H / z * (bh / H))
        cw, ch = min(cw, bw), min(ch, bh)
        left = (bw - cw) // 2
        top = (bh - ch) // 2
        frame = bg.crop((left, top, left + cw, top + ch)).resize((W, H), Image.BILINEAR)

        # which chunk is active
        idx = 0
        for i in range(len(slots)):
            if t >= slots[i]:
                idx = i
        idx = min(idx, len(cards) - 1)
        card = cards[idx]
        # pop-in: scale 1.14 -> 1.0 over 0.18s after slot start
        dt = t - slots[min(idx, len(slots) - 1)]
        pop = 1.0 + max(0.0, 0.14 * (1 - dt / 0.18)) if dt < 0.18 else 1.0
        if pop > 1.001:
            pw, ph = int(W * pop), int(H * pop)
            scaled = card.resize((pw, ph), Image.BILINEAR)
            ox, oy = (pw - W) // 2, (ph - H) // 2
            card = scaled.crop((ox, oy, ox + W, oy + H))
        frame = frame.convert("RGBA")
        frame.alpha_composite(card)
        frame.convert("RGB").save(os.path.join(tmpdir, f"f{f:05d}.jpg"), quality=88)

    # write the audio clip
    clip_wav = os.path.join(tmpdir, "clip.wav")
    import soundfile as sf
    sf.write(clip_wav, clip, sr)

    try:
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-framerate", str(FPS), "-i", os.path.join(tmpdir, "f%05d.jpg"),
                "-i", clip_wav,
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "21",
                "-c:a", "aac", "-b:a", "192k", "-shortest",
                out_path,
            ],
            check=True, capture_output=True, timeout=600,  # never hang the worker
        )
        return {"hook_start": round(start, 1), "bpm": round(float(np.atleast_1d(tempo)[0])), "chunks": len(chunks)}
    finally:
        import shutil as _sh
        _sh.rmtree(tmpdir, ignore_errors=True)  # never leak the frame dir


def _broll_bg_video(style, moods, tmpdir):
    """Build a 15s vertical (720x1280) background video from vibe-matched Pexels
    clips. Returns the path, or None if b-roll is unavailable / nothing fetched."""
    from broll import fetch_clips, available
    if not available():
        return None
    paths = fetch_clips(style or "film", moods or [], n=4)
    if not paths:
        return None
    norm = []
    for i, p in enumerate(paths):
        npth = os.path.join(tmpdir, f"bn{i}.mp4")
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-i", p, "-t", "4",
                 "-vf", "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=24,setsar=1",
                 "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p", npth],
                check=True, capture_output=True, timeout=120)
            norm.append(npth)
        except Exception:
            continue
    if not norm:
        return None
    listp = os.path.join(tmpdir, "bconcat.txt")
    reps = max(1, (16 // (len(norm) * 4)) + 1)
    with open(listp, "w") as fh:
        for _ in range(reps):
            for n in norm:
                fh.write(f"file '{n}'\n")
    bgv = os.path.join(tmpdir, "bg.mp4")
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", listp, "-t", "15",
         "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p", bgv],
        check=True, capture_output=True, timeout=180)
    return bgv


def make_lyric_video_broll(audio_path, lyrics, title, artist, out_path, moods=None, style="", font="bold", position="center", start_override=None, words_override=None, offset=0.0):
    """Same kinetic type as the classic renderer, but over MOVING vibe-matched
    stock footage instead of the static cover. ffmpeg overlays the transparent
    text frames (+ a readability scrim) onto the b-roll video."""
    y, sr = librosa.load(audio_path, mono=True, sr=44100)
    start = float(start_override) if start_override is not None else find_hook(y, sr)
    clip = y[int(start * sr): int((start + CLIP_SEC) * sr)]
    # Detected word timing (exact) with a beat-grid fallback — matches the cover
    # renderer so text lands when it's actually sung.
    chunks, slots = _word_slots(words_override, offset)
    if chunks is None:
        tempo, beat_frames = librosa.beat.beat_track(y=clip, sr=sr)
        beats = list(librosa.frames_to_time(beat_frames, sr=sr))
        if len(beats) < 4:
            beats = list(np.arange(0, CLIP_SEC, 0.75))
        slots = beats[::2]
        if not slots or slots[0] > 0.4:
            slots = [0.0] + slots
        chunks = chunk_lyrics(lyrics, len(slots))
    artist_tag = f"{title.upper()} — {artist.upper()}" if artist else title.upper()
    import random as _rnd
    rng = _rnd.Random()  # fresh so "random" placement varies each render
    cards = [render_text_card(c, artist_tag, font_style=font, position=position, rng=rng) for c in chunks]

    tmpdir = tempfile.mkdtemp(prefix="rollout_lvb_")
    try:
        bgv = _broll_bg_video(style, moods, tmpdir)
        if not bgv:
            raise RuntimeError("no b-roll clips available")

        # readability scrim: transparent up top, darkening toward the bottom third
        scrim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sd = ImageDraw.Draw(scrim)
        for yy in range(H):
            a = int(170 * max(0.0, (yy - H * 0.42) / (H * 0.58)))
            sd.line([(0, yy), (W, yy)], fill=(0, 0, 0, min(170, a)))

        n_frames = int(CLIP_SEC * FPS)
        for f in range(n_frames):
            t = f / FPS
            idx = 0
            for i in range(len(slots)):
                if t >= slots[i]:
                    idx = i
            idx = min(idx, len(cards) - 1)
            card = cards[idx]
            dt = t - slots[min(idx, len(slots) - 1)]
            pop = 1.0 + max(0.0, 0.14 * (1 - dt / 0.18)) if dt < 0.18 else 1.0
            if pop > 1.001:
                pw, ph = int(W * pop), int(H * pop)
                scaled = card.resize((pw, ph), Image.BILINEAR)
                ox, oy = (pw - W) // 2, (ph - H) // 2
                card = scaled.crop((ox, oy, ox + W, oy + H))
            frame = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            frame.alpha_composite(scrim)
            frame.alpha_composite(card)
            frame.save(os.path.join(tmpdir, f"o{f:05d}.png"))

        clip_wav = os.path.join(tmpdir, "clip.wav")
        import soundfile as sf
        sf.write(clip_wav, clip, sr)

        subprocess.run(
            ["ffmpeg", "-y",
             "-i", bgv,
             "-framerate", str(FPS), "-i", os.path.join(tmpdir, "o%05d.png"),
             "-i", clip_wav,
             "-filter_complex", "[0:v][1:v]overlay=0:0:shortest=1[v]",
             "-map", "[v]", "-map", "2:a",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "21",
             "-c:a", "aac", "-b:a", "192k", "-shortest", out_path],
            check=True, capture_output=True, timeout=600)
        return {"hook_start": round(start, 1), "bpm": round(float(np.atleast_1d(tempo)[0])),
                "chunks": len(chunks), "engine": "broll"}
    finally:
        import shutil as _sh
        _sh.rmtree(tmpdir, ignore_errors=True)


def make_promo_clip(audio_path, title, artist, caption, out_path,
                    cover="", moods=None, style="", font="bold", bg="broll", start_override=None):
    """A shareable vertical promo teaser (TikTok/Reels/Shorts): the song's hook
    over vibe-matched b-roll (or a slow push on the cover), with a punchy
    headline sequence — title, artist, then a call-to-action. No lyrics needed;
    reuses find_hook, the b-roll builder, and render_text_card."""
    y, sr = librosa.load(audio_path, mono=True, sr=44100)
    start = float(start_override) if start_override is not None else find_hook(y, sr)
    clip = y[int(start * sr): int((start + CLIP_SEC) * sr)]

    # headline sequence — a promo reads slower than lyrics, so hold each line
    lines = []
    if title.strip():
        lines.append(title.strip())
    if artist.strip():
        lines.append(artist.strip())
    lines.append((caption or "").strip() or "OUT NOW")
    n = max(1, len(lines))
    slots = [i * (CLIP_SEC / n) for i in range(n)]
    cards = [render_text_card(ln, "", font_style=font, position="center", rng=None) for ln in lines]

    tmpdir = tempfile.mkdtemp(prefix="rollout_promo_")
    try:
        bgv = _broll_bg_video(style, moods, tmpdir) if bg != "cover" else None
        if not bgv:
            # cover fallback: a static, blurred, darkened push on the cover art
            bgimg = prepare_background(cover)
            bgp = os.path.join(tmpdir, "cover_bg.jpg")
            bgimg.convert("RGB").save(bgp, quality=90)
            bgv = os.path.join(tmpdir, "bg.mp4")
            subprocess.run(
                ["ffmpeg", "-y", "-loop", "1", "-i", bgp, "-t", str(CLIP_SEC),
                 "-vf", f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS}",
                 "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p", bgv],
                check=True, capture_output=True, timeout=180)

        # readability scrim (same as the b-roll lyric renderer)
        scrim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sd = ImageDraw.Draw(scrim)
        for yy in range(H):
            a = int(170 * max(0.0, (yy - H * 0.42) / (H * 0.58)))
            sd.line([(0, yy), (W, yy)], fill=(0, 0, 0, min(170, a)))

        n_frames = int(CLIP_SEC * FPS)
        for f in range(n_frames):
            t = f / FPS
            idx = 0
            for i in range(len(slots)):
                if t >= slots[i]:
                    idx = i
            idx = min(idx, len(cards) - 1)
            card = cards[idx]
            dt = t - slots[idx]
            pop = 1.0 + max(0.0, 0.16 * (1 - dt / 0.24)) if dt < 0.24 else 1.0
            if pop > 1.001:
                pw, ph = int(W * pop), int(H * pop)
                scaled = card.resize((pw, ph), Image.BILINEAR)
                ox, oy = (pw - W) // 2, (ph - H) // 2
                card = scaled.crop((ox, oy, ox + W, oy + H))
            frame = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            frame.alpha_composite(scrim)
            frame.alpha_composite(card)
            frame.save(os.path.join(tmpdir, f"o{f:05d}.png"))

        clip_wav = os.path.join(tmpdir, "clip.wav")
        import soundfile as sf
        sf.write(clip_wav, clip, sr)

        subprocess.run(
            ["ffmpeg", "-y",
             "-i", bgv,
             "-framerate", str(FPS), "-i", os.path.join(tmpdir, "o%05d.png"),
             "-i", clip_wav,
             "-filter_complex", "[0:v][1:v]overlay=0:0:shortest=1[v]",
             "-map", "[v]", "-map", "2:a",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "21",
             "-c:a", "aac", "-b:a", "192k", "-shortest", out_path],
            check=True, capture_output=True, timeout=600)
        return {"hook_start": round(start, 1), "lines": len(lines), "engine": "promo"}
    finally:
        import shutil as _sh
        _sh.rmtree(tmpdir, ignore_errors=True)
