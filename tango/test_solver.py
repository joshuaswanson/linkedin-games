from pathlib import Path

import pytest

from solver import MOON, SUN, Contradiction, Puzzle, Unsolvable, check_solution, line_completions, solve

PUZZLES = Path(__file__).parent / "puzzles"


def rows(grid):
    return ["".join(v or "." for v in row) for row in grid]


def test_parse_cells_and_edges():
    puzzle = Puzzle.parse((PUZZLES / "2026-09-18.txt").read_text())
    assert puzzle.n == 6
    assert rows(puzzle.grid) == ["S.....", "S.S...", "MSS...", "......", "......", "......"]
    assert puzzle.edges == {
        ((3, 3), (4, 3)): "x",
        ((4, 3), (5, 3)): "x",
        ((4, 5), (5, 5)): "=",
        ((5, 3), (5, 4)): "x",
        ((5, 4), (5, 5)): "=",
    }


def test_render_round_trips():
    text = (PUZZLES / "2026-09-18.txt").read_text()
    puzzle = Puzzle.parse(text)
    assert Puzzle.parse(puzzle.render()) == puzzle


def test_solves_2026_09_18():
    puzzle = Puzzle.parse((PUZZLES / "2026-09-18.txt").read_text())
    grid, steps = solve(puzzle)
    assert rows(grid) == ["SMMSSM", "SMSSMM", "MSSMMS", "SSMMSM", "MMSSMS", "MSMMSS"]
    assert len(steps) == 30
    assert all(step.reason.startswith("forced by") for step in steps)


def test_line_completions_respect_all_rules():
    comps = line_completions([SUN, SUN, None, None, None, None], [None] * 5)
    assert all(c[2] == MOON for c in comps)
    comps = line_completions([None] * 4, ["=", "x", None])
    assert sorted("".join(c) for c in comps) == ["MMSS", "SSMM"]
    assert line_completions([None] * 4, ["=", None, "x"]) == []


def test_line_with_no_completion_raises():
    puzzle = Puzzle.parse("S S S .\n\n. . . .\n\n. . . .\n\n. . . .")
    with pytest.raises(Contradiction):
        solve(puzzle)


def test_solution_satisfies_all_rules():
    puzzle = Puzzle.parse((PUZZLES / "2026-09-18.txt").read_text())
    grid, _ = solve(puzzle)
    check_solution(puzzle, grid)
    grid[0][0] = MOON
    with pytest.raises(Unsolvable):
        check_solution(puzzle, grid)


def test_four_by_four():
    puzzle = Puzzle.parse("S S . .\n\n. .=. .\n\n. M . .\n\nM .x. .")
    grid, _ = solve(puzzle)
    assert rows(grid) == ["SSMM", "MSSM", "SMMS", "MMSS"]


def test_stalled_puzzle_raises():
    with pytest.raises(Unsolvable):
        solve(Puzzle.parse("S . . .\n\n. . . .\n\n. . . .\n\n. . . ."))
