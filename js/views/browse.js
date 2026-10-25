/* ==========================================================================
   views/browse.js — search and read all questions of a subject.
   ========================================================================== */
(function () {
  'use strict';
  const QZ = window.QZ;
  const { h, fmt, plain, debounce } = Object.assign({}, QZ.util, { plain: QZ.util.plain });
  const UI = QZ.ui, F = QZ.forms;
  const PAGE = 40;

  QZ.router.add('/subject/:id/browse', async (params, query, root) => {
    const t = QZ.t;
    const { subject, lessons, items } = await QZ.content.loadSubject(params.id);
    UI.setTitle(t('browse.title') + ' — ' + subject.title);
    root.appendChild(UI.backLink('#/subject/' + subject.id, subject.title));
    root.appendChild(UI.pageHead(t('browse.title'), subject.title));

    const f = { q: '', lesson: '', type: '', source: '', status: '' };
    const sources = Array.from(new Set(items.map((w) => w.source).filter(Boolean)));
    const types = Array.from(new Set(items.map((w) => w.q.type)));
    const opt = (v, l) => ({ value: v, label: l });

    const count = h('div', { class: 'br-count', 'aria-live': 'polite' });
    const list = h('div', { class: 'br-list' });
    const more = h('div', { class: 'br-more' });

    const search = F.input({ placeholder: t('browse.search'), ariaLabel: t('common.search'), onInput: debounce((v) => { f.q = v.toLowerCase().trim(); draw(); }, 200) });
    const filters = h('div', { class: 'filters' },
      F.field(t('browse.lesson'), F.select([opt('', t('common.all'))].concat(lessons.map((l) => opt(l.meta.id, l.meta.title))), '', (v) => { f.lesson = v; draw(); })),
      F.field(t('browse.type'), F.select([opt('', t('common.all'))].concat(types.map((id) => opt(id, QZ.types.label(id)))), '', (v) => { f.type = v; draw(); })),
      sources.length > 1 ? F.field(t('browse.source'), F.select([opt('', t('common.all'))].concat(sources.map((id) => opt(id, QZ.content.sourceTitle(subject, id) || id))), '', (v) => { f.source = v; draw(); })) : null,
      F.field(t('browse.status'), F.select([opt('', t('common.all')), opt('unseen', t('browse.unseen')), opt('correct', t('browse.correct')), opt('wrong', t('browse.wrong'))], '', (v) => { f.status = v; draw(); }))
    );
    root.appendChild(h('div', { class: 'card' }, F.field(null, search), filters));
    root.appendChild(count);
    root.appendChild(list);
    root.appendChild(more);

    function matches(w) {
      if (f.lesson && w.lesson !== f.lesson) return false;
      if (f.type && w.q.type !== f.type) return false;
      if (f.source && w.source !== f.source) return false;
      if (f.status) {
        const p = QZ.progress.get(w.subject, w.id);
        if (f.status === 'unseen' && p) return false;
        if (f.status === 'correct' && !(p && p.c)) return false;
        if (f.status === 'wrong' && !(p && !p.c)) return false;
      }
      if (f.q) {
        const hay = (plain(w.q.text) + ' ' + plain(w.q.explanation || '') + ' ' + plain(w.q.answer || '')).toLowerCase();
        if (hay.indexOf(f.q) < 0) return false;
      }
      return true;
    }

    let shown = PAGE, filtered = [];
    function draw() {
      filtered = items.filter(matches);
      shown = PAGE;
      count.textContent = t('browse.found', { n: filtered.length });
      list.textContent = '';
      more.textContent = '';
      if (!filtered.length) { list.appendChild(UI.empty('search', t('browse.none'))); return; }
      page();
    }
    function page() {
      const slice = filtered.slice(list.children.length, shown);
      slice.forEach((w) => list.appendChild(row(w)));
      more.textContent = '';
      if (shown < filtered.length) more.appendChild(UI.btn(t('common.more') + ' (' + (filtered.length - shown) + ')', { variant: 'soft', onClick: () => { shown += PAGE; page(); } }));
    }

    function row(w) {
      const q = w.q;
      const p = QZ.progress.get(w.subject, w.id);
      const status = !p ? h('span', { class: 'status status-none', title: t('browse.unseen') }, '○') : p.c ? h('span', { class: 'status status-ok', title: t('browse.correct') }, '✓') : h('span', { class: 'status status-no', title: t('browse.wrong') }, '✗');
      const detail = h('div', { class: 'br-detail', hidden: true });
      const btn = h('button', { type: 'button', class: 'br-head', 'aria-expanded': 'false', onclick: () => {
        const open = detail.hidden;
        if (open && !detail.firstChild) fillDetail();
        detail.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
        wrap.classList.toggle('is-open', open);
      } },
        h('div', { class: 'br-top' }, UI.typeTag(q.type), status, p && p.n > 1 ? h('span', { class: 'br-n' }, '×' + p.n) : null, h('span', { class: 'br-lesson' }, w.lessonTitle), QZ.icon('chevron-down', 18)),
        h('div', { class: 'br-text', dir: 'auto' }, QZ.util.truncate(q.text, 160))
      );
      const wrap = h('article', { class: 'br-row' }, btn, detail);
      function fillDetail() {
        const def = QZ.types.get(q.type);
        if (q.image) detail.appendChild(h('img', { class: 'br-img', src: QZ.content.imageURL(w.subject, q.image), alt: q.imageAlt || '', loading: 'lazy' }));
        detail.appendChild(h('div', { class: 'br-full', dir: 'auto', html: fmt(q.text) }));
        if (def) { try { detail.appendChild(def.view(q, {})); } catch (e) { /* malformed question */ } }
        if (q.explanation) detail.appendChild(h('div', { class: 'expl' }, h('div', { class: 'expl-head' }, QZ.icon('info', 18), h('span', null, t('browse.note'))), h('div', { class: 'expl-text', dir: 'auto', html: fmt(q.explanation) })));
        detail.appendChild(h('div', { class: 'br-actions' }, UI.btn(t('browse.editQ'), { icon: 'edit', variant: 'ghost', small: true, href: '#/editor/subject/' + w.subject + '/lesson/' + w.lesson + '/q/' + encodeURIComponent(w.id) })));
      }
      return wrap;
    }
    draw();
  });
})();
