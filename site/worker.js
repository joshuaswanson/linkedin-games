// Runs inside a Web Worker assembled from the sources of UTIL, the solvers, the generators and this function.
function GEN_WORKER() {
  const U = UTIL(), T = TANGO_SOLVER(U), Q = QUEENS_SOLVER(U), TG = TANGO_GEN(U, T), QG = QUEENS_GEN(U, Q);
  // Difficulty levels 1 to 5 map to recipes; the page never sees the recipe.
  const TANGO_LEVELS = { 1: { kind: 'band', low: 0, high: 4, extra: [10, 12] }, 2: { kind: 'band', low: 6, high: 10, extra: [4, 7] }, 3: { kind: 'band', low: 13, high: 16, extra: [0, 2] }, 4: { kind: 'band', low: 17, high: 99, extra: [0, 1] }, 5: { kind: 'tight' } };
  const QUEENS_LEVELS = { 1: ['easy', 7], 2: ['medium', 8], 3: ['hard', 8], 4: ['hard', 9], 5: ['hardest', 10] };
  self.onmessage = ev => {
    const { game, level, seed } = ev.data;
    if (game === 'queens') {
      const [difficulty, size] = QUEENS_LEVELS[level] || QUEENS_LEVELS[3];
      const res = QG.generateQueens(seed, size, difficulty), p = res.p;
      const entry = { n: p.n, regions: p.regions.map(row => row.join('')), labels: p.labels, colors: p.labels.map(l => p.colors[l]), names: p.labels.map(l => p.names[l]), solution: res.queens };
      self.postMessage({ game, level, seed, entry });
      return;
    }
    const recipe = TANGO_LEVELS[level] || TANGO_LEVELS[3];
    const out = recipe.kind === 'tight' ? TG.generateTight(seed, 150000, 10, 8) : TG.generateBand(seed, recipe.low, recipe.high, recipe.extra);
    const entry = { n: TG.N, givens: out.puzzle.givens, edges: out.puzzle.edges.map(e => ({ a: e.a, b: e.b, type: e.type })), solution: out.solution.map(row => row.join('')) };
    self.postMessage({ game, level, seed, entry });
  };
}
