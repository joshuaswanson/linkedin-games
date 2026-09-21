"""Generate "tight" Tango puzzles: at almost every state exactly one cell is
deducible, so the solving order is forced.

A fully single-path puzzle is impossible in the endgame (with two empties left
both are forced) and impractical elsewhere: each single forced move needs a
pre-placed partner, so thirty of them would need about twenty-five clues. This
module instead runs simulated annealing over clue sets for a random solution
grid and minimises the number of states with more than one forced cell.
"""

from __future__ import annotations

import argparse
import math
import random
import sys
from itertools import product
from pathlib import Path

from generate import next_number, random_solution
from solver import MOON, SUN, Puzzle, solve

N = 6
ENDGAME = 6
PATTERNS = [p for p in product((0, 1), repeat=N) if sum(p) == 3 and not any(p[i] == p[i + 1] == p[i + 2] for i in range(N - 2))]
LINES = [[(r, c) for c in range(N)] for r in range(N)] + [[(r, c) for r in range(N)] for c in range(N)]
PAIRS = [((r, c), (r, c + 1)) for r in range(N) for c in range(N - 1)] + [((r, c), (r + 1, c)) for r in range(N - 1) for c in range(N)]
CELLS = [(r, c) for r in range(N) for c in range(N)]
LINE_OF_PAIR = {(coords[i], coords[i + 1]): (li, i) for li, coords in enumerate(LINES) for i in range(N - 1)}
CELL_LINES = {(r, c): ((r, c), (N + c, r)) for r, c in CELLS}

Grid01 = list[list[int]]


def allowed_patterns(edges: dict) -> list[list[tuple]]:
    marks = [[None] * (N - 1) for _ in LINES]
    for pair, kind in edges.items():
        li, i = LINE_OF_PAIR[pair]
        marks[li][i] = kind
    return [
        [p for p in PATTERNS if all((m != "=" or p[i] == p[i + 1]) and (m != "x" or p[i] != p[i + 1]) for i, m in enumerate(ms))]
        for ms in marks
    ]


def profile(sol: Grid01, givens: set, edges: dict) -> tuple[list[int], int, bool]:
    """Apply every forced cell at each state. Returns the number of forced
    cells per state (endgame excluded), how many of those forced cells came
    from a line with four or more empties, and whether the puzzle got solved."""
    allowed = allowed_patterns(edges)
    grid = [[None] * N for _ in range(N)]
    for r, c in givens:
        grid[r][c] = sol[r][c]
    fits = []
    for li, coords in enumerate(LINES):
        vals = [grid[r][c] for r, c in coords]
        fits.append([p for p in allowed[li] if all(v is None or v == p[i] for i, v in enumerate(vals))])
    unknown = N * N - len(givens)
    counts: list[int] = []
    deep = 0
    while unknown:
        forced: dict = {}
        for li, coords in enumerate(LINES):
            if not fits[li]:
                return counts, deep, False
            empties = sum(grid[r][c] is None for r, c in coords)
            for i, cell in enumerate(coords):
                if grid[cell[0]][cell[1]] is None and cell not in forced:
                    values = {p[i] for p in fits[li]}
                    if len(values) == 1:
                        forced[cell] = (values.pop(), empties)
        if not forced:
            return counts, deep, False
        if unknown >= ENDGAME:
            counts.append(len(forced))
            deep += sum(1 for _, empties in forced.values() if empties >= 4)
        for cell, (v, _) in forced.items():
            grid[cell[0]][cell[1]] = v
            unknown -= 1
            for li, i in CELL_LINES[cell]:
                fits[li] = [p for p in fits[li] if p[i] == v]
    return counts, deep, True


def edge_types(sol: Grid01, pairs: set) -> dict:
    return {(a, b): "=" if sol[a[0]][a[1]] == sol[b[0]][b[1]] else "x" for a, b in pairs}


DEPTH_WEIGHT = 0.5
MIN_SINGLE_SHARE = 0.65
MIN_HARD_SCORE = 12


def score(sol: Grid01, givens: set, pairs: set) -> float:
    """Fewer multi-choice states, more deep deductions, fewer clues."""
    counts, deep, ok = profile(sol, givens, edge_types(sol, pairs))
    if not ok:
        return -100.0
    return -sum(c - 1 for c in counts) + DEPTH_WEIGHT * deep - 0.2 * (len(givens) + len(pairs))


def anneal(sol: Grid01, rng: random.Random, iters: int, max_givens: int, max_marks: int) -> tuple[set, set]:
    givens = set(rng.sample(CELLS, 3))
    pairs = set(rng.sample(PAIRS, 3))
    cur = score(sol, givens, pairs)
    best = (cur, set(givens), set(pairs))
    for it in range(iters):
        temp = 3.0 * (1 - it / iters) + 0.05
        g, e = set(givens), set(pairs)
        roll = rng.random()
        if roll < 0.25 and len(g) < max_givens:
            g.add(rng.choice([c for c in CELLS if c not in g]))
        elif roll < 0.45 and g:
            g.remove(rng.choice(sorted(g)))
        elif roll < 0.70 and len(e) < max_marks:
            e.add(rng.choice([p for p in PAIRS if p not in e]))
        elif roll < 0.85 and e:
            e.remove(rng.choice(sorted(e)))
        elif g:
            g.remove(rng.choice(sorted(g)))
            g.add(rng.choice([c for c in CELLS if c not in g]))
        else:
            continue
        val = score(sol, g, e)
        if val >= cur or rng.random() < math.exp((val - cur) / temp):
            givens, pairs, cur = g, e, val
            if val > best[0]:
                best = (val, set(g), set(e))
    return best[1], best[2]


def to_puzzle(sol: Grid01, givens: set, pairs: set) -> Puzzle:
    grid = [[None] * N for _ in range(N)]
    for r, c in givens:
        grid[r][c] = SUN if sol[r][c] == 0 else MOON
    return Puzzle(N, grid, edge_types(sol, pairs))


def generate_tight(rng: random.Random, iters: int, max_givens: int, max_marks: int, tries: int = 8) -> tuple[Puzzle, list[int], int]:
    """Anneal until the puzzle is mostly single-path and in the hard band, or
    return the best of `tries` attempts."""
    best = None
    for _ in range(tries):
        sol = [[0 if v == SUN else 1 for v in row] for row in random_solution(rng, N)]
        givens, pairs = anneal(sol, rng, iters, max_givens, max_marks)
        counts, _, ok = profile(sol, givens, edge_types(sol, pairs))
        assert ok
        puzzle = to_puzzle(sol, givens, pairs)
        _, steps = solve(puzzle, lines_only=True)
        hard = sum(1 for s in steps if len(s.completions or []) + len(s.rejected or []) >= 16)
        share = counts.count(1) / len(counts)
        candidate = (share >= MIN_SINGLE_SHARE and hard >= MIN_HARD_SCORE, share + hard / 40, puzzle, counts, hard)
        if best is None or candidate[:2] > best[:2]:
            best = candidate
        if candidate[0]:
            break
    assert best is not None
    return best[2], best[3], best[4]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate tight, mostly single-path Tango puzzles.")
    parser.add_argument("--count", type=int, default=3)
    parser.add_argument("--iters", type=int, default=150000, help="annealing iterations per puzzle (about 30s each)")
    parser.add_argument("--max-givens", type=int, default=10)
    parser.add_argument("--max-marks", type=int, default=8)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--puzzles", type=Path, default=Path(__file__).parent / "puzzles" / "generated")
    args = parser.parse_args(argv)

    seed = args.seed if args.seed is not None else random.randrange(1 << 30)
    rng = random.Random(seed)
    args.puzzles.mkdir(parents=True, exist_ok=True)
    start = next_number(args.puzzles, "tight")
    for i in range(start, start + args.count):
        puzzle, counts, hard = generate_tight(rng, args.iters, args.max_givens, args.max_marks)
        single = sum(c == 1 for c in counts)
        puzzle.source = f"Single-path puzzle. At {single} of {len(counts)} steps only one cell can be worked out, and {hard} of the deductions need a whole row or column."
        name = f"tight-{i:02d}"
        (args.puzzles / f"{name}.txt").write_text(puzzle.render() + "\n")
        givens = sum(v is not None for row in puzzle.grid for v in row)
        print(f"{name}: {givens} givens, {len(puzzle.edges)} marks, single-forced states {single}/{len(counts)}, hard score {hard}, options {counts}")
    print(f"seed {seed}. Run build_site.py to add the new puzzles to the site.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
