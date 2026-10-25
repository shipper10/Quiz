/* Question type: mcq — multiple choice, one correct option.
   JSON: { id, type:"mcq", text, options:[…], answer:<index>, optionReasons:[…] (optional), explanation, image }  */
(function () {
  'use strict';
  const QZ = window.QZ;
  const { h, fmt } = QZ.util;
  const LETTERS = 'ABCDEFGHIJKL';

  QZ.types.register({
    id: 'mcq',
    label: { ar: 'اختيار من متعدد', en: 'Multiple choice' },
    tone: 'blue',

    blank: () => ({ type: 'mcq', text: '', options: ['', '', '', ''], answer: 0, optionReasons: ['', '', '', ''], explanation: '' }),

    validate(q) {
      const e = [];
      const opts = Array.isArray(q.options) ? q.options : [];
      if (opts.length < 2) e.push('err.needOptions');
      if (opts.some((o) => !String(o || '').trim())) e.push('err.emptyOption');
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= opts.length) e.push('err.needAnswer');
      return e;
    },

    mount(q, el, ctx) {
      const t = ctx.t;
      let done = false;
      const items = q.options.map((o, i) => {
        const reason = h('span', { class: 'opt-reason', dir: 'auto', hidden: true });
        const sr = h('span', { class: 'sr-only' });
        const btn = h('button', { type: 'button', class: 'opt', onclick: () => pick(i) },
          h('span', { class: 'opt-letter', 'aria-hidden': 'true' }, LETTERS[i]),
          h('span', { class: 'opt-body' }, h('span', { class: 'opt-text', dir: 'auto', html: fmt(o) }), reason),
          sr
        );
        return { btn, reason, sr };
      });
      el.appendChild(h('div', { class: 'opts', role: 'group' }, items.map((x) => x.btn)));

      function reveal(chosen) {
        items.forEach((x, i) => {
          x.btn.disabled = true;
          if (i === q.answer) { x.btn.classList.add('is-correct'); x.sr.textContent = ' — ' + t('quiz.correct'); }
          else if (i === chosen) { x.btn.classList.add('is-wrong'); x.sr.textContent = ' — ' + t('quiz.wrong'); }
          const why = q.optionReasons && q.optionReasons[i];
          if (why) { x.reason.innerHTML = fmt(why); x.reason.hidden = false; }
        });
      }
      function pick(i) {
        if (done) return;
        done = true;
        reveal(i);
        ctx.grade(i === q.answer);
      }
      ctx.setKeys((e) => {
        if (done || e.ctrlKey || e.metaKey || e.altKey) return;
        let i = LETTERS.indexOf(e.key.toUpperCase());
        if (i < 0 && /^[1-9]$/.test(e.key)) i = +e.key - 1;
        if (i >= 0 && i < items.length) { e.preventDefault(); pick(i); }
      });
      return {
        timeout() { if (done) return; done = true; reveal(-1); ctx.grade(false); },
      };
    },

    view(q) {
      return h('div', { class: 'view-opts' },
        q.options.map((o, i) =>
          h('div', { class: 'view-opt' + (i === q.answer ? ' is-correct' : '') },
            h('span', { class: 'opt-letter', 'aria-hidden': 'true' }, LETTERS[i]),
            h('div', null,
              h('div', { dir: 'auto', html: fmt(o) }),
              q.optionReasons && q.optionReasons[i] ? h('div', { class: 'opt-reason', dir: 'auto', html: fmt(q.optionReasons[i]) }) : null
            )
          )
        )
      );
    },

    /* ---------- editor form ---------- */
    fields: [{
      kind: 'custom',
      render(q, api) {
        const { t } = QZ;
        const F = QZ.forms, UI = QZ.ui;
        q.options = q.options || [];
        q.optionReasons = q.optionReasons || [];
        const list = h('div', { class: 'row-list' });
        const draw = () => {
          list.textContent = '';
          q.options.forEach((o, i) => {
            while (q.optionReasons.length < q.options.length) q.optionReasons.push('');
            const radioId = QZ.util.uid('mc');
            const radio = h('input', { type: 'radio', name: 'mcq-correct', id: radioId, class: 'seg-input' });
            radio.checked = q.answer === i;
            radio.addEventListener('change', () => { q.answer = i; api.change(); });
            list.appendChild(h('div', { class: 'row-card' },
              h('label', { class: 'correct-pick', for: radioId, title: t('ed.correct') }, radio,
                h('span', { class: 'correct-dot' }, QZ.icon('check', 14)), h('span', { class: 'opt-letter' }, LETTERS[i])),
              h('div', { class: 'row-main' },
                F.input({ value: o, dir: api.dir, ariaLabel: t('ed.option') + ' ' + LETTERS[i], placeholder: t('ed.option') + ' ' + LETTERS[i], onInput: (v) => { q.options[i] = v; api.change(); } }),
                F.input({ value: q.optionReasons[i] || '', dir: api.dir, ariaLabel: t('ed.reason'), placeholder: t('ed.reason'), onInput: (v) => { q.optionReasons[i] = v; api.change(); } })
              ),
              F.rowControls({
                onUp: i > 0 ? () => move(i, -1) : null,
                onDown: i < q.options.length - 1 ? () => move(i, 1) : null,
                onRemove: q.options.length > 2 ? () => remove(i) : null,
              })
            ));
          });
        };
        function move(i, d) {
          const j = i + d;
          F.moveItem(q.options, i, d); F.moveItem(q.optionReasons, i, d);
          if (q.answer === i) q.answer = j; else if (q.answer === j) q.answer = i;
          draw(); api.change();
        }
        function remove(i) {
          q.options.splice(i, 1); q.optionReasons.splice(i, 1);
          if (q.answer === i) q.answer = 0; else if (q.answer > i) q.answer--;
          draw(); api.change();
        }
        draw();
        return h('div', { class: 'form-block' },
          h('h3', { class: 'form-h' }, t('ed.options')),
          h('p', { class: 'hint' }, t('ed.correct') + ' ↓'),
          list,
          UI.btn(t('ed.addOption'), { icon: 'plus', variant: 'soft', small: true, onClick: () => { q.options.push(''); q.optionReasons.push(''); draw(); api.change(); } })
        );
      },
    }],
  });
})();
