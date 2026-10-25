/* ==========================================================================
   editor/editor-question.js — the question form. It is generated from the
   question type (js/types/*.js), so a new type gets an editor for free.
   ========================================================================== */
(function () {
  'use strict';
  const QZ = window.QZ;
  const { h, clone, debounce, fmt, shuffle } = QZ.util;
  const UI = QZ.ui, F = QZ.forms, E = QZ.editorData;

  const route = async (params, query, root) => {
    const t = QZ.t;
    const subject = await E.subject(params.id);
    const meta = subject.lessons.find((l) => l.id === params.lid);
    if (!meta) { root.appendChild(UI.empty('alert', t('common.notFound'))); return; }
    const questions = await E.lesson(subject.id, meta);
    const isNew = params.qid === 'new';
    const lessonHref = '#/editor/subject/' + subject.id + '/lesson/' + meta.id;

    let q;
    if (isNew) {
      const def = QZ.types.get(query.type) || QZ.types.list()[0];
      q = def.blank();
      q.id = E.newQuestionId(await E.allQuestionIds(subject));
    } else {
      const found = questions.find((x) => x.id === params.qid);
      if (!found) { root.appendChild(UI.empty('alert', t('common.notFound'), UI.btn(t('nav.back'), { variant: 'primary', href: lessonHref }))); return; }
      q = clone(found);
    }
    let dirty = false;
    const markDirty = () => { dirty = true; saveBtn.classList.add('is-dirty'); validate(); window.onbeforeunload = () => true; };
    QZ.router.onLeave(() => { window.onbeforeunload = null; });
    UI.setTitle(isNew ? t('ed.addQuestion') : t('ed.title'));

    root.appendChild(UI.backLink(lessonHref, meta.title));
    root.appendChild(UI.pageHead(isNew ? t('ed.addQuestion') : t('common.edit'), meta.title));

    const formHost = h('div', { class: 'form-stack' });
    const problemsHost = h('div', { class: 'problems', 'aria-live': 'polite' });
    const saveBtn = UI.btn(t('common.save'), { icon: 'save', variant: 'primary', onClick: () => save(false) });
    const saveNew = UI.btn(t('common.save') + ' + ' + t('ed.addQuestion'), { icon: 'plus', variant: 'soft', onClick: () => save(true) });
    const tryBtn = UI.btn(t('ed.tryIt'), { icon: 'play', variant: 'ghost', onClick: tryIt });

    root.appendChild(h('section', { class: 'card' }, formHost));
    root.appendChild(h('section', { class: 'card' }, h('h2', { class: 'card-title' }, t('ed.problems')), problemsHost));
    root.appendChild(h('div', { class: 'sticky-actions' }, saveBtn, isNew ? saveNew : null, tryBtn, UI.btn(t('common.cancel'), { variant: 'ghost', href: lessonHref })));

    function api() { return { change: markDirty, dir: subject.dir }; }

    function drawForm() {
      formHost.textContent = '';
      const def = QZ.types.get(q.type);
      /* type + id */
      const typeSel = F.select(QZ.types.list().map((d) => ({ value: d.id, label: QZ.types.label(d.id) })), q.type, async (v) => {
        if (v === q.type) return;
        if (!(await UI.confirm(t('ed.typeChangeWarn'), { okLabel: t('ed.changeType') }))) { typeSel.value = q.type; return; }
        const keep = { id: q.id, text: q.text, explanation: q.explanation, image: q.image, imageAlt: q.imageAlt, source: q.source };
        q = Object.assign(QZ.types.get(v).blank(), Object.fromEntries(Object.entries(keep).filter(([, x]) => x !== undefined)));
        markDirty(); drawForm();
      });
      formHost.appendChild(h('div', { class: 'grid-2' },
        F.field(t('ed.type'), typeSel),
        h('div', { class: 'field' }, h('div', { class: 'label' }, t('ed.qId')), h('code', { class: 'id-box' }, q.id))
      ));
      /* text */
      formHost.appendChild(F.field(t('ed.questionText'), F.textarea({ value: q.text, rows: 3, dir: subject.dir, onInput: (v) => { q.text = v; markDirty(); } })));
      /* image */
      formHost.appendChild(F.field(t('ed.image'), QZ.imageField({
        subjectId: subject.id, qid: () => q.id,
        get: () => q.image, set: (v) => { if (v) q.image = v; else { delete q.image; delete q.imageAlt; } },
        change: () => { markDirty(); drawForm(); },
      }), { optional: true }));
      if (q.image) formHost.appendChild(F.field(t('ed.imageAlt'), F.input({ value: q.imageAlt || '', dir: subject.dir, onInput: (v) => { if (v) q.imageAlt = v; else delete q.imageAlt; markDirty(); } }), { optional: true }));
      /* type-specific */
      def.fields.forEach((fd) => { if (fd.kind === 'custom') formHost.appendChild(fd.render(q, api())); });
      /* source */
      if (subject.sources.length) {
        formHost.appendChild(F.field(t('ed.qSource'), F.select([{ value: '', label: t('ed.noSource') }].concat(subject.sources.map((s) => ({ value: s.id, label: s.title }))), q.source || '', (v) => { if (v) q.source = v; else delete q.source; markDirty(); }), { optional: true }));
      }
      /* explanation */
      formHost.appendChild(F.field(t('ed.explanation'), F.textarea({ value: q.explanation || '', rows: 3, dir: subject.dir, onInput: (v) => { q.explanation = v; markDirty(); } }), { optional: true }));
      validate();
    }

    function validate() {
      const probs = QZ.types.validate(q);
      problemsHost.textContent = '';
      if (!probs.length) { problemsHost.appendChild(h('p', { class: 'hint ok' }, QZ.icon('check', 16), ' ', t('ed.noProblems'))); return; }
      problemsHost.appendChild(h('ul', { class: 'problem-list' }, probs.map((p) => h('li', { class: 'problem problem-' + p.level }, QZ.icon(p.level === 'error' ? 'alert' : 'info', 16), h('span', null, t(p.key))))));
    }

    async function save(addAnother) {
      const errors = QZ.types.validate(q).filter((p) => p.level === 'error');
      if (errors.length && !(await UI.confirm(errors.map((e) => '• ' + t(e.key)).join('\n'), { title: t('ed.problems'), okLabel: t('common.save') }))) return;
      const list = await E.lesson(subject.id, meta);
      const i = list.findIndex((x) => x.id === q.id);
      const out = clone(q);
      if (!out.explanation) delete out.explanation;
      if (i >= 0) list[i] = out; else list.push(out);
      await E.saveLesson(subject, meta, list);
      dirty = false; window.onbeforeunload = null; saveBtn.classList.remove('is-dirty');
      UI.toast(t('ed.saved'));
      if (addAnother) QZ.router.go(lessonHref.slice(1) + '/q/new?type=' + q.type);
      else QZ.router.go(lessonHref.slice(1));
    }

    /* Run the question like a student would (nothing is recorded). */
    function tryIt() {
      const def = QZ.types.get(q.type);
      const body = h('div', { class: 'q-body' });
      const fb = h('div', { class: 'feedback', hidden: true });
      const expl = h('div', { class: 'expl', hidden: true }, h('div', { class: 'expl-text', dir: 'auto', html: fmt(q.explanation || '') }));
      const card = h('article', { class: 'q-card' }, UI.typeTag(q.type));
      if (q.image) card.appendChild(h('img', { class: 'q-img', src: QZ.content.imageURL(subject.id, q.image), alt: q.imageAlt || '' }));
      card.appendChild(h('div', { class: 'q-text', dir: 'auto', html: fmt(q.text) }));
      card.appendChild(body); card.appendChild(fb); card.appendChild(expl);
      const ctx = {
        t, fmt, h, icon: QZ.icon, shuffle, setKeys() {},
        grade(ok) { fb.hidden = false; fb.className = 'feedback ' + (ok ? 'is-ok' : 'is-bad'); fb.textContent = ok ? t('quiz.correct') : t('quiz.wrong'); if (q.explanation) expl.hidden = false; },
      };
      try { def.mount(clone(q), body, ctx); } catch (e) { body.textContent = String(e.message || e); }
      let m;
      m = UI.modal({ title: t('common.preview'), wide: true, body: card, actions: [UI.btn(t('common.close'), { variant: 'primary', onClick: () => m.close() })] });
    }

    drawForm();
  };

  QZ.router.add('/editor/subject/:id/lesson/:lid/q/:qid', route, { nav: 'editor' });
})();
