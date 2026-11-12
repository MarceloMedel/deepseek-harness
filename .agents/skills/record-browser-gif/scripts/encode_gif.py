#!/usr/bin/env python3
"""Encode lexically ordered browser screenshots into a verified GIF.

The encoder is Pillow, not ffmpeg. Two measured reasons: this deployment ships no
media binaries — ffmpeg costs +451 MB through apt and its static build unpacks to
552 MB, against +6.1 MB for `python3-pil` — and a UI screenshot is flat colour, so
the dithering that makes ffmpeg's two-pass palette look right here only adds noise
the GIF then has to compress.

Measured on this repository's own GUI at 1200x750, three frames, 6.5 s: this
palette reproduces the brand accent `#d40000` at `#d71212` where a plain
frequency-ranked palette turned it into `#704e50`, and the file lands at 33 KB
against ffmpeg's 100 KB.

Palette construction, in this order:

1. **Rescue the saturated colours.** A brand accent covers a few dozen pixels out
   of a million, so a frequency-ranked palette spends nothing on it and the accent
   turns brown. The most chromatic colours are reserved before anything else.
2. **Cover the rest** at the requested colour count with Pillow's max-coverage
   quantizer over every frame at once — one palette for the animation, so colours
   do not shift between states.
3. **No dithering.** Each pixel takes the nearest reserved or covered colour, which
   keeps text edges crisp and keeps the output compressible.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter
from pathlib import Path
from typing import NoReturn

try:
    from PIL import Image, ImageSequence
except ImportError:  # the image ships python3-pil; a bare interpreter must say so
    raise SystemExit(
        "error: Pillow is required (import PIL failed). Install python3-pil; the encoder "
        "does not download media or imaging binaries."
    ) from None

DEFAULT_MAX_BYTES = 5 * 1024 * 1024

# Colours at least this chromatic are candidates for rescue: panels, borders and
# text greys are the covered majority and never the accent.
VIVID_CHROMA = 60
# Two rescue candidates closer than this are the same accent, so only one is kept.
RESCUE_MIN_DISTANCE = 12
# How many accent colours to reserve before the coverage pass.
RESCUE_SLOTS = 10
# The byte budget shrinks colours first, then width, down to these floors.
COLOR_FLOOR = 16
WIDTH_FLOOR = 480


def fail(message: str) -> NoReturn:
    """Exit with a concise user-correctable error."""
    raise SystemExit(f"error: {message}")


def positive_float(value: str) -> float:
    """Parse one finite positive command-line number."""
    try:
        parsed = float(value)
    except ValueError:
        fail(f"expected a number, got {value!r}")
    if not math.isfinite(parsed) or parsed <= 0:
        fail(f"expected a positive finite number, got {value!r}")
    return parsed


def positive_int(value: str) -> int:
    """Parse one positive command-line integer."""
    try:
        parsed = int(value)
    except ValueError:
        fail(f"expected an integer, got {value!r}")
    if parsed <= 0:
        fail(f"expected a positive integer, got {value!r}")
    return parsed


def parse_durations(value: str, frame_count: int) -> list[int]:
    """Expand one hold duration or validate one per frame, rounded to GIF centiseconds."""
    parts = [part.strip() for part in value.split(",")]
    if not parts or any(not part for part in parts):
        fail("--durations must be a number or a comma-separated list of numbers")
    seconds = [positive_float(part) for part in parts]
    if len(seconds) == 1:
        seconds = seconds * frame_count
    elif len(seconds) != frame_count:
        fail(f"--durations supplied {len(seconds)} values for {frame_count} frames")
    milliseconds = [int(round(value * 1000)) for value in seconds]
    if any(value < 20 for value in milliseconds):
        fail("every hold must be at least 0.02s, the shortest delay most viewers honour")
    # GIF holds are centiseconds; rounding here is what makes the written file and
    # the reported timeline agree.
    return [int(round(value / 10) * 10) for value in milliseconds]


def pixels(image: Image.Image) -> list[tuple[int, int, int]]:
    """Flatten an image to its pixel list across Pillow versions."""
    if hasattr(image, "get_flattened_data"):
        return list(image.get_flattened_data())
    return list(image.getdata())


def distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    """Euclidean distance between two colours."""
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


def load_frames(frame_dir: Path, pattern: str, max_width: int) -> tuple[list[Path], list[Image.Image]]:
    """Read every frame, prove the sizes match, and scale them to the requested width."""
    paths = sorted(path.resolve() for path in frame_dir.glob(pattern) if path.is_file())
    if len(paths) < 2:
        fail(f"expected at least two frames matching {pattern!r} in {frame_dir}")
    loaded: list[Image.Image] = []
    dimensions: set[tuple[int, int]] = set()
    for path in paths:
        try:
            with Image.open(path) as image:
                image.load()
                rgb = image.convert("RGB")
        except OSError as error:
            fail(f"cannot read {path}: {error}")
        dimensions.add(rgb.size)
        loaded.append(rgb)
    if len(dimensions) != 1:
        fail(f"all frames must have identical dimensions, got {sorted(dimensions)}")
    width, _height = loaded[0].size
    target = min(max_width, width)
    if target == width:
        return paths, loaded
    # An even height keeps a later re-encode on the same grid the old scale filter used.
    return paths, [
        image.resize((target, max(2, round(image.height * target / image.width / 2) * 2)), Image.LANCZOS)
        for image in loaded
    ]


def rescue_colours(frames: list[Image.Image], slots: int) -> list[tuple[int, int, int]]:
    """Pick the most chromatic colours of the animation, however rare they are."""
    counts: Counter[tuple[int, int, int]] = Counter()
    for frame in frames:
        counts.update(pixels(frame))
    ranked = sorted(
        ((max(rgb) - min(rgb)) * (count ** 0.5), rgb)
        for rgb, count in counts.items()
        if max(rgb) - min(rgb) >= VIVID_CHROMA and count >= 2
    )[::-1]
    rescued: list[tuple[int, int, int]] = []
    for _score, rgb in ranked:
        if all(distance(rgb, kept) > RESCUE_MIN_DISTANCE for kept in rescued):
            rescued.append(rgb)
        if len(rescued) == slots:
            break
    return rescued


def build_palette(frames: list[Image.Image], colors: int) -> Image.Image:
    """Build one shared palette: rescued accents first, coverage for everything else."""
    slots = min(RESCUE_SLOTS, max(0, colors - COLOR_FLOOR))
    rescued = rescue_colours(frames, slots)
    strip = Image.new("RGB", (frames[0].width, sum(frame.height for frame in frames)))
    offset = 0
    for frame in frames:
        strip.paste(frame, (0, offset))
        offset += frame.height
    covered_images = (
        strip.quantize(colors=max(4, colors - len(rescued)), method=Image.Quantize.MAXCOVERAGE)
        .convert("RGB")
        .getcolors(maxcolors=1 << 16)
    ) or []
    merged: list[tuple[int, int, int]] = []
    seen: set[tuple[int, int, int]] = set()
    for rgb in rescued + [rgb for _count, rgb in covered_images]:
        if rgb not in seen:
            seen.add(rgb)
            merged.append(rgb)
    raw: list[int] = []
    for rgb in merged:
        raw.extend(rgb)
    raw = (raw + raw[-3:] * (256 - len(merged)))[:768]
    palette = Image.new("P", (1, 1))
    palette.putpalette(raw)
    return palette


def encode(frames: list[Image.Image], durations: list[int], colors: int, output: Path) -> int:
    """Quantize every frame onto the shared palette and write the animation."""
    palette = build_palette(frames, colors)
    quantized = []
    for frame, duration in zip(frames, durations):
        mapped = frame.quantize(palette=palette, dither=Image.Dither.NONE)
        mapped.info["duration"] = duration
        quantized.append(mapped)
    quantized[0].save(
        output,
        save_all=True,
        append_images=quantized[1:],
        loop=0,
        optimize=True,
        disposal=1,
    )
    return output.stat().st_size


def verify(output: Path, frames: int, durations: list[int], max_width: int, max_bytes: int) -> dict[str, object]:
    """Read the written GIF back and prove the facts the summary reports."""
    with Image.open(output) as animation:
        decoded = [frame.copy() for frame in ImageSequence.Iterator(animation)]
        loop = animation.info.get("loop")
    if len(decoded) != frames:
        fail(f"expected {frames} encoded frames, wrote {len(decoded)}")
    written = [frame.info.get("duration") or 0 for frame in decoded]
    if sum(written) != sum(durations):
        fail(f"expected a {sum(durations) / 1000:.2f}s timeline, wrote {sum(written) / 1000:.2f}s")
    width, height = decoded[0].size
    if width > max_width:
        fail(f"expected width at most {max_width}, wrote {width}")
    if loop != 0:
        fail(f"expected an infinite loop, wrote loop={loop!r}")
    size = output.stat().st_size
    if size > max_bytes:
        fail(f"output is {size} bytes, above --max-bytes {max_bytes}")
    return {"width": width, "height": height, "bytes": size, "encodedFrames": len(decoded)}


def dump_frames(output: Path, directory: Path, count: int) -> list[str]:
    """Write representative frames of the encoded GIF as PNG so they can be read."""
    with Image.open(output) as animation:
        decoded = [frame.copy().convert("RGB") for frame in ImageSequence.Iterator(animation)]
    wanted = min(count, len(decoded))
    indexes = sorted({round(index * (len(decoded) - 1) / max(1, wanted - 1)) for index in range(wanted)})
    directory.mkdir(parents=True, exist_ok=True)
    written = []
    for index in indexes:
        path = directory / f"encoded-{index:03d}.png"
        decoded[index].save(path)
        written.append(str(path))
    return written


def build_parser() -> argparse.ArgumentParser:
    """Build the command-line contract."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("frames", type=Path, help="directory containing lexically ordered frames")
    parser.add_argument("output", type=Path, help="output .gif path")
    parser.add_argument("--pattern", default="*.png", help="frame glob within the input directory")
    parser.add_argument(
        "--durations",
        default="2",
        help="one hold duration in seconds, or one comma-separated value per frame",
    )
    parser.add_argument("--max-width", type=positive_int, default=1200, help="maximum output width")
    parser.add_argument(
        "--colors",
        type=positive_int,
        default=128,
        help="palette colours, 4 through 256; saturated accent colours are reserved first",
    )
    parser.add_argument(
        "--max-bytes",
        type=positive_int,
        default=DEFAULT_MAX_BYTES,
        help="maximum output size; the encoder shrinks colours, then width, to fit it",
    )
    parser.add_argument(
        "--dump-frames",
        type=Path,
        default=None,
        help="also write representative frames of the encoded GIF as PNG into this directory",
    )
    parser.add_argument("--dump-count", type=positive_int, default=4, help="frames to dump")
    parser.add_argument("--force", action="store_true", help="replace an existing output file")
    return parser


def main() -> None:
    """Validate inputs, encode, verify, and print a JSON summary."""
    args = build_parser().parse_args()
    output = args.output.resolve()
    frame_dir = args.frames.resolve()

    if not frame_dir.is_dir():
        fail(f"frame directory does not exist: {frame_dir}")
    if output.suffix.lower() != ".gif":
        fail(f"output must end in .gif: {output}")
    if output.exists() and not args.force:
        fail(f"output already exists (pass --force to replace it): {output}")
    if not 4 <= args.colors <= 256:
        fail("--colors must be between 4 and 256")

    paths, frames = load_frames(frame_dir, args.pattern, args.max_width)
    if output in paths:
        fail("output path must not match an input frame")
    durations = parse_durations(args.durations, len(frames))

    output.parent.mkdir(parents=True, exist_ok=True)
    adjustments: list[str] = []
    colors, width = args.colors, frames[0].width
    while True:
        scaled = frames if width == args.max_width else [
            frame.resize((width, max(2, round(frame.height * width / frame.width / 2) * 2)), Image.LANCZOS)
            for frame in frames
        ]
        size = encode(scaled, durations, colors, output)
        if size <= args.max_bytes:
            break
        if colors > COLOR_FLOOR:
            colors = max(COLOR_FLOOR, colors // 2)
            adjustments.append(f"colors={colors}")
            continue
        if width > WIDTH_FLOOR:
            width = max(WIDTH_FLOOR, int(width * 0.8))
            adjustments.append(f"max-width={width}")
            continue
        output.unlink(missing_ok=True)
        fail(f"cannot fit {args.max_bytes} bytes at {COLOR_FLOOR} colours and {WIDTH_FLOOR}px wide")

    summary = verify(output, len(scaled), durations, args.max_width, args.max_bytes)
    summary.update(
        {
            "output": str(output),
            "sourceFrames": len(paths),
            "durationSeconds": sum(durations) / 1000,
            "colors": colors,
            "timelineMs": durations,
            "adjustments": adjustments,
            "encoder": "pillow",
        }
    )
    if args.dump_frames is not None:
        summary["dumpedFrames"] = dump_frames(output, args.dump_frames.resolve(), args.dump_count)
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
