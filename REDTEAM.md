# Rollout Red-Team Loop

A repeatable, **two-legged** review that gets sharper every pass. Run it before
every deploy and after any substantial change.

- **Leg 1 — Static (white-box):** read every changed file *line by line* against
  the checklist below. This is where design/security/logic bugs live.
- **Leg 2 — Runtime (black-box):** run the automated adversarial suites (see
  [`redteam/README.md`](redteam/README.md)):
  - `redteam/adversarial_backend.py` — ~48 backend cases (happy paths ×2 genres,
    bad inputs, error paths, SSRF incl. CGNAT/metadata/port/ipv4-mapped, injection,
    concurrency).
  - `redteam/frontend_pages.py` — all pages render, no uncaught exceptions, no
    own-backend 4xx (external rate-limits filtered).
- **Memory:** when a pass finds a NEW bug class, add a checklist item here and a
  test to the suites. The loop improves itself. Do not delete items — the list
  only grows.
- **Done = two consecutive rounds (static + runtime) find nothing new.**

> History: v1 runtime-only loop went green in 3 rounds but a static review then
> found 30 issues (SSRF, webhook gaps, races, event-loop blocking, no error
> boundary, unbounded resources). That is why this checklist exists.

## Runnable harness — one command (`tools/redteam/`)

The loop is now versioned, runnable scripts, not ad-hoc scratchpad files:

```bash
tools/redteam/run.sh            # every leg, one verdict
tools/redteam/run.sh --changed  # diff-scoped surface report
```

| Leg | Script | Closes the gap of… |
|-----|--------|--------------------|
| Verified tripwire | `verified.mjs` | verified work getting **removed** / a beaten trap returning (the landing kept getting re-broken). 11 invariants: atmosphere-in-one-WebGL-context, no EffectComposer, GlassBackground/SmokeLayer not WebGL, stars stay 2D, webhook ordering guard, netguard CGNAT+ports. |
| Webhook ordering | `webhook_test.mjs` (node) | the billing logic was only ever **read** — now 7 replay scenarios (reorder, duplicate, same-second, unmapped-price, race) against a mock DB. |
| Visual render | `visual.py` | a flat **white-out** hero passing a console-error check. Flat-frame detector (self-tested) over studio routes + the real cloud landing. |
| Backend adversarial | `adversarial.py` | 61 cases, endpoint **coverage** tally, SSRF ×8 vectors, body-cap, traversal, PIL bomb, 12-thread concurrency probe. |
| Design | `npm run premium` / `landing` | studio flat-contract + marketing-surface (reduced-motion, assets, self-contained). |

CI runs the two cheap deterministic legs (tripwire + webhook test) on every push; the adversarial + visual legs run locally via `run.sh` (they need a live engine + served build). See [`redteam/README.md`](redteam/README.md).

---

## Checklist (verify EACH item against every file in scope)

### Security
- [ ] Every server-side fetch of a user-supplied URL is SSRF-guarded: scheme
      allowlist (http/https only), reject private/loopback/link-local/metadata
      (169.254.169.254) IPs, cap response size. *(server.py `_assert_public_url`)*
- [ ] SSRF denylist also covers CGNAT `100.64.0.0/10` (Alibaba metadata
      `100.100.100.200`), `192.0.0.0/24`, `198.18.0.0/15`, and unwraps
      IPv4-mapped IPv6 before classifying. Port allowlist = {80,443}.
- [ ] Raw `urllib` calls carrying an `Authorization`/bearer header do NOT follow
      redirects (a 3xx would leak the key + re-open SSRF). Use a no-redirect opener.
- [ ] Endpoints that run expensive/privileged work require auth (verify the
      Supabase JWT). No open, unauthenticated compute. **[OPEN — backend auth not yet added]**
- [ ] No path traversal: `file_id`/paths use `basename` + `isfile`, reject empty
      or directory-resolving values.
- [ ] No command/shell injection: subprocess uses arg lists (never `shell=True`);
      user text never interpolated into a shell string; header values sanitized.
- [ ] Owner/user HTML rendered only in a sandboxed iframe WITHOUT
      `allow-scripts`+`allow-same-origin` together.
- [ ] CORS is not `*` on authenticated/expensive endpoints (tighten before public).
- [ ] Webhook/signature verification is constant-time; supports key rotation.
- [ ] `window.open`/target=_blank use `noopener`.
- [ ] Secrets never logged; anon/public keys only client-side.

### Resource / availability
- [ ] No blocking work on the async event loop (heavy sync work in plain `def`
      → threadpool, or `run_in_threadpool`).
- [ ] Every subprocess and network call has a timeout.
- [ ] No unbounded disk growth: uploads/temp dirs swept or retention-capped;
      per-job temp dirs cleaned in `finally`.
- [ ] No unbounded in-memory caches (bounded / LRU / TTL).
- [ ] Request body size is capped at the STREAM level, not just via the
      Content-Length header (a chunked / CL-omitted body bypasses a header check).
      Upload copy loops enforce a byte ceiling directly.
- [ ] Every `mkdtemp`/`NamedTemporaryFile(delete=False)` has a matching cleanup
      in `finally` — INCLUDING ones in helper modules (align `isolate_vocals`
      leaked a ~10MB demucs dir/call into the system tempdir the sweep never walks).
- [ ] PIL `Image.open` on user bytes has `MAX_IMAGE_PIXELS` capped and catches
      `DecompressionBombError` as a 4xx.
- [ ] Frontend async waits (image preloads, fetches) have timeouts so the UI
      can't stall forever.

### Correctness
- [ ] Every endpoint fails gracefully (4xx) on bad input — never a 500 or a hang.
- [ ] Backend responses are shape-validated before use (`Array.isArray`, `?.`,
      fallbacks) — a malformed 200 must not crash the UI.
- [ ] No race on shared scratch files/dirs — concurrent jobs use unique temp paths.
- [ ] Minted IDs are persisted where reads happen (no duplicate rows on reload).
- [ ] Per-entity state uses per-entity storage keys (never a single global key).
- [ ] Error boundaries wrap lazy/3D/risky subtrees so one failure can't blank the app.
- [ ] Per-index UI load/fail state (spinner, error placeholder) is RESET whenever
      the underlying list/URLs change — a stale `failed[i]`/`loaded[i]` keyed by
      index blocks a fresh item at the same index forever (its `<img>` never
      mounts, so onLoad/onError can't fire). Reset via an effect on `[urls]`.
- [ ] A guard that blocks an action (e.g. no session → no checkout) gives USER
      FEEDBACK, not a silent dead button.
- [ ] Effects clean up: rAF cancelled, listeners removed, WebGL contexts lost,
      observers disconnected.
- [ ] Clipboard/async UI actions are `try/catch` with user feedback; a failure
      of one step doesn't skip the next (e.g. still open the composer).
- [ ] Metering/limits consumed only on success, never on a failed attempt.

### Billing (Stripe)
- [ ] Webhook handles `subscription.created` AND `.updated` AND `.deleted`
      (a first purchase fires `.created`; `.updated` is not guaranteed).
- [ ] Plan flip is resilient to out-of-order events (retry/409 when the customer
      row isn't bound yet).
- [ ] Tier resolved from the price→tier map (not solely fragile link metadata).
- [ ] Idempotent / replay-safe; 0-row updates are not silently swallowed.
- [ ] Out-of-order safe via a per-row high-water mark (`stripe_event_ts`): a
      reordered/redelivered older `.updated` can't re-grant a cancelled plan.
- [ ] `.deleted` is scoped to `stripe_subscription_id = sub.id` so a late delete
      of an OLD subscription can't wipe a newer active one.

### Deploy
- [ ] Committed deploy manifests exist (Dockerfile, netlify.toml, requirements.txt).
- [ ] All required env vars / secrets are documented (VITE_API_BASE,
      STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY, FAL_KEY, …).
- [ ] No hardcoded `localhost`/`127.0.0.1` in shipped code paths (env-driven).
- [ ] SQL migrations are idempotent / re-runnable (guarded create/drop).
- [ ] RLS is locked down: own-row policies; the only public read is intentional.

### Data cleanliness
- [ ] No personal/demo/real data leaks into public UI or shipped assets.
- [ ] No dead code / unused imports.
- [ ] No NSFW risk in generated assets (SFW guards on prompts).

---

## Meta-lessons (why the first static pass missed things — check these HARDER)
- SSRF must cover **response** URLs, not just the request target (a provider can
  return an internal URL you then fetch). And **pin the resolved IP** (DNS rebinding).
- Privileged-column protection must fire on **INSERT**, not just UPDATE (a fresh
  row can be self-inserted with plan='studio').
- Retention sweeps must **recurse** into sub-dirs (broll cache, hook clips).
- Timeout **every** subprocess — audit each one; the "obvious" ffmpeg was missed.
- Guard **every** consumer of a backend response, not a sample (Cover was missed
  after Plan/Lyrics/Import were fixed).
- `noopener` on **every** `window.open`, not a sample.
- Error boundaries must wrap the **page** subtree, not only the flashy 3D.
- Deploy: system libs beyond the obvious (onnxruntime needs `libgomp1`).
- Verify a fix by re-reviewing it — several R2 findings were gaps in R1's fixes.
- SSRF pinning must replace **every** raw `urllib.urlopen`/`requests` that dials
  a user-influenced URL, including ones hiding in helper modules (lyricvideo
  `_save_cover`/`prepare_background`, genimage `_post_json`, broll download).
  Add a **shared** `netguard.fetch_url`/`post_json` and route ALL of them through
  it; grep `urlopen` after and prove each remaining hit is a hardcoded host.
- A "fix" that only adds `assert_public_url()` before a raw `urlopen` is a TOCTOU
  hole — the guard resolves DNS, then urllib resolves again and can rebind. The
  guard and the connect must share one pinned IP (that's why the check returns
  the IP and the connection dials it).
- Binding a webhook row by a client-writable, non-unique column (email) is a
  cross-account escalation vector. Bind only by the trusted signed-in uid.
- The stdlib `ipaddress` "is_private/is_reserved/…" set does NOT cover CGNAT
  100.64.0.0/10 — and that's exactly where Alibaba's metadata endpoint lives.
  Denylist explicitly; don't trust the built-in flags to be exhaustive.
- Temp-dir/handle leaks hide in HELPER modules, not the endpoint. Grep every
  `mkdtemp`/`NamedTemporaryFile(delete=False)` repo-wide and confirm a `finally`.
  The retention sweep only walks `uploads/` — anything in the system tempdir is
  invisible to it, so a leaker there grows unbounded.
- A body-size check on the Content-Length HEADER is not a cap — chunked encoding
  omits it. Enforce on the actual stream/copy loop.
- Index-keyed UI state (`failed[i]`, `loaded[i]`) goes stale when the list it
  indexes changes; a per-index error placeholder can wedge permanently. Reset on
  the list identity, and remember an unmounted `<img>` can never self-clear.
- Stripe redelivers and REORDERS events; "handle created/updated/deleted" isn't
  enough — you need an ordering guard (high-water mark) or the late event wins.
- A restart makes cold-start costs (model load, first import) visible as test
  hangs. Reject bad input with a CHEAP check before the expensive load so a bad
  request never pays for a warm-up it will only 4xx anyway.

## Tracked LOW / deferred (fix before the relevant feature ships)
- [ ] Premium Remotion lyric video uses a SHARED scratch dir → concurrent-render
      race. Latent (premium never runs without `../video` npm install). Fix to
      per-job `mkdtemp` when enabling premium.
- [ ] Blob object URLs not revoked (Cover, Lyrics) — minor memory growth.
- [ ] Global localStorage keys (`rollout_subject`/`seeds`/`style`/`model`) →
      per-release when a release-switcher UI exists.
- [ ] NSFW safety flag set only on aihorde/fal; other providers use prompt-only.
- [ ] Migration 001 not idempotent (bare create policy/trigger) — matters only
      for a manual folder replay; tracked migrations apply once.
- [ ] Document runtime secrets in README/.env.example (STRIPE_WEBHOOK_SECRET,
      FAL_KEY, PEXELS_KEY, ROLLOUT_FONT, VITE_API_BASE, VITE_PUBLIC_BASE).
- [ ] Backend **auth** (Supabase JWT) — still OPEN; deployed engine is
      unauthenticated + CORS `*`.
- [ ] Webhook same-second delete-vs-active reorder: with strict `<` the guard is
      "first-committed wins" per second, so a `.deleted` and an `active .updated`
      sharing the exact `created` second, reordered, could leave the wrong state.
      Fully closing needs a Stripe re-fetch (source of truth) or an event-type
      tiebreak. Extremely rare; acceptable until the Stripe API key is wired in.

## Round log
- **R1 runtime:** 6 input-validation 500s → fixed. 2 clean rounds.
- **R2 runtime (expanded +SSRF/injection):** 43/43 green.
- **R1 static (4 agents):** 30 issues → fixed.
- **R2 static (checklist-driven, 3 agents):** ~20 more incl. 1 CRITICAL
      (INSERT plan escalation), response-URL SSRF, DNS rebinding, missing ffmpeg
      timeout, Cover guards, no page ErrorBoundary, Dockerfile libgomp1 → all
      fixed except the tracked-LOW list above.
- **R3 static (section-by-section, line-by-line):** found gaps IN R2's own fixes
      — SSRF incomplete (3 raw-urllib sites in lyricvideo/genimage/broll bypassed
      the pinned fetcher; guard was check-then-urlopen TOCTOU), webhook email
      fallback = cross-account escalation, Cover response guards partial, Ads slug
      not propagated (→404), sweep startup-only. **All fixed:** added
      `netguard.post_json` (pinned POST); routed genimage `_post_json`,
      lyricvideo `_save_cover`+`prepare_background`, broll download through the
      pinned fetchers; webhook binds by uid only + 409 retry; UpgradeModal guards
      missing session; sweep now periodic (hourly background thread). Remaining
      raw `urlopen` proven hardcoded-host (stability/openai/hf/pexels).
- **R4 static (4 parallel reviewers, line-by-line on the changed surface):**
      found gaps IN R3's fixes + new classes. **HIGH:** Cover stale `failed[i]`
      wedges a placeholder over a fresh URL; align `isolate_vocals` leaks a
      ~10MB demucs dir/call into the unswept system tempdir. **MED:** netguard
      missed CGNAT `100.64/10` (Alibaba metadata SSRF); `_BodySizeLimit`
      bypassable via chunked encoding; genimage uncapped provider reads (OOM);
      webhook stale `.updated` re-grants a cancelled plan; webhook `.deleted`
      wipes a newer sub. **LOW:** photoEssence "undefined"; UpgradeModal dead
      button; provider raw-urlopen follows redirects (bearer leak); no PIL bomb
      cap; no port allowlist; ipv4-mapped bypass. **ALL fixed** (migration 006
      adds `stripe_event_ts`). Runtime after fixes: backend 46+ / frontend 11
      green; added CGNAT + port-allowlist + ipv4-mapped SSRF cases to the suite.
- **R5 static (3 reviewers, verifying R4's fixes):** backend fixes **CONVERGED**
      (all correct, 4 confirmed empirically). But found gaps IN R4's own fixes:
      **Frontend HIGH** — the `[urls]` blanket load-state reset strands loaded
      thumbnails behind an opaque spinner on single-index restyle (unchanged
      `<img src>` never refires onLoad) → fixed with a per-index URL diff.
      **Webhook (3):** redelivered checkout bypassed the high-water mark;
      non-atomic SELECT-then-UPDATE race; second-granularity tie favored
      re-granting → all fixed by moving the guard into an ATOMIC compare-and-set
      (`.or(stripe_event_ts.is.null,stripe_event_ts.lt.N)`) applied consistently
      to checkout, subscription, and delete paths. Residual same-second reorder
      tracked-LOW.
- **R6 static (2 reviewers, verifying R5's fixes):** BOTH **CONVERGED**. Webhook:
      all 8 traced scenarios correct — same-second block and reorder/redeliver
      bugs genuinely closed by (a) checkout binds-only (no plan/ts write) and
      (b) the ordering guard living in the UPDATE's WHERE (Postgres row-lock
      re-evaluates it, closing the concurrency race). Frontend: per-index diff
      correct on all 7 setUrls paths, ref can't desync, no regression. Two latent
      non-blocking webhook items (F1 unmapped-active-price silent-free; F2 unbound
      `.deleted` dropped) — **both hardened**: F1 now warns + retries; F2 retries
      while the customer is unbound (symmetric with the sub path). Runtime:
      backend 48/48, frontend 11/11 green.
- **CONVERGED (R6).** No must-fix defect in the last static round; runtime green
      both legs. Remaining items are the documented tracked-LOW / deferred list
      (backend JWT auth, object-URL revokes, per-release keys, same-second Stripe
      reorder) — none block deploy; each is gated to its feature or a config step.
- **Loop hardening (2026-08-13).** Turned the loop from per-session agent
      orchestration into a **runnable, versioned harness** under `tools/redteam/`
      + one-command `run.sh` (diff-scoped). Closed the two blind spots from the
      real R1–R6 run: (1) the **billing logic was only read** → extracted the
      webhook ordering into `logic.mjs` and added `webhook_test.mjs` (7 replay
      scenarios: reorder / duplicate / same-second / unmapped-price / race —
      all PASS, no bug); (2) the **frontend suite went green on a white hero** →
      added `visual.py`, a self-tested flat-frame/white-out detector that checks
      the studio routes AND the real cloud landing (4/4 PASS, dark). Promoted the
      backend suite to `adversarial.py` (61 cases, **15/15 endpoint coverage**,
      SSRF ×8, body-cap, traversal, PIL-bomb, 12-thread concurrency probe — all
      GREEN). Added a **verified-feature tripwire** (`verified.mjs`, 11 invariants)
      so removing hard-won work (e.g. the landing atmosphere) or re-introducing a
      beaten trap fails the build. CI now runs the tripwire + webhook test on
      every push. Still open (documented in `redteam/README.md`): auth/RLS
      runtime probe (no auth on the engine yet) and a live-Stripe signed replay
      (needs deno on the box).
