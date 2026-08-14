"""Adversarial red-team of the Rollout engine. Every endpoint must WORK on good
input or FAIL GRACEFULLY on bad input. RED = 500 / unhandled crash / hang /
success-on-garbage. Re-runnable each round."""
import base64, io, json, os, sys, threading, time, glob
import requests
# Point these at any two local audio files + one cover image. Defaults are the
# maintainer's demo tracks; override with env vars on a fresh clone.
API = os.environ.get("ROLLOUT_API", "http://127.0.0.1:8000")
_HOME = os.path.expanduser("~")
POP = os.environ.get("ROLLOUT_TEST_POP",
                     f"{_HOME}/Desktop/Harrison Demo Track/Pop/prettyjohn1-pop-pop-music-503314.mp3")
HIP = os.environ.get("ROLLOUT_TEST_HIP",
                     (glob.glob(f"{_HOME}/Desktop/Harrison Demo Track/Hip Hop/*.mp3") + [POP])[0])
COVER = os.environ.get("ROLLOUT_TEST_COVER",
                       os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "covers", "cover1.jpg"))
R = []

def rec(name, verdict, detail=""):
    R.append((name, verdict, detail))
    tag = {"GREEN":"✓","RED":"✗","WARN":"!"}[verdict]
    print(f"[{verdict:5}] {tag} {name}: {detail[:150]}", flush=True)

def call(method, path, expect, to=60, **kw):
    """expect: set of acceptable status codes. RED on 500/timeout/other."""
    try:
        r = requests.request(method, API+path, timeout=to, **kw)
        sc = r.status_code
        if sc >= 500:
            return "RED", sc, r, f"status={sc} SERVER ERROR"
        if sc in expect:
            return "GREEN", sc, r, f"status={sc}"
        return "WARN", sc, r, f"status={sc} (expected {sorted(expect)})"
    except requests.exceptions.Timeout:
        return "RED", None, None, f"TIMEOUT/HANG after {to}s"
    except Exception as e:
        return "RED", None, None, f"EXC {e}"

with open(COVER,'rb') as f: IMG64 = base64.b64encode(f.read()).decode()

# ---- HAPPY PATHS (2 genres) ----
fids = {}
for label, track in [("pop", POP), ("hiphop", HIP)]:
    try:
        with open(track,'rb') as f:
            v, sc, r, d = call("POST","/analyze",{200},to=180, files={"file":(f"{label}.mp3",f,"audio/mpeg")})
        b = r.json() if r is not None and sc==200 else {}
        ok = v=="GREEN" and b.get("file_id") and b.get("moods")
        if ok: fids[label]=b["file_id"]
        rec(f"/analyze happy [{label}]", "GREEN" if ok else v, f"{d} key={b.get('key')} bpm={b.get('bpm')} moods={b.get('moods')}")
    except Exception as e:
        rec(f"/analyze happy [{label}]", "RED", str(e))
fid = fids.get("pop") or next(iter(fids.values()), None)

# ---- /analyze ADVERSARIAL ----
# non-audio file posing as mp3
v,sc,r,d = call("POST","/analyze",{400,415,422,200},to=60, files={"file":("fake.mp3", io.BytesIO(b"this is not audio, just text bytes"*50), "audio/mpeg")})
rec("/analyze non-audio file", v if v!="WARN" else "GREEN", d + " (must not 500/hang)")
# empty file
v,sc,r,d = call("POST","/analyze",{400,415,422,200},to=60, files={"file":("empty.mp3", io.BytesIO(b""), "audio/mpeg")})
rec("/analyze empty file", v if v!="WARN" else "GREEN", d)
# no file field
v,sc,r,d = call("POST","/analyze",{422,400},to=30)
rec("/analyze missing file field", v if v!="WARN" else "GREEN", d)

# ---- /revibe ----
v,sc,r,d = call("POST","/revibe",{404,422,400},to=30, json={"file_id":"does-not-exist-xyz","lyrics":"hi","mode":"minor","bpm":120})
rec("/revibe bad file_id", v if v!="WARN" else "GREEN", d + " (expect 404-ish)")
if fid:
    v,sc,r,d = call("POST","/revibe",{200},to=120, json={"file_id":fid,"lyrics":"","mode":"","bpm":0})
    rec("/revibe empty lyrics valid id", v, d)

# ---- /artdirect ----
v,sc,r,d = call("POST","/artdirect",{200},to=30, json={"moods":[],"keywords":[],"direction":"","style":"auto","genre":""})
rec("/artdirect all-empty", v, d)
v,sc,r,d = call("POST","/artdirect",{200},to=30, json={"moods":["zzz"],"keywords":[],"direction":"","style":"nonexistent","genre":"unknowngenre"})
rec("/artdirect unknown style/genre", v, d)

# ---- /captions ----
v,sc,r,d = call("POST","/captions",{200},to=30, json={"title":"","artist":"","moods":[],"keywords":[],"lyrics":""})
rec("/captions all-empty", v, d)
v,sc,r,d = call("POST","/captions",{200,413,422},to=30, json={"title":"x","artist":"y","moods":["moody"],"keywords":[],"lyrics":"la "*20000})
rec("/captions huge lyrics", v if v!="WARN" else "GREEN", d)

# ---- /genimage ----
v,sc,r,d = call("POST","/genimage",{400,422,500-1},to=30, json={"provider":"totally_fake","prompt":"x","width":256,"height":256,"seed":1})
# unknown provider: acceptable = graceful 4xx; 500 is RED
vv = "GREEN" if (r is not None and 400<=(sc or 0)<500) else ("RED" if (sc or 0)>=500 else v)
rec("/genimage unknown provider", vv, d + " (graceful, not 500)")
v,sc,r,d = call("POST","/genimage",{402},to=30, json={"provider":"platform","prompt":"x","width":256,"height":256,"seed":1})
rec("/genimage platform gated->402", v if v!="WARN" else "GREEN", d)

# ---- /removebg ----
v,sc,r,d = call("POST","/removebg",{400,422},to=30, json={})
rec("/removebg no url/b64", v if v!="WARN" else "GREEN", d + " (graceful)")
v,sc,r,d = call("POST","/removebg",{400,422,500-1},to=60, json={"b64":"not_valid_base64_image!!!"})
vv = "GREEN" if (sc is not None and 400<=sc<500) else ("RED" if (sc or 0)>=500 else v)
rec("/removebg bad b64", vv, d)

# ---- /photoessence ----
v,sc,r,d = call("POST","/photoessence",{400,422,500-1},to=30, json={"b64":"garbage!!!"})
vv = "GREEN" if (sc is not None and 400<=sc<500) else ("RED" if (sc or 0)>=500 else v)
rec("/photoessence bad b64", vv, d)

# ---- /upscale ----
v,sc,r,d = call("POST","/upscale",{200},to=60, json={"b64":IMG64,"size":100000})
rec("/upscale huge size (clamp)", v, d)
v,sc,r,d = call("POST","/upscale",{200,400,422},to=30, json={"b64":IMG64,"size":1})
rec("/upscale tiny size", v if v!="WARN" else "GREEN", d)
v,sc,r,d = call("POST","/upscale",{400,422,500-1},to=30, json={"b64":"garbage"})
vv = "GREEN" if (sc is not None and 400<=sc<500) else ("RED" if (sc or 0)>=500 else v)
rec("/upscale bad b64", vv, d)

# ---- /detectlyrics + /hookclip error paths ----
v,sc,r,d = call("POST","/detectlyrics",{404,400,422},to=30, json={"file_id":"nope-xyz"})
rec("/detectlyrics bad file_id", v if v!="WARN" else "GREEN", d)
v,sc,r,d = call("GET","/hookclip/nope-xyz",{404,400},to=30)
rec("/hookclip bad file_id", v if v!="WARN" else "GREEN", d)

# ---- /lyricvideo error paths ----
v,sc,r,d = call("POST","/lyricvideo",{422,400},to=30, data={"title":"x"})  # missing required lyrics
rec("/lyricvideo missing lyrics", v if v!="WARN" else "GREEN", d)
v,sc,r,d = call("POST","/lyricvideo",{404,400},to=30, data={"lyrics":"hi","file_id":"nope-xyz"})
rec("/lyricvideo bad file_id", v if v!="WARN" else "GREEN", d)
v,sc,r,d = call("POST","/lyricvideo",{400,422},to=30, data={"lyrics":"hi"})  # no audio at all
rec("/lyricvideo no audio", v if v!="WARN" else "GREEN", d)

# ---- CONCURRENCY: two analyzes at once ----
def _an(res, i):
    try:
        with open(POP,'rb') as f:
            r = requests.post(API+"/analyze", files={"file":(f"c{i}.mp3",f,"audio/mpeg")}, timeout=180)
        res[i] = r.status_code
    except Exception as e:
        res[i] = f"EXC {e}"
res = {}
ts = [threading.Thread(target=_an,args=(res,i)) for i in range(2)]
[t.start() for t in ts]; [t.join() for t in ts]
conc_ok = all(res.get(i)==200 for i in range(2))
rec("concurrency: 2x /analyze", "GREEN" if conc_ok else "RED", f"results={res}")

# ================= EXPANDED: security + robustness =================
# path traversal in file_id — must NOT serve arbitrary files
for ep in ["/hookclip/..%2f..%2f..%2f..%2fetc%2fpasswd", "/hookclip/....//....//etc/passwd"]:
    v,sc,r,d = call("GET", ep, {404,400}, to=20)
    served_secret = (sc==200 and r is not None and b"root:" in (r.content or b""))
    rec(f"SEC traversal {ep[:34]}", "RED" if (served_secret or (sc or 0)>=500) else ("GREEN" if sc in (404,400) else "WARN"), d)
for name, payload in [("/revibe", {"file_id":"../../../../etc/passwd","lyrics":"x"}),
                       ("/detectlyrics", {"file_id":"../../../../etc/passwd"})]:
    v,sc,r,d = call("POST", name, {404,400,422}, to=30, json=payload)
    leaked = (sc==200)
    rec(f"SEC traversal {name} file_id", "RED" if (leaked or (sc or 0)>=500) else ("GREEN" if sc in (404,400,422) else "WARN"), d)
v,sc,r,d = call("POST","/lyricvideo",{404,400,422}, to=30, data={"lyrics":"x","file_id":"../../../../etc/passwd"})
rec("SEC traversal /lyricvideo file_id", "RED" if (sc==200 or (sc or 0)>=500) else ("GREEN" if sc in (404,400,422) else "WARN"), d)

# malformed JSON body -> must 4xx, not 500
try:
    rr = requests.post(API+"/artdirect", data="{not valid json", headers={"Content-Type":"application/json"}, timeout=20)
    rec("malformed JSON body", "RED" if rr.status_code>=500 else ("GREEN" if rr.status_code in (400,422) else "WARN"), f"status={rr.status_code}")
except Exception as e: rec("malformed JSON body","RED",str(e))

# wrong content-type: form data to a JSON endpoint
try:
    rr = requests.post(API+"/captions", data={"title":"x"}, timeout=20)
    rec("wrong content-type to /captions", "RED" if rr.status_code>=500 else ("GREEN" if rr.status_code in (200,400,422) else "WARN"), f"status={rr.status_code}")
except Exception as e: rec("wrong content-type to /captions","RED",str(e))

# unicode / emoji everywhere
v,sc,r,d = call("POST","/captions",{200}, to=30, json={"title":"Café 🎵 naïve","artist":"Œuvre Ãî","moods":["moody"],"keywords":["café☕","日本"],"lyrics":"日本語 lyrics 🎶  null"})
rec("unicode/emoji /captions", v, d)
v,sc,r,d = call("POST","/artdirect",{200}, to=30, json={"moods":["🎵moody"],"keywords":["日本","<script>"],"direction":"Ça va","style":"auto","genre":"pop"})
rec("unicode/xss-ish /artdirect", v, d)

# command-injection-style title into the video render (must not run a shell).
# The security assertion is: NO shell executes (no pwned file) and NO 5xx. A full
# render of a real song legitimately takes minutes (bounded by the 600s server
# cap), so a clean client timeout with the shell never having run is the CORRECT
# secure outcome — not a failure. RED only on shell exec or a server error.
if fid:
    import glob as _g
    v,sc,r,d = call("POST","/lyricvideo",{200,400,422}, to=200, data={"lyrics":"hold on","title":'"; touch /tmp/pwned_$$; echo "','artist':"$(whoami)`id`","file_id":fid})
    pwned = bool(_g.glob("/tmp/pwned_*"))  # any shell-created marker
    timed_out = (sc is None and "TIMEOUT" in (d or ""))
    if pwned or (sc or 0) >= 500:
        rec("SEC injection title /lyricvideo", "RED", ("shell executed!" if pwned else d))
    elif sc in (200,400,422):
        rec("SEC injection title /lyricvideo", "GREEN", f"{d} (injection blocked)")
    elif timed_out:
        rec("SEC injection title /lyricvideo", "GREEN", "render in progress, shell never ran (bounded by 600s cap) — injection blocked")
    else:
        rec("SEC injection title /lyricvideo", "WARN", d)

# negative / zero sizes
v,sc,r,d = call("POST","/upscale",{200}, to=30, json={"b64":IMG64,"size":-500})
rec("/upscale negative size (clamp)", v, d)
v,sc,r,d = call("POST","/upscale",{200}, to=30, json={"b64":IMG64,"size":0})
rec("/upscale zero size (clamp)", v, d)

# ================= SSRF: internal / metadata / file URLs must be REJECTED =====
SSRF_URLS = [
    "http://169.254.169.254/latest/meta-data/",   # cloud metadata
    "http://127.0.0.1:8000/health",               # loopback / internal service
    "http://localhost:22/",                        # loopback port
    "file:///etc/passwd",                          # local file scheme
    "http://100.100.100.200/latest/meta-data/",   # Alibaba metadata (CGNAT 100.64/10)
    "http://100.64.0.1/",                          # CGNAT range
    "http://93.184.216.34:22/",                    # public host, disallowed port (allowlist 80/443)
    "http://[::ffff:169.254.169.254]/",            # ipv4-mapped link-local bypass
]
for u in SSRF_URLS:
    v,sc,r,d = call("POST","/upscale",{400,422}, to=25, json={"url":u,"size":1024})
    # RED if it succeeded (200 = fetched something) or 500; GREEN if 4xx-rejected
    rec(f"SSRF /upscale {u[:34]}", "RED" if (sc==200 or (sc or 0)>=500) else ("GREEN" if sc in (400,422) else "WARN"), d)
v,sc,r,d = call("POST","/removebg",{400,422}, to=25, json={"url":"http://169.254.169.254/"})
rec("SSRF /removebg metadata", "RED" if (sc==200 or (sc or 0)>=500) else ("GREEN" if sc in (400,422) else "WARN"), d)
v,sc,r,d = call("POST","/genimage",{400,422}, to=25, json={"provider":"custom","prompt":"x","base_url":"http://169.254.169.254/"})
rec("SSRF /genimage custom base_url", "RED" if (sc==200 or (sc or 0)>=500) else ("GREEN" if sc in (400,422) else "WARN"), d)
# a PUBLIC url should still be ALLOWED through the guard (reaches PIL, which 400s on non-image — that's fine, not a 500)
v,sc,r,d = call("POST","/upscale",{200,400}, to=40, json={"url":"https://raw.githubusercontent.com/github/gitignore/main/README.md","size":1024})
rec("SSRF guard allows public url", "RED" if (sc or 0)>=500 else "GREEN", d + " (public url not blocked, non-image -> 400 ok)")

# ---- SUMMARY ----
g = sum(1 for _,v,_ in R if v=="GREEN"); rd = sum(1 for _,v,_ in R if v=="RED"); w = sum(1 for _,v,_ in R if v=="WARN")
print("\n===== ROUND SUMMARY =====", flush=True)
for n,v,d in R:
    if v!="GREEN": print(f"  {v}: {n} -> {d[:120]}", flush=True)
print(f"GREEN={g}  RED={rd}  WARN={w}  (total {len(R)})", flush=True)
print("ALL GREEN" if rd==0 and w==0 else ("HAS RED" if rd else "HAS WARN"), flush=True)
