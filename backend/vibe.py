"""Rollout vibe engine v2 — CLAP zero-shot listening.

librosa gives us the measurable (key, BPM, duration). CLAP actually LISTENS:
it embeds the audio and scores it against natural-language descriptions, so
"dark moody atmosphere" vs "bright cheerful sound" is decided by the sound
itself, not by proxy statistics. Feeds moods (captions, art direction,
interests) and genre (art direction archetype).
"""
import numpy as np

_CLAP = None

# label -> Rollout mood vocabulary (keeps captions/ads/art-direction in sync)
MOOD_LABELS = {
    "emotional heartfelt vocal performance": "emotional",
    "dark moody brooding atmosphere": "moody",
    "driving rhythmic forward motion": "driving",
    "bright cheerful sunny sound": "bright",
    "uplifting hopeful anthem": "uplifting",
    "high energy hype banger": "energetic",
    "mellow laid back smooth groove": "mellow",
    "warm soulful analog warmth": "warm",
    "crisp clean modern production": "crisp",
    "dreamy ethereal floating atmosphere": "dreamy",
    "aggressive intense hard hitting": "aggressive",
    "romantic sensual slow jam": "romantic",
}

GENRE_LABELS = [
    "hip hop rap", "trap", "r&b and soul", "pop", "electronic dance music",
    "house music", "rock", "indie alternative", "folk acoustic singer songwriter",
    "ambient chill instrumental", "afrobeats", "drill",
]


def _model():
    global _CLAP
    if _CLAP is None:
        import laion_clap
        m = laion_clap.CLAP_Module(enable_fusion=False)
        m.load_ckpt()  # cached 630k-audioset-best.pt
        _CLAP = m
    return _CLAP


def _norm(v):
    return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-9)


def _windows(path):
    """Cut three representative 10s windows (early, loudest/hook, late) so the
    read reflects the WHOLE song, not just the intro."""
    import librosa
    import soundfile as sf
    import tempfile
    import os

    y, sr = librosa.load(path, mono=True, sr=48000)
    dur = len(y) / sr
    if dur <= 12:
        return [path]
    hop = 1024
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    frames = int(10 * sr / hop)
    csum = np.cumsum(rms)
    hook_start = 0.0
    if len(rms) > frames:
        hook_start = int(np.argmax(csum[frames:] - csum[:-frames])) * hop / sr
    starts = {max(0.0, dur * 0.1), hook_start, min(dur - 10, dur * 0.7)}
    out = []
    for s in starts:
        clip = y[int(s * sr): int((s + 10) * sr)]
        f = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        sf.write(f.name, clip, sr)
        out.append(f.name)
    return out


def listen(path):
    """Return {moods: [top3 vocab words], genre: str, scores: {...}} or None."""
    try:
        m = _model()
        wavs = _windows(path)
        embeds = m.get_audio_embedding_from_filelist(wavs, use_tensor=False)
        audio = _norm(_norm(embeds).mean(axis=0, keepdims=True))
        import os as _os
        for w in wavs:
            if w != path:
                try: _os.unlink(w)
                except OSError: pass

        mood_texts = [f"a {t} song" for t in MOOD_LABELS]
        mt = _norm(m.get_text_embedding(mood_texts, use_tensor=False))
        mood_sims = (audio @ mt.T)[0]
        order = np.argsort(mood_sims)[::-1]
        vocab = list(MOOD_LABELS.values())
        moods = []
        for i in order:
            if vocab[i] not in moods:
                moods.append(vocab[i])
            if len(moods) == 3:
                break

        genre_texts = [f"a {g} track" for g in GENRE_LABELS]
        gt = _norm(m.get_text_embedding(genre_texts, use_tensor=False))
        genre_sims = (audio @ gt.T)[0]
        genre = GENRE_LABELS[int(np.argmax(genre_sims))]

        return {
            "moods": moods,
            "genre": genre,
            "scores": {vocab[i]: round(float(mood_sims[i]), 3) for i in order[:5]},
        }
    except Exception:
        return None
