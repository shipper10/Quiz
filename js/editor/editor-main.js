/* ==========================================================================
   editor/editor-main.js — editor home: site title, years / semesters /
   subjects, and the unpublished-changes panel (publish, export, discard).
   ========================================================================== */
(function () {
  'use strict';
  const QZ = window.QZ;
  const { h, tr, fmtBytes, download } = Object.assign({}, QZ.util, { tr: QZ.util.tr });
  const UI = QZ.ui, F = QZ.forms, E = QZ.editorData;

  UI.refreshDraftBadge = function () { /* hook: pages that show the pending count can override */ };

  QZ.router.add('/editor', async (params, query, root) => {
    const t = QZ.t;
    if (!QZ.editorMode.on()) { QZ.editorMode.set(true); UI.rebuildFrame(); } // supervisor opened the editor: show its menu link
    UI.setTitle(t('ed.title'));
    root.appendChild(UI.pageHead(t('ed.title'), t('ed.intro'), [UI.btn(t('ed.hideHere'), { icon: 'eye', variant: 'ghost', small: true, onClick: () => { QZ.editorMode.set(false); QZ.publishCfg.clear(); UI.rebuildFrame(); QZ.router.go('/'); UI.toast(t('ed.hiddenDone')); } })]));
    root.appendChild(h('p', { class: 'note' }, QZ.icon('info', 18), h('span', null, t('ed.sharedNote') + (QZ.drafts.persistent ? '' : ' ⚠ (IndexedDB unavailable — drafts will be lost on reload)'))));

    const draftsHost = h('section', { class: 'card' });
    const catalogHost = h('section', { class: 'card' });
    root.appendChild(draftsHost);
    root.appendChild(catalogHost);
    drawDrafts(draftsHost);
    await drawCatalog(catalogHost, draftsHost);
  }, { nav: 'editor' });

  /* ------------------------------------------------------------------ */
  function drawDrafts(host) {
    const t = QZ.t;
    host.textContent = '';
    const list = QZ.drafts.list();
    const pending = list.filter((d) => !d.published);
    const published = list.filter((d) => d.published);
    host.appendChild(h('h2', { class: 'card-title' }, t('ed.drafts') + (pending.length ? ' (' + pending.length + ')' : '')));
    if (!list.length) { host.appendChild(h('p', { class: 'hint' }, t('ed.noDrafts'))); return; }

    host.appendChild(h('div', { class: 'btn-row' },
      UI.btn(t('ed.publish'), { icon: 'cloud', variant: 'primary', disabled: !pending.length, onClick: () => publishDialog(host) }),
      UI.btn(t('ed.exportZip'), { icon: 'download', variant: 'soft', disabled: !pending.length, onClick: async () => { download(await QZ.publish.exportZip(), 'quiz-content-' + new Date().toISOString().slice(0, 10) + '.zip'); UI.toast(t('ed.exported')); } }),
      UI.btn(t('ed.discard'), { icon: 'trash', variant: 'danger', onClick: async () => { if (await UI.confirm(t('ed.discardConfirm'), { danger: true, okLabel: t('common.delete') })) { await QZ.drafts.clear(); QZ.content.clearCache(); UI.toast(t('ed.discarded')); QZ.router.refresh(); } } })
    ));
    if (published.length) {
      host.appendChild(h('p', { class: 'hint' }, t('ed.clearAfter') + ': ' + published.length + ' — ',
        h('button', { class: 'link-btn', type: 'button', onclick: async () => { await QZ.drafts.clearPublished(); QZ.content.clearCache(); QZ.router.refresh(); } }, t('common.delete'))));
    }
    host.appendChild(h('details', { class: 'drafts-list' }, h('summary', null, t('ed.files', { n: list.length })),
      h('ul', null, list.map((d) => h('li', null, h('code', null, d.path.replace(/^content\//, '')), ' ', h('span', { class: 'hint' }, (d.kind === 'deleted' ? '✕ ' : '') + (d.size ? fmtBytes(d.size) : '') + (d.published ? ' ✓' : ''))))
      )));
  }

  function publishDialog(draftsHost) {
    const t = QZ.t;
    const saved = QZ.publishCfg.load();
    const cfg = { repo: saved.repo || QZ.publish.guessRepo(), branch: saved.branch || 'main', token: saved.token || '', message: 'Update content', remember: !!saved.token };
    const status = h('p', { class: 'hint', 'aria-live': 'polite' });
    const body = h('div', { class: 'form-stack' },
      h('p', { class: 'hint' }, t('ed.publishHint')),
      F.field(t('ed.repo'), F.input({ value: cfg.repo, dir: 'ltr', onInput: (v) => (cfg.repo = v.trim()) })),
      F.field(t('ed.branch'), F.input({ value: cfg.branch, dir: 'ltr', onInput: (v) => (cfg.branch = v.trim()) })),
      F.field(t('ed.token'), F.input({ value: cfg.token, type: 'password', dir: 'ltr', onInput: (v) => (cfg.token = v.trim()) }), { hint: t('ed.tokenHint') }),
      F.field(t('ed.commitMsg'), F.input({ value: cfg.message, dir: 'auto', onInput: (v) => (cfg.message = v) })),
      F.checkbox(t('ed.rememberToken'), cfg.remember, (v) => (cfg.remember = v)),
      status
    );
    let m;
    const go = UI.btn(t('ed.publish'), { icon: 'cloud', variant: 'primary', onClick: async () => {
      if (!cfg.repo || !cfg.token) { status.textContent = t('ed.token'); return; }
      go.disabled = true;
      try {
        QZ.publishCfg.save({ repo: cfg.repo, branch: cfg.branch, token: cfg.remember ? cfg.token : '' });
        const n = await QZ.publish.publish(cfg, (i, total) => { status.textContent = t('ed.publishing', { i, n: total }); });
        m.close();
        UI.toast(t('ed.publishDone', { n }));
        drawDrafts(draftsHost);
      } catch (e) {
        status.textContent = t('ed.publishFail', { e: e.message });
        go.disabled = false;
      }
    } });
    m = UI.modal({ title: t('ed.publishTitle'), body, actions: [UI.btn(t('common.cancel'), { variant: 'ghost', onClick: () => m.close() }), go], persistent: true });
  }

  /* ------------------------------------------------------------------ */
  async function drawCatalog(host, draftsHost) {
    const t = QZ.t;
    const catalog = await E.catalog();
    catalog.years = catalog.years || [];
    const persist = async () => { await E.saveCatalog(catalog); redraw(); };
    const subjectTitles = new Map();
    for (const id of QZ.content.subjectIdsOf(catalog)) { try { subjectTitles.set(id, (await QZ.content.subject(id)).title); } catch (e) { subjectTitles.set(id, id); } }

    function redraw() {
      host.textContent = '';
      host.appendChild(h('h2', { class: 'card-title' }, t('ed.catalog')));
      host.appendChild(F.field(t('ed.siteTitle'), F.input({ value: tr(catalog.title), onInput: QZ.util.debounce(async (v) => { catalog.title = v; await E.saveCatalog(catalog); }, 500) })));

      catalog.years.forEach((year, yi) => {
        const ySem = h('div', { class: 'sem-list' });
        year.semesters = year.semesters || [];
        year.semesters.forEach((sem, si) => {
          sem.subjects = sem.subjects || [];
          ySem.appendChild(h('div', { class: 'sem-box' },
            h('div', { class: 'sem-head' },
              h('strong', null, tr(sem.title)),
              h('div', { class: 'row-ctl' },
                UI.iconBtn('edit', t('ed.rename'), async () => { const v = await UI.prompt(t('ed.semName'), tr(sem.title)); if (v) { sem.title = v; persist(); } }, 'icon-btn-sm'),
                si > 0 ? UI.iconBtn('arrow-up', t('common.moveUp'), () => { F.moveItem(year.semesters, si, -1); persist(); }, 'icon-btn-sm') : null,
                si < year.semesters.length - 1 ? UI.iconBtn('arrow-down', t('common.moveDown'), () => { F.moveItem(year.semesters, si, 1); persist(); }, 'icon-btn-sm') : null,
                UI.iconBtn('trash', t('common.delete'), async () => { if (await UI.confirm(t('ed.deleteConfirm'), { danger: true, okLabel: t('common.delete') })) { year.semesters.splice(si, 1); persist(); } }, 'icon-btn-sm danger')
              )
            ),
            h('ul', { class: 'subj-list' }, sem.subjects.map((id, k) =>
              h('li', null,
                h('a', { class: 'subj-link', href: '#/editor/subject/' + id, dir: 'auto' }, QZ.icon('book', 18), h('span', null, subjectTitles.get(id) || id)),
                h('div', { class: 'row-ctl' },
                  k > 0 ? UI.iconBtn('arrow-up', t('common.moveUp'), () => { F.moveItem(sem.subjects, k, -1); persist(); }, 'icon-btn-sm') : null,
                  k < sem.subjects.length - 1 ? UI.iconBtn('arrow-down', t('common.moveDown'), () => { F.moveItem(sem.subjects, k, 1); persist(); }, 'icon-btn-sm') : null,
                  UI.iconBtn('x', t('ed.removeFromSem'), () => { sem.subjects.splice(k, 1); persist(); }, 'icon-btn-sm')
                )
              )
            )),
            sem.subjects.length ? null : h('p', { class: 'hint' }, t('ed.noSubjects')),
            h('div', { class: 'btn-row' },
              UI.btn(t('ed.newSubject'), { icon: 'plus', variant: 'soft', small: true, onClick: async () => {
                const name = await UI.prompt(t('ed.subjectName'), '');
                if (!name) return;
                const id = E.uniqueSubjectId(name, catalog);
                await E.createSubject(id, name);
                sem.subjects.push(id);
                subjectTitles.set(id, name);
                await E.saveCatalog(catalog);
                QZ.router.go('/editor/subject/' + id);
              } }),
              attachButton(sem)
            )
          ));
        });
        host.appendChild(h('div', { class: 'year-box' },
          h('div', { class: 'year-head' },
            h('h3', { class: 'year-title' }, tr(year.title)),
            h('div', { class: 'row-ctl' },
              UI.iconBtn('edit', t('ed.rename'), async () => { const v = await UI.prompt(t('ed.yearName'), tr(year.title)); if (v) { year.title = v; persist(); } }, 'icon-btn-sm'),
              yi > 0 ? UI.iconBtn('arrow-up', t('common.moveUp'), () => { F.moveItem(catalog.years, yi, -1); persist(); }, 'icon-btn-sm') : null,
              yi < catalog.years.length - 1 ? UI.iconBtn('arrow-down', t('common.moveDown'), () => { F.moveItem(catalog.years, yi, 1); persist(); }, 'icon-btn-sm') : null,
              UI.iconBtn('trash', t('common.delete'), async () => { if (await UI.confirm(t('ed.deleteConfirm'), { danger: true, okLabel: t('common.delete') })) { catalog.years.splice(yi, 1); persist(); } }, 'icon-btn-sm danger')
            )
          ),
          ySem,
          UI.btn(t('ed.addSemester'), { icon: 'plus', variant: 'ghost', small: true, onClick: async () => {
            const v = await UI.prompt(t('ed.semName'), '');
            if (!v) return;
            year.semesters.push({ id: year.id + '-sem-' + (year.semesters.length + 1) + '-' + QZ.util.uid('').slice(1, 4), title: v, subjects: [] });
            persist();
          } })
        ));
      });
      host.appendChild(UI.btn(t('ed.addYear'), { icon: 'plus', variant: 'primary', onClick: async () => {
        const v = await UI.prompt(t('ed.yearName'), '');
        if (!v) return;
        catalog.years.push({ id: 'year-' + (catalog.years.length + 1) + '-' + QZ.util.uid('').slice(1, 4), title: v, semesters: [] });
        persist();
      } }));
    }

    function attachButton(sem) {
      const others = QZ.content.subjectIdsOf(catalog).filter((id) => sem.subjects.indexOf(id) < 0);
      if (!others.length) return null;
      return UI.btn(t('ed.attachSubject'), { icon: 'folder', variant: 'ghost', small: true, onClick: () => {
        let pick = others[0];
        const sel = F.select(others.map((id) => ({ value: id, label: subjectTitles.get(id) || id })), pick, (v) => (pick = v));
        let m;
        m = UI.modal({ title: t('ed.attachSubject'), body: F.field(null, sel), actions: [UI.btn(t('common.cancel'), { variant: 'ghost', onClick: () => m.close() }), UI.btn(t('common.add'), { variant: 'primary', onClick: () => { sem.subjects.push(pick); m.close(); persist(); } })] });
      } });
    }
    redraw();
  }
})();
