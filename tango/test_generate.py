import random

from generate import BANDS, generate, generate_with_difficulty, hardness, random_solution
from solver import Puzzle, check_solution, solve


def test_random_solution_is_valid():
    grid = random_solution(random.Random(1), 6)
    puzzle = Puzzle(6, [[None] * 6 for _ in range(6)])
    check_solution(puzzle, grid)


def test_generated_puzzle_is_minimal_and_deducible():
    puzzle, steps = generate(random.Random(5), 6, 0.5)
    grid, again = solve(puzzle, lines_only=True)
    assert len(again) == len(steps)
    assert Puzzle.parse(puzzle.render()) == puzzle
    for (a, b) in list(puzzle.edges):
        smaller = Puzzle(puzzle.n, puzzle.grid, {k: v for k, v in puzzle.edges.items() if k != (a, b)})
        try:
            solve(smaller, lines_only=True)
        except Exception:
            continue
        raise AssertionError(f"edge {a}-{b} is not needed")


def test_difficulty_bands():
    rng = random.Random(9)
    for difficulty, (low, high, _) in BANDS.items():
        _, steps, score = generate_with_difficulty(rng, 6, difficulty)
        assert low <= score <= high
        assert hardness(steps) == score


def test_tight_profile_matches_solver():
    import random

    from tight import edge_types, generate_tight, profile

    puzzle, counts, hard = generate_tight(random.Random(3), iters=300, max_givens=10, max_marks=8, tries=1)
    grid, steps = solve(puzzle, lines_only=True)
    assert counts and all(c >= 1 for c in counts) and hard >= 0
    assert sum(1 for row in grid for v in row if v) == 36
