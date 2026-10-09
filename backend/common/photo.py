"""Image handling for reports: resize, EXIF freshness, perceptual hash, EXIF-free thumbnails."""
from __future__ import annotations

import io
from datetime import datetime, timedelta

from PIL import ExifTags, Image, ImageOps

from common.config import IST

_DATETIME_ORIGINAL = next(k for k, v in ExifTags.TAGS.items() if v == "DateTimeOriginal")
_DATETIME = next(k for k, v in ExifTags.TAGS.items() if v == "DateTime")


def open_image(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    img.load()
    return img


def exif_taken_at(img: Image.Image) -> datetime | None:
    """EXIF capture time, interpreted as IST (phones store local time without a zone)."""
    try:
        exif = img.getexif()
        raw = exif.get_ifd(ExifTags.IFD.Exif).get(_DATETIME_ORIGINAL) or exif.get(_DATETIME)
    except Exception:  # noqa: BLE001
        return None
    if not raw:
        return None
    try:
        return datetime.strptime(str(raw).strip(), "%Y:%m:%d %H:%M:%S").replace(tzinfo=IST)
    except ValueError:
        return None


def too_old(img: Image.Image, now: datetime, max_age_h: float = 6) -> bool:
    """Reject only when an EXIF timestamp is present and older than max_age_h."""
    taken = exif_taken_at(img)
    return taken is not None and taken < now - timedelta(hours=max_age_h)


def _encode(img: Image.Image, long_edge: int, quality: int) -> bytes:
    img = ImageOps.exif_transpose(img).convert("RGB")
    img.thumbnail((long_edge, long_edge))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=quality, optimize=True)   # no exif= argument: metadata is dropped
    return out.getvalue()


def for_model(img: Image.Image) -> bytes:
    """1280 px long edge, JPEG quality 80, before every vision call."""
    return _encode(img, 1280, 80)


def thumbnail(img: Image.Image) -> bytes:
    """EXIF-stripped thumbnail for the public map."""
    return _encode(img, 480, 75)


def phash(img: Image.Image, size: int = 8) -> str:
    """64-bit difference hash (dHash), a perceptual hash in pure Pillow.

    Chosen over the imagehash library to keep the Lambda layer small (no numpy/scipy); see DECISIONS.md.
    """
    gray = ImageOps.exif_transpose(img).convert("L").resize((size + 1, size), Image.Resampling.LANCZOS)
    px = list(gray.getdata())
    bits = 0
    for row in range(size):
        for col in range(size):
            left, right = px[row * (size + 1) + col], px[row * (size + 1) + col + 1]
            bits = (bits << 1) | (1 if left > right else 0)
    return f"{bits:016x}"


def hamming(a: str, b: str) -> int:
    return (int(a, 16) ^ int(b, 16)).bit_count()


def is_duplicate(h: str, others: list[str], max_distance: int = 4) -> bool:
    return any(hamming(h, o) <= max_distance for o in others if o)
