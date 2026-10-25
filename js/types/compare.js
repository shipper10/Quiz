/* Question type: compare — "compare A and B": reveal a table, then say whether you knew it.
   JSON: { id, type:"compare", text,
           aspects:["Definition","Example"],
           itemA:{name:"…", values:["…","…"]}, itemB:{name:"…", values:["…","…"]},
           explanation, image }
   values[i] belongs to aspects[i].  */
(function () {
  'use strict';
  const QZ = window.QZ;
  const { h, fmt } = QZ.util;

  function table(q) {
    return h('div', { class: 'table-wrap' },
      h('table', { class: 'cmp-table' },
        h('thead', null, h('tr', null, h('th', null, QZ.t('quiz.aspect')), h('th', { dir: 'auto' }, q.itemA.name), h('th', { dir: 'auto' }, q.itemB.name))),
        h('tbody', null, q.aspects.map((a, i) => h('tr', null,
          h('th', { scope: 'row', dir: 'auto', html: fmt(a) }),
          h('td', { dir: 'auto', html: fmt(q.itemA.values[i]) }),
          h('td', { dir: 'auto', html: fmt(q.itemB.values[i]) })
        )))
      )
    );
  }

  QZ.types.register({
    id: 'compare',
    label: { ar: 'مقارنة', en: 'Comparison' },
    tone: 'rose',

    blank: () => ({ type: 'compare', text: '', aspects: ['', ''], itemA: { name: '', values: ['', ''] }, itemB: { name: '', values: ['', ''] }, explanation: '' }),

    validate(q) {
      const e = [];
      const asp = Array.isArray(q.aspects) ? q.aspects : [];
      if (!asp.length) e.push('err.needAspects');
      if (!q.itemA || !q.itemB || !String(q.itemA.name || '').trim() || !String(q.itemB.name || '').trim()) e.push('err.needItems');
      const cells = [].concat(asp, (q.itemA && q.itemA.values) || [], (q.itemB && q.itemB.values) || []);
      if (asp.length && ((q.itemA && q.itemA.values || []).length < asp.length || (q.itemB && q.itemB.values || []).length < asp.length || cells.some((c) => !String(c || '').trim()))) e.push('err.emptyCell');
      return e;
    },

    mount(q, el, ctx) {
      const t = ctx.t;
      let revealed = false, graded = false;
      const panel = h('div', { class: 'reveal-panel', hidden: true },
        table(q),
        h('div', { class: 'q-actions' },
          h('button', { type: 'button', class: 'btn btn-success', onclick: () => self(true) }, QZ.icon('check', 18), h('span', { class: 'btn-label' }, t('quiz.knew'))),
          h('button', { type: 'button', class: 'btn btn-danger-soft', onclick: () => self(false) }, QZ.icon('x', 18), h('span', { class: 'btn-label' }, t('quiz.didntKnow')))
        )
      );
      const show = h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: reveal }, QZ.icon('eye', 20), h('span', { class: 'btn-label' }, t('quiz.showTable')));
      el.appendChild(h('div', { class: 'reveal-box' }, show, panel));
      function reveal() { if (revealed) return; revealed = true; show.hidden = true; panel.hidden = false; panel.querySelector('button').focus({ preventScroll: true }); }
      function self(ok) { if (graded) return; graded = true; panel.querySelectorAll('button').forEach((b) => (b.disabled = true)); ctx.grade(ok); }
      ctx.setKeys((e) => {
        if (!revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal(); }
        else if (revealed && !graded) { if (e.key === 'y' || e.key === '1') self(true); else if (e.key === 'n' || e.key === '2') self(false); }
      });
      return { timeout() { reveal(); } };
    },

    view(q) { return table(q); },

    fields: [{
      kind: 'custom',
      render(q, api) {
        const { t } = QZ; const F = QZ.forms, UI = QZ.ui;
        q.aspects = q.aspects || [];
        q.itemA = q.itemA || { name: '', values: [] };
        q.itemB = q.itemB || { name: '', values: [] };
        const sync = () => { // keep the three arrays the same length
          [q.itemA, q.itemB].forEach((it) => { it.values = it.values || []; while (it.values.length < q.aspects.length) it.values.push(''); it.values.length = q.aspects.length; });
        };
        sync();
        const list = h('div', { class: 'row-list' });
        const draw = () => {
          list.textContent = '';
          q.aspects.forEach((a, i) => {
            list.appendChild(h('div', { class: 'row-card' },
              h('span', { class: 'row-num' }, i + 1),
              h('div', { class: 'row-main' },
                F.input({ value: a, dir: api.dir, ariaLabel: t('ed.aspect'), placeholder: t('ed.aspect'), onInput: (v) => { q.aspects[i] = v; api.change(); } }),
                F.textarea({ value: q.itemA.values[i], rows: 2, dir: api.dir, ariaLabel: q.itemA.name || t('ed.itemA'), placeholder: q.itemA.name || t('ed.itemA'), onInput: (v) => { q.itemA.values[i] = v; api.change(); } }),
                F.textarea({ value: q.itemB.values[i], rows: 2, dir: api.dir, ariaLabel: q.itemB.name || t('ed.itemB'), placeholder: q.itemB.name || t('ed.itemB'), onInput: (v) => { q.itemB.values[i] = v; api.change(); } })
              ),
              F.rowControls({
                onUp: i > 0 ? () => { [q.aspects, q.itemA.values, q.itemB.values].forEach((arr) => F.moveItem(arr, i, -1)); draw(); api.change(); } : null,
                onDown: i < q.aspects.length - 1 ? () => { [q.aspects, q.itemA.values, q.itemB.values].forEach((arr) => F.moveItem(arr, i, 1)); draw(); api.change(); } : null,
                onRemove: q.aspects.length > 1 ? () => { q.aspects.splice(i, 1); q.itemA.values.splice(i, 1); q.itemB.values.splice(i, 1); draw(); api.change(); } : null,
              })
            ));
          });
        };
        draw();
        return h('div', { class: 'form-block' },
          h('div', { class: 'grid-2' },
            F.field(t('ed.itemA'), F.input({ value: q.itemA.name, dir: api.dir, placeholder: t('ed.itemName'), onInput: (v) => { q.itemA.name = v; api.change(); } })),
            F.field(t('ed.itemB'), F.input({ value: q.itemB.name, dir: api.dir, placeholder: t('ed.itemName'), onInput: (v) => { q.itemB.name = v; api.change(); } }))
          ),
          h('h3', { class: 'form-h' }, t('ed.aspects')), list,
          UI.btn(t('ed.addAspect'), { icon: 'plus', variant: 'soft', small: true, onClick: () => { q.aspects.push(''); sync(); draw(); api.change(); } })
        );
      },
    }],
  });
})();
