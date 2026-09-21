// Queens board, play rules and hint rendering.
class Queens {
  constructor(T) {
    this.T = T; this.n = T.n; this.cellSize = T.n <= 8 ? 56 : T.n <= 10 ? 48 : 40;
    this.cells = [];
    const colors = {}, names = {};
    T.labels.forEach((l, i) => { colors[l] = T.colors[i]; names[l] = T.names[i]; });
    this.puzzle = QS.queensPuzzle(T.n, T.regions.map(row => row.split('')), colors, names);
    this.solution = new Set(T.solution.map(([r, c]) => key(r, c, T.n)));
  }
  colorOf(label) { return this.puzzle.colors[label] || '#ddd'; }
  build(board, onClick) {
    const N = this.n, CELL = this.cellSize, regions = this.puzzle.regions;
    board.className = 'board queens';
    board.style.setProperty('--cell', CELL + 'px');
    board.style.gridTemplateColumns = `repeat(${N}, ${CELL}px)`;
    for (let r = 0; r < N; r++) {
      this.cells.push([]);
      for (let c = 0; c < N; c++) {
        const cell = el('div', 'cell');
        cell.style.background = this.colorOf(regions[r][c]);
        cell.addEventListener('click', () => onClick(r, c));
        board.appendChild(cell);
        this.cells[r].push(cell);
      }
    }
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'outline');
    svg.setAttribute('viewBox', `0 0 ${N * CELL} ${N * CELL}`);
    let d = '', td = '';
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const me = regions[r][c];
      if (c === N - 1 || regions[r][c + 1] !== me) d += `M${(c + 1) * CELL} ${r * CELL} v${CELL} `;
      if (r === N - 1 || regions[r + 1][c] !== me) d += `M${c * CELL} ${(r + 1) * CELL} h${CELL} `;
      if (c === 0) d += `M0 ${r * CELL} v${CELL} `;
      if (r === 0) d += `M${c * CELL} 0 h${CELL} `;
    }
    for (let i = 1; i < N; i++) td += `M${i * CELL} 0 v${N * CELL} M0 ${i * CELL} h${N * CELL} `;
    const thin = document.createElementNS(ns, 'path');
    thin.setAttribute('d', td); thin.setAttribute('stroke', 'rgba(28,27,24,0.18)'); thin.setAttribute('stroke-width', '1'); thin.setAttribute('fill', 'none');
    const thick = document.createElementNS(ns, 'path');
    thick.setAttribute('d', d); thick.setAttribute('stroke', '#1c1b18'); thick.setAttribute('stroke-width', '3'); thick.setAttribute('stroke-linecap', 'square'); thick.setAttribute('fill', 'none');
    svg.appendChild(thin); svg.appendChild(thick);
    board.appendChild(svg);
    addCoords(board, N);
    this.marks = this.emptyMarks();
  }
  rules() { return '<li>Place exactly one queen in each row, each column and each colour region.</li><li>Two queens cannot touch, not even diagonally.</li><li>Use X to mark cells where a queen cannot go.</li>'; }
  playHint() { return 'Click a cell to cycle X, queen, empty. <kbd>&#8984;Z</kbd> undoes, <kbd>H</kbd> reveals the next move, <kbd>Enter</kbd> applies it.'; }
  playOptions() { return '<label class="opt"><input type="checkbox" id="autox" checked> Auto-fill X around queens</label>'; }
  emptyMarks() { return Array.from({ length: this.n }, () => Array(this.n).fill('')); }
  isGiven() { return false; }
  autoX(r, c) {
    const autox = $('autox');
    if (!autox || !autox.checked) return;
    const N = this.n, regions = this.puzzle.regions, strike = new Set();
    for (let i = 0; i < N; i++) { strike.add(key(r, i, N)); strike.add(key(i, c, N)); }
    for (let rr = 0; rr < N; rr++) for (let cc = 0; cc < N; cc++) if (regions[rr][cc] === regions[r][c]) strike.add(key(rr, cc, N));
    for (const [rr, cc] of this.puzzle.neighbours([r, c])) strike.add(key(rr, cc, N));
    for (const k of strike) { const rr = Math.floor(k / N), cc = k % N; if ((rr !== r || cc !== c) && this.marks[rr][cc] === '') this.marks[rr][cc] = 'X'; }
  }
  click(r, c) {
    const cur = this.marks[r][c];
    this.marks[r][c] = cur === '' ? 'X' : cur === 'X' ? 'Q' : '';
    if (this.marks[r][c] === 'Q') this.autoX(r, c);
    return true;
  }
  queens() { const qs = []; for (let r = 0; r < this.n; r++) for (let c = 0; c < this.n; c++) if (this.marks[r][c] === 'Q') qs.push([r, c]); return qs; }
  violations() {
    const N = this.n, regions = this.puzzle.regions, bad = new Set(), qs = this.queens();
    for (let i = 0; i < qs.length; i++) for (let j = i + 1; j < qs.length; j++) {
      const [r1, c1] = qs[i], [r2, c2] = qs[j];
      if (r1 === r2 || c1 === c2 || regions[r1][c1] === regions[r2][c2] || (Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1)) { bad.add(key(r1, c1, N)); bad.add(key(r2, c2, N)); }
    }
    return bad;
  }
  isComplete() { return this.queens().length === this.n; }
  status(bad, started) {
    const count = this.queens().length;
    if (bad.size) return `${bad.size} queens clash.`;
    if (!started) return 'Click a cell to start.';
    return `${count} of ${this.n} queens placed.`;
  }
  mistakes() {
    const out = [];
    for (let r = 0; r < this.n; r++) for (let c = 0; c < this.n; c++) {
      const m = this.marks[r][c], isQ = this.solution.has(key(r, c, this.n));
      if ((m === 'Q' && !isQ) || (m === 'X' && isQ)) out.push([r, c]);
    }
    return out;
  }
  setCell(cell, mark) { cell.innerHTML = mark === 'Q' ? CROWN : mark === 'X' ? `<span class="x">${XMARK}</span>` : ''; }
  render(bad, popCell, hint) {
    const N = this.n;
    const targets = new Set(hint && hint.cells ? hint.cells.map(([r, c]) => key(r, c, N)) : []);
    const causes = new Set(hint && hint.cause ? hint.cause.map(([r, c]) => key(r, c, N)) : []);
    const mistake = hint && hint.mistake ? key(...hint.cell, N) : -1;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const cell = this.cells[r][c], k = key(r, c, N);
      const ghost = targets.has(k) && !this.marks[r][c];
      this.setCell(cell, ghost ? (hint.kind === 'queen' ? 'Q' : 'X') : this.marks[r][c]);
      cell.classList.remove('tint', 'current');
      cell.classList.toggle('target', targets.has(k));
      cell.classList.toggle('ghost', ghost);
      cell.classList.toggle('cause', causes.has(k) && !targets.has(k));
      cell.classList.toggle('err', bad.has(k) || k === mistake);
      cell.classList.toggle('pop', !!popCell && popCell[0] === r && popCell[1] === c);
    }
  }
  nextHint() {
    const wrong = this.mistakes();
    if (wrong.length) {
      const cell = wrong[0], m = this.marks[cell[0]][cell[1]];
      return { mistake: true, cell, text: m === 'Q' ? `The queen at ${at(cell)} is wrong. Take it out.` : `The X at ${at(cell)} is wrong: a queen belongs there. Take it out.` };
    }
    const st = new QS.QState(this.puzzle);
    for (const q of this.queens()) st.place(q);
    for (let r = 0; r < this.n; r++) for (let c = 0; c < this.n; c++) if (this.marks[r][c] === 'X') st.eliminate([[r, c]]);
    const step = QS.qNextStep(st);
    if (!step) return { none: true, text: 'No rule applies from here.' };
    if (step === 'contradiction') return { none: true, text: 'Some row, column or region has no cell left.' };
    QS.qApply(st.copy(), step);
    return step;
  }
  applyHint(hint) {
    if (hint.mistake) { this.marks[hint.cell[0]][hint.cell[1]] = ''; return; }
    if (hint.kind === 'queen') { const [r, c] = hint.cells[0]; this.marks[r][c] = 'Q'; this.autoX(r, c); }
    else for (const [r, c] of hint.cells) if (this.marks[r][c] === '') this.marks[r][c] = 'X';
  }
  explainHint(hint, explain, comps) {
    comps.innerHTML = '';
    if (hint.mistake || hint.none) { explain.textContent = hint.text; return; }
    comps.innerHTML = '<div class="legend"><span><i class="t"></i>this move</span><span><i class="c"></i>the cells it follows from</span></div>';
    if (hint.kind === 'queen') {
      const extra = hint.removed.length;
      explain.innerHTML = `${cap(hint.reason)}, so its queen goes on <b>${at(hint.cells[0])}</b>.` + (extra ? ` That rules out ${extra} more ${extra === 1 ? 'cell' : 'cells'}.` : '');
    } else {
      explain.innerHTML = `${cap(hint.reason)}. Out: <b>${hint.cells.map(at).join(', ')}</b>.`;
    }
  }
}
