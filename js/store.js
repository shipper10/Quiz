/* ==========================================================================
   store.js — everything saved in the browser (localStorage):
     • Settings   (language, theme)
     • Progress   (which questions you answered, right or wrong)
     • Session    (the quiz in progress, so you can resume)
   Progress is keyed by "<subjectId>/<questionId>".
   ========================================================================== */
(function () {
  'use strict';
  const QZ = (window.QZ = window.QZ || {});

  const K = {
    settings: 'quizhub:settings',
    progress: 'quizhub:progress:v1',
    session: 'quizhub:session:v1',
    publish: 'quizhub:publish',
    legacy: 'biochem_state', // key used by the old single-file app
    legacyDone: 'quizhub:legacy-migrated',
  };
  const read = (k, def) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : def; } catch (e) { return def; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const remove = (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } };

  /* ---------------- Settings ---------------- */
  const S = (QZ.settings = {
    data: Object.assign({ lang: 'ar', theme: 'auto' }, read(K.settings, {})),
    get(k) { return S.data[k]; },
    set(k, v) { S.data[k] = v; write(K.settings, S.data); S.apply(); },
    resolvedTheme() {
      if (S.data.theme === 'auto') return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      return S.data.theme;
    },
    apply() {
      QZ.i18n.set(S.data.lang);
      document.documentElement.dataset.theme = S.resolvedTheme();
      const m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute('content', S.resolvedTheme() === 'dark' ? '#0e1914' : '#1f6b4a');
    },
  });

  /* ---------------- Progress ---------------- */
  let prog = read(K.progress, {});
  const P = (QZ.progress = {
    key: (subject, id) => subject + '/' + id,
    get(subject, id) { return prog[subject + '/' + id] || null; },
    record(subject, id, ok) {
      const k = subject + '/' + id;
      const prev = prog[k] || { n: 0 };
      prog[k] = { c: !!ok, n: (prev.n || 0) + 1, t: Date.now() };
      write(K.progress, prog);
    },
    all() { return prog; },
    reset() { prog = {}; write(K.progress, prog); },
    exportData() { return { app: 'quizhub', version: 1, exportedAt: new Date().toISOString(), progress: prog }; },
    importData(obj) {
      if (!obj || typeof obj !== 'object' || !obj.progress || typeof obj.progress !== 'object') throw new Error('bad file');
      for (const [k, v] of Object.entries(obj.progress)) {
        if (!v || typeof v !== 'object') continue;
        const cur = prog[k];
        if (!cur || (v.t || 0) >= (cur.t || 0)) prog[k] = { c: !!v.c, n: +v.n || 1, t: +v.t || 0 };
      }
      write(K.progress, prog);
    },
    /* items: array of question wrappers ({subject, id}) */
    stats(items) {
      let answered = 0, correct = 0;
      for (const it of items) {
        const p = prog[it.subject + '/' + it.id];
        if (p) { answered++; if (p.c) correct++; }
      }
      return { total: items.length, answered, correct };
    },
    /* Star rule (same as the original app): finish every question, then 90%+ = 3, 70%+ = 2, otherwise 1. */
    stars(items) {
      const s = P.stats(items);
      if (!s.total || s.answered < s.total) return 0;
      const a = s.correct / s.total;
      return a >= 0.9 ? 3 : a >= 0.7 ? 2 : 1;
    },
    /* Wrong answers across everything (needs no content loaded): [{subject, id, n}] sorted by attempts desc */
    wrongKeys() {
      const out = [];
      for (const [k, v] of Object.entries(prog)) {
        if (v && v.c === false) {
          const i = k.indexOf('/');
          out.push({ subject: k.slice(0, i), id: k.slice(i + 1), n: v.n || 1 });
        }
      }
      return out.sort((a, b) => b.n - a.n);
    },
    summary() {
      let answered = 0, correct = 0;
      for (const v of Object.values(prog)) { answered++; if (v.c) correct++; }
      return { answered, correct, wrong: answered - correct };
    },
    /* One-time import of progress saved by the old single-file app (same browser/origin only). */
    migrateLegacy() {
      if (read(K.legacyDone, false)) return;
      const old = read(K.legacy, null);
      if (old && old.progress) {
        for (const [id, v] of Object.entries(old.progress)) {
          const k = 'biochemistry/' + id;
          if (!prog[k] && v) prog[k] = { c: !!v.correct, n: v.attempts || 1, t: 0 };
        }
        write(K.progress, prog);
      }
      write(K.legacyDone, true);
    },
  });

  /* ---------------- Quiz session (resume) ---------------- */
  QZ.session = {
    save(s) { write(K.session, s); },
    load() { return read(K.session, null); },
    clear() { remove(K.session); },
  };

  /* ---------------- Editor mode ----------------
     Students never see the editor. A supervisor opens  #/editor  once on their device;
     that switches the menu link and the edit buttons on. (It is only a convenience:
     what really protects the content is that publishing needs a GitHub token.) */
  QZ.editorMode = {
    on() { return read('quizhub:editor', false) === true || !!QZ.publishCfg.load().token; },
    set(v) { if (v) write('quizhub:editor', true); else remove('quizhub:editor'); },
  };

  /* ---------------- Publish settings (editor) ---------------- */
  QZ.publishCfg = {
    load() { return read(K.publish, {}); },
    save(c) { write(K.publish, c); },
    clear() { remove(K.publish); },
  };
})();
