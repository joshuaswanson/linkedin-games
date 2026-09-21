// Tango generators: minimal hard puzzles by clue pruning, and tight puzzles by annealing.
function TANGO_GEN(U, T) {
  const { SUN, MOON, pk, rngFrom, shuffle, choice } = U;
  const N = 6;
  const LINES = T.tangoLines(N);
  const PAIRS = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { if (c + 1 < N) PAIRS.push([[r, c], [r, c + 1]]); if (r + 1 < N) PAIRS.push([[r, c], [r + 1, c]]); }
  const CELLS = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) CELLS.push([r, c]);

  function randomSolution(rnd) {
    const g = Array.from({ length: N }, () => Array(N).fill(null));
    const fits = (r, c, v) => {
      const row = g[r], col = g.map(x => x[c]);
      if (row.filter(x => x === v).length >= N / 2 || col.filter(x => x === v).length >= N / 2) return false;
      if (c >= 2 && row[c - 1] === v && row[c - 2] === v) return false;
      if (r >= 2 && col[r - 1] === v && col[r - 2] === v) return false;
      return true;
    };
    const fill = i => {
      if (i === N * N) return true;
      const r = Math.floor(i / N), c = i % N;
      for (const v of shuffle([SUN, MOON], rnd)) { if (fits(r, c, v)) { g[r][c] = v; if (fill(i + 1)) return true; g[r][c] = null; } }
      return false;
    };
    fill(0);
    return g;
  }
  function build(sol, clues) {
    const givens = Array.from({ length: N }, () => Array(N).fill(null));
    const edges = [];
    for (const cl of clues) {
      if (cl.kind === 'cell') givens[cl.a[0]][cl.a[1]] = sol[cl.a[0]][cl.a[1]];
      else edges.push({ a: cl.a, b: cl.b, type: sol[cl.a[0]][cl.a[1]] === sol[cl.b[0]][cl.b[1]] ? '=' : 'x' });
    }
    return T.tangoPuzzle(N, givens, edges);
  }
  function generate(rnd, edgeShare, extraGivens) {
    const sol = randomSolution(rnd);
    const clues = CELLS.map(a => ({ kind: 'cell', a })).concat(PAIRS.map(([a, b]) => ({ kind: 'edge', a, b })));
    shuffle(clues, rnd);
    clues.forEach(cl => { cl.key = rnd() * (cl.kind === 'edge' ? edgeShare : 1 - edgeShare); });
    clues.sort((x, y) => x.key - y.key);
    let chosen = [];
    for (const cl of clues) { chosen.push(cl); if (T.tangoSolve(build(sol, chosen))) break; }
    const pruneFirst = edgeShare >= 0.5 ? 'cell' : 'edge';
    const order = shuffle(chosen.slice(), rnd).sort((x, y) => (x.kind === pruneFirst ? 0 : 1) - (y.kind === pruneFirst ? 0 : 1));
    for (const cl of order) { const trial = chosen.filter(x => x !== cl); if (T.tangoSolve(build(sol, trial))) chosen = trial; }
    const spare = shuffle(clues.filter(cl => cl.kind === 'cell' && !chosen.includes(cl)), rnd);
    chosen = chosen.concat(spare.slice(0, extraGivens));
    const puzzle = build(sol, chosen);
    return { puzzle, solved: T.tangoSolve(puzzle) };
  }
  const hardness = steps => steps.filter(s => s.unknowns >= 4).length;
  function generateBand(seed, low, high, extra) {
    const rnd = rngFrom(seed);
    for (;;) {
      const edgeShare = choice([0.3, 0.5, 0.7, 0.85], rnd);
      const extraGivens = extra[0] + Math.floor(rnd() * (extra[1] - extra[0] + 1));
      const { puzzle, solved } = generate(rnd, edgeShare, extraGivens);
      const score = hardness(solved.steps);
      if (score >= low && score <= high) return { puzzle, solution: solved.grid, score };
    }
  }
  const generateHard = seed => generateBand(seed, 13, 99, [0, 2]);

  // Tight puzzles: anneal clue sets so that almost every state has one forced cell.
  // Line patterns are 6-bit ints; a line's remaining candidates are a 14-bit mask over PATTERNS.
  const PATTERNS = [];
  for (let m = 0; m < 64; m++) { let ok = true, ones = 0; for (let i = 0; i < N; i++) { ones += (m >> i) & 1; if (i + 2 < N && ((m >> i) & 1) === ((m >> (i + 1)) & 1) && ((m >> i) & 1) === ((m >> (i + 2)) & 1)) ok = false; } if (ok && ones === 3) PATTERNS.push(m); }
  const NP = PATTERNS.length, ALL = (1 << NP) - 1;
  const CONS = [];
  for (let i = 0; i < N; i++) { CONS.push([0, 0]); PATTERNS.forEach((m, k) => { CONS[i][(m >> i) & 1] |= 1 << k; }); }
  const LINE_OF_PAIR = new Map();
  LINES.forEach(({ coords }, li) => { for (let i = 0; i + 1 < N; i++) LINE_OF_PAIR.set(pk(coords[i], coords[i + 1]), [li, i]); });
  const ENDGAME = 6;
  function allowedMasks(edgeMap) {
    const masks = new Array(LINES.length).fill(ALL);
    for (const [key, type] of edgeMap) {
      const [li, i] = LINE_OF_PAIR.get(key);
      let m = 0;
      PATTERNS.forEach((p, k) => { const same = ((p >> i) & 1) === ((p >> (i + 1)) & 1); if ((type === '=') === same) m |= 1 << k; });
      masks[li] &= m;
    }
    return masks;
  }
  function profile(sol01, givens, edgeMap) {
    const fits = allowedMasks(edgeMap);
    const grid = new Int8Array(N * N).fill(-1);
    const empties = new Int8Array(2 * N).fill(N);
    for (const key of givens) { const r = Math.floor(key / N), c = key % N, v = sol01[r][c]; grid[key] = v; fits[r] &= CONS[c][v]; fits[N + c] &= CONS[r][v]; empties[r]--; empties[N + c]--; }
    let unknown = N * N - givens.size, deep = 0;
    const counts = [];
    const forced = new Int32Array(N * N);
    while (unknown) {
      let nf = 0;
      for (let li = 0; li < 2 * N; li++) {
        const f = fits[li];
        if (!f) return { counts, deep, ok: false };
        for (let i = 0; i < N; i++) {
          const key = li < N ? li * N + i : i * N + (li - N);
          if (grid[key] >= 0) continue;
          const v = !(f & CONS[i][0]) ? 1 : !(f & CONS[i][1]) ? 0 : -1;
          if (v >= 0) {
            let dup = false; for (let j = 0; j < nf; j++) if (forced[j] === key) { dup = true; break; }
            if (!dup) { forced[nf++] = key; grid[key] = v; if (unknown >= ENDGAME && empties[li] >= 4) deep++; }
          }
        }
      }
      if (!nf) return { counts, deep, ok: false };
      if (unknown >= ENDGAME) counts.push(nf);
      for (let j = 0; j < nf; j++) { const key = forced[j], r = Math.floor(key / N), c = key % N, v = grid[key]; fits[r] &= CONS[c][v]; fits[N + c] &= CONS[r][v]; empties[r]--; empties[N + c]--; }
      unknown -= nf;
    }
    return { counts, deep, ok: true };
  }
  function edgeMapFor(sol01, pairs) {
    const m = new Map();
    for (const idx of pairs) { const [a, b] = PAIRS[idx]; m.set(pk(a, b), sol01[a[0]][a[1]] === sol01[b[0]][b[1]] ? '=' : 'x'); }
    return m;
  }
  const DEPTH_WEIGHT = 0.5, MIN_SINGLE_SHARE = 0.65, MIN_HARD_SCORE = 12;
  function tightScore(sol01, givens, pairs) {
    const { counts, deep, ok } = profile(sol01, givens, edgeMapFor(sol01, pairs));
    if (!ok) return -100;
    return -counts.reduce((s, c) => s + c - 1, 0) + DEPTH_WEIGHT * deep - 0.2 * (givens.size + pairs.size);
  }
  function annealTight(rnd, iters, maxGivens, maxMarks) {
    const solSM = randomSolution(rnd);
    const sol01 = solSM.map(row => row.map(v => v === SUN ? 0 : 1));
    let givens = new Set(shuffle(CELLS.map((_, i) => i), rnd).slice(0, 3));
    let pairs = new Set(shuffle(PAIRS.map((_, i) => i), rnd).slice(0, 3));
    let cur = tightScore(sol01, givens, pairs);
    let best = { val: cur, givens: new Set(givens), pairs: new Set(pairs) };
    const pickNot = (n, set) => { const opts = []; for (let i = 0; i < n; i++) if (!set.has(i)) opts.push(i); return choice(opts, rnd); };
    for (let it = 0; it < iters; it++) {
      const temp = 3.0 * (1 - it / iters) + 0.05;
      const g = new Set(givens), e = new Set(pairs), roll = rnd();
      if (roll < 0.25 && g.size < maxGivens) g.add(pickNot(N * N, g));
      else if (roll < 0.45 && g.size) g.delete(choice([...g], rnd));
      else if (roll < 0.70 && e.size < maxMarks) e.add(pickNot(PAIRS.length, e));
      else if (roll < 0.85 && e.size) e.delete(choice([...e], rnd));
      else if (g.size) { g.delete(choice([...g], rnd)); g.add(pickNot(N * N, g)); }
      else continue;
      const val = tightScore(sol01, g, e);
      if (val >= cur || rnd() < Math.exp((val - cur) / temp)) { givens = g; pairs = e; cur = val; if (val > best.val) best = { val, givens: new Set(g), pairs: new Set(e) }; }
    }
    const givenGrid = Array.from({ length: N }, () => Array(N).fill(null));
    for (const key of best.givens) { const r = Math.floor(key / N), c = key % N; givenGrid[r][c] = solSM[r][c]; }
    const edges = [...best.pairs].map(idx => { const [a, b] = PAIRS[idx]; return { a, b, type: solSM[a[0]][a[1]] === solSM[b[0]][b[1]] ? '=' : 'x' }; });
    const puzzle = T.tangoPuzzle(N, givenGrid, edges);
    const { counts } = profile(sol01, best.givens, edgeMapFor(sol01, best.pairs));
    const hard = hardness(T.tangoSolve(puzzle).steps);
    return { puzzle, solution: solSM, counts, hard, share: counts.filter(c => c === 1).length / counts.length };
  }
  // Anneal until the result is mostly single-path and in the hard band, or keep the best of a few tries.
  function generateTight(seed, iters, maxGivens, maxMarks) {
    const rnd = rngFrom(seed);
    let best = null;
    for (let t = 0; t < 8; t++) {
      const res = annealTight(rnd, iters, maxGivens, maxMarks);
      res.accepted = res.share >= MIN_SINGLE_SHARE && res.hard >= MIN_HARD_SCORE;
      res.rank = res.share + res.hard / 40;
      if (!best || res.rank > best.rank) best = res;
      if (res.accepted) { best = res; break; }
    }
    return best;
  }
  return { N, generateBand, generateHard, generateTight };
}
