/* Question type: multitf — several statements, mark each one True or False (classic exam format).
   JSON: { id, type:"multitf", text, statements:[{text, answer:true|false}], explanation, image }
   Graded correct only when every statement is right.  */
(function () {
  'use strict';
  const QZ = window.QZ;
  const { h, fmt } = QZ.util;

  QZ.types.register({
    id: 'multitf',
    label: { ar: 'مجموعة صح / خطأ', en: 'True/False group' },
    tone: 'purple',

    blank: () => ({
      type: 'multitf', text: '',
      statements: [{ text: '', answer: true }, { text: '', answer: false }, { text: '', answer: true }],
      explanation: '',
    }),

    validate(q) {
      const e = [];
      const st = Array.isArray(q.statements) ? q.statements : [];
      if (!st.length) e.push('err.needStatements');
      if (st.some((s) => !s || !String(s.text || '').trim())) e.push('err.emptyStatement');
      if (st.some((s) => !s || typeof s.answer !== 'boolean')) e.push('err.needAnswer');
      return e;
    },

    mount(q, el, ctx) {
      const t = ctx.t;
      const picks = new Array(q.statements.length).fill(null);
      let done = false;
      const rows = q.statements.map((s, i) => {
        const bT = h('button', { type: 'button', class: 'stmt-btn', 'aria-pressed': 'false', onclick: () => set(i, true) }, t('quiz.true'));
        const bF = h('button', { type: 'button', class: 'stmt-btn', 'aria-pressed': 'false', onclick: () => set(i, false) }, t('quiz.false'));
        const mark = h('span', { class: 'stmt-mark', 'aria-hidden': 'true' });
        const sr = h('span', { class: 'sr-only' });
        const row = h('div', { class: 'stmt' },
          h('div', { class: 'stmt-text' }, h('span', { class: 'stmt-num' }, i + 1 + '.'), h('span', { dir: 'auto', html: fmt(s.text) })),
          h('div', { class: 'stmt-ctl' }, bT, bF, mark, sr)
        );
        return { row, bT, bF, mark, sr };
      });
      const check = h('button', { type: 'button', class: 'btn btn-primary', disabled: true, onclick: () => grade(false) }, QZ.icon('check', 18), h('span', { class: 'btn-label' }, t('quiz.check')));
      el.appendChild(h('div', { class: 'stmts' }, rows.map((r) => r.row)));
      el.appendChild(h('div', { class: 'q-actions' }, check));

      function set(i, v) {
        if (done) return;
        picks[i] = v;
        rows[i].bT.setAttribute('aria-pressed', String(v === true));
        rows[i].bF.setAttribute('aria-pressed', String(v === false));
        rows[i].bT.classList.toggle('is-picked', v === true);
        rows[i].bF.classList.toggle('is-picked', v === false);
        check.disabled = picks.some((p) => p === null);
      }
      function grade(timedOut) {
        if (done) return;
        done = true;
        let all = true;
        q.statements.forEach((s, i) => {
          const r = rows[i];
          const ok = picks[i] === s.answer;
          if (!ok) all = false;
          r.bT.disabled = r.bF.disabled = true;
          r.bT.classList.remove('is-picked'); r.bF.classList.remove('is-picked');
          (s.answer ? r.bT : r.bF).classList.add('is-correct');
          if (picks[i] !== null && !ok) (picks[i] ? r.bT : r.bF).classList.add('is-wrong');
          r.row.classList.add(ok ? 'is-ok' : 'is-bad');
          r.mark.appendChild(QZ.icon(ok ? 'check' : 'x', 20));
          r.sr.textContent = ok ? t('quiz.correct') : t('quiz.wrong');
        });
        check.disabled = true;
        ctx.grade(all && !timedOut);
      }
      return { timeout() { grade(true); } };
    },

    view(q) {
      return h('div', { class: 'view-stmts' },
        q.statements.map((s) => h('div', { class: 'view-stmt' }, h('span', { class: 'pill ' + (s.answer ? 'pill-ok' : 'pill-no') }, QZ.t(s.answer ? 'quiz.true' : 'quiz.false')), h('span', { dir: 'auto', html: fmt(s.text) })))
      );
    },

    fields: [{
      kind: 'custom',
      render(q, api) {
        const { t } = QZ; const F = QZ.forms, UI = QZ.ui;
        q.statements = q.statements || [];
        const list = h('div', { class: 'row-list' });
        const draw = () => {
          list.textContent = '';
          q.statements.forEach((s, i) => {
            list.appendChild(h('div', { class: 'row-card' },
              h('span', { class: 'row-num' }, i + 1),
              h('div', { class: 'row-main' },
                F.textarea({ value: s.text, rows: 2, dir: api.dir, ariaLabel: t('ed.statementText'), placeholder: t('ed.statementText'), onInput: (v) => { s.text = v; api.change(); } }),
                F.segmented('stmt-' + i + '-' + QZ.util.uid(''), [{ value: 'true', label: QZ.t('quiz.true') }, { value: 'false', label: QZ.t('quiz.false') }], String(s.answer !== false), (v) => { s.answer = v === 'true'; api.change(); })
              ),
              F.rowControls({
                onUp: i > 0 ? () => { F.moveItem(q.statements, i, -1); draw(); api.change(); } : null,
                onDown: i < q.statements.length - 1 ? () => { F.moveItem(q.statements, i, 1); draw(); api.change(); } : null,
                onRemove: q.statements.length > 1 ? () => { q.statements.splice(i, 1); draw(); api.change(); } : null,
              })
            ));
          });
        };
        draw();
        return h('div', { class: 'form-block' },
          h('h3', { class: 'form-h' }, t('ed.statements')), list,
          UI.btn(t('ed.addStatement'), { icon: 'plus', variant: 'soft', small: true, onClick: () => { q.statements.push({ text: '', answer: true }); draw(); api.change(); } })
        );
      },
    }],
  });
})();
