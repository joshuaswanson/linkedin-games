// Tango board, play rules and hint rendering.
class Tango {
  constructor(T) {
    this.T = T; this.n = T.n; this.cellSize = T.n <= 6 ? 64 : 48;
    this.cells = [];
    this.solution = T.solution.map(row => row.split(''));
    this.puzzle = TS.tangoPuzzle(T.n, T.givens, T.edges);
  }
  build(board, onClick) {
    const T = this.T, N = this.n, CELL = this.cellSize;
    board.className = 'board tango';
    board.style.setProperty('--cell', CELL + 'px');
    board.style.gridTemplateColumns = `repeat(${N}, ${CELL}px)`;
    for (let r = 0; r < N; r++) {
      this.cells.push([]);
      for (let c = 0; c < N; c++) {
        const cell = el('div', 'cell' + (c === N - 1 ? ' last-col' : '') + (r === N - 1 ? ' last-row' : ''));
        if (T.givens[r][c]) cell.classList.add('given');
        cell.addEventListener('click', () => onClick(r, c));
        board.appendChild(cell);
        this.cells[r].push(cell);
      }
    }
    for (const e of T.edges) {
      const badge = el('div', 'edge', e.type === '=' ? '=' : '×');
      badge.style.left = ((e.a[1] + e.b[1]) / 2 + 0.5) * CELL + 'px';
      badge.style.top = ((e.a[0] + e.b[0]) / 2 + 0.5) * CELL + 'px';
      board.appendChild(badge);
    }
    addCoords(board, N);
    this.marks = this.emptyMarks();
  }
  glyph(v) { return v === 'S' ? SUN_SVG : v === 'M' ? MOON_SVG : ''; }
  symbolName(v) { return v === 'S' ? 'sun' : 'moon'; }
  rules() { return '<li>Every cell is a sun or a moon.</li><li>No more than two of the same symbol next to each other, across or down.</li><li>Each row and each column has as many suns as moons.</li><li>Cells joined by = match. Cells joined by × differ.</li>'; }
  playHint() { return 'Click a cell to cycle sun, moon, empty. <kbd>&#8984;Z</kbd> undoes, <kbd>H</kbd> reveals the next move, <kbd>Enter</kbd> applies it. Shaded cells are givens.'; }
  playOptions() { return ''; }
  emptyMarks() { return this.T.givens.map(row => row.slice()); }
  isGiven(r, c) { return !!this.T.givens[r][c]; }
  click(r, c) {
    if (this.isGiven(r, c)) return false;
    const v = this.marks[r][c];
    this.marks[r][c] = v === null ? 'S' : v === 'S' ? 'M' : null;
    return true;
  }
  violations() {
    const N = this.n, g = this.marks, bad = new Set();
    for (const { coords } of this.puzzle.lines) {
      const vals = coords.map(([r, c]) => g[r][c]);
      for (let i = 0; i + 2 < N; i++) if (vals[i] && vals[i] === vals[i + 1] && vals[i] === vals[i + 2]) [i, i + 1, i + 2].forEach(j => bad.add(key(...coords[j], N)));
      for (const sym of ['S', 'M']) if (vals.filter(v => v === sym).length > N / 2) coords.forEach(([r, c], j) => { if (vals[j] === sym) bad.add(key(r, c, N)); });
      for (let i = 0; i + 1 < N; i++) {
        const mark = this.puzzle.edge(coords[i], coords[i + 1]);
        if (!mark || !vals[i] || !vals[i + 1]) continue;
        if ((mark === '=' && vals[i] !== vals[i + 1]) || (mark === 'x' && vals[i] === vals[i + 1])) { bad.add(key(...coords[i], N)); bad.add(key(...coords[i + 1], N)); }
      }
    }
    return bad;
  }
  isComplete() { return this.marks.every(row => row.every(v => v)); }
  status(bad, started) {
    const empties = this.marks.flat().filter(v => !v).length;
    if (bad.size) return `${bad.size} ${bad.size === 1 ? 'cell breaks' : 'cells break'} a rule.`;
    if (!started) return 'Click a cell to start.';
    return `${empties} ${empties === 1 ? 'cell' : 'cells'} left.`;
  }
  mistakes() {
    const out = [];
    for (let r = 0; r < this.n; r++) for (let c = 0; c < this.n; c++) if (this.marks[r][c] && this.marks[r][c] !== this.solution[r][c]) out.push([r, c]);
    return out;
  }
  render(bad, popCell, hint) {
    const N = this.n;
    const lineSet = new Set(hint && hint.line ? hint.line.map(([r, c]) => key(r, c, N)) : []);
    const focus = hint && hint.cell ? key(...hint.cell, N) : -1;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const cell = this.cells[r][c], k = key(r, c, N);
      const ghost = !!(hint && k === focus && hint.value && !this.marks[r][c]);
      cell.innerHTML = this.glyph(ghost ? hint.value : this.marks[r][c]);
      cell.classList.remove('target', 'cause');
      cell.classList.toggle('tint', lineSet.has(k));
      cell.classList.toggle('current', k === focus && !(hint && hint.mistake));
      cell.classList.toggle('ghost', ghost);
      cell.classList.toggle('err', bad.has(k) || !!(hint && hint.mistake && k === focus));
      cell.classList.toggle('pop', !!popCell && popCell[0] === r && popCell[1] === c);
    }
  }
  // A hint is either a mistake to undo or the next forced cell with its explanation.
  nextHint() {
    const wrong = this.mistakes();
    if (wrong.length) { const cell = wrong[0]; return { mistake: true, cell, text: `The ${this.symbolName(this.marks[cell[0]][cell[1]])} at ${at(cell)} is wrong. Take it out.` }; }
    const step = TS.tangoNextStep(this.puzzle, this.marks);
    if (!step) return { none: true, text: 'No row or column pins a cell from here.' };
    if (step.contradiction) return { none: true, text: `${cap(step.contradiction)} cannot be completed from here.` };
    return step;
  }
  applyHint(hint) {
    if (hint.mistake) this.marks[hint.cell[0]][hint.cell[1]] = null;
    else this.marks[hint.cell[0]][hint.cell[1]] = hint.value;
  }
  explainHint(hint, explain, comps) {
    comps.innerHTML = '';
    if (hint.mistake || hint.none) { explain.textContent = hint.text; return; }
    const [r, c] = hint.cell, sym = this.symbolName(hint.value);
    const isRow = hint.lineName.startsWith('row'), dir = isRow ? 'h' : 'v';
    const lineLabel = hint.lineName.replace('col', 'column');
    const unit = isRow ? 'column' : 'row';
    const posInLine = isRow ? c : r;
    const idx = hint.line.findIndex(([lr, lc]) => lr === r && lc === c);
    const known = hint.known, marks = hint.marks, valid = hint.completions, rejected = hint.rejected;
    const empties = known.filter(v => !v).length, total = valid.length + rejected.length, nValid = valid.length;
    explain.innerHTML =
      `<b>${cap(lineLabel)}</b> has ${empties} empty ${empties === 1 ? 'cell' : 'cells'}, so ${total} ${total === 1 ? 'way' : 'ways'} to fill it. ` +
      (nValid === 1 ? 'Only one follows the rules, and it puts a ' : `${nValid} follow the rules, and every one puts a `) +
      `<b>${sym}</b> in ${unit} ${posInLine + 1}. So <b>${at(hint.cell)}</b> is a ${sym}.`;
    const sets = el('div', `sets ${dir}`);
    const now = el('div', 'set');
    now.appendChild(el('div', 'caption', `${cap(lineLabel)} now`));
    now.appendChild(this.strip(known, { dir, known, marks, ask: idx }));
    sets.appendChild(now);
    const ok = el('div', 'set');
    ok.appendChild(el('div', 'caption', nValid === 1 ? 'The one valid filling' : `The ${nValid} valid fillings`));
    const okGroup = el('div', 'group' + (isRow ? ' stack' : ''));
    valid.forEach(v => okGroup.appendChild(this.strip(v.split(''), { dir, known, marks, focus: idx })));
    ok.appendChild(okGroup);
    sets.appendChild(ok);
    comps.appendChild(sets);
    if (!rejected.length) return;
    const rej = el('div', 'rejected');
    rej.appendChild(el('div', 'caption', rejected.length === 1 ? 'The one rejected filling, and the rule it breaks' : `The ${rejected.length} rejected fillings, grouped by the rule each breaks`));
    const RULE_ORDER = ['run', 'count', 'equal', 'differ'];
    const RULE_TEXT = { run: 'Three in a row', count: 'Unequal number of suns and moons', equal: 'Cells joined by = differ', differ: 'Cells joined by × match' };
    for (const kind of RULE_ORDER) {
      const items = rejected.filter(x => x.kind === kind);
      if (!items.length) continue;
      const cl = el('div', 'cluster');
      cl.appendChild(el('div', 'caption', `<span class="bad-dot"></span><span>${RULE_TEXT[kind]}</span><span class="n">${items.length}</span>`));
      const grp = el('div', 'group');
      items.forEach(it => grp.appendChild(this.strip(it.line.split(''), { dir, known, marks, small: true, bad: it.cells, badMark: (kind === 'equal' || kind === 'differ') ? it.cells[0] : -1 })));
      cl.appendChild(grp);
      rej.appendChild(cl);
    }
    comps.appendChild(rej);
  }
  strip(values, o) {
    const s = el('div', `strip ${o.dir}${o.small ? ' sm' : ''}`);
    const bad = new Set(o.bad || []);
    values.forEach((v, i) => {
      const cell = el('div', 'sc', this.glyph(v));
      if (o.known && o.known[i]) cell.classList.add('known');
      if (i === o.ask) cell.classList.add('ask');
      if (i === o.focus) cell.classList.add('focus');
      if (bad.has(i)) cell.classList.add('bad');
      s.appendChild(cell);
    });
    o.marks.forEach((m, i) => {
      if (!m || (o.small && i !== o.badMark)) return;
      const em = el('div', 'em' + (i === o.badMark ? ' bad' : ''), m === '=' ? '=' : '×');
      em.style[o.dir === 'h' ? 'left' : 'top'] = `calc(${i + 1} * var(--sc))`;
      s.appendChild(em);
    });
    return s;
  }
}
