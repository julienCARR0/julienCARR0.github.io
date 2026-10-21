import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
const LIGHT = innerWidth < 820 || (navigator.hardwareConcurrency || 8) <= 4;
renderer.shadowMap.enabled = !LIGHT;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
scene.environmentIntensity = 0.9;
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.015;
scene.add(key); scene.add(key.target);
const fill = new THREE.DirectionalLight(0xffffff, 0.6); fill.position.set(6, 3, 6); scene.add(fill);
scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe2e6, 0.5));

const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 4000);
scene.fog = new THREE.Fog(0xffffff, 1e4, 2e4);
camera.position.set(0, 3.9, 9.6); camera.lookAt(0, 0, 0);

/* ================= helpers ================= */
const PI = Math.PI;
function Batcher() {
  const groups = new Map();
  return {
    add(geo, mat, m) { const k = geo.uuid + '|' + mat.uuid; let g = groups.get(k); if (!g) { g = { geo, mat, ms: [] }; groups.set(k, g); } g.ms.push(m); },
    build(parent) { for (const { geo, mat, ms } of groups.values()) { const im = new THREE.InstancedMesh(geo, mat, ms.length); ms.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; parent.add(im); } }
  };
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
function mat4(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) { _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz)); }
function canvasTex(w, h, draw, srgb = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; }
function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function roundedRect(w, h, r) { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; }
function labelTex(txt, w = 256, h = 128, opts = {}) {
  return canvasTex(w, h, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    g.fillStyle = opts.color || 'rgba(205,208,212,.82)';
    g.font = `${opts.weight || 600} ${opts.size || 38}px Arial, Helvetica, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = txt.split('\n'); lines.forEach((l, i) => g.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * (opts.size || 38) * 1.1));
    if (opts.dot) { g.beginPath(); g.arc(W * 0.1, H * 0.78, 7, 0, 7); g.fill(); }
  });
}

/* ================= Sonceboz ripple-current board (reconstruction) ================= */
function buildRipple() {
  const root = new THREE.Group(); const mats = []; root.userData.mats = mats;
  const M = o => { const m = new THREE.MeshPhysicalMaterial(o); if (o.transparent) m.userData.keepT = true; mats.push(m); return m; };
  const pcb = new THREE.Group(); pcb.scale.setScalar(1 / 50); root.add(pcb);
  const BW = 150, BD = 100, T = 1.6;
  const B = Batcher();
  const pads = [], silk = [], vias = [];

  const mBody = M({ color: 0x1d1e21, roughness: .5 });
  const mLead = M({ color: 0xdfe1e3, roughness: .25, metalness: 1 });
  const mFerrite = M({ color: 0x3a3b3e, roughness: .78 });
  const mFerriteBase = M({ color: 0x232427, roughness: .6 });
  const mRes = M({ color: 0x141414, roughness: .62 });
  const mCer = M({ color: 0xb08a63, roughness: .55 });
  const mAlu = M({ color: 0xd9dcdf, roughness: .26, metalness: 1, anisotropy: .7 });
  const mPlastic = M({ color: 0x121212, roughness: .55 });
  const mNylon = M({ color: 0x1b1b1c, roughness: .42 });
  const mHole = M({ color: 0x040404, roughness: .9 });
  const mBand = M({ color: 0x9a9a9a, roughness: .5 });

  const boxU = new THREE.BoxGeometry(1, 1, 1);
  const gSOIC = new RoundedBoxGeometry(4.9, 1.45, 3.9, 2, .14);
  const gDPAK = new RoundedBoxGeometry(6.6, 2.3, 6.1, 2, .22);
  const gIndBase = new RoundedBoxGeometry(10, 1.6, 10, 2, .5);
  const gIndTop = new THREE.CylinderGeometry(4.75, 4.75, 3.4, 56);
  const gIndGap = new THREE.CylinderGeometry(4.55, 4.55, .5, 56);
  const gCan = new THREE.CylinderGeometry(5, 5, 9.3, 64);
  const gCanTop = new THREE.CylinderGeometry(4.98, 4.98, .06, 64);
  const gBead = new THREE.TorusGeometry(4.98, .16, 8, 64); gBead.rotateX(PI / 2);
  const vs = new THREE.Shape(); vs.moveTo(-5.15, -5.15); vs.lineTo(3.9, -5.15); vs.lineTo(5.15, -3.9); vs.lineTo(5.15, 3.9); vs.lineTo(3.9, 5.15); vs.lineTo(-5.15, 5.15); vs.lineTo(-5.15, -5.15);
  const gVBase = new THREE.ExtrudeGeometry(vs, { depth: 1.0, bevelEnabled: false }); gVBase.rotateX(-PI / 2);
  const gConn = new RoundedBoxGeometry(9.6, 9.4, 9.6, 2, .45);
  const gLabel = new THREE.PlaneGeometry(1, 1); gLabel.rotateX(-PI / 2);

  const labelMats = {};
  const labelMat = (txt, opts) => labelMats[txt] || (labelMats[txt] = M({ map: labelTex(txt, 256, 128, opts), transparent: true, roughness: .6, depthWrite: false }));
  const capTopMat = M({ color: 0xffffff, roughness: .3, metalness: .9, map: canvasTex(256, 256, (g, W, H) => {
    g.fillStyle = '#d7dadd'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#121212'; g.beginPath(); g.arc(W / 2, H / 2, W / 2, PI * .62, PI * 1.38); g.closePath(); g.fill();
    
  }) });

  // placement helpers (rotations in multiples of 90°)
  const rot = (du, dv, r) => [du * Math.cos(r) + dv * Math.sin(r), -du * Math.sin(r) + dv * Math.cos(r)];
  function base(x, z, r = 0) { return { x, z, r }; }
  function part(b, geo, mat, du, y, dv, sx = 1, sy = 1, sz = 1, er = 0) { const [ox, oz] = rot(du, dv, b.r); B.add(geo, mat, mat4(b.x + ox, T + y, b.z + oz, b.r + er, sx, sy, sz)); }
  function pad(b, du, dv, w, d, round = false, hole = 0) { const [ox, oz] = rot(du, dv, b.r); const sw = Math.abs(Math.sin(b.r)) > .5; pads.push({ x: b.x + ox, z: b.z + oz, w: sw ? d : w, d: sw ? w : d, round, hole }); }
  function sText(b, du, dv, s, size = 1.25, r = 0) { const [ox, oz] = rot(du, dv, b.r); silk.push({ t: 'text', x: b.x + ox, z: b.z + oz, s, size, r }); }
  function sRect(b, du, dv, w, d) { const [ox, oz] = rot(du, dv, b.r); const sw = Math.abs(Math.sin(b.r)) > .5; silk.push({ t: 'rect', x: b.x + ox, z: b.z + oz, w: sw ? d : w, d: sw ? w : d }); }
  function sCorners(b, du, dv, w, d) { const [ox, oz] = rot(du, dv, b.r); const sw = Math.abs(Math.sin(b.r)) > .5; silk.push({ t: 'corners', x: b.x + ox, z: b.z + oz, w: sw ? d : w, d: sw ? w : d }); }

  function soic8(b, label, ref) {
    part(b, gSOIC, mBody, 0, .15 + .725, 0);
    part(b, gLabel, labelMat(label, { dot: true, size: 34 }), 0, 1.61, 0, 4.4, 1, 3.2);
    for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) {
      const du = -1.905 + k * 1.27;
      part(b, boxU, mLead, du, .78, sd * 2.2, .42, .2, .5);
      part(b, boxU, mLead, du, .45, sd * 2.42, .42, .66, .18);
      part(b, boxU, mLead, du, .1, sd * 2.8, .42, .2, .72);
      pad(b, du, sd * 2.75, .62, 1.6);
    }
    sText(b, -4.6, 0, ref, 1.2, PI / 2);
  }
  function dpak(b, ref) {
    part(b, gDPAK, mBody, 0, 1.25, .2);
    part(b, boxU, mLead, 0, .26, -3.55, 5.3, .5, 1.4);
    for (const s of [-1, 1]) { part(b, boxU, mLead, s * 2.28, .95, 3.75, .75, .45, 1.1); part(b, boxU, mLead, s * 2.28, .5, 4.25, .75, .8, .25); part(b, boxU, mLead, s * 2.28, .14, 4.85, .75, .28, 1.2); pad(b, s * 2.28, 4.8, 1.25, 2.3); }
    pad(b, 0, -1.4, 6.3, 6.8);
    sText(b, 0, 6.9, ref, 1.2);
  }
  function inductor(b, ref) {
    part(b, gIndBase, mFerriteBase, 0, .8, 0);
    part(b, gIndTop, mFerrite, 0, 1.6 + 1.7, 0);
    part(b, gIndGap, mHole, 0, 2.2, 0);
    for (const s of [-1, 1]) { part(b, boxU, mLead, s * 5.05, .8, 0, .25, 1.6, 4.2); pad(b, s * 4.3, 0, 3, 4.6); }
    sCorners(b, 0, 0, 11.2, 11.2); sText(b, 0, -6.6, ref, 1.25);
  }
  function res2512(b, ref) {
    part(b, boxU, mRes, 0, .36, 0, 5.4, .55, 3.2);
    for (const s of [-1, 1]) { part(b, boxU, mLead, s * 2.9, .32, 0, .62, .64, 3.22); pad(b, s * 3.0, 0, 1.7, 3.6); }
    sText(b, 0, -2.6, ref, 1.15);
  }
  function vchip(b, ref) {
    part(b, gVBase, mPlastic, 0, 0, 0);
    part(b, gCan, mAlu, 0, 1.0 + 4.65, 0);
    part(b, gBead, mAlu, 0, 2.2, 0);
    part(b, gCanTop, capTopMat, 0, 10.32, 0, 1, 1, 1, PI / 2);
    for (const s of [-1, 1]) { part(b, boxU, mLead, s * 5.35, .1, 0, 1.2, .2, 1.6); pad(b, s * 4.4, 0, 2.6, 3.4); }
    silk.push({ t: 'vchip', x: b.x, z: b.z, r: b.r }); sText(b, 0, -6.8, ref, 1.25);
  }
  function p0805(b, cap, ref) { part(b, boxU, cap ? mCer : mRes, 0, .32, 0, 1.15, .58, 1.25); for (const s of [-1, 1]) { part(b, boxU, mLead, s * .79, .32, 0, .42, .62, 1.27); pad(b, s * .95, 0, .95, 1.45); } }
  function p0603(b, cap) { part(b, boxU, cap ? mCer : mRes, 0, .25, 0, .9, .45, .8); for (const s of [-1, 1]) { part(b, boxU, mLead, s * .62, .25, 0, .34, .48, .82); pad(b, s * .78, 0, .8, .95); } }
  function sod123(b, ref) { part(b, boxU, mBody, 0, .62, 0, 2.7, 1.05, 1.6); part(b, boxU, mBand, -.95, .63, 0, .35, 1.07, 1.62); for (const s of [-1, 1]) { part(b, boxU, mLead, s * 1.6, .07, 0, .9, .12, .6); pad(b, s * 1.65, 0, 1.2, 1.0); } }
  function conn(b, label, ref) {
    part(b, gConn, mNylon, 0, 4.7, 0);
    for (const i of [-1, 1]) for (const j of [-1, 1]) { part(b, boxU, mHole, i * 2.1, 9.41, j * 2.1, 3.0, .03, 3.0); pad(b, i * 2.1, j * 2.1, 2.7, 2.7, true, 1.4); }
    part(b, boxU, mNylon, 0, 6.5, -5.1, 3, 3.2, .8);
    sText(b, 0, -7.2, label, 1.5); sText(b, 7.2, 0, ref, 1.25, PI / 2);
  }
  function testpoint(b, ref) { pad(b, 0, 0, 1.8, 1.8, true); silk.push({ t: 'circle', x: b.x, z: b.z, rr: 1.5 }); sText(b, 0, -2.4, ref, 1.0); }

  // board-level
  const ref = { U: 1, Q: 1, L: 1, R: 1, C: 1, D: 1, TP: 1, J: 1 };
  const nxt = p => p + (ref[p]++);
  [[-33, '+24V'], [-12, 'GND'], [12, 'GND'], [33, '+15V']].forEach(([z, l]) => conn(base(-67, z), l, nxt('J')));
  const nInd = [2, 1, 3, 2, 1, 2, 3, 1], nRes = [2, 1, 2, 2, 1, 2, 2, 1];
  const cells = [];
  for (let i = 0; i < 8; i++) {
    const col = i % 4, row = Math.floor(i / 4), s = row ? -1 : 1;
    const cx = -43.5 + col * 33, cz = row ? 25 : -25, r = row ? PI : 0;
    const L = (u, v, rr = 0) => { const [ox, oz] = rot(u, v, r); return base(cx + ox, cz + oz, r + rr); };
    cells.push({ cx, cz, r, L });
    soic8(L(-8.5, -15.5), 'SE555', nxt('U'));
    p0805(L(-14.6, -15.5, PI / 2), true); p0603(L(-2.6, -16.6, PI / 2), false); p0603(L(-2.6, -14.2, PI / 2), true); p0603(L(-8.5, -20.2), true);
    sod123(L(-8.5, -10.2), nxt('D'));
    soic8(L(-8.5, -4.6), 'IRS2004S', nxt('U'));
    p0805(L(-2.8, -4.6, PI / 2), true); p0603(L(-14.4, -6.0, PI / 2), false); p0603(L(-14.4, -3.2, PI / 2), false);
    dpak(L(-11.4, 5.2), nxt('Q')); dpak(L(-3.6, 5.2), nxt('Q'));
    const lv = [-14, -2.5, 9];
    for (let k = 0; k < nInd[i]; k++) inductor(L(9, lv[k]), nxt('L'));
    vchip(L(-8.6, 16.6), 'CUT' + (i + 1));
    const rp = [4.4, 11.6]; for (let k = 0; k < nRes[i]; k++) res2512(L(rp[k], 19), nxt('R'));
    testpoint(L(14.6, -19.8), 'TP' + (ref.TP++)); testpoint(L(.8, -19.8), 'TP' + (ref.TP++)); testpoint(L(.9, 13.3), 'TP' + (ref.TP++));
    sText(L(-14.6, -19.8), 0, 0, 'CH' + (i + 1), 1.6);
    const rnd = rng(31 + i); for (let k = 0; k < 7; k++) { const [ox, oz] = rot(-15 + rnd() * 3, -11 + rnd() * 24, r); vias.push([cx + ox, cz + oz]); }
  }
  for (let x = -54; x <= 70; x += 6) { vias.push([x, -2.2]); vias.push([x + 3, 2.2]); }
  [[-71, -46], [71, -46], [-71, 46], [71, 46]].forEach(([x, z]) => pads.push({ x, z, w: 6, d: 6, round: true, hole: 3.2 }));
  silk.push({ t: 'text', x: 8, z: 0, s: 'RIPPLE-CURRENT TEST BOARD  ·  8 CH  ·  24 V / 20 kHz  ·  RECONSTITUTION', size: 1.7, r: 0 });

  // ---- board texture (color, roughness/metalness, bump) ----
  const PX = 16, W = BW * PX, H = BD * PX;
  const toPx = (x, z) => [(x + BW / 2) * PX, (z + BD / 2) * PX];
  function drawCopper(g, scale, col) {
    g.save(); g.scale(scale, scale); g.translate(BW / 2, BD / 2); g.fillStyle = col; g.strokeStyle = col;
    const rect = (x0, z0, x1, z1) => g.fillRect(x0, z0, x1 - x0, z1 - z0);
    rect(-73.5, -3.4, 73.5, 3.4); rect(-74, -18.5, -59.5, 18.5);
    rect(-58, -48.6, 73.5, -44.8); rect(-58, 44.8, 73.5, 48.6); rect(-61, -48.6, -57.5, -27); rect(-74, -40, -59.5, -26);
    rect(-74, 26, -59.5, 40); g.lineWidth = 1.0; g.beginPath(); g.moveTo(-59.5, 33); g.lineTo(-56.5, 33); g.lineTo(-56.5, 41.5); g.lineTo(72, 41.5); g.stroke();
    for (const c of cells) {
      g.save(); g.translate(c.cx, c.cz); g.rotate(-c.r);
      // tab pours, switch node, output
      rect(-15.4, 0.4, -7.6, 3.4); rect(-7.4, 0.4, 0.4, 3.4);
      g.beginPath(); g.moveTo(-15.4, 8.8); g.lineTo(.8, 8.8); g.lineTo(.8, -19.4); g.lineTo(15.6, -19.4); g.lineTo(15.6, 14.4); g.lineTo(3.2, 14.4); g.lineTo(.8, 11.6); g.lineTo(-15.4, 11.6); g.closePath(); g.fill();
      rect(-15.4, 15.4, 15.6, 21.6); rect(-16.2, -21.4, -12.5, 0.2);
      g.lineWidth = .3; g.lineJoin = 'round';
      [[[-10.4, -12.4], [-10.4, -7.8]], [[-6.6, -12.4], [-6.6, -7.8]], [[-11.4, -18.3], [-11.4, -19.2], [-8.5, -19.2]], [[-5.6, -18.3], [-5.6, -18.8], [-2.6, -18.8], [-2.6, -17.4]],
       [[-5.6, -12.7], [-3.4, -12.7], [-2.6, -13.4]], [[-5.6, -7.4], [-2.8, -7.4], [-2.8, -5.6]], [[-11.4, -1.8], [-11.4, -.2]], [[-5.6, -1.8], [-5.6, -.2]], [[-13.5, -15.5], [-12.6, -15.5]],
       [[-14.4, -6.8], [-13.6, -7.6], [-11.4, -7.6]], [[-14.4, -2.4], [-13.2, -1.2], [-9.8, -1.2]], [[-2.8, -3.6], [-2.8, -1.4], [-4.3, -.4]]].forEach(pl => { g.beginPath(); pl.forEach(([u, v], k) => k ? g.lineTo(u, v) : g.moveTo(u, v)); g.stroke(); });
      g.restore();
    }
    g.restore();
  }
  const colorTex = canvasTex(W, H, g => {
    g.fillStyle = '#0d4426'; g.fillRect(0, 0, W, H);
    // subtle laminate weave
    const r = rng(5); g.globalAlpha = .05; for (let i = 0; i < 4000; i++) { g.fillStyle = r() > .5 ? '#000' : '#2b6b45'; g.fillRect(r() * W, r() * H, 2 + r() * 6, 1); } g.globalAlpha = 1;
    drawCopper(g, PX, '#1c7444');
    // vias (tented)
    for (const [x, z] of vias) { const [px, py] = toPx(x, z); g.fillStyle = '#2a8a53'; g.beginPath(); g.arc(px, py, .45 * PX, 0, 7); g.fill(); g.fillStyle = '#0a2e1a'; g.beginPath(); g.arc(px, py, .17 * PX, 0, 7); g.fill(); }
    // pads (HASL)
    for (const p of pads) {
      const [px, py] = toPx(p.x, p.z); const grd = g.createLinearGradient(px - p.w * PX / 2, py, px + p.w * PX / 2, py); grd.addColorStop(0, '#c9cbcc'); grd.addColorStop(.5, '#e6e7e8'); grd.addColorStop(1, '#bfc1c3'); g.fillStyle = grd;
      if (p.round) { g.beginPath(); g.arc(px, py, p.w * PX / 2, 0, 7); g.fill(); } else { const rr = Math.min(p.w, p.d) * PX * .12; g.beginPath(); g.roundRect(px - p.w * PX / 2, py - p.d * PX / 2, p.w * PX, p.d * PX, rr); g.fill(); }
      if (p.hole) { g.fillStyle = '#151515'; g.beginPath(); g.arc(px, py, p.hole * PX / 2, 0, 7); g.fill(); }
    }
    // silkscreen
    g.fillStyle = '#f2f2ec'; g.strokeStyle = '#f2f2ec'; g.lineWidth = .15 * PX; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const s of silk) {
      const [px, py] = toPx(s.x, s.z);
      if (s.t === 'text') { g.save(); g.translate(px, py); g.rotate(-s.r || 0); g.font = `700 ${s.size * PX}px Arial, sans-serif`; g.fillText(s.s, 0, 0); g.restore(); }
      if (s.t === 'rect') g.strokeRect(px - s.w * PX / 2, py - s.d * PX / 2, s.w * PX, s.d * PX);
      if (s.t === 'circle') { g.beginPath(); g.arc(px, py, s.rr * PX, 0, 7); g.stroke(); }
      if (s.t === 'corners') { const hw = s.w * PX / 2, hd = s.d * PX / 2, k = 1.6 * PX; g.beginPath(); for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.moveTo(px + sx * hw, py + sz * (hd - k)); g.lineTo(px + sx * hw, py + sz * hd); g.lineTo(px + sx * (hw - k), py + sz * hd); } g.stroke(); }
      if (s.t === 'vchip') { g.save(); g.translate(px, py); g.rotate(-s.r); const a = 5.7 * PX, c = 1.6 * PX; g.beginPath(); g.moveTo(-a, -a); g.lineTo(a - c, -a); g.lineTo(a, -a + c); g.moveTo(a, a - c); g.lineTo(a - c, a); g.lineTo(-a, a); g.lineTo(-a, -a); g.stroke(); g.font = `700 ${2 * PX}px Arial`; g.fillText('+', a + 1.4 * PX, -a + .6 * PX); g.restore(); }
    }
  });
  const S = 8, mrTex = canvasTex(BW * S, BD * S, (g, w, h) => {
    g.fillStyle = 'rgb(0,96,0)'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgb(0,72,255)'; for (const p of pads) { const px = (p.x + BW / 2) * S, py = (p.z + BD / 2) * S; if (p.round) { g.beginPath(); g.arc(px, py, p.w * S / 2, 0, 7); g.fill(); } else g.fillRect(px - p.w * S / 2, py - p.d * S / 2, p.w * S, p.d * S); }
  }, false);
  const bumpTex = canvasTex(BW * S, BD * S, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.filter = 'blur(1px)'; drawCopper(g, S, '#fff'); g.filter = 'none'; }, false);
  for (const t of [colorTex, mrTex, bumpTex]) { t.repeat.set(1 / BW, 1 / BD); t.offset.set(.5, .5); }
  const top = M({ map: colorTex, roughnessMap: mrTex, metalnessMap: mrTex, bumpMap: bumpTex, bumpScale: 1.4, roughness: 1, metalness: 1, clearcoat: .35, clearcoatRoughness: .3 });
  const edge = M({ color: 0xb7ae7c, roughness: .7 });
  const shape = roundedRect(BW, BD, 2.5);
  for (const p of pads) if (p.hole > 3) { const h = new THREE.Path(); h.absarc(p.x, -p.z, p.hole / 2, 0, PI * 2, true); shape.holes.push(h); }
  const bg = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 16 }); bg.rotateX(-PI / 2);
  const board = new THREE.Mesh(bg, [top, edge]); board.castShadow = board.receiveShadow = true; pcb.add(board);
  B.build(pcb);
  const parts = [];
  pcb.children.forEach(o => { if (!o.isInstancedMesh) return; o.geometry.computeBoundingBox(); const m = new THREE.Matrix4(); o.getMatrixAt(0, m); const top = new THREE.Vector3().setFromMatrixPosition(m).y + o.geometry.boundingBox.max.y * new THREE.Vector3().setFromMatrixScale(m).y; parts.push({ o, top, delay: Math.min(.55, Math.max(0, (top - 1.6) / 18)) + Math.random() * .12 }); });
  const C0 = cells[5];
  const at = (u, v, h) => { const [ox, oz] = rot(u, v, C0.r); return { x: C0.cx + ox, z: C0.cz + oz, h }; };
  root.userData.labels = [
    { t: 'NE555 · PWM 20 kHz', ...at(-8.5, -15.5, 1.75) },
    { t: 'IRS2004S · gate driver', ...at(-8.5, -4.6, 1.75) },
    { t: 'Demi-pont MOSFET', ...at(-7.5, 5.2, 2.6) },
    { t: 'Inductances', ...at(9, -2.5, 5.1) },
    { t: 'Condensateur testé', ...at(-8.6, 16.6, 10.4) },
  ];
  // emissive glow used to show current flowing (inductors / caps)
  root.userData.parts = { mFerrite, mAlu, cells, pcb, parts };
  root.userData.radius = 1.85;
  root.userData.floor = -0.22;
  return root;
}

/* ================= SimFeel (housing modelled from photos + real KiCad boards) ================= */
function glbBuffer(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
function improveKicad(obj, mats) {
  obj.traverse(o => {
    if (!o.isMesh) return; o.castShadow = o.receiveShadow = true;
    const arr = Array.isArray(o.material) ? o.material : [o.material];
    const out = arr.map(m => {
      const c = m.color, lum = c.r * .3 + c.g * .59 + c.b * .11; let n;
      if (m.metalness === 0 && m.roughness >= .79) n = new THREE.MeshPhysicalMaterial({ color: 0x0f5a33, roughness: .38, clearcoat: .4, clearcoatRoughness: .25 });
      else if (lum > .42 && Math.abs(c.r - c.b) < .25) n = new THREE.MeshPhysicalMaterial({ color: c.clone().lerp(new THREE.Color(0xf2efe6), .3), roughness: lum > .6 ? .5 : .3, metalness: lum > .6 && Math.abs(c.r - c.g) < .02 ? 0 : .9 });
      else if (c.r > c.b * 2 && lum > .25) n = new THREE.MeshPhysicalMaterial({ color: c, roughness: .25, metalness: 1 });
      else n = new THREE.MeshPhysicalMaterial({ color: c, roughness: .5 });
      mats.push(n); return n;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
}
function buildESP32(mats) {
  const M = o => { const m = new THREE.MeshPhysicalMaterial(o); if (o.transparent) m.userData.keepT = true; mats.push(m); return m; };
  const g = new THREE.Group();
  const tex = canvasTex(1030, 566, (c, W, H) => {
    c.fillStyle = '#17181a'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#26282b'; c.lineWidth = 6; const r = rng(9); for (let i = 0; i < 40; i++) { c.beginPath(); let x = r() * W, y = r() * H; c.moveTo(x, y); x += (r() - .5) * 300; c.lineTo(x, y); y += (r() - .5) * 200; c.lineTo(x, y); c.stroke(); }
    c.fillStyle = '#d8d9da'; for (let k = 0; k < 15; k++) { for (const y of [30, H - 30]) { c.beginPath(); c.arc(100 + k * 50.8, y, 15, 0, 7); c.fill(); } }
    c.fillStyle = '#151515'; for (let k = 0; k < 15; k++) for (const y of [30, H - 30]) { c.beginPath(); c.arc(100 + k * 50.8, y, 7, 0, 7); c.fill(); }
    c.fillStyle = '#f0f0ea'; c.font = '600 17px Arial'; c.textAlign = 'center';
    const top = ['3V3', 'GND', 'D15', 'D2', 'D4', 'RX2', 'TX2', 'D5', 'D18', 'D19', 'D21', 'RX0', 'TX0', 'D22', 'D23'];
    const bot = ['VIN', 'GND', 'D13', 'D12', 'D14', 'D27', 'D26', 'D25', 'D33', 'D32', 'D35', 'D34', 'VN', 'VP', 'EN'];
    top.forEach((s, k) => c.fillText(s, 100 + k * 50.8, 70)); bot.forEach((s, k) => c.fillText(s, 100 + k * 50.8, H - 58));
  });
  const pcb = new THREE.Mesh(new RoundedBoxGeometry(51.5, 1.6, 28.3, 2, .6), M({ map: tex, roughness: .4, clearcoat: .3 })); pcb.position.y = .8; g.add(pcb);
  // WROOM module at +x end: substrate, shield, antenna area
  const sub = new THREE.Mesh(new THREE.BoxGeometry(25.5, .8, 18), M({ color: 0x141518, roughness: .45 })); sub.position.set(11.5, 2.0, 0); g.add(sub);
  const ant = canvasTex(256, 256, (c, W, H) => { c.fillStyle = '#141518'; c.fillRect(0, 0, W, H); c.strokeStyle = '#3a3b30'; c.lineWidth = 10; c.beginPath(); c.moveTo(20, 230); for (let k = 0; k < 6; k++) { const x = 30 + k * 36; c.lineTo(x, 40); c.lineTo(x + 18, 40); c.lineTo(x + 18, 200); } c.stroke(); });
  const antP = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 18), M({ map: ant, roughness: .45 })); antP.rotation.x = -PI / 2; antP.position.set(21, 2.41, 0); g.add(antP);
  const shield = new THREE.Mesh(new RoundedBoxGeometry(17.6, 2.4, 16, 2, .3), M({ color: 0xd2d5d8, roughness: .32, metalness: 1, anisotropy: .5 })); shield.position.set(8.3, 3.6, 0); g.add(shield);
  const usb = new THREE.Mesh(new RoundedBoxGeometry(7.4, 3.2, 8.9, 3, 1.2), M({ color: 0xd9dcdf, roughness: .25, metalness: 1 })); usb.position.set(-23.5, 3.2, 0); usb.rotation.y = PI / 2; g.add(usb);
  const ic = new THREE.Mesh(new THREE.BoxGeometry(5, .9, 5), M({ color: 0x1b1b1d, roughness: .5 })); ic.position.set(-12, 2.05, 5); g.add(ic);
  const reg = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.6, 3.5), M({ color: 0x1b1b1d, roughness: .5 })); reg.position.set(-12, 2.4, -6.5); g.add(reg);
  const btnM = M({ color: 0x222222, roughness: .6 }), btnB = M({ color: 0xcfd2d4, roughness: .3, metalness: 1 });
  for (const z of [-9, 9]) { const b = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.6, 6), btnB); b.position.set(-19, 2.4, z); g.add(b); const k = new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, .8, 16), btnM); k.position.set(-19, 3.5, z); g.add(k); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  return g;
}

/* ================= generic helpers for modelled parts ================= */
function basisMatrix(X, Y, Z, pos) { const m = new THREE.Matrix4().makeBasis(X, Y, Z); m.setPosition(pos); return m; }
function carbonTex(tile = 64) {
  return canvasTex(tile * 4, tile * 4, (g, W, H) => {
    const s = W / 8;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const warp = ((i + j) % 4) < 2; const grd = warp ? g.createLinearGradient(i * s, 0, i * s + s, 0) : g.createLinearGradient(0, j * s, 0, j * s + s);
      grd.addColorStop(0, '#1b1c1e'); grd.addColorStop(.5, warp ? '#3a3c40' : '#2c2e31'); grd.addColorStop(1, '#16171a');
      g.fillStyle = grd; g.fillRect(i * s, j * s, s, s);
    }
  });
}
function loft(sections, n, mod, colorFn) {
  // sections: [{z, cy, w, h, e}] ; ring of n points, superellipse exponent e
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  sections.forEach((S, si) => {
    for (let i = 0; i < n; i++) {
      const t = i / n * PI * 2, ct = Math.cos(t), st = Math.sin(t);
      let x = S.w / 2 * Math.sign(ct) * Math.pow(Math.abs(ct), 2 / S.e);
      let y = S.cy + S.h / 2 * Math.sign(st) * Math.pow(Math.abs(st), 2 / S.e);
      if (mod) y = mod(x, y, S.z, S);
      pos.push(x, y, S.z);
      colorFn(x, y, S.z, S, c); col.push(c.r, c.g, c.b);
    }
  });
  const R = sections.length;
  for (let r = 0; r < R - 1; r++) for (let i = 0; i < n; i++) { const a = r * n + i, b = r * n + (i + 1) % n, c2 = (r + 1) * n + i, d = (r + 1) * n + (i + 1) % n; idx.push(a, c2, b, b, c2, d); }
  // end caps
  for (const [r, flip] of [[0, true], [R - 1, false]]) { const cIdx = pos.length / 3; const S = sections[r]; pos.push(0, S.cy, S.z); colorFn(0, S.cy, S.z, S, c); col.push(c.r, c.g, c.b); for (let i = 0; i < n; i++) { const a = r * n + i, b = r * n + (i + 1) % n; flip ? idx.push(cIdx, a, b) : idx.push(cIdx, b, a); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function airfoil(chord, thick) { const s = new THREE.Shape(); const N = 24; for (let i = 0; i <= N; i++) { const x = i / N; const yt = 5 * thick * (.2969 * Math.sqrt(x) - .126 * x - .3516 * x * x + .2843 * x ** 3 - .1036 * x ** 4); const px = (x - .5) * chord, py = yt * chord + .06 * chord * Math.sin(PI * x); i ? s.lineTo(px, py) : s.moveTo(px, py); } for (let i = N; i >= 0; i--) { const x = i / N; const yt = 5 * thick * (.2969 * Math.sqrt(x) - .126 * x - .3516 * x * x + .2843 * x ** 3 - .1036 * x ** 4); s.lineTo((x - .5) * chord, -yt * chord + .06 * chord * Math.sin(PI * x)); } return s; }

/* ================= Steering wheel (modelled from the STW 195 front drawing) ================= */
const PXK = 0.2094; // mm per drawing pixel
const W2 = (px, py) => [(px - 692) * PXK, (380 - py) * PXK];
function shapeFrom(pts, mirror = true) {
  const s = new THREE.Shape(); const all = mirror ? pts.concat(pts.slice().reverse().map(([x, y]) => [1384 - x, y])) : pts;
  all.forEach(([x, y], i) => { const [X, Y] = W2(x, y); i ? s.lineTo(X, Y) : s.moveTo(X, Y); }); return s;
}
let screenCtx = null, screenTex = null, screenMode = 0;
function buildWheel(mats) {
  const M = o => { const m = new THREE.MeshPhysicalMaterial(o); if (o.transparent) { m.userData.keepT = true; m.userData.baseOpacity = o.opacity ?? 1; } mats.push(m); return m; };
  const g = new THREE.Group();
  const cTex = carbonTex(); cTex.wrapS = cTex.wrapT = THREE.RepeatWrapping; cTex.repeat.set(1 / 9, 1 / 9);
  const carbon = M({ map: cTex, roughness: .32, metalness: .2, clearcoat: 1, clearcoatRoughness: .08 });
  const rubber = M({ color: 0x141414, roughness: .92, sheen: .4, sheenColor: 0x333333 });
  // carbon body outline (left half, mirrored)
  const body = shapeFrom([[692, 22], [520, 22], [470, 28], [445, 45], [400, 95], [330, 104], [250, 110], [205, 118], [165, 140], [140, 178], [128, 240], [150, 250], [340, 250], [352, 640], [345, 700], [420, 690], [560, 668], [692, 664]]);
  const holeL = new THREE.Path(); holeL.moveTo(...W2(230, 290)); [[325, 290], [330, 600], [235, 600]].forEach(p => holeL.lineTo(...W2(...p)));
  const bodyG = new THREE.ExtrudeGeometry(body, { depth: 16, bevelEnabled: true, bevelSize: 2, bevelThickness: 2, bevelSegments: 3, curveSegments: 24 });
  bodyG.translate(0, 0, -8);
  const bodyM = new THREE.Mesh(bodyG, carbon); g.add(bodyM);
  // rubber grips with their hand holes
  for (const side of [1, -1]) {
    const pts = [[160, 200], [132, 290], [124, 470], [128, 610], [146, 690], [180, 730], [228, 744], [296, 744], [330, 732], [350, 696], [356, 600], [352, 300], [338, 228], [296, 200]];
    const s = new THREE.Shape(); pts.forEach(([x, y], i) => { let [X, Y] = W2(x, y); X *= side; i ? s.lineTo(X, Y) : s.moveTo(X, Y); });
    const h = new THREE.Path(); [[226, 292], [326, 296], [330, 616], [232, 612]].forEach(([x, y], i) => { let [X, Y] = W2(x, y); X *= side; i ? h.lineTo(X, Y) : h.moveTo(X, Y); }); s.holes.push(h);
    const gg = new THREE.ExtrudeGeometry(s, { depth: 14, bevelEnabled: true, bevelSize: 9, bevelThickness: 11, bevelSegments: 8, curveSegments: 20 }); gg.translate(0, 0, -7);
    const grip = new THREE.Mesh(gg, rubber); g.add(grip);
  }
  // screen bezel + display
  const [sx0, sy0] = W2(462, 52), [sx1, sy1] = W2(922, 412);
  const bez = new THREE.Mesh(new RoundedBoxGeometry(sx1 - sx0, sy0 - sy1, 8, 3, 2.5), M({ color: 0x0b0b0c, roughness: .2, clearcoat: 1 })); bez.position.set((sx0 + sx1) / 2, (sy0 + sy1) / 2, 9); g.add(bez);
  const sc = document.createElement('canvas'); sc.width = 900; sc.height = 700; screenCtx = sc.getContext('2d');
  screenTex = new THREE.CanvasTexture(sc); screenTex.colorSpace = THREE.SRGBColorSpace; screenTex.anisotropy = 8;
  const scrMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }); mats.push(scrMat);
  const [a0, b0] = W2(478, 66), [a1, b1] = W2(906, 398);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(a1 - a0, b0 - b1), scrMat); scr.position.set((a0 + a1) / 2, (b0 + b1) / 2, 13.1); g.add(scr);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(a1 - a0 + 4, b0 - b1 + 4), M({ color: 0xffffff, roughness: .02, metalness: 0, transparent: true, opacity: .06, clearcoat: 1 })); glass.position.copy(scr.position); glass.position.z += .3; g.add(glass);
  const strip = new THREE.Mesh(new RoundedBoxGeometry(64, 6, 6, 2, 2), M({ color: 0x101011, roughness: .3, clearcoat: 1 })); strip.position.set(0, W2(0, 418)[1], 9); g.add(strip);
  // LEDs on top of the screen
  const leds = []; const ledG = new THREE.SphereGeometry(1.6, 16, 10);
  for (let i = 0; i < 10; i++) { const m = M({ color: 0x222222, emissive: 0x000000, emissiveIntensity: 3, roughness: .2 }); const l = new THREE.Mesh(ledG, m); const [x, y] = W2(530 + i * 36, 38); l.position.set(x, y, 9); g.add(l); leds.push(m); }
  // buttons B1..B10
  const bpos = [[293, 165], [377, 162], [415, 250], [433, 345], [452, 470], [932, 470], [948, 345], [965, 250], [1007, 162], [1092, 165]];
  const bcol = [0xd8192a, 0x2c55d6, 0x7a3fc7, 0x2fa84f, 0x2a6fd8, 0x2a6fd8, 0x2fa84f, 0x7a3fc7, 0x2c55d6, 0xd8192a];
  const bezG = new THREE.CylinderGeometry(8.6, 9.2, 5, 40); bezG.rotateX(PI / 2);
  const capG = new THREE.CylinderGeometry(6.3, 6.6, 4, 40); capG.rotateX(PI / 2);
  const bezMat = M({ color: 0x0e0e0f, roughness: .35, metalness: .6 });
  bpos.forEach(([x, y], i) => {
    const [X, Y] = W2(x, y);
    const b = new THREE.Mesh(bezG, bezMat); b.position.set(X, Y, 10); g.add(b);
    const lab = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#' + bcol[i].toString(16).padStart(6, '0'); c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,.9)'; c.font = 'italic 800 46px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('B' + (i + 1), w / 2, h / 2 + 2); });
    const cap = new THREE.Mesh(capG, [M({ color: bcol[i], roughness: .35, clearcoat: .8 }), M({ map: lab, roughness: .3, clearcoat: .8, emissive: 0x111111 }), M({ color: bcol[i] })]);
    cap.position.set(X, Y, 13); g.add(cap);
  });
  // centre rotaries (3) with 12-position dials
  const dialCols = [['#6b2fc7', '#2f5fd6', '#1fa3d8', '#2fb562', '#a6c83a', '#f2c230'], ['#d8192a', '#ee5a24', '#f2a330', '#f2d230', '#a6c83a', '#2fb562'], ['#1f3fbf', '#2f5fd6', '#5a8ae8', '#9fb7f0', '#dfe6f7', '#6b2fc7']];
  [[540, 545], [692, 582], [845, 545]].forEach(([x, y], k) => {
    const [X, Y] = W2(x, y);
    const face = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#111'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 12; i++) { const a0 = -PI / 2 + i / 12 * PI * 2 - PI / 12, a1 = a0 + PI / 6; c.fillStyle = dialCols[k][i % 6]; c.beginPath(); c.moveTo(128, 128); c.arc(128, 128, 126, a0 + .01, a1 - .01); c.closePath(); c.fill(); c.save(); c.translate(128 + Math.cos(a0 + PI / 12) * 100, 128 + Math.sin(a0 + PI / 12) * 100); c.fillStyle = '#111'; c.font = '700 22px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(i + 1), 0, 0); c.restore(); }
      c.fillStyle = '#111'; c.beginPath(); c.arc(128, 128, 62, 0, 7); c.fill();
    });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(13.2, 13.2, 3, 48).rotateX(PI / 2), [M({ color: 0x111111, roughness: .4 }), M({ map: face, roughness: .35, clearcoat: .6 }), M({ color: 0x111111 })]);
    disc.position.set(X, Y, 9.5); g.add(disc);
    const ks = new THREE.Shape(); ks.moveTo(-2.6, -9); ks.lineTo(2.6, -9); ks.lineTo(3.6, 6); ks.quadraticCurveTo(0, 12, -3.6, 6); ks.lineTo(-2.6, -9);
    const knob = new THREE.Mesh(new THREE.ExtrudeGeometry(ks, { depth: 7, bevelEnabled: true, bevelSize: .8, bevelThickness: .8, bevelSegments: 2 }), M({ color: 0xdfe2e6, roughness: .25, metalness: 1 }));
    knob.position.set(X, Y, 11); knob.rotation.z = (k - 1) * -.5; g.add(knob);
  });
  // thumbwheels (knurled, anodised)
  const knurl = (r, len) => { const geo = new THREE.CylinderGeometry(r, r, len, 48, 1); const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), rr = Math.hypot(x, z); if (rr > r * .9) { const k = (Math.round(a / (PI * 2) * 48) % 2) ? .9 : 1; p.setX(i, Math.cos(a) * r * k); p.setZ(i, Math.sin(a) * r * k); } } geo.computeVertexNormals(); return geo; };
  [[205, 238, 0x1f4fd6, .5], [1180, 238, 0x1f4fd6, -.5], [355, 420, 0xd8192a, 0], [1030, 420, 0xd8192a, 0]].forEach(([x, y, col, a]) => {
    const [X, Y] = W2(x, y); const m = new THREE.Mesh(knurl(6.2, 14), M({ color: col, roughness: .3, metalness: .85 })); m.position.set(X, Y, 6); m.rotation.z = a; g.add(m);
  });
  // yellow trigger wedges, screws, paddles, quick release
  const yel = M({ color: 0xf2cf1d, roughness: .45 });
  for (const s of [1, -1]) {
    const w = new THREE.Shape(); [[175, 142], [215, 120], [228, 190], [196, 205]].forEach(([x, y], i) => { let [X, Y] = W2(x, y); X *= s; i ? w.lineTo(X, Y) : w.moveTo(X, Y); });
    const wm = new THREE.Mesh(new THREE.ExtrudeGeometry(w, { depth: 6, bevelEnabled: true, bevelSize: 1, bevelThickness: 1, bevelSegments: 2 }), yel); wm.position.z = 6; g.add(wm);
    const pad = new THREE.Shape(); [[0, 0], [40, 6], [44, 120], [6, 128]].forEach(([x, y], i) => i ? pad.lineTo(x, y) : pad.moveTo(x, y));
    const pm = new THREE.Mesh(new THREE.ExtrudeGeometry(pad, { depth: 3, bevelEnabled: true, bevelSize: 1, bevelThickness: 1 }), carbon); pm.position.set(s * 62, -95, -26); pm.scale.y = .75; pm.scale.x = s; g.add(pm);
  }
  const screwG = new THREE.CylinderGeometry(1.6, 1.6, 1.2, 6).rotateX(PI / 2), screwM = M({ color: 0x2a2a2c, roughness: .35, metalness: .9 });
  [[334, 130], [377, 212], [1050, 130], [1008, 212], [392, 388], [992, 388], [620, 518], [765, 518], [522, 628], [862, 628], [392, 700], [992, 700]].forEach(([x, y]) => { const [X, Y] = W2(x, y); const s = new THREE.Mesh(screwG, screwM); s.position.set(X, Y, 10.2); g.add(s); });
  const qr = new THREE.Mesh(new THREE.CylinderGeometry(24, 26, 30, 40).rotateX(PI / 2), M({ color: 0xc4c8cc, roughness: .3, metalness: 1 })); qr.position.z = -26; g.add(qr);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.leds = leds;
  return g;
}
let screenOff = null;
function drawScreen(t) {
  if (!screenCtx) return;
  if (!screenOff) { const o = document.createElement('canvas'); o.width = 900; o.height = 700; screenOff = o.getContext('2d'); }
  drawScreenInner(t, screenOff);
  const C = screenCtx, H2 = C.canvas.height; C.fillStyle = '#05070a'; C.fillRect(0, 0, 900, H2); C.drawImage(screenOff.canvas, 0, (H2 - 700) / 2);
  screenTex.needsUpdate = true;
}
function drawScreenInner(t, c) {
  const W = 900, H = 700;
  c.fillStyle = '#05070a'; c.fillRect(0, 0, W, H);
  if (screenMode === 1 && (t % 6) < 2.4) { c.fillStyle = '#0c0f12'; c.font = '500 26px IBM Plex Mono, monospace'; c.fillText('luminosité 0 %', 30, H - 30); screenTex.needsUpdate = true; return; }
  const box = (x, y, w, h) => { c.fillStyle = '#121a22'; c.fillRect(x, y, w, h); c.strokeStyle = '#26323d'; c.lineWidth = 2; c.strokeRect(x, y, w, h); };
  c.textBaseline = 'alphabetic';
  // top bar: battery
  box(20, 20, 860, 90); const soc = .58 + .04 * Math.sin(t * .2);
  c.fillStyle = '#8fd14f'; c.fillRect(250, 38, 400 * soc, 54); c.strokeStyle = '#d9e3ea'; c.strokeRect(250, 38, 400, 54);
  c.fillStyle = '#d9e3ea'; c.font = '600 22px Arial'; c.fillText('SOC', 40, 58); c.font = '800 44px Arial'; c.fillText((soc * 100).toFixed(1), 40, 98);
  c.font = '600 22px Arial'; c.fillText('TEMP', 690, 58); c.font = '800 44px Arial'; c.fillText(String(Math.round(40 + 2 * Math.sin(t * .3))), 690, 98);
  // tyre / motor blocks
  [[20, 130], [470, 130], [20, 330], [470, 330]].forEach(([x, y], i) => { box(x, y, 410, 180); c.fillStyle = '#7c8b97'; c.font = '600 20px Arial'; c.fillText(i % 2 ? 'MOTEUR °C' : 'PNEU bar', x + 20, y + 40); c.fillStyle = '#ffffff'; c.font = '800 70px Arial'; c.fillText(i % 2 ? String(Math.round(64 + 3 * Math.sin(t * .4 + i))) : (26 + .6 * Math.sin(t * .3 + i)).toFixed(1), x + 20, y + 125); });
  // delta bar
  const d = 2 * Math.sin(t * .5); c.fillStyle = d > 0 ? '#e2061c' : '#2fb562'; c.beginPath(); c.moveTo(250, 530); c.lineTo(650, 530); c.lineTo(610, 590); c.lineTo(290, 590); c.closePath(); c.fill();
  c.fillStyle = '#fff'; c.font = '800 46px Arial'; c.textAlign = 'center'; c.fillText((d > 0 ? '+' : '') + d.toFixed(2), 450, 578); c.textAlign = 'left';
  c.fillStyle = '#7c8b97'; c.font = '500 20px IBM Plex Mono, monospace'; c.fillText('données fictives', 30, 680);
  if (screenMode === 2) {
    c.fillStyle = 'rgba(5,7,10,.9)'; c.fillRect(0, 0, W, H); c.fillStyle = '#d9e3ea'; c.font = '600 26px IBM Plex Mono, monospace'; c.fillText('décodage bit à bit', 40, 70);
    const v = (Math.floor(t * 2) * 2654435761) >>> 0; for (let b = 0; b < 16; b++) { const on = (v >> b) & 1; const x = 40 + b * 52; c.fillStyle = on ? (b > 8 ? '#e2061c' : '#2f6fd8') : '#1a232c'; c.fillRect(x, 120, 44, 70); c.fillStyle = '#fff'; c.font = '700 30px IBM Plex Mono, monospace'; c.fillText(String(on), x + 13, 166); }
    ['b0–1  mode', 'b2–5  carto', 'b6    drapeau', 'b7–15 valeur'].forEach((s, i) => { c.fillStyle = '#d9e3ea'; c.font = '500 30px IBM Plex Mono, monospace'; c.fillText(s, 40, 280 + i * 60); });
  }
  if (screenMode === 3) { c.fillStyle = '#e2061c'; c.fillRect(0, H - 130, W, 130); c.fillStyle = '#fff'; c.font = '800 46px Arial'; c.fillText('ALARME', 40, H - 52); c.font = '500 26px IBM Plex Mono, monospace'; c.fillText('maintenue par compteur', 280, H - 56); }
  screenTex.needsUpdate = true;
}

/* ================= Formula E single-seater (generic shape, GEN4 dimensions) ================= */
function buildCar(mats) {
  const M = o => { const m = new THREE.MeshPhysicalMaterial(o); m.userData.ghost = true; mats.push(m); return m; };
  const g = new THREE.Group();
  const paint = M({ vertexColors: true, roughness: .28, metalness: .1, clearcoat: 1, clearcoatRoughness: .06 });
  const cf = carbonTex(); cf.wrapS = cf.wrapT = THREE.RepeatWrapping; cf.repeat.set(1 / 60, 1 / 60);
  const carbon = M({ color: 0x9a9a9a, map: cf, roughness: .35, metalness: .2, clearcoat: .8, clearcoatRoughness: .15 });
  const black = M({ color: 0x141416, roughness: .5, clearcoat: .4 });
  const red = M({ color: 0xe2061c, roughness: .3, clearcoat: 1 });
  const white = new THREE.Color(0xf3f4f6), redC = new THREE.Color(0xe2061c), dark = new THREE.Color(0x1a1b1d), carb = new THREE.Color(0x222326);
  // monocoque with a real cockpit opening
  const tub = [[2760, 175, 90, 70, 2.2], [2600, 185, 170, 120, 2.4], [2300, 205, 250, 170, 2.6], [1900, 235, 330, 230, 2.8], [1500, 265, 400, 300, 3], [1100, 300, 470, 380, 3], [820, 322, 540, 440, 3.2], [700, 330, 570, 460, 3.2], [400, 340, 600, 480, 3.4], [100, 340, 620, 480, 3.4], [-150, 338, 610, 476, 3.3], [-400, 330, 600, 460, 3.2], [-800, 315, 520, 420, 3], [-1200, 290, 420, 360, 2.8], [-1600, 260, 320, 280, 2.6], [-1950, 235, 230, 190, 2.4], [-2100, 230, 140, 110, 2.2]].map(([z, cy, w, h, e]) => ({ z, cy, w, h, e }));
  const cockpit = (x, z) => { const kz = THREE.MathUtils.smoothstep(z, -200, -120) * (1 - THREE.MathUtils.smoothstep(z, 760, 830)); const kx = 1 - THREE.MathUtils.smoothstep(Math.abs(x), 200, 236); return kz * kx; };
  const tubG = loft(tub, 160, (x, y, z) => { const k = cockpit(x, z); return k > 0 ? THREE.MathUtils.lerp(y, Math.min(y, 330), k) : y; },
    (x, y, z, S, c) => { if (cockpit(x, z) > .5 && y < 340) c.copy(dark); else if (y < S.cy - S.h * .3) c.copy(carb); else if (z > 1700 && y > S.cy + S.h * .25) c.copy(redC); else c.copy(white); });
  const tubM = new THREE.Mesh(tubG, paint); g.add(tubM);
  // sidepods
  for (const s of [1, -1]) {
    const pod = [[760, 300, 260, 250, 3], [620, 300, 330, 290, 3.4], [300, 295, 380, 300, 3.6], [0, 285, 390, 300, 3.6], [-500, 265, 340, 250, 3.2], [-1000, 240, 240, 190, 2.8], [-1350, 225, 130, 120, 2.4]].map(([z, cy, w, h, e]) => ({ z, cy, w, h, e }));
    const pg = loft(pod, 64, null, (x, y, z, S, c) => { if (z > 740) c.copy(dark); else if (y > S.cy + S.h * .35 && z > -200) c.copy(redC); else if (y < S.cy - S.h * .2) c.copy(carb); else c.copy(white); });
    pg.translate(s * 430, 0, 0); g.add(new THREE.Mesh(pg, paint));
    const mir = new THREE.Mesh(new RoundedBoxGeometry(130, 60, 40, 3, 12), black); mir.position.set(s * 470, 640, 640); g.add(mir);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 200), black); stalk.position.set(s * 440, 520, 640); stalk.rotation.z = s * .25; g.add(stalk);
  }
  // floor and diffuser
  const floor = new THREE.Mesh(new RoundedBoxGeometry(1400, 22, 3000, 2, 8), carbon); floor.position.set(0, 60, -250); g.add(floor);
  const plank = new THREE.Mesh(new THREE.BoxGeometry(300, 10, 2600), black); plank.position.set(0, 44, -250); g.add(plank);
  // engine cover fin
  const fin = new THREE.Shape(); fin.moveTo(-150, 560); fin.lineTo(-150, 760); fin.quadraticCurveTo(-400, 760, -1600, 520); fin.lineTo(-1600, 300); fin.lineTo(-150, 560);
  const finG = new THREE.ExtrudeGeometry(fin, { depth: 14, bevelEnabled: true, bevelSize: 4, bevelThickness: 4 }); finG.rotateY(-PI / 2); finG.translate(7, 0, 0);
  const finM = new THREE.Mesh(finG, M({ color: 0xf3f4f6, roughness: .28, clearcoat: 1 })); g.add(finM);
  // front wing
  const fwMain = new THREE.ExtrudeGeometry(airfoil(320, .1), { depth: 1720, bevelEnabled: false }); fwMain.translate(0, 0, -860); fwMain.rotateY(PI / 2);
  const fw = new THREE.Mesh(fwMain, carbon); fw.position.set(0, 110, 2560); fw.rotation.x = -.04; g.add(fw);
  const fw2 = new THREE.Mesh(fwMain, red); fw2.scale.set(1, 1, .6); fw2.position.set(0, 190, 2440); fw2.rotation.x = .28; g.add(fw2);
  for (const s of [1, -1]) { const ep = new THREE.Mesh(new RoundedBoxGeometry(14, 230, 380, 2, 5), carbon); ep.position.set(s * 868, 190, 2520); g.add(ep); }
  for (const s of [1, -1]) { const py = new THREE.Mesh(new THREE.BoxGeometry(12, 120, 200), black); py.position.set(s * 60, 150, 2560); g.add(py); }
  // rear wing
  const rwMain = new THREE.ExtrudeGeometry(airfoil(400, .12), { depth: 1000, bevelEnabled: false }); rwMain.translate(0, 0, -500); rwMain.rotateY(PI / 2);
  const rw = new THREE.Mesh(rwMain, carbon); rw.position.set(0, 880, -2380); rw.rotation.x = .12; g.add(rw);
  const rw2 = new THREE.Mesh(rwMain, red); rw2.scale.set(1, 1, .55); rw2.position.set(0, 985, -2250); rw2.rotation.x = .45; g.add(rw2);
  for (const s of [1, -1]) { const ep = new THREE.Mesh(new RoundedBoxGeometry(16, 520, 560, 2, 6), carbon); ep.position.set(s * 510, 850, -2330); g.add(ep); }
  const neck = new THREE.Mesh(new THREE.BoxGeometry(24, 620, 160), black); neck.position.set(0, 570, -2200); neck.rotation.x = -.25; g.add(neck);
  // halo
  const haloPts = [[-300, 560, 80], [-330, 780, 260], [-270, 880, 540], [-130, 905, 740], [0, 910, 790], [130, 905, 740], [270, 880, 540], [330, 780, 260], [300, 560, 80]].map(p => new THREE.Vector3(...p));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(haloPts), 80, 34, 16), black));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 910, 790), new THREE.Vector3(0, 800, 980), new THREE.Vector3(0, 640, 1080)]), 30, 30, 12), black));
  // wheels: 18" rims, front 280 mm / rear 300 mm wide tyres, Ø 690 mm
  const tyreMat = M({ color: 0x151516, roughness: .86 }), rimMat = M({ color: 0x2b2e33, roughness: .35, metalness: .8 }), nutMat = red;
  function wheel(width) {
    const w = new THREE.Group(); const R = 345, r = 229, hw = width / 2;
    const prof = [new THREE.Vector2(r, -hw + 10), new THREE.Vector2(R - 40, -hw), new THREE.Vector2(R - 6, -hw + 18), new THREE.Vector2(R, -hw + 50), new THREE.Vector2(R, hw - 50), new THREE.Vector2(R - 6, hw - 18), new THREE.Vector2(R - 40, hw), new THREE.Vector2(r, hw - 10)];
    const tyre = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), tyreMat); tyre.rotation.z = PI / 2; w.add(tyre);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width - 30, 64, 1, true), rimMat); rim.rotation.z = PI / 2; w.add(rim);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(r - 4, r - 4, 10, 64), rimMat); face.rotation.z = PI / 2; face.position.x = hw - 40; w.add(face);
    for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(14, 190, 46), rimMat); sp.position.x = hw - 30; sp.rotation.x = i / 6 * PI * 2; sp.translateY(100); w.add(sp); }
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(38, 38, 30, 6), nutMat); nut.rotation.z = PI / 2; nut.position.x = hw - 18; w.add(nut);
    return w;
  }
  [[1540, 280], [-1540, 300]].forEach(([z, wd]) => { for (const s of [1, -1]) { const w = wheel(wd); w.position.set(s * (895 - wd / 2), 345, z); w.scale.x = s; g.add(w); } });
  // suspension
  const arm = (a, b, r = 14) => { const v = new THREE.Vector3().subVectors(b, a); const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, v.length(), 10), black); m.position.copy(a).addScaledVector(v, .5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); g.add(m); };
  for (const s of [1, -1]) {
    const V = (x, y, z) => new THREE.Vector3(s * x, y, z);
    arm(V(190, 430, 1720), V(640, 440, 1540)); arm(V(190, 420, 1340), V(640, 440, 1540)); arm(V(160, 200, 1740), V(650, 230, 1540)); arm(V(160, 190, 1320), V(650, 230, 1540)); arm(V(200, 470, 1500), V(620, 250, 1540), 10);
    arm(V(240, 400, -1300), V(640, 430, -1540)); arm(V(200, 390, -1760), V(640, 430, -1540)); arm(V(220, 180, -1300), V(650, 220, -1540)); arm(V(180, 180, -1760), V(650, 220, -1540));
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

const glowTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
function glowMat(col) { const m = new THREE.SpriteMaterial({ map: glowTex, color: col, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: .9 }); m.userData.keepT = true; m.userData.baseOpacity = .9; return m; }
/* ================= Formula E object: wheel installed in the car ================= */
const WHEEL_POS = new THREE.Vector3(0, 600, 740);
function buildFE() {
  const root = new THREE.Group(); const mats = [], carMats = []; root.userData.mats = mats;
  const mm = new THREE.Group(); mm.scale.setScalar(1 / 100); root.add(mm);
  const car = new THREE.Group(); mm.add(car);
  const wheel = new THREE.Group(); wheel.position.copy(WHEEL_POS); wheel.rotation.set(-.22, PI, 0, 'YXZ'); mm.add(wheel); wheel.userData.leds = [];
  root.userData.parts = { car, carMats, wheel };
  const wc = WHEEL_POS.clone().divideScalar(100), cc = new THREE.Vector3(0, 4.6, 0);
  root.userData.wc = wc; root.userData.cc = cc;
  const ease = e => e * e * (3 - 2 * e);
  root.userData.radiusFn = c => Math.exp(THREE.MathUtils.lerp(Math.log(1.75), Math.log(34), ease(c.e)));
  root.userData.focusFn = c => new THREE.Vector3().lerpVectors(wc, cc, ease(c.e));
  root.userData.floorFn = (c, f) => THREE.MathUtils.lerp(-1.6, -f.y, ease(c.e));
  return root;
}
// Formula E GEN3 EVO model by bluspycrab (Sketchfab), CC BY 4.0
let carLoading = false;
function loadCar() {
  if (carLoading) return; carLoading = true;
  const fe = objects.fe.content.userData, P = fe.parts;
  // steering wheel model (Julien's), screen replaced by the live canvas
  Promise.all([import('./volant.js'), import('three/addons/libs/meshopt_decoder.module.js')]).then(async ([{ VOLANT }, { MeshoptDecoder }]) => {
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    const gl = await loader.parseAsync(glbBuffer(VOLANT), '');
    const v = gl.scene; v.scale.setScalar(1000);
    const sc = document.createElement('canvas'); sc.width = 900; sc.height = 830; screenCtx = sc.getContext('2d');
    screenTex = new THREE.CanvasTexture(sc); screenTex.colorSpace = THREE.SRGBColorSpace; screenTex.anisotropy = 8; screenTex.flipY = false;
    v.traverse(o => { if (!o.isMesh) return; o.castShadow = o.receiveShadow = true; const mt = o.material, n = mt.name || '';
      mt.side = THREE.DoubleSide; mt.needsUpdate = true;
      if (/caoutchouc/.test(n)) { o.geometry.computeVertexNormals(); mt.flatShading = false; }
      if (n === 'ecran') { o.material = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }); fe.mats.push(o.material); return; }
      if (/^led_/.test(n)) { o.material = mt.clone(); o.material.emissive = mt.color.clone(); o.material.emissiveIntensity = 1.6; (P.ledMeshes ||= []).push(o); fe.mats.push(o.material); const sp = new THREE.Sprite(glowMat(o.material.emissive)); sp.scale.setScalar(.018); o.add(sp); fe.mats.push(sp.material); return; }
      if (/capuchon/.test(o.name)) (P.buttons ||= []).push(o);
      if (n === 'carbone' || n === 'carbone_mat') { mt.envMapIntensity = 1; }
      if (!fe.mats.includes(mt)) fe.mats.push(mt); });
    P.wheel.add(v); fe.wheelLoaded = true; needs = true;
    return import('./car.js').then(async ({ CAR }) => {
    const gl = await loader.parseAsync(glbBuffer(CAR), '');
    const m = gl.scene; m.scale.setScalar(1000); m.updateMatrixWorld(true);
    const byName = re => { let o = null; m.traverse(n => { if (!o && re.test(n.name || '')) o = n; }); return o; };
    const box = o => new THREE.Box3().setFromObject(o);
    // forward axis from front vs rear wheels
    const fl = byName(/^wheelFL/), bl = byName(/^wheelBL/);
    const fwd = fl && bl ? Math.sign(box(fl).getCenter(new THREE.Vector3()).z - box(bl).getCenter(new THREE.Vector3()).z) : 1;
    const holder = new THREE.Group(); holder.add(m); if (fwd < 0) holder.rotation.y = PI; holder.updateMatrixWorld(true);
    const cb = box(holder), cc = cb.getCenter(new THREE.Vector3());
    holder.position.set(-cc.x, -cb.min.y, -cc.z); holder.updateMatrixWorld(true);
    // replace the model's own steering wheel by the modelled one
    const sw = byName(/^steering_wheel/);
    if (sw) { const b = box(sw), c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3()); sw.visible = false;
      P.wheel.position.copy(c); P.wheel.scale.setScalar(Math.max(sz.x, 120) / 313); WHEEL_POS.copy(c); fe.wc.copy(c).divideScalar(100); }
    const nb = box(holder); fe.cc.copy(nb.getCenter(new THREE.Vector3())).divideScalar(100);
    // the details_normal material carries the normal map as colour: reuse the details colour map
    // in this export the real colour atlas of the "details" materials sits in the emissive slot
    holder.traverse(o => { if (!o.isMesh) return; const mt = o.material; if (/_details/.test(mt.name) && mt.emissiveMap) { mt.map = mt.emissiveMap; mt.emissiveMap = null; mt.emissive.setHex(0x000000); mt.needsUpdate = true; } });
    // this export marks every texel as metal (blue channel = 1): keep roughness, set metalness per material
    holder.traverse(o => { if (!o.isMesh) return; const mt = o.material; const n = mt.name || '';
      if (/licenseplate/.test(n)) { o.visible = false; return; }
      if (mt.metalnessMap) { mt.metalnessMap = null; mt.metalness = /calipers/.test(n) ? .6 : /carpaint/.test(n) ? .3 : /tire/.test(n) ? 0 : .1; }
      mt.transparent = false; mt.opacity = 1; mt.depthWrite = true; mt.needsUpdate = true; });
    holder.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; const arr = Array.isArray(o.material) ? o.material : [o.material]; arr.forEach(mt => { if (!P.carMats.includes(mt)) { mt.userData.ghost = true; P.carMats.push(mt); fe.mats.push(mt); } }); } });
    P.car.add(holder);
    // two more cars to make it a race (SkeletonUtils keeps the skinned wheels working)
    const { clone: skClone } = await import('three/addons/utils/SkeletonUtils.js');
    const tints = [0x8fb0ff, 0xffb08f]; P.racers = [{ obj: holder, base: new THREE.Vector3(0, 0, 0) }];
    [[2700, -4600], [-2700, 4300]].forEach(([x, z], k) => {
      const cl = skClone(holder); cl.position.x += x; cl.position.z += z;
      cl.traverse(o => { if (o.isMesh && /carpaint/.test(o.material.name)) { const m2 = o.material.clone(); m2.color.setHex(tints[k]); m2.userData.ghost = true; P.carMats.push(m2); fe.mats.push(m2); o.material = m2; } });
      P.car.add(cl); P.racers.push({ obj: cl, base: cl.position.clone(), ph: k * 1.7 });
    });
    P.wheelBones = []; P.car.traverse(o => { if (/^bone_wheel_.._rotation/.test(o.name || '')) P.wheelBones.push(o); });
    fe.carLoaded = true; needs = true;
    });
  }).catch(e => { console.warn('Modèles Formula E non chargés', e); });
}

/* ================= SimFeel: pedal + housing + module + command board ================= */
// arm leans back, away from the driver (driver on +z); the face looks toward the driver
const ARM_D = new THREE.Vector3(0, Math.sin(70 * PI / 180), -Math.cos(70 * PI / 180));
const ARM_N = new THREE.Vector3(0, Math.cos(70 * PI / 180), Math.sin(70 * PI / 180));
const PIVOT = new THREE.Vector3(0, 46, 100);
const armPt = (u, v) => PIVOT.clone().addScaledVector(ARM_D, u).addScaledVector(ARM_N, v);
const HOUSING_C = armPt(150, -30 - 19);
const CMD_POS = new THREE.Vector3(175, 0, 10), CMD_RY = -PI / 2 + .25;
function buildSimFeel() {
  const root = new THREE.Group(); const mats = []; root.userData.mats = mats;
  const M = o => { const m = new THREE.MeshPhysicalMaterial(o); if (o.transparent) m.userData.keepT = true; mats.push(m); return m; };
  const mm = new THREE.Group(); mm.scale.setScalar(1 / 100); root.add(mm);
  const X = new THREE.Vector3(1, 0, 0);
  // base plate
  const baseTex = canvasTex(256, 512, (c, w, h) => { c.fillStyle = '#1b1c1e'; c.fillRect(0, 0, w, h); c.fillStyle = '#0a0a0b'; for (let i = 0; i < 9; i++) for (const x of [40, w - 40]) { c.beginPath(); c.arc(x, 40 + i * 54, 9, 0, 7); c.fill(); } });
  const base = new THREE.Mesh(new RoundedBoxGeometry(150, 5, 360, 2, 2), [M({ color: 0x1b1c1e, roughness: .62 }), M({ color: 0x1b1c1e, roughness: .62 }), M({ map: baseTex, roughness: .6 }), M({ color: 0x1b1c1e, roughness: .62 }), M({ color: 0x1b1c1e, roughness: .62 }), M({ color: 0x1b1c1e, roughness: .62 })]);
  base.position.set(0, 2.5, -20); mm.add(base);
  const lip = new THREE.Mesh(new RoundedBoxGeometry(150, 40, 5, 2, 2), M({ color: 0x1b1c1e, roughness: .62 })); lip.position.set(0, 20, 160); mm.add(lip);
  // brushed aluminium
  const brushTex = canvasTex(512, 64, (c, w, h) => { const r = rng(4); for (let y = 0; y < h; y++) { const v = 170 + r() * 50; c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(0, y, w, 1); } }, false);
  const alu = M({ color: 0x9da2a8, roughness: .55, metalness: 1, roughnessMap: brushTex, anisotropy: .8 });
  // pivot brackets
  for (const s of [1, -1]) { const br = new THREE.Shape(); br.moveTo(-40, 0); br.lineTo(40, 0); br.lineTo(10, 70); br.lineTo(-20, 70); br.lineTo(-40, 0); const bg = new THREE.ExtrudeGeometry(br, { depth: 4, bevelEnabled: true, bevelSize: 1, bevelThickness: 1 }); bg.rotateY(PI / 2); const m = new THREE.Mesh(bg, alu); m.position.set(s * 44 - 2, 5, 100); mm.add(m); }
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 100, 24).rotateZ(PI / 2), M({ color: 0xdcdfe2, roughness: .25, metalness: 1 })); pin.position.copy(PIVOT); mm.add(pin);
  // arm: two side plates with lightening holes + front web
  const plate = new THREE.Shape(); plate.moveTo(-14, -26); plate.lineTo(250, -22); plate.quadraticCurveTo(262, 0, 250, 22); plate.lineTo(-14, 26); plate.quadraticCurveTo(-30, 0, -14, -26);
  [[60, 0, 11], [115, 2, 13], [170, 0, 10]].forEach(([u, v, r]) => { const h = new THREE.Path(); h.absarc(u, v, r, 0, PI * 2, true); plate.holes.push(h); });
  const plateG = new THREE.ExtrudeGeometry(plate, { depth: 3, bevelEnabled: true, bevelSize: .6, bevelThickness: .6, curveSegments: 24 });
  for (const s of [1, -1]) { const m = new THREE.Mesh(plateG, alu); m.applyMatrix4(basisMatrix(ARM_D, ARM_N, X, PIVOT.clone().add(new THREE.Vector3(s * 36 - 1.5, 0, 0)))); mm.add(m); }
  const web = new THREE.Mesh(new THREE.BoxGeometry(75, 210, 3), alu); web.applyMatrix4(basisMatrix(X, ARM_D, ARM_N, armPt(135, 24.5))); mm.add(web);
  // pedal face: textured black plastic, slightly curved
  const faceG = new RoundedBoxGeometry(80, 130, 14, 4, 4); const fp = faceG.attributes.position; for (let i = 0; i < fp.count; i++) { const y = fp.getY(i); fp.setZ(i, fp.getZ(i) - (y / 65) ** 2 * 6); } faceG.computeVertexNormals();
  const grain = canvasTex(256, 256, (c, w, h) => { const r = rng(12); c.fillStyle = '#808080'; c.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { const v = 90 + r() * 90; c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(r() * w, r() * h, 2, 2); } }, false);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.repeat.set(3, 4);
  const face = new THREE.Mesh(faceG, M({ color: 0x18191b, roughness: .78, bumpMap: grain, bumpScale: .6 })); face.applyMatrix4(basisMatrix(X, ARM_D, ARM_N, armPt(205, 36))); mm.add(face);
  // elastomer stack under the arm
  const elast = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 70, 32), M({ color: 0x111112, roughness: .85 })); elast.position.copy(armPt(55, 34)); elast.position.y = 40; mm.add(elast);

  // housing (modelled from photos): 52 × 48 × 38 mm, FDM layer lines
  const housingG = new THREE.Group(); housingG.applyMatrix4(basisMatrix(X, ARM_D, ARM_N, HOUSING_C)); mm.add(housingG);
  const layerTex = canvasTex(64, 1024, (g2, w, h) => { for (let y = 0; y < h; y++) { const v = 128 + 90 * Math.sin(y / 8.5 * PI); g2.fillStyle = `rgb(${v},${v},${v})`; g2.fillRect(0, y, w, 1); } }, false);
  layerTex.wrapS = layerTex.wrapT = THREE.RepeatWrapping;
  const housingMat = M({ color: 0x161617, roughness: .82, bumpMap: layerTex, bumpScale: 1.0, sheen: .3, sheenColor: 0x444444, sheenRoughness: .8 });
  const hg = new RoundedBoxGeometry(52, 48, 38, 8, 5);
  const pa = hg.attributes.position; for (let i = 0; i < pa.count; i++) { const z = pa.getZ(i); const f = 1 - .07 * ((19 - z) / 38); pa.setX(i, pa.getX(i) * f); pa.setY(i, pa.getY(i) * f); } hg.computeVertexNormals();
  const housing = new THREE.Mesh(hg, housingMat); housing.castShadow = housing.receiveShadow = true; housingG.add(housing);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x0f1114, transparent: true, opacity: 0 }); edgeMat.userData.ghost = true; mats.push(edgeMat);
  housingG.add(new THREE.LineSegments(new THREE.EdgesGeometry(hg, 25), edgeMat));
  // module pivot (explodes along +x, out of the side face) and opening decal
  const modPivot = new THREE.Group(); modPivot.position.set(16, -6, -4); housingG.add(modPivot);
  const modInner = new THREE.Group(); modInner.matrixAutoUpdate = false;
  modInner.matrix.copy(basisMatrix(new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3())); modPivot.add(modInner);
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(13, 8.5), M({ color: 0x050505, roughness: .9 })); decal.rotation.y = PI / 2; housingG.add(decal);
  // ERM motor (modelled)
  const motor = new THREE.Group();
  const can = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 20, 48), M({ color: 0xc9cdd1, roughness: .3, metalness: 1, anisotropy: .8 })); can.rotation.x = PI / 2; motor.add(can);
  const endc = new THREE.Mesh(new THREE.CylinderGeometry(4.7, 4.7, 2.2, 40), M({ color: 0x151515, roughness: .5 })); endc.rotation.x = PI / 2; endc.position.z = 11; motor.add(endc);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.7, .7, 5, 16), M({ color: 0xe6e6e6, roughness: .2, metalness: 1 })); shaft.rotation.x = PI / 2; shaft.position.z = -12.2; motor.add(shaft);
  const ms = new THREE.Shape(); ms.absarc(0, 0, 4.4, -PI / 2, PI / 2, false); ms.lineTo(0, -4.4);
  const massG = new THREE.ExtrudeGeometry(ms, { depth: 4, bevelEnabled: true, bevelSize: .3, bevelThickness: .3, bevelSegments: 2, curveSegments: 24 }); massG.translate(0, 0, -2);
  const massPivot = new THREE.Group(); massPivot.position.z = -15.5; massPivot.add(new THREE.Mesh(massG, M({ color: 0xc8a046, roughness: .3, metalness: 1 }))); motor.add(massPivot);
  motor.position.set(-9, 7, 2.5); housingG.add(motor);
  // command board group (KiCad) on the floor beside the pedal
  const cmd = new THREE.Group(); cmd.position.copy(CMD_POS); cmd.rotation.y = CMD_RY; mm.add(cmd);
  // cable group (3 wires), rebuilt when the module moves
  const cable = new THREE.Group(); mm.add(cable);
  mm.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  root.userData.parts = { mm, housingG, housing, housingMat, edgeMat, modPivot, modInner, decal, motor, massPivot, cmd, cable, X };
  const hc = HOUSING_C.clone().divideScalar(100);
  root.userData.housingC = hc;
  root.userData.radius = 2.3;
  root.userData.floorFn = (c, f) => -f.y - .004;
  return root;
}
const WIRE_COLS = [0xe8c21a, 0x1f8a6e, 0xef7a27];
function rebuildCable(sf) {
  const P = sf.parts; if (!P.plugTop || !P.cmdPlugTop) return;
  P.mm.updateMatrixWorld(true);
  const toMM = v => P.mm.worldToLocal(v.clone());
  const S = toMM(P.modPivot.localToWorld(P.plugTop.clone()));
  const sDir = toMM(P.modPivot.localToWorld(P.plugTop.clone().add(new THREE.Vector3(1, 0, 0)))).sub(S).normalize();
  const sOff = toMM(P.modPivot.localToWorld(P.plugTop.clone().add(new THREE.Vector3(0, 0, 1)))).sub(S).normalize();
  const E = toMM(P.cmd.localToWorld(P.cmdPlugTop.clone()));
  const eOff = toMM(P.cmd.localToWorld(P.cmdPlugTop.clone().add(P.cmdPinAxis))).sub(E).normalize();
  const mid = new THREE.Vector3((S.x + E.x) / 2 + 10, 3.5, (S.z + E.z) / 2 + 40);
  const pts = [S, S.clone().addScaledVector(sDir, 14), S.clone().addScaledVector(sDir, 34).add(new THREE.Vector3(0, -30, 0)), new THREE.Vector3(S.x + 45, 22, S.z + 10), mid, new THREE.Vector3(E.x - 10, 3.5, E.z + 20), E.clone().add(new THREE.Vector3(0, 30, 0)), E.clone().add(new THREE.Vector3(0, 10, 0)), E];
  const centre = new THREE.CatmullRomCurve3(pts, false, 'centripetal', .5);
  class Offset extends THREE.Curve { constructor(k) { super(); this.k = k; } getPoint(t, out = new THREE.Vector3()) { const p = centre.getPoint(t); const o = new THREE.Vector3().lerpVectors(sOff, eOff, THREE.MathUtils.smoothstep(t, .25, .85)).normalize(); return out.copy(p).addScaledVector(o, this.k * 2.5); } }
  P.cable.children.forEach(m => m.geometry.dispose());
  if (!P.cable.children.length) WIRE_COLS.forEach(col => { const mat = new THREE.MeshPhysicalMaterial({ color: col, roughness: .42, clearcoat: .4 }); sf.mats.push(mat); const m = new THREE.Mesh(new THREE.BufferGeometry(), mat); m.castShadow = true; m.receiveShadow = true; P.cable.add(m); });
  P.cable.children.forEach((m, i) => { m.geometry = new THREE.TubeGeometry(new Offset(i - 1), 140, .75, 8); });
}
function jstPlug(mats) {
  // XHP-3 housing, mated on a B3B-XH-A header; local +x = wire exit, pins along z
  const M = o => { const m = new THREE.MeshPhysicalMaterial(o); mats.push(m); return m; };
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(8.5, 5.9, 9.9, 2, .45), M({ color: 0xf0ede4, roughness: .55 })); g.add(body);
  const latch = new THREE.Mesh(new THREE.BoxGeometry(5, 1.2, 3), M({ color: 0xf0ede4, roughness: .55 })); latch.position.set(-1, 3.4, 0); g.add(latch);
  const cav = M({ color: 0x2a2a2a, roughness: .7 });
  for (let k = -1; k <= 1; k++) { const c = new THREE.Mesh(new THREE.BoxGeometry(.2, 2.2, 1.8), cav); c.position.set(4.26, 0, k * 2.5); g.add(c); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}


/* ================= environments: built in each object's own space, so they turn with it ================= */
function speckle(w, h, base, dots, seed, extra) { return canvasTex(w, h, (g) => { g.fillStyle = base; g.fillRect(0, 0, w, h); const r = rng(seed); for (const [col, n, sz] of dots) { g.fillStyle = col; for (let i = 0; i < n; i++) { const s2 = sz * (.5 + r()); g.fillRect(r() * w, r() * h, s2, s2); } } if (extra) extra(g, w, h, r); }); }
function gradTex(stops) { return canvasTex(4, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, w, h); }); }
function rep(t, x, y) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(x, y); return t; }
function makeEnv(kind, content) {
  const props = new THREE.Group(); const mats = [];
  const M = o => { const m = new THREE.MeshStandardMaterial(o); mats.push(m); return m; };
  const P = o => { const m = new THREE.MeshPhysicalMaterial(o); mats.push(m); return m; };
  const box = (w, h, d, mat, x, y, z, r = 0) => { const m = new THREE.Mesh(r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; props.add(m); return m; };
  const plane = (w, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -PI / 2; m.position.set(x, y, z); m.receiveShadow = true; props.add(m); return m; };
  const E = { props, mats, fog: [0xe9edf0, 14, 60], anim: null };
  let sky;

  if (kind === 'lab') { // 1 unit = 50 mm. Electronics bench: ESD mat, scope, bench supply, thermal chamber
    sky = gradTex([[0, '#c9d2d9'], [.5, '#e6ebef'], [1, '#e6ebef']]); E.fog = [0xe2e8ec, 16, 48];
    const esd = rep(speckle(512, 512, '#7c93a2', [['#8ea5b3', 2600, 2], ['#6a8090', 2600, 2], ['#a9bcc6', 260, 1.5]], 3, (g, w, h) => { g.strokeStyle = 'rgba(30,50,65,.12)'; g.lineWidth = 2; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * w / 8, 0); g.lineTo(i * w / 8, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 8); g.lineTo(w, i * h / 8); g.stroke(); } }), 6, 4);
    plane(36, 24, M({ map: esd, roughness: .92 }), 0, -.02, -2);
    box(40, 1.6, 28, M({ color: 0xd9d6cf, roughness: .7 }), 0, -.84, -2);
    plane(400, 400, M({ color: 0xbfc6cc, roughness: 1 }), 0, -16, 0);
    // wall + pegboard
    const peg = rep(canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#e4e7ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#b9c0c6'; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.beginPath(); g.arc(16 + i * 32, 16 + j * 32, 3.5, 0, 7); g.fill(); } }), 10, 5);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), M({ map: peg, roughness: .9 })); wall.position.set(0, 13, -10); wall.receiveShadow = true; props.add(wall);
    // oscilloscope with the triangular ripple current on screen
    const scopeBody = M({ color: 0x5d6a77, roughness: .55 }), dark = M({ color: 0x1b1d20, roughness: .4 }), knob = M({ color: 0x2a2c2f, roughness: .45 });
    const SC = new THREE.Group(); SC.position.set(-6.2, 0, -4.6); SC.rotation.y = .55; props.add(SC); const sb = box(8.2, 4.4, 5, scopeBody, 0, 2.2, 0, .25); SC.add(sb);
    const scr = canvasTex(512, 320, (g, w, h) => { g.fillStyle = '#071012'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(120,160,170,.25)'; g.lineWidth = 1; for (let i = 0; i <= 10; i++) { g.beginPath(); g.moveTo(i * w / 10, 0); g.lineTo(i * w / 10, h); g.stroke(); } for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(0, i * h / 8); g.lineTo(w, i * h / 8); g.stroke(); } g.strokeStyle = '#f3d23a'; g.lineWidth = 3; g.beginPath(); for (let x = 0; x <= w; x++) { const p = (x / 64) % 1, t = 1 - Math.abs(p * 2 - 1); const y = h * .32 - (t - .5) * h * .3; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.strokeStyle = '#3fd0e0'; g.beginPath(); for (let x = 0; x <= w; x++) { const y = (x / 32) % 2 < 1 ? h * .62 : h * .82; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.fillStyle = '#f3d23a'; g.font = '16px monospace'; g.fillText('CH1 I ripple   20.0 kHz', 10, 22); g.fillStyle = '#3fd0e0'; g.fillText('CH2 PWM 50 %', 10, h - 12); });
    const sm = new THREE.MeshBasicMaterial({ map: scr, toneMapped: false }); mats.push(sm);
    const s1 = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.9), sm); s1.position.set(-1.1, 2.55, 2.52); SC.add(s1);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const k = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .3, 20).rotateX(PI / 2), knob); k.position.set(1.9 + i * .6, 3.4 - j * .7, 2.6); SC.add(k); }
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .35, 16).rotateX(PI / 2), M({ color: 0xc9ccd0, metalness: 1, roughness: .3 })); b.position.set(-3.1 + i * 1.1, .7, 2.6); SC.add(b); }
    // bench power supply showing the two rails
    const PS = new THREE.Group(); PS.position.set(5.2, 0, -4.4); PS.rotation.y = -.5; props.add(PS); PS.add(box(6, 3.4, 6, M({ color: 0xe9ebee, roughness: .5 }), 0, 1.7, 0, .2));
    const psu = canvasTex(512, 160, (g, w, h) => { g.fillStyle = '#0b0c0d'; g.fillRect(0, 0, w, h); g.font = '700 70px monospace'; g.fillStyle = '#ff3b2f'; g.fillText('24.00', 16, 92); g.fillStyle = '#3cff7a'; g.fillText('15.00', 272, 92); g.font = '22px monospace'; g.fillStyle = '#9aa'; g.fillText('V  CH1', 70, 140); g.fillText('V  CH2', 326, 140); });
    const pm = new THREE.MeshBasicMaterial({ map: psu, toneMapped: false }); mats.push(pm);
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.5), pm); p1.position.set(0, 2.4, 3.02); PS.add(p1);
    [[0xd8192a, 2.1], [0x111111, 2.8], [0xd8192a, 4.2], [0x111111, 4.9]].forEach(([c, x]) => { const j = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .35, 16).rotateX(PI / 2), M({ color: c, roughness: .4 })); j.position.set(x - 3.5, .8, 3.1); PS.add(j); });
    // supply leads to the board connectors
    const lead = (col, pts) => { const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'centripetal'), 160, .045, 8), M({ color: col, roughness: .5 })); t.castShadow = true; props.add(t); };
    PS.updateMatrixWorld(true); const jp = x => PS.localToWorld(new THREE.Vector3(x - 3.5, .8, 3.3)).toArray();
    // mating plugs on the four 2x2 headers (x -67 mm, z -33/-12/12/33 mm), leads coming out of their top
    const plugM = M({ color: 0x1a1a1b, roughness: .45 });
    [-.66, -.24, .24, .66].forEach(zc => { box(.192, .2, .192, plugM, -1.34, .32, zc, .01); box(.06, .08, .12, plugM, -1.24, .36, zc); });
    [[2.1, 0xd8192a, -.66, 0], [2.8, 0x161616, -.24, 1], [4.2, 0xd8192a, .66, 2], [4.9, 0x161616, .24, 3]].forEach(([jx, col, zc, k]) => {
      const J = new THREE.Vector3(...jp(jx)), rz = -2.3 - k * .1, rx = -2.2 - k * .08;
      lead(col, [J.toArray(), [J.x - .2, .25, J.z + .5], [J.x - .6, .05, rz + .4], [2.6 - k * .15, .05, rz], [rx, .05, rz], [rx, .05, zc], [-1.9, .45, zc], [-1.34, .95, zc], [-1.34, .44, zc]]);
    });
    // thermal chamber in the background
    box(12, 15, 11, M({ color: 0xeef0f2, roughness: .5 }), 14, 7.5, -4, .4);
    const door = box(7, 9, .3, M({ color: 0xdfe3e7, roughness: .4 }), 13, 9, 1.6, .2);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(4, 4.5), P({ color: 0x1f2a33, roughness: .05, metalness: .2, clearcoat: 1 })); win.position.set(13, 9.6, 1.8); props.add(win);
    const ctl = canvasTex(256, 96, (g, w, h) => { g.fillStyle = '#0b0c0d'; g.fillRect(0, 0, w, h); g.font = '700 46px monospace'; g.fillStyle = '#ff8a2a'; g.fillText('+130 °C', 14, 64); });
    const cm = new THREE.MeshBasicMaterial({ map: ctl, toneMapped: false }); mats.push(cm);
    const c1 = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.1), cm); c1.position.set(18.2, 13.2, 1.57); props.add(c1);
    // the board sits on the mat (board bottom is y = 0 in content space)
  }

  if (kind === 'track') { // 1 unit = 10 mm (car space). Street circuit straight with kerbs, walls, fence
    props.scale.setScalar(.1); E.posts = [];
    sky = gradTex([[0, '#6f9fd4'], [.35, '#b8d1ea'], [.5, '#e9eef2'], [1, '#d6dadd']]); E.fog = [0xe2e8ee, 30, 140];
    const asphaltT = rep(speckle(512, 512, '#4b4d51', [['#5e6165', 9000, 2], ['#36383b', 9000, 2], ['#8a8c8f', 900, 1.3]], 7), 40, 400);
    const bumpT = rep(speckle(512, 512, '#808080', [['#b5b5b5', 9000, 2], ['#4a4a4a', 9000, 2]], 7), 40, 400); bumpT.colorSpace = THREE.NoColorSpace;
    plane(1400, 14000, M({ map: asphaltT, roughness: .93, bumpMap: bumpT, bumpScale: .5 }), 0, 0, 0);
    const kerbT = rep(canvasTex(64, 512, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f2f2f2' : '#d8141f'; g.fillRect(0, i * h / 8, w, h / 8); } }), 1, 1400);
    const lineM = M({ color: 0xf2f2f2, roughness: .6 }), kerbM = M({ map: kerbT, roughness: .7 });
    for (const s of [1, -1]) {
      plane(14, 14000, lineM, s * 560, .4, 0);
      plane(70, 14000, kerbM, s * 610, .5, 0);
      // concrete wall with debris fence
      const wallT = rep(canvasTex(512, 64, (g, w, h) => { g.fillStyle = '#d9dadb'; g.fillRect(0, 0, w, h); g.fillStyle = '#b6b8ba'; g.fillRect(0, 0, 4, h); g.fillStyle = '#e2061c'; g.fillRect(0, h * .72, w, h * .1); }), 360, 1);
      const wall = box(60, 110, 14000, M({ map: wallT, roughness: .85 }), s * 740, 55, 0);
      wall.material.map.repeat.set(1, 1); wall.geometry.attributes.uv && (() => { const uv = wall.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 360); uv.needsUpdate = true; })();
      const fenceT = rep(canvasTex(128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(70,74,78,.85)'; g.lineWidth = 3; for (let i = -w; i < w * 2; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); } }), 700, 6);
      const fm = new THREE.MeshStandardMaterial({ map: fenceT, transparent: true, alphaTest: .3, side: THREE.DoubleSide, roughness: .6 }); fm.userData.keepT = true; mats.push(fm);
      const fence = new THREE.Mesh(new THREE.PlaneGeometry(14000, 360), fm); fence.rotation.y = PI / 2; fence.position.set(s * 760, 290, 0); props.add(fence);
      const postM = M({ color: 0x5d6166, roughness: .5, metalness: .6 });
      for (let z = -3000; z <= 3000; z += 500) { const p = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 360, 10), postM); p.position.set(s * 762, 290, z); props.add(p); E.posts.push(p); }
    }
    const grass = M({ color: 0x7f9b63, roughness: 1 });
    for (const s of [1, -1]) plane(6000, 14000, grass, s * 3800, -.5, 0);
    E.trackTex = [asphaltT, bumpT, kerbT];
  }

  if (kind === 'room') { // 1 unit = 100 mm. Sim-racing rig in a room: parquet, rig rails, seat, screen
    sky = gradTex([[0, '#d8d3cb'], [.5, '#ece8e1'], [1, '#ece8e1']]); E.fog = [0xece8e1, 18, 55];
    const parquet = rep(canvasTex(512, 512, (g, w, h) => { const r = rng(21); const n = 4; for (let i = 0; i < n; i++) { const base = [206 + r() * 14, 192 + r() * 12, 170 + r() * 12]; g.fillStyle = `rgb(${base.map(Math.round).join(',')})`; g.fillRect(0, i * h / n, w, h / n); g.strokeStyle = 'rgba(110,90,65,.14)'; g.lineWidth = 1; for (let k = 0; k < 18; k++) { const y0 = i * h / n + r() * h / n; g.beginPath(); for (let x = 0; x <= w; x += 16) g.lineTo(x, y0 + Math.sin(x / 40 + k) * 2); g.stroke(); } g.fillStyle = 'rgba(80,65,50,.35)'; g.fillRect(0, i * h / n, w, 2); g.fillRect(r() * w, i * h / n, 2, h / n); } }), 10, 10);
    plane(120, 120, M({ map: parquet, roughness: .55 }), 0, -.01, 0);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(120, 40), M({ color: 0xefebe4, roughness: .95 })); wall.position.set(0, 20, -26); wall.receiveShadow = true; props.add(wall);
    // aluminium profile rig
    const alu = M({ color: 0x2a2c30, roughness: .45, metalness: .6 });
    for (const x of [-3.4, 3.4]) box(.8, .8, 9, alu, x, .4, 1.5);
    for (const z of [-2.6, 5.6]) box(7.6, .8, .8, alu, 0, .4, z);
    // monitor showing a race
    const scr = canvasTex(800, 450, (g, w, h) => { const sk = g.createLinearGradient(0, 0, 0, h * .55); sk.addColorStop(0, '#7fa9d8'); sk.addColorStop(1, '#d9e6f1'); g.fillStyle = sk; g.fillRect(0, 0, w, h); g.fillStyle = '#7f9b63'; g.fillRect(0, h * .55, w, h); g.fillStyle = '#4b4d51'; g.beginPath(); g.moveTo(w * .47, h * .55); g.lineTo(w * .53, h * .55); g.lineTo(w * .95, h); g.lineTo(w * .05, h); g.fill(); for (let i = 0; i < 14; i++) { const t0 = i / 14, t1 = (i + .5) / 14; const y0 = h * .55 + (h * .45) * t0 * t0, y1 = h * .55 + (h * .45) * t1 * t1; for (const s of [-1, 1]) { g.fillStyle = i % 2 ? '#f2f2f2' : '#d8141f'; g.beginPath(); const xa = w / 2 + s * (w * .03 + w * .42 * t0 * t0), xb = w / 2 + s * (w * .03 + w * .42 * t1 * t1); g.moveTo(xa, y0); g.lineTo(xb, y1); g.lineTo(xb + s * 18 * t1, y1); g.lineTo(xa + s * 18 * t0, y0); g.fill(); } } g.fillStyle = 'rgba(10,12,14,.75)'; g.fillRect(20, h - 70, 230, 50); g.fillStyle = '#ffcf33'; g.font = '700 28px Arial'; g.fillText('ABS', 36, h - 35); g.fillStyle = '#fff'; g.fillText('3   187 km/h', 100, h - 35); });
    const sm = new THREE.MeshBasicMaterial({ map: scr, toneMapped: false }); mats.push(sm);
    const MON = new THREE.Group(); MON.position.set(-1.5, 0, -6); MON.rotation.y = .5; props.add(MON);
    MON.add(box(13.4, 7.8, .5, M({ color: 0x0d0d0e, roughness: .3 }), 0, 6.6, 0, .1));
    const s1 = new THREE.Mesh(new THREE.PlaneGeometry(12.8, 7.2), sm); s1.position.set(0, 6.6, .26); MON.add(s1);
    MON.add(box(.7, 3, .7, alu, 0, 1.5, -.6)); MON.add(box(5, .3, 2.6, alu, 0, .15, -.6));
  }


  if (kind === 'sky') { // rocket climbing: ground far below, clouds sliding down
    sky = gradTex([[0, '#4f86c6'], [.45, '#a9c8e6'], [.5, '#dfeaf3'], [1, '#c9d6c0']]); E.fog = [0xd9e6f1, 40, 170];
    plane(8000, 8000, M({ color: 0x8aa06c, roughness: 1 }), 0, -700, 0);
    const cloudM = M({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: .25 });
    const r = rng(17); E.clouds = [];
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Group(); const n = 5 + Math.floor(r() * 5);
      for (let k = 0; k < n; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(6 + r() * 7, 16, 12), cloudM); s.position.set((r() - .5) * 26, (r() - .5) * 6, (r() - .5) * 14); s.scale.y = .6; c.add(s); }
      const a = r() * PI * 2, d = 45 + r() * 90; c.position.set(Math.cos(a) * d, (r() - .5) * 260, Math.sin(a) * d - 30); props.add(c); E.clouds.push(c);
    }
  }

  if (kind === 'cones') { // Formula Student driverless: blue cones left, yellow right, computed line in red (1 unit = 100 mm)
    sky = gradTex([[0, '#7aa6d6'], [.42, '#cfe0ee'], [.5, '#eef2f4'], [1, '#d7dbde']]); E.fog = [0xe2e8ee, 34, 130];
    const asph = rep(speckle(512, 512, '#55575b', [['#67696d', 9000, 2], ['#404245', 9000, 2], ['#8d8f92', 700, 1.3]], 11), 30, 30);
    plane(1200, 1200, M({ map: asph, roughness: .93 }), 0, 0, 0);
    const kerbT = rep(canvasTex(64, 512, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f2f2f2' : '#c8141f'; g.fillRect(0, i * h / 8, w, h / 8); } }), 1, 60);
    const kerbM = M({ map: kerbT, roughness: .7 });
    for (const s of [1, -1]) { plane(40, 1200, kerbM, s * 280, .3, 0); plane(3000, 3000, M({ color: 0x7f9b63, roughness: 1 }), s * 1800, -.4, 0); }
    // centre line of the cone track and the computed racing line
    const X = z => 35 * Math.sin(z / 90), L = z => 21 * Math.sin(z / 90 - .25);
    const x0 = L(0), slope = 21 / 90 * Math.cos(-.25), ang = Math.atan(slope);
    const track = new THREE.Group(); track.rotation.y = -ang; track.position.x = 0; props.add(track);
    const coneProfile = [new THREE.Vector2(0, 0), new THREE.Vector2(1.15, 0), new THREE.Vector2(1.15, .18), new THREE.Vector2(.95, .2), new THREE.Vector2(.3, 3.0), new THREE.Vector2(0, 3.0)];
    const coneG = new THREE.LatheGeometry(coneProfile, 24), stripeG = new THREE.CylinderGeometry(.62, .78, .7, 24, 1, true);
    const pos = { blue: [], yellow: [] };
    for (let z = -360; z <= 360; z += 25) { const dx = 35 / 90 * Math.cos(z / 90); const nx = 1 / Math.hypot(1, dx), nz = -dx / Math.hypot(1, dx); for (const [side, k] of [['blue', 1], ['yellow', -1]]) pos[side].push([X(z) - x0 + k * 18 * nx, z + k * 18 * nz]); }
    const inst = (geo, col, list, y) => { const m = new THREE.InstancedMesh(geo, M({ color: col, roughness: .55 }), list.length); list.forEach(([x, z], i) => m.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y, z))); m.castShadow = m.receiveShadow = true; track.add(m); };
    inst(coneG, 0x1f5fd6, pos.blue, 0); inst(stripeG, 0xf2f2f2, pos.blue, 1.55);
    inst(coneG, 0xf2c21a, pos.yellow, 0); inst(stripeG, 0x141414, pos.yellow, 1.55);
    // racing line ribbon with a moving dash
    const pts = []; for (let z = -360; z <= 360; z += 4) pts.push(new THREE.Vector3(L(z) - x0, .35, z));
    const verts = [], uvs = [], idx = []; let acc = 0;
    pts.forEach((p, i) => { const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)]; const d = new THREE.Vector3().subVectors(q, o).normalize(); const n = new THREE.Vector3(d.z, 0, -d.x).multiplyScalar(1.2); if (i) acc += p.distanceTo(pts[i - 1]); verts.push(p.x + n.x, p.y, p.z + n.z, p.x - n.x, p.y, p.z - n.z); uvs.push(acc / 18, 0, acc / 18, 1); if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); rg.setIndex(idx);
    const dashT = canvasTex(128, 8, (g, w, h) => { g.fillStyle = '#e2061c'; g.fillRect(0, 0, w * .62, h); g.fillStyle = 'rgba(226,6,28,.25)'; g.fillRect(w * .62, 0, w, h); }); dashT.wrapS = THREE.RepeatWrapping;
    const lm = new THREE.MeshBasicMaterial({ map: dashT, transparent: true, depthWrite: false, side: THREE.DoubleSide }); lm.userData.keepT = true; mats.push(lm);
    const ribbon = new THREE.Mesh(rg, lm); ribbon.renderOrder = 1; track.add(ribbon);
    E.dash = dashT;
  }
  props.traverse(o => { if (o.isMesh && o.material && !o.material.isMeshBasicMaterial && o.castShadow === false && o.receiveShadow === false) o.receiveShadow = true; });
  content.add(props);
  const sm = new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, fog: false, depthWrite: false }); mats.push(sm);
  E.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), sm); E.dome.renderOrder = -1;
  return E;
}


/* ================= Rocket with active fins (illustrative demo) ================= */
function buildRocket() {
  const root = new THREE.Group(); const mats = []; root.userData.mats = mats;
  const M = o => { const m = new THREE.MeshPhysicalMaterial(o); if (o.transparent) { m.userData.keepT = true; m.userData.baseOpacity = o.opacity ?? 1; } mats.push(m); return m; };
  const pivot = new THREE.Group(); pivot.position.y = 0; root.add(pivot); // rotation about the centre of gravity
  const R = new THREE.Group(); R.position.y = -5.5; pivot.add(R);
  const white = M({ color: 0xf4f5f6, roughness: .3, clearcoat: 1, clearcoatRoughness: .08 });
  const red = M({ color: 0xe2061c, roughness: .35, clearcoat: 1 }), black = M({ color: 0x141416, roughness: .4, clearcoat: .6 });
  const carbonT = carbonTex(); carbonT.wrapS = carbonT.wrapT = THREE.RepeatWrapping; carbonT.repeat.set(2, 2);
  const carbon = M({ map: carbonT, roughness: .35, clearcoat: 1, clearcoatRoughness: .1 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, 9, 64), white); body.position.y = 4.5; R.add(body);
  const ogive = []; for (let i = 0; i <= 24; i++) { const t = i / 24; ogive.push(new THREE.Vector2(.5 * Math.sqrt(1 - t * t * .98) * (1 - t * .02), t * 3.2)); }
  const nose = new THREE.Mesh(new THREE.LatheGeometry(ogive, 64), red); nose.position.y = 9; R.add(nose);
  for (const y of [7.4, 7.7]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.505, .505, .12, 64), black); b.position.y = y; R.add(b); }
  const band = new THREE.Mesh(new THREE.CylinderGeometry(.506, .506, .5, 64), red); band.position.y = 2.6; R.add(band);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(.5, .38, .6, 48), black); tail.position.y = -.3; R.add(tail);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(.22, .32, .45, 32, 1, true), M({ color: 0x3a3c40, metalness: .9, roughness: .35, side: THREE.DoubleSide })); nozzle.position.y = -.8; R.add(nozzle);
  // 4 active fins, hinge line along the span
  const fs = new THREE.Shape(); fs.moveTo(-1.0, 0); fs.lineTo(1.2, 0); fs.lineTo(.6, 1.35); fs.lineTo(-.4, 1.35); fs.lineTo(-1.0, 0);
  const finG = new THREE.ExtrudeGeometry(fs, { depth: .06, bevelEnabled: true, bevelSize: .015, bevelThickness: .015, bevelSegments: 1 }); finG.translate(0, 0, -.03);
  const fins = [];
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group(); arm.rotation.y = i * PI / 2; arm.position.y = .7; R.add(arm);
    const hinge = new THREE.Group(); hinge.position.x = .5; arm.add(hinge);
    const f = new THREE.Mesh(finG, carbon); f.rotation.z = -PI / 2; f.rotation.x = 0; hinge.add(f); // span along +x, chord along y
    fins.push(hinge);
  }
  // exhaust
  const flameOuter = M({ color: 0xff8a2a, emissive: 0xff6a00, emissiveIntensity: 2.5, transparent: true, opacity: .55, roughness: 1, depthWrite: false });
  const flameInner = M({ color: 0xfff1b0, emissive: 0xffd36b, emissiveIntensity: 3, transparent: true, opacity: .9, roughness: 1, depthWrite: false });
  const fo = new THREE.Mesh(new THREE.ConeGeometry(.34, 3.2, 32, 1, true), flameOuter); fo.rotation.x = PI; fo.position.y = -2.6; R.add(fo);
  const fi = new THREE.Mesh(new THREE.ConeGeometry(.18, 1.6, 24, 1, true), flameInner); fi.rotation.x = PI; fi.position.y = -1.8; R.add(fi);
  // smoke trail, stays vertical in the world
  const trailT = canvasTex(8, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const trailM = M({ map: trailT, transparent: true, opacity: .8, roughness: 1, depthWrite: false, side: THREE.DoubleSide });
  const trail = new THREE.Mesh(new THREE.CylinderGeometry(1.4, .45, 40, 32, 1, true), trailM); trail.position.y = -27; root.add(trail);
  root.traverse(o => { if (o.isMesh && o !== trail && o !== fo && o !== fi) { o.castShadow = true; o.receiveShadow = true; } });
  root.userData.parts = { pivot, fins, fo, fi };
  root.userData.radius = 7;
  root.userData.hist = [];
  return root;
}

/* ================= ADS-DV (Formula Student driverless car), modelled from photos ================= */
function buildADS() {
  const root = new THREE.Group(); const mats = []; root.userData.mats = mats;
  const M = o => { const m = new THREE.MeshPhysicalMaterial(o); mats.push(m); return m; };
  const mm = new THREE.Group(); mm.scale.setScalar(1 / 100); root.add(mm);
  const paint = M({ vertexColors: true, roughness: .32, clearcoat: 1, clearcoatRoughness: .08 });
  const blackM = M({ color: 0x111214, roughness: .5 }), alu = M({ color: 0xc9ccd0, roughness: .3, metalness: 1 }), blueM = M({ color: 0x2a6fd8, roughness: .4 });
  const white = new THREE.Color(0xf2f3f5), blk = new THREE.Color(0x15161a), blue = new THREE.Color(0x2a62c9), red = new THREE.Color(0xe2061c), dark = new THREE.Color(0x0a0a0b);
  const secs = [[1450, 190, 240, 150, 2.4], [1300, 215, 420, 230, 2.8], [1050, 255, 560, 310, 3.4], [700, 290, 700, 380, 4.5], [300, 305, 760, 410, 5], [-100, 305, 770, 410, 5], [-500, 295, 740, 390, 4.6], [-850, 280, 600, 340, 3.6], [-1150, 260, 420, 250, 2.8], [-1320, 250, 240, 160, 2.4]].map(([z, cy, w, h, e]) => ({ z, cy, w, h, e }));
  const bodyG = loft(secs, 96, null, (x, y, z, S, c) => {
    const rel = (y - S.cy) / (S.h / 2);
    if (z > 1380 && rel < .2) c.copy(dark);
    else if (rel < -.25) c.copy(blk);
    else if (rel > .55) c.copy(z > -200 && z < 900 ? blue : white);
    else if (z > 450 && rel > .1) c.copy(blue);
    else if (z < -150 && z > -650 && rel > -.25) c.copy(blk);
    else if (Math.abs(z + 120) < 60) c.copy(red);
    else c.copy(white);
  });
  const body = new THREE.Mesh(bodyG, paint); mm.add(body);
  // front lidar, display, sensor tower with status lights, camera bar, compute box
  const lid = new THREE.Mesh(new RoundedBoxGeometry(180, 90, 70, 2, 10), blackM); lid.position.set(0, 140, 1420); mm.add(lid);
  const disp = new THREE.Mesh(new RoundedBoxGeometry(160, 110, 30, 2, 8), blackM); disp.position.set(-150, 520, 250); disp.rotation.x = -.5; mm.add(disp);
  const tower = new THREE.Mesh(new RoundedBoxGeometry(130, 220, 130, 2, 14), blackM); tower.position.set(0, 610, -60); mm.add(tower);
  const ledT = canvasTex(256, 32, (g, w, h) => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#ff2a2a' : '#f2f2f2'; g.fillRect(i * w / 16, 0, w / 16 - 2, h); } });
  const leds = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 60, 32), M({ map: ledT, emissive: 0xffffff, emissiveMap: ledT, emissiveIntensity: .6, roughness: .3 })); leds.position.set(0, 750, -60); mm.add(leds);
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(80, 90, 110, 32), blackM); puck.position.set(0, 835, -60); mm.add(puck);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(900, 30, 30), M({ color: 0x1c1d20, roughness: .4, metalness: .5 })); bar.position.set(0, 620, 120); mm.add(bar);
  for (const s of [1, -1]) { const cm = new THREE.Mesh(new RoundedBoxGeometry(60, 50, 80, 2, 6), blackM); cm.position.set(s * 430, 650, 130); mm.add(cm); const bm = new THREE.Mesh(new THREE.BoxGeometry(70, 30, 40), blueM); bm.position.set(s * 430, 610, 130); mm.add(bm); }
  const comp = new THREE.Mesh(new RoundedBoxGeometry(420, 180, 300, 2, 10), alu); comp.position.set(0, 600, -330); mm.add(comp);
  const grill = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#c9ccd0'; g.fillRect(0, 0, w, h); g.fillStyle = '#222'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(24 + i * 26, 30, 8, 0, 7); g.fill(); } });
  const gp = new THREE.Mesh(new THREE.PlaneGeometry(380, 150), M({ map: grill, roughness: .4, metalness: .6 })); gp.position.set(0, 600, -179); mm.add(gp);
  // wheels: 13" rims, 520 mm tyres
  const tyreM = M({ color: 0x141414, roughness: .88 }), rimM = M({ color: 0x18191b, roughness: .4, metalness: .5 }), lipM = M({ color: 0xd9dcdf, roughness: .2, metalness: 1 });
  function wheel() {
    const w = new THREE.Group(); const Rr = 260, r = 165, hw = 115;
    const prof = [new THREE.Vector2(r, -hw + 8), new THREE.Vector2(Rr - 30, -hw), new THREE.Vector2(Rr - 4, -hw + 16), new THREE.Vector2(Rr, -hw + 40), new THREE.Vector2(Rr, hw - 40), new THREE.Vector2(Rr - 4, hw - 16), new THREE.Vector2(Rr - 30, hw), new THREE.Vector2(r, hw - 8)];
    const t = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), tyreM); t.rotation.z = PI / 2; w.add(t);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(r - 4, 9, 10, 48), lipM); lip.rotation.y = PI / 2; lip.position.x = hw - 14; w.add(lip);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(r - 12, r - 12, 8, 48), rimM); face.rotation.z = PI / 2; face.position.x = hw - 60; w.add(face);
    for (let i = 0; i < 8; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(12, 120, 26), rimM); sp.position.x = hw - 40; sp.rotation.x = i / 8 * PI * 2; sp.translateY(80); w.add(sp); }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 30, 24), alu); hub.rotation.z = PI / 2; hub.position.x = hw - 30; w.add(hub);
    return w;
  }
  const wheels = [];
  for (const z of [765, -765]) for (const s of [1, -1]) { const w = wheel(); w.position.set(s * 615, 260, z); w.scale.x = s; mm.add(w); wheels.push(w);
    const arm = (a, b) => { const v = new THREE.Vector3().subVectors(b, a); const m = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, v.length(), 8), blackM); m.position.copy(a).addScaledVector(v, .5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); mm.add(m); };
    arm(new THREE.Vector3(s * 300, 340, z + 150), new THREE.Vector3(s * 520, 330, z)); arm(new THREE.Vector3(s * 300, 340, z - 150), new THREE.Vector3(s * 520, 330, z)); arm(new THREE.Vector3(s * 300, 180, z + 160), new THREE.Vector3(s * 520, 190, z)); arm(new THREE.Vector3(s * 300, 180, z - 160), new THREE.Vector3(s * 520, 190, z)); }
  mm.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  root.userData.parts = { wheels, leds };
  root.userData.radius = 15;
  return root;
}

/* ================= registry, loading ================= */
const objects = {};
function register(name, content, envKind) {
  const holder = new THREE.Group(), spinner = new THREE.Group();
  holder.add(spinner); spinner.add(content);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: .16 })); shadow.rotation.x = -PI / 2; shadow.receiveShadow = true; holder.add(shadow);
  content.userData.mats.push(shadow.material);
  shadow.material.userData.baseOpacity = .16; shadow.material.userData.keepT = true;
  const env = envKind ? makeEnv(envKind, content) : null; if (env) holder.add(env.dome);
  holder.visible = false; scene.add(holder);
  objects[name] = { holder, spinner, content, shadow, env, cur: { w: 0, rx: 0, ry: 0, s: 1, fx: 0, fy: 0, fz: 0, e: 0, pulse: 0, spin: 0, ax: .5 }, last: null };
}
register('ripple', buildRipple(), 'lab');
register('fe', buildFE(), 'track');
register('rocket', buildRocket(), 'sky');
register('ads', buildADS(), 'cones');
register('simfeel', buildSimFeel());

import('./models.js').then(async ({ GLB }) => {
  const loader = new GLTFLoader();
  const sf = objects.simfeel.content.userData, P = sf.parts;
  const [cmdG, modG] = await Promise.all([loader.parseAsync(glbBuffer(GLB.commande), ''), loader.parseAsync(glbBuffer(GLB.module), '')]);
  const findMesh = (root, re) => { const out = []; root.traverse(o => { if (o.isMesh && re.test((o.parent?.name || '') + (o.name || '') + (o.geometry?.name || ''))) out.push(o); }); return out; };
  const boxIn = (objs, frame) => { frame.updateMatrixWorld(true); const b = new THREE.Box3(); objs.forEach(o => b.expandByObject(o)); const pts = []; for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(frame.worldToLocal(new THREE.Vector3(x, y, z))); return new THREE.Box3().setFromPoints(pts); };
  // module board: centred, component side up in its own frame, then oriented by modInner
  const mod = modG.scene; mod.scale.setScalar(1000); improveKicad(mod, sf.mats);
  const mb = new THREE.Box3().setFromObject(mod), mc = mb.getCenter(new THREE.Vector3());
  mod.position.set(-mc.x, -mb.min.y, -mc.z); P.modInner.add(mod);
  objects.simfeel.holder.updateMatrixWorld(true);
  const jb = boxIn(findMesh(mod, /JST/i), P.modPivot);
  const jc = jb.getCenter(new THREE.Vector3());
  const plug = jstPlug(sf.mats); plug.position.set(jb.max.x - 3.5 + 4.25, jc.y, jc.z); P.modPivot.add(plug);
  P.plugTop = new THREE.Vector3(jb.max.x - 3.5 + 8.5, jc.y, jc.z);
  // opening in the housing side wall, around the plug
  P.decal.position.set(25.6, jc.y + P.modPivot.position.y, jc.z + P.modPivot.position.z);
  // command board
  const cmd = cmdG.scene; cmd.scale.setScalar(1000); improveKicad(cmd, sf.mats);
  const cb = new THREE.Box3().setFromObject(cmd), cc = cb.getCenter(new THREE.Vector3());
  cmd.position.set(-cc.x, -cb.min.y, -cc.z); P.cmd.add(cmd);
  objects.simfeel.holder.updateMatrixWorld(true);
  const sock = findMesh(cmd, /PinSocket/i);
  if (sock.length) { const box = boxIn(sock, P.cmd), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3()); const esp = buildESP32(sf.mats); esp.position.set(c.x, box.max.y + 1.2, c.z); if (sz.z > sz.x) esp.rotation.y = PI / 2; P.cmd.add(esp); }
  // JST header used by this pedal (J2 in the KiCad file: x 111.8, z 109.9 mm on the board)
  const j2 = new THREE.Vector3(111.8 - cc.x * 1, 0, 109.9 - cc.z * 1);
  const jsts = boxIn(findMesh(cmd, /JST/i), P.cmd);
  const top = jsts.max.y;
  const cplug = jstPlug(sf.mats); cplug.rotation.z = PI / 2; cplug.position.set(j2.x, top - 3.5 + 4.25, j2.z); P.cmd.add(cplug);
  P.cmdPlugTop = new THREE.Vector3(j2.x, top - 3.5 + 8.5, j2.z); P.cmdPinAxis = new THREE.Vector3(0, 0, 1);
  sf.loaded = true; rebuildCable(sf); needs = true;
}).catch(e => console.warn('Modèles KiCad non chargés', e));

/* ================= beats ================= */
const B = (o = {}) => Object.assign({ rx: 0, ry: 0, s: 1, f: [0, 0, 0], e: 0, ex: 0, pulse: 0, spin: 0, ax: .5 }, o);
const CELL1 = objects.ripple.content.userData.parts.cells[0];
const cellPt = (u, v) => { const [x, z] = [CELL1.cx + u, CELL1.cz + v]; return [x / 50, 0, z / 50]; };
const HC = objects.simfeel.content.userData.housingC.toArray();
const BEATS = {
  'hero':     { ripple: B({ rx: .1, ry: -.45, s: 1.15, spin: .05, ax: .5 }) },
  'sz-intro': { ripple: B({ rx: .05, ry: -.25, s: .9, spin: .04 }) },
  'sz-1':     { ripple: B({ rx: .3, ry: -.1, s: .95 }) },
  'sz-2':     { ripple: B({ rx: .5, ry: -.35, s: 2.3, f: cellPt(-8.5, -10) }) },
    'sz-4':     { ripple: B({ rx: .55, ry: -.35, s: 1.25, ex: 1 }) },
  'sz-5':     { ripple: B({ rx: .15, ry: -.9, s: 1, spin: .07 }) },
  'st-intro': { fe: B({ ry: PI - .25, s: 1, screen: 0 }) },
  'st-1':     { fe: B({ ry: PI + .3, s: 1.08, screen: 2 }) },
  'st-2':     { fe: B({ ry: PI - .35, s: 1.05, screen: 1 }) },
  'st-3':     { fe: B({ ry: PI + .12, s: 1.1, screen: 3 }) },
  'st-4':     { fe: B({ ry: PI - .95, s: 1.05, e: 1, spin: .03, screen: 0 }) },
  'pr-intro': { rocket: B({ ry: .5, s: .9, spin: .05 }) },
  'rk-1':     { rocket: B({ ry: .3, rx: .05, s: 1 }) },
  'fs-1':     { ads: B({ ry: -.7, s: 1, spin: .02 }) },
  'fs-2':     { ads: B({ ry: .5, rx: .2, s: .5 }) },
  'sf-intro': { simfeel: B({ ry: -.65, s: .78, spin: .02, f: [0.4, 1.4, 1] }) },
  'sf-0':     { simfeel: B({ ry: -.9, s: .78, spin: .02, f: [0.4, 1.4, 1] }) },
  'sf-1':     { simfeel: B({ ry: -2.25, rx: .05, s: 2.2, f: HC }) },
  'sf-2':     { simfeel: B({ ry: -2.1, rx: .05, s: 1.7, f: HC, e: 1 }) },
};
const CAPS = {
  'hero': ['ill', 'Reconstitution', 'Carte de test en charge Sonceboz · 8 canaux'],
  'sz-intro': ['ill', 'Reconstitution', 'Carte de test en charge · 150 × 100 mm'],
  'sz-1': ['ill', 'Reconstitution', '8 canaux · 24 V / 15 V'],
  'sz-2': ['ill', 'Reconstitution', 'Canal 1 · NE555, driver IRS2004S, demi-pont'],
    'sz-4': ['ill', 'Reconstitution', 'Vue éclatée · étages d\'un canal'],
  'sz-5': ['ill', 'Reconstitution', 'Carte de test en charge'],
  'st-intro': ['ill', 'Modélisé', 'Volant · d\'après le plan du fabricant · écran fictif'],
  'st-1': ['ill', 'Modélisé', 'Écran : décodage bit à bit'],
  'st-2': ['ill', 'Modélisé', 'Écran noir au démarrage, puis corrigé'],
  'st-3': ['ill', 'Modélisé', 'Alarme maintenue par compteur'],
  'st-4': ['ill', 'Modèle CC BY 4.0', 'Formula E GEN3 Evo · bluspycrab (Sketchfab)'],
  'pr-intro': ['ill', 'Démonstration', 'Fusée à ailerons actifs · animation illustrative'],
  'rk-1': ['ill', 'Démonstration', 'Rafale latérale, puis ailerons qui ramènent la fusée dans l\'axe'],
  'fs-1': ['ill', 'Modélisé', 'ADS-DV, véhicule Formula Student autonome · d\'après photos'],
  'fs-2': ['ill', 'Illustration', 'Cônes bleus à gauche, jaunes à droite · trajectoire en rouge'],
  'sf-intro': ['real', 'KiCad réel + modélisé', 'Pédale, boîtier SimFeel et carte de commande'],
  'sf-0': ['real', 'KiCad réel + modélisé', 'Pédale équipée et carte de commande'],
  'sf-1': ['real', 'Modélisé', 'Boîtier · prise JST XH 3 fils'],
  'sf-2': ['real', 'KiCad réel', 'Module Ø 24 mm · moteur et ESP32 modélisés'],
};

/* ================= HUD + drag ================= */
const hud = document.getElementById('hud'), capEl = document.getElementById('cap'), scope = document.getElementById('scope'), sctx = scope.getContext('2d');
const drag = document.getElementById('drag');
let active = window.__beat || 'hero';
function setActive(id) {
  active = id; const c = CAPS[id];
  capEl.innerHTML = c ? `<span class="tag ${c[0]}">${c[1]}</span><b>${c[2]}</b>` : '';
  hud.classList.toggle('off', !c);
  scope.hidden = !(id === 'sz-4' || id === 'rk-1' || id === 'pr-intro');
  drag.classList.toggle('on', !!BEATS[id]);
  document.body.classList.toggle('has3d', !!BEATS[id]);
  if (BEATS[id]?.fe) { screenMode = BEATS[id].fe.screen || 0; loadCar(); }
  needs = true;
}
addEventListener('beat', e => setActive(e.detail));

let uYaw = 0, uPitch = 0, dragging = false, lx = 0, ly = 0, lastInteract = 0, px = 0, py = 0, sx0 = 0, sy0 = 0, horiz = null;
drag.addEventListener('pointerdown', e => { dragging = true; horiz = e.pointerType === 'mouse' ? true : null; lx = sx0 = e.clientX; ly = sy0 = e.clientY; lastInteract = performance.now(); if (e.pointerType === 'mouse') drag.setPointerCapture(e.pointerId); });
addEventListener('pointermove', e => {
  px = (e.clientX / innerWidth) * 2 - 1; py = (e.clientY / innerHeight) * 2 - 1;
  if (!dragging) return;
  if (horiz === null) { const dx = Math.abs(e.clientX - sx0), dy = Math.abs(e.clientY - sy0); if (dx + dy < 8) return; horiz = dx > dy; if (!horiz) { dragging = false; return; } drag.setPointerCapture(e.pointerId); }
  uYaw += (e.clientX - lx) * 0.008; uPitch += (e.clientY - ly) * 0.005; uPitch = Math.max(-.6, Math.min(.9, uPitch));
  lx = e.clientX; ly = e.clientY; lastInteract = performance.now(); needs = true;
});
const endDrag = () => { dragging = false; lastInteract = performance.now(); };
addEventListener('pointerup', endDrag); addEventListener('pointercancel', endDrag);

/* ================= layout & loop ================= */
let mobile = false, needs = true, last = performance.now(), T = 0;
function resize() {
  mobile = innerWidth < 820;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.6 : 1.75));
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); needs = true;
}
addEventListener('resize', resize);
const damp = (a, b, k) => a + (b - a) * k;
const right = new THREE.Vector3(), upv = new THREE.Vector3();
camera.updateMatrixWorld(); right.setFromMatrixColumn(camera.matrixWorld, 0); upv.setFromMatrixColumn(camera.matrixWorld, 1);

function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  const dt = Math.max(0, Math.min(.05, (now - last) / 1000)); last = Math.max(last, now); T += dt;
  const beat = BEATS[active] || {};
  const k = reduce ? 1 : 1 - Math.exp(-dt * 3.0);
  if (!dragging && now - lastInteract > 2200) { const kk = 1 - Math.exp(-dt * 1.2); uYaw = damp(uYaw, 0, kk); uPitch = damp(uPitch, 0, kk); }
  const dist = camera.position.length(), halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist, halfW = halfH * camera.aspect;
  const fit = mobile ? Math.min(halfW * .9, halfH * .82) : Math.min(halfW * .46, halfH * .72);
  let any = false, lead = null, leadW = 0, leadR = 2;
  let fogW = 0, fogCol = null;
  for (const name in objects) {
    const O = objects[name], c = O.cur, tgt = beat[name];
    c.w = damp(c.w, tgt ? 1 : 0, reduce ? 1 : 1 - Math.exp(-dt * 3.6));
    if (!tgt && c.w < .004) { O.holder.visible = false; continue; }
    any = true; O.holder.visible = true;
    const p = tgt || O.last || B(); if (tgt) O.last = tgt;
    const ke = name === 'fe' ? (reduce ? 1 : 1 - Math.exp(-dt * 1.6)) : k;
    c.ex = damp(c.ex || 0, p.ex || 0, k); c.rx = damp(c.rx, p.rx, k); c.ry = damp(c.ry, p.ry, k); c.s = damp(c.s, p.s, k); c.e = damp(c.e, p.e, ke); c.ax = damp(c.ax, p.ax, k);
    c.fx = damp(c.fx, p.f[0], k); c.fy = damp(c.fy, p.f[1], k); c.fz = damp(c.fz, p.f[2], k);
    c.spin += (reduce ? 0 : p.spin) * dt;
    const ud = O.content.userData;
    const radius = ud.radiusFn ? ud.radiusFn(c) : ud.radius;
    const f = ud.focusFn ? ud.focusFn(c) : new THREE.Vector3(c.fx, c.fy, c.fz);
    const leaving = !tgt, tw2 = 1 - c.w, eio = tw2 * tw2;
    const sc = fit / radius * c.s * (leaving ? 1 + .55 * eio : .7 + .3 * c.w);
    const envLow = O.env && name !== 'fe' ? .2 : 0; const ax = mobile ? 0 : c.ax, ay = (mobile ? -.02 : -.04) - envLow * (1 - Math.min(1, (c.s - 1) / 1.2));
    const pos = new THREE.Vector3().addScaledVector(right, ax * halfW).addScaledVector(upv, ay * halfH);
    if (leaving) pos.addScaledVector(right, -eio * halfW * .55).addScaledVector(upv, eio * halfH * .15); else pos.addScaledVector(upv, -tw2 * halfH * .3);
    pos.y += reduce ? 0 : Math.sin(T * .8) * .03;
    O.holder.position.copy(pos); O.holder.scale.setScalar(sc);
    O.content.position.copy(f).multiplyScalar(-1);
    const follow = name === 'fe' && c.e < .5 ? 3.2 : 1; const parX = mobile ? 0 : py * .04 * follow, parY = mobile ? 0 : px * .1 * follow;
    O.spinner.rotation.set(c.rx + uPitch + parX, c.ry + c.spin + uYaw + parY + (leaving ? -eio * .9 : tw2 * .8), 0, 'YXZ');
    if (ud.floorFn) { O.shadow.position.y = ud.floorFn(c, f); O.shadow.visible = true; }
    else { O.shadow.position.y = ud.floor * Math.min(1, 1.6 / c.s) - .02; O.shadow.visible = c.s < 1.6; }
    const a = Math.min(1, c.w * 1.2);
    if (O.env) {
      const E = O.env; O.shadow.visible = false; E.dome.scale.setScalar(150 / sc);
      for (const m of E.mats) { const t = a < .999 || !!m.userData.keepT; if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; } m.opacity = a; }
      if (c.w > fogW) { fogW = c.w; fogCol = E.fog; }
    }
    for (const m of ud.mats) { if (m.userData.ghost) continue; const t = a < .999; if (m.transparent !== t && !m.userData.keepT) { m.transparent = t; m.needsUpdate = true; } m.opacity = a * (m.userData.baseOpacity ?? 1); }
    animate(name, O, c, dt, a);
    if (c.w > leadW) { leadW = c.w; lead = O; leadR = fit * c.s * (name === 'fe' ? 1.5 + 2.2 * c.e : name === 'simfeel' ? 2.2 : 1.8); }
  }
  if (lead) {
    const R = Math.max(1.2, leadR);
    key.position.copy(lead.holder.position).add(new THREE.Vector3(-3.5, 9, 5));
    key.target.position.copy(lead.holder.position); key.target.updateMatrixWorld();
    const cam = key.shadow.camera; if (Math.abs(cam.right - R) > .01) { cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R; cam.near = .5; cam.far = 40; cam.updateProjectionMatrix(); }
  }
  if (fogCol !== null) { scene.fog.color.setHex(fogCol[0]); scene.fog.near = fogCol[1]; scene.fog.far = fogCol[2]; } else { scene.fog.near = 1e4; scene.fog.far = 2e4; }
  drawScope(dt); drawLabels();
  if (any || needs) { renderer.render(scene, camera); needs = any; }
}

function setGhost(m, op) { const base = m.userData.baseOpacity ?? 1, t = op < .999 || !!m.userData.keepT; if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; } m.opacity = op * base; if (!m.userData.keepT) m.depthWrite = op > .5; }
let lastCableE = -1, lastDraw = 0;
function animate(name, O, c, dt, a) {
  const P = O.content.userData.parts;
  if (name === 'fe') {
    const e = c.e, carVis = THREE.MathUtils.smoothstep(e, .12, .7);
    P.car.visible = carVis > .005;
    if (P.car.visible) for (const m of P.carMats) setGhost(m, a * carVis);
    if (userPage !== null && T > userPageUntil) userPage = null;
    screenMode = userPage ?? (BEATS[active]?.fe?.screen ?? 0);
    if (pressed) { const k = Math.max(0, 1 - (T - pressT) / .25); pressed.userData.z0 ??= pressed.position.z; pressed.position.z = pressed.userData.z0 - .0025 * Math.sin(k * PI); if (k <= 0) { pressed.position.z = pressed.userData.z0; pressed = null; } }
    if (P.ledMeshes) { const hov = !mobile ? Math.max(0, 1 - Math.hypot(px - .45, py + .05) * 1.6) : 0; P.ledMeshes.forEach((m, i) => { const on = ((T * (3 + hov * 9) - i * .35) % 3) < 1.6; m.material.emissiveIntensity = on ? 1.6 + hov * 2.5 : .15; }); }
    if (screenCtx && T - lastDraw > 1 / 20) { drawScreen(T); lastDraw = T; }
    // race: rolling road, spinning wheels, the two other cars trading places
    const race = O.env && P.racers && e > .4 && !reduce;
    if (race) {
      const v = 150 * dt; const [asph, bump, kerb] = O.env.trackTex;
      asph.offset.y -= v * 400 / 14000; bump.offset.y = asph.offset.y; kerb.offset.y -= v * 1400 / 14000;
      O.env.posts.forEach(p => { p.position.z -= v; if (p.position.z < -3000) p.position.z += 6500; });
      P.wheelBones.forEach(b => { b.rotation.x += dt * 22; });
      P.racers.slice(1).forEach(r => { r.obj.position.z = r.base.z + Math.sin(T * .35 + r.ph) * 900; r.obj.position.x = r.base.x + Math.sin(T * .5 + r.ph) * 250; });
    }
    P.wheel.userData.leds.forEach((m, i) => { const v = (Math.sin(T * 3 - i * .55) + 1) / 2; m.emissive.setHex(i < 3 ? 0x2fd36b : i < 7 ? 0xff3030 : 0x8a5cff).multiplyScalar(v > .5 ? 1 : .04); });
  }
  if (name === 'ripple') {
    const t0 = window.__introEnd ?? 0, A = reduce ? 1 : Math.max(0, (performance.now() - t0) / 1700);
    const ex = c.ex || 0, exE = ex * ex * (3 - 2 * ex);
    for (const pt of P.parts) { const k = Math.min(1, Math.max(0, (A - pt.delay) / .45)), drop = 1 - (1 - k) * (1 - k) * (1 - k);
      pt.o.position.y = (1 - drop) * 60 + exE * (6 + pt.top * 2.2); pt.o.visible = A > pt.delay - .02; }
    labelsFor = ex > .35 ? O : (labelsFor === O ? null : labelsFor);
  }
  if (name === 'rocket') {
    const per = 7, t = reduce ? 2 : T % per;
    const th = t < .4 ? .32 * t / .4 : .32 * Math.exp(-1.1 * (t - .4)) * Math.cos(2.4 * (t - .4));
    const dth = (th - (P.lastTh ?? th)) / Math.max(dt, 1e-3); P.lastTh = th;
    const de = Math.max(-.42, Math.min(.42, -1.4 * th - .12 * dth));
    P.pivot.rotation.z = th; P.pivot.rotation.x = .25 * th;
    P.fins[1].rotation.x = de; P.fins[3].rotation.x = -de; P.fins[0].rotation.x = .25 * de; P.fins[2].rotation.x = -.25 * de;
    const f = 1 + Math.sin(T * 40) * .06 + Math.sin(T * 23) * .05; P.fo.scale.set(f, f * (1 + .1 * Math.sin(T * 17)), f); P.fi.scale.setScalar(f);
    const h = O.content.userData.hist; if (!reduce) { h.push({ th, de }); if (h.length > 220) h.shift(); }
    if (O.env && O.env.clouds && !reduce) O.env.clouds.forEach(cl => { cl.position.y -= dt * 38; if (cl.position.y < -140) cl.position.y += 280; });
  }
  if (name === 'ads') {
    if (O.env && O.env.dash && !reduce) O.env.dash.offset.x -= dt * 1.4;
    P.leds.material.emissiveIntensity = .4 + .4 * (Math.sin(T * 6) > 0 ? 1 : 0);
  }
  if (name === 'simfeel') {
    const e = c.e, ease = e * e * (3 - 2 * e);
    setGhost(P.housingMat, a * (1 - .78 * ease)); P.housing.castShadow = e < .5;
    P.edgeMat.opacity = a * .5 * ease;
    P.modPivot.position.set(16 + 46 * ease, -6 + 6 * ease, -4);
    P.motor.position.set(-9 - 8 * ease, 7 + 46 * ease, 2.5); P.motor.rotation.x = .25 * ease;
    P.massPivot.rotation.z += reduce ? 0 : dt * (absUntil > T ? 90 : 38);
    const home = (P.housingG.userData.home ??= P.housingG.position.clone());
    const absOn = absUntil > T && !reduce, pulse = absOn && Math.sin(T * PI * 2 * 12) > 0, amp = absOn ? (pulse ? .9 : .25) : 0;
    P.housingG.position.set(home.x + Math.sin(T * 97) * amp, home.y + Math.cos(T * 83) * amp, home.z + Math.sin(T * 71) * amp);
    P.decal.visible = e < .5;
    if (O.content.userData.loaded && Math.abs(e - lastCableE) > .003) { rebuildCable(O.content.userData); lastCableE = e; }
  }
}

let labelsFor = null; const labelBox = document.getElementById('labels'); const labelEls = [];
function drawLabels() {
  if (!labelBox) return;
  if (!labelsFor || !labelsFor.holder.visible) { labelBox.classList.remove('on'); return; }
  const ud = labelsFor.content.userData, pcb = ud.parts.pcb; labelBox.classList.add('on');
  const ex = labelsFor.cur.ex || 0, exE = ex * ex * (3 - 2 * ex), rect = canvas.getBoundingClientRect();
  const pts = ud.labels.map((L, i) => { const v = pcb.localToWorld(new THREE.Vector3(L.x, 1.6 + L.h + exE * (6 + (1.6 + L.h) * 2.2), L.z)).project(camera); return { i, L, x: (v.x * .5 + .5) * rect.width + rect.left, y: (-v.y * .5 + .5) * rect.height + rect.top }; });
  const ys = pts.map(p => p.y), cy = ys.reduce((a, b) => a + b, 0) / ys.length, minX = Math.min(...pts.map(p => p.x));
  pts.sort((a, b) => a.y - b.y).forEach((p, k) => {
    let el = labelEls[p.i]; if (!el) { el = document.createElement('div'); el.className = 'lbl3d'; el.innerHTML = '<i></i><b></b><span></span>'; labelBox.appendChild(el); labelEls[p.i] = el; }
    el.querySelector('span').textContent = p.L.t;
    const tx = minX - 70 - p.x, ty = cy + (k - (pts.length - 1) / 2) * 42 - p.y, len = Math.hypot(tx, ty), ang = Math.atan2(ty, tx);
    el.style.transform = `translate(${p.x}px, ${p.y}px)`;
    const line = el.querySelector('b'); line.style.width = len + 'px'; line.style.transform = `rotate(${ang}rad)`;
    const sp = el.querySelector('span'); sp.style.transform = `translate(calc(${tx}px - 100%), calc(${ty}px - 50%))`;
    el.style.opacity = Math.max(0, Math.min(1, (ex - .35) / .5));
  });
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let pressT = 0, pressed = null, userPage = null, userPageUntil = 0;
drag.addEventListener('pointerup', e => {
  if (Math.abs(e.clientX - sx0) + Math.abs(e.clientY - sy0) > 6) return;
  const fe = objects.fe; if (!BEATS[active]?.fe || !fe.content.userData.parts.buttons) return;
  const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera); const hit = ray.intersectObjects(fe.content.userData.parts.buttons, false)[0];
  if (hit) { pressed = hit.object; pressT = T; const pages = [0, 2, 3]; userPage = pages[(pages.indexOf(userPage ?? screenMode) + 1) % 3]; userPageUntil = T + 6; needs = true; }
});
let absUntil = 0, audioCtx = null;
document.getElementById('btnAbs')?.addEventListener('click', () => {
  absUntil = T + 2.6; needs = true;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime, o = audioCtx.createOscillator(), g = audioCtx.createGain(), lfo = audioCtx.createOscillator(), lg = audioCtx.createGain(), f = audioCtx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = 95; lfo.type = 'square'; lfo.frequency.value = 12; lg.gain.value = .05; f.type = 'lowpass'; f.frequency.value = 420;
    g.gain.setValueAtTime(.06, t); g.gain.setTargetAtTime(0, t + 2.4, .05); lfo.connect(lg); lg.connect(g.gain);
    o.connect(f); f.connect(g); g.connect(audioCtx.destination); o.start(t); lfo.start(t); o.stop(t + 2.7); lfo.stop(t + 2.7);
  } catch (err) { }
});

function drawScope(dt) {
  if (scope.hidden) return;
  if (active === 'rk-1' || active === 'pr-intro') {
    const W = scope.width, H = scope.height, g = sctx, h = objects.rocket.content.userData.hist; g.clearRect(0, 0, W, H);
    g.strokeStyle = '#e6e8eb'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    [['th', '#e2061c'], ['de', '#0f1114']].forEach(([k, col]) => { g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); h.forEach((p, i) => { const x = W - (h.length - 1 - i) * 2, y = H / 2 - p[k] * H * (k === 'th' ? 1.3 : .9); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); });
    g.font = '500 17px IBM Plex Mono, monospace'; g.fillStyle = '#e2061c'; g.fillText('assiette', 12, 24); g.fillStyle = '#0f1114'; g.fillText('braquage ailerons', 110, 24);
    return;
  }
  const W = scope.width, H = scope.height, g = sctx; g.clearRect(0, 0, W, H);
  g.strokeStyle = '#e6e8eb'; g.lineWidth = 1; for (let x = 0; x < W; x += 44) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
  const ph = reduce ? 0 : T * .6; g.strokeStyle = '#e2061c'; g.lineWidth = 3; g.beginPath();
  for (let x = 0; x < W; x++) { const p = ((x / 110 + ph) % 1); const t = 1 - Math.abs(p * 2 - 1); const y = H * .78 - t * H * .56; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
  g.fillStyle = '#0f1114'; g.font = '500 18px IBM Plex Mono, monospace'; g.fillText('I ripple · 20 kHz', 14, 28);
}

resize(); setActive(active); requestAnimationFrame(frame);
setTimeout(loadCar, 2500);
