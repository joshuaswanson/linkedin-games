// Pure helpers shared by the solvers, the generators and the page.
function UTIL() {
  const SUN = 'S', MOON = 'M';
  const pk = (a, b) => `${a[0]},${a[1]}|${b[0]},${b[1]}`;
  function rngFrom(seed) {
    let a = seed >>> 0;
    return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const shuffle = (arr, rnd) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const choice = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
  return { SUN, MOON, pk, rngFrom, shuffle, choice };
}
