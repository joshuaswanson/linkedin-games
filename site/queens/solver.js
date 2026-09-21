// Queens solver: candidate elimination with single, confinement and no-room rules.
function QUEENS_SOLVER(U) {
  const QPALETTE = [['lavender', '#BBA3E2'], ['blue', '#96BEFF'], ['orange', '#FFC992'], ['gray', '#DFDFDF'], ['green', '#B3DFA0'], ['taupe', '#B9B29E'], ['red', '#FF7B60'], ['yellow', '#E6F388'], ['pink', '#DFA0BF'], ['teal', '#95CBCF'], ['salmon', '#FAA889'], ['cyan', '#55EBE2'], ['magenta', '#FE93F1'], ['mint', '#91F5AD'], ['periwinkle', '#C9C9EE'], ['emerald', '#5BBA6F']];
  const joinNames = names => names.length <= 1 ? (names[0] || '') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  function* combos(arr, k, start = 0, acc = []) {
    if (acc.length === k) { yield acc.slice(); return; }
    for (let i = start; i <= arr.length - (k - acc.length); i++) { acc.push(arr[i]); yield* combos(arr, k, i + 1, acc); acc.pop(); }
  }
  function queensPuzzle(n, regions, colors, names) {
    const labels = [], regionCells = {};
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const l = regions[r][c]; if (!(l in regionCells)) { labels.push(l); regionCells[l] = []; } regionCells[l].push([r, c]); }
    if (!names) { names = {}; labels.forEach(l => { const hit = QPALETTE.find(p => p[1] === colors[l]); names[l] = hit ? hit[0] : 'colour ' + l; }); }
    const units = [];
    for (let i = 0; i < n; i++) units.push(['row', i]);
    for (let i = 0; i < n; i++) units.push(['col', i]);
    for (const l of labels) units.push(['region', l]);
    const unitCells = u => u[0] === 'row' ? [...Array(n)].map((_, c) => [u[1], c]) : u[0] === 'col' ? [...Array(n)].map((_, r) => [r, u[1]]) : regionCells[u[1]];
    const unitName = u => u[0] === 'row' ? `row ${u[1] + 1}` : u[0] === 'col' ? `column ${u[1] + 1}` : `the ${names[u[1]]} region`;
    const cellUnits = ([r, c]) => [['row', r], ['col', c], ['region', regions[r][c]]];
    const neighbours = ([r, c]) => { const out = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if ((dr || dc) && r + dr >= 0 && r + dr < n && c + dc >= 0 && c + dc < n) out.push([r + dr, c + dc]); } return out; };
    return { n, regions, labels, colors, names, units, unitCells, unitName, cellUnits, neighbours, regionCells };
  }
  const sameUnit = (a, b) => a[0] === b[0] && a[1] === b[1];
  class QState {
    constructor(p) { this.p = p; this.cand = Array.from({ length: p.n }, () => Array(p.n).fill(true)); this.queens = []; }
    copy() { const s = new QState(this.p); s.cand = this.cand.map(r => r.slice()); s.queens = this.queens.slice(); return s; }
    candidates(u) { return this.p.unitCells(u).filter(([r, c]) => this.cand[r][c]); }
    hasQueen(u) { const cells = this.p.unitCells(u); return this.queens.some(q => cells.some(x => x[0] === q[0] && x[1] === q[1])); }
    openUnits() { return this.p.units.filter(u => !this.hasQueen(u)); }
    eliminate(cells) { const removed = []; for (const [r, c] of cells) if (this.cand[r][c]) { this.cand[r][c] = false; removed.push([r, c]); } return removed; }
    struckBy(cell) {
      const set = new Set();
      for (const u of this.p.cellUnits(cell)) for (const [r, c] of this.p.unitCells(u)) set.add(r * this.p.n + c);
      for (const [r, c] of this.p.neighbours(cell)) set.add(r * this.p.n + c);
      set.delete(cell[0] * this.p.n + cell[1]);
      return set;
    }
    place(cell) {
      this.queens.push(cell); this.cand[cell[0]][cell[1]] = false;
      const keys = [...this.struckBy(cell)].sort((a, b) => a - b);
      return this.eliminate(keys.map(k => [Math.floor(k / this.p.n), k % this.p.n]));
    }
    ok() { return this.openUnits().every(u => this.candidates(u).length > 0); }
  }
  function qSingle(st) {
    const p = st.p;
    for (const u of st.openUnits()) {
      const cands = st.candidates(u);
      if (!cands.length) return 'contradiction';
      if (cands.length === 1) { const cell = cands[0]; return { kind: 'queen', cells: [cell], reason: `${p.unitName(u)} has one cell left`, cause: p.unitCells(u).filter(x => x[0] !== cell[0] || x[1] !== cell[1]) }; }
    }
    return null;
  }
  function qConfine(st, k) {
    const p = st.p, open = st.openUnits(), openRegions = open.filter(u => u[0] === 'region');
    for (const [lineKind, axis] of [['row', 0], ['col', 1]]) {
      const openLines = open.filter(u => u[0] === lineKind);
      for (const combo of combos(openRegions, k)) {
        const cells = combo.flatMap(u => st.candidates(u));
        const lines = [...new Set(cells.map(c => c[axis]))].sort((a, b) => a - b);
        if (lines.length !== k) continue;
        const regionSet = new Set(combo.map(u => u[1]));
        const targets = lines.flatMap(line => st.candidates([lineKind, line]).filter(([r, c]) => !regionSet.has(p.regions[r][c])));
        if (targets.length) return { kind: 'eliminate', cells: targets, reason: `${joinNames(combo.map(p.unitName))} ${k === 1 ? 'fits' : 'fit'} only in ${joinNames(lines.map(l => p.unitName([lineKind, l])))}, so the other cells there are out`, cause: cells };
      }
      for (const combo of combos(openLines, k)) {
        const cells = combo.flatMap(u => st.candidates(u));
        const regs = [...new Set(cells.map(([r, c]) => p.regions[r][c]))].sort((a, b) => p.labels.indexOf(a) - p.labels.indexOf(b));
        if (regs.length !== k) continue;
        const lineSet = new Set(combo.map(u => u[1]));
        const targets = regs.flatMap(l => st.candidates(['region', l]).filter(c => !lineSet.has(c[axis])));
        if (targets.length) { const where = joinNames(regs.map(l => p.unitName(['region', l]))); return { kind: 'eliminate', cells: targets, reason: `${joinNames(combo.map(p.unitName))} only ${k === 1 ? 'has' : 'have'} cells of ${where}, so those queens sit there and the rest of ${where} is out`, cause: cells }; }
      }
    }
    return null;
  }
  function qBlocked(st) {
    const p = st.p, open = st.openUnits(), byUnit = [];
    for (let r = 0; r < p.n; r++) for (let c = 0; c < p.n; c++) {
      if (!st.cand[r][c]) continue;
      const struck = st.struckBy([r, c]), own = p.cellUnits([r, c]);
      for (const u of open) {
        if (own.some(o => sameUnit(o, u))) continue;
        if (st.candidates(u).every(([rr, cc]) => struck.has(rr * p.n + cc))) {
          let entry = byUnit.find(e => sameUnit(e.unit, u));
          if (!entry) { entry = { unit: u, cells: [] }; byUnit.push(entry); }
          entry.cells.push([r, c]); break;
        }
      }
    }
    if (!byUnit.length) return null;
    let best = byUnit[0]; for (const e of byUnit) if (e.cells.length > best.cells.length) best = e;
    return { kind: 'eliminate', cells: best.cells, reason: `a queen on ${best.cells.length > 1 ? 'any of these cells' : 'this cell'} would leave ${p.unitName(best.unit)} with no room`, cause: st.candidates(best.unit) };
  }
  function qApply(st, step) { step.removed = step.kind === 'queen' ? st.place(step.cells[0]) : st.eliminate(step.cells); return step; }
  function qNextStep(st) {
    let step = qSingle(st);
    if (step === 'contradiction') return step;
    step = step || qConfine(st, 1) || qBlocked(st);
    for (let k = 2; k < st.p.n && !step; k++) step = qConfine(st, k);
    return step;
  }
  function qDeduce(p) {
    const st = new QState(p), steps = [];
    while (st.queens.length < p.n) {
      const step = qNextStep(st);
      if (!step || step === 'contradiction') break;
      qApply(st, step);
      if (!st.ok()) break;
      steps.push(step);
    }
    let decided = 0; for (const row of st.cand) for (const v of row) if (!v) decided++;
    return { steps, done: st.queens.length === p.n, progress: decided + 3 * st.queens.length, queens: st.queens };
  }
  return { QPALETTE, queensPuzzle, QState, qNextStep, qApply, qDeduce };
}
