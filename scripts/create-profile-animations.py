from __future__ import annotations

from math import cos, pi, sin
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SCALE = 2
COLORS = {
    "background": "#0b0b16",
    "panel": "#0f1020",
    "panel_high": "#151629",
    "stroke": "#292943",
    "muted": "#8586a8",
    "text": "#f1f2ff",
    "subtext": "#a7a8c4",
    "cyan": "#75e7ff",
    "canteen": "#55d5c9",
    "library": "#c6a5ff",
    "clinic": "#ff8fca",
    "maze": "#ffd36d",
    "school": "#8fc6ff",
}


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    inter_font = ROOT / "assets" / "fonts" / "Inter[opsz,wght].ttf"
    candidates = (
        [
            str(inter_font),
            "C:/Windows/Fonts/Inter-Bold.ttf",
            "C:/Windows/Fonts/InterVariable.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "C:/Windows/Fonts/segoeuib.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
        ]
        if bold
        else [
            str(inter_font),
            "C:/Windows/Fonts/Inter-Regular.ttf",
            "C:/Windows/Fonts/InterVariable.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "C:/Windows/Fonts/segoeui.ttf",
            "C:/Windows/Fonts/arial.ttf",
        ]
    )
    for candidate in candidates:
        try:
            loaded_font = ImageFont.truetype(candidate, size * SCALE)
            if candidate == str(inter_font) and hasattr(loaded_font, "set_variation_by_axes"):
                loaded_font.set_variation_by_axes([14, 700 if bold else 400])
            return loaded_font
        except OSError:
            continue
    return ImageFont.load_default()


def scaled(point: tuple[float, float]) -> tuple[int, int]:
    return round(point[0] * SCALE), round(point[1] * SCALE)


def bezier(start: tuple[float, float], control: tuple[float, float], end: tuple[float, float], count: int = 60) -> list[tuple[float, float]]:
    points = []
    for step in range(count + 1):
        t = step / count
        inverse = 1 - t
        x = inverse * inverse * start[0] + 2 * inverse * t * control[0] + t * t * end[0]
        y = inverse * inverse * start[1] + 2 * inverse * t * control[1] + t * t * end[1]
        points.append((x, y))
    return points


PROJECTS = [
    {"name": "CanteenOS", "detail": "Canteen System", "initial": "C", "color": COLORS["canteen"], "box": (28, 68, 278, 120), "edge": ((385, 111), (320, 65), (278, 94))},
    {"name": "LibSync", "detail": "Digital Library", "initial": "L", "color": COLORS["library"], "box": (28, 158, 278, 210), "edge": ((385, 145), (320, 205), (278, 184))},
    {"name": "MedikaFlow", "detail": "Clinic Management", "initial": "M", "color": COLORS["clinic"], "box": (722, 68, 972, 120), "edge": ((615, 111), (680, 65), (722, 94))},
    {"name": "BlindMaze", "detail": "Maze Arcade", "initial": "B", "color": COLORS["maze"], "box": (722, 158, 972, 210), "edge": ((615, 145), (680, 205), (722, 184))},
    {"name": "SMK BPPI", "detail": "School Website", "initial": "S", "color": COLORS["school"], "box": (375, 207, 625, 249), "edge": ((500, 158), (500, 181), (500, 207))},
]


def palette_frames(frames: list[Image.Image]) -> list[Image.Image]:
    sample_count = min(len(frames), 8)
    sample_indices = sorted({round(index * (len(frames) - 1) / max(sample_count - 1, 1)) for index in range(sample_count)})
    samples = Image.new("RGB", (frames[0].width, frames[0].height * len(sample_indices)))
    for index, frame_index in enumerate(sample_indices):
        frame = frames[frame_index]
        samples.paste(frame, (0, index * frame.height))
    palette = samples.quantize(colors=128, method=Image.Quantize.MEDIANCUT)
    return [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]


def save_gif(frames: list[Image.Image], path: Path, duration: int) -> None:
    optimized = palette_frames(frames)
    optimized[0].save(
        path,
        save_all=True,
        append_images=optimized[1:],
        optimize=True,
        loop=0,
        duration=duration,
        disposal=1,
    )


def network_frame(frame_index: int, frame_count: int = 60) -> Image.Image:
    width, height = 1000, 270
    image = Image.new("RGB", (width * SCALE, height * SCALE), COLORS["background"])
    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle((SCALE, SCALE, (width - 1) * SCALE, (height - 1) * SCALE), radius=20 * SCALE, fill=COLORS["panel"], outline=COLORS["stroke"], width=SCALE)
    for x in range(26, width - 20, 32):
        draw.line((x * SCALE, 20 * SCALE, x * SCALE, (height - 20) * SCALE), fill="#111222", width=1 * SCALE)
    for y in range(24, height - 14, 32):
        draw.line((20 * SCALE, y * SCALE, (width - 20) * SCALE, y * SCALE), fill="#111222", width=1 * SCALE)

    draw.text(scaled((27, 25)), "PROJECT CONSTELLATION", font=font(10, True), fill=COLORS["muted"])
    draw.text(scaled((970, 25)), "5 PUBLIC PROJECTS", font=font(9, True), fill=COLORS["muted"], anchor="ra")
    draw.line((28 * SCALE, 43 * SCALE, 972 * SCALE, 43 * SCALE), fill=COLORS["stroke"], width=SCALE)

    paths = [bezier(*project["edge"]) for project in PROJECTS]
    for points in paths:
        draw.line([scaled(point) for point in points], fill="#283047", width=2 * SCALE, joint="curve")

    seconds = frame_index / 10
    active_project = None
    pulse_overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    pulse_draw = ImageDraw.Draw(pulse_overlay)
    for index, (project, points) in enumerate(zip(PROJECTS, paths)):
        elapsed = seconds - index * 0.86
        if 0 <= elapsed <= 0.76:
            active_project = index
            progress = elapsed / 0.76
            point_index = min(round(progress * (len(points) - 1)), len(points) - 1)
            x, y = scaled(points[point_index])
            rgb = tuple(int(project["color"][position:position + 2], 16) for position in (1, 3, 5))
            pulse_draw.ellipse((x - 12 * SCALE, y - 12 * SCALE, x + 12 * SCALE, y + 12 * SCALE), fill=(*rgb, 88))
            pulse_draw.ellipse((x - 6 * SCALE, y - 6 * SCALE, x + 6 * SCALE, y + 6 * SCALE), fill=(*rgb, 170))
    pulse_overlay = pulse_overlay.filter(ImageFilter.GaussianBlur(8 * SCALE))
    image = Image.alpha_composite(image.convert("RGBA"), pulse_overlay)
    draw = ImageDraw.Draw(image)

    for index, (project, points) in enumerate(zip(PROJECTS, paths)):
        elapsed = seconds - index * 0.86
        if 0 <= elapsed <= 0.76:
            progress = elapsed / 0.76
            point_index = min(round(progress * (len(points) - 1)), len(points) - 1)
            point = scaled(points[point_index])
            draw.ellipse((point[0] - 3 * SCALE, point[1] - 3 * SCALE, point[0] + 3 * SCALE, point[1] + 3 * SCALE), fill=project["color"])

    for index, project in enumerate(PROJECTS):
        x1, y1, x2, y2 = project["box"]
        active = index == active_project
        border = project["color"] if active else "#30334b"
        draw.rounded_rectangle((x1 * SCALE, y1 * SCALE, x2 * SCALE, y2 * SCALE), radius=11 * SCALE, fill="#121426", outline=border, width=(2 if active else 1) * SCALE)
        draw.rounded_rectangle(((x1 + 1) * SCALE, (y1 + 12) * SCALE, (x1 + 4) * SCALE, (y2 - 12) * SCALE), radius=1 * SCALE, fill=project["color"])
        icon_x, icon_y = (x1 + 26) * SCALE, ((y1 + y2) / 2) * SCALE
        draw.ellipse((icon_x - 11 * SCALE, icon_y - 11 * SCALE, icon_x + 11 * SCALE, icon_y + 11 * SCALE), fill="#1b2035", outline=project["color"], width=SCALE)
        draw.text((icon_x, icon_y), project["initial"], font=font(9, True), fill=project["color"], anchor="mm")
        draw.text(((x1 + 45) * SCALE, (y1 + 15) * SCALE), project["name"], font=font(11, True), fill=COLORS["text"])
        draw.text(((x1 + 45) * SCALE, (y1 + 34) * SCALE), project["detail"], font=font(8), fill=COLORS["subtext"])

    draw.rounded_rectangle((385 * SCALE, 92 * SCALE, 615 * SCALE, 164 * SCALE), radius=17 * SCALE, fill="#17192c", outline="#53617e", width=SCALE)
    draw.ellipse((399 * SCALE, 111 * SCALE, 441 * SCALE, 153 * SCALE), fill="#10212c", outline=COLORS["cyan"], width=SCALE)
    draw.text((420 * SCALE, 132 * SCALE), "FA", font=font(10, True), fill=COLORS["cyan"], anchor="mm")
    draw.text((453 * SCALE, 122 * SCALE), "FALLABIGAIL", font=font(10, True), fill=COLORS["text"])
    draw.text((453 * SCALE, 141 * SCALE), "PROJECT HUB", font=font(8, True), fill=COLORS["muted"])

    return image.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)


def rounded_rect_path(x1: float, y1: float, x2: float, y2: float, radius: float, steps: int = 14) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []

    def line(start: tuple[float, float], end: tuple[float, float], count: int = 18) -> None:
        for index in range(count):
            t = index / count
            points.append((start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t))

    def arc(cx: float, cy: float, start: int, end: int) -> None:
        for index in range(steps):
            angle = (start + (end - start) * index / (steps - 1)) * pi / 180
            points.append((cx + radius * cos(angle), cy + radius * sin(angle)))

    line((x1 + radius, y1), (x2 - radius, y1))
    arc(x2 - radius, y1 + radius, -90, 0)
    line((x2, y1 + radius), (x2, y2 - radius))
    arc(x2 - radius, y2 - radius, 0, 90)
    line((x2 - radius, y2), (x1 + radius, y2))
    arc(x1 + radius, y2 - radius, 90, 180)
    line((x1, y2 - radius), (x1, y1 + radius))
    arc(x1 + radius, y1 + radius, 180, 270)
    points.append(points[0])
    return points


def github_badge_base(width: int = 1000, height: int = 180) -> Image.Image:
    image = Image.new("RGB", (width * SCALE, height * SCALE), "#090b14")
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((-140 * SCALE, -170 * SCALE, 520 * SCALE, 120 * SCALE), fill=(0, 193, 219, 118))
    glow_draw.ellipse((680 * SCALE, 55 * SCALE, 1160 * SCALE, 340 * SCALE), fill=(116, 54, 175, 85))
    glow = glow.filter(ImageFilter.GaussianBlur(62 * SCALE))
    image = Image.alpha_composite(image.convert("RGBA"), glow)
    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle((2 * SCALE, 2 * SCALE, (width - 3) * SCALE, (height - 3) * SCALE), radius=25 * SCALE, fill="#0b0e18", outline="#176887", width=2 * SCALE)
    draw.rounded_rectangle((31 * SCALE, 25 * SCALE, 969 * SCALE, 155 * SCALE), radius=28 * SCALE, fill="#090c15", outline="#19516e", width=2 * SCALE)

    pill = (380, 60, 620, 120)
    draw.rounded_rectangle(tuple(value * SCALE for value in pill), radius=30 * SCALE, fill="#0a0d16", outline="#315d72", width=2 * SCALE)
    draw.ellipse((402 * SCALE, 73 * SCALE, 436 * SCALE, 107 * SCALE), fill="#303640")
    draw.text((419 * SCALE, 89 * SCALE), "G", font=font(15, True), fill="#f5f7fa", anchor="mm")
    draw.text((452 * SCALE, 77 * SCALE), "GitHub", font=font(13, True), fill="#69dffa")
    draw.text((452 * SCALE, 97 * SCALE), "@FallAbigail", font=font(13, True), fill="#69dffa")
    draw.text((968 * SCALE, 137 * SCALE), "github.com", font=font(8, True), fill="#7187aa", anchor="ra")
    return image


def github_badge_frame(frame_index: int, frame_count: int = 48) -> Image.Image:
    width, height = 1000, 180
    image = github_badge_base(width, height)
    pill_path = rounded_rect_path(380, 60, 620, 120, 30)
    segment_length = max(12, round(len(pill_path) * 0.13))
    start = round(frame_index / frame_count * len(pill_path))
    points = [pill_path[(start + offset) % len(pill_path)] for offset in range(segment_length + 1)]
    high_res_points = [scaled(point) for point in points]

    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.line(high_res_points, fill=(77, 207, 255, 200), width=8 * SCALE, joint="curve")
    glow = glow.filter(ImageFilter.GaussianBlur(7 * SCALE))
    image = Image.alpha_composite(image, glow)
    draw = ImageDraw.Draw(image)

    for index in range(len(high_res_points) - 1):
        progress = index / max(len(high_res_points) - 2, 1)
        start_color = (101, 231, 255)
        end_color = (177, 132, 255)
        color = tuple(round(a + (b - a) * progress) for a, b in zip(start_color, end_color))
        draw.line((high_res_points[index], high_res_points[index + 1]), fill=color, width=3 * SCALE)

    return image.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    (ASSETS / "blindmaze-easter-egg.gif").unlink(missing_ok=True)
    (ASSETS / "project-constellation.gif").unlink(missing_ok=True)

    github_badge = [github_badge_frame(index) for index in range(48)]
    save_gif(github_badge, ASSETS / "github-profile-badge.gif", 95)
    (ASSETS / "context.svg").unlink(missing_ok=True)
    print(f"Created GitHub badge ({len(github_badge)} frames).")


if __name__ == "__main__":
    main()
