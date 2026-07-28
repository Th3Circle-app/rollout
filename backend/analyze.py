"""Rollout vibe analysis: key, BPM, duration, mood, visual keywords (librosa)."""
import sys, json, warnings
import numpy as np
import librosa
warnings.filterwarnings("ignore")

NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

KW = {
    "emotional": ["dramatic light", "deep shadow", "film grain"],
    "moody": ["dark tones", "neon glow", "rain"],
    "bright": ["sunlight", "pastel", "airy space"],
    "uplifting": ["golden hour", "open sky"],
    "energetic": ["motion blur", "bold color", "strobe"],
    "mellow": ["soft focus", "muted palette", "haze"],
    "driving": ["city at night", "headlights", "speed"],
    "crisp": ["clean lines", "high contrast"],
    "warm": ["amber", "sunset", "analog film"],
    "dreamy": ["soft haze", "double exposure", "pastel fog"],
    "aggressive": ["harsh flash", "high contrast", "raw concrete"],
    "romantic": ["candlelight", "silk", "warm skin tones"],
}

def corr(a, b):
    a = a - a.mean(); b = b - b.mean()
    return float((a @ b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))

def analyze(path):
    y, sr = librosa.load(path, mono=True, sr=22050)
    dur = float(librosa.get_duration(y=y, sr=sr))
    tempo = float(np.atleast_1d(librosa.beat.beat_track(y=y, sr=sr)[0])[0])
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr).mean(axis=1)
    best = (-2.0, None, None)
    for i in range(12):
        cm = corr(chroma, np.roll(MAJ, i))
        ci = corr(chroma, np.roll(MIN, i))
        if cm > best[0]: best = (cm, NOTES[i], "major")
        if ci > best[0]: best = (ci, NOTES[i], "minor")
    key = f"{best[1]} {best[2]}"
    rms = float(librosa.feature.rms(y=y).mean())
    cent = float(librosa.feature.spectral_centroid(y=y, sr=sr).mean())
    mode = best[2]
    # v2: CLAP actually listens (3-window read); heuristic is the fallback
    genre = ""
    clap = None
    try:
        from vibe import listen
        clap = listen(path, mode=mode, bpm=round(tempo))
    except Exception:
        clap = None
    if clap and clap.get("moods"):
        moods = clap["moods"][:3]
        genre = clap.get("genre", "")
    else:
        moods = ["emotional", "moody"] if mode == "minor" else ["bright", "uplifting"]
        moods.append("energetic" if tempo >= 125 else ("mellow" if tempo <= 95 else "driving"))
        moods.append("crisp" if cent > 3000 else "warm")
        moods = list(dict.fromkeys(moods))[:3]
    kws = []
    for m in moods:
        kws += KW.get(m, [])
    kws = list(dict.fromkeys(kws))[:5]
    mm, ss = int(dur // 60), int(dur % 60)
    return {
        "key": key, "bpm": round(tempo), "duration": f"{mm}:{ss:02d}",
        "duration_sec": round(dur, 1), "moods": moods, "keywords": kws,
        "genre": genre,
    }

if __name__ == "__main__":
    print(json.dumps(analyze(sys.argv[1])))
