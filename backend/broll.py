"""Rollout b-roll engine — aesthetic footage montage for lyric videos.

The TikTok-native lyric video: moody stock clips (night driving, ocean, sky,
neon streets) cut on the beat, lyrics riding over the whole sequence.

Source: Pexels' free video API (PEXELS_KEY env — free key, generous quota).
No key -> caller falls back to the cover-art background. Clips are cached
per query so repeat renders don't refetch.
"""
import json
import os
import urllib.parse
import urllib.request


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):  # don't forward the Pexels key on a 3xx
        return None


_NO_REDIR = urllib.request.build_opener(_NoRedirect)

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads", "broll")
os.makedirs(CACHE, exist_ok=True)

# vibe -> footage language (queries tuned for portrait aesthetic b-roll)
STYLE_QUERIES = {
    "film": ["driving car window view", "golden hour field", "walking city film"],
    "soul": ["vinyl record player", "warm sunset silhouette", "smoke slow motion"],
    "street": ["night city driving neon", "rain street lights", "headlights dark road"],
    "minimal": ["ocean waves aerial", "clouds timelapse sky", "fog mountain"],
    "painted": ["ink in water", "flowers slow motion", "light through trees"],
    "collage": ["vhs static texture", "crowd concert lights", "city skate"],
    "y2k": ["neon lights abstract", "chrome reflection", "tunnel drive fast"],
}
MOOD_QUERIES = {
    "moody": ["night rain window", "dark ocean waves"],
    "emotional": ["rain on glass", "birds flying sky"],
    "driving": ["road trip window view", "highway night"],
    "dreamy": ["clouds soft light", "underwater light rays"],
    "energetic": ["city lights fast", "sparks slow motion"],
    "romantic": ["candle flame close", "silhouette couple sunset"],
    "uplifting": ["sunrise timelapse", "birds flying sky"],
    "aggressive": ["storm clouds timelapse", "fire slow motion"],
    "mellow": ["calm lake morning", "coffee window rain"],
    "warm": ["golden hour light", "field wind grass"],
    "bright": ["blue sky clouds", "beach waves sunny"],
    "crisp": ["minimal architecture", "snow mountain aerial"],
    "introspective": ["rain window reflection", "person walking alone"],
    "triumphant": ["mountain summit sunrise", "city skyline golden hour"],
}


def available():
    return bool(os.environ.get("PEXELS_KEY", ""))


def queries_for(style, moods):
    qs = list(STYLE_QUERIES.get(style, STYLE_QUERIES["film"]))
    for m in (moods or [])[:2]:
        qs += MOOD_QUERIES.get(m, [])[:1]
    return qs[:4]


def _search(query, key, per_page=3):
    url = (
        "https://api.pexels.com/videos/search?"
        + urllib.parse.urlencode({
            "query": query, "orientation": "portrait",
            "size": "medium", "per_page": per_page,
        })
    )
    # carries the Pexels key — don't follow a redirect to another host (key leak)
    # and cap the read so a misbehaving response can't exhaust memory
    req = urllib.request.Request(url, headers={"Authorization": key})
    with _NO_REDIR.open(req, timeout=60) as r:
        return json.loads(r.read(8 * 1024 * 1024))


def fetch_clips(style, moods, n=4):
    """Download up to n portrait clips matching the vibe. Returns local paths."""
    key = os.environ.get("PEXELS_KEY", "")
    if not key:
        return []
    paths = []
    for q in queries_for(style, moods):
        if len(paths) >= n:
            break
        slug = q.replace(" ", "_")
        cached = [
            os.path.join(CACHE, f) for f in os.listdir(CACHE)
            if f.startswith(slug + "__")
        ]
        if cached:
            paths.append(cached[0])
            continue
        try:
            data = _search(q, key)
            for video in data.get("videos", []):
                best = None
                for vf in video.get("video_files", []):
                    w, h = vf.get("width") or 0, vf.get("height") or 0
                    if h >= 1000 and h > w:  # portrait, decent res
                        if best is None or h < best.get("height", 9999):
                            best = vf
                if not best:
                    continue
                dest = os.path.join(CACHE, f"{slug}__{video['id']}.mp4")
                # timeout + size cap + atomic write so a stalled/partial download
                # never hangs the worker or gets cached as if complete
                from netguard import fetch_url  # IP-pinned, SSRF-safe, size-capped
                data = fetch_url(best["link"], timeout=60, max_bytes=50 * 1024 * 1024)
                tmp_dest = dest + ".part"
                with open(tmp_dest, "wb") as fo:
                    fo.write(data)
                os.replace(tmp_dest, dest)
                paths.append(dest)
                break
        except Exception:
            continue
    return paths
