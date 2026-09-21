from pathlib import Path

import pytest

from solver import Contradiction, Puzzle, State, Unsolvable, check_solution, solve

PUZZLES = Path(__file__).parent / "puzzles"


needs_archive = pytest.mark.skipif(not (PUZZLES / "linkedin").is_dir(), reason="archived LinkedIn puzzles are not in the repo")


@needs_archive
def test_parse_headers_and_regions():
    puzzle = Puzzle.parse((PUZZLES / "linkedin" / "001.txt").read_text())
    assert puzzle.n == 8
    assert puzzle.source == "LinkedIn Queens #1"
    assert puzzle.colors["A"] == "#96BEFF"
    assert puzzle.color_name("A") == "blue"
    assert Puzzle.parse(puzzle.render()).regions == puzzle.regions


def test_solves_2026_09_18_by_deduction():
    puzzle = Puzzle.parse((PUZZLES / "2026-09-18.txt").read_text())
    queens, steps = solve(puzzle)
    assert queens == {(0, 4), (1, 6), (2, 1), (3, 7), (4, 0), (5, 2), (6, 5), (7, 3)}
    assert not any("dead end" in s.reason for s in steps)


@needs_archive
@pytest.mark.parametrize("number", ["001", "053", "176", "313", "480", "537", "600", "616"])
def test_archive_puzzles_solve_without_guessing(number):
    puzzle = Puzzle.parse((PUZZLES / "linkedin" / f"{number}.txt").read_text())
    queens, steps = solve(puzzle)
    check_solution(puzzle, queens)
    assert not any("dead end" in s.reason for s in steps)


def test_check_solution_rejects_touching_queens():
    puzzle = Puzzle.parse((PUZZLES / "2026-09-18.txt").read_text())
    queens, _ = solve(puzzle)
    bad = set(queens)
    bad.remove((0, 4))
    bad.add((0, 5))
    with pytest.raises(Unsolvable):
        check_solution(puzzle, bad)


def test_place_strikes_row_column_region_and_neighbours():
    puzzle = Puzzle.parse((PUZZLES / "2026-09-18.txt").read_text())
    state = State(puzzle)
    removed = state.place((4, 0))
    assert (4, 5) in removed and (0, 0) in removed and (3, 1) in removed and (3, 0) in removed
    assert (2, 3) not in removed


def test_impossible_puzzle_raises():
    puzzle = Puzzle.parse("AAB\nAAB\nCCC")
    with pytest.raises((Contradiction, Unsolvable)):
        solve(puzzle)
