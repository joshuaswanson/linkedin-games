"""Build the page. By default it ships no puzzles: they are generated in the
browser. `--with-linkedin` also lists the archived LinkedIn puzzles."""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent


def load(name: str):
    folder, file = name.split("_")
    spec = importlib.util.spec_from_file_location(name, ROOT / folder / f"{file}.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


tango = load("tango_solver")
queens = load("queens_solver")
assemble = load("web_assemble")


def number_key(path: Path) -> tuple:
    m = re.match(r"(\d+)", path.stem)
    return (0, -int(m.group(1))) if m else (1, path.stem)


def tango_entry(puzzle, path: Path) -> dict:
    grid, _ = tango.solve(puzzle)
    return {
        "n": puzzle.n,
        "givens": puzzle.grid,
        "edges": [{"a": a, "b": b, "type": kind} for (a, b), kind in puzzle.edges.items()],
        "solution": ["".join(row) for row in grid],
        "source": puzzle.source,
    }


def queens_entry(puzzle, path: Path) -> dict:
    queens_set, _ = queens.solve(puzzle)
    return {
        "n": puzzle.n,
        "regions": ["".join(row) for row in puzzle.regions],
        "labels": puzzle.labels,
        "colors": [puzzle.colors[label] for label in puzzle.labels],
        "names": [puzzle.color_name(label) for label in puzzle.labels],
        "solution": sorted(queens_set),
        "source": puzzle.source,
    }


def tango_entries() -> list[dict]:
    entries = []
    base = ROOT / "tango" / "puzzles"
    for path in sorted(base.glob("*.txt"), reverse=True) + sorted(base.glob("linkedin/*.txt"), key=number_key):
        puzzle = tango.Puzzle.parse(path.read_text())
        m = re.search(r"#(\d+)\s*(.*?)(?:\s*\(|$)", puzzle.source)
        title = f"#{m.group(1)}" + (f" {m.group(2)}" if m and m.group(2) else "") if m else path.stem
        if path.parent == base:
            title = path.stem + (f" (#{m.group(1)})" if m else "")
        entries.append({**tango_entry(puzzle, path), "game": "tango", "id": path.stem, "title": title, "group": "LinkedIn"})
    return entries


def queens_entries() -> list[dict]:
    entries = []
    base = ROOT / "queens" / "puzzles"
    for path in sorted(base.glob("*.txt"), reverse=True) + sorted(base.glob("linkedin/*.txt"), key=number_key):
        puzzle = queens.Puzzle.parse(path.read_text())
        m = re.search(r"#(\d+)", puzzle.source)
        title = path.stem if path.parent == base else f"#{m.group(1)}" if m else path.stem
        entries.append({**queens_entry(puzzle, path), "game": "queens", "id": path.stem, "title": title, "group": "LinkedIn"})
    return entries


def main() -> int:
    entries = tango_entries() + queens_entries() if "--with-linkedin" in sys.argv[1:] else []
    out = assemble.linked({"puzzles": entries}, ROOT / "site")
    size = sum(f.stat().st_size for f in (ROOT / "site").iterdir()) // 1024
    counts = {g: sum(e["game"] == g for e in entries) for g in ("tango", "queens")}
    print(f"wrote {out} ({size} KB in site/): {counts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
