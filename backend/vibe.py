"""Rollout vibe engine v3 — music-trained CLAP + calibrated zero-shot.

What changed from v2 (and why the read got trustworthy):
  1. MUSIC checkpoint (music_audioset_epoch_15_esc_90.14, HTSAT-base): trained
     on music, hears musical mood — the general 630k ckpt heard "audio events".
  2. Prompt ensembles: each label scored as the average of 3 phrasings, so
     wording quirks stop deciding moods.
  3. Z-score calibration across labels: raw CLAP similarities are biased per
     prompt; normalizing makes ranks meaningful.
  4. Five-window listen (early/quarter/hook/late/outro) averaged — the WHOLE
     song votes.
  5. Theory fusion: minor key and tempo nudge the ear (small z-boosts), so
     "C minor at 99bpm" can break ties toward emotional/moody — ear leads,
     theory advises.

Commercial-safe: LAION-CLAP code + checkpoints are openly licensed (unlike
Essentia's CC BY-NC-ND mood models, which CANNOT ship in a paid product).
"""
import numpy as np

_CLAP = None

MOOD_LABELS = {
    "emotional and heartfelt": "emotional",
    "introspective and reflective": "introspective",
    "triumphant and victorious": "triumphant",
    "dark and moody": "moody",
    "driving and rhythmic": "driving",
    "bright and cheerful": "bright",
    "uplifting and hopeful": "uplifting",
    "energetic and hype": "energetic",
    "mellow and laid back": "mellow",
    "warm and soulful": "warm",
    "crisp and polished": "crisp",
    "dreamy and ethereal": "dreamy",
    "aggressive and intense": "aggressive",
    "sexy bedroom slow jam": "romantic",
}

# Skepticism priors: presentation-risky tags must strongly dominate to
# surface (artist feedback 2026-07-27: romantic false-fired on a
# self-discovery song).
PRIORS = {"romantic": -1.0}

TEMPLATES = [
    "a {} song",
    "this music sounds {}",
    "a {} piece of music",
]

GENRE_LABELS = [
    "hip hop rap", "trap", "r&b and soul", "pop", "electronic dance music",
    "house music", "rock", "indie alternative", "folk acoustic singer songwriter",
    "ambient chill instrumental", "afrobeats", "drill",
]
GENRE_TEMPLATES = ["a {} track", "{} music", "a song in the {} genre"]

# music-theory advice: additive z-score boosts (ear leads, theory advises)
MINOR_BOOST = {"emotional": 0.45, "moody": 0.45, "introspective": 0.3}
MAJOR_BOOST = {"bright": 0.35, "uplifting": 0.35}


def _model():
    global _CLAP
    if _CLAP is None:
        import laion_clap
        from huggingface_hub import hf_hub_download
        ckpt = hf_hub_download(repo_id="lukewys/laion_clap",
                               filename="music_audioset_epoch_15_esc_90.14.pt")
        m = laion_clap.CLAP_Module(enable_fusion=False, amodel="HTSAT-base")
        m.load_ckpt(ckpt)
        _CLAP = m
    return _CLAP


def _norm(v):
    return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-9)


def _windows(path):
    """Five representative 10s windows so the WHOLE song votes."""
    import librosa
    import soundfile as sf
    import tempfile

    y, sr = librosa.load(path, mono=True, sr=48000)
    dur = len(y) / sr
    if dur <= 12:
        return [path]
    hop = 1024
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    frames = int(10 * sr / hop)
    csum = np.cumsum(rms)
    hook = 0.0
    if len(rms) > frames:
        hook = int(np.argmax(csum[frames:] - csum[:-frames])) * hop / sr
    starts = sorted({max(0.0, dur * f) for f in (0.08, 0.3, 0.6, 0.85)} | {hook})
    out = []
    for s in starts:
        s = min(s, max(0.0, dur - 10))
        clip = y[int(s * sr): int((s + 10) * sr)]
        f = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        sf.write(f.name, clip, sr)
        out.append(f.name)
    return out


def _ensemble_text(m, labels, templates):
    """Average embedding across phrasings per label -> (n_labels, dim)."""
    embeds = []
    for tpl in templates:
        texts = [tpl.format(lb) for lb in labels]
        embeds.append(_norm(m.get_text_embedding(texts, use_tensor=False)))
    return _norm(np.mean(embeds, axis=0))


def _zscore(sims):
    return (sims - sims.mean()) / (sims.std() + 1e-9)


_AUDIO_CACHE = {}


def listen(path, mode="", bpm=0, lyrics="", cache_key=""):
    """Return {moods, genre, scores} — calibrated, theory-advised. None on failure."""
    try:
        m = _model()
        if cache_key and cache_key in _AUDIO_CACHE:
            audio = _AUDIO_CACHE[cache_key]
        else:
            wavs = _windows(path)
            embeds = m.get_audio_embedding_from_filelist(wavs, use_tensor=False)
            audio = _norm(_norm(embeds).mean(axis=0, keepdims=True))
            import os as _os
            for w in wavs:
                if w != path:
                    try: _os.unlink(w)
                    except OSError: pass
            if cache_key:
                _AUDIO_CACHE[cache_key] = audio

        # moods: ensemble + calibrate + theory advice
        labels = list(MOOD_LABELS.keys())
        vocab = list(MOOD_LABELS.values())
        mt = _ensemble_text(m, labels, TEMPLATES)
        z = _zscore((audio @ mt.T)[0])
        # lyrics fusion: what the artist SAYS breaks ties in what we HEAR
        if lyrics and lyrics.strip():
            lyr = _norm(m.get_text_embedding(
                [lyrics.strip()[:800]], use_tensor=False))
            z = z + 0.5 * _zscore((lyr @ mt.T)[0])
        boost = MINOR_BOOST if mode == "minor" else MAJOR_BOOST if mode == "major" else {}
        for i, v in enumerate(vocab):
            z[i] += boost.get(v, 0.0) + PRIORS.get(v, 0.0)
            if bpm and bpm >= 130 and v in ("energetic", "driving"):
                z[i] += 0.3
            if bpm and bpm <= 85 and v in ("mellow", "dreamy"):
                z[i] += 0.3
        order = np.argsort(z)[::-1]
        moods = []
        for i in order:
            if vocab[i] not in moods:
                moods.append(vocab[i])
            if len(moods) == 3:
                break

        # genre: ensemble + calibrate
        gt = _ensemble_text(m, GENRE_LABELS, GENRE_TEMPLATES)
        gz = _zscore((audio @ gt.T)[0])
        genre = GENRE_LABELS[int(np.argmax(gz))]

        return {
            "moods": moods,
            "genre": genre,
            "scores": {vocab[i]: round(float(z[i]), 2) for i in order[:6]},
        }
    except Exception:
        return None
