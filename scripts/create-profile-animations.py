from __future__ import annotations

import random
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
    candidates = (
        [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "C:/Windows/Fonts/segoeuib.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
        ]
        if bold
        else [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "C:/Windows/Fonts/segoeui.ttf",
            "C:/Windows/Fonts/arial.ttf",
        ]
    )
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size * SCALE)
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


def create_maze(cols: int = 13, rows: int = 7) -> tuple[dict[tuple[int, int], dict[str, bool]], list[tuple[int, int]]]:
    walls = {(x, y): {"N": True, "S": True, "E": True, "W": True} for y in range(rows) for x in range(cols)}
    directions = [(0, -1, "N", "S"), (1, 0, "E", "W"), (0, 1, "S", "N"), (-1, 0, "W", "E")]
    rng = random.Random(314)
    start, goal = (0, rows // 2), (cols - 1, rows // 2)
    visited = {start}
    stack = [start]
    while stack:
        x, y = stack[-1]
        options = [(x + dx, y + dy, wall, reverse) for dx, dy, wall, reverse in directions if 0 <= x + dx < cols and 0 <= y + dy < rows and (x + dx, y + dy) not in visited]
        if not options:
            stack.pop()
            continue
        nx, ny, wall, reverse = rng.choice(options)
        walls[(x, y)][wall] = False
        walls[(nx, ny)][reverse] = False
        visited.add((nx, ny))
        stack.append((nx, ny))

    walls[start]["W"] = False
    walls[goal]["E"] = False

    queue = [start]
    parents: dict[tuple[int, int], tuple[int, int] | None] = {start: None}
    while queue:
        cell = queue.pop(0)
        if cell == goal:
            break
        x, y = cell
        for dx, dy, wall, _ in directions:
            neighbor = (x + dx, y + dy)
            if 0 <= neighbor[0] < cols and 0 <= neighbor[1] < rows and not walls[cell][wall] and neighbor not in parents:
                parents[neighbor] = cell
                queue.append(neighbor)

    route = []
    cell: tuple[int, int] | None = goal
    while cell is not None:
        route.append(cell)
        cell = parents[cell]
    route.reverse()
    return walls, route


def maze_frame(frame_index: int, walls: dict[tuple[int, int], dict[str, bool]], route: list[tuple[int, int]]) -> Image.Image:
    width, height = 460, 126
    image = Image.new("RGB", (width * SCALE, height * SCALE), COLORS["background"])
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((SCALE, SCALE, (width - 1) * SCALE, (height - 1) * SCALE), radius=15 * SCALE, fill=COLORS["panel"], outline=COLORS["stroke"], width=SCALE)

    cell = 11
    maze_x, maze_y = 17, 21
    cols, rows = 13, 7
    wall_color = "#58617c"
    for y in range(rows):
        for x in range(cols):
            x0, y0 = maze_x + x * cell, maze_y + y * cell
            cell_walls = walls[(x, y)]
            if cell_walls["N"]:
                draw.line((x0 * SCALE, y0 * SCALE, (x0 + cell) * SCALE, y0 * SCALE), fill=wall_color, width=2 * SCALE)
            if cell_walls["W"]:
                draw.line((x0 * SCALE, y0 * SCALE, x0 * SCALE, (y0 + cell) * SCALE), fill=wall_color, width=2 * SCALE)
            if y == rows - 1 and cell_walls["S"]:
                draw.line((x0 * SCALE, (y0 + cell) * SCALE, (x0 + cell) * SCALE, (y0 + cell) * SCALE), fill=wall_color, width=2 * SCALE)
            if x == cols - 1 and cell_walls["E"]:
                draw.line(((x0 + cell) * SCALE, y0 * SCALE, (x0 + cell) * SCALE, (y0 + cell) * SCALE), fill=wall_color, width=2 * SCALE)

    start = route[0]
    goal = route[-1]
    start_center = (maze_x + (start[0] + 0.5) * cell, maze_y + (start[1] + 0.5) * cell)
    goal_center = (maze_x + (goal[0] + 0.5) * cell, maze_y + (goal[1] + 0.5) * cell)
    draw.ellipse((start_center[0] * SCALE - 3 * SCALE, start_center[1] * SCALE - 3 * SCALE, start_center[0] * SCALE + 3 * SCALE, start_center[1] * SCALE + 3 * SCALE), fill=COLORS["cyan"])
    draw.ellipse((goal_center[0] * SCALE - 4 * SCALE, goal_center[1] * SCALE - 4 * SCALE, goal_center[0] * SCALE + 4 * SCALE, goal_center[1] * SCALE + 4 * SCALE), fill="#102d27", outline="#6ce0a0", width=SCALE)

    move_frames = (len(route) - 1) * 3
    hold_frames = 10
    if frame_index >= move_frames:
        position = len(route) - 1
    else:
        position = frame_index / 3
    segment = min(int(position), len(route) - 1)
    fraction = position - segment if segment < len(route) - 1 else 0
    trail_points = []
    for x, y in route[:segment + 1]:
        trail_points.append(scaled((maze_x + (x + 0.5) * cell, maze_y + (y + 0.5) * cell)))
    if segment < len(route) - 1:
        x1, y1 = route[segment]
        x2, y2 = route[segment + 1]
        trail_points.append(scaled((maze_x + (x1 + 0.5 + (x2 - x1) * fraction) * cell, maze_y + (y1 + 0.5 + (y2 - y1) * fraction) * cell)))
    if len(trail_points) > 1:
        draw.line(trail_points, fill="#26606c", width=3 * SCALE, joint="curve")

    if segment < len(route) - 1:
        x1, y1 = route[segment]
        x2, y2 = route[segment + 1]
        dot = (maze_x + (x1 + 0.5 + (x2 - x1) * fraction) * cell, maze_y + (y1 + 0.5 + (y2 - y1) * fraction) * cell)
    else:
        x, y = route[-1]
        dot = (maze_x + (x + 0.5) * cell, maze_y + (y + 0.5) * cell)

    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    dx, dy = scaled(dot)
    glow_draw.ellipse((dx - 10 * SCALE, dy - 10 * SCALE, dx + 10 * SCALE, dy + 10 * SCALE), fill=(117, 231, 255, 150))
    glow = glow.filter(ImageFilter.GaussianBlur(5 * SCALE))
    image = Image.alpha_composite(image.convert("RGBA"), glow)
    draw = ImageDraw.Draw(image)
    draw.ellipse((dx - 3 * SCALE, dy - 3 * SCALE, dx + 3 * SCALE, dy + 3 * SCALE), fill="#e8fbff")
    draw.ellipse((dx - 2 * SCALE, dy - 2 * SCALE, dx + 2 * SCALE, dy + 2 * SCALE), fill=COLORS["cyan"])

    draw.text(scaled((191, 34)), "BLINDMAZE · ARCADE", font=font(9, True), fill=COLORS["maze"])
    draw.text(scaled((191, 58)), "Find the exit.", font=font(15, True), fill=COLORS["text"])
    draw.text(scaled((191, 79)), "Follow the light through the maze.", font=font(8), fill=COLORS["subtext"])
    draw.rounded_rectangle((191 * SCALE, 92 * SCALE, 351 * SCALE, 111 * SCALE), radius=9 * SCALE, fill="#17192c", outline="#393651", width=SCALE)
    draw.text(scaled((202, 97)), "A SMALL GAME EASTER EGG", font=font(7, True), fill=COLORS["muted"])

    return image.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    constellation = [network_frame(index) for index in range(60)]
    save_gif(constellation, ASSETS / "project-constellation.gif", 100)

    maze_walls, route = create_maze()
    move_frames = (len(route) - 1) * 3
    maze = [maze_frame(index, maze_walls, route) for index in range(move_frames + 10)]
    save_gif(maze, ASSETS / "blindmaze-easter-egg.gif", 100)
    print(f"Created project constellation ({len(constellation)} frames) and BlindMaze route ({len(maze)} frames).")


if __name__ == "__main__":
    main()
