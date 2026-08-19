"""Rollout caption generator: vibe-driven promo captions for the release window.

$0 rule: pure templating seeded by the real vibe analysis — no hosted LLM.
Each caption carries a {LINK} slot so Step 6 (live link sync) can inject the
streaming URL the moment it exists.

Now description-aware (the artist's own words about the song shape the copy),
variant-aware (regenerate gives a fresh take), and tier-scalable (higher tiers
get a longer campaign via `count`).
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
    "introspective": ["this one is a conversation with myself", "for the late night overthinkers", "sometimes the song is the therapy"],
    "triumphant": ["proof that I made it through", "play this like you already won", "this is what the other side sounds like"],
}

HASHTAG_BASE = ["newmusic", "independentartist", "unreleasedmusic", "musicrelease"]
MOOD_TAGS = {
    "emotional": ["deepmusic", "musicthatheals"], "moody": ["darkpop", "nightdrive"],
    "driving": ["nightdrive", "carmusic"], "bright": ["feelgoodmusic"],
    "uplifting": ["motivation"], "energetic": ["hypemusic"],
    "mellow": ["chillmusic", "lofivibes"], "crisp": ["producerlife"], "warm": ["vibes"],
    "dreamy": ["dreampop", "etherealmusic"], "aggressive": ["hardestout"], "romantic": ["slowjam", "lovesongs"],
    "introspective": ["deepthoughts", "musicthatheals"], "triumphant": ["motivation", "winning"],
}


def _pick(rng, mood_pool):
    lines = []
    for m in mood_pool:
        lines += MOOD_LINES.get(m, [])
    return rng.choice(lines) if lines else "new one on the way"


def _lyric_quotes(lyrics, rng, n=3):
    """Pick short, punchy lines from the real lyrics to quote in captions."""
    if not lyrics:
        return []
    lines = [ln.strip() for ln in lyrics.splitlines()]
    good = [ln for ln in dict.fromkeys(lines) if 10 <= len(ln) <= 45]
    rng.shuffle(good)
    return good[:n]


def _about_sentences(about):
    """Split the artist's description into usable sentence fragments."""
    if not about:
        return []
    parts = [p.strip() for p in about.replace("\n", " ").replace("!", ".").replace("?", ".").split(".")]
    return [p for p in parts if len(p) >= 8]


def generate_captions(title, artist, moods=None, keywords=None, date="", link="",
                      lyrics="", about="", variant=0, count=7):
    moods = [m.lower() for m in (moods or [])]
    keywords = keywords or []
    about = (about or "").strip()
    # variant salts the seed so "Regenerate" produces a genuinely fresh plan
    # while a given (song, variant) stays stable across page reloads.
    rng = random.Random(f"{title}|{artist}|{variant}")
    quotes = _lyric_quotes(lyrics, rng)
    abouts = _about_sentences(about)
    rng.shuffle(abouts)

    def about_line(fallback):
        return abouts[0] if abouts else fallback

    def about_line2(fallback):
        return abouts[1] if len(abouts) > 1 else about_line(fallback)

    t = title.upper()
    when = f" {date}" if date else " soon"
    link_slot = link.strip() or "{LINK}"

    tags = list(HASHTAG_BASE)
    for m in moods:
        tags += MOOD_TAGS.get(m, [])
    tags = " ".join("#" + x for x in dict.fromkeys(tags))

    # A caption POOL ordered by PRIORITY (essentials first). We return the top
    # `count` — so a short (free) plan still lands a coherent arc (announce →
    # drop → thanks), and longer (paid) plans fill in the full campaign. Each
    # carries a `day` offset relative to release so the calendar is self-describing.
    pool = [
        {"id": "dropday", "day": 0, "phase": "release-day", "platform": "All", "label": "Drop day",
         "text": f"{t} IS OUT EVERYWHERE.\n\nstream it here: {link_slot}\n\n{about_line(_pick(rng, moods))}.\n\n{tags}"},
        {"id": "announce", "day": -14, "phase": "pre-release", "platform": "All", "label": "Announcement",
         "text": f"{t}. out{when}.\n\n{about_line(_pick(rng, moods))}.\n\n{tags}"},
        {"id": "thanks", "day": 7, "phase": "post-release", "platform": "All", "label": "Fan thank-you",
         "text": f"a week of {t}. every stream, every share, every message — I see all of it. this is why I make music.\n\nif you haven't heard it yet: {link_slot}"},
        {"id": "behind", "day": -7, "phase": "pre-release", "platform": "Instagram", "label": "Behind the song",
         "text": (f"the story behind {t}:\n\n{about_line('every sound on this record was a choice')}."
                  + (f" {about_line2('')}." if len(abouts) > 1 else "")
                  + f"\n\ndrops{when}. comment and I'll remind you.")},
        {"id": "countdown", "day": -3, "phase": "pre-release", "platform": "TikTok / Reels", "label": "Countdown teaser",
         "text": (f'"{quotes[0]}"\n\n{title} drops{when} 🖤\n\n{tags}' if quotes
                  else f"POV: you've been sitting on a song called {title} and it finally drops{when} 🖤\n\n{about_line(_pick(rng, moods))}\n\n{tags}")},
        {"id": "post1", "day": 3, "phase": "post-release", "platform": "TikTok / Reels", "label": "Week-one push",
         "text": (f'"{quotes[1]}" — {title}, out now\n\nfull song: {link_slot}\n\n{tags}' if len(quotes) > 1
                  else f"if {title.lower()} shows up on your fyp it's because the algorithm knows you need it.\n\nfull song: {link_slot}\n\n{tags}")},
        {"id": "dropday_short", "day": 0, "phase": "release-day", "platform": "X / Stories", "label": "Drop day (short)",
         "text": f"{t} is out now.\n{link_slot}"},
        {"id": "teaser", "day": -10, "phase": "pre-release", "platform": "TikTok / Reels", "label": "First teaser",
         "text": f"something's coming.\n\n{about_line(_pick(rng, moods))}.\n\n{title}{when}. 🔒\n\n{tags}"},
        {"id": "lastcall", "day": -1, "phase": "pre-release", "platform": "Stories", "label": "Night before",
         "text": f"tomorrow.\n\n{t}. set your reminder. {about_line('you are not ready').lower()}."},
        {"id": "lyricpush", "day": 5, "phase": "post-release", "platform": "Instagram", "label": "Lyric moment",
         "text": (f'"{quotes[2] if len(quotes) > 2 else (quotes[0] if quotes else about_line(title))}"\n\n'
                  f"this line hits different. {title} — out now: {link_slot}\n\n{tags}")},
        {"id": "milestone", "day": 14, "phase": "post-release", "platform": "All", "label": "Two-week milestone",
         "text": f"two weeks of {t}. 🖤\n\n{about_line('thank you for hearing me')}.\n\nstill on repeat? {link_slot}"},
        {"id": "playlist", "day": 21, "phase": "post-release", "platform": "All", "label": "Playlist pitch",
         "text": f"if {title} lives in your rotation, add it to a playlist so it finds the next person who needs it.\n\n{link_slot}\n\n{tags}"},
        {"id": "duet", "day": 10, "phase": "post-release", "platform": "TikTok", "label": "Creator prompt",
         "text": f"use {title} in your next post — I'm watching the tag and reposting my favorites.\n\n{about_line(_pick(rng, moods))}.\n\n{tags}"},
        {"id": "throwback", "day": 28, "phase": "post-release", "platform": "All", "label": "One-month mark",
         "text": f"a month since {t} dropped and it still means everything to me.\n\n{about_line('this one was real')}.\n\n{link_slot}"},
    ]

    count = max(1, min(int(count or 7), len(pool)))
    chosen = pool[:count]
    # present the calendar in chronological order
    chosen = sorted(chosen, key=lambda c: c["day"])
    return {"captions": chosen, "has_link": bool(link.strip()), "count": len(chosen)}
