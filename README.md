# Rollout

**Drop one song, get a whole release.** An independent artist uploads a finished
track and Rollout builds the release kit: vibe analysis, layered cover art,
distributor hand-off, release calendar + captions, beat-synced lyric videos,
a fan page they own, and an ad center — all pointed at converting listeners
into fans the artist keeps.

A Th3Circle product.

## Structure

```
src/          React frontend (Vite + Tailwind). One screen per lifecycle step.
  pages/      Import · Build · Dashboard · Cover · Distribute · Plan · Lyrics · Landing · Ads · Ship · Settings
  components/ Sidebar, Tour, gates, ui primitives
  compositor.ts  Illustrator-style layer engine (preview == export)
backend/      Python engine (FastAPI, port 8000)
  server.py        all endpoints
  analyze.py       key/BPM/mood/keywords (librosa)
  align.py         lyric detection + correction (demucs + stable-ts)
  lyricvideo.py    hook finder + video render pipelines
  artdirection.py  album-cover design knowledge (styles, recipes)
  genimage.py      image provider gateway (free engines, BYO, platform)
  captions.py      release captions engine
video/        Remotion project — kinetic lyric video composition
tools/        premium-check.mjs — strict design grader (npm run premium)
docs/         specs and audits
start.sh      one command: engine + app + browser
```

## Run

```bash
./start.sh          # starts backend (uvicorn :8000) + frontend (vite :5173)
```

Backend deps live in the `ear-env` Python environment (librosa, demucs,
stable-ts, rembg, fastapi). Frontend: `npm i && npm run dev`.

## Quality gates

- `npm run premium` — design-contract grader; ship only at PLATINUM (>= 95)
- `?page=Cover&autotest=composite` — end-to-end image pipeline self-test
- `docs/COMPLETENESS-SPEC.md` — app-furniture checklist

## Design contract

Flat `#0B0B0F`, violet `#8B5CF6` as the only action accent, amber `#F0A45B`
for AI signals, mint `#46E0A8` for ready states, mono for data. Color is a
signal, not decoration. See `tools/premium-check.mjs` for the enforced rules.
