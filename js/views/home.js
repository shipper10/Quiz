/* ==========================================================================
   views/home.js — home page: year → semester → subjects, plus the
   "mistakes to review" page.
   ========================================================================== */
(function () {
  'use strict';
  const QZ = window.QZ;
  const { h, tr, pct } = Object.assign({}, QZ.util, { pct: QZ.util.pct, tr: QZ.util.tr });
  const UI = QZ.ui;

  /* Answered / correct counts for a subject, from saved progress (no need to load questions). */
  QZ.progress.subjectStats = function (subjectId) {
    const prefix = subjectId + '/';
    let answered = 0, correct = 0;
    const all = QZ.progress.all();
    for (const k in all) if (k.startsWith(prefix)) { answered++; if (all[k].c) correct++; }
    return { answered, correct };
  };

  /* ---------------- Home ---------------- */
  QZ.router.add('/', async (params, query, root) => {
    const t = QZ.t;
    const catalog = await QZ.content.catalog();
    UI.setSiteTitle(tr(catalog.title) || t('app.name'));
    UI.setTitle('');
    const sum = QZ.progress.summary();

    root.appendChild(h('section', { class: 'hero' },
      h('h1', { class: 'hero-title' }, t('home.welcome')),
      h('p', { class: 'hero-sub' }, t('home.sub'))
    ));

    if (QZ.quiz.hasSession()) {
      const s = QZ.session.load();
      root.appendChild(h('div', { class: 'banner', role: 'region' },
        QZ.icon('play', 22),
        h('p', null, t('home.resume', { n: s.current + 1, total: s.keys.length })),
        UI.btn(t('home.resumeBtn'), { variant: 'primary', small: true, onClick: async () => { if (await QZ.quiz.resume()) QZ.router.go('/quiz'); else QZ.router.refresh(); } }),
        UI.btn(t('home.dismiss'), { variant: 'ghost', small: true, onClick: () => { QZ.session.clear(); QZ.router.refresh(); } })
      ));
    }

    root.appendChild(h('div', { class: 'stats' },
      stat(sum.answered, t('home.answered')),
      stat(sum.answered ? pct(sum.correct, sum.answered) + '%' : '—', t('home.accuracy')),
      stat(sum.wrong, t('home.toReview'), sum.wrong ? '#/review' : null)
    ));

    const years = catalog.years;
    if (!years.length) {
      root.appendChild(UI.empty('folder', t('home.noCatalog'), UI.btn(t('nav.editor'), { icon: 'edit', variant: 'primary', href: '#/editor' })));
      return;
    }

    let yi = Math.max(0, years.findIndex((y) => y.id === QZ.settings.get('year')));
    let year = years[yi];
    let si = Math.max(0, year.semesters.findIndex((s) => s.id === QZ.settings.get('semester')));

    const yearBar = h('div', { class: 'tabs', role: 'tablist', 'aria-label': t('ed.catalog') });
    const semBar = h('div', { class: 'tabs tabs-sub', role: 'tablist' });
    const grid = h('div', { class: 'subject-grid' });
    root.appendChild(yearBar);
    root.appendChild(semBar);
    root.appendChild(grid);

    function draw() {
      year = years[yi];
      if (si >= year.semesters.length) si = 0;
      yearBar.textContent = '';
      years.forEach((y, i) => yearBar.appendChild(h('button', { type: 'button', role: 'tab', class: 'tab' + (i === yi ? ' is-active' : ''), 'aria-selected': String(i === yi), onclick: () => { yi = i; si = 0; QZ.settings.data.year = y.id; QZ.settings.set('semester', year.semesters[0] ? year.semesters[0].id : ''); draw(); } }, tr(y.title))));
      semBar.textContent = '';
      semBar.hidden = year.semesters.length < 1;
      year.semesters.forEach((s, i) => semBar.appendChild(h('button', { type: 'button', role: 'tab', class: 'tab' + (i === si ? ' is-active' : ''), 'aria-selected': String(i === si), onclick: () => { si = i; QZ.settings.set('semester', s.id); draw(); } }, tr(s.title))));
      QZ.settings.data.year = year.id;
      grid.textContent = '';
      const sem = year.semesters[si];
      if (!sem || !sem.subjects.length) { grid.appendChild(UI.empty('folder', t(sem ? 'home.emptySem' : 'home.emptyYear'))); return; }
      sem.subjects.forEach((id) => grid.appendChild(subjectCard(id)));
    }
    draw();
  });

  function stat(value, label, href) {
    const el = href ? 'a' : 'div';
    return h(el, { class: 'stat' + (href ? ' stat-link' : ''), href: href || null }, h('div', { class: 'stat-val' }, String(value)), h('div', { class: 'stat-lbl' }, label));
  }

  function subjectCard(id) {
    const card = h('a', { class: 'subject-card color-green', href: '#/subject/' + id, 'aria-busy': 'true' },
      h('div', { class: 'sc-icon' }, QZ.icon('book', 24)),
      h('div', { class: 'sc-body' }, h('h3', { class: 'sc-title' }, id), h('div', { class: 'sc-meta' }, '…'))
    );
    QZ.content.subject(id).then((s) => {
      const total = s.lessons.reduce((n, l) => n + (l.count || 0), 0);
      const st = QZ.progress.subjectStats(id);
      const p = pct(st.answered, total);
      card.className = 'subject-card color-' + s.color;
      card.setAttribute('dir', 'auto');
      card.removeAttribute('aria-busy');
      card.textContent = '';
      card.appendChild(h('div', { class: 'sc-icon' }, QZ.icon('book', 24)));
      card.appendChild(h('div', { class: 'sc-body' },
        h('h3', { class: 'sc-title' }, s.title),
        s.subtitle ? h('div', { class: 'sc-sub' }, s.subtitle) : null,
        h('div', { class: 'sc-meta' }, s.lessons.length + ' ' + QZ.t('common.lessons') + ' · ' + total + ' ' + QZ.t('common.questions')),
        UI.progressBar(p, s.title),
        h('div', { class: 'sc-prog' }, QZ.t('subject.done', { a: st.answered, t: total }) + ' · ' + (st.answered ? pct(st.correct, st.answered) + '%' : '—'))
      ));
    }).catch(() => {
      card.removeAttribute('aria-busy');
      card.querySelector('.sc-meta').textContent = QZ.t('common.notFound');
    });
    return card;
  }

  /* ---------------- Review mistakes ---------------- */
  QZ.router.add('/review', async (params, query, root) => {
    const t = QZ.t;
    UI.setTitle(t('review.title'));
    const only = query.subject || null;
    root.appendChild(UI.pageHead(t('review.title'), t('review.sub')));
    const wrong = await QZ.quiz.wrongItems(only);
    if (!wrong.length) { root.appendChild(UI.empty('check', t('review.none'), UI.btn(t('nav.home'), { icon: 'home', variant: 'primary', href: '#/' }))); return; }
    root.appendChild(h('div', { class: 'toolbar' }, UI.btn(t('review.start') + ' (' + wrong.length + ')', { icon: 'play', variant: 'primary', onClick: () => QZ.quiz.start({ items: wrong.map((x) => x.w), mode: 'review', subjectId: only, timerOn: false, backHref: only ? '#/subject/' + only : '#/review' }) })));
    root.appendChild(h('div', { class: 'list' }, wrong.map(({ w, n }) =>
      h('div', { class: 'list-row' },
        h('span', { class: 'pill pill-no' }, '✕ ×' + n),
        h('div', { class: 'list-main' }, h('div', { class: 'list-text', dir: 'auto' }, QZ.util.truncate(w.q.text, 140)), h('div', { class: 'list-meta' }, w.subjectTitle + ' · ' + w.lessonTitle)),
        UI.typeTag(w.q.type)
      )
    )));
  }, { nav: 'review' });
})();
