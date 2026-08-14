#!/usr/bin/env python3
"""Visual render-correctness red-team for Rollout.

The existing frontend suite (redteam/frontend_pages.py) is a LIVENESS check: it
proves the page mounted without throwing and printed some text. It went GREEN
while the entire hero rendered flat white, because "no console error" says
nothing about pixels. This suite closes that gap by looking at the actual
rendered frame:

  (a) FLAT-FRAME / WHITE-OUT DETECTOR (the real teeth): screenshot each route,
      downsample, find the dominant quantized color, and measure what fraction
      of pixels sit within delta<=12 (all channels) of it. If >90% of the frame
      is one color, the page rendered as a flat wash -> FAIL. This catches an
      all-white hero AND a blank-black one, regardless of console state.
  (b) CANVAS PRESENCE: the WebGL/2D canvas layers that make Rollout look alive
      must actually be in the DOM. A route that silently loses its canvas layer
      is a regression even if the frame isn't flat.
  (c) PAGE / CONSOLE ERRORS: kept as a secondary signal only.

Run:   ~/scrapling-env/bin/python tools/redteam/visual.py [BASE_URL]
Self:  ~/scrapling-env/bin/python tools/redteam/visual.py --selftest
Exit code 1 if any route FAILs (or if --selftest's synthetic white frame is
NOT caught, which would prove the detector has no teeth).
"""
import base64
import io
import sys
import time
import zlib
from collections import Counter

# ---- Flat-frame detector (pixel logic, shared by routes AND --selftest) -------

FLAT_THRESHOLD = 0.90   # >90% of pixels near one color == flat wash == FAIL
COLOR_DELTA = 12        # per-channel tolerance for "same color as dominant"
DS_W, DS_H = 64, 40     # downsample target (small + fast, still representative)


def _decode_png(png_bytes):
    """Return (width, height, list-of-(r,g,b)). Prefer Pillow; fall back to a
    minimal pure-python PNG decoder so the check works even without Pillow."""
    try:
        from PIL import Image  # Pillow from ~/scrapling-env if available
        im = Image.open(io.BytesIO(png_bytes)).convert("RGB")
        raw = im.tobytes()
        pixels = [(raw[i], raw[i + 1], raw[i + 2]) for i in range(0, len(raw), 3)]
        return im.width, im.height, pixels
    except Exception:
        return _decode_png_raw(png_bytes)


def _decode_png_raw(data):
    """Minimal PNG decoder: 8-bit truecolor/truecolor+alpha, no interlace.
    Enough to read a chromium screenshot when Pillow is unavailable."""
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    pos = 8
    width = height = bit_depth = color_type = None
    idat = bytearray()
    while pos < len(data):
        length = int.from_bytes(data[pos:pos + 4], "big"); pos += 4
        ctype = data[pos:pos + 4]; pos += 4
        chunk = data[pos:pos + length]; pos += length
        pos += 4  # skip CRC
        if ctype == b"IHDR":
            width = int.from_bytes(chunk[0:4], "big")
            height = int.from_bytes(chunk[4:8], "big")
            bit_depth = chunk[8]
            color_type = chunk[9]
            if chunk[12] != 0:
                raise ValueError("interlaced PNG unsupported in raw decoder")
        elif ctype == b"IDAT":
            idat += chunk
        elif ctype == b"IEND":
            break
    if bit_depth != 8 or color_type not in (2, 6):
        raise ValueError(f"unsupported PNG (depth={bit_depth}, color_type={color_type})")
    channels = 3 if color_type == 2 else 4
    raw = zlib.decompress(bytes(idat))
    stride = width * channels
    pixels = []
    prev = bytearray(stride)
    p = 0
    for _ in range(height):
        ftype = raw[p]; p += 1
        line = bytearray(raw[p:p + stride]); p += stride
        for i in range(stride):
            a = line[i - channels] if i >= channels else 0
            b = prev[i]
            c = prev[i - channels] if i >= channels else 0
            x = line[i]
            if ftype == 0:
                v = x
            elif ftype == 1:
                v = x + a
            elif ftype == 2:
                v = x + b
            elif ftype == 3:
                v = x + ((a + b) >> 1)
            elif ftype == 4:
                pp = a + b - c
                pa, pb, pc = abs(pp - a), abs(pp - b), abs(pp - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                v = x + pr
            else:
                raise ValueError(f"bad filter {ftype}")
            line[i] = v & 0xFF
        prev = line
        for i in range(0, stride, channels):
            pixels.append((line[i], line[i + 1], line[i + 2]))
    return width, height, pixels


def _downsample(width, height, pixels, tw, th):
    """Box-ish downsample by nearest sampling on a grid (no numpy needed)."""
    if width == tw and height == th:
        return pixels
    out = []
    for gy in range(th):
        sy = min(height - 1, gy * height // th)
        base = sy * width
        for gx in range(tw):
            sx = min(width - 1, gx * width // tw)
            out.append(pixels[base + sx])
    return out


def flat_frame_stats(png_bytes):
    """Core detector. Returns (is_flat, fraction, dominant_rgb)."""
    w, h, pixels = _decode_png(png_bytes)
    small = _downsample(w, h, pixels, DS_W, DS_H)
    # Quantize into 16-value buckets to find the dominant region robustly.
    buckets = [(r >> 4, g >> 4, b >> 4) for (r, g, b) in small]
    dom_bucket, _ = Counter(buckets).most_common(1)[0]
    members = [small[i] for i, qb in enumerate(buckets) if qb == dom_bucket]
    n = len(members)
    dom = (
        sum(m[0] for m in members) // n,
        sum(m[1] for m in members) // n,
        sum(m[2] for m in members) // n,
    )
    within = sum(
        1 for (r, g, b) in small
        if abs(r - dom[0]) <= COLOR_DELTA
        and abs(g - dom[1]) <= COLOR_DELTA
        and abs(b - dom[2]) <= COLOR_DELTA
    )
    frac = within / len(small)
    return frac > FLAT_THRESHOLD, frac, dom


# ---- Self-test: prove the detector actually catches a white-out --------------

def _make_solid_png(rgb, w=200, h=120):
    """Build a solid-color PNG in-memory (Pillow if present, else hand-rolled)."""
    try:
        from PIL import Image
        return _img_to_png(Image.new("RGB", (w, h), rgb))
    except Exception:
        pass
    # Hand-rolled: one filter byte (0) per scanline + raw RGB.
    stride = w * 3
    raw = bytearray()
    row = bytes(rgb) * w
    for _ in range(h):
        raw.append(0)
        raw += row
    comp = zlib.compress(bytes(raw), 9)

    def chunk(tag, payload):
        out = len(payload).to_bytes(4, "big") + tag + payload
        return out + zlib.crc32(tag + payload).to_bytes(4, "big")

    ihdr = w.to_bytes(4, "big") + h.to_bytes(4, "big") + bytes([8, 2, 0, 0, 0])
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", comp) + chunk(b"IEND", b""))


def _img_to_png(im):
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def selftest():
    print("===== VISUAL DETECTOR SELF-TEST =====", flush=True)
    ok = True

    white = _make_solid_png((255, 255, 255))
    is_flat, frac, dom = flat_frame_stats(white)
    verdict = "FAIL(as-expected)" if is_flat else "PASS(WRONG!)"
    print(f"[white  ] flat={is_flat} frac={frac:.3f} dom={dom} -> {verdict}", flush=True)
    if not is_flat:
        ok = False

    black = _make_solid_png((0, 0, 0))
    is_flat_b, frac_b, dom_b = flat_frame_stats(black)
    print(f"[black  ] flat={is_flat_b} frac={frac_b:.3f} dom={dom_b} -> "
          f"{'FAIL(as-expected)' if is_flat_b else 'PASS(WRONG!)'}", flush=True)
    if not is_flat_b:
        ok = False

    # A non-flat control MUST pass, or the detector is trigger-happy.
    try:
        from PIL import Image
        grad = Image.new("RGB", (200, 120))
        px = grad.load()
        for y in range(120):
            for x in range(200):
                px[x, y] = (x % 256, y * 2 % 256, (x + y) % 256)
        varied = _img_to_png(grad)
    except Exception:
        # hand-rolled checkerboard
        w = h = 120
        stride = w * 3
        raw = bytearray()
        for y in range(h):
            raw.append(0)
            for x in range(w):
                c = (255, 255, 255) if (x // 8 + y // 8) % 2 else (10, 12, 30)
                raw += bytes(c)
        comp = zlib.compress(bytes(raw), 9)

        def chunk(tag, payload):
            return (len(payload).to_bytes(4, "big") + tag + payload
                    + zlib.crc32(tag + payload).to_bytes(4, "big"))
        ihdr = w.to_bytes(4, "big") + h.to_bytes(4, "big") + bytes([8, 2, 0, 0, 0])
        varied = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
                  + chunk(b"IDAT", comp) + chunk(b"IEND", b""))
    is_flat_v, frac_v, dom_v = flat_frame_stats(varied)
    print(f"[varied ] flat={is_flat_v} frac={frac_v:.3f} dom={dom_v} -> "
          f"{'PASS(as-expected)' if not is_flat_v else 'FAIL(WRONG!)'}", flush=True)
    if is_flat_v:
        ok = False

    print("\nSELF-TEST " + ("PASSED — detector has teeth (catches white-out, "
          "clears varied frames)" if ok else "FAILED — detector is broken"),
          flush=True)
    return 0 if ok else 1


# ---- Live routes -------------------------------------------------------------

# Each route: label, path, and the MINIMUM number of <canvas> layers we expect.
# Rollout renders its ambient background (GlassBackground + SmokeField +
# StarField) behind every studio screen, so a route dropping to 0 canvases means
# the WebGL/2D layer failed to mount — a real regression. We report the actual
# count and only FAIL on a shortfall (lenient min avoids false alarms while still
# catching a lost canvas layer).
ROUTES = [
    ("hero",   "/",               1),
    ("studio", "/?page=Dashboard", 1),
    ("cover",  "/?page=Cover",     1),
]

IGNORE = ("THREE.Clock", "ReadPixels", "GL Driver", "deprecated",
          "Download the React DevTools", "prefers-color", "webglcontextlost",
          "Failed to load resource")

SETTLE_SECONDS = 8  # let WebGL/canvas paint before we judge the frame


def run_routes(base, routes=ROUTES):
    from playwright.sync_api import sync_playwright

    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--use-gl=angle", "--use-angle=swiftshader",
                  "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
        )
        for label, path, min_canvas in routes:
            # An absolute http(s) path is used verbatim (e.g. the cloud landing on
            # :5173, where a fresh no-session context shows the real marketing hero
            # — the exact surface that once whited out); otherwise base + path.
            url = path if path.startswith("http") else f"{base}{path}"
            pg = browser.new_page(viewport={"width": 1440, "height": 900})
            pg.add_init_script(
                "try{localStorage.setItem('rollout_tour_done','1')}catch(e){}"
            )
            pageerrors, consoleerrors = [], []
            pg.on("pageerror", lambda e: pageerrors.append(str(e)))
            pg.on("console", lambda m: consoleerrors.append(m.text)
                  if m.type == "error" and not any(k in m.text for k in IGNORE)
                  else None)
            reasons = []
            try:
                pg.set_default_timeout(30000)
                pg.goto(url, wait_until="domcontentloaded")
                # the landing streams a ~3.9MB GLB + 3D; give it longer to paint
                time.sleep(SETTLE_SECONDS + (6 if label == "landing" else 0))

                canvas_count = pg.evaluate(
                    "document.querySelectorAll('canvas').length"
                )

                client = pg.context.new_cdp_session(pg)
                shot = client.send("Page.captureScreenshot", {"format": "png"})
                png = base64.b64decode(shot["data"])

                is_flat, frac, dom = flat_frame_stats(png)

                if is_flat:
                    reasons.append(
                        f"flat frame / white-out ({frac*100:.1f}% of pixels are "
                        f"rgb{dom}, threshold {FLAT_THRESHOLD*100:.0f}%)"
                    )
                if canvas_count < min_canvas:
                    reasons.append(
                        f"canvas layer missing (found {canvas_count}, "
                        f"expected >= {min_canvas})"
                    )
                if pageerrors:
                    reasons.append(f"pageerror: {pageerrors[0][:100]}")

                verdict = "FAIL" if reasons else "PASS"
                detail = (f"flat_frac={frac:.3f} dom=rgb{dom} canvases={canvas_count} "
                          f"pageerrors={len(pageerrors)} consoleerrors={len(consoleerrors)}")
                results.append((label, path, verdict, detail, reasons))
            except Exception as e:
                results.append((label, path, "FAIL",
                                f"navigation/screenshot failed: {e}", [str(e)]))
            finally:
                pg.close()
        browser.close()
    return results


def main():
    args = [a for a in sys.argv[1:]]
    if "--selftest" in args:
        sys.exit(selftest())

    base = next((a for a in args if not a.startswith("--")), "http://localhost:4310")
    base = base.rstrip("/")

    # Optional: also check the REAL marketing landing (the surface that whited
    # out). It only renders in cloud mode when logged out, so point at the dev
    # server (:5173) with a fresh no-session context: --landing http://localhost:5173
    routes = list(ROUTES)
    landing_url = None
    for a in args:
        if a.startswith("--landing="):
            landing_url = a.split("=", 1)[1].rstrip("/")
        elif a == "--landing":
            landing_url = "http://localhost:5173"
    if landing_url:
        routes.append(("landing", landing_url + "/", 2))

    print(f"===== VISUAL RENDER-CORRECTNESS RED-TEAM ({base}) =====", flush=True)
    results = run_routes(base, routes)
    failed = 0
    for label, path, verdict, detail, reasons in results:
        tag = "✓" if verdict == "PASS" else "✗"
        print(f"[{verdict:4}] {tag} {label:6} {path}", flush=True)
        print(f"           {detail}", flush=True)
        for r in reasons:
            print(f"           -> {r}", flush=True)
        if verdict == "FAIL":
            failed += 1

    total = len(results)
    print(f"\nPASS={total - failed} FAIL={failed} (total {total})", flush=True)
    print("ALL PASS" if failed == 0 else "HAS FAIL", flush=True)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
