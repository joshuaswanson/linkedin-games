// Queens generator: regions grown around a random placement, then hill-climbed to a difficulty band.
function QUEENS_GEN(U, Q) {
  const { rngFrom, shuffle, choice } = U;
  // 25th, 50th, 75th and 90th percentiles of the difficulty score over the LinkedIn archive, per board size.
  const QUARTILES = { 7: [8, 14, 21, 26], 8: [12, 22, 31, 44], 9: [20, 28, 39, 48], 10: [22, 31, 44, 52], 11: [22, 27, 44, 55] };
  function qWeight(step) {
    if (step.kind !== 'eliminate') return 0;
    const head = step.reason.split(' fit')[0].split(' only')[0];
    if (head.includes(' and ')) return 5;
    if (step.reason.includes('no room')) return 1;
    return head.startsWith('the ') ? 2 : 3;
  }
  function qHardness(steps) {
    let total = 0, run = 0, longest = 0;
    for (const s of steps) { const w = qWeight(s); total += w; if (s.kind === 'queen') { longest = Math.max(longest, run); run = 0; } else run += w; }
    return total + Math.max(longest, run);
  }
  function qBand(n, difficulty) { const [q1, , q3, q9] = QUARTILES[n] || QUARTILES[9]; return difficulty === 'easy' ? [0, q1] : difficulty === 'medium' ? [q1 + 1, q3 - 1] : difficulty === 'hardest' ? [q9, 999] : [q3, 999]; }
  function randomQueens(rnd, n) {
    for (;;) {
      const cols = [], free = [...Array(n).keys()]; let ok = true;
      for (let r = 0; r < n; r++) { const opts = free.filter(c => !cols.length || Math.abs(c - cols[cols.length - 1]) >= 2); if (!opts.length) { ok = false; break; } const c = choice(opts, rnd); cols.push(c); free.splice(free.indexOf(c), 1); }
      if (ok) return cols;
    }
  }
  function growRegions(rnd, n, queens) {
    const region = Array.from({ length: n }, () => Array(n).fill(-1)), weights = [];
    queens.forEach((c, r) => { region[r][c] = r; weights.push(choice([0.3, 1, 1, 2, 4], rnd)); });
    let unassigned = n * n - n;
    while (unassigned) {
      const frontier = [];
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { if (region[r][c] < 0) continue; for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < n && cc >= 0 && cc < n && region[rr][cc] < 0) frontier.push([region[r][c], rr, cc]); } }
      let pick = rnd() * frontier.reduce((s, f) => s + weights[f[0]], 0), chosen = frontier[frontier.length - 1];
      for (const f of frontier) { pick -= weights[f[0]]; if (pick <= 0) { chosen = f; break; } }
      region[chosen[1]][chosen[2]] = chosen[0]; unassigned--;
    }
    return region;
  }
  function regionPuzzle(region) {
    const n = region.length, labels = [...Array(n)].map((_, k) => String.fromCharCode(65 + k));
    const regions = region.map(row => row.map(k => labels[k])), colors = {};
    labels.forEach((l, k) => { colors[l] = Q.QPALETTE[k % Q.QPALETTE.length][1]; });
    return Q.queensPuzzle(n, regions, colors);
  }
  function connectedWithout(region, k, skip) {
    const n = region.length, cells = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (region[r][c] === k && !(skip && r === skip[0] && c === skip[1])) cells.push([r, c]);
    if (!cells.length) return false;
    const seen = new Set([cells[0][0] * n + cells[0][1]]), stack = [cells[0]];
    while (stack.length) { const [r, c] = stack.pop(); for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = c + dc; if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue; if (skip && rr === skip[0] && cc === skip[1]) continue; if (region[rr][cc] !== k || seen.has(rr * n + cc)) continue; seen.add(rr * n + cc); stack.push([rr, cc]); } }
    return seen.size === cells.length;
  }
  const cellsOf = n => { const out = []; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) out.push([r, c]); return out; };
  function mutateRegion(rnd, region, queens) {
    const n = region.length;
    for (const [r, c] of shuffle(cellsOf(n), rnd)) {
      if (queens[r] === c) continue;
      const k = region[r][c], nb = new Set();
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < n && cc >= 0 && cc < n) nb.add(region[rr][cc]); }
      nb.delete(k);
      if (!nb.size || !connectedWithout(region, k, [r, c])) continue;
      const out = region.map(row => row.slice()); out[r][c] = choice([...nb].sort((a, b) => a - b), rnd); return out;
    }
    return null;
  }
  function climbQueens(rnd, n, low, high, budget) {
    const queens = randomQueens(rnd, n);
    let region = growRegions(rnd, n, queens);
    const evaluate = reg => { const p = regionPuzzle(reg), d = Q.qDeduce(p), score = qHardness(d.steps); return d.done ? { val: -Math.abs(score - Math.max(low, Math.min(high, score))) * 10, score, p, queens: d.queens } : { val: d.progress - 1000, score, p, queens: d.queens }; };
    let cur = evaluate(region);
    for (let i = 0; i < budget; i++) {
      if (cur.val === 0) return cur;
      const cand = mutateRegion(rnd, region, queens);
      if (!cand) continue;
      const next = evaluate(cand);
      if (next.val >= cur.val) { region = cand; cur = next; }
    }
    return null;
  }
  function generateQueens(seed, n, difficulty) {
    const rnd = rngFrom(seed), [low, high] = qBand(n, difficulty);
    for (;;) { const res = climbQueens(rnd, n, low, high, 1500); if (res) return res; }
  }
  return { generateQueens };
}
