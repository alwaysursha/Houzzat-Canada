#!/usr/bin/env python3
"""
Generate HouzzatPro Android branding assets (icon + splash).

HouzzatPro mark is its own symbol — a roofed house with an agent figure —
so it never reuses the consumer Houzzat house/heart logo. Family resemblance
comes from stroke weight, rounded caps, the chimney detail and the green
palette; the Pro palette is a mid-mint gradient instead of solid canopy.

Writes ONLY to:
  - mobile/resources-pro/
  - android-pro/app/src/main/res/

Never touches mobile/resources/ or android/ (consumer Houzzat).

Usage:
  python3 scripts/generate-pro-android-assets.py [--variant a|b]
    a = open-base house (default, most legible small)
    b = closed house outline with base line
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_RES = ROOT / "mobile/resources-pro"
ANDROID_RES = ROOT / "android-pro/app/src/main/res"

# Light mint gradient, clearly lighter than the consumer solid canopy #1A7B59.
# GRAD_MID must stay in sync with capacitor.config.pro.ts (splash/status bar).
GRAD_TOP = (150, 240, 216)  # #96F0D8
GRAD_BOT = (47, 195, 162)  # #2FC3A2
GRAD_MID = (99, 217, 189)  # #63D9BD
WHITE = (255, 255, 255, 255)
# Deep teal. White text on light mint is ~1.9:1, so wordmarks default to this.
INK = (11, 92, 73, 255)  # #0B5C49

MARK_COLORS = {"white": WHITE, "ink": INK}
MARK = WHITE  # house + agent glyph
TEXT = INK  # splash / feature-graphic wordmark

SS = 4  # supersample factor for smooth strokes


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


def gradient(w: int, h: int, diagonal: bool = True) -> Image.Image:
    """Mid-mint gradient. Diagonal for icons, near-vertical for splashes."""
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        ty = y / max(h - 1, 1)
        for x in range(w):
            tx = x / max(w - 1, 1)
            t = (tx + ty) / 2 if diagonal else min(1.0, max(0.0, ty + (tx - 0.5) * 0.08))
            px[x, y] = lerp(GRAD_TOP, GRAD_BOT, t)
    return img


def rline(draw: ImageDraw.ImageDraw, pts: list[tuple[float, float]], width: float) -> None:
    """Polyline with rounded caps/joints."""
    ipts = [(int(x), int(y)) for x, y in pts]
    draw.line(ipts, fill=MARK, width=int(width), joint="curve")
    r = width / 2
    for x, y in ipts:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=MARK)


def agent_house_mark(size: int, variant: str = "a") -> Image.Image:
    """
    White line-art house with an agent (head + shoulders) inside.
    Drawn in a 1024 design space, supersampled, then downscaled.
    """
    S = size * SS
    k = S / 1024.0
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def P(x: float, y: float) -> tuple[float, float]:
        return (x * k, y * k)

    roof_w = 64 * k
    wall_w = 56 * k

    apex = (512.0, 258.0)
    eave = (798.0, 520.0)
    slope = (eave[1] - apex[1]) / (eave[0] - apex[0])
    # Vertical (not perpendicular) half-thickness of the sloped roof stroke.
    roof_half_v = (64.0 / 2) * math.hypot(eave[0] - apex[0], eave[1] - apex[1]) / (eave[0] - apex[0])

    # Chimney: capsule drawn before the roof so the roof stroke covers its foot.
    # The bottom stops above the roof's underside at the chimney's leftmost x,
    # otherwise the lower corner pokes out beneath the roofline.
    # Kept clear of the right wall's x so the two don't read as one long post.
    chim_x0, chim_x1 = 640.0, 696.0
    chim_top = 268.0
    roof_under_left = apex[1] + (chim_x0 - apex[0]) * slope + roof_half_v
    chim_bot = roof_under_left - 8.0
    d.rounded_rectangle(
        [*P(chim_x0, chim_top), *P(chim_x1, chim_bot)],
        radius=(chim_x1 - chim_x0) / 2 * k,
        fill=MARK,
    )

    # Roof: bold chevron, rounded joints (Houzzat family stroke language).
    rline(d, [P(226, 520), P(*apex), P(*eave)], roof_w)

    baseline = 728.0

    # Walls (short, so the silhouette reads as a house without crowding).
    rline(d, [P(288, 470), P(288, baseline)], wall_w)
    rline(d, [P(736, 470), P(736, baseline)], wall_w)

    if variant == "b":
        rline(d, [P(288, baseline), P(736, baseline)], wall_w)

    # Agent: filled head + shoulders bust. Filled shapes survive 48px launchers.
    head_c = P(512, 520)
    head_r = 78 * k
    d.ellipse(
        [head_c[0] - head_r, head_c[1] - head_r, head_c[0] + head_r, head_c[1] + head_r],
        fill=MARK,
    )

    # Upper half of an ellipse → flat bottom lands exactly on the baseline.
    shoulders_top = 644.0
    shoulders_h = (baseline - shoulders_top) * 2
    d.pieslice(
        [*P(392, shoulders_top), *P(632, shoulders_top + shoulders_h)],
        start=180,
        end=360,
        fill=MARK,
    )

    # Crop to drawn content and re-square so callers control optical size
    # directly (design-space padding would otherwise shrink the mark).
    bbox = img.getbbox()
    if bbox:
        cropped = img.crop(bbox)
        side = max(cropped.size)
        square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        square.paste(
            cropped,
            ((side - cropped.size[0]) // 2, (side - cropped.size[1]) // 2),
            cropped,
        )
        img = square

    return img.resize((size, size), Image.Resampling.LANCZOS)


def compose_icon(size: int, variant: str, mark_scale: float = 0.60) -> Image.Image:
    base = gradient(size, size, diagonal=True).convert("RGBA")
    ms = int(size * mark_scale)
    mark = agent_house_mark(ms, variant)
    base.paste(mark, ((size - ms) // 2, (size - ms) // 2), mark)
    return base


def compose_foreground(size: int, variant: str, mark_scale: float = 0.56) -> Image.Image:
    """Adaptive foreground: transparent, mark inside the 66/108 safe zone."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ms = int(size * mark_scale)
    mark = agent_house_mark(ms, variant)
    canvas.paste(mark, ((size - ms) // 2, (size - ms) // 2), mark)
    return canvas


def try_font(size: int) -> ImageFont.ImageFont:
    for path in (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/SFNS.ttf",
    ):
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def compose_splash(w: int, h: int, variant: str) -> Image.Image:
    base = gradient(w, h, diagonal=False).convert("RGBA")
    short = min(w, h)

    ms = int(short * 0.24)
    mark = agent_house_mark(ms, variant)
    mx = (w - ms) // 2
    my = int(h * 0.36) - ms // 2
    base.paste(mark, (mx, my), mark)

    d = ImageDraw.Draw(base)
    title = "HouzzatPro"
    f1 = try_font(max(28, int(short * 0.058)))
    b1 = d.textbbox((0, 0), title, font=f1)
    tx = (w - (b1[2] - b1[0])) // 2
    ty = my + ms + int(short * 0.045)
    d.text((tx, ty), title, font=f1, fill=TEXT)

    sub = "For agents & admins"
    f2 = try_font(max(16, int(short * 0.028)))
    b2 = d.textbbox((0, 0), sub, font=f2)
    sx = (w - (b2[2] - b2[0])) // 2
    sy = ty + (b1[3] - b1[1]) + int(short * 0.022)
    d.text((sx, sy), sub, font=f2, fill=(*TEXT[:3], 225))
    return base


def compose_feature_graphic(variant: str) -> Image.Image:
    w, h = 1024, 500
    base = gradient(w, h, diagonal=False).convert("RGBA")
    ms = 240
    mark = agent_house_mark(ms, variant)
    base.paste(mark, (80, (h - ms) // 2), mark)
    d = ImageDraw.Draw(base)
    d.text((376, 158), "HouzzatPro", font=try_font(66), fill=TEXT)
    d.text((376, 252), "Admin Control & Agent CRM", font=try_font(28), fill=(*TEXT[:3], 225))
    return base


DENSITIES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}


def save_mipmaps(variant: str) -> None:
    for density, (launcher, adaptive) in DENSITIES.items():
        d = ANDROID_RES / f"mipmap-{density}"
        d.mkdir(parents=True, exist_ok=True)
        legacy = compose_icon(launcher, variant)
        legacy.save(d / "ic_launcher.png", optimize=True)
        legacy.save(d / "ic_launcher_round.png", optimize=True)
        compose_foreground(adaptive, variant).save(
            d / "ic_launcher_foreground.png", optimize=True
        )
        # Gradient background layer so adaptive icons keep the mint gradient.
        gradient(adaptive, adaptive, diagonal=True).convert("RGBA").save(
            d / "ic_launcher_background.png", optimize=True
        )


SPLASH_SIZES = {
    "drawable-port-mdpi": (320, 480),
    "drawable-port-hdpi": (480, 800),
    "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (1080, 1920),
    "drawable-port-xxxhdpi": (1440, 2560),
    "drawable-land-mdpi": (480, 320),
    "drawable-land-hdpi": (800, 480),
    "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1920, 1080),
    "drawable-land-xxxhdpi": (2560, 1440),
}


def save_splashes(variant: str) -> None:
    for folder, (w, h) in SPLASH_SIZES.items():
        d = ANDROID_RES / folder
        d.mkdir(parents=True, exist_ok=True)
        compose_splash(w, h, variant).save(d / "splash.png", optimize=True)
    drawable = ANDROID_RES / "drawable"
    drawable.mkdir(parents=True, exist_ok=True)
    compose_splash(480, 800, variant).save(drawable / "splash.png", optimize=True)


def hexs(c: tuple[int, int, int]) -> str:
    return f"#{c[0]:02X}{c[1]:02X}{c[2]:02X}"


def write_resources() -> None:
    values = ANDROID_RES / "values"
    values.mkdir(parents=True, exist_ok=True)
    (values / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        f'    <color name="ic_launcher_background">{hexs(GRAD_MID)}</color>\n'
        "</resources>\n",
        encoding="utf-8",
    )
    (values / "colors.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        f'    <color name="colorPrimary">{hexs(GRAD_BOT)}</color>\n'
        f'    <color name="colorPrimaryDark">{hexs(GRAD_MID)}</color>\n'
        f'    <color name="colorAccent">{hexs(GRAD_TOP)}</color>\n'
        f'    <color name="statusBarColor">{hexs(GRAD_MID)}</color>\n'
        "</resources>\n",
        encoding="utf-8",
    )
    (ANDROID_RES / "drawable/ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
        '    android:width="108dp"\n'
        '    android:height="108dp"\n'
        '    android:viewportHeight="108"\n'
        '    android:viewportWidth="108">\n'
        "    <path\n"
        f'        android:fillColor="{hexs(GRAD_MID)}"\n'
        '        android:pathData="M0,0h108v108h-108z" />\n'
        "</vector>\n",
        encoding="utf-8",
    )
    adaptive = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@mipmap/ic_launcher_background"/>\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
        "</adaptive-icon>\n"
    )
    anydpi = ANDROID_RES / "mipmap-anydpi-v26"
    anydpi.mkdir(parents=True, exist_ok=True)
    (anydpi / "ic_launcher.xml").write_text(adaptive, encoding="utf-8")
    (anydpi / "ic_launcher_round.xml").write_text(adaptive, encoding="utf-8")


def main() -> None:
    global MARK, TEXT

    parser = argparse.ArgumentParser()
    parser.add_argument("--variant", choices=["a", "b"], default="a")
    parser.add_argument("--mark", choices=sorted(MARK_COLORS), default="white")
    parser.add_argument("--text", choices=sorted(MARK_COLORS), default="ink")
    args = parser.parse_args()
    variant = args.variant
    MARK = MARK_COLORS[args.mark]
    TEXT = MARK_COLORS[args.text]

    OUT_RES.mkdir(parents=True, exist_ok=True)

    icon = compose_icon(1024, variant)
    icon.save(OUT_RES / "icon.png", optimize=True)
    compose_foreground(1024, variant).save(OUT_RES / "icon-foreground.png", optimize=True)
    play = icon.resize((512, 512), Image.Resampling.LANCZOS)
    play.save(OUT_RES / "icon-512.png", optimize=True)
    play.save(OUT_RES / "icon-play.png", optimize=True)
    compose_splash(1440, 2560, variant).save(OUT_RES / "splash-port.png", optimize=True)
    compose_feature_graphic(variant).save(OUT_RES / "feature-graphic.png", optimize=True)

    # Preview of both marks for review (not shipped in the app).
    for v in ("a", "b"):
        compose_icon(512, v).save(OUT_RES / f"preview-icon-variant-{v}.png", optimize=True)

    save_mipmaps(variant)
    save_splashes(variant)
    write_resources()

    (OUT_RES / "README.txt").write_text(
        "HouzzatPro production branding assets.\n"
        "\n"
        f"- Mark: roofed house with an agent figure (variant {variant}).\n"
        "- Distinct from the consumer Houzzat house/heart logo.\n"
        f"- Background: light mint gradient {hexs(GRAD_TOP)} -> {hexs(GRAD_BOT)} "
        f"(mid {hexs(GRAD_MID)}).\n"
        f"- Mark colour: {hexs(MARK[:3])} ({args.mark}); "
        f"wordmark: {hexs(TEXT[:3])} ({args.text}).\n"
        "- No small launcher text; filled shapes stay legible at 48px.\n"
        "- Do NOT copy into mobile/resources/ (consumer Houzzat).\n"
        "- Regenerate: pnpm android:assets:pro [-- --variant b --mark ink --text white]\n",
        encoding="utf-8",
    )

    print(
        f"variant={variant} mark={args.mark} text={args.text} "
        f"gradient={hexs(GRAD_TOP)}->{hexs(GRAD_BOT)} mid={hexs(GRAD_MID)}"
    )
    print("wrote mobile/resources-pro + android-pro/app/src/main/res")


if __name__ == "__main__":
    main()
