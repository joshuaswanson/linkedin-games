import random

from generate import band, climb, deduce, grow_regions, hardness, random_queens, to_puzzle
from solver import check_solution, solve


def test_random_queens_do_not_touch():
    cols = random_queens(random.Random(1), 9)
    assert sorted(cols) == list(range(9))
    assert all(abs(a - b) >= 2 for a, b in zip(cols, cols[1:]))


def test_regions_are_connected_and_hold_their_queen():
    rng = random.Random(2)
    queens = random_queens(rng, 8)
    region = grow_regions(rng, 8, queens)
    puzzle = to_puzzle(region)
    assert puzzle.n == 8 and len(puzzle.labels) == 8
    for r, c in enumerate(queens):
        assert region[r][c] == r


def test_climb_reaches_hard_band_and_unique_solution():
    rng = random.Random(3)
    result = None
    while result is None:
        result = climb(rng, 8, *band(8, "hard"), budget=1500)
    puzzle, steps, score = result
    assert score >= band(8, "hard")[0]
    steps2, done, _ = deduce(puzzle)
    assert done and hardness(steps2) == score
    queens, _ = solve(puzzle)
    check_solution(puzzle, queens)
