/* ==========================================================================
   editor/data.js — read / change / save the content files as drafts.
   Every save writes a draft (browser only) and refreshes the reader cache.
   ========================================================================== */
(function () {
  'use strict';
  const QZ = window.QZ;
  const { clone, uid } = QZ.util;
  const C = QZ.content;

  const E = (QZ.editorData = {
    async loadJSON(path, fallback) {
      try { return clone(await C.json(path)); }
      catch (e) { if (fallback !== undefined) return clone(fallback); throw e; }
    },
    async saveJSON(path, obj) {
      await QZ.drafts.putJSON(path, obj);
      C.invalidate(path);
      QZ.ui.refreshDraftBadge && QZ.ui.refreshDraftBadge();
    },

    /* ----- catalog ----- */
    catalog() { return E.loadJSON(C.catalogPath(), { title: '', years: [] }); },
    saveCatalog(c) { return E.saveJSON(C.catalogPath(), c); },

    /* ----- subject (raw JSON, as in the file) ----- */
    async subject(id) {
      const s = await E.loadJSON(C.subjectPath(id));
      s.id = s.id || id;
      s.sources = s.sources || [];
      s.lessons = s.lessons || [];
      return s;
    },
    saveSubject(s) { return E.saveJSON(C.subjectPath(s.id), s); },

    async createSubject(id, title) {
      const s = { id, title, subtitle: '', description: '', color: 'green', dir: 'ltr', lang: 'en', sources: [], lessons: [] };
      await E.saveSubject(s);
      return s;
    },

    /* ----- lessons ----- */
    async lesson(subjectId, meta) {
      const data = await E.loadJSON(C.lessonPath(subjectId, meta.file), { questions: [] });
      return Array.isArray(data) ? data : data.questions || [];
    },
    /* Save the question list of a lesson and keep subject.json's count in sync. */
    async saveLesson(subject, meta, questions) {
      await E.saveJSON(C.lessonPath(subject.id, meta.file), { questions });
      const m = subject.lessons.find((l) => l.id === meta.id);
      if (m) { m.count = questions.length; }
      await E.saveSubject(subject);
    },
    async addLesson(subject, title) {
      let n = 1;
      const used = new Set(subject.lessons.map((l) => l.id));
      while (used.has('lesson-' + n)) n++;
      const meta = { id: 'lesson-' + n, title, file: 'lesson-' + n + '.json', summary: '', source: subject.sources[0] ? subject.sources[0].id : '', count: 0 };
      subject.lessons.push(meta);
      await E.saveJSON(C.lessonPath(subject.id, meta.file), { questions: [] });
      await E.saveSubject(subject);
      return meta;
    },
    async deleteLesson(subject, meta) {
      subject.lessons = subject.lessons.filter((l) => l.id !== meta.id);
      await QZ.drafts.markDeleted(C.lessonPath(subject.id, meta.file));
      C.invalidate(C.lessonPath(subject.id, meta.file));
      await E.saveSubject(subject);
    },

    /* ----- ids ----- */
    newQuestionId(existing) {
      const used = new Set(existing);
      let id;
      do { id = 'q-' + Date.now().toString(36) + uid('').slice(1, 4); } while (used.has(id));
      return id;
    },
    async allQuestionIds(subject) {
      const ids = [];
      for (const l of subject.lessons) { try { (await E.lesson(subject.id, l)).forEach((q) => ids.push(q.id)); } catch (e) { /* missing lesson file */ } }
      return ids;
    },
    uniqueSubjectId(name, catalog) {
      const taken = new Set(C.subjectIdsOf({ years: catalog.years.map((y) => ({ ...y, semesters: y.semesters })) }));
      let base = QZ.util.asciiSlug(name, '');
      if (!base) base = 'subject';
      let id = base, n = 2;
      while (taken.has(id)) id = base + '-' + n++;
      return id;
    },

    /* Text you can paste into an AI assistant so it writes questions in the right format */
    formatGuide() {
      const samples = QZ.types.list().map((d) => {
        const b = d.blank();
        b.id = 'EXAMPLE-ID';
        return '// ' + d.label.en + '\n' + JSON.stringify(b, null, 2);
      }).join('\n\n');
      return 'Write quiz questions as a JSON array. Each question is an object. Use exactly these formats ("type" decides the format).\n' +
        'Rules: keep "id" unique (or omit it), fill "explanation" with a short useful note, mcq "answer" is the zero-based index of the correct option, ' +
        'matching "definition" must be copied exactly from "options". Use $H_2O$ or $Ca^{2+}$ for sub/superscripts and **bold** for emphasis. Output ONLY the JSON array.\n\n' + samples;
    },
  });
})();
