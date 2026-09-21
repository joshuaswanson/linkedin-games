// Page shell: puzzle list, play loop, hints, persistence and generation requests.
let game = GAMES[0], puzzle = null, engine = null, hint = null;
let undoStack = [], startedAt = null, elapsedMs = 0, tickId = null, solved = false;
const board = $('board'), explain = $('explain'), comps = $('comps'), timerEl = $('timer'), statusEl = $('status');

document.body.classList.toggle('one-game', GAMES.length === 1);
document.body.classList.toggle('one-puzzle', PUZZLES.length === 1);
for (const g of GAMES) {
  const b = el('button', '', GAME_NAMES[g] || g);
  b.dataset.game = g;
  b.addEventListener('click', () => selectGame(g));
  $('games').appendChild(b);
}

const storeKey = p => `lg:${p.game}:${p.id}`;
function loadSaved(p) { try { return JSON.parse(localStorage.getItem(storeKey(p)) || 'null'); } catch { return null; } }
function save() { if (puzzle) localStorage.setItem(storeKey(puzzle), JSON.stringify({ marks: engine.marks, elapsed: elapsedMs, solved })); }

function renderList() {
  const list = $('list');
  list.innerHTML = '';
  const items = PUZZLES.filter(p => p.game === game);
  if (!items.length) { list.appendChild(el('div', 'empty-list', 'Your puzzles will be listed here.')); return; }
  let group = null;
  for (const p of items) {
    if (p.group !== group) { group = p.group; list.appendChild(el('h3', '', group)); }
    const saved = loadSaved(p);
    const row = el('div', 'item' + (p === puzzle ? ' on' : ''));
    row.innerHTML = `<span>${p.title}</span>` + (p.tag ? `<span class="tag">${p.tag}</span>` : '') + (saved && saved.solved ? `<span class="done">${fmtTime(saved.elapsed)} &#10003;</span>` : '');
    row.addEventListener('click', () => selectPuzzle(p));
    list.appendChild(row);
  }
}

// Generation in the worker. The page only exposes a difficulty level; the worker maps it to a recipe.
const genWorker = new Worker(URL.createObjectURL(new Blob([[UTIL, TANGO_SOLVER, QUEENS_SOLVER, TANGO_GEN, QUEENS_GEN, GEN_WORKER].map(f => f.toString()).join('\n') + '\nGEN_WORKER();'], { type: 'text/javascript' })));
const genPending = new Map();
const GEN_STORE = 'lg:generated2';
const LEVEL_NAMES = ['', 'Easy', 'Medium', 'Hard', 'Harder', 'Hardest'];
function savedGenerated() { try { return JSON.parse(localStorage.getItem(GEN_STORE) || '[]'); } catch { return []; } }
const genId = req => `gen-l${req.level}-s${req.seed}`;
function requestGenerated(req, select) {
  const id = genId(req);
  const existing = PUZZLES.find(p => p.game === req.game && p.id === id);
  if (existing) { if (select) selectPuzzle(existing); return; }
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(`lg:genentry3:${req.game}:${id}`) || 'null'); } catch { cached = null; }
  if (cached) { addGenerated(req, cached, select); return; }
  genPending.set(`${req.game}:${id}`, select);
  setGenBusy();
  genWorker.postMessage(req);
}
function addGenerated(req, entry, select) {
  const id = genId(req);
  if (PUZZLES.some(p => p.game === req.game && p.id === id)) return;
  const number = PUZZLES.filter(p => p.game === req.game && p.group === 'Your puzzles').length + 1;
  Object.assign(entry, { game: req.game, id, title: `Puzzle ${number}`, tag: LEVEL_NAMES[req.level].toLowerCase(), group: 'Your puzzles', level: req.level, source: `Difficulty ${LEVEL_NAMES[req.level].toLowerCase()}` + (req.game === 'queens' ? `, ${entry.n}x${entry.n}` : '') });
  const first = PUZZLES.findIndex(p => p.game === req.game);
  PUZZLES.splice(first < 0 ? PUZZLES.length : first, 0, entry);
  const saved = savedGenerated();
  if (!saved.some(x => x.game === req.game && genId(x) === id)) { saved.unshift(req); localStorage.setItem(GEN_STORE, JSON.stringify(saved.slice(0, 200))); }
  try { localStorage.setItem(`lg:genentry3:${req.game}:${id}`, JSON.stringify(entry)); } catch { /* quota: regenerated on the next load */ }
  if (select) selectPuzzle(entry); else renderList();
}
function setGenBusy() {
  const busy = genPending.size > 0;
  $('gen-new').disabled = busy;
  $('gen-new').textContent = busy ? 'Working…' : 'New puzzle';
}
genWorker.onmessage = ev => {
  const { game: g, level, seed, entry } = ev.data;
  const req = { game: g, level, seed };
  const k = `${g}:${genId(req)}`;
  const select = genPending.get(k);
  genPending.delete(k);
  setGenBusy();
  addGenerated(req, entry, select);
};
$('gen-level').addEventListener('input', () => { $('gen-level-label').textContent = LEVEL_NAMES[+$('gen-level').value]; });
$('gen-new').addEventListener('click', () => requestGenerated({ game, level: +$('gen-level').value, seed: Math.floor(Math.random() * 1e9) }, true));

function selectGame(g) {
  game = g;
  $('heading').textContent = `${GAME_NAMES[g]} Generator`;
  [...$('games').children].forEach(b => b.classList.toggle('on', b.dataset.game === g));
  document.body.classList.toggle('game-tango', g === 'tango');
  document.body.classList.toggle('game-queens', g === 'queens');
  const first = PUZZLES.find(p => p.game === g);
  if (first) selectPuzzle(first);
  else { renderList(); requestGenerated({ game: g, level: +$('gen-level').value, seed: Math.floor(Math.random() * 1e9) }, true); }
}

function selectPuzzle(p) {
  stopTimer();
  puzzle = p; game = p.game; hint = null;
  $('heading').textContent = `${GAME_NAMES[game]} Generator`;
  [...$('games').children].forEach(b => b.classList.toggle('on', b.dataset.game === game));
  document.body.classList.toggle('game-tango', game === 'tango');
  document.body.classList.toggle('game-queens', game === 'queens');
  board.innerHTML = '';
  engine = p.game === 'tango' ? new Tango(p) : new Queens(p);
  engine.build(board, onCellClick);
  $('board-wrap').style.width = `${p.n * engine.cellSize + 24 + (p.game === 'tango' ? 3 : 0)}px`;
  $('rules').innerHTML = engine.rules();
  $('play-hint').innerHTML = engine.playHint();
  $('play-opts').innerHTML = engine.playOptions();
  undoStack = []; startedAt = null; elapsedMs = 0; solved = false;
  const saved = loadSaved(p);
  if (saved && saved.marks) { engine.marks = saved.marks; elapsedMs = saved.elapsed || 0; solved = !!saved.solved; if (elapsedMs && !solved) startedAt = 'paused'; }
  timerEl.textContent = fmtTime(elapsedMs);
  $('title').textContent = p.source || p.title;
  document.title = `${GAME_NAMES[game]} Generator`;
  history.replaceState(null, '', `#${game}/${encodeURIComponent(p.id)}`);
  renderList();
  render();
}

function render(popCell) {
  const bad = engine.violations();
  engine.render(bad, popCell, hint);
  if (!solved && engine.isComplete() && bad.size === 0) { solved = true; stopTimer(); hint = null; engine.render(bad, popCell, null); }
  board.classList.toggle('solved', solved);
  statusEl.classList.toggle('ok', solved);
  statusEl.textContent = solved ? `Solved in ${fmtTime(elapsedMs)}.` : engine.status(bad, startedAt !== null);
  $('undo').disabled = undoStack.length === 0 || solved;
  $('reveal').disabled = solved;
  $('reveal').textContent = hint ? 'Hide move' : 'Reveal next move';
  $('apply').disabled = !hint || hint.none || solved;
  explain.classList.toggle('bad', !!(hint && hint.mistake));
  if (hint) engine.explainHint(hint, explain, comps);
  else { comps.innerHTML = ''; explain.textContent = solved ? 'Solved.' : 'Reveal the next move to see which cell the rules pin down from the board as it is now, and why.'; }
  save();
  if (solved) renderList();
}
function change(popCell) { hint = null; render(popCell); }
function onCellClick(r, c) {
  if (solved || engine.isGiven(r, c)) return;
  const before = engine.marks.map(row => row.slice());
  if (!engine.click(r, c)) return;
  if (startedAt === null || startedAt === 'paused') startTimer();
  undoStack.push(before);
  change([r, c]);
}
function undoMove() {
  if (!engine || solved || !undoStack.length) return;
  engine.marks = undoStack.pop();
  change();
}
function clearBoard() {
  if (!engine) return;
  engine.marks = engine.emptyMarks();
  undoStack = []; solved = false;
  stopTimer(); startedAt = null; elapsedMs = 0;
  timerEl.textContent = '0:00';
  change();
  renderList();
}
function reveal() {
  if (!engine || solved) return;
  hint = hint ? null : engine.nextHint();
  render();
}
function applyHint() {
  if (!engine || !hint || hint.none || solved) return;
  const before = engine.marks.map(row => row.slice());
  engine.applyHint(hint);
  if (startedAt === null || startedAt === 'paused') startTimer();
  undoStack.push(before);
  change(hint.cell || (hint.cells && hint.cells[0]));
}
function startTimer() {
  startedAt = performance.now() - elapsedMs;
  tickId = setInterval(() => { elapsedMs = performance.now() - startedAt; timerEl.textContent = fmtTime(elapsedMs); }, 250);
}
function stopTimer() {
  if (tickId) { clearInterval(tickId); tickId = null; }
  if (typeof startedAt === 'number') { elapsedMs = performance.now() - startedAt; startedAt = 'paused'; }
  timerEl.textContent = fmtTime(elapsedMs);
}
$('undo').addEventListener('click', undoMove);
$('clear').addEventListener('click', clearBoard);
$('reveal').addEventListener('click', reveal);
$('apply').addEventListener('click', applyHint);
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undoMove(); }
  else if (e.key.toLowerCase() === 'h' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); reveal(); }
  else if (e.key === 'Enter') { e.preventDefault(); applyHint(); }
});

function fromHash() {
  const [hg, hid] = location.hash.slice(1).split('/');
  const id = decodeURIComponent(hid || '');
  const target = PUZZLES.find(p => p.game === hg && p.id === id);
  if (!target) {
    const m = (hg === 'tango' || hg === 'queens') && id.match(/^gen-l([1-5])-s(\d+)$/);
    if (m) { requestGenerated({ game: hg, level: +m[1], seed: +m[2] }, true); return true; }
    return false;
  }
  if (target !== puzzle) selectPuzzle(target);
  return true;
}
window.addEventListener('hashchange', fromHash);
for (const req of savedGenerated().reverse()) if (req.game && req.level) requestGenerated(req, false);
if (!fromHash()) selectGame(PUZZLES.length ? PUZZLES[0].game : 'tango');
