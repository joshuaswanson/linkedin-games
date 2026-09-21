# Queens solver

Rules: one queen in every row, column and colour region; no two queens touch,
diagonally included.

The solver keeps a candidate mark on every cell and applies these rules in
order until every queen is placed:

1. A row, column or region with one candidate left gets its queen. Placing a
   queen strikes its row, column, region and the eight neighbours.
2. If a region's candidates all sit in one row (or column), the other cells of
   that row are out. The same for k regions whose candidates span exactly k
   rows, and the mirror form: k rows whose candidates lie in exactly k regions.
3. A cell whose queen would leave some row, column or region with no
   candidate is out.
4. Fallback, never needed on the archive: place a queen, propagate, and if a
   contradiction follows the cell is out.

```bash
uv run solver.py puzzles/2026-09-18.txt -v
uv run --with pytest -m pytest .
```

Puzzle format: N lines of N region labels, with optional header lines
`# source: ...` and `# colors: A=#RRGGBB B=#RRGGBB ...`.

## Generator

```bash
uv run generate.py --size 9 --count 4 --difficulty hard
```

A random non-touching queen placement is drawn and regions are grown around
the queens with random growth rates. The layout is then hill-climbed: one
boundary cell moves to a neighbouring region per step (regions stay connected
and keep their queen), first until the deduction solver finishes the puzzle
without its contradiction fallback (which proves the solution unique), then
until the difficulty score lands in the requested band.

The score weights each elimination by how hard it is to spot (cramped region
1, region confined to a line 2, line inside one region 3, several regions or
lines at once 5) and adds the longest stretch without placing a queen. Bands
are the quartiles of that score over the 608 archive puzzles, per board size
(`QUARTILES` in `generate.py`). LinkedIn's own labels are not published for
past puzzles, so this is calibrated to the archive's spread. Today's LinkedIn
"hard" 8x8 scores 22, the archive median for 8x8, so LinkedIn's scale runs
easier than this one.
