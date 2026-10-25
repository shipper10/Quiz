/* Question type: truefalse — one statement, answer true or false.
   JSON: { id, type:"truefalse", text, answer:true|false, explanation, image }  */
(function () {
  'use strict';
  const QZ = window.QZ;
  const { h } = QZ.util;

  QZ.types.register({
    id: 'truefalse',
    label: { ar: 'صح / خطأ', en: 'True / False' },
    tone: 'purple',

    blank: () => ({ type: 'truefalse', text: '', answer: true, explanation: '' }),

    validate(q) { return typeof q.answer === 'boolean' ? [] : ['err.needAnswer']; },

    mount(q, el, ctx) {
      const t = ctx.t;
      let done = false;
      const mk = (val, label, icon) => h('button', { type: 'button', class: 'tf-btn', onclick: () => pick(val) }, QZ.icon(icon, 20), h('span', null, label));
      const bT = mk(true, t('quiz.true'), 'check');
      const bF = mk(false, t('quiz.false'), 'x');
      el.appendChild(h('div', { class: 'tf-grp' }, bT, bF));
      function reveal(chosen) {
        [[bT, true], [bF, false]].forEach(([b, v]) => {
          b.disabled = true;
          if (v === q.answer) b.classList.add('is-correct');
          else if (v === chosen) b.classList.add('is-wrong');
        });
      }
      function pick(v) { if (done) return; done = true; reveal(v); ctx.grade(v === q.answer); }
      ctx.setKeys((e) => {
        if (done) return;
        const k = e.key.toLowerCase();
        if (k === 't' || k === '1') pick(true);
        else if (k === 'f' || k === '2') pick(false);
      });
      return { timeout() { if (done) return; done = true; reveal(null); ctx.grade(false); } };
    },

    view(q) {
      return h('div', { class: 'view-answer' }, h('span', { class: 'pill ' + (q.answer ? 'pill-ok' : 'pill-no') }, QZ.t(q.answer ? 'quiz.true' : 'quiz.false')));
    },

    fields: [{
      kind: 'custom',
      render(q, api) {
        return QZ.forms.field(QZ.t('ed.tf.answer'),
          QZ.forms.segmented('tf-answer', [{ value: 'true', label: QZ.t('quiz.true') }, { value: 'false', label: QZ.t('quiz.false') }], String(q.answer !== false),
            (v) => { q.answer = v === 'true'; api.change(); }));
      },
    }],
  });
})();
