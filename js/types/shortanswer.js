/* Question type: shortanswer — think of the answer, reveal it, then say whether you got it right.
   JSON: { id, type:"shortanswer", text, answer, explanation, image }
   This is the simplest type: copy this file as a starting point for a new type.  */
(function () {
  'use strict';
  const QZ = window.QZ;
  const { h, fmt } = QZ.util;

  QZ.types.register({
    id: 'shortanswer',
    label: { ar: 'إجابة قصيرة', en: 'Short answer' },
    tone: 'teal',

    blank: () => ({ type: 'shortanswer', text: '', answer: '', explanation: '' }),

    validate(q) { return String(q.answer || '').trim() ? [] : ['err.needAnswerText']; },

    mount(q, el, ctx) {
      const t = ctx.t;
      let revealed = false, graded = false;
      const panel = h('div', { class: 'reveal-panel', hidden: true },
        h('div', { class: 'reveal-label' }, QZ.icon('check', 16), t('quiz.correctAnswer')),
        h('div', { class: 'reveal-text', dir: 'auto', html: fmt(q.answer) }),
        h('div', { class: 'q-actions' },
          h('button', { type: 'button', class: 'btn btn-success', onclick: () => self(true) }, QZ.icon('check', 18), h('span', { class: 'btn-label' }, t('quiz.gotIt'))),
          h('button', { type: 'button', class: 'btn btn-danger-soft', onclick: () => self(false) }, QZ.icon('x', 18), h('span', { class: 'btn-label' }, t('quiz.missed')))
        )
      );
      const show = h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: reveal }, QZ.icon('eye', 20), h('span', { class: 'btn-label' }, t('quiz.showAnswer')));
      el.appendChild(h('div', { class: 'reveal-box' }, show, panel));
      function reveal() { if (revealed) return; revealed = true; show.hidden = true; panel.hidden = false; panel.querySelector('button').focus({ preventScroll: true }); }
      function self(ok) {
        if (graded) return; graded = true;
        panel.querySelectorAll('button').forEach((b) => (b.disabled = true));
        ctx.grade(ok);
      }
      ctx.setKeys((e) => {
        if (!revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal(); }
        else if (revealed && !graded) { if (e.key === 'y' || e.key === '1') self(true); else if (e.key === 'n' || e.key === '2') self(false); }
      });
      return { timeout() { reveal(); } };
    },

    view(q) { return h('div', { class: 'view-answer', dir: 'auto', html: fmt(q.answer) }); },

    fields: [{
      kind: 'custom',
      render(q, api) {
        return QZ.forms.field(QZ.t('ed.answer'), QZ.forms.textarea({ value: q.answer, rows: 3, dir: api.dir, onInput: (v) => { q.answer = v; api.change(); } }));
      },
    }],
  });
})();
