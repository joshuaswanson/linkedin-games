"""Deterministic solver for LinkedIn Tango puzzles.

Rules: every cell is a sun (S) or moon (M); each row and column holds equally
many of each; no three equal symbols are adjacent in a line; cells joined by
"=" match and cells joined by "x" differ.

Puzzle text format (grid of 2N-1 lines, 2N-1 columns): cells sit at even
(row, col) positions, horizontal edge marks at (even, odd), vertical edge marks
at (odd, even). Cells are S, M or "."; edge marks are "=" or "x"; blank
otherwise.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from itertools import product
from pathlib import Path

SUN = "S"
MOON = "M"
SYMBOLS = (SUN, MOON)
CELL_CHARS = {"S": SUN, "O": SUN, "0": SUN, "M": MOON, "C": MOON, "1": MOON}
EDGE_CHARS = {"=": "=", "x": "x", "X": "x"}

Coord = tuple[int, int]
Grid = list[list[str | None]]


class Contradiction(Exception):
    pass


class Unsolvable(Exception):
    pass


@dataclass
class Step:
    cell: Coord
    value: str
    reason: str
    line: list[Coord] | None = None
    completions: list[str] | None = None
    rejected: list[dict] | None = None

    def __str__(self) -> str:
        r, c = self.cell
        return f"({r + 1},{c + 1}) = {self.value}  [{self.reason}]"


@dataclass
class Puzzle:
    n: int
    grid: Grid
    edges: dict[tuple[Coord, Coord], str] = field(default_factory=dict)
    source: str = ""

    @classmethod
    def parse(cls, text: str) -> Puzzle:
        source = ""
        lines = []
        for line in text.splitlines():
            if line.lstrip().startswith("#"):
                body = line.lstrip()[1:].strip()
                if body.startswith("source:"):
                    source = body[len("source:"):].strip()
                continue
            lines.append(line.rstrip("\n"))
        while lines and not lines[-1].strip():
            lines.pop()
        while lines and not lines[0].strip():
            lines.pop(0)
        if not lines:
            raise ValueError("empty puzzle")
        n = (len(lines) + 1) // 2
        if len(lines) != 2 * n - 1 or n % 2:
            raise ValueError(f"expected 2N-1 lines with even N, got {len(lines)} lines")
        width = 2 * n - 1
        lines = [line.ljust(width) for line in lines]
        grid: Grid = [[None] * n for _ in range(n)]
        edges: dict[tuple[Coord, Coord], str] = {}
        for i, line in enumerate(lines):
            if len(line) > width:
                raise ValueError(f"line {i + 1} is wider than {width}")
            for j, ch in enumerate(line):
                if i % 2 == 0 and j % 2 == 0:
                    if ch in CELL_CHARS:
                        grid[i // 2][j // 2] = CELL_CHARS[ch]
                    elif ch not in ". ":
                        raise ValueError(f"bad cell char {ch!r} at line {i + 1} col {j + 1}")
                elif i % 2 != j % 2:
                    if ch in EDGE_CHARS:
                        a = (i // 2, j // 2)
                        b = (i // 2, j // 2 + 1) if i % 2 == 0 else (i // 2 + 1, j // 2)
                        edges[(a, b)] = EDGE_CHARS[ch]
                    elif ch not in ". ":
                        raise ValueError(f"bad edge char {ch!r} at line {i + 1} col {j + 1}")
                elif ch.strip():
                    raise ValueError(f"unexpected char {ch!r} at line {i + 1} col {j + 1}")
        return cls(n, grid, edges, source)

    def render(self, grid: Grid | None = None) -> str:
        grid = self.grid if grid is None else grid
        n = self.n
        rows = [f"# source: {self.source}"] if self.source else []
        for i in range(2 * n - 1):
            chars = []
            for j in range(2 * n - 1):
                if i % 2 == 0 and j % 2 == 0:
                    chars.append(grid[i // 2][j // 2] or ".")
                elif i % 2 != j % 2:
                    a = (i // 2, j // 2)
                    b = (i // 2, j // 2 + 1) if i % 2 == 0 else (i // 2 + 1, j // 2)
                    chars.append(self.edges.get((a, b), " "))
                else:
                    chars.append(" ")
            rows.append("".join(chars).rstrip())
        return "\n".join(rows)

    def lines(self) -> list[tuple[str, list[Coord]]]:
        n = self.n
        out = []
        for r in range(n):
            out.append((f"row {r + 1}", [(r, c) for c in range(n)]))
        for c in range(n):
            out.append((f"col {c + 1}", [(r, c) for r in range(n)]))
        return out

    def edge(self, a: Coord, b: Coord) -> str | None:
        return self.edges.get((a, b)) or self.edges.get((b, a))


def line_violation(values: list[str], marks: list[str | None]) -> dict | None:
    """First rule a full line breaks, as {"kind", "cells"} with 0-based line
    positions, or None when the line is valid."""
    for i, mark in enumerate(marks):
        if mark == "=" and values[i] != values[i + 1]:
            return {"kind": "equal", "cells": [i, i + 1]}
        if mark == "x" and values[i] == values[i + 1]:
            return {"kind": "differ", "cells": [i, i + 1]}
    for i in range(len(values) - 2):
        if values[i] == values[i + 1] == values[i + 2]:
            return {"kind": "run", "cells": [i, i + 1, i + 2]}
    suns = values.count(SUN)
    if suns != len(values) // 2:
        excess = SUN if suns > len(values) // 2 else MOON
        return {"kind": "count", "cells": [i for i, v in enumerate(values) if v == excess]}
    return None


def line_is_valid(values: list[str], marks: list[str | None]) -> bool:
    return line_violation(values, marks) is None


def enumerate_line(
    values: list[str | None], marks: list[str | None]
) -> tuple[list[list[str]], list[dict]]:
    """All fillings of the unknown cells, split into valid completions and
    rejected ones tagged with the rule they break."""
    unknown = [i for i, v in enumerate(values) if v is None]
    valid: list[list[str]] = []
    rejected: list[dict] = []
    for combo in product(SYMBOLS, repeat=len(unknown)):
        filled = list(values)
        for i, v in zip(unknown, combo):
            filled[i] = v
        violation = line_violation(filled, marks)  # type: ignore[arg-type]
        if violation is None:
            valid.append(filled)  # type: ignore[arg-type]
        else:
            rejected.append({"line": "".join(filled), **violation})  # type: ignore[arg-type]
    return valid, rejected


def line_completions(values: list[str | None], marks: list[str | None]) -> list[list[str]]:
    return enumerate_line(values, marks)[0]


def propagate(puzzle: Puzzle, grid: Grid, steps: list[Step]) -> None:
    """Fill every cell whose value is the same in all valid completions of its
    row or column. Repeats until nothing changes. Raises Contradiction when a
    line has no valid completion."""
    changed = True
    while changed:
        changed = False
        for name, coords in puzzle.lines():
            values = [grid[r][c] for r, c in coords]
            if None not in values:
                continue
            marks = [puzzle.edge(coords[i], coords[i + 1]) for i in range(len(coords) - 1)]
            completions, rejected = enumerate_line(values, marks)
            if not completions:
                raise Contradiction(f"{name} has no valid completion")
            completion_strings = ["".join(comp) for comp in completions]
            for i, (r, c) in enumerate(coords):
                if values[i] is not None:
                    continue
                candidates = {comp[i] for comp in completions}
                if len(candidates) == 1:
                    value = candidates.pop()
                    grid[r][c] = value
                    steps.append(
                        Step((r, c), value, f"forced by {name}", coords, completion_strings, rejected)
                    )
                    changed = True


def unknown_cells(grid: Grid) -> list[Coord]:
    return [(r, c) for r, row in enumerate(grid) for c, v in enumerate(row) if v is None]


def copy_grid(grid: Grid) -> Grid:
    return [row[:] for row in grid]


def other(value: str) -> str:
    return MOON if value == SUN else SUN


def deduce_by_contradiction(puzzle: Puzzle, grid: Grid, steps: list[Step]) -> bool:
    for cell in unknown_cells(grid):
        for value in SYMBOLS:
            trial = copy_grid(grid)
            trial[cell[0]][cell[1]] = value
            try:
                propagate(puzzle, trial, [])
            except Contradiction as exc:
                r, c = cell
                grid[r][c] = other(value)
                steps.append(Step(cell, other(value), f"{value} here gives a contradiction: {exc}"))
                return True
    return False


def solve(puzzle: Puzzle, lines_only: bool = False) -> tuple[Grid, list[Step]]:
    """Solve by deduction. With lines_only the contradiction fallback is off,
    so a stall raises Unsolvable even if the puzzle has a unique answer."""
    grid = copy_grid(puzzle.grid)
    steps: list[Step] = []
    while True:
        propagate(puzzle, grid, steps)
        if not unknown_cells(grid):
            break
        if lines_only or not deduce_by_contradiction(puzzle, grid, steps):
            raise Unsolvable("no further deduction possible:\n" + puzzle.render(grid))
        propagate(puzzle, grid, steps)
    check_solution(puzzle, grid)
    return grid, steps


def check_solution(puzzle: Puzzle, grid: Grid) -> None:
    for r in range(puzzle.n):
        for c in range(puzzle.n):
            given = puzzle.grid[r][c]
            if given is not None and grid[r][c] != given:
                raise Unsolvable(f"given cell ({r + 1},{c + 1}) was changed")
    for name, coords in puzzle.lines():
        values = [grid[r][c] for r, c in coords]
        if None in values:
            raise Unsolvable(f"{name} is incomplete")
        marks = [puzzle.edge(coords[i], coords[i + 1]) for i in range(len(coords) - 1)]
        if not line_is_valid(values, marks):  # type: ignore[arg-type]
            raise Unsolvable(f"{name} violates the rules")


def trace(puzzle: Puzzle, steps: list[Step], title: str) -> dict:
    return {
        "title": title,
        "source": puzzle.source,
        "n": puzzle.n,
        "givens": puzzle.grid,
        "edges": [{"a": a, "b": b, "type": kind} for (a, b), kind in puzzle.edges.items()],
        "steps": [
            {
                "cell": step.cell,
                "value": step.value,
                "reason": step.reason,
                "line": step.line,
                "completions": step.completions,
                "rejected": step.rejected,
            }
            for step in steps
        ],
    }


def write_html(puzzle: Puzzle, steps: list[Step], title: str, out: Path) -> None:
    """Write a single-puzzle page using the shared viewer template."""
    assemble = _load_assembler()
    grid, _ = solve(puzzle)
    entry = {
        "game": "tango", "id": title, "title": title, "group": "Puzzle", "source": puzzle.source, "n": puzzle.n,
        "givens": puzzle.grid,
        "edges": [{"a": a, "b": b, "type": kind} for (a, b), kind in puzzle.edges.items()],
        "solution": ["".join(row) for row in grid],
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Solve a Tango puzzle by deduction.")
    parser.add_argument("puzzle", type=Path, help="puzzle file (see module docstring for the format)")
    parser.add_argument("-v", "--verbose", action="store_true", help="print each deduction step")
    parser.add_argument("--html", type=Path, metavar="OUT", help="write a step-by-step viewer page")
    args = parser.parse_args(argv)

    puzzle = Puzzle.parse(args.puzzle.read_text())
    try:
        grid, steps = solve(puzzle)
    except (Contradiction, Unsolvable) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    if args.verbose:
        for step in steps:
            print(step)
        print()
    print(puzzle.render(grid))
    if args.html:
        write_html(puzzle, steps, args.puzzle.stem, args.html)
        print(f"wrote {args.html}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
