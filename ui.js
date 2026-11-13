/* Interface hors 3D : chargement, thème, navigation, rail, apparitions, palette de commandes.
   Fonctionne sans WebGL. La 3D (app.js) et les schémas (viz.js) envoient l'événement "beat". */
(function () {
  'use strict';
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => [...p.querySelectorAll(s)];

  /* ---------- message bref ---------- */
  const toastEl = $('#toast'); let toastT;
  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 1800); }

  /* ---------- écran de chargement : se lève quand la 3D a rendu sa première image ---------- */
  const boot = $('#boot'); const t0 = performance.now(); let lifted = false;
  function lift() {
    if (lifted) return; lifted = true;
    const go = () => { window.__introEnd = performance.now() + 150; root.classList.add('ready'); setTimeout(() => boot && boot.remove(), 1400); };
    if (reduce || !boot) return go();
    boot.classList.add('done');
    setTimeout(go, Math.max(380, 1000 - (performance.now() - t0)));
  }
  addEventListener('app-ready', lift);
  addEventListener('error', e => { if (/app\.js|three/.test((e && e.filename) || '')) lift(); });
  setTimeout(lift, 7000);            // la page reste lisible même si la 3D ne démarre pas
  if (reduce) lift();

  /* ---------- thème : Routage (sombre) ou Schéma (clair) ---------- */
  const themeBtn = $('#themeBtn'), metaTheme = $('meta[name=theme-color]');
  const isSchema = () => root.dataset.theme === 'schema';
  function paintTheme() { themeBtn.setAttribute('aria-label', isSchema() ? 'Passer au thème sombre' : 'Passer au thème clair'); metaTheme.content = isSchema() ? '#f4f1e4' : '#081018'; }
  function setTheme(schema) { if (schema) root.dataset.theme = 'schema'; else delete root.dataset.theme; try { localStorage.setItem('theme', schema ? 'schema' : 'pcb'); } catch (e) { } paintTheme(); }
  function toggleTheme() {
    const next = !isSchema();
    if (reduce || !document.startViewTransition) return setTheme(next);
    const r = themeBtn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = document.startViewTransition(() => setTheme(next));
    vt.ready.then(() => root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`] }, { duration: 650, easing: 'cubic-bezier(.3,.6,.2,1)', pseudoElement: '::view-transition-new(root)' })).catch(() => { });
  }
  themeBtn.addEventListener('click', toggleTheme); paintTheme();

  /* ---------- apparitions ---------- */
  const revealEls = $$('.rv, h2.disp, .ch-head, .stats li');
  if (!reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(el => io.observe(el));
  } else revealEls.forEach(el => el.classList.add('in'));
  addEventListener('beforeprint', () => revealEls.forEach(el => el.classList.add('in')));

  /* ---------- le paragraphe lu est allumé ---------- */
  const beats = $$('.beat');
  addEventListener('beat', e => beats.forEach(b => b.classList.toggle('live', b.dataset.beat === e.detail)));

  /* ---------- navigation, rail, couleur de la couche en cours ---------- */
  const SECTIONS = [
    ['top', 'Accueil', '--L-sz'], ['parcours', 'Parcours', '--cu'], ['sonceboz', 'Sonceboz', '--L-sz'], ['stellantis', 'Stellantis Motorsport', '--L-st'],
    ['secad', 'SECAD', '--L-se'], ['projets', 'Projets', '--L-pr'], ['simfeel', 'SimFeel', '--L-sf'], ['competences', 'Compétences', '--cu'],
    ['motivations', 'Motivations', '--cu'], ['contact', 'Contact', '--L-sz']
  ].map(([id, label, col]) => ({ id, label, col, el: document.getElementById(id) })).filter(s => s.el);
  const bar = $('#progress'), rail = $('#rail'), railFill = $('#railFill');
  const links = $$('.nav ul a'), targets = links.map(a => $(a.getAttribute('href')));
  SECTIONS.forEach(s => {
    const a = document.createElement('a'); a.className = 'rail-pad'; a.href = s.id === 'top' ? '#top' : '#' + s.id; a.style.setProperty('--c', `var(${s.col})`);
    a.innerHTML = `<span>${s.label}</span>`; a.setAttribute('aria-label', s.label); rail.appendChild(a); s.pad = a;
  });
  const docTop = el => el.getBoundingClientRect().top + scrollY;
  function placePads() {
    const h = root.scrollHeight - innerHeight;
    SECTIONS.forEach(s => { s.at = h > 0 ? Math.min(1, Math.max(0, (docTop(s.el) - 80) / h)) : 0; s.pad.style.top = (s.at * 100) + '%'; });
    if (SECTIONS[0]) { SECTIONS[0].at = 0; SECTIONS[0].pad.style.top = '0%'; }
  }
  const tl = $('.timeline'), tlItems = $$('.timeline li');
  let liveId = null;
  function onScroll() {
    const h = root.scrollHeight - innerHeight, k = h > 0 ? Math.min(1, scrollY / h) : 0;
    bar.style.transform = `scaleX(${k})`; railFill.style.transform = `scaleY(${k})`;
    let on = -1; targets.forEach((t, i) => { if (t && t.getBoundingClientRect().top < innerHeight * .45) on = i; });
    links.forEach((a, i) => { if (i === on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    let cur = SECTIONS[0]; SECTIONS.forEach(s => { if (s.el.getBoundingClientRect().top < innerHeight * .5) cur = s; s.pad.classList.toggle('done', k >= s.at - .0005); });
    if (cur && cur.id !== liveId) { liveId = cur.id; root.style.setProperty('--live', `var(${cur.col})`); SECTIONS.forEach(s => s.pad.classList.toggle('on', s === cur)); }
    if (tl) {
      const r = tl.getBoundingClientRect(), p = Math.max(0, Math.min(1, (innerHeight * .72 - r.top - 30) / (r.height - 60)));
      tl.style.setProperty('--tl', p.toFixed(3));
      const y = r.top + 30 + p * (r.height - 60);
      tlItems.forEach(li => li.classList.toggle('lit', li.getBoundingClientRect().top + 30 <= y + 1));
    }
  }
  let tick = false;
  addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(() => { tick = false; onScroll(); }); } }, { passive: true });
  addEventListener('resize', () => { placePads(); onScroll(); });
  addEventListener('load', () => { placePads(); onScroll(); });
  if ('ResizeObserver' in window) new ResizeObserver(() => { placePads(); onScroll(); }).observe(document.body);
  placePads(); onScroll();

  /* ---------- grille qui s'allume sous le curseur ---------- */
  if (!reduce && matchMedia('(hover: hover)').matches)
  { const hot = $('.grid-hot'); addEventListener('pointermove', e => { hot.style.setProperty('--mx', e.clientX + 'px'); hot.style.setProperty('--my', e.clientY + 'px'); }, { passive: true }); }

  /* ---------- compteurs : les chiffres clés comptent à leur première apparition ---------- */
  if (!reduce && 'IntersectionObserver' in window) {
    const nums = $$('.stats .big, .kpi .v').filter(el => /^\d/.test((el.firstChild && el.firstChild.textContent) || ''));
    const io3 = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return; io3.unobserve(e.target);
      const tn = e.target.firstChild, raw = tn.textContent, end = parseFloat(raw.replace(',', '.')), start = performance.now(), d = 1300, year = end >= 1000 && end < 3000;
      const step = t => { const k = Math.min(1, (t - start) / d), q = 1 - Math.pow(1 - k, 3); tn.textContent = String(Math.round(year ? 2000 + (end - 2000) * q : end * q)); if (k < 1) requestAnimationFrame(step); else tn.textContent = raw; };
      requestAnimationFrame(step);
    }), { threshold: .6 });
    nums.forEach(n => io3.observe(n));
  }

  /* ---------- menu mobile ---------- */
  const hdr = $('header.nav'), mb = $('#menuBtn');
  const setMenu = o => { hdr.classList.toggle('open', o); mb.setAttribute('aria-expanded', String(o)); mb.setAttribute('aria-label', o ? 'Fermer le menu' : 'Menu'); };
  mb.addEventListener('click', () => setMenu(!hdr.classList.contains('open')));
  $$('nav a', hdr).forEach(a => a.addEventListener('click', () => setMenu(false)));
  matchMedia('(min-width:821px)').addEventListener('change', e => { if (e.matches) setMenu(false); });

  /* ---------- copie de l'adresse ---------- */
  const mail = $('#mail'), copyStatus = $('#copyStatus');
  function copyMail(btn) {
    const addr = mail.textContent.trim();
    const ok = () => { toast('Adresse e-mail copiée'); if (copyStatus) copyStatus.textContent = 'Adresse e-mail copiée'; if (btn) { btn.textContent = 'Copié'; btn.classList.add('ok'); setTimeout(() => { btn.textContent = 'Copier'; btn.classList.remove('ok'); if (copyStatus) copyStatus.textContent = ''; }, 1800); } };
    const fallback = () => { const r = document.createRange(); r.selectNodeContents(mail); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Adresse sélectionnée : Ctrl + C pour la copier'); };
    try { navigator.clipboard.writeText(addr).then(ok, fallback); } catch (e) { fallback(); }
  }
  $$('[data-copy]').forEach(b => b.addEventListener('click', () => copyMail(b)));
  $('#printBtn').addEventListener('click', () => print());

  /* ---------- palette de commandes (Ctrl/⌘ K, ou /) ---------- */
  const dlg = $('#cmd'), input = $('#cmdInput'), list = $('#cmdList'), cmdBtn = $('#cmdBtn');
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent); if (mac) $('#cmdKey').textContent = '⌘ K';
  const go = id => () => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); };
  const KW = { top: 'haut début accueil', parcours: 'formation études frise iut ece', sonceboz: 'stage 2026 suisse condensateurs puissance banc', stellantis: 'stage 2025 formula e volant can motorsport', secad: 'stage 2023 2024 obsolescence freertos microcontrôleur', projets: 'fusée matlab formula student arece autonome', simfeel: 'projet personnel esp32 kicad pédale sim racing', competences: 'skills outils logiciels langues anglais', motivations: 'objectifs métier', contact: 'email mail linkedin téléphone' };
  const ITEMS = SECTIONS.map(s => ({ label: s.label, hint: 'Section', col: s.col, kw: KW[s.id] || '', run: go(s.id) })).concat([
    { label: "Copier l'adresse e-mail", hint: 'Action', kw: 'mail contact', run: () => copyMail() },
    { label: 'Écrire un e-mail', hint: 'Action', kw: 'mail contact message', run: () => { location.href = mail.href; } },
    { label: 'Ouvrir le profil LinkedIn', hint: 'Lien', kw: 'réseau', run: () => window.open('https://www.linkedin.com/in/j-carro', '_blank', 'noopener') },
    { label: 'Changer de thème (clair / sombre)', hint: 'Action', kw: 'dark light mode schéma routage couleur', run: toggleTheme },
    { label: 'Imprimer le CV ou l\'enregistrer en PDF', hint: 'Action', kw: 'pdf télécharger print', run: () => setTimeout(() => print(), 60) }
  ]);
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let shown = [], sel = 0;
  function render() {
    const q = norm(input.value.trim());
    shown = ITEMS.filter(it => !q || q.split(/\s+/).every(w => norm(it.label + ' ' + it.kw + ' ' + it.hint).includes(w)));
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.innerHTML = shown.length ? shown.map((it, i) => `<li role="option" id="cmd-${i}" aria-selected="${i === sel}" data-i="${i}"${it.col ? ` style="--c:var(${it.col})"` : ''}><i></i>${it.label}<small>${it.hint}</small></li>`).join('') : '<li class="none">Aucun résultat. Essayez « Sonceboz », « contact » ou « thème ».</li>';
    input.setAttribute('aria-activedescendant', shown.length ? 'cmd-' + sel : '');
    const cur = $('[aria-selected="true"]', list); if (cur) cur.scrollIntoView({ block: 'nearest' });
  }
  function openCmd() { if (dlg.open) return; input.value = ''; sel = 0; render(); dlg.showModal(); input.focus(); }
  function runSel(i) { const it = shown[i]; if (!it) return; dlg.close(); it.run(); }
  cmdBtn.addEventListener('click', openCmd);
  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, shown.length); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + shown.length) % Math.max(1, shown.length); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); runSel(sel); }
  });
  list.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) runSel(+li.dataset.i); });
  list.addEventListener('pointermove', e => { const li = e.target.closest('li[data-i]'); if (li && +li.dataset.i !== sel) { sel = +li.dataset.i; $$('li', list).forEach((x, i) => x.setAttribute('aria-selected', String(i === sel))); } });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  addEventListener('keydown', e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement && document.activeElement.tagName) || '');
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); dlg.open ? dlg.close() : openCmd(); }
    else if (e.key === '/' && !typing && !dlg.open) { e.preventDefault(); openCmd(); }
    else if (e.key === 'Escape' && hdr.classList.contains('open')) { setMenu(false); mb.focus(); }
  });
})();
