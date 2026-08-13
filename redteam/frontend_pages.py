"""Frontend red-team: load every studio page in the local-mode build, catch
uncaught JS exceptions + console errors + blank/broken renders."""
from playwright.sync_api import sync_playwright
import time
BASE = "http://localhost:4300"
PAGES = ["Import","Build","Dashboard","Cover","Distribute","Plan","Lyrics","Landing","Ads","Ship","Settings"]
R = []
IGNORE = ("THREE.Clock", "ReadPixels", "GL Driver", "deprecated", "Download the React DevTools",
          "prefers-color", "webglcontextlost",
          # a bare browser network-log line for a failed resource; the REAL check
          # is the response listener below, which distinguishes OUR backend/app
          # (a real bug) from an external provider being rate-limited (environmental).
          "Failed to load resource")
# hosts that are ours — a 4xx/5xx from these during a page load IS a real defect
OWN_HOSTS = ("localhost:4300", "127.0.0.1:4300", "localhost:8000", "127.0.0.1:8000")

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    for page_name in PAGES:
        pg = b.new_page(viewport={"width":1440,"height":900})
        # disable the onboarding tour so it doesn't hijack navigation to Import
        pg.add_init_script("try{localStorage.setItem('rollout_tour_done','1')}catch(e){}")
        errs = []      # uncaught exceptions (critical)
        cerrs = []     # console.error (app-level, external noise filtered)
        ownfail = []   # 4xx/5xx from OUR backend/app during load (real defect)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: cerrs.append(m.text) if m.type=="error" and not any(k in m.text for k in IGNORE) else None)
        def _resp(resp):
            try:
                if resp.status >= 400 and any(h in resp.url for h in OWN_HOSTS):
                    ownfail.append(f"{resp.status} {resp.url[:90]}")
            except Exception:
                pass
        pg.on("response", _resp)
        try:
            pg.set_default_timeout(20000)
            pg.goto(f"{BASE}/?page={page_name}", wait_until="load")
            time.sleep(3.5)  # let mounts + backend fetches settle
            # did it render meaningful content (not blank / not an error boundary)?
            txt = pg.evaluate("document.body.innerText || ''")
            has_content = len(txt.strip()) > 40
            crashed = any("Minified React error" in e or "is not a function" in e or "undefined" in e for e in errs)
            # RED: uncaught exception, blank render, OR our-own backend/app 4xx-5xx.
            # WARN: app-level console.error only. External provider rate-limits are
            # filtered (environmental, and the UI now degrades gracefully).
            verdict = "RED" if (errs or not has_content or ownfail) else ("WARN" if cerrs else "GREEN")
            detail = f"content={len(txt.strip())}ch pageerrors={len(errs)} consoleerrors={len(cerrs)} ownfail={len(ownfail)}"
            if errs: detail += f" | EXC: {errs[0][:120]}"
            elif ownfail: detail += f" | OWN: {ownfail[0]}"
            elif cerrs: detail += f" | cerr: {cerrs[0][:100]}"
            R.append((page_name, verdict, detail))
        except Exception as e:
            R.append((page_name, "RED", f"navigation failed: {e}"))
        finally:
            pg.close()
    b.close()

print("===== FRONTEND PAGE RED-TEAM =====", flush=True)
for n,v,d in R:
    tag={"GREEN":"✓","WARN":"!","RED":"✗"}[v]
    print(f"[{v:5}] {tag} {n}: {d}", flush=True)
g=sum(1 for _,v,_ in R if v=="GREEN"); rd=sum(1 for _,v,_ in R if v=="RED"); w=sum(1 for _,v,_ in R if v=="WARN")
print(f"\nGREEN={g} RED={rd} WARN={w} (total {len(R)})", flush=True)
print("ALL GREEN" if rd==0 and w==0 else ("HAS RED" if rd else "HAS WARN (non-fatal console errors)"), flush=True)
