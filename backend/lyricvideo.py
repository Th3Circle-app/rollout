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

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Black.ttf",
    "/System/Library/Fonts/Supplemental/Impact.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/SFNS.ttf",
]


def _font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
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
        req = urllib.request.Request(cover_path_or_url, headers={"User-Agent": "Mozilla/5.0"})
        raw = urllib.request.urlopen(req, timeout=180).read()
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


def render_text_card(text, artist_tag):
    """Transparent card with the chunk text, wrapped, huge and centered."""
    card = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(card)
    size = 92
    font = _font(size)
    # wrap to fit
    max_w = W - 120
    words = text.upper().split()
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
        if len(lines) <= 3 or size <= 44:
            break
        size -= 8
        font = _font(size)
    line_h = size + 14
    total_h = line_h * len(lines)
    y0 = (H - total_h) // 2
    for i, ln in enumerate(lines):
        tw = d.textlength(ln, font=font)
        x = (W - tw) // 2
        y = y0 + i * line_h
        # shadow
        d.text((x + 3, y + 4), ln, font=font, fill=(0, 0, 0, 200))
        d.text((x, y), ln, font=font, fill=(255, 255, 255, 255))
    # artist tag
    tag_font = _font(26)
    tw = d.textlength(artist_tag, font=tag_font)
    d.text(((W - tw) // 2, H - 140), artist_tag, font=tag_font, fill=(255, 255, 255, 170))
    return card


VIDEO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "video")


def _save_cover(cover, dest):
    """Save the cover (URL or path) as a jpg for the Remotion comp."""
    if cover and cover.startswith("http"):
        req = urllib.request.Request(cover, headers={"User-Agent": "Mozilla/5.0"})
        raw = urllib.request.urlopen(req, timeout=180).read()
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    elif cover and os.path.exists(cover):
        img = Image.open(cover).convert("RGB")
    else:
        img = prepare_background("")  # aesthetic fallback
    img.save(dest, quality=92)


def make_lyric_video_premium(audio_path, lyrics, cover, title, artist, out_path,
                             words_override=None):
    """Premium path: demucs + stable-ts word alignment + Remotion render.

    words_override: word list from the lyric editor — exact user-approved
    words + timing; skips detection entirely.
    Raises on any failure so the caller can fall back to the beat-grid engine.
    """
    import json as _json
    from align import align_hook

    y, sr = librosa.load(audio_path, mono=True, sr=44100)
    start = find_hook(y, sr)
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

    props = {
        "title": title.upper() or "UNTITLED",
        "artist": artist.upper(),
        "durationSec": CLIP_SEC,
        "audioFile": "clip.wav",
        "coverFile": "cover.jpg",
        "words": words,
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


def make_lyric_video(audio_path, lyrics, cover, title, artist, out_path):
    y, sr = librosa.load(audio_path, mono=True, sr=44100)
    start = find_hook(y, sr)
    clip = y[int(start * sr): int((start + CLIP_SEC) * sr)]

    # beat grid inside the clip
    tempo, beat_frames = librosa.beat.beat_track(y=clip, sr=sr)
    beats = list(librosa.frames_to_time(beat_frames, sr=sr))
    if len(beats) < 4:  # fallback: even grid at ~2 chunks/sec
        beats = list(np.arange(0, CLIP_SEC, 0.75))
    # advance text every 2 beats so words are readable
    slots = beats[::2]
    if not slots or slots[0] > 0.4:
        slots = [0.0] + slots

    chunks = chunk_lyrics(lyrics, len(slots))
    artist_tag = f"{title.upper()} — {artist.upper()}" if artist else title.upper()
    cards = [render_text_card(c, artist_tag) for c in chunks]

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

    subprocess.run(
        [
            "ffmpeg", "-y",
            "-framerate", str(FPS), "-i", os.path.join(tmpdir, "f%05d.jpg"),
            "-i", clip_wav,
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "21",
            "-c:a", "aac", "-b:a", "192k", "-shortest",
            out_path,
        ],
        check=True, capture_output=True,
    )
    return {"hook_start": round(start, 1), "bpm": round(float(np.atleast_1d(tempo)[0])), "chunks": len(chunks)}
