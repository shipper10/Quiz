/* ==========================================================================
   content.js — reads the course content (catalog, subjects, lessons, images).

   Content layout in the repository:
     content/catalog.json                          years -> semesters -> subject ids
     content/subjects/<id>/subject.json            subject info, sources, lesson list
     content/subjects/<id>/<lesson>.json           the questions of one lesson
     content/subjects/<id>/images/…                images used by questions

   Where data comes from (first match wins):
     1. editor drafts (unpublished edits in this browser)
     2. window.QZ_BUNDLE   (the single-file offline build)
     3. the network        (normal website)
   ========================================================================== */
(function () {
  'use strict';
  const QZ = (window.QZ = window.QZ || {});

  const cache = new Map(); // path -> parsed JSON (never mutate; clone first)
  const urlCache = new Map(); // draft image path -> {url, updated}

  const C = (QZ.content = {
    ROOT: 'content',
    catalogPath: () => 'content/catalog.json',
    subjectPath: (id) => 'content/subjects/' + id + '/subject.json',
    lessonPath: (sid, file) => 'content/subjects/' + sid + '/' + file,
    imagePath: (sid, ref) => 'content/subjects/' + sid + '/' + ref,

    /* ---------- low level ---------- */
    async json(path) {
      if (cache.has(path)) return cache.get(path);
      if (QZ.drafts.isDeleted(path)) throw new Error(path + ' (deleted)');
      let data = QZ.drafts.getJSON(path);
      if (!data && window.QZ_BUNDLE && window.QZ_BUNDLE[path] !== undefined) data = JSON.parse(JSON.stringify(window.QZ_BUNDLE[path]));
      if (!data) {
        const res = await fetch(path, { cache: 'no-cache' });
        if (!res.ok) throw new Error(path + ' → HTTP ' + res.status);
        data = await res.json();
      }
      cache.set(path, data);
      return data;
    },
    /* Call after changing a draft so the next read sees it. */
    invalidate(path) { if (path) cache.delete(path); else cache.clear(); },
    clearCache() { cache.clear(); },

    /* ---------- catalog ---------- */
    async catalog() {
      let c;
      try { c = await C.json(C.catalogPath()); } catch (e) { c = { title: '', years: [] }; }
      c.years = (c.years || []).map((y) => ({ ...y, semesters: (y.semesters || []).map((s) => ({ ...s, subjects: s.subjects || [] })) }));
      return c;
    },
    subjectIdsOf(catalog) {
      const seen = new Set();
      catalog.years.forEach((y) => y.semesters.forEach((s) => s.subjects.forEach((id) => seen.add(id))));
      return Array.from(seen);
    },

    /* ---------- subject / lessons ---------- */
    normalizeSubject(s, id) {
      return {
        id: s.id || id,
        title: s.title || id,
        subtitle: s.subtitle || '',
        description: s.description || '',
        color: s.color || 'green',
        dir: s.dir === 'rtl' ? 'rtl' : 'ltr',
        lang: s.lang || (s.dir === 'rtl' ? 'ar' : 'en'),
        sources: Array.isArray(s.sources) ? s.sources : [],
        lessons: Array.isArray(s.lessons) ? s.lessons : [],
      };
    },
    async subject(id) {
      const raw = await C.json(C.subjectPath(id));
      return C.normalizeSubject(raw, id);
    },
    /* The raw questions of one lesson: [{id,type,text,…}] */
    async lessonQuestions(sid, lesson) {
      const data = await C.json(C.lessonPath(sid, lesson.file));
      return Array.isArray(data) ? data : data.questions || [];
    },

    /* Everything of a subject, ready for quizzes:
       { subject, lessons:[{meta, items}], items:[wrapper] }
       wrapper = { key, id, subject, lesson, source, q, lessonTitle, subjectTitle } */
    async loadSubject(id) {
      const subject = await C.subject(id);
      const results = await Promise.all(
        subject.lessons.map(async (l) => {
          try { return { l, qs: await C.lessonQuestions(id, l), err: null }; }
          catch (e) { return { l, qs: [], err: e }; }
        })
      );
      const lessons = [];
      const items = [];
      for (const { l, qs, err } of results) {
        const li = [];
        qs.forEach((q) => {
          if (!q || !q.id) return;
          const w = {
            key: id + '/' + l.id + '/' + q.id,
            id: q.id,
            subject: id,
            lesson: l.id,
            source: q.source || l.source || '',
            q,
            lessonTitle: l.title,
            subjectTitle: subject.title,
          };
          li.push(w);
          items.push(w);
        });
        lessons.push({ meta: l, items: li, error: err });
      }
      return { subject, lessons, items };
    },

    /* Turn stored keys back into wrappers (resume a saved quiz). Missing ones are dropped. */
    async resolveKeys(keys) {
      const bySubject = new Map();
      keys.forEach((k) => { const s = k.split('/')[0]; if (!bySubject.has(s)) bySubject.set(s, []); });
      const maps = new Map();
      for (const s of bySubject.keys()) {
        try {
          const d = await C.loadSubject(s);
          maps.set(s, new Map(d.items.map((w) => [w.key, w])));
        } catch (e) { maps.set(s, new Map()); }
      }
      return keys.map((k) => (maps.get(k.split('/')[0]) || new Map()).get(k)).filter(Boolean);
    },

    /* ---------- images ---------- */
    imageURL(subjectId, ref) {
      if (!ref) return '';
      if (/^(data:|blob:|https?:)/i.test(ref)) return ref;
      const path = C.imagePath(subjectId, ref);
      const blob = QZ.drafts.getBlob(path);
      if (blob) {
        const rec = QZ.drafts.updatedAt(path);
        const hit = urlCache.get(path);
        if (hit && hit.updated === rec) return hit.url;
        if (hit) URL.revokeObjectURL(hit.url);
        const url = URL.createObjectURL(blob);
        urlCache.set(path, { url, updated: rec });
        return url;
      }
      if (window.QZ_BUNDLE && typeof window.QZ_BUNDLE[path] === 'string') return window.QZ_BUNDLE[path];
      return path;
    },

    /* ---------- helpers ---------- */
    sourceTitle(subject, id) {
      const s = (subject.sources || []).find((x) => x.id === id);
      return s ? s.title : '';
    },
  });
})();
