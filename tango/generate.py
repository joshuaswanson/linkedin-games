"""Generate fresh Tango puzzles that the line-deduction solver can finish.

A random full grid is drawn, clues (given cells and =/x marks that agree with
it) are added until the solver completes the puzzle without the contradiction
fallback, then every clue that is not needed is removed. Any puzzle the
solver finishes has exactly one answer, because deduction only ever forces
values.
"""

from __future__ import annotations

import argparse
import math
import random
import sys
from pathlib import Path

from solver import MOON, SUN, Coord, Grid, Puzzle, Step, Unsolvable, solve

Clue = tuple[str, Coord, Coord | None]


def random_solution(rng: random.Random, n: int) -> list[list[str]]:
    grid: list[list[str | None]] = [[None] * n for _ in range(n)]
    half = n // 2

    def fits(r: int, c: int, v: str) -> bool:
        row = grid[r]
        col = [grid[i][c] for i in range(n)]
        if row.count(v) >= half or col.count(v) >= half:
            return False
        if c >= 2 and row[c - 1] == v and row[c - 2] == v:
            return False
        if r >= 2 and col[r - 1] == v and col[r - 2] == v:
            return False
        return True

    def fill(i: int) -> bool:
        if i == n * n:
            return True
        r, c = divmod(i, n)
        symbols = [SUN, MOON]
        rng.shuffle(symbols)
        for v in symbols:
            if fits(r, c, v):
                grid[r][c] = v
                if fill(i + 1):
                    return True
                grid[r][c] = None
        return False

    if not fill(0):
        raise RuntimeError("could not build a solution grid")
    return grid  # type: ignore[return-value]


def all_clues(solution: list[list[str]]) -> list[Clue]:
    n = len(solution)
    clues: list[Clue] = [("cell", (r, c), None) for r in range(n) for c in range(n)]
    for r in range(n):
        for c in range(n):
            if c + 1 < n:
                clues.append(("edge", (r, c), (r, c + 1)))
            if r + 1 < n:
                clues.append(("edge", (r, c), (r + 1, c)))
    return clues


def build(solution: list[list[str]], clues: list[Clue]) -> Puzzle:
    n = len(solution)
    grid: Grid = [[None] * n for _ in range(n)]
    edges = {}
    for kind, a, b in clues:
        if kind == "cell":
            grid[a[0]][a[1]] = solution[a[0]][a[1]]
        else:
            assert b is not None
            edges[(a, b)] = "=" if solution[a[0]][a[1]] == solution[b[0]][b[1]] else "x"
    return Puzzle(n, grid, edges)


def solvable(puzzle: Puzzle) -> list[Step] | None:
    try:
        return solve(puzzle, lines_only=True)[1]
    except Unsolvable:
        return None


def generate(rng: random.Random, n: int, edge_share: float, extra_givens: int = 0) -> tuple[Puzzle, list[Step]]:
    solution = random_solution(rng, n)
    clues = all_clues(solution)
    rng.shuffle(clues)
    clues.sort(key=lambda cl: rng.random() * (edge_share if cl[0] == "edge" else 1 - edge_share))
    chosen: list[Clue] = []
    for clue in clues:
        chosen.append(clue)
        if solvable(build(solution, chosen)) is not None:
            break
    prune_order = chosen[:]
    rng.shuffle(prune_order)
    prune_order.sort(key=lambda cl: 0 if cl[0] == ("cell" if edge_share >= 0.5 else "edge") else 1)
    for clue in prune_order:
        trial = [cl for cl in chosen if cl != clue]
        if solvable(build(solution, trial)) is not None:
            chosen = trial
    spare = [cl for cl in clues if cl[0] == "cell" and cl not in chosen]
    rng.shuffle(spare)
    chosen += spare[:extra_givens]
    puzzle = build(solution, chosen)
    steps = solvable(puzzle)
    assert steps is not None
    return puzzle, steps


def hardness(steps: list[Step]) -> int:
    """Number of deductions whose line still had four or more empty cells."""
    score = 0
    for step in steps:
        total = len(step.completions or []) + len(step.rejected or [])
        if total and math.log2(total) >= 4:
            score += 1
    return score


BANDS = {
    "easy": (0, 4, (10, 12)),
    "medium": (6, 10, (4, 7)),
    "hard": (13, 99, (0, 2)),
}


def generate_with_difficulty(rng: random.Random, n: int, difficulty: str) -> tuple[Puzzle, list[Step], int]:
    low, high, (extra_lo, extra_hi) = BANDS[difficulty]
    while True:
        edge_share = rng.choice([0.3, 0.5, 0.7, 0.85])
        puzzle, steps = generate(rng, n, edge_share, rng.randint(extra_lo, extra_hi))
        score = hardness(steps)
        if low <= score <= high:
            return puzzle, steps, score


def stats(puzzle: Puzzle, steps: list[Step]) -> tuple[int, int, int]:
    givens = sum(v is not None for row in puzzle.grid for v in row)
    return givens, len(puzzle.edges), hardness(steps)


def next_number(puzzle_dir: Path, difficulty: str) -> int:
    used = [int(p.stem.split("-")[1]) for p in puzzle_dir.glob(f"{difficulty}-*.txt") if p.stem.split("-")[1].isdigit()]
    return max(used, default=0) + 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate Tango puzzles.")
    parser.add_argument("--easy", type=int, default=0)
    parser.add_argument("--medium", type=int, default=0)
    parser.add_argument("--hard", type=int, default=12)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--size", type=int, default=6)
    parser.add_argument("--puzzles", type=Path, default=Path(__file__).parent / "puzzles" / "generated")
    args = parser.parse_args(argv)

    seed = args.seed if args.seed is not None else random.randrange(1 << 30)
    rng = random.Random(seed)
    args.puzzles.mkdir(parents=True, exist_ok=True)

    for difficulty, count in (("easy", args.easy), ("medium", args.medium), ("hard", args.hard)):
        start = next_number(args.puzzles, difficulty)
        for i in range(start, start + count):
            puzzle, steps, score = generate_with_difficulty(rng, args.size, difficulty)
            name = f"{difficulty}-{i:02d}"
            puzzle.source = f"{difficulty.capitalize()} puzzle. {score} of the deductions need a whole row or column."
            (args.puzzles / f"{name}.txt").write_text(puzzle.render() + "\n")
            givens, marks, _ = stats(puzzle, steps)
            print(f"{name}: {givens} givens, {marks} marks, {score} hard steps")

    print(f"seed {seed}. Run build_site.py to add the new puzzles to the site.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
