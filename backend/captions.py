"""Rollout caption generator: vibe-driven promo captions for the release window.

$0 rule: pure templating seeded by the real vibe analysis — no hosted LLM.
Each caption carries a {LINK} slot so Step 6 (live link sync) can inject the
streaming URL the moment it exists.
"""
import random

# mood -> language palette used to flavor the copy
MOOD_LINES = {
    "emotional": ["this one came from a real place", "wrote this one for the ones still healing", "not every song is for the timeline. this one is for you"],
    "moody": ["turn the lights off for this one", "late night drives only", "this one lives in the shadows"],
    "driving": ["windows down, volume up", "this one doesn't slow down", "made for motion"],
    "bright": ["sunshine in audio form", "this one feels like summer", "good energy only"],
    "uplifting": ["for anyone who needed a reminder to keep going", "this one lifts", "put this on when you need a push"],
    "energetic": ["do not play this sitting down", "instant adrenaline", "this one goes"],
    "mellow": ["slow it down with me", "for the quiet hours", "breathe. press play."],
    "crisp": ["every detail on this mix is intentional", "headphones recommended", "clean. sharp. loud."],
    "warm": ["analog heart, digital world", "this one feels like home", "warm one for the cold days"],
    "dreamy": ["float with me for three minutes", "this one lives between sleep and awake", "headphones and eyes closed"],
    "aggressive": ["play this one loud or not at all", "no soft edges on this one", "run it back until the neighbors complain"],
    "romantic": ["for the one you're thinking about right now", "slow dance energy", "send this to them. you know who."],
}

HASHTAG_BASE = ["newmusic", "independentartist", "unreleasedmusic", "musicrelease"]
MOOD_TAGS = {
    "emotional": ["deepmusic", "musicthatheals"], "moody": ["darkpop", "nightdrive"],
    "driving": ["nightdrive", "carmusic"], "bright": ["feelgoodmusic"],
    "uplifting": ["motivation"], "energetic": ["hypemusic"],
    "mellow": ["chillmusic", "lofivibes"], "crisp": ["producerlife"], "warm": ["vibes"],
    "dreamy": ["dreampop", "etherealmusic"], "aggressive": ["hardestout"], "romantic": ["slowjam", "lovesongs"],
}


def _pick(rng, mood_pool):
    lines = []
    for m in mood_pool:
        lines += MOOD_LINES.get(m, [])
    return rng.choice(lines) if lines else "new one on the way"


def _lyric_quotes(lyrics, rng, n=2):
    """Pick short, punchy lines from the real lyrics to quote in captions."""
    if not lyrics:
        return []
    lines = [ln.strip() for ln in lyrics.splitlines()]
    good = [ln for ln in dict.fromkeys(lines) if 10 <= len(ln) <= 45]
    rng.shuffle(good)
    return good[:n]


def generate_captions(title, artist, moods=None, keywords=None, date="", link="", lyrics=""):
    moods = [m.lower() for m in (moods or [])]
    keywords = keywords or []
    # deterministic per song so regenerating the page doesn't shuffle the plan
    rng = random.Random(f"{title}|{artist}")
    quotes = _lyric_quotes(lyrics, rng)

    t = title.upper()
    when = f" {date}" if date else " soon"
    link_slot = link.strip() or "{LINK}"

    tags = list(HASHTAG_BASE)
    for m in moods:
        tags += MOOD_TAGS.get(m, [])
    tags = " ".join("#" + t for t in dict.fromkeys(tags))

    caps = [
        {
            "id": "announce",
            "phase": "pre-release",
            "platform": "All",
            "label": "Announcement",
            "text": f"{t}. out{when}.\n\n{_pick(rng, moods)}.\n\n{tags}",
        },
        {
            "id": "countdown",
            "phase": "pre-release",
            "platform": "TikTok / Reels",
            "label": "Countdown teaser",
            "text": (
                f'"{quotes[0]}"\n\n{title} drops{when} 🖤\n\n{tags}'
                if quotes
                else f"POV: you've been sitting on a song called {title} and it finally drops{when} 🖤\n\n{_pick(rng, moods)}\n\n{tags}"
            ),
        },
        {
            "id": "behind",
            "phase": "pre-release",
            "platform": "Instagram",
            "label": "Behind the song",
            "text": f"the story behind {t}:\n\n{_pick(rng, moods)}. every sound on this record was a choice — {', '.join(keywords[:3]) if keywords else 'every detail'}.\n\ndrops{when}. comment and I'll remind you.",
        },
        {
            "id": "dropday",
            "phase": "release-day",
            "platform": "All",
            "label": "Drop day",
            "text": f"{t} IS OUT EVERYWHERE.\n\nstream it here: {link_slot}\n\n{_pick(rng, moods)}.\n\n{tags}",
        },
        {
            "id": "dropday_short",
            "phase": "release-day",
            "platform": "X / Stories",
            "label": "Drop day (short)",
            "text": f"{t} is out now.\n{link_slot}",
        },
        {
            "id": "post1",
            "phase": "post-release",
            "platform": "TikTok / Reels",
            "label": "Week-one push",
            "text": (
                f'"{quotes[1]}" — {title}, out now\n\nfull song: {link_slot}\n\n{tags}'
                if len(quotes) > 1
                else f"if {title.lower()} shows up on your fyp it's because the algorithm knows you need it.\n\nfull song: {link_slot}\n\n{tags}"
            ),
        },
        {
            "id": "thanks",
            "phase": "post-release",
            "platform": "All",
            "label": "Fan thank-you",
            "text": f"a week of {t}. every stream, every share, every message — I see all of it. this is why I make music.\n\nif you haven't heard it yet: {link_slot}",
        },
    ]
    return {"captions": caps, "has_link": bool(link.strip())}
