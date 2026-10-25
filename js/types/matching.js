/* Question type: matching — match each item with its description using drop-downs.
   JSON: { id, type:"matching", text,
           options:["A. …","B. …"]   (optional list shown in every drop-down; if missing it is built from the answers)
           pairs:[{term, definition}]  definition must equal one of the options,
           shuffle:true|false (optional; default: shuffle only when no options list is given),
           explanation, image }  */
(function () {
  'use strict';
  const QZ = window.QZ;
  const { h, fmt, shuffle } = QZ.util;

  QZ.types.register({
    id: 'matching',
    label: { ar: 'توصيل (مطابقة)', en: 'Matching' },
    tone: 'amber',

    blank: () => ({ type: 'matching', text: '', options: ['', '', ''], pairs: [{ term: '', definition: '' }, { term: '', definition: '' }], explanation: '' }),

    validate(q) {
      const e = [];
      const pairs = Array.isArray(q.pairs) ? q.pairs : [];
      const opts = Array.isArray(q.options) ? q.options : [];
      if (!pairs.length) e.push('err.needPairs');
      if (pairs.some((p) => !p || !String(p.term || '').trim() || !String(p.definition || '').trim())) e.push('err.emptyPair');
      if (opts.length && pairs.some((p) => p && p.definition && opts.indexOf(p.definition) < 0)) e.push('err.pairNotInOptions');
      if (opts.some((o) => !String(o || '').trim())) e.push('err.emptyOption');
      return e;
    },

    mount(q, el, ctx) {
      const t = ctx.t;
      let done = false;
      const base = q.options && q.options.length ? q.options.slice() : Array.from(new Set(q.pairs.map((p) => p.definition)));
      const shuf = q.shuffle !== undefined ? !!q.shuffle : !(q.options && q.options.length);
      const opts = shuf ? shuffle(base) : base;
      const rows = q.pairs.map((p, i) => {
        const sel = h('select', { class: 'input select match-sel', dir: 'auto', 'aria-label': p.term }, h('option', { value: '' }, t('quiz.select')), opts.map((o) => h('option', { value: o }, o)));
        sel.addEventListener('change', () => { check.disabled = rows.some((r) => !r.sel.value); });
        const mark = h('span', { class: 'stmt-mark', 'aria-hidden': 'true' });
        const fix = h('div', { class: 'match-fix', dir: 'auto', hidden: true });
        const row = h('div', { class: 'match-row' },
          h('div', { class: 'match-term', dir: 'auto', html: fmt(p.term) }),
          h('div', { class: 'match-pick' }, sel, mark, fix)
        );
        return { row, sel, mark, fix };
      });
      const check = h('button', { type: 'button', class: 'btn btn-primary', disabled: true, onclick: () => grade(false) }, QZ.icon('check', 18), h('span', { class: 'btn-label' }, t('quiz.check')));
      el.appendChild(h('p', { class: 'hint' }, t('quiz.matchHint')));
      el.appendChild(h('div', { class: 'match' }, rows.map((r) => r.row)));
      el.appendChild(h('div', { class: 'q-actions' }, check));

      function grade(timedOut) {
        if (done) return;
        done = true;
        let all = true;
        q.pairs.forEach((p, i) => {
          const r = rows[i];
          const ok = r.sel.value === p.definition;
          if (!ok) {
            all = false;
            r.fix.hidden = false;
            r.fix.textContent = '✓ ' + p.definition;
          }
          r.sel.disabled = true;
          r.sel.classList.add(ok ? 'is-correct' : 'is-wrong');
          r.mark.appendChild(QZ.icon(ok ? 'check' : 'x', 20));
        });
        check.disabled = true;
        ctx.grade(all && !timedOut);
      }
      return { timeout() { grade(true); } };
    },

    view(q) {
      return h('div', { class: 'view-pairs' },
        q.pairs.map((p) => h('div', { class: 'view-pair' }, h('strong', { dir: 'auto', html: fmt(p.term) }), QZ.icon('arrow-right', 16), h('span', { dir: 'auto', html: fmt(p.definition) })))
      );
    },

    fields: [{
      kind: 'custom',
      render(q, api) {
        const { t } = QZ; const F = QZ.forms, UI = QZ.ui;
        q.options = q.options || [];
        q.pairs = q.pairs || [];
        const optsHost = h('div', { class: 'row-list' });
        const pairsHost = h('div', { class: 'row-list' });

        const drawOpts = () => {
          optsHost.textContent = '';
          q.options.forEach((o, i) => {
            optsHost.appendChild(h('div', { class: 'row-card' },
              h('span', { class: 'row-num' }, i + 1),
              h('div', { class: 'row-main' },
                F.input({
                  value: o, dir: api.dir, ariaLabel: t('ed.option') + ' ' + (i + 1), placeholder: t('ed.option') + ' ' + (i + 1),
                  onInput: (v) => {
                    const old = q.options[i];
                    q.options[i] = v;
                    q.pairs.forEach((p) => { if (p.definition === old) p.definition = v; }); // keep pairs in sync while typing
                    api.change();
                  },
                })
              ),
              F.rowControls({
                onUp: i > 0 ? () => { F.moveItem(q.options, i, -1); drawOpts(); drawPairs(); api.change(); } : null,
                onDown: i < q.options.length - 1 ? () => { F.moveItem(q.options, i, 1); drawOpts(); drawPairs(); api.change(); } : null,
                onRemove: () => { const gone = q.options[i]; q.options.splice(i, 1); q.pairs.forEach((p) => { if (p.definition === gone) p.definition = ''; }); drawOpts(); drawPairs(); api.change(); },
              })
            ));
          });
        };
        const drawPairs = () => {
          pairsHost.textContent = '';
          q.pairs.forEach((p, i) => {
            const answer = q.options.length
              ? F.select([{ value: '', label: t('quiz.select') }].concat(q.options.filter((o) => o !== '').map((o) => ({ value: o, label: o }))), p.definition, (v) => { p.definition = v; api.change(); }, { 'aria-label': t('ed.definition') })
              : F.input({ value: p.definition, dir: api.dir, ariaLabel: t('ed.definition'), placeholder: t('ed.definition'), onInput: (v) => { p.definition = v; api.change(); } });
            pairsHost.appendChild(h('div', { class: 'row-card' },
              h('span', { class: 'row-num' }, i + 1),
              h('div', { class: 'row-main' },
                F.input({ value: p.term, dir: api.dir, ariaLabel: t('ed.term'), placeholder: t('ed.term'), onInput: (v) => { p.term = v; api.change(); } }),
                answer
              ),
              F.rowControls({
                onUp: i > 0 ? () => { F.moveItem(q.pairs, i, -1); drawPairs(); api.change(); } : null,
                onDown: i < q.pairs.length - 1 ? () => { F.moveItem(q.pairs, i, 1); drawPairs(); api.change(); } : null,
                onRemove: q.pairs.length > 1 ? () => { q.pairs.splice(i, 1); drawPairs(); api.change(); } : null,
              })
            ));
          });
        };
        drawOpts(); drawPairs();
        return h('div', null,
          h('div', { class: 'form-block' },
            h('h3', { class: 'form-h' }, t('ed.matchOptions')), optsHost,
            UI.btn(t('ed.addOption'), { icon: 'plus', variant: 'soft', small: true, onClick: () => { q.options.push(''); drawOpts(); drawPairs(); api.change(); } })
          ),
          h('div', { class: 'form-block' },
            h('h3', { class: 'form-h' }, t('ed.pairs')), pairsHost,
            UI.btn(t('ed.addPair'), { icon: 'plus', variant: 'soft', small: true, onClick: () => { q.pairs.push({ term: '', definition: '' }); drawPairs(); api.change(); } })
          )
        );
      },
    }],
  });
})();
