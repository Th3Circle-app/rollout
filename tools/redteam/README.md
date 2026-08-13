# Rollout red-team loop

A self-improving security + correctness loop. Two legs (static + runtime) with a
memory file, now backed by **runnable, versioned harnesses** instead of ad-hoc
scripts. See the round history and checklist in [`../../REDTEAM.md`](../../REDTEAM.md).

## One command

```bash
tools/redteam/run.sh            # full run — every leg, one verdict
tools/redteam/run.sh --changed  # diff-scoped: just report the changed surface
```

Exit code is nonzero if any hard leg fails. A leg whose dependency is missing
(engine down, no dist) reports **SKIP**, not failure.

## The legs

| Leg | Script | What it proves | Needs |
|-----|--------|----------------|-------|
| Build + typecheck | `npm run build` | the code compiles + bundles | — |
| Design (studio) | `npm run premium` | the flat studio contract holds | — |
| Design (marketing) | `npm run landing` | reduced-motion, assets, self-contained | — |
| **Webhook ordering** | `webhook_test.mjs` (node) | Stripe events applied correctly under reorder / duplicate / same-second / race | node |
| **Backend adversarial** | `adversarial.py` | SSRF / injection / traversal / body-cap / concurrency + endpoint coverage | engine on `:8000` |
| **Visual render** | `visual.py` | the page isn't a flat frame (**white-out / blank**) — the thing a console-error check misses | Playwright + a served build |

The webhook and visual legs exist because those were the two blind spots: the
billing ordering logic was only ever *read*, and the frontend suite went green
while the hero rendered pure white.

## Individual legs

```bash
node tools/redteam/webhook_test.mjs                 # billing ordering
~/ear-env/bin/python tools/redteam/adversarial.py   # backend (engine must be up)
~/scrapling-env/bin/python tools/redteam/visual.py http://localhost:4310
~/scrapling-env/bin/python tools/redteam/visual.py --selftest   # prove the detector has teeth
```

## How it stays honest (the loop)

1. Run both legs against the changed surface.
2. Every finding → a fix **and** a regression case in the suite here.
3. Re-review the fixes next round (fixes have their own bugs).
4. New miss → new checklist item + meta-lesson in `REDTEAM.md`.
5. **Done = two consecutive rounds find nothing new.**

## Known gaps (tracked, not yet automated)

- Backend **auth/authz** and Supabase **RLS** aren't runtime-probed (the engine
  has no auth yet; RLS is asserted statically). Add a two-JWT RLS probe when auth lands.
- The webhook test exercises the **logic** against a mock DB, not a live
  Supabase + real Stripe signatures. Wire a `supabase functions serve` + signed
  replay when deno is available on the box.
