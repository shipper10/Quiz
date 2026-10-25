/* ==========================================================================
   editor/editor-subject.js — edit a subject (info, sources, lessons) and a
   lesson (its question list, JSON import, raw JSON).
   ========================================================================== */
(function () {
  'use strict';
  const QZ = window.QZ;
  const { h, debounce, clone, truncate } = QZ.util;
  const UI = QZ.ui, F = QZ.forms, E = QZ.editorData;
  const COLORS = ['green', 'blue', 'purple', 'amber', 'rose', 'teal', 'slate'];

  /* ======================= Subject ======================= */
  QZ.router.add('/editor/subject/:id', async (params, query, root) => {
    const t = QZ.t;
    const subject = await E.subject(params.id);
    UI.setTitle(subject.title);
    const save = debounce(() => E.saveSubject(subject), 400);
    const dirAttr = subject.dir === 'rtl' ? 'rtl' : 'ltr';

    root.appendChild(UI.backLink('#/editor', t('ed.title')));
    root.appendChild(UI.pageHead(subject.title, null, [UI.btn(t('common.preview'), { icon: 'eye', variant: 'soft', href: '#/subject/' + subject.id })]));

    /* ----- info ----- */
    root.appendChild(h('section', { class: 'card form-stack' },
      h('h2', { class: 'card-title' }, t('ed.subjectInfo')),
      F.field(t('ed.subjectName'), F.input({ value: subject.title, onInput: (v) => { subject.title = v; save(); } })),
      h('div', { class: 'grid-2' },
        F.field(t('ed.subtitle'), F.input({ value: subject.subtitle, optional: true, onInput: (v) => { subject.subtitle = v; save(); } }), { optional: true }),
        F.field(t('ed.color'), F.select(COLORS.map((c) => ({ value: c, label: c })), subject.color || 'green', (v) => { subject.color = v; save(); }))
      ),
      F.field(t('ed.description'), F.textarea({ value: subject.description, rows: 2, onInput: (v) => { subject.description = v; save(); } }), { optional: true }),
      F.field(t('ed.dir'), F.segmented('subj-dir', [{ value: 'ltr', label: t('ed.ltr') }, { value: 'rtl', label: t('ed.rtl') }], dirAttr, (v) => { subject.dir = v; subject.lang = v === 'rtl' ? 'ar' : 'en'; save(); }))
    ));

    /* ----- sources ----- */
    const srcHost = h('section', { class: 'card form-stack' });
    const drawSources = () => {
      srcHost.textContent = '';
      srcHost.appendChild(h('h2', { class: 'card-title' }, t('ed.sources')));
      subject.sources.forEach((s, i) => srcHost.appendChild(h('div', { class: 'row-card' },
        h('span', { class: 'row-num' }, i + 1),
        h('div', { class: 'row-main' }, F.input({ value: s.title, ariaLabel: t('ed.sourceName'), placeholder: t('ed.sourceName'), onInput: (v) => { s.title = v; save(); } }), h('code', { class: 'hint' }, s.id)),
        F.rowControls({ onRemove: async () => { if (!(await UI.confirm(t('ed.deleteConfirm'), { danger: true, okLabel: t('common.delete') }))) return; subject.sources.splice(i, 1); await E.saveSubject(subject); drawSources(); } })
      )));
      srcHost.appendChild(UI.btn(t('ed.addSource'), { icon: 'plus', variant: 'soft', small: true, onClick: async () => {
        const name = await UI.prompt(t('ed.sourceName'), '');
        if (!name) return;
        let id = QZ.util.asciiSlug(name, 'source'); const used = new Set(subject.sources.map((s) => s.id)); let n = 2; const base = id;
        while (used.has(id)) id = base + '-' + n++;
        subject.sources.push({ id, title: name });
        await E.saveSubject(subject); drawSources();
      } }));
    };
    drawSources();
    root.appendChild(srcHost);

    /* ----- lessons ----- */
    const lessonsHost = h('section', { class: 'card' });
    const drawLessons = () => {
      lessonsHost.textContent = '';
      lessonsHost.appendChild(h('h2', { class: 'card-title' }, t('ed.lessons')));
      const list = h('div', { class: 'row-list' });
      subject.lessons.forEach((l, i) => list.appendChild(h('div', { class: 'row-card' },
        h('span', { class: 'row-num' }, i + 1),
        h('a', { class: 'row-main row-link', href: '#/editor/subject/' + subject.id + '/lesson/' + l.id, dir: 'auto' }, h('strong', null, l.title), h('span', { class: 'hint' }, t('ed.qCount', { n: l.count || 0 }))),
        F.rowControls({
          onUp: i > 0 ? async () => { F.moveItem(subject.lessons, i, -1); await E.saveSubject(subject); drawLessons(); } : null,
          onDown: i < subject.lessons.length - 1 ? async () => { F.moveItem(subject.lessons, i, 1); await E.saveSubject(subject); drawLessons(); } : null,
          onRemove: async () => { if (await UI.confirm(t('ed.deleteLesson'), { danger: true, okLabel: t('common.delete') })) { await E.deleteLesson(subject, l); drawLessons(); } },
        })
      )));
      lessonsHost.appendChild(list);
      lessonsHost.appendChild(UI.btn(t('ed.addLesson'), { icon: 'plus', variant: 'primary', onClick: async () => {
        const name = await UI.prompt(t('ed.lessonName'), '');
        if (!name) return;
        const meta = await E.addLesson(subject, name);
        QZ.router.go('/editor/subject/' + subject.id + '/lesson/' + meta.id);
      } }));
    };
    drawLessons();
    root.appendChild(lessonsHost);
  }, { nav: 'editor' });

  /* ======================= Lesson ======================= */
  QZ.router.add('/editor/subject/:id/lesson/:lid', async (params, query, root) => {
    const t = QZ.t;
    const subject = await E.subject(params.id);
    const meta = subject.lessons.find((l) => l.id === params.lid);
    if (!meta) { root.appendChild(UI.empty('alert', t('common.notFound'))); return; }
    UI.setTitle(meta.title);
    let questions = await E.lesson(subject.id, meta);
    const saveMeta = debounce(() => E.saveSubject(subject), 400);
    const persistQs = async () => { await E.saveLesson(subject, meta, questions); };

    root.appendChild(UI.backLink('#/editor/subject/' + subject.id, subject.title));
    root.appendChild(UI.pageHead(meta.title));

    root.appendChild(h('section', { class: 'card form-stack' },
      F.field(t('ed.lessonName'), F.input({ value: meta.title, onInput: (v) => { meta.title = v; saveMeta(); } })),
      F.field(t('ed.lessonSummary'), F.textarea({ value: meta.summary || '', rows: 3, dir: subject.dir, onInput: (v) => { meta.summary = v; saveMeta(); } }), { optional: true }),
      subject.sources.length ? F.field(t('ed.lessonSource'), F.select([{ value: '', label: t('ed.noSource') }].concat(subject.sources.map((s) => ({ value: s.id, label: s.title }))), meta.source || '', (v) => { meta.source = v; saveMeta(); })) : null
    ));

    const listHost = h('div', { class: 'q-list' });
    const toolbar = h('div', { class: 'toolbar' },
      UI.btn(t('ed.addQuestion'), { icon: 'plus', variant: 'primary', onClick: chooseType }),
      UI.btn(t('ed.importJson'), { icon: 'upload', variant: 'soft', onClick: importDialog }),
      UI.btn(t('ed.rawJson'), { icon: 'code', variant: 'ghost', onClick: rawDialog })
    );
    const problemsBar = h('p', { class: 'note note-warn', hidden: true });
    root.appendChild(h('h2', { class: 'section-title' }, t('ed.questionsOf') + ' (' + questions.length + ')'));
    root.appendChild(toolbar);
    root.appendChild(problemsBar);
    root.appendChild(listHost);

    const base = '#/editor/subject/' + subject.id + '/lesson/' + meta.id + '/q/';
    function draw() {
      listHost.textContent = '';
      let bad = 0;
      questions.forEach((q, i) => {
        const probs = QZ.types.validate(q).filter((p) => p.level === 'error');
        if (probs.length) bad++;
        listHost.appendChild(h('div', { class: 'row-card q-row' + (probs.length ? ' has-problem' : '') },
          h('span', { class: 'row-num' }, i + 1),
          h('a', { class: 'row-main row-link', href: base + encodeURIComponent(q.id), dir: 'auto' },
            h('div', { class: 'q-row-top' }, UI.typeTag(q.type), q.image ? QZ.icon('image', 16) : null, probs.length ? h('span', { class: 'pill pill-no', title: probs.map((p) => t(p.key)).join('\n') }, QZ.icon('alert', 14), probs.length) : null),
            h('div', { class: 'q-row-text' }, truncate(q.text || '—', 120))),
          F.rowControls({
            onUp: i > 0 ? async () => { F.moveItem(questions, i, -1); await persistQs(); draw(); } : null,
            onDown: i < questions.length - 1 ? async () => { F.moveItem(questions, i, 1); await persistQs(); draw(); } : null,
          }),
          h('div', { class: 'row-ctl' },
            UI.iconBtn('copy', t('common.duplicate'), async () => { const c = clone(q); c.id = E.newQuestionId(questions.map((x) => x.id)); questions.splice(i + 1, 0, c); await persistQs(); draw(); UI.toast(t('ed.saved')); }, 'icon-btn-sm'),
            UI.iconBtn('trash', t('common.delete'), async () => { if (await UI.confirm(t('ed.deleteQ'), { danger: true, okLabel: t('common.delete') })) { questions.splice(i, 1); await persistQs(); draw(); } }, 'icon-btn-sm danger')
          )
        ));
      });
      problemsBar.hidden = !bad;
      problemsBar.textContent = bad ? t('ed.problemsIn', { n: bad }) : '';
      if (!questions.length) listHost.appendChild(UI.empty('list', t('ed.addQuestion')));
    }
    draw();

    /* ---- new question: choose a type ---- */
    function chooseType() {
      let m;
      const body = h('div', { class: 'type-grid' }, QZ.types.list().map((d) =>
        h('button', { type: 'button', class: 'type-card', onclick: () => { m.close(); QZ.router.go('/editor/subject/' + subject.id + '/lesson/' + meta.id + '/q/new?type=' + d.id); } }, UI.typeTag(d.id))
      ));
      m = UI.modal({ title: t('ed.chooseType'), body, actions: [UI.btn(t('common.cancel'), { variant: 'ghost', onClick: () => m.close() })] });
    }

    /* ---- import JSON ---- */
    function importDialog() {
      const ta = F.textarea({ rows: 12, dir: 'ltr', placeholder: '[ { "type": "mcq", … }, … ]' });
      ta.classList.add('mono');
      const msg = h('p', { class: 'hint', 'aria-live': 'polite' });
      let m;
      const copyGuide = UI.btn(t('common.copy') + ' — AI format guide', { icon: 'copy', variant: 'soft', small: true, onClick: async () => { try { await navigator.clipboard.writeText(E.formatGuide()); UI.toast(t('common.done')); } catch (e) { ta.value = E.formatGuide(); } } });
      const go = UI.btn(t('ed.importDo'), { icon: 'check', variant: 'primary', onClick: async () => {
        let data;
        try { data = JSON.parse(ta.value); } catch (e) { msg.textContent = t('ed.importBad', { e: e.message }); return; }
        const arr = Array.isArray(data) ? data : data && Array.isArray(data.questions) ? data.questions : null;
        if (!arr) { msg.textContent = t('ed.importBad', { e: 'array expected' }); return; }
        const used = new Set(await E.allQuestionIds(subject));
        let added = 0, skipped = 0;
        for (const q of arr) {
          if (!q || typeof q !== 'object') { skipped++; continue; }
          if (!q.id) q.id = E.newQuestionId(Array.from(used));
          if (used.has(q.id)) { skipped++; continue; }
          if (QZ.types.hasErrors(q)) { skipped++; continue; }
          used.add(q.id); questions.push(q); added++;
        }
        if (added) { await persistQs(); draw(); }
        UI.toast(t('ed.importOk', { n: added }) + (skipped ? ' · ' + t('ed.importSkipped', { n: skipped }) : ''), skipped && !added ? 'error' : null);
        if (added) m.close(); else msg.textContent = t('ed.importSkipped', { n: skipped });
      } });
      m = UI.modal({ title: t('ed.importJson'), wide: true, body: h('div', { class: 'form-stack' }, h('p', { class: 'hint' }, t('ed.importHint')), copyGuide, ta, msg), actions: [UI.btn(t('common.cancel'), { variant: 'ghost', onClick: () => m.close() }), go] });
    }

    /* ---- raw JSON of the whole lesson ---- */
    function rawDialog() {
      const ta = F.textarea({ rows: 18, dir: 'ltr', value: JSON.stringify({ questions }, null, 2) });
      ta.classList.add('mono');
      const msg = h('p', { class: 'hint', 'aria-live': 'polite' });
      let m;
      const go = UI.btn(t('common.save'), { icon: 'save', variant: 'primary', onClick: async () => {
        try {
          const d = JSON.parse(ta.value);
          const arr = Array.isArray(d) ? d : d.questions;
          if (!Array.isArray(arr) || arr.some((q) => !q || !q.id || !q.type)) throw new Error('every question needs "id" and "type"');
          if (new Set(arr.map((q) => q.id)).size !== arr.length) throw new Error(t('err.dupId'));
          questions = arr;
          await persistQs(); draw(); m.close(); UI.toast(t('ed.saved'));
        } catch (e) { msg.textContent = t('ed.importBad', { e: e.message }); }
      } });
      m = UI.modal({ title: t('ed.rawJson'), wide: true, body: h('div', { class: 'form-stack' }, h('p', { class: 'hint' }, t('ed.rawHint')), ta, msg), actions: [UI.btn(t('common.cancel'), { variant: 'ghost', onClick: () => m.close() }), go], persistent: true });
    }
  }, { nav: 'editor' });
})();
