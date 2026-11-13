/* Interface hors 3D : chargement, navigation, apparitions, compteurs, copie de l'adresse.
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

  /* ---------- écran de chargement : s'efface quand la 3D a rendu sa première image ---------- */
  const boot = $('#boot'); const t0 = performance.now(); let lifted = false;
  function lift() {
    if (lifted) return; lifted = true;
    const go = () => { window.__introEnd = performance.now() + 100; root.classList.add('ready'); setTimeout(() => boot && boot.remove(), 1200); };
    if (reduce || !boot) return go();
    boot.classList.add('done');
    setTimeout(go, Math.max(340, 800 - (performance.now() - t0)));
  }
  addEventListener('app-ready', lift);
  addEventListener('error', e => { if (/app\.js|three/.test((e && e.filename) || '')) lift(); });
  setTimeout(lift, 7000);            // la page reste lisible même si la 3D ne démarre pas
  if (reduce) lift();

  /* ---------- apparitions ---------- */
  const revealEls = $$('.rv, h2.disp');
  if (!reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(el => io.observe(el));
  } else revealEls.forEach(el => el.classList.add('in'));
  addEventListener('beforeprint', () => revealEls.forEach(el => el.classList.add('in')));

  /* ---------- le paragraphe lu est net, les autres s'effacent ---------- */
  const beats = $$('.beat');
  addEventListener('beat', e => beats.forEach(b => b.classList.toggle('live', b.dataset.beat === e.detail)));

  /* ---------- navigation et progression ---------- */
  const bar = $('#progress'), hdr = $('header.nav');
  const links = $$('.nav ul a'), targets = links.map(a => $(a.getAttribute('href')));
  function onScroll() {
    const h = root.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`;
    hdr.classList.toggle('scrolled', scrollY > 8);
    let on = -1; targets.forEach((t, i) => { if (t && t.getBoundingClientRect().top < innerHeight * .45) on = i; });
    links.forEach((a, i) => { if (i === on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
  }
  let tick = false;
  addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(() => { tick = false; onScroll(); }); } }, { passive: true });
  addEventListener('resize', onScroll); onScroll();

  /* ---------- compteurs : les chiffres clés comptent à leur première apparition ---------- */
  if (!reduce && 'IntersectionObserver' in window) {
    const nums = $$('.stats .big, .kpi .v').filter(el => /^\d/.test((el.firstChild && el.firstChild.textContent) || ''));
    const io3 = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return; io3.unobserve(e.target);
      const tn = e.target.firstChild, raw = tn.textContent, end = parseFloat(raw.replace(',', '.')), start = performance.now(), d = 1400, year = end >= 1000 && end < 3000;
      const step = t => { const k = Math.min(1, (t - start) / d), q = 1 - Math.pow(1 - k, 4); tn.textContent = String(Math.round(year ? 2000 + (end - 2000) * q : end * q)); if (k < 1) requestAnimationFrame(step); else tn.textContent = raw; };
      requestAnimationFrame(step);
    }), { threshold: .6 });
    nums.forEach(n => io3.observe(n));
  }

  /* ---------- menu mobile ---------- */
  const mb = $('#menuBtn');
  const setMenu = o => { hdr.classList.toggle('open', o); mb.setAttribute('aria-expanded', String(o)); mb.setAttribute('aria-label', o ? 'Fermer le menu' : 'Menu'); };
  mb.addEventListener('click', () => setMenu(!hdr.classList.contains('open')));
  $$('nav a', hdr).forEach(a => a.addEventListener('click', () => setMenu(false)));
  addEventListener('keydown', e => { if (e.key === 'Escape' && hdr.classList.contains('open')) { setMenu(false); mb.focus(); } });
  matchMedia('(min-width:821px)').addEventListener('change', e => { if (e.matches) setMenu(false); });

  /* ---------- copie de l'adresse ---------- */
  const mail = $('#mail'), copyStatus = $('#copyStatus');
  $$('[data-copy]').forEach(btn => btn.addEventListener('click', () => {
    const ok = () => { toast('Adresse e-mail copiée'); if (copyStatus) copyStatus.textContent = 'Adresse e-mail copiée'; btn.textContent = 'Copié'; setTimeout(() => { btn.textContent = 'Copier'; if (copyStatus) copyStatus.textContent = ''; }, 1800); };
    const fallback = () => { const r = document.createRange(); r.selectNodeContents(mail); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Adresse sélectionnée : Ctrl + C pour la copier'); };
    try { navigator.clipboard.writeText(mail.textContent.trim()).then(ok, fallback); } catch (e) { fallback(); }
  }));
  $('#printBtn').addEventListener('click', () => print());
})();
