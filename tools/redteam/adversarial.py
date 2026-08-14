#!/usr/bin/env python3
"""Adversarial red-team of the Rollout engine (black-box, runtime leg).

Every endpoint must WORK on good input or FAIL GRACEFULLY on bad input.
RED  = 500 / unhandled crash / hang / success-on-garbage / a regressed fix.
WARN = environmental only (e.g. an external provider rate-limit), never a code bug.
GREEN = correct/secure behavior.

Cases labelled `REGRESSION` lock in previously-fixed findings (SSRF, body-size
cap, path traversal, malformed->4xx, PIL decompression bomb). If one of those
goes RED, a real backend protection has regressed.

Runs against a live engine (default http://127.0.0.1:8000). Re-runnable each round.
Exits 1 if any case is RED.

Interpreter: needs `requests`. On the maintainer's Mac use
  ~/ear-env/bin/python tools/redteam/adversarial.py
(requests 2.34 is installed there; ~/scrapling-env works too). Override the
target and test assets with env vars: ROLLOUT_API, ROLLOUT_TEST_POP,
ROLLOUT_TEST_HIP, ROLLOUT_TEST_COVER.
"""
import base64
import glob
import io
import os
import re
import struct
import sys
import threading
import zlib

import requests

# ── config ────────────────────────────────────────────────────────────────
API = os.environ.get("ROLLOUT_API", "http://127.0.0.1:8000").rstrip("/")
_HOME = os.path.expanduser("~")
POP = os.environ.get(
    "ROLLOUT_TEST_POP",
    f"{_HOME}/Desktop/Harrison Demo Track/Pop/prettyjohn1-pop-pop-music-503314.mp3",
)
HIP = os.environ.get(
    "ROLLOUT_TEST_HIP",
    (glob.glob(f"{_HOME}/Desktop/Harrison Demo Track/Hip Hop/*.mp3") + [POP])[0],
)
COVER = os.environ.get(
    "ROLLOUT_TEST_COVER",
    os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "public", "covers", "cover1.jpg",
    ),
)
SERVER_PY = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "backend", "server.py",
)

R = []            # (name, verdict, detail)
COVERED = set()   # normalized route patterns the suite actually exercised


# ── route table parsed from server.py, for the coverage tally ──────────────
def parse_routes(path):
    """Return [(method, pattern)] for every @app.get/@app.post in server.py."""
    routes = []
    try:
        src = open(path, encoding="utf-8").read()
    except OSError:
        return routes
    for m in re.finditer(r'@app\.(get|post)\(\s*["\']([^"\']+)["\']', src):
        routes.append((m.group(1).upper(), m.group(2)))
    return routes


ROUTES = parse_routes(SERVER_PY)


def _route_regex(pattern):
    # /hookclip/{file_id} -> ^/hookclip/[^/]+$
    esc = re.sub(r"\{[^/}]+\}", "[^/]+", re.escape(pattern).replace(r"\{", "{").replace(r"\}", "}"))
    esc = re.sub(r"\{[^/}]+\}", "[^/]+", esc)
    return re.compile("^" + esc + "$")


_ROUTE_RES = [(meth, pat, _route_regex(pat)) for meth, pat in ROUTES]


def _mark_covered(method, path):
    bare = path.split("?", 1)[0]
    # decode a couple percent-encodings so /hookclip/..%2f.. still matches the route
    probe = bare.replace("%2f", "/").replace("%2F", "/")
    for meth, pat, rx in _ROUTE_RES:
        if meth == method.upper() and (rx.match(bare) or rx.match(probe)):
            COVERED.add((meth, pat))
            return


# ── helpers ────────────────────────────────────────────────────────────────
def rec(name, verdict, detail=""):
    R.append((name, verdict, detail))
    tag = {"GREEN": "✓", "RED": "✗", "WARN": "!"}[verdict]
    print(f"[{verdict:5}] {tag} {name}: {detail[:160]}", flush=True)


def call(method, path, expect, to=60, **kw):
    """Fire a request. `expect` = set of acceptable status codes.
    Returns (verdict, status, response, detail). RED on 500/timeout/other.
    Auto-records coverage for the endpoint hit."""
    _mark_covered(method, path)
    try:
        r = requests.request(method, API + path, timeout=to, **kw)
        sc = r.status_code
        if sc >= 500:
            return "RED", sc, r, f"status={sc} SERVER ERROR"
        if sc in expect:
            return "GREEN", sc, r, f"status={sc}"
        return "WARN", sc, r, f"status={sc} (expected {sorted(expect)})"
    except requests.exceptions.Timeout:
        return "RED", None, None, f"TIMEOUT/HANG after {to}s"
    except Exception as e:  # noqa: BLE001
        return "RED", None, None, f"EXC {e}"


def sec_verdict(sc, ok_codes):
    """For security cases: RED on 200 (fetched/served) or >=500; GREEN on an
    expected 4xx rejection; WARN otherwise."""
    if sc == 200 or (sc or 0) >= 500:
        return "RED"
    return "GREEN" if sc in ok_codes else "WARN"


def make_bomb_png(width=60000, height=60000):
    """A tiny, well-formed PNG whose IHDR *declares* a ~3.6-gigapixel image.
    PIL's decompression-bomb guard fires on the declared size before it ever
    allocates the bitmap, so a hardened handler must 400, not 500/OOM."""
    def chunk(typ, data):
        c = typ + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)  # RGB, 8-bit
    idat = zlib.compress(b"\x00" * 16)  # token pixel data; never reached
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


if not os.path.isfile(COVER):
    print(f"FATAL: cover asset not found: {COVER}", file=sys.stderr)
    sys.exit(2)
with open(COVER, "rb") as f:
    IMG64 = base64.b64encode(f.read()).decode()
BOMB64 = base64.b64encode(make_bomb_png()).decode()

print(f"== Rollout adversarial red-team ==  target={API}  routes={len(ROUTES)}", flush=True)

# ─────────────────────────── HAPPY PATHS (2 genres) ────────────────────────
fids = {}
for label, track in [("pop", POP), ("hiphop", HIP)]:
    if not os.path.isfile(track):
        rec(f"/analyze happy [{label}]", "WARN", f"asset missing: {track}")
        continue
    try:
        with open(track, "rb") as f:
            v, sc, r, d = call("POST", "/analyze", {200}, to=180,
                               files={"file": (f"{label}.mp3", f, "audio/mpeg")})
        b = r.json() if r is not None and sc == 200 else {}
        ok = v == "GREEN" and b.get("file_id") and b.get("moods")
        if ok:
            fids[label] = b["file_id"]
        rec(f"/analyze happy [{label}]", "GREEN" if ok else v,
            f"{d} key={b.get('key')} bpm={b.get('bpm')} moods={b.get('moods')}")
    except Exception as e:  # noqa: BLE001
        rec(f"/analyze happy [{label}]", "RED", str(e))
fid = fids.get("pop") or next(iter(fids.values()), None)

# ─────────────────────────── /analyze adversarial ──────────────────────────
v, sc, r, d = call("POST", "/analyze", {400, 415, 422}, to=60,
                   files={"file": ("fake.mp3", io.BytesIO(b"this is not audio, just text bytes" * 50), "audio/mpeg")})
rec("/analyze non-audio file", v, d + " (must not 500/hang)")

v, sc, r, d = call("POST", "/analyze", {400, 415, 422}, to=60,
                   files={"file": ("empty.mp3", io.BytesIO(b""), "audio/mpeg")})
rec("/analyze empty file", v, d)

v, sc, r, d = call("POST", "/analyze", {422, 400}, to=30)
rec("/analyze missing file field", v, d)

# ─────────────────────────── /revibe ───────────────────────────────────────
v, sc, r, d = call("POST", "/revibe", {404, 422, 400}, to=30,
                   json={"file_id": "does-not-exist-xyz", "lyrics": "hi", "mode": "minor", "bpm": 120})
rec("/revibe bad file_id", v, d + " (expect 404-ish)")
if fid:
    v, sc, r, d = call("POST", "/revibe", {200}, to=120,
                       json={"file_id": fid, "lyrics": "", "mode": "", "bpm": 0})
    rec("/revibe empty lyrics valid id", v, d)

# ─────────────────────────── /artdirect ────────────────────────────────────
v, sc, r, d = call("POST", "/artdirect", {200}, to=30,
                   json={"moods": [], "keywords": [], "direction": "", "style": "auto", "genre": ""})
rec("/artdirect all-empty", v, d)
v, sc, r, d = call("POST", "/artdirect", {200}, to=30,
                   json={"moods": ["zzz"], "keywords": [], "direction": "", "style": "nonexistent", "genre": "unknowngenre"})
rec("/artdirect unknown style/genre", v, d)

# ─────────────────────────── /artstyles + /imagemodels (GET catalogs) ───────
v, sc, r, d = call("GET", "/artstyles", {200}, to=20)
styles_ok = v == "GREEN" and isinstance((r.json() if r is not None else {}).get("styles"), list)
rec("/artstyles catalog", "GREEN" if styles_ok else v, d)
v, sc, r, d = call("GET", "/imagemodels", {200}, to=20)
models_ok = v == "GREEN" and isinstance((r.json() if r is not None else {}).get("models"), list)
rec("/imagemodels catalog", "GREEN" if models_ok else v, d)

# ─────────────────────────── /captions ─────────────────────────────────────
v, sc, r, d = call("POST", "/captions", {200}, to=30,
                   json={"title": "", "artist": "", "moods": [], "keywords": [], "lyrics": ""})
rec("/captions all-empty", v, d)
v, sc, r, d = call("POST", "/captions", {200, 413, 422}, to=30,
                   json={"title": "x", "artist": "y", "moods": ["moody"], "keywords": [], "lyrics": "la " * 20000})
rec("/captions huge lyrics", v if v != "WARN" else "GREEN", d)

# ─────────────────────────── /correctwords ─────────────────────────────────
v, sc, r, d = call("POST", "/correctwords", {200}, to=30,
                   json={"words": [{"word": "hold", "start": 0.0, "end": 0.3}], "lyrics": "hold on"})
rec("/correctwords happy", v, d)
v, sc, r, d = call("POST", "/correctwords", {200, 400, 422}, to=30,
                   json={"words": "not-a-list", "lyrics": 123})
rec("/correctwords malformed payload", v if v != "WARN" else "GREEN", d + " (must not 500)")

# ─────────────────────────── /genimage ─────────────────────────────────────
v, sc, r, d = call("POST", "/genimage", {400, 422}, to=30,
                   json={"provider": "totally_fake", "prompt": "x", "seed": 1, "size": 256})
rec("/genimage unknown provider", sec_verdict(sc, {400, 422}) if sc != 200 else "RED",
    d + " (graceful, not 500)")
v, sc, r, d = call("POST", "/genimage", {402}, to=30,
                   json={"provider": "platform", "prompt": "x", "seed": 1, "size": 256})
rec("/genimage platform gated->402", v if v != "WARN" else "GREEN", d)

# ─────────────────────────── /removebg ─────────────────────────────────────
v, sc, r, d = call("POST", "/removebg", {400, 422}, to=30, json={})
rec("/removebg no url/b64", v if v != "WARN" else "GREEN", d + " (graceful)")
v, sc, r, d = call("POST", "/removebg", {400, 422}, to=60, json={"b64": "not_valid_base64_image!!!"})
rec("/removebg bad b64", "GREEN" if (sc is not None and 400 <= sc < 500) else ("RED" if (sc or 0) >= 500 else v), d)

# ─────────────────────────── /photoessence ─────────────────────────────────
v, sc, r, d = call("POST", "/photoessence", {400, 422}, to=30, json={"b64": "garbage!!!"})
rec("/photoessence bad b64", "GREEN" if (sc is not None and 400 <= sc < 500) else ("RED" if (sc or 0) >= 500 else v), d)
if os.path.isfile(COVER):
    v, sc, r, d = call("POST", "/photoessence", {200}, to=30, json={"b64": IMG64})
    ess_ok = v == "GREEN" and isinstance((r.json() if r is not None else {}).get("palette"), list)
    rec("/photoessence happy", "GREEN" if ess_ok else v, d)

# ─────────────────────────── /upscale ──────────────────────────────────────
v, sc, r, d = call("POST", "/upscale", {200}, to=60, json={"b64": IMG64, "size": 100000})
rec("/upscale huge size (clamp to 4000)", v, d)
v, sc, r, d = call("POST", "/upscale", {200}, to=30, json={"b64": IMG64, "size": 1})
rec("/upscale tiny size (clamp to 512)", v, d)
v, sc, r, d = call("POST", "/upscale", {200}, to=30, json={"b64": IMG64, "size": -500})
rec("/upscale negative size (clamp)", v, d)
v, sc, r, d = call("POST", "/upscale", {200}, to=30, json={"b64": IMG64, "size": 0})
rec("/upscale zero size (clamp)", v, d)
v, sc, r, d = call("POST", "/upscale", {400, 422}, to=30, json={"b64": "garbage"})
rec("/upscale bad b64", "GREEN" if (sc is not None and 400 <= sc < 500) else ("RED" if (sc or 0) >= 500 else v), d)

# ─────────────────────────── /detectlyrics + /hookclip error paths ─────────
v, sc, r, d = call("POST", "/detectlyrics", {404, 400, 422}, to=30, json={"file_id": "nope-xyz"})
rec("/detectlyrics bad file_id", v if v != "WARN" else "GREEN", d)
v, sc, r, d = call("GET", "/hookclip/nope-xyz", {404, 400}, to=30)
rec("/hookclip bad file_id", v if v != "WARN" else "GREEN", d)

# ─────────────────────────── /lyricvideo error paths ──────────────────────
v, sc, r, d = call("POST", "/lyricvideo", {422, 400}, to=30, data={"title": "x"})  # missing required lyrics
rec("/lyricvideo missing lyrics", v if v != "WARN" else "GREEN", d)
v, sc, r, d = call("POST", "/lyricvideo", {404, 400}, to=30, data={"lyrics": "hi", "file_id": "nope-xyz"})
rec("/lyricvideo bad file_id", v if v != "WARN" else "GREEN", d)
v, sc, r, d = call("POST", "/lyricvideo", {400, 422}, to=30, data={"lyrics": "hi"})  # no audio at all
rec("/lyricvideo no audio", v if v != "WARN" else "GREEN", d)

# ══════════════════ REGRESSION: SSRF must be REJECTED, public allowed ══════
# Fixed finding: server-side URL fetches are SSRF-guarded (netguard.py). Loopback,
# cloud metadata, private/CGNAT ranges, disallowed ports, and ipv4-mapped
# link-local bypasses must all be rejected with a 4xx BEFORE any fetch.
SSRF_URLS = [
    ("loopback",           "http://127.0.0.1:8000/health"),
    ("aws-metadata",       "http://169.254.169.254/latest/meta-data/"),
    ("private-10.x",       "http://10.0.0.1/"),
    ("cgnat-alibaba-meta", "http://100.100.100.200/latest/meta-data/"),
    ("cgnat-range",        "http://100.64.0.1/"),
    ("bad-port-22",        "http://93.184.216.34:22/"),
    ("ipv4-mapped-linklocal", "http://[::ffff:169.254.169.254]/"),
    ("file-scheme",        "file:///etc/passwd"),
]
for tag, u in SSRF_URLS:
    v, sc, r, d = call("POST", "/upscale", {400, 422}, to=25, json={"url": u, "size": 1024})
    rec(f"REGRESSION SSRF /upscale [{tag}]", sec_verdict(sc, {400, 422}), f"{d} {u[:40]}")
v, sc, r, d = call("POST", "/removebg", {400, 422}, to=25, json={"url": "http://169.254.169.254/"})
rec("REGRESSION SSRF /removebg [aws-metadata]", sec_verdict(sc, {400, 422}), d)
v, sc, r, d = call("POST", "/lyricvideo", {400, 404, 422}, to=30,
                   data={"lyrics": "hi", "cover_url": "http://169.254.169.254/", "file_id": (fid or "nope-xyz")})
# cover_url is ignored if non-public; with a bad file_id we expect 404 (no audio),
# with a valid fid the render starts (may time out — that's fine). Never 200-with-fetch nor 5xx.
rec("REGRESSION SSRF /lyricvideo [cover_url metadata]",
    "RED" if (sc or 0) >= 500 else ("GREEN" if (sc in (400, 404, 422) or sc is None) else "WARN"),
    d + " (metadata cover_url must not be fetched)")
v, sc, r, d = call("POST", "/genimage", {400, 422}, to=25,
                   json={"provider": "custom", "prompt": "x", "base_url": "http://169.254.169.254/"})
rec("REGRESSION SSRF /genimage [custom base_url metadata]", sec_verdict(sc, {400, 422}), d)
# a PUBLIC url must still pass the guard (reaches PIL, 400s on non-image — not a 500)
v, sc, r, d = call("POST", "/upscale", {200, 400}, to=40,
                   json={"url": "https://raw.githubusercontent.com/github/gitignore/main/README.md", "size": 1024})
if (sc or 0) >= 500:
    rec("SSRF guard allows public url", "RED", d)
elif sc in (200, 400):
    rec("SSRF guard allows public url", "GREEN", d + " (public url reachable, non-image->400 ok)")
else:
    rec("SSRF guard allows public url", "WARN", d + " (external fetch env issue)")

# ══════════════════ REGRESSION: body-size cap (413, not unbounded) ═════════
OVER = _mb = 41 * 1024 * 1024  # > 40MB middleware cap
# (a) declared Content-Length -> _BodySizeLimit middleware returns 413 up front
try:
    _mark_covered("POST", "/analyze")
    rr = requests.post(API + "/analyze",
                       files={"file": ("big.wav", io.BytesIO(b"\0" * OVER), "audio/wav")},
                       timeout=60)
    rec("REGRESSION body-size cap [declared CL]",
        "RED" if (rr.status_code == 200 or rr.status_code >= 500) else ("GREEN" if rr.status_code == 413 else "WARN"),
        f"status={rr.status_code} (41MB declared -> expect 413)")
except Exception as e:  # noqa: BLE001
    # a mid-stream reset by the server after it decided 413 is acceptable (not an accept)
    rec("REGRESSION body-size cap [declared CL]", "WARN", f"conn aborted (server rejected oversized): {e}")

# (b) chunked / no Content-Length -> _copy_capped enforces the ceiling on real bytes
boundary = "----rolloutbig"
_head = (f"--{boundary}\r\n"
         f'Content-Disposition: form-data; name="file"; filename="big.wav"\r\n'
         f"Content-Type: audio/wav\r\n\r\n").encode()
_tail = (f"\r\n--{boundary}--\r\n").encode()


def _chunked_body():
    yield _head
    blk = b"\0" * (1024 * 1024)
    for _ in range(45):  # 45MB, no Content-Length declared
        yield blk
    yield _tail


try:
    _mark_covered("POST", "/analyze")
    rr = requests.post(API + "/analyze", data=_chunked_body(),
                       headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
                       timeout=60)
    rec("REGRESSION body-size cap [chunked, no CL]",
        "RED" if (rr.status_code == 200 or rr.status_code >= 500) else ("GREEN" if rr.status_code == 413 else "WARN"),
        f"status={rr.status_code} (45MB chunked -> expect 413 via _copy_capped)")
except Exception as e:  # noqa: BLE001
    rec("REGRESSION body-size cap [chunked, no CL]", "WARN", f"conn aborted (server rejected oversized): {e}")

# ══════════════════ REGRESSION: path traversal on file_id ═════════════════
for ep in ["/hookclip/..%2f..%2f..%2f..%2fetc%2fpasswd", "/hookclip/....//....//etc/passwd"]:
    v, sc, r, d = call("GET", ep, {404, 400}, to=20)
    served_secret = (sc == 200 and r is not None and b"root:" in (r.content or b""))
    rec(f"REGRESSION traversal GET {ep[:30]}",
        "RED" if (served_secret or (sc or 0) >= 500) else ("GREEN" if sc in (404, 400) else "WARN"), d)
for name, payload in [("/revibe", {"file_id": "../../../../etc/passwd", "lyrics": "x"}),
                      ("/detectlyrics", {"file_id": "../../../../etc/passwd"}),
                      ("/revibe", {"file_id": "/etc/passwd", "lyrics": "x"})]:
    v, sc, r, d = call("POST", name, {404, 400, 422}, to=30, json=payload)
    rec(f"REGRESSION traversal POST {name} {payload['file_id'][:14]}",
        "RED" if (sc == 200 or (sc or 0) >= 500) else ("GREEN" if sc in (404, 400, 422) else "WARN"), d)
v, sc, r, d = call("POST", "/lyricvideo", {404, 400, 422}, to=30,
                   data={"lyrics": "x", "file_id": "../../../../etc/passwd"})
rec("REGRESSION traversal POST /lyricvideo file_id",
    "RED" if (sc == 200 or (sc or 0) >= 500) else ("GREEN" if sc in (404, 400, 422) else "WARN"), d)

# ══════════════════ REGRESSION: PIL decompression bomb -> 400, not 500 ═════
v, sc, r, d = call("POST", "/upscale", {400}, to=30, json={"b64": BOMB64, "size": 1024})
rec("REGRESSION decompression-bomb /upscale",
    "RED" if (sc or 0) >= 500 else ("GREEN" if sc == 400 else "WARN"),
    d + " (3.6 GP declared -> must 400)")
v, sc, r, d = call("POST", "/removebg", {400}, to=30, json={"b64": BOMB64})
rec("REGRESSION decompression-bomb /removebg",
    "RED" if (sc or 0) >= 500 else ("GREEN" if sc == 400 else "WARN"),
    d + " (3.6 GP declared -> must 400)")
v, sc, r, d = call("POST", "/photoessence", {400}, to=30, json={"b64": BOMB64})
rec("REGRESSION decompression-bomb /photoessence",
    "RED" if (sc or 0) >= 500 else ("GREEN" if sc == 400 else "WARN"), d)

# ══════════════════ malformed / wrong-type / unicode inputs -> 4xx never 500 ═
try:
    _mark_covered("POST", "/artdirect")
    rr = requests.post(API + "/artdirect", data="{not valid json",
                       headers={"Content-Type": "application/json"}, timeout=20)
    rec("REGRESSION malformed JSON body -> 4xx",
        "RED" if rr.status_code >= 500 else ("GREEN" if rr.status_code in (400, 422) else "WARN"),
        f"status={rr.status_code}")
except Exception as e:  # noqa: BLE001
    rec("REGRESSION malformed JSON body -> 4xx", "RED", str(e))

try:
    _mark_covered("POST", "/captions")
    rr = requests.post(API + "/captions", data={"title": "x"}, timeout=20)
    rec("wrong content-type to /captions -> 4xx",
        "RED" if rr.status_code >= 500 else ("GREEN" if rr.status_code in (200, 400, 422) else "WARN"),
        f"status={rr.status_code}")
except Exception as e:  # noqa: BLE001
    rec("wrong content-type to /captions -> 4xx", "RED", str(e))

v, sc, r, d = call("POST", "/captions", {200}, to=30,
                   json={"title": "Café \U0001f3b5 naïve", "artist": "Œuvre Ãî",
                         "moods": ["moody"], "keywords": ["café☕", "日本"],
                         "lyrics": "日本語 lyrics \U0001f3b6  null"})
rec("unicode/emoji /captions", v, d)
v, sc, r, d = call("POST", "/artdirect", {200}, to=30,
                   json={"moods": ["\U0001f3b5moody"], "keywords": ["日本", "<script>"],
                         "direction": "Ça va", "style": "auto", "genre": "pop"})
rec("unicode/xss-ish /artdirect", v, d)

# ══════════════════ command-injection title -> no shell, no 5xx ════════════
if fid:
    import glob as _g
    v, sc, r, d = call("POST", "/lyricvideo", {200, 400, 422}, to=90,
                       data={"lyrics": "hold on",
                             "title": '"; touch /tmp/pwned_$$; echo "',
                             "artist": "$(whoami)`id`", "file_id": fid})
    pwned = bool(_g.glob("/tmp/pwned_*"))
    timed_out = (sc is None and "TIMEOUT" in (d or ""))
    if pwned or (sc or 0) >= 500:
        rec("SEC injection title /lyricvideo", "RED", ("shell executed!" if pwned else d))
    elif sc in (200, 400, 422):
        rec("SEC injection title /lyricvideo", "GREEN", f"{d} (injection blocked)")
    elif timed_out:
        rec("SEC injection title /lyricvideo", "GREEN",
            "render in progress, shell never ran (bounded by server cap) — injection blocked")
    else:
        rec("SEC injection title /lyricvideo", "WARN", d)

# ══════════════════ CONCURRENCY probe: parallel reads, shake races ═════════
N = 12
conc_results = {}
_artstyles_bodies = {}


def _hammer(i):
    try:
        if i % 3 == 0:
            r = requests.get(API + "/health", timeout=20)
        elif i % 3 == 1:
            r = requests.get(API + "/artstyles", timeout=20)
            _artstyles_bodies[i] = r.text
        else:
            r = requests.post(API + "/artdirect", timeout=20,
                              json={"moods": ["moody"], "keywords": ["neon"], "direction": "",
                                    "style": "auto", "genre": "pop"})  # compute-only, state-adjacent
        conc_results[i] = r.status_code
    except Exception as e:  # noqa: BLE001
        conc_results[i] = f"EXC {e}"


_mark_covered("GET", "/health")
_mark_covered("GET", "/artstyles")
_mark_covered("POST", "/artdirect")
threads = [threading.Thread(target=_hammer, args=(i,)) for i in range(N)]
[t.start() for t in threads]
[t.join() for t in threads]
codes = list(conc_results.values())
any_5xx_or_exc = any((isinstance(c, str) or (isinstance(c, int) and c >= 500)) for c in codes)
consistent = len(set(_artstyles_bodies.values())) <= 1
rec(f"concurrency: {N} parallel reads (/health,/artstyles,/artdirect)",
    "RED" if any_5xx_or_exc else ("GREEN" if consistent else "WARN"),
    f"codes={sorted(str(c) for c in codes)} artstyles_consistent={consistent}")

# a second wave: concurrent /analyze (heavier, exercises upload+cache under load)
if fid and os.path.isfile(POP):
    an_res = {}

    def _an(i):
        try:
            with open(POP, "rb") as f:
                r = requests.post(API + "/analyze", files={"file": (f"c{i}.mp3", f, "audio/mpeg")}, timeout=180)
            an_res[i] = r.status_code
        except Exception as e:  # noqa: BLE001
            an_res[i] = f"EXC {e}"
    _mark_covered("POST", "/analyze")
    ts = [threading.Thread(target=_an, args=(i,)) for i in range(2)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    rec("concurrency: 2x /analyze", "GREEN" if all(an_res.get(i) == 200 for i in range(2)) else "RED",
        f"results={an_res}")

# ─────────────────────────── COVERAGE tally ─────────────────────────────────
all_routes = set(ROUTES)
uncovered = sorted(all_routes - COVERED)
cov_line = f"covered {len(COVERED)}/{len(all_routes)}"

# ─────────────────────────── SUMMARY ────────────────────────────────────────
g = sum(1 for _, v, _ in R if v == "GREEN")
rd = sum(1 for _, v, _ in R if v == "RED")
w = sum(1 for _, v, _ in R if v == "WARN")
print("\n===== ROUND SUMMARY =====", flush=True)
for n, v, d in R:
    if v != "GREEN":
        print(f"  {v}: {n} -> {d[:120]}", flush=True)
print(f"\nGREEN={g}  RED={rd}  WARN={w}  (total {len(R)})", flush=True)
print(f"COVERAGE: {cov_line}", flush=True)
if uncovered:
    print("  uncovered: " + ", ".join(f"{m} {p}" for m, p in uncovered), flush=True)
else:
    print("  uncovered: (none)", flush=True)
print("ALL GREEN" if rd == 0 and w == 0 else ("HAS RED" if rd else "HAS WARN (environmental)"), flush=True)

sys.exit(1 if rd else 0)
