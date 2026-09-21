# Tango solver

Deterministic solver for LinkedIn's Tango puzzle. It fills a cell only when every
valid completion of that cell's row or column agrees on the value, and repeats
until the grid is full. If that ever stalls it falls back to proof by
contradiction (set a cell, propagate, and if a line becomes impossible the cell
must be the other symbol). Today's puzzle needed only the first rule.

## Usage

```bash
uv run solver.py puzzles/2026-09-18.txt          # print the solution
uv run solver.py puzzles/2026-09-18.txt -v       # also list each deduction
uv run solver.py puzzles/2026-09-18.txt --html out.html   # single-puzzle page
uv run generate.py --seed 2026                   # 12 fresh hard puzzles (--easy N --medium N for others)
uv run tight.py --count 3                        # mostly single-path puzzles, about 30 s each
uv run --with pytest -m pytest .                 # tests
```

The site with every puzzle is built from the repo root with `uv run build_site.py`.

`generate.py` draws a random valid grid, adds clues until the line solver can
finish the puzzle, removes every clue that is not needed, then pads easy and
medium puzzles with extra givens. Output goes to `puzzles/generated/`; numbering continues from the files
already there.

## Puzzle format

A 2N-1 by 2N-1 character grid. Cells sit at even rows and columns, horizontal
edge marks between them on even rows, vertical edge marks on odd rows.
Cells: `S` sun, `M` moon, `.` empty. Edge marks: `=` same, `x` different.

```
S . . . . .

S . S . . .

M S S . . .

. . . . . .
      x
. . . . . .
      x   =
. . . .x.=.
```

## Single-path puzzles (`tight.py`)

`tight.py` looks for puzzles where the solving order is forced: at almost every
state exactly one cell is deducible. A perfect single path is impossible at the
end (with two empties left both are forced) and needs roughly one clue per
move elsewhere, so the generator runs simulated annealing over clue sets. The
objective minimises states with more than one forced cell, rewards deductions
that need a whole row or column (four or more empties), and a result is kept
only if at least 65% of its steps are single-forced and its hard score is 12
or more. Without the depth reward the single-path results scored 4 to 6 on
the hard scale, so "single path" on the page means single path and hard.
Typical result: 12 of 16 steps single-forced, hard score 13 to 17, 5 to 8
givens. Today's LinkedIn puzzle, for comparison, opens with 5 deducible cells.
