/* ==========================================================================
   types/registry.js — the list of question types.

   A question type is ONE self-contained file in js/types/ that calls
   QZ.types.register({...}). To add a new type: copy js/types/shortanswer.js,
   change it, and add one <script> line in index.html (see docs/QUESTION_TYPES.md).

   A type definition has:
     id        'mcq'                         the value of "type" in the JSON files
     label     {ar, en}                      shown in the interface
     tone      'blue' | 'purple' | ...       colour of its tag (see css/app.css .tone-*)
     blank()   -> new empty question         used by the editor's "New question"
     validate(q) -> ['err.xxx', ...]         problems with a question (editor + importer)
     mount(q, el, ctx)                       draws the interactive question inside `el`
                                             and calls ctx.grade(true|false) once answered.
                                             May return { timeout() } to react to the timer.
     view(q, ctx) -> Node                    read-only display of the answer (browse page)
     fields    [{kind:'custom', render(q, api) -> Node}]
                                             the editor form for this type's own fields
   ctx (given by the quiz engine) has: t, fmt, h, icon, shuffle, grade(ok), setKeys(fn)
   ========================================================================== */
(function () {
  'use strict';
  const QZ = (window.QZ = window.QZ || {});
  const map = {};
  const order = [];

  const T = (QZ.types = {
    register(def) {
      if (!def || !def.id) throw new Error('question type needs an id');
      const required = ['label', 'blank', 'validate', 'mount', 'view'];
      required.forEach((k) => { if (!def[k]) throw new Error('question type "' + def.id + '" is missing "' + k + '"'); });
      def.tone = def.tone || 'blue';
      def.fields = def.fields || [];
      map[def.id] = def;
      if (order.indexOf(def.id) < 0) order.push(def.id);
    },
    get(id) { return map[id] || null; },
    list() { return order.map((id) => map[id]); },
    ids() { return order.slice(); },
    label(id) {
      const d = map[id];
      if (!d) return id;
      return d.label[QZ.i18n.lang] || d.label.en || d.label.ar || id;
    },
    /* Full check of one question: [{key, level:'error'|'warn'}] */
    validate(q) {
      const out = [];
      if (!q || typeof q !== 'object') return [{ key: 'err.badType', level: 'error' }];
      if (!q.id) out.push({ key: 'err.needId', level: 'error' });
      const d = map[q.type];
      if (!d) { out.push({ key: 'err.badType', level: 'error' }); return out; }
      if (!String(q.text || '').trim()) out.push({ key: 'err.needText', level: 'error' });
      d.validate(q).forEach((k) => out.push({ key: k, level: 'error' }));
      if (!String(q.explanation || '').trim()) out.push({ key: 'err.noExplanation', level: 'warn' });
      return out;
    },
    hasErrors(q) { return T.validate(q).some((p) => p.level === 'error'); },
  });
})();
