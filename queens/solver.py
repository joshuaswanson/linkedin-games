"""Deterministic solver for LinkedIn Queens puzzles.

Rules: place one queen in every row, every column and every colour region;
no two queens may touch, diagonally included.

Puzzle text format: N lines of N region labels (letters or digits).
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from itertools import combinations
from pathlib import Path

Coord = tuple[int, int]
Unit = tuple[str, int | str]

PALETTE = [
    ("lavender", "#BBA3E2"), ("blue", "#96BEFF"), ("orange", "#FFC992"), ("gray", "#DFDFDF"),
    ("green", "#B3DFA0"), ("taupe", "#B9B29E"), ("red", "#FF7B60"), ("yellow", "#E6F388"),
    ("pink", "#DFA0BF"), ("teal", "#95CBCF"), ("salmon", "#FAA889"), ("cyan", "#55EBE2"),
    ("magenta", "#FE93F1"), ("mint", "#91F5AD"), ("periwinkle", "#C9C9EE"), ("emerald", "#5BBA6F"),
]
HEX_NAMES = {hex_: name for name, hex_ in PALETTE} | {
    "#D9D9D9": "gray", "#D895B2": "pink", "#F96C51": "red", "#AF96DC": "purple", "#A6D995": "green",
    "#FBBF81": "orange", "#85B5FC": "blue", "#DCF079": "lime", "#ADA68E": "taupe", "#FFFFFF": "white",
}


class Contradiction(Exception):
    pass


class Unsolvable(Exception):
    pass


@dataclass
class Puzzle:
    n: int
    regions: list[list[str]]
    colors: dict[str, str] = field(default_factory=dict)
    source: str = ""
    labels: list[str] = field(init=False)
    region_cells: dict[str, list[Coord]] = field(init=False)
    names: dict[str, str] = field(init=False)

    def __post_init__(self) -> None:
        self.labels = []
        self.region_cells = {}
        for r in range(self.n):
            for c in range(self.n):
                label = self.regions[r][c]
                if label not in self.region_cells:
                    self.labels.append(label)
                    self.region_cells[label] = []
                self.region_cells[label].append((r, c))
        if len(self.labels) != self.n:
            raise ValueError(f"{self.n}x{self.n} grid needs {self.n} regions, found {len(self.labels)}")
        for i, label in enumerate(self.labels):
            self.colors.setdefault(label, PALETTE[i % len(PALETTE)][1])
        self.names = {}
        seen: dict[str, int] = {}
        for label in self.labels:
            name = HEX_NAMES.get(self.colors[label].upper(), "colour " + label)
            seen[name] = seen.get(name, 0) + 1
            self.names[label] = name
        for label in self.labels:
            if seen[self.names[label]] > 1:
                self.names[label] += f" ({label})"

    @classmethod
    def parse(cls, text: str) -> Puzzle:
        colors: dict[str, str] = {}
        source = ""
        rows = []
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            if line.startswith("#"):
                body = line[1:].strip()
                if body.startswith("colors:"):
                    for item in body[len("colors:"):].split():
                        label, _, hex_ = item.partition("=")
                        colors[label] = hex_
                elif body.startswith("source:"):
                    source = body[len("source:"):].strip()
                continue
            rows.append(line)
        n = len(rows)
        if any(len(row) != n for row in rows):
            raise ValueError("grid must be square")
        return cls(n, [list(row) for row in rows], colors, source)

    def render(self) -> str:
        lines = []
        if self.source:
            lines.append(f"# source: {self.source}")
        lines.append("# colors: " + " ".join(f"{label}={self.colors[label]}" for label in self.labels))
        lines += ["".join(row) for row in self.regions]
        return "\n".join(lines)

    def color_name(self, label: str) -> str:
        return self.names[label]

    def units(self) -> list[Unit]:
        return (
            [("row", i) for i in range(self.n)]
            + [("col", i) for i in range(self.n)]
            + [("region", label) for label in self.labels]
        )

    def unit_cells(self, unit: Unit) -> list[Coord]:
        kind, key = unit
        if kind == "row":
            return [(key, c) for c in range(self.n)]  # type: ignore[misc]
        if kind == "col":
            return [(r, key) for r in range(self.n)]  # type: ignore[misc]
        return self.region_cells[key]  # type: ignore[index]

    def unit_name(self, unit: Unit) -> str:
        kind, key = unit
        if kind == "row":
            return f"row {key + 1}"  # type: ignore[operator]
        if kind == "col":
            return f"column {key + 1}"  # type: ignore[operator]
        return f"the {self.color_name(key)} region"  # type: ignore[arg-type]

    def cell_units(self, cell: Coord) -> list[Unit]:
        r, c = cell
        return [("row", r), ("col", c), ("region", self.regions[r][c])]

    def neighbours(self, cell: Coord) -> list[Coord]:
        r, c = cell
        return [
            (r + dr, c + dc)
            for dr in (-1, 0, 1)
            for dc in (-1, 0, 1)
            if (dr or dc) and 0 <= r + dr < self.n and 0 <= c + dc < self.n
        ]


@dataclass
class Step:
    kind: str
    cells: list[Coord]
    reason: str
    cause: list[Coord]
    removed: list[Coord] = field(default_factory=list)

    def __str__(self) -> str:
        where = ", ".join(f"({r + 1},{c + 1})" for r, c in self.cells)
        return f"{self.kind} {where}  [{self.reason}]"


class State:
    def __init__(self, puzzle: Puzzle) -> None:
        self.p = puzzle
        self.cand = [[True] * puzzle.n for _ in range(puzzle.n)]
        self.queens: set[Coord] = set()

    def copy(self) -> State:
        s = State(self.p)
        s.cand = [row[:] for row in self.cand]
        s.queens = set(self.queens)
        return s

    def candidates(self, unit: Unit) -> list[Coord]:
        return [cell for cell in self.p.unit_cells(unit) if self.cand[cell[0]][cell[1]]]

    def has_queen(self, unit: Unit) -> bool:
        return any(q in self.p.unit_cells(unit) for q in self.queens)

    def open_units(self) -> list[Unit]:
        return [u for u in self.p.units() if not self.has_queen(u)]

    def eliminate(self, cells: list[Coord]) -> list[Coord]:
        removed = []
        for r, c in cells:
            if self.cand[r][c]:
                self.cand[r][c] = False
                removed.append((r, c))
        return removed

    def struck_by(self, cell: Coord) -> set[Coord]:
        """Cells a queen on `cell` rules out."""
        out: set[Coord] = set()
        for unit in self.p.cell_units(cell):
            out.update(self.p.unit_cells(unit))
        out.update(self.p.neighbours(cell))
        out.discard(cell)
        return out

    def place(self, cell: Coord) -> list[Coord]:
        self.queens.add(cell)
        self.cand[cell[0]][cell[1]] = False
        return self.eliminate(sorted(self.struck_by(cell)))

    def check(self) -> None:
        for unit in self.open_units():
            if not self.candidates(unit):
                raise Contradiction(f"{self.p.unit_name(unit)} has no cell left")


def find_single(state: State) -> Step | None:
    p = state.p
    for unit in state.open_units():
        cands = state.candidates(unit)
        if not cands:
            raise Contradiction(f"{p.unit_name(unit)} has no cell left")
        if len(cands) == 1:
            cell = cands[0]
            cause = [c for c in p.unit_cells(unit) if c != cell]
            return Step("queen", [cell], f"{p.unit_name(unit)} has one cell left", cause)
    return None


def find_confine(state: State, k: int) -> Step | None:
    p = state.p
    open_regions = [u for u in state.open_units() if u[0] == "region"]
    for line_kind, axis in (("row", 0), ("col", 1)):
        open_lines = [u for u in state.open_units() if u[0] == line_kind]
        for combo in combinations(open_regions, k):
            cells = [c for u in combo for c in state.candidates(u)]
            lines = {c[axis] for c in cells}
            if len(lines) != k:
                continue
            region_set = {u[1] for u in combo}
            targets = [
                c for line in sorted(lines) for c in state.candidates((line_kind, line))
                if p.regions[c[0]][c[1]] not in region_set
            ]
            if targets:
                names = join_names([p.unit_name(u) for u in combo])
                where = join_names([p.unit_name((line_kind, line)) for line in sorted(lines)])
                verb = "fits" if k == 1 else "fit"
                return Step("eliminate", targets, f"{names} {verb} only in {where}, so the other cells there are out", cells)
        for combo in combinations(open_lines, k):
            cells = [c for u in combo for c in state.candidates(u)]
            regions = {p.regions[r][c] for r, c in cells}
            if len(regions) != k:
                continue
            line_set = {u[1] for u in combo}
            targets = [
                c for label in sorted(regions, key=p.labels.index) for c in state.candidates(("region", label))
                if c[axis] not in line_set
            ]
            if targets:
                names = join_names([p.unit_name(u) for u in combo])
                where = join_names([p.unit_name(("region", label)) for label in sorted(regions, key=p.labels.index)])
                has = "has" if k == 1 else "have"
                return Step("eliminate", targets, f"{names} only {has} cells of {where}, so those queens sit there and the rest of {where} is out", cells)
    return None


def find_blocked(state: State) -> Step | None:
    p = state.p
    open_units = state.open_units()
    by_unit: dict[Unit, list[Coord]] = {}
    for r in range(p.n):
        for c in range(p.n):
            if not state.cand[r][c]:
                continue
            struck = state.struck_by((r, c))
            own = set(p.cell_units((r, c)))
            for unit in open_units:
                if unit in own:
                    continue
                if all(cell in struck for cell in state.candidates(unit)):
                    by_unit.setdefault(unit, []).append((r, c))
                    break
    if not by_unit:
        return None
    unit, cells = max(by_unit.items(), key=lambda kv: len(kv[1]))
    plural = "any of these cells" if len(cells) > 1 else "this cell"
    return Step("eliminate", cells, f"a queen on {plural} would leave {p.unit_name(unit)} with no room", state.candidates(unit))


def basic_propagate(state: State) -> None:
    while True:
        step = find_single(state) or find_confine(state, 1) or find_blocked(state)
        if step is None:
            return
        apply_step(state, step)
        state.check()


def find_by_contradiction(state: State) -> Step | None:
    p = state.p
    for r in range(p.n):
        for c in range(p.n):
            if not state.cand[r][c]:
                continue
            trial = state.copy()
            trial.place((r, c))
            try:
                trial.check()
                basic_propagate(trial)
            except Contradiction as exc:
                return Step("eliminate", [(r, c)], f"a queen at ({r + 1},{c + 1}) leads to a dead end: {exc}", [])
    return None


def apply_step(state: State, step: Step) -> None:
    if step.kind == "queen":
        step.removed = state.place(step.cells[0])
    else:
        step.removed = state.eliminate(step.cells)


def solve(puzzle: Puzzle) -> tuple[set[Coord], list[Step]]:
    state = State(puzzle)
    steps: list[Step] = []
    while len(state.queens) < puzzle.n:
        step = find_single(state) or find_confine(state, 1) or find_blocked(state)
        for k in range(2, puzzle.n):
            if step is not None:
                break
            step = find_confine(state, k)
        if step is None:
            step = find_by_contradiction(state)
        if step is None:
            raise Unsolvable("no further deduction possible")
        apply_step(state, step)
        state.check()
        steps.append(step)
    check_solution(puzzle, state.queens)
    return state.queens, steps


def check_solution(puzzle: Puzzle, queens: set[Coord]) -> None:
    if len(queens) != puzzle.n:
        raise Unsolvable(f"{len(queens)} queens placed, need {puzzle.n}")
    for unit in puzzle.units():
        if sum(q in puzzle.unit_cells(unit) for q in queens) != 1:
            raise Unsolvable(f"{puzzle.unit_name(unit)} does not have exactly one queen")
    for q in queens:
        if any(nb in queens for nb in puzzle.neighbours(q)):
            raise Unsolvable(f"queen at {q} touches another queen")


def join_names(names: list[str]) -> str:
    if len(names) <= 1:
        return names[0] if names else ""
    return ", ".join(names[:-1]) + " and " + names[-1]


def trace(puzzle: Puzzle, steps: list[Step], title: str) -> dict:
    return {
        "title": title,
        "n": puzzle.n,
        "regions": ["".join(row) for row in puzzle.regions],
        "labels": puzzle.labels,
        "colors": [puzzle.colors[label] for label in puzzle.labels],
        "names": [puzzle.color_name(label) for label in puzzle.labels],
        "source": puzzle.source,
        "steps": [
            {"kind": s.kind, "cells": s.cells, "reason": s.reason, "cause": s.cause, "removed": s.removed}
            for s in steps
        ],
    }


def write_html(puzzle: Puzzle, steps: list[Step], title: str, out: Path) -> None:
    """Write a single-puzzle page using the shared viewer template."""
    assemble = _load_assembler()
    queens, _ = solve(puzzle)
    entry = {
        "game": "queens", "id": title, "title": title, "group": "Puzzle", "source": puzzle.source, "n": puzzle.n,
        "regions": ["".join(row) for row in puzzle.regions],
        "labels": puzzle.labels,
        "colors": [puzzle.colors[label] for label in puzzle.labels],
        "names": [puzzle.color_name(label) for label in puzzle.labels],
        "solution": sorted(queens),
    }
    out.write_text(assemble.inline({"puzzles": [entry]}))


def _load_assembler():
    import importlib.util

    path = Path(__file__).parent.parent / "web" / "assemble.py"
    spec = importlib.util.spec_from_file_location("web_assemble", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def render_solution(puzzle: Puzzle, queens: set[Coord]) -> str:
    return "\n".join(
        "".join("Q" if (r, c) in queens else puzzle.regions[r][c].lower() for c in range(puzzle.n))
        for r in range(puzzle.n)
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Solve a Queens puzzle by deduction.")
    parser.add_argument("puzzle", type=Path)
    parser.add_argument("-v", "--verbose", action="store_true", help="print each deduction step")
    parser.add_argument("--html", type=Path, metavar="OUT", help="write a playable board and step viewer")
    args = parser.parse_args(argv)

    puzzle = Puzzle.parse(args.puzzle.read_text())
    try:
        queens, steps = solve(puzzle)
    except (Contradiction, Unsolvable) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    if args.verbose:
        for step in steps:
            print(step)
        print()
    print(render_solution(puzzle, queens))
    if args.html:
        write_html(puzzle, steps, args.puzzle.stem, args.html)
        print(f"wrote {args.html}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
