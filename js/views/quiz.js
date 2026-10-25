/* ==========================================================================
   views/quiz.js — the quiz engine: runs a list of questions one by one,
   keeps the timer, saves progress, shows feedback and the results page.
   Question types plug in through QZ.types (see js/types/registry.js).
   ========================================================================== */
(function () {
  'use strict';
  const QZ = window.QZ;
  const { h, fmt, shuffle } = QZ.util;
  const UI = QZ.ui;

  let S = null; // active quiz state
  let keyHandler = null; // keyboard handler of the current question type
  let timerInt = null;

  const Q = (QZ.quiz = {
    /* Begin a quiz.  opts: {items:[wrapper], mode, subjectId, timerOn, timerSec, backHref} */
    start(opts) {
      S = {
        keys: opts.items.map((w) => w.key),
        items: opts.items,
        current: 0,
        answers: new Array(opts.items.length).fill(null),
        mode: opts.mode || 'custom',
        subjectId: opts.subjectId || null,
        timerOn: !!opts.timerOn,
        timerSec: opts.timerSec || 60,
        backHref: opts.backHref || '#/',
      };
      save();
      QZ.router.go('/quiz');
    },
    active() { return S; },
    hasSession() { const s = QZ.session.load(); return !!(s && s.keys && s.current < s.keys.length); },
    async resume() {
      const s = QZ.session.load();
      if (!s) return false;
      const items = await QZ.content.resolveKeys(s.keys);
      if (!items.length) { QZ.session.clear(); return false; }
      // keep answers aligned with items that still exist
      const idx = new Map(s.keys.map((k, i) => [k, i]));
      S = {
        keys: items.map((w) => w.key),
        items,
        current: Math.min(s.current, items.length - 1),
        answers: items.map((w) => (s.answers && s.answers[idx.get(w.key)] !== undefined ? s.answers[idx.get(w.key)] : null)),
        mode: s.mode, subjectId: s.subjectId, timerOn: s.timerOn, timerSec: s.timerSec, backHref: s.backHref || '#/',
      };
      return true;
    },
    /* Weakest questions first: wrong answers from the given subject (or all) */
    async wrongItems(subjectId) {
      const keys = QZ.progress.wrongKeys().filter((w) => !subjectId || w.subject === subjectId);
      const subjects = Array.from(new Set(keys.map((k) => k.subject)));
      const loaded = [];
      for (const s of subjects) { try { loaded.push(await QZ.content.loadSubject(s)); } catch (e) { /* subject deleted */ } }
      const byId = new Map();
      loaded.forEach((d) => d.items.forEach((w) => byId.set(w.subject + '/' + w.id, w)));
      const out = [];
      keys.forEach((k) => { const w = byId.get(k.subject + '/' + k.id); if (w) out.push({ w, n: k.n }); });
      return out;
    },
  });

  function save() {
    if (!S) return;
    QZ.session.save({ keys: S.keys, current: S.current, answers: S.answers, mode: S.mode, subjectId: S.subjectId, timerOn: S.timerOn, timerSec: S.timerSec, backHref: S.backHref });
  }
  function stopTimer() { clearInterval(timerInt); timerInt = null; }
  function detachKeys() { document.removeEventListener('keydown', onKey); keyHandler = null; }
  function onKey(e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (document.querySelector('.modal-back')) return;
    if (keyHandler) keyHandler(e);
  }

  /* ===================== The quiz page ===================== */
  QZ.router.add('/quiz', async (params, query, root) => {
    if (!S) {
      const ok = await Q.resume();
      if (!ok) { QZ.router.go('/', true); return; }
    }
    QZ.router.onLeave(() => { stopTimer(); detachKeys(); });
    if (S.current >= S.items.length) { showResults(root); return; }
    renderQuestion(root);
  });

  function renderQuestion(root) {
    stopTimer(); detachKeys();
    root.textContent = '';
    root.classList.add('page-quiz');
    const t = QZ.t;
    const w = S.items[S.current];
    const q = w.q;
    const total = S.items.length;
    const subjDir = (S.subjectCache && S.subjectCache[w.subject]) || null;

    UI.setTitle(t('quiz.question') + ' ' + (S.current + 1) + '/' + total);

    /* ----- header ----- */
    const timerBox = h('div', { class: 'timer', hidden: !S.timerOn, role: 'timer', 'aria-label': t('quiz.timeLeft') }, QZ.icon('clock', 18), h('span', { class: 'timer-val' }, String(S.timerSec)));
    const exitBtn = UI.btn(t('quiz.exit'), { icon: 'x', variant: 'ghost', small: true, onClick: exit });
    root.appendChild(h('div', { class: 'quiz-head' },
      h('div', { class: 'quiz-count' }, h('strong', null, S.current + 1), ' ', t('quiz.of'), ' ', total),
      UI.progressBar(Math.round((S.current / total) * 100), t('quiz.question')),
      timerBox, exitBtn
    ));

    /* ----- card ----- */
    const body = h('div', { class: 'q-body' });
    const fb = h('div', { class: 'feedback', hidden: true, role: 'status' });
    const expl = h('div', { class: 'expl', hidden: true }, h('div', { class: 'expl-head' }, QZ.icon('info', 18), h('span', null, t('quiz.explanation'))), h('div', { class: 'expl-text', dir: 'auto', html: fmt(q.explanation || '') }));
    const meta = h('div', { class: 'q-meta' }, UI.typeTag(q.type), h('span', { class: 'q-where' }, w.lessonTitle));
    const card = h('article', { class: 'q-card' }, meta);
    if (q.image) {
      const src = QZ.content.imageURL(w.subject, q.image);
      card.appendChild(h('button', { class: 'q-img-btn', type: 'button', 'aria-label': t('quiz.imageZoom'), onclick: () => UI.lightbox(src, q.imageAlt || '') },
        h('img', { class: 'q-img', src, alt: q.imageAlt || '', loading: 'eager' }), h('span', { class: 'zoom-hint', 'aria-hidden': 'true' }, QZ.icon('zoom', 18))));
    }
    card.appendChild(h('div', { class: 'q-text', dir: 'auto', html: fmt(q.text) }));
    card.appendChild(body);
    card.appendChild(fb);
    card.appendChild(expl);
    root.appendChild(card);

    /* ----- navigation ----- */
    const btnBack = UI.btn(t('quiz.back'), { icon: QZ.i18n.lang === 'ar' ? 'arrow-right' : 'arrow-left', variant: 'ghost', onClick: prev });
    btnBack.hidden = S.current === 0;
    const btnSkip = UI.btn(t('quiz.skip'), { icon: 'skip', variant: 'ghost', onClick: skip });
    const btnRetry = UI.btn(t('quiz.retry'), { icon: 'refresh', variant: 'soft', onClick: retry });
    btnRetry.hidden = true;
    const last = S.current === total - 1;
    const btnNext = UI.btn(last ? t('quiz.finish') : t('quiz.next'), { icon: last ? 'check' : QZ.i18n.lang === 'ar' ? 'arrow-left' : 'arrow-right', variant: 'primary', onClick: next });
    btnNext.hidden = true;
    root.appendChild(h('div', { class: 'q-nav' }, btnBack, h('div', { class: 'q-nav-spacer' }), btnSkip, btnRetry, btnNext));

    /* ----- mount the question type ----- */
    const def = QZ.types.get(q.type);
    let answered = false;
    let typeKeys = null;
    let inst = null;
    const ctx = {
      t, fmt, h, icon: QZ.icon, shuffle,
      setKeys(fn) { typeKeys = fn; },
      grade(ok) {
        if (answered) return;
        answered = true;
        stopTimer();
        timerBox.classList.remove('urgent');
        QZ.progress.record(w.subject, w.id, ok);
        S.answers[S.current] = ok;
        UI.updateReviewBadge();
        fb.hidden = false;
        fb.className = 'feedback ' + (ok ? 'is-ok' : 'is-bad');
        fb.textContent = '';
        fb.appendChild(QZ.icon(ok ? 'check' : 'x', 20));
        fb.appendChild(h('span', null, ok ? t('quiz.correct') : t('quiz.wrong')));
        if (q.explanation) expl.hidden = false;
        btnSkip.hidden = true; btnRetry.hidden = false; btnNext.hidden = false;
        save();
        btnNext.focus({ preventScroll: false });
        if (!expl.hidden) expl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      },
    };
    if (!def) {
      body.appendChild(h('div', { class: 'empty' }, QZ.icon('alert', 28), h('p', null, t('err.badType') + ': ' + q.type)));
    } else {
      try { inst = def.mount(q, body, ctx); } catch (e) { console.error(e); body.appendChild(h('div', { class: 'empty' }, QZ.icon('alert', 28), h('p', null, t('common.error')))); }
    }

    keyHandler = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (answered) {
        if (e.key === 'Enter' || e.key === 'ArrowRight' && QZ.i18n.lang === 'en' || e.key === 'ArrowLeft' && QZ.i18n.lang === 'ar') { e.preventDefault(); next(); }
        return;
      }
      if (typeKeys) typeKeys(e);
    };
    document.addEventListener('keydown', onKey);

    /* ----- timer ----- */
    if (S.timerOn) {
      let left = S.timerSec;
      const val = timerBox.querySelector('.timer-val');
      timerInt = setInterval(() => {
        left--;
        val.textContent = String(Math.max(left, 0));
        if (left <= 10) timerBox.classList.add('urgent');
        if (left <= 0) {
          stopTimer();
          UI.toast(t('quiz.timeUp'), 'error');
          if (inst && inst.timeout) inst.timeout();
        }
      }, 1000);
    }

    /* ----- actions ----- */
    function next() { S.current++; save(); if (S.current >= S.items.length) { QZ.session.clear(); } rerender(); }
    function skip() { S.answers[S.current] = null; next(); }
    function prev() { if (S.current <= 0) return; S.answers[S.current] = null; S.current--; S.answers[S.current] = null; save(); rerender(); }
    function retry() { S.answers[S.current] = null; save(); rerender(); UI.toast(t('quiz.retry')); }
    async function exit() {
      const ok = await UI.confirm(t('quiz.exitConfirm'), { okLabel: t('quiz.exit') });
      if (!ok) return;
      QZ.router.go(S.backHref.replace(/^#/, '') || '/');
    }
    function rerender() { root.className = 'page'; if (S.current >= S.items.length) showResults(root); else renderQuestion(root); window.scrollTo(0, 0); }
  }

  /* ===================== Results ===================== */
  function showResults(root) {
    stopTimer(); detachKeys();
    QZ.session.clear();
    root.textContent = '';
    root.classList.remove('page-quiz');
    const t = QZ.t;
    const a = S.answers;
    const total = a.length;
    const cor = a.filter((x) => x === true).length;
    const wrong = a.filter((x) => x === false).length;
    const skipped = a.filter((x) => x === null).length;
    const pct = total ? Math.round((cor / total) * 100) : 0;
    let msg, sub, stars;
    if (pct >= 90) { msg = t('res.excellent'); sub = t('res.excellentSub'); stars = 3; }
    else if (pct >= 70) { msg = t('res.good'); sub = t('res.goodSub'); stars = 2; }
    else if (pct >= 50) { msg = t('res.keep'); sub = t('res.keepSub'); stars = 1; }
    else { msg = t('res.more'); sub = t('res.moreSub'); stars = 0; }
    UI.setTitle(t('res.title'));

    const byType = {};
    S.items.forEach((w, i) => { const k = w.q.type; (byType[k] = byType[k] || { t: 0, c: 0 }); byType[k].t++; if (a[i] === true) byType[k].c++; });

    const wrongItems = S.items.filter((w, i) => a[i] === false);
    root.appendChild(h('section', { class: 'res-hero' },
      h('div', { class: 'res-ring', style: { '--pct': pct } }, h('div', { class: 'res-score' }, pct + '%')),
      UI.stars(stars),
      h('h1', { class: 'res-msg' }, msg),
      h('p', { class: 'res-sub' }, sub),
      h('p', { class: 'res-detail' }, t('res.outOf', { c: cor, t: total, s: skipped })),
      h('div', { class: 'res-actions' },
        UI.btn(t('res.retrySame'), { icon: 'refresh', variant: 'primary', onClick: () => Q.start({ items: shuffle(S.items), mode: S.mode, subjectId: S.subjectId, timerOn: S.timerOn, timerSec: S.timerSec, backHref: S.backHref }) }),
        wrongItems.length ? UI.btn(t('res.reviewMistakes') + ' (' + wrongItems.length + ')', { icon: 'target', variant: 'soft', onClick: () => Q.start({ items: wrongItems, mode: 'review', subjectId: S.subjectId, timerOn: false, timerSec: S.timerSec, backHref: S.backHref }) }) : null,
        UI.btn(S.subjectId ? t('res.backSubject') : t('res.backHome'), { icon: 'home', variant: 'ghost', href: S.backHref })
      )
    ));
    root.appendChild(h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, t('res.byType')),
      h('div', { class: 'bk' }, Object.entries(byType).map(([type, d]) =>
        h('div', { class: 'bk-row' }, UI.typeTag(type), UI.progressBar(QZ.util.pct(d.c, d.t), QZ.types.label(type)), h('span', { class: 'bk-cnt' }, d.c + '/' + d.t))
      ))
    ));
    UI.updateReviewBadge();
  }
})();
