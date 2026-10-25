/* ==========================================================================
   views/subject.js — a subject: lesson list + quiz builder (lessons, types,
   sources, count, timer).
   ========================================================================== */
(function () {
  'use strict';
  const QZ = window.QZ;
  const { h, shuffle, pct } = QZ.util;
  const UI = QZ.ui, F = QZ.forms;

  QZ.router.add('/subject/:id', async (params, query, root) => {
    const t = QZ.t;
    let data;
    try { data = await QZ.content.loadSubject(params.id); }
    catch (e) { root.appendChild(UI.empty('alert', t('common.notFound'), UI.btn(t('nav.home'), { variant: 'primary', icon: 'home', href: '#/' }))); return; }
    const { subject, lessons, items } = data;
    UI.setTitle(subject.title);

    root.appendChild(UI.backLink('#/', t('nav.home')));
    root.appendChild(h('div', { class: 'subject-head color-' + subject.color },
      h('div', { class: 'sh-text' },
        h('h1', { class: 'page-title', dir: 'auto' }, subject.title),
        subject.subtitle ? h('div', { class: 'sh-sub', dir: 'auto' }, subject.subtitle) : null,
        subject.description ? h('p', { class: 'page-sub', dir: 'auto' }, subject.description) : null
      ),
      h('div', { class: 'sh-actions' },
        UI.btn(t('subject.browse'), { icon: 'list', variant: 'soft', href: '#/subject/' + subject.id + '/browse' }),
        UI.btn(t('subject.review'), { icon: 'refresh', variant: 'soft', href: '#/review?subject=' + subject.id }),
        QZ.editorMode.on() ? UI.btn(t('nav.editor'), { icon: 'edit', variant: 'ghost', href: '#/editor/subject/' + subject.id }) : null
      )
    ));

    if (!lessons.length) { root.appendChild(UI.empty('folder', t('subject.noLessons'))); return; }

    /* ---------- builder state ---------- */
    const typesPresent = QZ.types.ids().filter((id) => items.some((w) => w.q.type === id));
    items.forEach((w) => { if (typesPresent.indexOf(w.q.type) < 0) typesPresent.push(w.q.type); });
    const sourceIds = Array.from(new Set(items.map((w) => w.source).filter(Boolean)));
    const sel = {
      lessons: new Set(lessons.map((l) => l.meta.id)),
      types: new Set(typesPresent),
      sources: new Set(sourceIds),
      count: 20, skipCorrect: false, timerOn: false, timerSec: 60,
    };
    const countInfo = h('div', { class: 'builder-count', 'aria-live': 'polite' });

    const pool = () => items.filter((w) =>
      sel.lessons.has(w.lesson) && sel.types.has(w.q.type) && (!sourceIds.length || !w.source || sel.sources.has(w.source)));
    const refreshCount = () => { countInfo.textContent = t('subject.available', { n: pool().length }); };

    const chips = (labelText, list, set, onChange) => {
      const wrap = h('div', { class: 'chip-grp' });
      list.forEach((o) => {
        const b = h('button', { type: 'button', class: 'chip' + (set.has(o.id) ? ' is-on' : ''), 'aria-pressed': String(set.has(o.id)), onclick: () => {
          if (set.has(o.id)) set.delete(o.id); else set.add(o.id);
          b.classList.toggle('is-on', set.has(o.id)); b.setAttribute('aria-pressed', String(set.has(o.id)));
          onChange(); refreshCount();
        } }, o.label);
        wrap.appendChild(b);
      });
      return h('div', { class: 'b-sec', role: 'group', 'aria-label': labelText }, h('div', { class: 'b-lbl' }, labelText), wrap);
    };

    /* ---------- builder UI ---------- */
    const builder = h('section', { class: 'card builder' }, h('h2', { class: 'card-title' }, t('subject.start')));
    builder.appendChild(chips(t('subject.selectLessons'), lessons.map((l) => ({ id: l.meta.id, label: l.meta.title })), sel.lessons, () => {}));
    builder.appendChild(chips(t('subject.types'), typesPresent.map((id) => ({ id, label: QZ.types.label(id) })), sel.types, () => {}));
    if (sourceIds.length > 1) builder.appendChild(chips(t('subject.sources'), sourceIds.map((id) => ({ id, label: QZ.content.sourceTitle(subject, id) || id })), sel.sources, () => {}));

    const countSel = F.select([10, 20, 30, 50, 100, 0].map((n) => ({ value: n, label: n ? String(n) : t('subject.allQuestions') })), sel.count, (v) => { sel.count = +v; });
    const timerSecIn = F.input({ type: 'number', value: sel.timerSec, min: 5, max: 600, onInput: (v) => { sel.timerSec = Math.max(5, Math.min(600, +v || 60)); } });
    timerSecIn.disabled = true;
    timerSecIn.classList.add('input-sm');
    builder.appendChild(h('div', { class: 'b-sec' },
      h('div', { class: 'b-lbl' }, t('subject.options')),
      h('div', { class: 'b-opts' },
        F.field(t('subject.count'), countSel),
        F.checkbox(t('subject.skipCorrect'), false, (v) => { sel.skipCorrect = v; }),
        F.checkbox(t('subject.timer'), false, (v) => { sel.timerOn = v; timerSecIn.disabled = !v; }),
        F.field(t('subject.seconds'), timerSecIn)
      )
    ));

    const start = (list, mode) => {
      let qs = list;
      if (sel.skipCorrect) {
        const f = qs.filter((w) => { const p = QZ.progress.get(w.subject, w.id); return !p || !p.c; });
        if (f.length) qs = f; else UI.toast(t('subject.allCorrect'));
      }
      if (!qs.length) { UI.toast(t('subject.noQuestions'), 'error'); return; }
      qs = shuffle(qs);
      if (mode === 'custom' && sel.count > 0) qs = qs.slice(0, sel.count);
      QZ.quiz.start({ items: qs, mode, subjectId: subject.id, timerOn: sel.timerOn, timerSec: sel.timerSec, backHref: '#/subject/' + subject.id });
    };

    builder.appendChild(h('div', { class: 'builder-foot' }, countInfo,
      UI.btn(t('subject.start'), { icon: 'play', variant: 'primary', onClick: () => {
        if (!sel.lessons.size) return UI.toast(t('subject.pickLesson'), 'error');
        if (!sel.types.size) return UI.toast(t('subject.pickType'), 'error');
        start(pool(), 'custom');
      } })));
    refreshCount();
    root.appendChild(builder);

    /* ---------- lessons ---------- */
    root.appendChild(h('h2', { class: 'section-title' }, t('subject.lessons')));
    const grid = h('div', { class: 'lesson-grid' });
    lessons.forEach((l, i) => {
      const st = QZ.progress.stats(l.items);
      const stars = QZ.progress.stars(l.items);
      const p = pct(st.answered, st.total);
      grid.appendChild(h('article', { class: 'lesson-card' },
        h('div', { class: 'lc-top' }, h('span', { class: 'lc-num' }, i + 1), stars ? UI.stars(stars) : null),
        h('h3', { class: 'lc-title', dir: 'auto' }, l.meta.title),
        l.meta.summary ? h('details', { class: 'lc-sum' }, h('summary', null, t('subject.summary')), h('p', { dir: 'auto' }, l.meta.summary)) : null,
        UI.progressBar(p, l.meta.title),
        h('div', { class: 'lc-stats' }, h('span', null, t('subject.done', { a: st.answered, t: st.total })), h('span', null, st.answered ? pct(st.correct, st.answered) + '%' : '—')),
        l.error ? h('p', { class: 'hint hint-err' }, String(l.error.message || l.error)) : null,
        UI.btn(t('subject.startLesson'), { icon: 'play', variant: 'soft', small: true, disabled: !l.items.length, onClick: () => start(l.items.filter((w) => sel.types.has(w.q.type) && (!sourceIds.length || !w.source || sel.sources.has(w.source))), 'lesson') })
      ));
    });
    root.appendChild(grid);
  });
})();
