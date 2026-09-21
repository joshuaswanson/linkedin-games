# Endless Tango and Queens

A generator for LinkedIn-style Tango and Queens puzzles, with a deduction
solver that explains the next move while you play.

```bash
uv run build_site.py            # writes site/
open site/index.html
```

The page opens on a fresh puzzle. Pick a game, set the difficulty slider
(Easy to Hardest), press "New puzzle". Play with a timer, undo and live rule
checking; "Reveal next move" runs the solver on the board as it is and shows
which cell the rules pin down next, the row, column or region it follows
from, and for Tango every filling of that line with the rejected ones grouped
by the rule they break. "Apply" fills it in. A wrong mark gets flagged first.
Generated puzzles are seeded, cached in localStorage and addressable as
`#tango/gen-l4-s<seed>`.

Every generated puzzle has exactly one solution and can be finished by
deduction alone, because the generators keep only layouts the solver
completes without guessing.

## Difficulty levels

| Level | Tango | Queens |
|---|---|---|
| Easy | many givens, shallow deductions | 7x7, bottom quarter of the LinkedIn scale |
| Medium | fewer givens | 8x8, middle half |
| Hard | minimal clues, 13+ whole-line deductions | 8x8, top quarter |
| Harder | 17+ whole-line deductions | 9x9, top quarter |
| Hardest | single path: at most steps only one cell can be worked out, and hard | 10x10, top tenth |

The Queens scale was calibrated on 608 past LinkedIn puzzles (percentiles in
`queens/generate.py`). The archived puzzles themselves are not in this repo;
if you have them as `queens/puzzles/linkedin/NNN.txt` and
`tango/puzzles/linkedin/NNN.txt` (see the puzzle format in each solver), the
archive tests run and `uv run build_site.py --with-linkedin` lists them on the
page.

| Folder | Contents |
|---|---|
| `web/` | page sources: `index.html`, `styles.css`, `util.js`, `common.js`, `app.js`, `worker.js`, per game `tango/` and `queens/` with `solver.js`, `engine.js`, `generator.js`; `assemble.py` links them for `site/` or inlines them for single-puzzle pages |
| `tango/` | Python solver, generator, single-path annealer, tests, puzzle files |
| `queens/` | Python solver, generator, tests, puzzle files |
| `site/` | build output |

The Python and JavaScript solvers implement the same rules; the JavaScript
ones are what the page uses. Each Python solver can also write a
self-contained page for one puzzle: `uv run tango/solver.py puzzle.txt --html out.html`.
