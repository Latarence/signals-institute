#!/usr/bin/env python3
"""Code-generated 1200x630 Open Graph cards for /play and /trivia (share previews).

Usage: python3 make_og.py cards.json
cards.json: [{"out": "path.png", "bg": "#0A0A0A", "accent": "#A78BFA", "ink": "#F5F5F6", "muted": "#9A9AA0",
              "eyebrow": "Boltzmann", "title": "Lightpath", "sub": "One plain sentence.", "foot": "boltzmann.app/play",
              "marks": 3}]
Only the facts given in the JSON are drawn (product, page name, a description taken from the page's own
metadata, the address). No stats, no claims. Needs Pillow and DejaVu/Liberation fonts (xps has both).
Canonical twins: ~/ahl/common/frontend/src/components/{PlayKit,Trivia}/make_og.py.
"""
import json
import sys

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
FONT_DIRS = ["/usr/share/fonts/truetype/liberation2/", "/usr/share/fonts/truetype/liberation/", "/usr/share/fonts/truetype/dejavu/"]


def font(names, size):
    for d in FONT_DIRS:
        for n in names:
            try:
                return ImageFont.truetype(d + n, size)
            except OSError:
                pass
    return ImageFont.load_default()


def rgb(h):
    h = h.lstrip("#")[:6]
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3))


def wrap(draw, text, f, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        nxt = (cur + " " + w).strip()
        if draw.textlength(nxt, font=f) <= width:
            cur = nxt
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def card(c):
    bg, ac, ink, mu = rgb(c["bg"]), rgb(c["accent"]), rgb(c.get("ink", "#F5F5F6")), rgb(c.get("muted", "#9A9AA0"))
    im = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(im)
    grid = mix(bg, ink, 0.07)
    for x in range(40, W, 40):  # dot grid, technical-drawing feel
        for y in range(40, H, 40):
            d.point((x, y), fill=grid)
    d.rounded_rectangle((24, 24, W - 25, H - 25), radius=4, outline=mix(bg, ink, 0.22), width=2)  # even frame
    sans_b = ["LiberationSans-Bold.ttf", "DejaVuSans-Bold.ttf"]
    sans = ["LiberationSans-Regular.ttf", "DejaVuSans.ttf"]
    mono = ["LiberationMono-Regular.ttf", "DejaVuSansMono.ttf"]
    x = 80
    d.text((x, 92), c["eyebrow"].upper(), font=font(mono, 30), fill=ac)
    tf = font(sans_b, 104)
    title = c["title"]
    while d.textlength(title, font=tf) > W - 160 and tf.size > 60:
        tf = font(sans_b, tf.size - 6)
    d.text((x, 140), title, font=tf, fill=ink)
    sf = font(sans, 38)
    y = 140 + tf.size + 40
    for line in wrap(d, c["sub"], sf, W - 160)[:3]:
        d.text((x, y), line, font=sf, fill=mu)
        y += 52
    n = int(c.get("marks", 3))  # empty result squares: the share grid, before anyone plays
    s, g = 34, 12
    for i in range(n):
        x0 = x + i * (s + g)
        d.rounded_rectangle((x0, 486, x0 + s, 486 + s), radius=4, outline=ac, width=3)
    d.text((x, 540), c["foot"], font=font(mono, 28), fill=ink)
    im.save(c["out"], "PNG", optimize=True)
    print("wrote", c["out"])


if __name__ == "__main__":
    for c in json.load(open(sys.argv[1])):
        card(c)
