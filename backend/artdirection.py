"""Rollout art direction — the album-cover design knowledge every generation
draws from.

Distilled from how real covers are made (composition, genre visual language,
typography tradition) and from analog-photography prompt craft (film stocks,
optics, imperfection) so output reads DESIGNED and PHOTOGRAPHED, not rendered.

Core stance: an album cover is a designed artifact — one focal idea, honest
photographic or print language, restrained palette, real texture. The enemy
is the "AI look": hyperreal digital render, oversaturated everything,
perfect symmetry with no grain, fantasy-art lighting.
"""

# Always-on craft rules (applied to every prompt)
BASE = (
    "album cover art, single strong focal idea, intentional negative space, "
    "square composition, no text, no lettering, no words, no watermark"
)

# The anti-AI-look counterweight: photographic imperfection + restraint
AUTHENTIC = (
    "restrained natural color palette, subtle film grain, "
    "slight imperfection, believable light"
)

AVOID = (
    "avoid: hyperreal 3d render, glossy digital art, oversaturated colors, "
    "fantasy concept art, perfect airbrushed skin"
)

# --- style archetypes ------------------------------------------------------
# Each is a real album-art tradition: prompt language + a layer recipe the
# canvas auto-applies (user can still tweak every layer).
STYLES = {
    "film": {
        "label": "Film Photo",
        "prompt": (
            "35mm film photograph, shot on Kodak Portra 400, natural light, "
            "candid documentary feel, halation on highlights, fine film grain, "
            "shallow depth of field"
        ),
        "layers": {
            "wash": {"color1": "#2B2438", "color2": "#F0A45B", "blend": "soft-light", "opacity": 0.25},
            "texture": {"kind": "grain", "opacity": 0.3},
            "light": {"kind": "leak", "color": "#F0A45B", "opacity": 0.35},
            "type": {"layout": "bottom", "font": "Helvetica Neue"},
        },
    },
    "soul": {
        "label": "Vintage Soul",
        "prompt": (
            "1970s soul record cover photograph, warm studio portrait lighting, "
            "medium format film, earthy amber and brown tones, soft focus edges, "
            "aged print texture"
        ),
        "layers": {
            "wash": {"color1": "#F0A45B", "color2": "#2B2438", "blend": "multiply", "opacity": 0.3},
            "texture": {"kind": "grain", "opacity": 0.35},
            "light": {"kind": "vignette", "color": "#000000", "opacity": 0.6},
            "type": {"layout": "center", "font": "Georgia"},
        },
    },
    "street": {
        "label": "Street",
        "prompt": (
            "gritty street photography, direct on-camera flash at night, "
            "35mm point and shoot, harsh shadows, urban environment, "
            "raw candid energy, slight motion blur"
        ),
        "layers": {
            "wash": {"color1": "#8B5CF6", "color2": "#1A1A22", "blend": "overlay", "opacity": 0.3},
            "texture": {"kind": "grain", "opacity": 0.32},
            "light": {"kind": "vignette", "color": "#000000", "opacity": 0.55},
            "type": {"layout": "top", "font": "Arial Black"},
        },
    },
    "minimal": {
        "label": "Minimal",
        "prompt": (
            "minimalist graphic composition, one object against vast empty "
            "background, studio still life, muted monochrome palette with one "
            "accent color, swiss design restraint, soft directional light"
        ),
        "layers": {
            "wash": {"color1": "#1A1A22", "color2": "#3D3652", "blend": "multiply", "opacity": 0.2},
            "texture": {"kind": "grain", "opacity": 0.15},
            "light": {"kind": "vignette", "color": "#000000", "opacity": 0.35},
            "type": {"layout": "bottom", "font": "Helvetica Neue"},
        },
    },
    "painted": {
        "label": "Painted",
        "prompt": (
            "hand painted album artwork, expressive oil painting, visible "
            "brushstrokes, canvas texture, gallery art quality, muted palette "
            "with deliberate color accents"
        ),
        "layers": {
            "wash": {"color1": "#2E2A55", "color2": "#F0A45B", "blend": "soft-light", "opacity": 0.25},
            "texture": {"kind": "grain", "opacity": 0.2},
            "light": {"kind": "vignette", "color": "#000000", "opacity": 0.4},
            "type": {"layout": "bottom", "font": "Georgia"},
        },
    },
    "collage": {
        "label": "Collage",
        "prompt": (
            "cut and paste collage artwork, torn paper edges, xerox photocopy "
            "texture, zine aesthetic, mixed media layers, imperfect alignment, "
            "punk DIY energy"
        ),
        "layers": {
            "wash": {"color1": "#1A1A22", "color2": "#8B5CF6", "blend": "overlay", "opacity": 0.25},
            "texture": {"kind": "halftone", "opacity": 0.3},
            "light": {"kind": "vignette", "color": "#000000", "opacity": 0.4},
            "type": {"layout": "top", "font": "Courier New"},
        },
    },
    "y2k": {
        "label": "Y2K",
        "prompt": (
            "year 2000 aesthetic, chrome and iridescent surfaces, early digital "
            "camera photo, flash glare, glossy magazine print, cyber optimism, "
            "silver and electric blue palette"
        ),
        "layers": {
            "wash": {"color1": "#8B5CF6", "color2": "#46E0A8", "blend": "screen", "opacity": 0.22},
            "texture": {"kind": "scanlines", "opacity": 0.22},
            "light": {"kind": "leak", "color": "#8B5CF6", "opacity": 0.4},
            "type": {"layout": "center", "font": "Arial Black"},
        },
    },
}

# genre -> best-fit archetype (checked first in Auto)
GENRE_STYLE = {
    "hip hop rap": "street",
    "trap": "street",
    "drill": "street",
    "r&b and soul": "soul",
    "pop": "y2k",
    "electronic dance music": "y2k",
    "house music": "y2k",
    "rock": "film",
    "indie alternative": "film",
    "folk acoustic singer songwriter": "film",
    "ambient chill instrumental": "minimal",
    "afrobeats": "collage",
}

# mood -> best-fit archetype for "Auto"
MOOD_STYLE = {
    "emotional": "film",
    "moody": "street",
    "driving": "street",
    "bright": "y2k",
    "uplifting": "film",
    "energetic": "y2k",
    "mellow": "soul",
    "warm": "soul",
    "crisp": "minimal",
    "dreamy": "painted",
    "aggressive": "street",
    "romantic": "soul",
}


def direct(moods=None, keywords=None, direction="", style="auto", genre=""):
    """Build an art-directed prompt + layer recipe from the song's vibe."""
    moods = [m.lower() for m in (moods or [])]
    keywords = keywords or []

    if style == "auto" or style not in STYLES:
        style = GENRE_STYLE.get(genre) or next(
            (MOOD_STYLE[m] for m in moods if m in MOOD_STYLE), "film")

    s = STYLES[style]
    subject = direction.strip() or ", ".join(keywords[:3]) or "an evocative scene"
    mood_str = ", ".join(moods[:3]) if moods else "cinematic"

    prompt = (
        f"{BASE}, {s['prompt']}, depicting {subject}, "
        f"{mood_str} mood, {AUTHENTIC}, {AVOID}"
    )
    return {"style": style, "label": s["label"], "prompt": prompt, "layers": s["layers"]}


def list_styles():
    return [{"id": "auto", "label": "Auto (from vibe)"}] + [
        {"id": k, "label": v["label"]} for k, v in STYLES.items()
    ]
