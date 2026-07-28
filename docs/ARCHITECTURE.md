# Rollout — Architecture & Launch Plan

## Production shape (multi-tenant)

```
[Browser] ── Netlify ───────────── rollout frontend (this repo /src, /dist)
    │            └───────────────── /r/{slug} fan pages (generated per release)
    │
    ├── Supabase (OWN project "rollout" — NEVER Th3Circle's DB; Harrison's
    │              rule 2026-07-28)  auth (email/password + magic link + Google
    │                               OAuth; Apple/Microsoft/etc = dashboard
    │                               toggles), Postgres (tenants, releases,
    │                               assets, metering), Storage (audio, covers,
    │                               videos), RLS per artist.
    │                               Schema: supabase/001_rollout_schema.sql
    │                               Connect: fill src/lib/supabase.ts (URL +
    │                               anon key) -> cloud mode activates; empty
    │                               values = local mode.
    │
    └── Engine host (Railway/Fly) ─ backend/ Python FastAPI: analysis, lyric
                                    detection/alignment, rembg, art direction,
                                    image gateway, Remotion render workers
```

- **Auth principle:** email covers EVERY provider (Titan, Hotmail, private
  domains). OAuth is convenience on top, starting with Google.
- **Metering:** free tier = 1 song end-to-end, exports/copy gated (see
  freemium rules in src/store.tsx); Stripe on Supabase user records.
- **Image credits (later):** FAL_KEY env on engine host lights up the platform
  model catalog; long-term, self-host openedai-images-flux on a GPU box.

## Local development

Everything runs locally today: `./start.sh`. The engine host is the ONLY
piece that needs a paid account at launch; Supabase + Netlify are driven via
their MCP servers from Claude.

## Non-negotiables

- No deploy without Harrison literally saying "deploy".
- $0 built-in AI: free engines by default, BYO keys, platform credits only
  when funded.
- Layer compositing stays — it is the anti-AI-look moat.
- premium-check must report PLATINUM before any release.
