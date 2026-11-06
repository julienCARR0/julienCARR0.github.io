// Beat detection and 2D diagrams. Works without WebGL.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const C = { ink: css('--ink'), ink2: css('--ink-2'), ink3: css('--ink-3'), line: css('--line'), red: css('--red'), redInk: css('--red-ink'), paper: css('--paper'), wash: css('--red-wash') };
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
function text(parent, x, y, s, o = {}) { const t = el('text', Object.assign({ x, y, 'font-family': 'Geist Mono, monospace', 'font-size': 12, fill: C.ink2 }, o), parent); t.textContent = s; return t; }

/* ---------- active beat ---------- */
const beatEls = [...document.querySelectorAll('[data-beat]')];
const vizEls = [...document.querySelectorAll('.viz')];
let active = null;
function pickBeat() {
  const mid = innerWidth < 820 ? innerHeight * 0.72 : innerHeight * 0.5;
  let best = null, bd = 1e9, bh = 1e9;
  for (const e of beatEls) {
    const r = e.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) continue;
    const d = (r.top <= mid && r.bottom >= mid) ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
    if (d < bd || (d === 0 && r.height < bh)) { bd = d; bh = r.height; best = e.dataset.beat; }
  }
  return best || active || 'hero';
}
function update() {
  const id = pickBeat();
  if (id !== active) {
    active = id; window.__beat = id;
    vizEls.forEach(v => v.classList.toggle('on', v.dataset.viz.split(' ').includes(id)));
    window.dispatchEvent(new CustomEvent('beat', { detail: id }));
    onViz(id);
  }
}
let ticking = false;
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; update(); }); } }, { passive: true });
addEventListener('resize', update);

/* ---------- Sonceboz: soft-start chart (schematic shape) ---------- */
(function softStart() {
  const s = document.getElementById('softstart'); if (!s) return;
  const W = 520, H = 200, x0 = 46, x1 = 506, yTop = 16, yBot = 180;
  const yMin = -18, yMax = 8; const Y = v => yTop + (yMax - v) / (yMax - yMin) * (yBot - yTop);
  // grid
  [-16, -8, 0, 8].forEach(v => { el('line', { x1: x0, x2: x1, y1: Y(v), y2: Y(v), stroke: C.line, 'stroke-width': 1 }, s); text(s, x0 - 8, Y(v) + 4, (v > 0 ? '+' : '') + v + ' A', { 'text-anchor': 'end', 'font-size': 11, fill: C.ink3 }); });
  text(s, x1, yBot + 16, 'temps →', { 'text-anchor': 'end', 'font-size': 11, fill: C.ink3 });
  const N = 460, tri = p => 1 - Math.abs(((p % 1) + 1) % 1 * 2 - 1);
  let a = '', b = '';
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = x0 + t * (x1 - x0);
    const ripple = (tri(t * 26) * 2 - 1) * 3.2;
    const env = 1 - Math.exp(-t * 9);
    const tt = t - .04, spike = tt < 0 ? 0 : -16 * Math.exp(-tt * 26) * Math.cos(tt * 70);
    const va = tt < 0 ? 0 : spike + ripple * Math.min(1, tt * 30);
    const vb = t < .04 ? 0 : ripple * (1 - Math.exp(-(t - .04) * 7));
    a += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + Y(Math.max(yMin, va)).toFixed(1);
    b += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + Y(vb).toFixed(1);
  }
  el('path', { d: a, fill: 'none', stroke: C.ink3, 'stroke-width': 1.6 }, s);
  el('path', { d: b, fill: 'none', stroke: C.redInk, 'stroke-width': 2.2 }, s);
  // annotate the -16 A peak
  el('circle', { cx: x0 + .045 * (x1 - x0), cy: Y(-16), r: 4, fill: C.ink }, s);
  text(s, x0 + .07 * (x1 - x0), Y(-16) + 4, '−16 A au démarrage', { fill: C.ink, 'font-weight': 600 });
})();

/* ---------- Stellantis: CAN trace (fictional sample) ---------- */
const traceBody = document.getElementById('traceBody');
const IDS = [['0x0C8', 8], ['0x1A4', 8], ['0x2F0', 6], ['0x310', 8], ['0x3B2', 4], ['0x4E0', 8]];
let traceT = 12.0, traceTimer = null, bitsTimer = null;
function hex2() { return Math.floor(Math.random() * 256).toString(16).toUpperCase().padStart(2, '0'); }
function traceRow() {
  const [id, dlc] = IDS[Math.floor(Math.random() * IDS.length)];
  traceT += 0.004 + Math.random() * 0.006;
  const tr = document.createElement('tr'); if (id === '0x1A4') tr.className = 'hl';
  tr.innerHTML = `<td class="num">${traceT.toFixed(4)}</td><td>${id}</td><td>${dlc}</td><td class="d">${Array.from({ length: dlc }, hex2).join(' ')}</td>`;
  traceBody.prepend(tr); while (traceBody.children.length > 7) traceBody.lastChild.remove();
}
if (traceBody) for (let i = 0; i < 7; i++) traceRow();

const bits = document.getElementById('bits');
const FIELDS = [[0, 2, 'mode'], [2, 6, 'carto'], [6, 7, 'drapeau'], [7, 16, 'valeur']];
const bitCells = [];
(function buildBits() {
  const x0 = 20, w = 32;
  for (let b = 15; b >= 0; b--) {
    const i = 15 - b, x = x0 + i * w;
    const r = el('rect', { x: x + 1, y: 30, width: w - 2, height: 42, rx: 3, fill: C.paper, stroke: C.line }, bits);
    const t = text(bits, x + w / 2, 57, '0', { 'text-anchor': 'middle', 'font-size': 14, fill: C.ink3 });
    text(bits, x + w / 2, 22, String(b), { 'text-anchor': 'middle', 'font-size': 10, fill: C.ink3 });
    bitCells[b] = { r, t };
  }
  FIELDS.forEach(([lo, hi, name], k) => {
    const xa = x0 + (15 - (hi - 1)) * w + 3, xb = x0 + (15 - lo) * w + w - 3;
    el('path', { d: `M${xa} 84 v8 H${xb} v-8`, fill: 'none', stroke: k % 2 ? C.ink2 : C.redInk, 'stroke-width': 1.5 }, bits);
    text(bits, (xa + xb) / 2, 112, name, { 'text-anchor': 'middle', fill: k % 2 ? C.ink2 : C.redInk, 'font-weight': 600 });
    text(bits, (xa + xb) / 2, 130, `bits ${lo}${hi - lo > 1 ? '–' + (hi - 1) : ''}`, { 'text-anchor': 'middle', 'font-size': 10.5, fill: C.ink3 });
  });
})();
function bitsTick() {
  const v = Math.floor(Math.random() * 65536);
  for (let b = 0; b < 16; b++) { const on = (v >> b) & 1; const c = bitCells[b]; c.t.textContent = on; c.t.setAttribute('fill', on ? '#fff' : C.ink3); c.r.setAttribute('fill', on ? (FIELDS.findIndex(f => b >= f[0] && b < f[1]) % 2 ? C.ink2 : C.red) : C.paper); }
}
bitsTick();

/* ---------- Stellantis: debug log ---------- */
const logLines = [...document.querySelectorAll('#log div')];
let logPlayed = false;
function playLog() {
  if (logPlayed) return; logPlayed = true;
  logLines.forEach((d, i) => setTimeout(() => d.classList.add('in'), reduce ? 0 : 250 + i * 420));
}

/* ---------- Stellantis: alarm timing diagram ---------- */
const alarm = document.getElementById('alarm');
let alarmHead = null;
(function buildAlarm() {
  const x0 = 150, x1 = 540, rows = [['Trame MUX', 52], ['Bit de l\'alarme', 112], ['Sans mémoire', 172], ['Avec compteur', 232]];
  const frames = 30, fw = (x1 - x0) / frames, on0 = 6, on1 = 24; // alarm active between frames
  rows.forEach(([n, y], k) => { text(alarm, 14, y + 4, n, { fill: k === 3 ? C.redInk : C.ink2, 'font-weight': k === 3 ? 600 : 400 }); el('line', { x1: x0, x2: x1, y1: y + 16, y2: y + 16, stroke: C.line }, alarm); });
  for (let f = 0; f < frames; f++) {
    const x = x0 + f * fw, m = f % 10;
    el('rect', { x: x + .5, y: 38, width: fw - 1, height: 28, fill: m === 3 ? C.wash : C.paper, stroke: C.line }, alarm);
    text(alarm, x + fw / 2, 57, String(m), { 'text-anchor': 'middle', 'font-size': 10.5, fill: m === 3 ? C.redInk : C.ink3 });
  }
  const sig = (y, fn, col, w) => { let d = ''; for (let f = 0; f <= frames; f++) { const x = x0 + f * fw, v = f < frames ? fn(f) : fn(frames - 1); const yy = v ? y - 12 : y + 16; d += (f ? `H${x.toFixed(1)}V${yy}` : `M${x} ${yy}`); } d += `H${x1}`; el('path', { d, fill: 'none', stroke: col, 'stroke-width': w, 'stroke-linejoin': 'round' }, alarm); };
  const active = f => f >= on0 && f < on1;
  sig(112, f => active(f) && f % 10 === 3, C.ink, 2);
  sig(172, f => active(f) && f % 10 === 3, C.ink3, 2);
  sig(232, f => active(f), C.red, 3);
  el('line', { x1: x0 + on0 * fw, x2: x0 + on0 * fw, y1: 30, y2: 262, stroke: C.ink3, 'stroke-dasharray': '3 4' }, alarm);
  el('line', { x1: x0 + on1 * fw, x2: x0 + on1 * fw, y1: 30, y2: 262, stroke: C.ink3, 'stroke-dasharray': '3 4' }, alarm);
  text(alarm, x0 + on0 * fw + 4, 284, 'alarme active', { 'font-size': 11, fill: C.ink3 });
  text(alarm, x0 + on1 * fw + 4, 284, 'fin', { 'font-size': 11, fill: C.ink3 });
  alarmHead = el('line', { x1: x0, x2: x0, y1: 30, y2: 262, stroke: C.red, 'stroke-width': 1.5, opacity: .6 }, alarm);
  alarm.dataset.x0 = x0; alarm.dataset.x1 = x1;
})();

/* ---------- Stellantis: rotary characterisation (schematic) ---------- */
(function rotary() {
  const s = document.getElementById('rotary'); if (!s) return;
  const x0 = 60, x1 = 540, yTop = 20, yBot = 250;
  el('line', { x1: x0, x2: x1, y1: yBot, y2: yBot, stroke: C.line }, s); el('line', { x1: x0, x2: x0, y1: yTop, y2: yBot, stroke: C.line }, s);
  text(s, x0 - 10, yTop + 8, 'tension', { 'text-anchor': 'end', 'font-size': 11, fill: C.ink3, transform: `rotate(-90 ${x0 - 22} ${yTop + 50})` });
  // non-linear levels (schematic)
  const lv = [0.06, 0.13, 0.22, 0.30, 0.41, 0.49, 0.58, 0.66, 0.74, 0.83, 0.90, 0.97];
  const seg = (x1 - x0) / 12; let d = '';
  lv.forEach((v, i) => {
    const xa = x0 + i * seg, xb = xa + seg, y = yBot - v * (yBot - yTop);
    const dip = yBot - (i % 3 === 1 ? 0 : v * 0.35) * (yBot - yTop);
    d += (i ? `L${xa + 6} ${dip}L${xa + 12} ${y}` : `M${xa} ${y}`) + `L${xb - 6} ${y}`;
    text(s, xa + seg / 2, yBot + 18, String(i + 1), { 'text-anchor': 'middle', 'font-size': 11, fill: C.ink3 });
    el('line', { x1: xa + 12, x2: xb - 6, y1: y, y2: y, stroke: C.red, 'stroke-width': 4, 'stroke-linecap': 'round', opacity: .25 }, s);
  });
  el('path', { d, fill: 'none', stroke: C.ink, 'stroke-width': 2, 'stroke-linejoin': 'round' }, s);
  text(s, (x0 + x1) / 2, yBot + 40, 'position', { 'text-anchor': 'middle', 'font-size': 11, fill: C.ink3 });
})();

/* ---------- SECAD: life line ---------- */
(function life() {
  const s = document.getElementById('life'); if (!s) return;
  const x0 = 40, x1 = 520, y = 110, X = yr => x0 + (yr - 2023) / 12 * (x1 - x0);
  el('line', { x1: x0, x2: x1, y1: y, y2: y, stroke: C.line, 'stroke-width': 6, 'stroke-linecap': 'round' }, s);
  const prog = el('line', { x1: x0, x2: X(2035), y1: y, y2: y, stroke: C.red, 'stroke-width': 6, 'stroke-linecap': 'round' }, s);
  prog.style.strokeDasharray = (X(2035) - x0); prog.style.strokeDashoffset = reduce ? 0 : (X(2035) - x0); prog.id = 'lifeProg';
  for (let yr = 2023; yr <= 2035; yr++) { el('line', { x1: X(yr), x2: X(yr), y1: y + 10, y2: y + 16, stroke: C.ink3 }, s); if (yr % 2 === 1) text(s, X(yr), y + 32, String(yr), { 'text-anchor': 'middle', 'font-size': 11, fill: C.ink3 }); }
  [[2023, '1er stage', 'analyse et choix des remplaçants'], [2024, '2e stage', 'prototype fabriqué et validé'], [2035, 'production assurée', 'jusqu\'à cette date']].forEach(([yr, a, b], i) => {
    const x = X(yr), up = i !== 1;
    el('circle', { cx: x, cy: y, r: 8, fill: '#fff', stroke: i === 2 ? C.red : C.ink, 'stroke-width': 3 }, s);
    const ty = up ? y - 52 : y + 62, anchor = i === 2 ? 'end' : 'start', tx = i === 2 ? x + 6 : x - 6;
    text(s, tx, ty, a, { 'text-anchor': anchor, fill: i === 2 ? C.redInk : C.ink, 'font-weight': 600, 'font-size': 13 });
    text(s, tx, ty + 17, b, { 'text-anchor': anchor, 'font-size': 11.5, fill: C.ink3 });
  });
})();

/* ---------- SECAD: same outline, same connectors ---------- */
(function stack() {
  const s = document.getElementById('stack'); if (!s) return;
  const bx = 70, by = 30, bw = 420, bh = 170;
  el('rect', { x: bx, y: by, width: bw, height: bh, rx: 10, fill: C.paper, stroke: C.ink3, 'stroke-width': 2, 'stroke-dasharray': '7 6' }, s);
  const nb = el('rect', { x: bx, y: by, width: bw, height: bh, rx: 10, fill: 'none', stroke: C.red, 'stroke-width': 2.5 }, s);
  nb.id = 'stackNew';
  [[bx + 30, by + bh - 34, 120, 22], [bx + 190, by + bh - 34, 80, 22], [bx + bw - 34, by + 40, 22, 70]].forEach(([x, y, w, h]) => {
    el('rect', { x, y, width: w, height: h, rx: 2, fill: C.ink, opacity: .85 }, s);
  });
  [[bx + 14, by + 14], [bx + bw - 14, by + 14], [bx + 14, by + bh - 14], [bx + bw - 14, by + bh - 14]].forEach(([x, y]) => el('circle', { cx: x, cy: y, r: 6, fill: '#fff', stroke: C.ink2, 'stroke-width': 1.5 }, s));
  text(s, bx + 18, by + 40, 'contour identique', { fill: C.ink, 'font-weight': 600 });
  text(s, bx + 18, by + 58, 'connecteurs aux mêmes positions', { 'font-size': 11.5, fill: C.ink3 });
  // legend
  el('line', { x1: bx, x2: bx + 26, y1: 232, y2: 232, stroke: C.ink3, 'stroke-width': 2, 'stroke-dasharray': '7 6' }, s); text(s, bx + 34, 236, 'ancienne carte', { 'font-size': 11.5 });
  el('line', { x1: bx + 170, x2: bx + 196, y1: 232, y2: 232, stroke: C.red, 'stroke-width': 2.5 }, s); text(s, bx + 204, 236, 'nouvelle carte, 4 couches', { 'font-size': 11.5, fill: C.redInk });
  // 4-layer section
  const ly = 262; ['L1', 'L2', 'L3', 'L4'].forEach((n, i) => {
    const y = ly + i * 15;
    el('rect', { x: bx, y, width: bw, height: 4, rx: 1, fill: '#c8873f' }, s);
    if (i < 3) el('rect', { x: bx, y: y + 4, width: bw, height: 11, fill: '#e7e2cf' }, s);
    text(s, bx - 10, y + 6, n, { 'text-anchor': 'end', 'font-size': 10.5, fill: C.ink3 });
  });
})();

/* ---------- per-beat animation loop for 2D ---------- */
let alarmT = 0, raf = null, lastT = 0;
function loop(t) {
  raf = requestAnimationFrame(loop);
  const dt = Math.max(0, Math.min(.05, (t - lastT) / 1000)); lastT = Math.max(lastT, t);
  if (active === 'st-3' && alarmHead) {
    alarmT = (alarmT + dt * 0.18) % 1; const x0 = +alarm.dataset.x0, x1 = +alarm.dataset.x1; const x = x0 + alarmT * (x1 - x0);
    alarmHead.setAttribute('x1', x); alarmHead.setAttribute('x2', x);
  }
}
function onViz(id) {
  clearInterval(traceTimer); clearInterval(bitsTimer); traceTimer = bitsTimer = null;
  if (id === 'st-1' && !reduce) { bitsTimer = setInterval(bitsTick, 900); }
  if (id === 'st-2') playLog();
  if (id === 'se-intro' || id === 'se-3') { const p = document.getElementById('lifeProg'); if (p) { p.style.transition = reduce ? 'none' : 'stroke-dashoffset 1.6s cubic-bezier(.2,.7,.2,1)'; p.style.strokeDashoffset = 0; } }
}
if (!reduce) raf = requestAnimationFrame(loop);
update();
