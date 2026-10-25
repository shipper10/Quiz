/* ==========================================================================
   ui/shell.js — page frame (top bar, side menu), router, toasts and dialogs.
   Routes use the URL hash:  #/subject/biochemistry   #/quiz   #/editor …
   ========================================================================== */
(function () {
  'use strict';
  const QZ = (window.QZ = window.QZ || {});
  const { h, $ } = QZ.util;
  const UI = (QZ.ui = QZ.ui || {});

  /* =============== Router =============== */
  const routes = [];
  let token = 0;
  let leaveFns = [];
  let current = { path: '/', params: {}, query: {} };

  function compile(pattern) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\/:([A-Za-z]+)/g, (m, k) => { keys.push(k); return '/([^/]+)'; }).replace(/\/\*$/, '/(.*)') + '/?$');
    return { re, keys };
  }
  function parse(hash) {
    let s = (hash || '').replace(/^#/, '') || '/';
    if (s[0] !== '/') s = '/' + s;
    const qi = s.indexOf('?');
    const path = qi < 0 ? s : s.slice(0, qi);
    const query = {};
    if (qi >= 0) new URLSearchParams(s.slice(qi + 1)).forEach((v, k) => { query[k] = v; });
    return { path, query };
  }

  const R = (QZ.router = {
    /* handler(params, query, el) — fill `el`. Return nothing or a Promise.
       opts.nav = which side-menu item is highlighted ('home','review','editor','settings') */
    add(pattern, handler, opts) { routes.push(Object.assign({ pattern, handler }, compile(pattern), opts || {})); },
    go(path, replace) {
      const target = '#' + path;
      if (replace) location.replace(target); else location.hash = target;
      if (location.hash === target) R.refresh();
    },
    refresh() { render(); },
    current() { return current; },
    onLeave(fn) { leaveFns.push(fn); },
    isCurrent(t) { return t === token; },
    start() {
      window.addEventListener('hashchange', render);
      render();
    },
  });

  async function render() {
    const my = ++token;
    leaveFns.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
    leaveFns = [];
    const { path, query } = parse(location.hash);
    let match = null;
    for (const r of routes) {
      const m = r.re.exec(path);
      if (m) { match = { r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) }; break; }
    }
    const view = $('#view');
    if (!match) { match = { r: routes.find((x) => x.pattern === '/'), params: {} }; }
    current = { path, params: match.params, query };
    setNav(match.r.nav || '');
    const el = h('div', { class: 'page' });
    el.appendChild(h('div', { class: 'loading', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), QZ.t('common.loading')));
    view.textContent = '';
    view.appendChild(el);
    try {
      el.textContent = '';
      await match.r.handler(match.params, query, el);
    } catch (e) {
      console.error(e);
      if (my !== token) return;
      el.textContent = '';
      el.appendChild(h('div', { class: 'empty' }, QZ.icon('alert', 32), h('p', null, QZ.t('common.error')), h('pre', { class: 'err-detail' }, String(e && e.message ? e.message : e)), UI.btn(QZ.t('common.retry'), { icon: 'refresh', onClick: R.refresh })));
    }
    if (my !== token) return;
    window.scrollTo(0, 0);
    const main = $('#main');
    if (main) main.focus({ preventScroll: true });
    closeMenu();
  }

  /* =============== Frame =============== */
  let menuOpen = false;
  function setNav(name) {
    $('#sidebar') && QZ.util.$$('.nav-link', $('#sidebar')).forEach((a) => {
      const on = a.dataset.nav === name;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  function openMenu() { menuOpen = true; $('#sidebar').classList.add('is-open'); $('#scrim').classList.add('is-on'); $('#menu-btn').setAttribute('aria-expanded', 'true'); }
  function closeMenu() { menuOpen = false; const s = $('#sidebar'); if (!s) return; s.classList.remove('is-open'); $('#scrim').classList.remove('is-on'); $('#menu-btn').setAttribute('aria-expanded', 'false'); }

  function buildFrame() {
    const app = $('#app');
    app.textContent = '';
    const t = QZ.t;
    const link = (nav, href, icon, label, extra) =>
      h('a', { class: 'nav-link', href, 'data-nav': nav }, QZ.icon(icon, 20), h('span', { class: 'nav-label' }, label), extra || null);
    const reviewBadge = h('span', { class: 'badge', id: 'nav-review-count', hidden: true });

    app.appendChild(h('a', { class: 'skip-link', href: '#main', onclick: (e) => { e.preventDefault(); $('#main').focus(); } }, t('nav.skip')));
    app.appendChild(h('header', { class: 'topbar' },
      h('button', { class: 'icon-btn menu-btn', id: 'menu-btn', type: 'button', 'aria-label': t('nav.menu'), 'aria-expanded': 'false', 'aria-controls': 'sidebar', onclick: () => (menuOpen ? closeMenu() : openMenu()) }, QZ.icon('menu', 22)),
      h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, QZ.icon('book', 20)), h('span', { class: 'brand-name', id: 'brand-name' }, UI.siteTitle || t('app.name'))),
      h('div', { class: 'topbar-actions' },
        h('button', { class: 'btn btn-ghost btn-sm lang-btn', type: 'button', onclick: () => { QZ.settings.set('lang', QZ.i18n.lang === 'ar' ? 'en' : 'ar'); UI.rebuild(); }, 'aria-label': t('lang.toggle') }, QZ.icon('globe', 18), h('span', { class: 'btn-label' }, t('lang.toggle'))),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('theme.toggle'), title: t('theme.toggle'), onclick: () => { QZ.settings.set('theme', QZ.settings.resolvedTheme() === 'dark' ? 'light' : 'dark'); UI.refreshThemeIcon(); } }, h('span', { id: 'theme-ico' }, QZ.icon(QZ.settings.resolvedTheme() === 'dark' ? 'sun' : 'moon', 20)))
      )
    ));
    app.appendChild(h('nav', { class: 'sidebar', id: 'sidebar', 'aria-label': t('nav.menu') },
      h('div', { class: 'sidebar-inner' },
        link('home', '#/', 'home', t('nav.home')),
        link('review', '#/review', 'refresh', t('nav.review'), reviewBadge),
        h('div', { class: 'nav-sep' }),
        link('editor', '#/editor', 'edit', t('nav.editor')),
        link('settings', '#/settings', 'sliders', t('nav.settings'))
      )
    ));
    app.appendChild(h('div', { class: 'scrim', id: 'scrim', onclick: closeMenu }));
    app.appendChild(h('main', { class: 'main', id: 'main', tabindex: '-1' }, h('div', { id: 'view' })));
    app.appendChild(h('div', { class: 'toasts', id: 'toasts', role: 'status', 'aria-live': 'polite' }));
    UI.updateReviewBadge();
  }

  UI.refreshThemeIcon = function () {
    const el = $('#theme-ico');
    if (el) { el.textContent = ''; el.appendChild(QZ.icon(QZ.settings.resolvedTheme() === 'dark' ? 'sun' : 'moon', 20)); }
  };
  UI.updateReviewBadge = function () {
    const b = $('#nav-review-count');
    if (!b) return;
    const n = QZ.progress.summary().wrong;
    b.textContent = n; b.hidden = !n;
  };
  UI.setSiteTitle = function (title) {
    UI.siteTitle = title;
    const el = $('#brand-name');
    if (el) el.textContent = title || QZ.t('app.name');
  };
  UI.rebuild = function () { buildFrame(); setNav(R.current().nav || ''); R.refresh(); };
  UI.setTitle = function (title) { document.title = title ? title + ' — ' + (UI.siteTitle || QZ.t('app.name')) : UI.siteTitle || QZ.t('app.name'); };

  QZ.shell = { mount() { buildFrame(); } };

  /* =============== Toasts =============== */
  UI.toast = function (msg, type) {
    const host = $('#toasts');
    if (!host) return;
    const el = h('div', { class: 'toast' + (type ? ' toast-' + type : '') }, msg);
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-on'));
    setTimeout(() => { el.classList.remove('is-on'); setTimeout(() => el.remove(), 250); }, type === 'error' ? 5000 : 2600);
  };

  /* =============== Modal dialogs =============== */
  /* UI.modal({title, body:Node, actions:[Node], onClose, wide}) -> {close, el} */
  UI.modal = function (o) {
    const prevFocus = document.activeElement;
    const close = (val) => {
      document.removeEventListener('keydown', onKey, true);
      back.remove();
      if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
      if (o.onClose) o.onClose(val);
    };
    const titleId = QZ.util.uid('mt');
    const box = h('div', { class: 'modal' + (o.wide ? ' modal-wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': o.title ? titleId : null },
      o.title ? h('h2', { class: 'modal-title', id: titleId }, o.title) : null,
      h('div', { class: 'modal-body' }, o.body),
      o.actions && o.actions.length ? h('div', { class: 'modal-actions' }, o.actions) : null
    );
    const back = h('div', { class: 'modal-back', onmousedown: (e) => { if (e.target === back && !o.persistent) close(null); } }, box);
    function onKey(e) {
      if (e.key === 'Escape' && !o.persistent) { e.stopPropagation(); close(null); }
      else if (e.key === 'Tab') { // keep focus inside
        const f = QZ.util.$$('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])', box).filter((x) => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(back);
    const f = box.querySelector('[autofocus],input,textarea,select,button');
    if (f) f.focus({ preventScroll: true });
    return { close, el: box };
  };
  UI.confirm = function (message, o) {
    o = o || {};
    return new Promise((resolve) => {
      let m;
      const done = (v) => { m.close(v); };
      m = UI.modal({
        title: o.title || null,
        body: h('p', { class: 'modal-text' }, message),
        actions: [
          UI.btn(o.cancelLabel || QZ.t('common.cancel'), { variant: 'ghost', onClick: () => done(false) }),
          UI.btn(o.okLabel || QZ.t('common.confirm'), { variant: o.danger ? 'danger' : 'primary', onClick: () => done(true) }),
        ],
        onClose: (v) => resolve(v === true),
      });
    });
  };
  UI.prompt = function (label, value, o) {
    o = o || {};
    return new Promise((resolve) => {
      const input = QZ.forms.input({ value: value || '', dir: o.dir });
      let m;
      const ok = () => m.close(input.value.trim());
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
      m = UI.modal({
        title: label,
        body: QZ.forms.field(null, input),
        actions: [UI.btn(QZ.t('common.cancel'), { variant: 'ghost', onClick: () => m.close(null) }), UI.btn(QZ.t('common.save'), { variant: 'primary', onClick: ok })],
        onClose: (v) => resolve(v == null || v === '' ? null : v),
      });
    });
  };
  /* Full-size image viewer */
  UI.lightbox = function (src, alt) {
    const m = UI.modal({
      body: h('img', { class: 'lightbox-img', src, alt: alt || '' }),
      actions: [UI.btn(QZ.t('common.close'), { variant: 'primary', onClick: () => m.close() })],
      wide: true,
    });
  };

  /* Small reusable pieces */
  UI.empty = function (icon, text, action) {
    return h('div', { class: 'empty' }, QZ.icon(icon || 'info', 32), h('p', null, text), action || null);
  };
  UI.progressBar = function (pct, label) {
    return h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': label || null }, h('div', { class: 'progress-fill', style: { width: pct + '%' } }));
  };
  UI.stars = function (n) {
    const wrap = h('span', { class: 'stars', 'aria-label': n + '/3' });
    for (let i = 0; i < 3; i++) wrap.appendChild(h('span', { class: 'star' + (i < n ? ' on' : '') }, QZ.icon('star', 16)));
    return wrap;
  };
  UI.typeTag = function (typeId) {
    const d = QZ.types.get(typeId);
    return h('span', { class: 'tag tone-' + (d ? d.tone : 'slate') }, QZ.types.label(typeId));
  };
  UI.pageHead = function (title, sub, actions) {
    return h('div', { class: 'page-head' },
      h('div', { class: 'page-head-text' }, h('h1', { class: 'page-title' }, title), sub ? h('p', { class: 'page-sub' }, sub) : null),
      actions ? h('div', { class: 'page-head-actions' }, actions) : null
    );
  };
  UI.backLink = function (href, label) {
    return h('a', { class: 'back-link', href }, QZ.icon(QZ.i18n.lang === 'ar' ? 'arrow-right' : 'arrow-left', 18), h('span', null, label || QZ.t('nav.back')));
  };
})();
