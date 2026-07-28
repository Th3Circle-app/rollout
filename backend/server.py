"""Rollout backend: vibe analysis, cover upscale, captions."""
import os, io, shutil, tempfile, urllib.request
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from analyze import analyze
from captions import generate_captions

app = FastAPI(title="Rollout API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    if req.b64:
        import base64 as _b64
        raw = _b64.b64decode(req.b64)
    else:
        r = urllib.request.Request(req.url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(r, timeout=180) as resp:
            raw = resp.read()
    img = Image.open(io.BytesIO(raw)).convert("RGB")
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
    from genimage import generate, platform_key
    key = req.key
    if req.provider == "platform":
        key = platform_key()
        if not key:
            return Response(status_code=402,
                            content=b"platform credits not live yet",
                            media_type="text/plain")
    try:
        data = generate(req.provider, req.prompt, key, req.seed,
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
    src = os.path.join(UPLOADS, os.path.basename(req.file_id))
    if not os.path.exists(src):
        return Response(status_code=404, content=b"unknown file_id")
    r = listen(src, mode=req.mode, bpm=req.bpm, lyrics=req.lyrics,
               cache_key=req.file_id)
    if not r:
        return Response(status_code=422, content=b"vibe engine unavailable")
    return r


class DetectReq(BaseModel):
    file_id: str


def _hook_clip_path(file_id: str):
    """Cut (and cache) the hook window of an uploaded track."""
    import librosa, soundfile as sf
    from lyricvideo import find_hook, CLIP_SEC
    src = os.path.join(UPLOADS, os.path.basename(file_id))
    if not os.path.exists(src):
        return None, 0.0
    clip_path = os.path.join(UPLOADS, f"hook_{os.path.basename(file_id)}.wav")
    meta_path = clip_path + ".json"
    import json as _json
    if os.path.exists(clip_path) and os.path.exists(meta_path):
        return clip_path, _json.load(open(meta_path))["hook_start"]
    y, sr = librosa.load(src, mono=True, sr=44100)
    start = find_hook(y, sr)
    sf.write(clip_path, y[int(start * sr): int((start + CLIP_SEC) * sr)], sr)
    _json.dump({"hook_start": round(start, 2)}, open(meta_path, "w"))
    return clip_path, round(start, 2)


@app.post("/detectlyrics")
def detectlyrics(req: DetectReq):
    """Auto-detect sung words in the hook with exact, silence-snapped timing.
    The editor lets the artist fix any misheard word before rendering."""
    from align import detect_words
    clip, hook_start = _hook_clip_path(req.file_id)
    if clip is None:
        return Response(status_code=404, content=b"unknown file_id")
    return {"hook_start": hook_start, "words": detect_words(clip)}


@app.get("/hookclip/{file_id}")
def hookclip(file_id: str):
    """Serve the hook audio so the artist can listen while correcting words."""
    clip, _ = _hook_clip_path(file_id)
    if clip is None:
        return Response(status_code=404, content=b"unknown file_id")
    with open(clip, "rb") as f:
        return Response(content=f.read(), media_type="audio/wav")


class CorrectReq(BaseModel):
    words: list[dict]
    lyrics: str


@app.post("/correctwords")
def correctwords(req: CorrectReq):
    """Map the artist's pasted lyrics onto the detected timing."""
    from align import correct_words
    return {"words": correct_words(req.words, req.lyrics)}


class RemoveBgReq(BaseModel):
    url: str = ""
    b64: str = ""  # user-uploaded photos arrive as bytes


_REMBG_SESSION = None


@app.post("/removebg")
def removebg(req: RemoveBgReq):
    """Cut the background off an image -> transparent PNG subject layer.
    Takes a generated-image URL or a user photo as base64."""
    global _REMBG_SESSION
    from rembg import remove, new_session
    if _REMBG_SESSION is None:
        _REMBG_SESSION = new_session("isnet-general-use")
    if req.b64:
        import base64 as _b64
        raw = _b64.b64decode(req.b64)
    else:
        r = urllib.request.Request(req.url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(r, timeout=180) as resp:
            raw = resp.read()
    out = remove(raw, session=_REMBG_SESSION)
    return Response(content=out, media_type="image/png")


class EssenceReq(BaseModel):
    b64: str


@app.post("/photoessence")
def photoessence(req: EssenceReq):
    """Extract the essence of a user photo: dominant palette + character words.
    Feeds 'Inspired by' mode — new art that FEELS like their photo."""
    import base64 as _b64
    img = Image.open(io.BytesIO(_b64.b64decode(req.b64))).convert("RGB")
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


@app.post("/captions")
def captions(req: CaptionReq):
    return generate_captions(
        title=req.title, artist=req.artist, moods=req.moods,
        keywords=req.keywords, date=req.date, link=req.link, lyrics=req.lyrics,
    )


@app.post("/lyricvideo")
async def lyric_video(
    lyrics: str = Form(...),
    title: str = Form(""),
    artist: str = Form(""),
    cover_url: str = Form(""),
    file_id: str = Form(""),
    words_json: str = Form(""),
    bg: str = Form("cover"),
    moods: str = Form(""),
    style: str = Form(""),
    file: UploadFile | None = File(None),
):
    """Render a 15s kinetic lyric video from the hook of the track."""
    from lyricvideo import make_lyric_video

    if file is not None and file.filename:
        suffix = os.path.splitext(file.filename)[1] or ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            audio_path = tmp.name
    elif file_id:
        audio_path = os.path.join(UPLOADS, os.path.basename(file_id))
        if not os.path.exists(audio_path):
            return Response(status_code=404, content=b"unknown file_id")
    else:
        return Response(status_code=400, content=b"no audio provided")

    out = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4").name
    # Premium engine first (aligned words + Remotion); beat-grid fallback.
    from lyricvideo import make_lyric_video_premium
    words_override = None
    if words_json:
        import json as _json
        try:
            words_override = _json.loads(words_json)
        except Exception:
            words_override = None
    try:
        meta = make_lyric_video_premium(
            audio_path, lyrics, cover_url, title, artist, out, words_override,
            bg=bg, moods=[m for m in moods.split(",") if m], style=style)
    except Exception as e:
        print("premium engine fell back:", e)
        meta = make_lyric_video(audio_path, lyrics, cover_url, title, artist, out)
    with open(out, "rb") as f:
        data = f.read()
    os.unlink(out)
    return Response(
        content=data,
        media_type="video/mp4",
        headers={
            "X-Hook-Start": str(meta["hook_start"]),
            "X-Bpm": str(meta["bpm"]),
            "X-Engine": meta.get("engine", "classic"),
            "Content-Disposition": f'attachment; filename="{(title or "clip").replace(" ", "-")}-lyric.mp4"',
        },
    )

UPLOADS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOADS, exist_ok=True)


@app.post("/analyze")
async def do_analyze(file: UploadFile = File(...), lyrics: str = Form("")):
    suffix = os.path.splitext(file.filename or "")[1] or ".wav"
    # Keep the audio so the lyric-video engine can cut clips from it later.
    import uuid as _uuid
    file_id = _uuid.uuid4().hex[:12] + suffix
    path = os.path.join(UPLOADS, file_id)
    with open(path, "wb") as out:
        shutil.copyfileobj(file.file, out)
    result = analyze(path, lyrics=lyrics, cache_key=file_id)
    result["filename"] = file.filename
    result["file_id"] = file_id
    return result
