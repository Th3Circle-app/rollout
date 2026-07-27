"""Rollout image provider gateway.

NightCafe-style model: our free built-in generator by default, and BYO
connections for artists who have their own accounts — their key, their bill,
our $0. Keys are passed per-request from the client and NEVER stored here.

Every provider returns raw image bytes or raises with a human-readable error
(surfaced by the Test button in Settings).
"""
import base64
import json
import time
import urllib.error
import urllib.parse
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Rollout)"}


def _post_json(url, payload, headers, timeout=180):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", **UA, **headers},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def _get_bytes(url, headers=None, timeout=180):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


# --- providers -------------------------------------------------------------

def gen_pollinations(prompt, key="", seed=0, size=1024, model=""):
    """Built-in free generator. No key. The default."""
    url = (
        "https://image.pollinations.ai/prompt/"
        + urllib.parse.quote(prompt)
        + f"?width={size}&height={size}&seed={seed}&nologo=true&model=flux"
    )
    return _get_bytes(url)


def gen_together(prompt, key, seed=0, size=1024, model=""):
    """Together AI — FLUX.1-schnell has a free tier. OpenAI-compatible."""
    j = _post_json(
        "https://api.together.xyz/v1/images/generations",
        {
            "model": model or "black-forest-labs/FLUX.1-schnell-Free",
            "prompt": prompt, "width": size, "height": size,
            "steps": 4, "n": 1, "seed": seed, "response_format": "b64_json",
        },
        {"Authorization": f"Bearer {key}"},
    )
    return base64.b64decode(j["data"][0]["b64_json"])


def gen_replicate(prompt, key, seed=0, size=1024, model="", image_b64=""):
    """Replicate — flux models via the official endpoint. image_b64 switches
    to flux-dev image-to-image (restyle) with a data URI input."""
    slug = model or ("black-forest-labs/flux-dev" if image_b64 else "black-forest-labs/flux-schnell")
    inp = {"prompt": prompt, "seed": seed, "aspect_ratio": "1:1",
           "output_format": "png"}
    if image_b64:
        inp["image"] = "data:image/jpeg;base64," + image_b64
        inp["prompt_strength"] = 0.65  # keep the source recognizable
    j = _post_json(
        f"https://api.replicate.com/v1/models/{slug}/predictions",
        {"input": inp},
        {"Authorization": f"Bearer {key}", "Prefer": "wait"},
        timeout=300,
    )
    out = j.get("output")
    if isinstance(out, list):
        out = out[0]
    if not out:
        raise RuntimeError(f"Replicate returned no output ({j.get('status')})")
    return _get_bytes(out, {"Authorization": f"Bearer {key}"})


def gen_stability(prompt, key, seed=0, size=1024, model=""):
    """Stability AI — stable-image core endpoint (multipart)."""
    boundary = "----rollout" + str(int(time.time()))
    fields = {"prompt": prompt, "output_format": "png",
              "aspect_ratio": "1:1", "seed": str(seed)}
    body = b""
    for k, v in fields.items():
        body += (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n"
        ).encode()
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        "https://api.stability.ai/v2beta/stable-image/generate/core",
        data=body,
        headers={
            "Authorization": f"Bearer {key}",
            "Accept": "image/*",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            **UA,
        },
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def gen_openai(prompt, key, seed=0, size=1024, model=""):
    """OpenAI images endpoint (gpt-image-1 / dall-e-3)."""
    j = _post_json(
        "https://api.openai.com/v1/images/generations",
        {"model": model or "gpt-image-1", "prompt": prompt,
         "size": "1024x1024", "n": 1},
        {"Authorization": f"Bearer {key}"},
        timeout=300,
    )
    d = j["data"][0]
    if d.get("b64_json"):
        return base64.b64decode(d["b64_json"])
    return _get_bytes(d["url"])


def gen_custom(prompt, key, seed=0, size=1024, model="", base_url=""):
    """Any OpenAI-compatible /images/generations endpoint.

    Covers aggregators + platforms with compatible APIs (OpenArt, Higgsfield
    access tiers, OpenRouter-style gateways, self-hosted ComfyUI proxies).
    """
    if not base_url:
        raise RuntimeError("Custom provider needs a base URL")
    url = base_url.rstrip("/")
    if not url.endswith("/images/generations"):
        url += "/images/generations"
    j = _post_json(
        url,
        {"model": model or "flux/schnell", "prompt": prompt,
         "size": f"{size}x{size}", "n": 1, "response_format": "b64_json"},
        {"Authorization": f"Bearer {key}"} if key else {},
        timeout=300,
    )
    d = j["data"][0]
    if d.get("b64_json"):
        return base64.b64decode(d["b64_json"])
    return _get_bytes(d["url"])


def gen_gemini(prompt, key, seed=0, size=1024, model="", image_b64=""):
    """Google Gemini image generation — FREE API tier (aistudio.google.com).
    With image_b64: restyles the user's photo while keeping the person
    consistent (Gemini's signature strength)."""
    slug = model or "gemini-2.5-flash-image"
    parts = []
    if image_b64:
        parts.append({"inlineData": {"mimeType": "image/jpeg", "data": image_b64}})
        parts.append({"text": (
            "Transform this photo into: " + prompt +
            ". Keep the person's face, identity and likeness exactly consistent."
        )})
    else:
        parts.append({"text": f"Generate an image: {prompt}"})
    j = _post_json(
        f"https://generativelanguage.googleapis.com/v1beta/models/{slug}:generateContent?key={key}",
        {"contents": [{"parts": parts}]},
        {},
        timeout=300,
    )
    for cand in j.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            data = part.get("inlineData", {}).get("data")
            if data:
                return base64.b64decode(data)
    raise RuntimeError("Gemini returned no image (model may need image output enabled)")


def gen_hf(prompt, key, seed=0, size=1024, model=""):
    """Hugging Face serverless inference — free tier with a free token."""
    slug = model or "black-forest-labs/FLUX.1-schnell"
    req = urllib.request.Request(
        f"https://router.huggingface.co/hf-inference/models/{slug}",
        data=json.dumps({"inputs": prompt, "parameters": {"seed": seed}}).encode(),
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {key}", **UA},
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        data = r.read()
    if data[:1] == b"{":
        raise RuntimeError("HF: " + data[:150].decode(errors="ignore"))
    return data


def gen_aihorde(prompt, key, seed=0, size=1024, model=""):
    """AI Horde — crowdsourced GPU network. Genuinely free, works even
    anonymously (key '0000000000'); a free registered key jumps the queue."""
    apikey = key.strip() or "0000000000"
    # anonymous requests are capped at 644px by the Horde; a free registered
    # key unlocks full 1024 (and priority). 640 = largest 64-multiple under cap.
    dim = 1024 if apikey != "0000000000" else 576
    j = _post_json(
        "https://aihorde.net/api/v2/generate/async",
        {
            "prompt": prompt,
            "params": {"width": dim, "height": dim, "n": 1,
                       "seed": str(seed), "steps": 24},
            "nsfw": False, "r2": True,
            "models": [model] if model else [],
        },
        {"apikey": apikey, "Client-Agent": "rollout:1.0:th3circle.app"},
        timeout=60,
    )
    job = j.get("id")
    if not job:
        raise RuntimeError("AI Horde rejected the request: " + str(j)[:120])
    # poll the queue (anonymous can take a while; cap at ~3 min)
    deadline = time.time() + 180
    while time.time() < deadline:
        time.sleep(4)
        st = json.loads(_get_bytes(
            f"https://aihorde.net/api/v2/generate/status/{job}",
            {"Client-Agent": "rollout:1.0:th3circle.app"}, timeout=30))
        if st.get("done"):
            gens = st.get("generations") or []
            if not gens:
                raise RuntimeError("AI Horde finished with no image")
            img = gens[0]["img"]
            if img.startswith("http"):
                return _get_bytes(img)
            return base64.b64decode(img)
        if st.get("faulted"):
            raise RuntimeError("AI Horde job faulted")
    raise RuntimeError("AI Horde queue timed out (~3 min) — try again or add a free key")


def gen_cloudflare(prompt, key, seed=0, size=1024, model="", base_url=""):
    """Cloudflare Workers AI — 10k free neurons/day on a free account.
    base_url field carries the Cloudflare account ID."""
    account = base_url.strip().rstrip("/").split("/")[-1]
    if not account:
        raise RuntimeError("Cloudflare needs your account ID (dash.cloudflare.com sidebar)")
    slug = model or "@cf/black-forest-labs/flux-1-schnell"
    j = _post_json(
        f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{slug}",
        {"prompt": prompt, "seed": seed},
        {"Authorization": f"Bearer {key}"},
        timeout=180,
    )
    img = (j.get("result") or {}).get("image")
    if not img:
        raise RuntimeError("Cloudflare returned no image: " + str(j)[:120])
    return base64.b64decode(img)


def gen_fal(prompt, key, seed=0, size=1024, model=""):
    """fal.ai — the aggregator hosting the premium model catalog
    (FLUX Pro, Seedream, Recraft, ...). Used with the PLATFORM key so
    artists never touch an API key — the OpenArt/NightCafe model."""
    slug = model or "fal-ai/flux/schnell"
    j = _post_json(
        f"https://fal.run/{slug}",
        {"prompt": prompt, "image_size": "square_hd", "seed": seed,
         "num_images": 1, "enable_safety_checker": True},
        {"Authorization": f"Key {key}"},
        timeout=300,
    )
    imgs = j.get("images") or []
    if not imgs:
        raise RuntimeError("fal returned no image")
    return _get_bytes(imgs[0]["url"])


PROVIDERS = {
    "builtin": gen_pollinations,
    "aihorde": gen_aihorde,      # free, even anonymous
    "gemini": gen_gemini,        # free key tier
    "huggingface": gen_hf,       # free token tier
    "cloudflare": gen_cloudflare,  # free daily quota
    "together": gen_together,
    "replicate": gen_replicate,
    "stability": gen_stability,
    "openai": gen_openai,
    "custom": gen_custom,
    "platform": gen_fal,  # our account, our credits — no user key needed
}


# --- the model catalog (what artists see as simple picks) ------------------
# Platform models run on OUR fal account (env FAL_KEY). No key in env =
# they show as "at launch" in the UI. $0 rule holds until revenue.
import os

PLATFORM_MODELS = [
    {"id": "builtin", "label": "Rollout Free", "provider": "builtin", "model": "", "tier": "free"},
    {"id": "flux-pro", "label": "FLUX Pro 1.1", "provider": "platform", "model": "fal-ai/flux-pro/v1.1", "tier": "credits"},
    {"id": "seedream", "label": "Seedream 3", "provider": "platform", "model": "fal-ai/bytedance/seedream/v3/text-to-image", "tier": "credits"},
    {"id": "recraft", "label": "Recraft V3", "provider": "platform", "model": "fal-ai/recraft/v3/text-to-image", "tier": "credits"},
    {"id": "flux-schnell", "label": "FLUX Schnell", "provider": "platform", "model": "fal-ai/flux/schnell", "tier": "credits"},
]


def platform_key():
    return os.environ.get("FAL_KEY", "")


def list_models():
    live = bool(platform_key())
    return [
        {**m, "available": m["tier"] == "free" or live}
        for m in PLATFORM_MODELS
    ]


IMG2IMG = {"gemini", "replicate"}  # engines that can restyle a photo


def generate(provider, prompt, key="", seed=0, size=1024, model="", base_url="",
             image_b64=""):
    fn = PROVIDERS.get(provider)
    if fn is None:
        raise RuntimeError(f"Unknown provider '{provider}'")
    if image_b64 and provider not in IMG2IMG:
        raise RuntimeError(
            f"'{provider}' can't restyle photos — connect Google Gemini (free) "
            "or Replicate in Settings for Restyle mode")
    try:
        if provider in ("custom", "cloudflare"):
            return fn(prompt, key, seed, size, model, base_url)
        if image_b64:
            return fn(prompt, key, seed, size, model, image_b64)
        return fn(prompt, key, seed, size, model)
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read()[:200].decode(errors="ignore")
        except Exception:
            pass
        raise RuntimeError(f"{provider}: HTTP {e.code} — {detail or e.reason}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"{provider}: unreachable ({e.reason})")
