"""Rollout backend: vibe analysis, cover upscale, captions."""
import os, io, re, shutil, socket, tempfile, ipaddress, urllib.request
import functools, threading
import time as _time
from urllib.parse import urlparse
from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel
from PIL import Image
# Cap decoded pixel count so a crafted small file (tiny bytes, huge dimensions)
# can't allocate a giant bitmap and OOM the worker. PIL raises
# DecompressionBombError past 2x this; the image handlers catch it as a 4xx.
Image.MAX_IMAGE_PIXELS = 50_000_000  # ~50 MP (7000x7000)
from analyze import analyze
from captions import generate_captions

app = FastAPI(title="Rollout API")

# CORS is locked to the app origin(s) in prod via ALLOWED_ORIGINS (comma-sep);
# unset ("*") keeps local dev open.
_ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    # Let the browser read which generator actually served an image, so the UI
    # can show "via Cloudflare" vs a slow built-in fallback.
    expose_headers=["X-Gen-Source"],
)


# ── Supabase auth gate ──────────────────────────────────────────────────────
# The engine does heavy ML compute, so it must not be an open endpoint anyone
# can spend. Every request (except /health + CORS preflight) must carry a valid
# Supabase access token. We validate by introspection against GoTrue
# (GET /auth/v1/user) rather than holding the project JWT secret; a hit caches
# for 60s so a multi-call session doesn't re-introspect every request.
# Enforcement is ON only when SUPABASE_URL + SUPABASE_ANON_KEY are set, so a
# local dev engine (no env) keeps working exactly as before.
_AUTH_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
_AUTH_ANON = os.environ.get("SUPABASE_ANON_KEY", "")
_AUTH_ENABLED = bool(_AUTH_URL and _AUTH_ANON)
_AUTH_OPEN_PATHS = {"/health"}
_auth_cache: dict = {}  # access token -> epoch it's trusted until


def _token_valid(tok: str) -> bool:
    now = _time.time()
    if _auth_cache.get(tok, 0) > now:
        return True
    try:
        req = urllib.request.Request(
            f"{_AUTH_URL}/auth/v1/user",
            headers={"Authorization": f"Bearer {tok}", "apikey": _AUTH_ANON},
        )
        with urllib.request.urlopen(req, timeout=6) as r:
            if r.status == 200:
                if len(_auth_cache) > 1000:  # prune expired entries occasionally
                    for k, v in list(_auth_cache.items()):
                        if v <= now:
                            _auth_cache.pop(k, None)
                _auth_cache[tok] = now + 60
                return True
    except Exception:
        return False
    return False


class _AuthGate(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if (not _AUTH_ENABLED or request.method == "OPTIONS"
                or request.url.path in _AUTH_OPEN_PATHS):
            return await call_next(request)
        authz = request.headers.get("authorization", "")
        tok = authz[7:].strip() if authz[:7].lower() == "bearer " else ""
        if not tok:
            return Response(status_code=401, content=b"auth required", media_type="text/plain")
        from starlette.concurrency import run_in_threadpool
        if not await run_in_threadpool(_token_valid, tok):
            return Response(status_code=401, content=b"invalid or expired token", media_type="text/plain")
        return await call_next(request)


app.add_middleware(_AuthGate)


# Log the exact field that fails request validation (the 422 that never reaches an
# endpoint body). Temporary diagnostic — surfaces which Form field the browser sent
# in a shape FastAPI rejects.
from fastapi.exceptions import RequestValidationError as _RVE


@app.exception_handler(_RVE)
async def _log_validation(request, exc):
    print("VALIDATION 422", request.url.path, "->", exc.errors(), flush=True)
    return Response(status_code=422, content=str(exc.errors())[:500].encode(), media_type="text/plain")


# ── one heavy job at a time ─────────────────────────────────────────────────
# The engine is a small shared-CPU box: a single Demucs / Whisper / ffmpeg job
# already pins both cores, so two heavy jobs at once thrash and crawl (a promo
# render + a lyric detect were fighting and took 15 min). Serialize them — the
# second heavy request gets a clean 409 "busy" instead of grinding everything.
_ENGINE_LOCK = threading.Lock()


def single_flight(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        if not _ENGINE_LOCK.acquire(blocking=False):
            return Response(
                status_code=409,
                content=b"engine busy: another render is running, wait a moment and try again",
                media_type="text/plain",
            )
        try:
            return fn(*args, **kwargs)
        finally:
            _ENGINE_LOCK.release()
    return wrapper


# ── SSRF-safe fetch (IP-pinned, DNS-rebinding proof) — shared in netguard.py ──
from netguard import assert_public_url as _assert_public_url, fetch_url as _fetch_url


# ── reject oversized request bodies before they hit memory ──
class _BodySizeLimit(BaseHTTPMiddleware):
    MAX = 40 * 1024 * 1024  # 40 MB

    async def dispatch(self, request, call_next):
        cl = request.headers.get("content-length")
        if cl and cl.isdigit() and int(cl) > self.MAX:
            return Response(status_code=413, content=b"request too large", media_type="text/plain")
        return await call_next(request)


app.add_middleware(_BodySizeLimit)


def _copy_capped(src, dst, max_bytes: int = _BodySizeLimit.MAX) -> None:
    """Stream-copy an upload with a hard byte ceiling. The Content-Length
    middleware only catches requests that DECLARE their size; a chunked /
    Content-Length-omitted body bypasses it, so enforce the cap here on the
    actual bytes to stop a disk-fill upload."""
    written = 0
    while True:
        chunk = src.read(1024 * 1024)
        if not chunk:
            break
        written += len(chunk)
        if written > max_bytes:
            raise HTTPException(status_code=413, detail="upload too large")
        dst.write(chunk)


# ── periodic uploads cleanup so the disk doesn't grow forever ──
def _sweep_uploads(max_age_h: int = 24) -> None:
    # recurse so sub-caches (uploads/broll, hook clips) are capped too, not just
    # top-level files
    now = _time.time()
    for root, _dirs, files in os.walk(UPLOADS):
        for name in files:
            fp = os.path.join(root, name)
            try:
                if now - os.path.getmtime(fp) > max_age_h * 3600:
                    os.remove(fp)
            except OSError:
                pass


@app.on_event("startup")
def _startup_sweep() -> None:
    _sweep_uploads()
    # keep sweeping on a background thread; a long-lived process would otherwise
    # only ever clean up once, at boot, and let temp files accumulate unbounded
    import threading

    def _periodic() -> None:
        while True:
            _time.sleep(3600)
            try:
                _sweep_uploads()
            except Exception:
                pass

    threading.Thread(target=_periodic, daemon=True).start()

@app.get("/health")
def health():
    from broll import available as broll_available
    return {"ok": True, "broll": broll_available()}


class UpscaleReq(BaseModel):
    url: str = ""
    b64: str = ""  # BYO-provider images arrive as bytes, not fetchable URLs
    size: int = 3000


@app.post("/upscale")
def upscale(req: UpscaleReq):
    """Fetch a generated cover and LANCZOS-upscale it to a real delivery size."""
    try:
        if req.b64:
            import base64 as _b64
            raw = _b64.b64decode(req.b64)
        elif req.url:
            raw = _fetch_url(req.url)
        else:
            return Response(status_code=400, content=b"provide b64 or url", media_type="text/plain")
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as e:
        return Response(status_code=400, content=(f"invalid image: {e}")[:200].encode(), media_type="text/plain")
    size = max(512, min(int(req.size), 4000))
    img = img.resize((size, size), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="PNG")
    return Response(content=out.getvalue(), media_type="image/png")


class ArtDirectReq(BaseModel):
    moods: list[str] = []
    keywords: list[str] = []
    direction: str = ""
    style: str = "auto"
    genre: str = ""


@app.post("/artdirect")
def artdirect(req: ArtDirectReq):
    """Album-cover design knowledge -> professional prompt + layer recipe."""
    from artdirection import direct
    return direct(req.moods, req.keywords, req.direction, req.style, req.genre)


@app.get("/artstyles")
def artstyles():
    from artdirection import list_styles
    return {"styles": list_styles()}


class GenImageReq(BaseModel):
    provider: str = "builtin"
    prompt: str
    key: str = ""
    seed: int = 0
    size: int = 1024
    model: str = ""
    base_url: str = ""
    image_b64: str = ""  # restyle mode: the user's photo


@app.get("/imagemodels")
def imagemodels():
    """The model catalog artists pick from — no API knowledge required.
    Premium entries light up when the platform key is funded."""
    from genimage import list_models
    return {"models": list_models()}


@app.post("/genimage")
def genimage(req: GenImageReq):
    """Provider gateway: built-in free generator, the artist's own account,
    or the platform catalog (our key, our credits). BYO keys pass through
    per-request; nothing is stored."""
    from genimage import generate, platform_sources
    # BYO custom provider posts to a user-supplied base_url — SSRF-guard it.
    if req.provider == "custom" and req.base_url:
        try:
            _assert_public_url(req.base_url)
        except Exception as e:
            return Response(status_code=400, content=(f"bad base_url: {e}")[:200].encode(), media_type="text/plain")

    if req.provider == "platform":
        # Failover chain: try each configured free/paid source in order, roll to
        # the next on any failure (rate-limit, out of credits, provider down), and
        # always end on the keyless built-in so a generation never hard-fails.
        chain = platform_sources() + [
            {"provider": "builtin", "key": "", "model": "", "base_url": ""}]
        last_err = "no generator available"
        for src in chain:
            prov = src["provider"]
            # Only a funded fal account honors the client's premium model pick; the
            # free sources each serve their single free fast model.
            model = req.model if prov == "platform" else src["model"]
            base_url = src.get("base_url", "") or req.base_url
            try:
                data = generate(prov, req.prompt, src["key"], req.seed,
                                req.size, model, base_url, req.image_b64)
                return Response(content=data, media_type="image/png",
                                headers={"X-Gen-Source": src.get("name", prov)})
            except Exception as e:
                last_err = str(e)
                continue
        return Response(status_code=422, content=last_err.encode(), media_type="text/plain")

    try:
        data = generate(req.provider, req.prompt, req.key, req.seed,
                        req.size, req.model, req.base_url, req.image_b64)
        return Response(content=data, media_type="image/png")
    except Exception as e:
        return Response(status_code=422, content=str(e).encode(),
                        media_type="text/plain")


class ReVibeReq(BaseModel):
    file_id: str
    lyrics: str = ""
    mode: str = ""
    bpm: int = 0


@app.post("/revibe")
def revibe(req: ReVibeReq):
    """Refine the vibe with lyrics — fast (audio embedding is cached)."""
    from vibe import listen
    base = os.path.basename(req.file_id or "")
    src = os.path.join(UPLOADS, base)
    if not base or not os.path.isfile(src):
        return Response(status_code=404, content=b"unknown file_id")
    r = listen(src, mode=req.mode, bpm=req.bpm, lyrics=req.lyrics,
               cache_key=req.file_id)
    if not r:
        return Response(status_code=422, content=b"vibe engine unavailable")
    return r


class DetectReq(BaseModel):
    file_id: str
    audio_key: str = ""   # "{uid}/{file_id}" in the durable Storage bucket
    start: float = -1     # artist-chosen section start (sec); < 0 = auto-find the hook


# Strict key pattern (uid/filename) so a crafted audio_key can't traverse paths
# or point the fetch anywhere but this artist's own Storage folder.
_AUDIO_KEY_RE = re.compile(r"^[0-9a-fA-F-]{1,64}/[A-Za-z0-9._-]{1,128}$")


def _ensure_audio(file_id: str, audio_key: str, authorization: str):
    """Guarantee the track's audio exists locally. If the engine's copy is gone
    (e.g. after a redeploy), re-fetch the DURABLE copy from Supabase Storage using
    the caller's own access token. Fixed host + strict key pattern — never an
    arbitrary-URL fetch, so no SSRF surface."""
    base = os.path.basename(file_id or "")
    if not base:
        return
    dest = os.path.join(UPLOADS, base)
    if os.path.isfile(dest):
        return
    if not authorization or not audio_key or not _AUDIO_KEY_RE.match(audio_key):
        return
    sup = os.environ.get("SUPABASE_URL", "").rstrip("/")
    anon = os.environ.get("SUPABASE_ANON_KEY", "")
    if not sup:
        return
    url = f"{sup}/storage/v1/object/tracks/{audio_key}"
    try:
        rq = urllib.request.Request(url, headers={"Authorization": authorization, "apikey": anon})
        with urllib.request.urlopen(rq, timeout=45) as resp:
            data = resp.read()
        with open(dest, "wb") as out:
            out.write(data)
    except Exception:
        try:
            os.remove(dest)
        except OSError:
            pass


def _hook_clip_path(file_id: str, start=None):
    """Cut (and cache) a 15s window of an uploaded track. `start` picks a specific
    second to cut from (the artist's chosen section); None auto-finds the hook.
    Returns (None, 0.0) for a missing/undecodable/crafted file_id so callers 404."""
    import librosa, soundfile as sf, json as _json
    from lyricvideo import find_hook, CLIP_SEC
    base = os.path.basename(file_id or "")
    if not base:
        return None, 0.0
    src = os.path.join(UPLOADS, base)
    if not os.path.isfile(src):  # isfile() also rejects a dir-resolving file_id
        return None, 0.0
    # Cache per chosen window ("auto" hook vs a specific artist-picked start), so
    # switching sections doesn't fight one shared cached clip.
    tag = f"s{int(round(float(start)))}" if start is not None else "auto"
    clip_path = os.path.join(UPLOADS, f"hook_{tag}_{base}.wav")
    meta_path = clip_path + ".json"
    try:
        if os.path.exists(clip_path) and os.path.exists(meta_path):
            with open(meta_path) as mf:
                return clip_path, _json.load(mf)["hook_start"]
        y, sr = librosa.load(src, mono=True, sr=44100)
        if start is not None:
            dur = len(y) / sr
            st = max(0.0, min(float(start), max(0.0, dur - CLIP_SEC)))
        else:
            st = find_hook(y, sr)
        sf.write(clip_path, y[int(st * sr): int((st + CLIP_SEC) * sr)], sr)
        with open(meta_path, "w") as mf:
            _json.dump({"hook_start": round(st, 2)}, mf)
        return clip_path, round(st, 2)
    except Exception:
        return None, 0.0


@app.post("/detectlyrics")
@single_flight
def detectlyrics(req: DetectReq, authorization: str = Header(default="")):
    """Auto-detect sung words in the hook with exact, silence-snapped timing.
    The editor lets the artist fix any misheard word before rendering."""
    from align import detect_words
    _ensure_audio(req.file_id, req.audio_key, authorization)  # re-hydrate if the local copy is gone
    clip, hook_start = _hook_clip_path(req.file_id, req.start if req.start >= 0 else None)
    if clip is None:
        return Response(status_code=404, content=b"unknown file_id")
    try:
        return {"hook_start": hook_start, "words": detect_words(clip)}
    except Exception as e:
        return Response(status_code=422, content=(f"detection failed: {e}")[:200].encode(), media_type="text/plain")


@app.post("/scanlyrics")
@single_flight
def scanlyrics(req: DetectReq, authorization: str = Header(default="")):
    """Auto-detect the FULL lyrics from the audio — no pasting needed. Demucs
    isolates the vocal locally, then Cloudflare's free Whisper transcribes it and
    Llama cleans it into structured lyrics. Slow (~1-3 min); the client shows a
    spinner. Best-effort; the artist edits the result before it ships."""
    _ensure_audio(req.file_id, req.audio_key, authorization)  # re-hydrate if gone
    base = os.path.basename(req.file_id or "")
    path = os.path.join(UPLOADS, base) if base else ""
    if not path or not os.path.isfile(path):
        return Response(status_code=404, content=b"unknown file_id")
    try:
        from lyricscan import scan_lyrics
        return {"lyrics": scan_lyrics(path)}
    except Exception as e:
        return Response(status_code=422, content=(f"lyric scan failed: {e}")[:200].encode(), media_type="text/plain")


@app.get("/hookclip/{file_id}")
def hookclip(file_id: str, start: float = -1):
    """Serve a 15s window so the artist can listen. `start` picks their chosen
    section; < 0 serves the auto-detected hook."""
    clip, _ = _hook_clip_path(file_id, start if start >= 0 else None)
    if clip is None:
        return Response(status_code=404, content=b"unknown file_id")
    try:
        with open(clip, "rb") as f:
            return Response(content=f.read(), media_type="audio/wav")
    except OSError:
        return Response(status_code=404, content=b"clip unavailable")


@app.get("/trackaudio/{file_id}")
def trackaudio(file_id: str, audio_key: str = "", authorization: str = Header(default="")):
    """Serve the FULL uploaded track so the artist can scrub it and pick the
    section they want. Re-hydrates from durable Storage if the local copy is gone."""
    import mimetypes
    _ensure_audio(file_id, audio_key, authorization)
    base = os.path.basename(file_id or "")
    path = os.path.join(UPLOADS, base) if base else ""
    if not path or not os.path.isfile(path):
        return Response(status_code=404, content=b"unknown file_id")
    try:
        with open(path, "rb") as f:
            return Response(content=f.read(),
                            media_type=mimetypes.guess_type(base)[0] or "audio/mpeg")
    except OSError:
        return Response(status_code=404, content=b"track unavailable")


class CorrectReq(BaseModel):
    words: list[dict]
    lyrics: str


@app.post("/correctwords")
def correctwords(req: CorrectReq):
    """Map the artist's pasted lyrics onto the detected timing."""
    from align import correct_words
    try:
        return {"words": correct_words(req.words, req.lyrics)}
    except Exception as e:
        return Response(status_code=422, content=(f"bad words payload: {e}")[:200].encode(), media_type="text/plain")


class RemoveBgReq(BaseModel):
    url: str = ""
    b64: str = ""  # user-uploaded photos arrive as bytes


_REMBG_SESSION = None


@app.post("/removebg")
def removebg(req: RemoveBgReq):
    """Cut the background off an image -> transparent PNG subject layer.
    Takes a generated-image URL or a user photo as base64."""
    global _REMBG_SESSION
    # validate cheaply BEFORE the heavy rembg import / ONNX model load, so a bad
    # request (no input, non-image bytes, blocked URL) returns fast instead of
    # paying a multi-second cold model load only to 400.
    if not req.b64 and not req.url:
        return Response(status_code=400, content=b"provide b64 or url", media_type="text/plain")
    try:
        if req.b64:
            import base64 as _b64
            raw = _b64.b64decode(req.b64)
        else:
            raw = _fetch_url(req.url)
        Image.open(io.BytesIO(raw)).verify()  # reject non-images without loading rembg
    except Exception as e:
        return Response(status_code=400, content=(f"invalid image: {e}")[:200].encode(), media_type="text/plain")
    try:
        from rembg import remove, new_session
        if _REMBG_SESSION is None:
            _REMBG_SESSION = new_session("isnet-general-use")
        out = remove(raw, session=_REMBG_SESSION)
    except Exception as e:
        return Response(status_code=500, content=(f"background removal failed: {e}")[:200].encode(), media_type="text/plain")
    return Response(content=out, media_type="image/png")


class EssenceReq(BaseModel):
    b64: str


@app.post("/photoessence")
def photoessence(req: EssenceReq):
    """Extract the essence of a user photo: dominant palette + character words.
    Feeds 'Inspired by' mode — new art that FEELS like their photo."""
    import base64 as _b64
    try:
        img = Image.open(io.BytesIO(_b64.b64decode(req.b64))).convert("RGB")
    except Exception as e:
        return Response(status_code=400, content=(f"invalid image: {e}")[:200].encode(), media_type="text/plain")
    img.thumbnail((200, 200))
    # dominant colors via adaptive quantization
    pal_img = img.quantize(colors=5, method=Image.Quantize.FASTOCTREE)
    palette = pal_img.getpalette()[:15]
    counts = sorted(pal_img.getcolors(), reverse=True)
    hexes = []
    for _, idx in counts[:5]:
        r, g, b = palette[idx * 3: idx * 3 + 3]
        hexes.append(f"#{r:02X}{g:02X}{b:02X}")
    # character: luminance + saturation read
    import colorsys
    px = list(img.getdata())[::17]
    lum = sum(0.299 * r + 0.587 * g + 0.114 * b for r, g, b in px) / len(px) / 255
    sat = sum(colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)[1] for r, g, b in px) / len(px)
    words = []
    words.append("dark and shadowy" if lum < 0.35 else "bright and airy" if lum > 0.65 else "balanced light")
    words.append("muted desaturated tones" if sat < 0.25 else "rich saturated color" if sat > 0.55 else "natural color")
    return {"palette": hexes, "character": ", ".join(words)}


class CaptionReq(BaseModel):
    title: str
    artist: str
    moods: list[str] = []
    keywords: list[str] = []
    date: str = ""
    link: str = ""
    lyrics: str = ""
    about: str = ""       # the artist's own words about the song
    variant: int = 0      # bumps on "Regenerate" for a fresh take
    count: int = 7        # plan length (scaled by the caller's tier)


@app.post("/captions")
def captions(req: CaptionReq):
    return generate_captions(
        title=req.title, artist=req.artist, moods=req.moods,
        keywords=req.keywords, date=req.date, link=req.link, lyrics=req.lyrics,
        about=req.about, variant=req.variant, count=req.count,
    )


@app.post("/lyricvideo")
@single_flight
def lyric_video(
    lyrics: str = Form(""),   # optional: the detected words alone are enough
    title: str = Form(""),
    artist: str = Form(""),
    cover_url: str = Form(""),
    file_id: str = Form(""),
    words_json: str = Form(""),
    bg: str = Form("cover"),
    moods: str = Form(""),
    style: str = Form(""),
    audio_key: str = Form(""),
    font: str = Form("bold"),
    position: str = Form("center"),
    start: float = Form(-1),   # artist-chosen section start (sec); < 0 = auto hook
    file: UploadFile | None = File(None),
    authorization: str = Header(default=""),
):
    """Render a 15s kinetic lyric video from the hook of the track. Plain def so
    the long ffmpeg/Remotion render runs in the threadpool, not the event loop."""
    from lyricvideo import make_lyric_video, make_lyric_video_premium, make_lyric_video_broll

    audio_is_temp = False
    if file is not None and file.filename:
        suffix = os.path.splitext(file.filename)[1] or ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            try:
                _copy_capped(file.file, tmp)
            except HTTPException:
                try: os.remove(tmp.name)
                except OSError: pass
                raise
            audio_path = tmp.name
        audio_is_temp = True
    elif file_id:
        _ensure_audio(file_id, audio_key, authorization)  # re-hydrate from durable Storage if gone
        audio_path = os.path.join(UPLOADS, os.path.basename(file_id))
        if not os.path.isfile(audio_path):
            return Response(status_code=404, content=b"unknown file_id")
    else:
        return Response(status_code=400, content=b"no audio provided")

    # SSRF-guard a user-supplied cover URL; ignore it if it isn't public.
    if cover_url:
        try:
            _assert_public_url(cover_url)
        except Exception:
            cover_url = ""

    words_override = None
    if words_json:
        import json as _json
        try:
            words_override = _json.loads(words_json)
        except Exception:
            words_override = None

    # The artist can render from just the detected words (no pasted lyrics). If
    # lyrics is empty, rebuild the text from the words so the classic renderer
    # (which reads the lyrics string) still has something to show.
    if not lyrics.strip() and words_override:
        try:
            lyrics = " ".join(str(w.get("word", "")).strip() for w in words_override if w.get("word"))
        except Exception:
            pass
    if not lyrics.strip() and not words_override:
        return Response(status_code=400, content=b"provide lyrics or detect the words first", media_type="text/plain")

    out = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4").name
    try:
        # The premium engine needs Remotion (Node), which is NOT bundled in this
        # image — attempting it first burned minutes on demucs + whisper before
        # failing every time. Go straight to the self-contained ffmpeg renderer,
        # which is what actually produced the output all along. Only try premium
        # if Remotion is genuinely present on PATH.
        import shutil as _sh
        _has_remotion = bool(_sh.which("npx"))
        _moods = [m for m in moods.split(",") if m]
        if _has_remotion:
            try:
                meta = make_lyric_video_premium(
                    audio_path, lyrics, cover_url, title, artist, out, words_override,
                    bg=bg, moods=_moods, style=style, start_override=(start if start >= 0 else None))
            except Exception as e:
                print("premium engine fell back:", e)
                meta = make_lyric_video(audio_path, lyrics, cover_url, title, artist, out, font=font, position=position, start_override=(start if start >= 0 else None))
        elif bg == "broll":
            # Moving vibe-matched footage background via the ffmpeg renderer. Any
            # failure (no clips, ffmpeg error) safely falls back to the cover render.
            try:
                meta = make_lyric_video_broll(audio_path, lyrics, title, artist, out, moods=_moods, style=style, font=font, position=position, start_override=(start if start >= 0 else None))
            except Exception as e:
                print("b-roll fell back to cover:", e)
                meta = make_lyric_video(audio_path, lyrics, cover_url, title, artist, out, font=font, position=position, start_override=(start if start >= 0 else None))
        else:
            meta = make_lyric_video(audio_path, lyrics, cover_url, title, artist, out, font=font, position=position)
        with open(out, "rb") as f:
            data = f.read()
    except Exception as e:
        import traceback
        print("RENDER FAILED:", repr(e))
        traceback.print_exc()
        return Response(status_code=422, content=(f"render failed: {e}")[:200].encode(), media_type="text/plain")
    finally:
        for p in ([out] + ([audio_path] if audio_is_temp else [])):
            try:
                os.unlink(p)
            except OSError:
                pass

    # ASCII/latin-1-safe filename so a non-Latin title can't 500 the header
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "-", (title or "clip")).strip("-") or "clip"
    return Response(
        content=data,
        media_type="video/mp4",
        headers={
            "X-Hook-Start": str(meta["hook_start"]),
            "X-Bpm": str(meta["bpm"]),
            "X-Engine": meta.get("engine", "classic"),
            "Content-Disposition": f'attachment; filename="{safe_name}-lyric.mp4"',
        },
    )


@app.post("/promoclip")
@single_flight
def promo_clip(
    title: str = Form(""),
    artist: str = Form(""),
    caption: str = Form(""),
    cover_url: str = Form(""),
    file_id: str = Form(""),
    moods: str = Form(""),
    style: str = Form(""),
    audio_key: str = Form(""),
    font: str = Form("bold"),
    bg: str = Form("broll"),
    start: float = Form(-1),   # artist-chosen section start (sec); < 0 = auto hook
    file: UploadFile | None = File(None),
    authorization: str = Header(default=""),
):
    """Render a 15s vertical promo teaser from the song's hook — a shareable
    TikTok/Reels/Shorts clip with a headline sequence over vibe-matched b-roll.
    No lyrics required. Plain def so the ffmpeg render runs in the threadpool."""
    from lyricvideo import make_promo_clip

    audio_is_temp = False
    if file is not None and file.filename:
        suffix = os.path.splitext(file.filename)[1] or ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            try:
                _copy_capped(file.file, tmp)
            except HTTPException:
                try: os.remove(tmp.name)
                except OSError: pass
                raise
            audio_path = tmp.name
        audio_is_temp = True
    elif file_id:
        _ensure_audio(file_id, audio_key, authorization)
        audio_path = os.path.join(UPLOADS, os.path.basename(file_id))
        if not os.path.isfile(audio_path):
            return Response(status_code=404, content=b"unknown file_id")
    else:
        return Response(status_code=400, content=b"no audio provided")

    if cover_url:
        try:
            _assert_public_url(cover_url)
        except Exception:
            cover_url = ""

    out = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4").name
    try:
        _moods = [m for m in moods.split(",") if m]
        meta = make_promo_clip(audio_path, title, artist, caption, out,
                               cover=cover_url, moods=_moods, style=style, font=font, bg=bg,
                               start_override=(start if start >= 0 else None))
        with open(out, "rb") as f:
            data = f.read()
    except Exception as e:
        import traceback
        print("RENDER FAILED:", repr(e))
        traceback.print_exc()
        return Response(status_code=422, content=(f"render failed: {e}")[:200].encode(), media_type="text/plain")
    finally:
        for p in ([out] + ([audio_path] if audio_is_temp else [])):
            try:
                os.unlink(p)
            except OSError:
                pass

    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "-", (title or "promo")).strip("-") or "promo"
    return Response(
        content=data,
        media_type="video/mp4",
        headers={
            "X-Hook-Start": str(meta["hook_start"]),
            "X-Engine": meta.get("engine", "promo"),
            "Content-Disposition": f'attachment; filename="{safe_name}-promo.mp4"',
        },
    )

# Uploaded audio must survive engine redeploys/restarts, otherwise a later step
# (e.g. the lyric-video render) can't find the track's file_id. Store it on the
# mounted persistent volume in prod (/root/.cache is the Fly volume), falling
# back to a local ./uploads dir for dev where no volume exists.
_CACHE_ROOT = "/root/.cache"
if os.path.isdir(_CACHE_ROOT) and os.access(_CACHE_ROOT, os.W_OK):
    UPLOADS = os.path.join(_CACHE_ROOT, "uploads")
else:
    UPLOADS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOADS, exist_ok=True)


@app.post("/analyze")
@single_flight
def do_analyze(file: UploadFile = File(...), lyrics: str = Form("")):
    # plain def -> runs in the threadpool; librosa/CLAP won't block the loop
    suffix = os.path.splitext(file.filename or "")[1] or ".wav"
    # Keep the audio so the lyric-video engine can cut clips from it later.
    import uuid as _uuid
    file_id = _uuid.uuid4().hex[:12] + suffix
    path = os.path.join(UPLOADS, file_id)
    try:
        with open(path, "wb") as out:
            _copy_capped(file.file, out)
    except HTTPException:
        try: os.remove(path)
        except OSError: pass
        raise
    if os.path.getsize(path) == 0:
        try: os.remove(path)
        except OSError: pass
        return Response(status_code=400, content=b"empty audio file", media_type="text/plain")
    try:
        result = analyze(path, lyrics=lyrics, cache_key=file_id)
    except Exception as e:
        try: os.remove(path)
        except OSError: pass
        return Response(status_code=422, content=(f"could not read audio: {e}")[:280].encode(), media_type="text/plain")
    result["filename"] = file.filename
    result["file_id"] = file_id
    return result
