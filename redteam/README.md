# Red-team suites

The two runtime legs of the red-team loop described in [`../REDTEAM.md`](../REDTEAM.md).

## Backend adversarial suite — `adversarial_backend.py`
Drives every engine endpoint with good and hostile input. RED = a 500, an unhandled
crash, a hang, or success-on-garbage. ~48 cases: happy paths (2 genres), input
validation, path traversal, SSRF (metadata / loopback / CGNAT / disallowed port /
ipv4-mapped), prompt/shell injection, malformed bodies, concurrency.

```bash
# engine must be running on :8000 first (see ../start.sh)
python redteam/adversarial_backend.py
```
Fixtures default to the maintainer's local demo tracks; override on a fresh clone:
`ROLLOUT_TEST_POP=/path/a.mp3 ROLLOUT_TEST_HIP=/path/b.mp3 ROLLOUT_TEST_COVER=/path/c.jpg`.
Needs `requests`.

## Frontend page suite — `frontend_pages.py`
Loads every studio page in a headless browser (local-mode build served on :4300) and
fails on an uncaught exception, a blank render, or a **4xx from our own backend/app**
(external-provider rate-limits are treated as environmental, not defects).

```bash
# serve a local-mode build: blank the two constants in src/lib/supabase.ts,
# `npm run build`, then `python -m http.server 4300 --directory dist`
python redteam/frontend_pages.py
```
Needs `playwright` + a Chromium install.

## The rule
When a pass finds a new bug class, add a checklist item to `../REDTEAM.md` **and** a case
here. The loop runs until two consecutive rounds find nothing new.
