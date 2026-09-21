// Shared page state and helpers used by the game engines and the shell.
const U = UTIL(), TS = TANGO_SOLVER(U), QS = QUEENS_SOLVER(U);
const PUZZLES = (window.PUZZLE_DATA && window.PUZZLE_DATA.puzzles) || [];
const GAMES = ['tango', 'queens'];
const GAME_NAMES = { tango: 'Tango', queens: 'Queens' };
const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
const fmtTime = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const at = ([r, c]) => `(${r + 1},${c + 1})`;
const key = (r, c, N) => r * N + c;

const SUN_SVG = '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="var(--sun)" stroke="var(--sun-edge)" stroke-width="2.5"/></svg>';
const MOON_SVG = '<svg viewBox="0 0 32 32"><path d="M17 3.5 A12.5 12.5 0 1 0 28.5 19 A9.5 9.5 0 1 1 17 3.5 Z" fill="var(--moon)"/></svg>';
const CROWN = '<svg viewBox="0 0 32 32"><path d="M5 23 L3 9 L10.5 15 L16 6 L21.5 15 L29 9 L27 23 Z" fill="currentColor"/><rect x="5" y="24.5" width="22" height="3.5" rx="1.2" fill="currentColor"/></svg>';
const XMARK = '<svg viewBox="0 0 32 32"><path d="M8 8 L24 24 M24 8 L8 24" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" fill="none"/></svg>';

function addCoords(board, N) {
  const top = el('div', 'coords top'), left = el('div', 'coords left');
  for (let i = 0; i < N; i++) { top.insertAdjacentHTML('beforeend', `<span>${i + 1}</span>`); left.insertAdjacentHTML('beforeend', `<span>${i + 1}</span>`); }
  board.appendChild(top); board.appendChild(left);
}
