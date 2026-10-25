/* ==========================================================================
   main.js — start the app.
   ========================================================================== */
(async function () {
  'use strict';
  const QZ = window.QZ;
  try {
    QZ.settings.apply();
    await QZ.drafts.init();
    QZ.progress.migrateLegacy();
    QZ.shell.mount();
    QZ.router.start();
    if (window.matchMedia) {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (QZ.settings.get('theme') === 'auto') { QZ.settings.apply(); QZ.ui.refreshThemeIcon(); } });
    }
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.QZ_BUNDLE) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode is optional */ });
    }
  } catch (e) {
    console.error(e);
    const app = document.getElementById('app');
    if (app) app.innerHTML = '<div style="padding:24px;font-family:sans-serif"><h1>Error</h1><pre style="white-space:pre-wrap">' + String(e && e.stack ? e.stack : e).replace(/</g, '&lt;') + '</pre></div>';
  }
})();
