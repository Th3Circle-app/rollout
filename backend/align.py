"""Word-level lyric alignment for the hook clip.

Pipeline (all local, $0):
  1. Demucs isolates the vocal stem of the hook window.
  2. stable-ts transcribes the vocal to find WHAT is sung and roughly when.
  3. The transcription is fuzzy-matched against the user's pasted lyrics to
     locate the true fragment (fixes ASR mishears like "Uggies").
  4. stable-ts force-aligns the true fragment to the vocal -> word timestamps.

Falls back gracefully: align fail -> transcribed timing with true words
swapped in; total fail -> caller keeps its beat-grid fallback.
"""
import difflib
import os
import re
import subprocess
import sys
import tempfile
import warnings

warnings.filterwarnings("ignore")

_MODEL = None

# "small" is a meaningful jump over "base" on sung vocals (fewer mishears,
# tighter word boundaries) and still CPU-reasonable for a 15-20s clip.
MODEL_SIZE = "small"


def _model():
    global _MODEL
    if _MODEL is None:
        import stable_whisper
        _MODEL = stable_whisper.load_model(MODEL_SIZE)
    return _MODEL


# Tuned on real sung vocals (A/B/C tested 2026-07-27):
# - initial_prompt="Song lyrics:" is the unlock — without it Whisper
#   hallucinates YouTube-isms ("Thank you for watching!") on music.
# - only_voice_freq HURT sung vocals (dropped everything). Off.
# - deterministic decoding, no context carryover.
TRANSCRIBE_OPTS = dict(
    vad=True,
    word_timestamps=True,
    verbose=None,
    temperature=0.0,
    condition_on_previous_text=False,
    suppress_silence=True,
    initial_prompt="Song lyrics:",
)

# Known Whisper music hallucinations — if the whole result is one of these,
# treat it as "nothing detected" instead of showing garbage.
HALLUCINATIONS = (
    "thank you for watching",
    "thanks for watching",
    "subscribe",
    "like and subscribe",
    "music",
    "♪",
)


def _is_hallucination(words):
    text = " ".join(w["word"] if isinstance(w, dict) else w.word for w in words)
    t = _norm_text(text)
    return any(h in t for h in HALLUCINATIONS) and len(words) <= 6


def _norm_text(s):
    return re.sub(r"[^a-z ]", "", s.lower())


def detect_words(hook_wav):
    """Transcribe the isolated vocal -> [{word,start,end,conf}] with timing
    snapped to actual voiced audio. This is the auto-lyrics path the user
    can then correct in the editor."""
    try:
        vocals = isolate_vocals(hook_wav)
    except Exception:
        vocals = hook_wav
    model = _model()
    res = model.transcribe(vocals, **TRANSCRIBE_OPTS)
    # snap word edges to silence for exact trigger timing
    try:
        res = res.adjust_by_silence(vocals)
    except Exception:
        pass
    out = []
    for seg in res.segments:
        for w in seg.words:
            word = w.word.strip().strip(",.!?").strip()
            if word and w.end > w.start:
                out.append({
                    "word": word,
                    "start": round(float(w.start), 3),
                    "end": round(float(w.end), 3),
                    "conf": round(float(getattr(w, "probability", 0) or 0), 2),
                })
    if _is_hallucination(out):
        return []
    return out


def correct_words(words, lyrics):
    """Swap detected words for the user's true lyrics while KEEPING the
    detected timing. Uses sequence alignment so insertions/mishears map to
    the right lyric words."""
    lyric_words = [w for w in lyrics.split() if _norm(w)]
    if not lyric_words or not words:
        return words
    d_norm = [_norm(w["word"]) for w in words]
    l_norm = [_norm(w) for w in lyric_words]
    sm = difflib.SequenceMatcher(a=d_norm, b=l_norm, autojunk=False)
    out = [dict(w) for w in words]
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag in ("replace", "equal"):
            span = min(i2 - i1, j2 - j1)
            for k in range(span):
                out[i1 + k]["word"] = lyric_words[j1 + k]
                out[i1 + k]["conf"] = 1.0
        # deletions keep detected word+timing; insertions have no timing slot
    return out


def _norm(w):
    return re.sub(r"[^a-z']", "", w.lower())


def isolate_vocals(wav_path):
    """Run demucs two-stem separation; return path to vocals.wav."""
    outdir = tempfile.mkdtemp(prefix="rollout_sep_")
    r = subprocess.run(
        [sys.executable, "-m", "demucs.separate", "--two-stems=vocals",
         "-n", "htdemucs", "-o", outdir, wav_path],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        raise RuntimeError("demucs failed: " + r.stderr[-200:])
    base = os.path.splitext(os.path.basename(wav_path))[0]
    return os.path.join(outdir, "htdemucs", base, "vocals.wav")


def locate_fragment(transcribed_words, full_lyrics, pad=4):
    """Fuzzy-match the transcribed hook against the pasted lyrics.

    Returns the true-lyrics fragment (list of words) covering the hook,
    padded a little on both sides so alignment has room to breathe.
    """
    lyric_words = full_lyrics.split()
    if not lyric_words:
        return []
    t_norm = [_norm(w) for w in transcribed_words if _norm(w)]
    l_norm = [_norm(w) for w in lyric_words]
    if not t_norm:
        return []
    sm = difflib.SequenceMatcher(a=l_norm, b=t_norm, autojunk=False)
    blocks = [b for b in sm.get_matching_blocks() if b.size > 0]
    if not blocks:
        return []
    start = max(0, blocks[0].a - pad)
    end = min(len(lyric_words), blocks[-1].a + blocks[-1].size + pad)
    return lyric_words[start:end]


def align_hook(hook_wav, full_lyrics):
    """Return [{word, start, end}, ...] for the hook clip, or [] on failure."""
    try:
        vocals = isolate_vocals(hook_wav)
    except Exception:
        vocals = hook_wav  # align against the mix if separation dies

    model = _model()
    try:
        tr = model.transcribe(vocals, **TRANSCRIBE_OPTS)
        try:
            tr = tr.adjust_by_silence(vocals)
        except Exception:
            pass
        t_words = [w for seg in tr.segments for w in seg.words]
    except Exception:
        t_words = []

    fragment = locate_fragment([w.word for w in t_words], full_lyrics)

    # Force-align the true fragment for clean timing
    if fragment:
        try:
            aligned = model.align(vocals, " ".join(fragment), language="en",
                                  original_split=False, verbose=None)
            out = []
            for seg in aligned.segments:
                for w in seg.words:
                    word = w.word.strip()
                    if word and w.end > w.start:
                        out.append({"word": word, "start": float(w.start), "end": float(w.end)})
            if len(out) >= 3:
                return out
        except Exception:
            pass

    # Fallback: transcribed timing, true words swapped in where matched
    if t_words:
        out = []
        frag_norm = [_norm(w) for w in fragment]
        for w in t_words:
            word = w.word.strip()
            n = _norm(word)
            if frag_norm:
                close = difflib.get_close_matches(n, frag_norm, n=1, cutoff=0.75)
                if close:
                    idx = frag_norm.index(close[0])
                    word = fragment[idx]
            if word and w.end > w.start:
                out.append({"word": word, "start": float(w.start), "end": float(w.end)})
        if len(out) >= 3:
            return out
    return []
