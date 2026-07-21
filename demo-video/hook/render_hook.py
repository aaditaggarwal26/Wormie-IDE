from __future__ import annotations

import argparse
import math
import os
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


WIDTH = 1920
HEIGHT = 1080
FPS = 30
DURATION = 16.0


def font(size: int, weight: str = "regular", mono: bool = False) -> ImageFont.FreeTypeFont:
    candidates = (
        [r"C:\Windows\Fonts\CascadiaMono.ttf", r"C:\Windows\Fonts\consola.ttf"]
        if mono
        else (
            [r"C:\Windows\Fonts\seguisb.ttf", r"C:\Windows\Fonts\segoeuib.ttf"]
            if weight == "bold"
            else [r"C:\Windows\Fonts\segoeui.ttf"]
        )
    )
    for candidate in candidates:
        if os.path.exists(candidate):
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


F12 = font(22)
F14 = font(25)
F16 = font(29)
F18 = font(33)
F22 = font(42, "bold")
F28 = font(54, "bold")
F36 = font(70, "bold")
MONO = font(22, mono=True)
MONO_SMALL = font(18, mono=True)


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def ease(value: float) -> float:
    value = clamp(value)
    return 1 - (1 - value) ** 3


def between(t: float, start: float, end: float) -> float:
    return ease((t - start) / (end - start))


def alpha(color: tuple[int, int, int], opacity: int) -> tuple[int, int, int, int]:
    return color[0], color[1], color[2], opacity


def rounded(draw: ImageDraw.ImageDraw, box, radius: int, fill, outline=None, width: int = 1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text(draw: ImageDraw.ImageDraw, xy, value: str, face, fill, anchor=None):
    draw.text(xy, value, font=face, fill=fill, anchor=anchor)


def make_background() -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT))
    pixels = image.load()
    for y in range(HEIGHT):
        fy = y / HEIGHT
        for x in range(WIDTH):
            fx = x / WIDTH
            glow = math.exp(-((fx - 0.72) ** 2 + (fy - 0.15) ** 2) / 0.15)
            pixels[x, y] = (
                int(8 + 10 * glow),
                int(11 + 7 * glow),
                int(21 + 24 * glow),
            )
    return image


BASE = make_background()


def draw_cursor(draw: ImageDraw.ImageDraw, x: float, y: float, pressed: bool = False):
    points = [(x, y), (x + 10, y + 30), (x + 17, y + 21), (x + 28, y + 35), (x + 36, y + 29), (x + 23, y + 16), (x + 33, y + 10)]
    draw.polygon(points, fill=(250, 252, 255), outline=(7, 11, 20))
    if pressed:
        draw.ellipse((x - 16, y - 16, x + 16, y + 16), outline=(111, 156, 255), width=4)


def draw_header(draw: ImageDraw.ImageDraw, t: float):
    rounded(draw, (70, 40, 260, 86), 23, (199, 66, 123))
    text(draw, (165, 63), "THE PROBLEM", F12, (255, 255, 255), "mm")
    text(draw, (280, 63), "A familiar workflow in 2026", F12, (153, 163, 187), "lm")
    if 4.3 <= t < 12.7:
        pulse = int(20 * (0.5 + 0.5 * math.sin(t * 8)))
        rounded(draw, (1590, 45, 1848, 84), 20, (34 + pulse, 47 + pulse, 73 + pulse), (90, 111, 154))
        text(draw, (1719, 64), "8x  TIMELAPSE", F12, (211, 220, 239), "mm")


ASSIGNMENT_LINES = [
    ("Assignment 04", "label"),
    ("Build a resilient task API", "title"),
    ("Create a small service that stores tasks and", "body"),
    ("returns predictable responses for invalid input.", "body"),
    ("", "gap"),
    ("Requirements", "heading"),
    ("1. Create, update, and complete tasks", "body"),
    ("2. Validate every incoming request", "body"),
    ("3. Return useful error messages", "body"),
    ("4. Prevent duplicate task identifiers", "body"),
    ("5. Add tests for failure cases", "body"),
    ("", "gap"),
    ("Submit", "heading"),
    ("Source files, tests, and a short explanation", "body"),
]


def draw_assignment(draw: ImageDraw.ImageDraw, t: float):
    box = (70, 120, 900, 985)
    rounded(draw, box, 24, (17, 22, 36), (49, 60, 84), 2)
    draw.line((70, 190, 900, 190), fill=(49, 60, 84), width=2)
    for index, color in enumerate(((255, 95, 86), (255, 193, 70), (71, 201, 115))):
        draw.ellipse((102 + index * 30, 148, 117 + index * 30, 163), fill=color)
    text(draw, (210, 156), "COURSE PORTAL  /  CS 201", F12, (146, 157, 183), "lm")
    rounded(draw, (720, 141, 866, 174), 16, (31, 40, 59))
    text(draw, (793, 157), "DUE FRIDAY", font(18, "bold"), (195, 205, 225), "mm")

    selected = int(between(t, 0.8, 2.45) * len(ASSIGNMENT_LINES))
    y = 230
    for index, (line, kind) in enumerate(ASSIGNMENT_LINES):
        line_face = F28 if kind == "title" else (F16 if kind == "heading" else F14)
        line_color = (245, 248, 255) if kind in ("title", "heading") else (176, 186, 209)
        height = 68 if kind == "title" else (50 if kind == "gap" else 47)
        if line and index < selected and t < 3.0:
            bounds = draw.textbbox((112, y), line, font=line_face)
            rounded(draw, (100, y - 4, min(858, bounds[2] + 14), y + height - 7), 7, (50, 87, 154))
            line_color = (240, 246, 255)
        if line:
            text(draw, (112, y), line, line_face, line_color)
        y += height

    if 2.15 <= t <= 3.65:
        opacity = int(255 * min(between(t, 2.15, 2.4), 1 - between(t, 3.25, 3.65)))
        rounded(draw, (268, 890, 702, 950), 18, alpha((31, 43, 65), opacity), alpha((88, 111, 153), opacity), 2)
        text(draw, (302, 920), "COPY", F12, alpha((106, 164, 255), opacity), "lm")
        text(draw, (390, 920), "Assignment brief copied", F14, alpha((235, 240, 250), opacity), "lm")


CODE_LINES = [
    "export function createTask(input) {",
    "  const parsed = TaskInput.safeParse(input)",
    "  if (!parsed.success) {",
    "    return { status: 400, errors: parsed.error }",
    "  }",
    "",
    "  if (tasks.has(parsed.data.id)) {",
    "    return { status: 409, error: 'Task exists' }",
    "  }",
    "",
    "  tasks.set(parsed.data.id, parsed.data)",
    "  return { status: 201, task: parsed.data }",
    "}",
]


PHASES = [
    (4.55, "Reading assignment requirements"),
    (5.35, "Planning implementation"),
    (6.25, "Writing validation logic"),
    (7.35, "Adding failure-case tests"),
    (8.55, "Running project checks"),
    (9.55, "Fixing test failures"),
    (10.55, "Running checks again"),
    (11.45, "Preparing final solution"),
]


def draw_agent(draw: ImageDraw.ImageDraw, t: float):
    box = (940, 120, 1850, 985)
    rounded(draw, box, 24, (15, 20, 33), (49, 60, 84), 2)
    draw.line((940, 190, 1850, 190), fill=(49, 60, 84), width=2)
    rounded(draw, (975, 145, 1008, 178), 10, (104, 116, 255))
    text(draw, (1026, 161), "AI AGENT", F14, (242, 245, 252), "lm")
    draw.ellipse((1745, 151, 1758, 164), fill=(79, 209, 129))
    text(draw, (1770, 157), "READY", font(18, "bold"), (138, 153, 181), "lm")

    if t < 4.25:
        text(draw, (990, 245), "How can I help?", F22, (236, 240, 249))
        text(draw, (990, 300), "Paste a task or describe what you need built.", F14, (127, 140, 167))
        rounded(draw, (985, 720, 1805, 925), 20, (22, 29, 46), (64, 77, 103), 2)
        if t < 3.15:
            text(draw, (1020, 760), "Message the agent...", F14, (91, 104, 130))
        else:
            reveal = int(between(t, 3.15, 3.7) * 5)
            pasted = [
                "Complete this assignment:",
                "Build a resilient task API.",
                "Validate all requests and add tests.",
                "Return the complete implementation.",
                "[2,841 characters pasted]",
            ]
            for index, line in enumerate(pasted[:reveal]):
                text(draw, (1020, 752 + index * 32), line, MONO_SMALL, (200, 211, 233) if index < 4 else (105, 155, 255))
        rounded(draw, (1727, 846, 1781, 900), 17, (94, 110, 255) if t >= 3.7 else (48, 57, 77))
        text(draw, (1754, 873), "↑", F16, (255, 255, 255), "mm")
    elif t < 12.7:
        rounded(draw, (976, 218, 1815, 282), 16, (25, 34, 53))
        text(draw, (1000, 250), "Complete this assignment: build the task API...", MONO_SMALL, (160, 172, 197), "lm")

        rounded(draw, (976, 312, 1815, 725), 18, (10, 15, 26), (41, 52, 74))
        text(draw, (1000, 342), "src/task-service.ts", MONO_SMALL, (112, 143, 205))
        draw.line((976, 372, 1815, 372), fill=(41, 52, 74), width=1)
        progress = between(t, 5.25, 10.8)
        visible = max(1, int(progress * len(CODE_LINES)))
        start = max(0, visible - 10)
        for row, line in enumerate(CODE_LINES[start:visible]):
            number = start + row + 1
            y = 397 + row * 29
            text(draw, (1000, y), f"{number:>2}", MONO_SMALL, (72, 83, 105))
            color = (202, 213, 236)
            if "return" in line:
                color = (199, 145, 255)
            elif "safeParse" in line or "tasks." in line:
                color = (103, 191, 255)
            text(draw, (1045, y), line, MONO_SMALL, color)

        rounded(draw, (976, 753, 1815, 935), 18, (22, 29, 46), (49, 60, 84))
        current = 0
        for index, (start_time, _) in enumerate(PHASES):
            if t >= start_time:
                current = index
        for offset, index in enumerate(range(max(0, current - 2), current + 1)):
            _, label = PHASES[index]
            y = 790 + offset * 44
            done = index < current
            draw.ellipse((1000, y - 7, 1016, y + 9), fill=(70, 201, 124) if done else (105, 137, 255))
            if not done:
                angle = t * 8
                draw.arc((996, y - 11, 1020, y + 13), int(angle * 60) % 360, int(angle * 60) % 360 + 230, fill=(186, 204, 255), width=3)
            text(draw, (1034, y + 1), label, F12, (132, 145, 171) if done else (224, 230, 244), "lm")
        elapsed = max(0.0, t - 4.3)
        text(draw, (1775, 907), f"00:{elapsed:04.1f}", MONO_SMALL, (105, 121, 151), "rm")
    else:
        rounded(draw, (1015, 280, 1775, 840), 25, (21, 31, 43), (51, 110, 77), 2)
        draw.ellipse((1312, 345, 1402, 435), fill=(47, 160, 95))
        text(draw, (1357, 389), "✓", F28, (255, 255, 255), "mm")
        text(draw, (1395, 490), "Solution ready", F28, (241, 248, 244), "mm")
        text(draw, (1395, 550), "Implementation and tests completed", F14, (148, 164, 179), "mm")
        stats = (("6", "FILES"), ("418", "LINES"), ("PASS", "CHECKS"))
        for index, (value, label) in enumerate(stats):
            x = 1160 + index * 235
            text(draw, (x, 655), value, F22, (119, 225, 163), "mm")
            text(draw, (x, 704), label, F12, (116, 133, 153), "mm")


def draw_moving_cursor(draw: ImageDraw.ImageDraw, t: float):
    if t < 2.5:
        p = between(t, 0.65, 2.35)
        draw_cursor(draw, 830 - p * 35, 260 + p * 610)
    elif t < 3.2:
        p = between(t, 2.5, 3.2)
        draw_cursor(draw, 795 + (1710 - 795) * p, 870 + (800 - 870) * p)
    elif t < 4.25:
        p = between(t, 3.7, 4.05)
        draw_cursor(draw, 1710 + 38 * p, 800 + 72 * p, 3.95 <= t <= 4.12)


def draw_final_message(image: Image.Image, t: float):
    if t < 12.8:
        return
    opacity = int(218 * between(t, 12.8, 13.35))
    veil = Image.new("RGBA", (WIDTH, HEIGHT), (2, 4, 10, opacity))
    image.paste(veil, (0, 0), veil)
    draw = ImageDraw.Draw(image, "RGBA")
    first_alpha = int(255 * between(t, 13.0, 13.55))
    second_alpha = int(255 * between(t, 13.75, 14.45))
    text(draw, (960, 476), "THE ASSIGNMENT IS COMPLETE.", F28, alpha((245, 247, 252), first_alpha), "mm")
    text(draw, (960, 565), "THE LEARNING NEVER STARTED.", F36, alpha((255, 91, 129), second_alpha), "mm")
    if t >= 14.4:
        draw.line((710, 646, 1210, 646), fill=alpha((91, 104, 132), int(170 * between(t, 14.4, 14.9))), width=2)


def render_frame(t: float) -> Image.Image:
    image = BASE.copy().convert("RGBA")
    draw = ImageDraw.Draw(image, "RGBA")
    draw_header(draw, t)
    draw_assignment(draw, t)
    draw_agent(draw, t)
    draw_moving_cursor(draw, t)
    draw_final_message(image, t)
    return image.convert("RGB")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ffmpeg", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    command = [
        args.ffmpeg,
        "-y",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s:v",
        f"{WIDTH}x{HEIGHT}",
        "-r",
        str(FPS),
        "-i",
        "-",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "17",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(output),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    assert process.stdin is not None
    try:
        for frame_number in range(int(DURATION * FPS)):
            frame = render_frame(frame_number / FPS)
            process.stdin.write(frame.tobytes())
    finally:
        process.stdin.close()
    code = process.wait()
    if code != 0:
        raise SystemExit(code)


if __name__ == "__main__":
    main()
