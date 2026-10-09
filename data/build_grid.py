"""Write data/grid.json: the 36 Delhi grid cells from risk.grid.cells().

Run from the repo root:  .venv/bin/python data/build_grid.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from risk.grid import cells  # noqa: E402


def main() -> None:
    out = ROOT / "data" / "grid.json"
    grid = [{k: c[k] for k in ("id", "lat", "lon", "bounds")} for c in cells()]
    assert len(grid) == 36, len(grid)
    out.write_text("[\n" + ",\n".join(json.dumps(c) for c in grid) + "\n]\n", encoding="utf-8")
    print(f"wrote {out.relative_to(ROOT)} ({len(grid)} cells)")


if __name__ == "__main__":
    main()
