"""Full-song lyric detection: audio in, formatted lyrics out.

Pipeline (keeps the small Fly box light — only Demucs runs locally, the heavy
speech + language models are Cloudflare's free Workers AI):
  1. Demucs (htdemucs) isolates the vocal stem   -> align.isolate_vocals
  2. Cloudflare Whisper large-v3-turbo transcribes it (chunked for size limits)
  3. Cloudflare Llama 3.3 70B cleans the raw ASR into structured lyrics

Best-effort throughout; the artist always edits the result before it ships.
Requires CF_API_TOKEN + CF_ACCOUNT_ID (already set for the image generator).
"""
import os
import json
import base64
import shutil
import tempfile
import subprocess
import urllib.request


def _cf(path: str, payload: dict, timeout: int = 120) -> dict:
    tok = os.environ.get("CF_API_TOKEN", "")
    acct = os.environ.get("CF_ACCOUNT_ID", "")
    if not tok or not acct:
        raise RuntimeError("cloudflare not configured")
    url = f"https://api.cloudflare.com/client/v4/accounts/{acct}{path}"
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json",
                 "User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def _transcribe(mp3_path: str) -> str:
    audio = open(mp3_path, "rb").read()
    j = _cf("/ai/run/@cf/openai/whisper-large-v3-turbo",
            {"audio": base64.b64encode(audio).decode()})
    return ((j.get("result") or {}).get("text") or "").strip()


_SYS = (
    "You format raw sung-vocal transcriptions into clean song lyrics. Add natural "
    "line breaks, light punctuation, and [Verse]/[Chorus]/[Bridge] labels ONLY where "
    "clearly implied by repetition. Fix obvious mis-hearings from context, but NEVER "
    "invent lines that are not in the transcription. Return ONLY the formatted lyrics, "
    "no preamble."
)


def _format(raw: str) -> str:
    j = _cf("/ai/v1/chat/completions", {
        "model": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        "messages": [{"role": "system", "content": _SYS},
                     {"role": "user", "content": "Format these lyrics:\n\n" + raw}],
        "max_tokens": 1500,
    })
    return (j["choices"][0]["message"]["content"] or "").strip()


def scan_lyrics(audio_path: str) -> str:
    """Isolate the vocal, transcribe it on Cloudflare, and format into lyrics."""
    from align import isolate_vocals
    vocals, outdir = isolate_vocals(audio_path)
    work = tempfile.mkdtemp(prefix="rollout_lyr_")
    try:
        # Compress + split into <=110s chunks: keeps each request under Cloudflare
        # Whisper's size/duration limits and lets a long song transcribe reliably.
        subprocess.run(
            ["ffmpeg", "-y", "-i", vocals, "-b:a", "96k",
             "-f", "segment", "-segment_time", "110",
             os.path.join(work, "c%03d.mp3")],
            capture_output=True, timeout=180,
        )
        chunks = sorted(f for f in os.listdir(work) if f.endswith(".mp3"))
        parts = []
        for c in chunks:
            try:
                parts.append(_transcribe(os.path.join(work, c)))
            except Exception:
                pass  # skip a failed chunk rather than losing the whole scan
        raw = " ".join(p for p in parts if p).strip()
        if not raw:
            raise RuntimeError("no vocals detected in this track")
        try:
            return _format(raw)
        except Exception:
            return raw  # cleanup is a bonus; raw lyrics still beat nothing
    finally:
        shutil.rmtree(work, ignore_errors=True)
        shutil.rmtree(outdir, ignore_errors=True)
