"""Generate Queens puzzles the deduction solver can finish.

A random non-touching queen placement is drawn, regions are grown outward from
the queens with random growth rates, and the layout is kept only when the
solver finishes it without the contradiction fallback. Any layout the solver
finishes has exactly one solution, because deduction only ever forces cells.
"""

from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

from solver import PALETTE, Contradiction, Coord, Puzzle, State, Step, apply_step, find_blocked, find_confine, find_single


def random_queens(rng: random.Random, n: int) -> list[int]:
    """Column of the queen in each row; consecutive rows differ by at least 2."""
    while True:
        cols: list[int] = []
        free = list(range(n))
        ok = True
        for r in range(n):
            options = [c for c in free if not cols or abs(c - cols[-1]) >= 2]
            if not options:
                ok = False
                break
            c = rng.choice(options)
            cols.append(c)
            free.remove(c)
        if ok:
            return cols


def grow_regions(rng: random.Random, n: int, queens: list[int]) -> list[list[int]]:
    region = [[-1] * n for _ in range(n)]
    weights = []
    for r, c in enumerate(queens):
        region[r][c] = r
        weights.append(rng.choice([0.3, 1.0, 1.0, 2.0, 4.0]))
    unassigned = n * n - n
    while unassigned:
        frontier: list[tuple[int, Coord]] = []
        for r in range(n):
            for c in range(n):
                if region[r][c] < 0:
                    continue
                for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    rr, cc = r + dr, c + dc
                    if 0 <= rr < n and 0 <= cc < n and region[rr][cc] < 0:
                        frontier.append((region[r][c], (rr, cc)))
        total = sum(weights[k] for k, _ in frontier)
        pick = rng.random() * total
        for k, (rr, cc) in frontier:
            pick -= weights[k]
            if pick <= 0:
                region[rr][cc] = k
                break
        else:
            k, (rr, cc) = frontier[-1]
            region[rr][cc] = k
        unassigned -= 1
    return region


def to_puzzle(region: list[list[int]]) -> Puzzle:
    n = len(region)
    labels = [chr(ord("A") + k) for k in range(n)]
    grid = [[labels[k] for k in row] for row in region]
    colors = {labels[k]: PALETTE[k % len(PALETTE)][1] for k in range(n)}
    return Puzzle(n, grid, colors)


def deduce(puzzle: Puzzle) -> tuple[list[Step], bool, int]:
    """Deduction steps without the contradiction fallback, whether the puzzle
    got finished, and how many cells were decided when it stopped."""
    state = State(puzzle)
    steps: list[Step] = []
    while len(state.queens) < puzzle.n:
        step = find_single(state) or find_confine(state, 1) or find_blocked(state)
        for k in range(2, puzzle.n):
            if step is not None:
                break
            step = find_confine(state, k)
        if step is None:
            break
        apply_step(state, step)
        try:
            state.check()
        except Contradiction:
            break
        steps.append(step)
    decided = sum(not state.cand[r][c] for r in range(puzzle.n) for c in range(puzzle.n))
    return steps, len(state.queens) == puzzle.n, decided + 3 * len(state.queens)


def step_weight(step: Step) -> int:
    """How hard an elimination is to spot: 1 for a cramped region, 2 for a
    region confined to one line, 3 for a line that lies inside one region,
    5 for reasoning over several regions or lines at once."""
    if step.kind != "eliminate":
        return 0
    head = step.reason.split(" fit")[0].split(" only")[0]
    if " and " in head:
        return 5
    if "no room" in step.reason:
        return 1
    if head.startswith("the "):
        return 2
    return 3


def hardness(steps: list[Step]) -> int:
    """Weighted eliminations plus the longest stretch without placing a queen."""
    total = 0
    run = 0
    longest = 0
    for s in steps:
        w = step_weight(s)
        total += w
        if s.kind == "queen":
            longest = max(longest, run)
            run = 0
        else:
            run += w
    return total + max(longest, run)


# 25th, 50th, 75th and 90th percentiles of the score, by board size, from the 608 LinkedIn levels.
QUARTILES = {7: (8, 14, 21, 26), 8: (12, 22, 31, 44), 9: (20, 28, 39, 48), 10: (22, 31, 44, 52), 11: (22, 27, 44, 55)}


def band(n: int, difficulty: str) -> tuple[int, int]:
    q1, q2, q3, q9 = QUARTILES.get(n, QUARTILES[9])
    return {"easy": (0, q1), "medium": (q1 + 1, q3 - 1), "hard": (q3, 999), "hardest": (q9, 999)}[difficulty]


def connected(region: list[list[int]], k: int, skip: Coord | None) -> bool:
    n = len(region)
    cells = [(r, c) for r in range(n) for c in range(n) if region[r][c] == k and (r, c) != skip]
    if not cells:
        return False
    seen = {cells[0]}
    stack = [cells[0]]
    while stack:
        r, c = stack.pop()
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nb = (r + dr, c + dc)
            if 0 <= nb[0] < n and 0 <= nb[1] < n and nb not in seen and nb != skip and region[nb[0]][nb[1]] == k:
                seen.add(nb)
                stack.append(nb)
    return len(seen) == len(cells)


def mutate(rng: random.Random, region: list[list[int]], queens: list[int]) -> list[list[int]] | None:
    """Move one boundary cell to a neighbouring region, keeping every region
    connected and every queen inside its own region."""
    n = len(region)
    queen_cells = {(r, c) for r, c in enumerate(queens)}
    cells = [(r, c) for r in range(n) for c in range(n)]
    rng.shuffle(cells)
    for r, c in cells:
        if (r, c) in queen_cells:
            continue
        k = region[r][c]
        neighbours = {region[r + dr][c + dc] for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= r + dr < n and 0 <= c + dc < n}
        neighbours.discard(k)
        if not neighbours or not connected(region, k, (r, c)):
            continue
        new = [row[:] for row in region]
        new[r][c] = rng.choice(sorted(neighbours))
        return new
    return None


def climb(rng: random.Random, n: int, low: int, high: int, budget: int) -> tuple[Puzzle, list[Step], int] | None:
    queens = random_queens(rng, n)
    region = grow_regions(rng, n, queens)

    def evaluate(reg):
        steps, done, progress = deduce(to_puzzle(reg))
        score = hardness(steps)
        if not done:
            return progress - 1000, steps, score
        return -abs(score - max(low, min(high, score))) * 10, steps, score

    cur, steps, score = evaluate(region)
    for _ in range(budget):
        if cur == 0:
            return to_puzzle(region), steps, score
        cand = mutate(rng, region, queens)
        if cand is None:
            continue
        val, s2, sc2 = evaluate(cand)
        if val >= cur:
            region, cur, steps, score = cand, val, s2, sc2
    return None


def generate_with_difficulty(rng: random.Random, n: int, difficulty: str, budget: int = 400) -> tuple[Puzzle, list[Step], int]:
    low, high = band(n, difficulty)
    while True:
        result = climb(rng, n, low, high, budget)
        if result is not None:
            return result


def next_number(puzzle_dir: Path, prefix: str) -> int:
    used = [int(p.stem.split("-")[1]) for p in puzzle_dir.glob(f"{prefix}-*.txt") if p.stem.split("-")[1].isdigit()]
    return max(used, default=0) + 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate Queens puzzles.")
    parser.add_argument("--count", type=int, default=6)
    parser.add_argument("--size", type=int, default=9)
    parser.add_argument("--difficulty", choices=["easy", "medium", "hard", "hardest"], default="hard")
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--puzzles", type=Path, default=Path(__file__).parent / "puzzles" / "generated")
    args = parser.parse_args(argv)

    seed = args.seed if args.seed is not None else random.randrange(1 << 30)
    rng = random.Random(seed)
    args.puzzles.mkdir(parents=True, exist_ok=True)
    start = next_number(args.puzzles, args.difficulty)
    for i in range(start, start + args.count):
        puzzle, steps, score = generate_with_difficulty(rng, args.size, args.difficulty)
        name = f"{args.difficulty}-{i:02d}"
        puzzle.source = f"{args.difficulty.capitalize()} {args.size}x{args.size} puzzle, difficulty {score} (LinkedIn's past {args.size}x{args.size} puzzles run 0 to about 60)."
        (args.puzzles / f"{name}.txt").write_text(puzzle.render() + "\n")
        kinds = [s.reason.split(" ")[0] for s in steps if s.kind == "eliminate"]
        print(f"{name}: {args.size}x{args.size}, score {score}, {len(steps)} steps, {len(kinds)} eliminations")
    print(f"seed {seed}. Run build_site.py to add the new puzzles to the site.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
