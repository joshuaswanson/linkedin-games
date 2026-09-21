// Tango line solver: every row and column is enumerated and cells all valid fillings agree on are forced.
function TANGO_SOLVER(U) {
  const { SUN, MOON, pk } = U;
  const tangoLines = n => {
    const out = [];
    for (let r = 0; r < n; r++) out.push({ name: `row ${r + 1}`, coords: [...Array(n)].map((_, c) => [r, c]) });
    for (let c = 0; c < n; c++) out.push({ name: `col ${c + 1}`, coords: [...Array(n)].map((_, r) => [r, c]) });
    return out;
  };
  function violation(values, marks) {
    for (let i = 0; i < marks.length; i++) {
      if (marks[i] === '=' && values[i] !== values[i + 1]) return { kind: 'equal', cells: [i, i + 1] };
      if (marks[i] === 'x' && values[i] === values[i + 1]) return { kind: 'differ', cells: [i, i + 1] };
    }
    for (let i = 0; i + 2 < values.length; i++) if (values[i] === values[i + 1] && values[i] === values[i + 2]) return { kind: 'run', cells: [i, i + 1, i + 2] };
    const suns = values.filter(v => v === SUN).length;
    if (suns !== values.length / 2) { const excess = suns > values.length / 2 ? SUN : MOON; return { kind: 'count', cells: values.map((v, i) => v === excess ? i : -1).filter(i => i >= 0) }; }
    return null;
  }
  function enumerateLine(values, marks, record) {
    const unknown = values.map((v, i) => v === null ? i : -1).filter(i => i >= 0);
    const valid = [], rejected = [];
    for (let mask = 0; mask < (1 << unknown.length); mask++) {
      const filled = values.slice();
      unknown.forEach((idx, j) => { filled[idx] = (mask >> j) & 1 ? MOON : SUN; });
      const v = violation(filled, marks);
      if (!v) valid.push(filled); else if (record) rejected.push({ line: filled.join(''), kind: v.kind, cells: v.cells });
    }
    return { valid, rejected };
  }
  function tangoPuzzle(n, givens, edges) {
    const edgeMap = new Map(edges.map(e => [pk(e.a, e.b), e.type]));
    return { n, givens, edges, lines: tangoLines(n), edge: (a, b) => edgeMap.get(pk(a, b)) || edgeMap.get(pk(b, a)) || null };
  }
  // The first cell some row or column pins, with everything needed to explain it.
  function tangoNextStep(puzzle, grid) {
    for (const { name, coords } of puzzle.lines) {
      const values = coords.map(([r, c]) => grid[r][c]);
      if (!values.includes(null)) continue;
      const marks = coords.slice(0, -1).map((a, i) => puzzle.edge(a, coords[i + 1]));
      const { valid, rejected } = enumerateLine(values, marks, true);
      if (!valid.length) return { contradiction: name };
      for (let i = 0; i < coords.length; i++) {
        if (values[i] !== null) continue;
        const first = valid[0][i];
        if (valid.every(v => v[i] === first)) return { cell: coords[i], value: first, lineName: name, line: coords, known: values, marks, completions: valid.map(v => v.join('')), rejected };
      }
    }
    return null;
  }
  function tangoPropagate(puzzle, grid, steps) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const { name, coords } of puzzle.lines) {
        const values = coords.map(([r, c]) => grid[r][c]);
        if (!values.includes(null)) continue;
        const marks = coords.slice(0, -1).map((a, i) => puzzle.edge(a, coords[i + 1]));
        const { valid } = enumerateLine(values, marks, false);
        if (!valid.length) return false;
        const unknowns = values.filter(v => v === null).length;
        coords.forEach(([r, c], i) => {
          if (values[i] !== null) return;
          const first = valid[0][i];
          if (valid.every(v => v[i] === first)) { grid[r][c] = first; changed = true; if (steps) steps.push({ cell: [r, c], value: first, name, unknowns }); }
        });
      }
    }
    return true;
  }
  function tangoSolve(puzzle) {
    const grid = puzzle.givens.map(row => row.slice()), steps = [];
    if (!tangoPropagate(puzzle, grid, steps)) return null;
    if (grid.some(row => row.includes(null))) return null;
    return { grid, steps };
  }
  return { tangoLines, enumerateLine, tangoPuzzle, tangoNextStep, tangoPropagate, tangoSolve };
}
