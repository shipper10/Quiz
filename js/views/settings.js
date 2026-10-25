/* ==========================================================================
   views/settings.js — language, theme, progress backup.
   ========================================================================== */
(function () {
  'use strict';
  const QZ = window.QZ;
  const { h, download, readFileText } = QZ.util;
  const UI = QZ.ui, F = QZ.forms;

  QZ.router.add('/settings', async (params, query, root) => {
    const t = QZ.t;
    UI.setTitle(t('set.title'));
    root.appendChild(UI.pageHead(t('set.title')));

    root.appendChild(h('section', { class: 'card' },
      F.field(t('set.language'), F.segmented('lang', [{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }], QZ.settings.get('lang'), (v) => { QZ.settings.set('lang', v); UI.rebuild(); }, { ariaLabel: t('set.language') })),
      F.field(t('set.theme'), F.segmented('theme', [{ value: 'auto', label: t('set.auto') }, { value: 'light', label: t('set.light') }, { value: 'dark', label: t('set.dark') }], QZ.settings.get('theme'), (v) => { QZ.settings.set('theme', v); UI.refreshThemeIcon(); }, { ariaLabel: t('set.theme') }))
    ));

    const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    fileIn.addEventListener('change', async () => {
      const f = fileIn.files[0];
      if (!f) return;
      try { QZ.progress.importData(JSON.parse(await readFileText(f))); UI.toast(t('set.imported')); UI.updateReviewBadge(); }
      catch (e) { UI.toast(t('set.importFail'), 'error'); }
      fileIn.value = '';
    });
    root.appendChild(h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, t('set.progress')),
      h('p', { class: 'hint' }, t('set.progressHint')),
      h('div', { class: 'btn-row' },
        UI.btn(t('set.exportProgress'), { icon: 'download', variant: 'soft', onClick: () => download(new Blob([JSON.stringify(QZ.progress.exportData(), null, 2)], { type: 'application/json' }), 'quiz-progress.json') }),
        UI.btn(t('set.importProgress'), { icon: 'upload', variant: 'soft', onClick: () => fileIn.click() }),
        UI.btn(t('set.resetProgress'), { icon: 'trash', variant: 'danger', onClick: async () => { if (await UI.confirm(t('set.resetConfirm'), { danger: true, okLabel: t('common.delete') })) { QZ.progress.reset(); QZ.session.clear(); UI.updateReviewBadge(); UI.toast(t('set.reset')); } } })
      ),
      fileIn
    ));
    root.appendChild(h('section', { class: 'card' }, h('h2', { class: 'card-title' }, t('set.about')), h('p', null, t('set.aboutText'))));
  }, { nav: 'settings' });
})();
