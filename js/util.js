/* ==========================================================================
   util.js — small helpers shared by every other file.
   Everything lives under the global namespace `QZ` (no build step needed).
   ========================================================================== */
(function () {
  'use strict';
  const QZ = (window.QZ = window.QZ || {});
  const U = (QZ.util = {});

  /* ---------- HTML escaping ---------- */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  U.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

  /* ---------- Rich text for question content ----------
     Content is plain text. We escape it first, then allow a tiny, safe markup:
       **bold**            -> bold
       new lines           -> line breaks
       $H_2O$  $Ca^{2+}$   -> subscripts / superscripts (+ greek names like alpha)
     Nothing from the JSON is ever inserted as raw HTML. */
  const GREEK = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', mu: 'μ',
    lambda: 'λ', pi: 'π', sigma: 'σ', omega: 'ω', theta: 'θ', Delta: 'Δ',
  };
  function mathToHtml(s) {
    s = s.replace(/\\text\{([^}]*)\}/g, '$1');
    s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1⁄$2');
    s = s.replace(/\^\\circ/g, '°');
    s = s.replace(/\\([A-Za-z]+)/g, (m, w) => GREEK[w] || w);
    // (no look-behind: older phones/Safari would fail to parse the whole file)
    s = s.replace(/(^|[^A-Za-z])(alpha|beta|gamma|delta|epsilon|mu|lambda|pi|sigma|omega|theta)(?![a-z])/g, (m, pre, w) => pre + GREEK[w]);
    s = s.replace(/_\{([^}]*)\}/g, '<sub>$1</sub>').replace(/\^\{([^}]*)\}/g, '<sup>$1</sup>');
    s = s.replace(/_([A-Za-z0-9α-ω])/g, '<sub>$1</sub>').replace(/\^([A-Za-z0-9+\-])/g, '<sup>$1</sup>');
    return s;
  }
  U.fmt = (text) => {
    let s = U.esc(text);
    s = s.replace(/\$([^$\n]+)\$/g, (m, inner) => '<span class="math">' + mathToHtml(inner) + '</span>');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    return s.replace(/\n/g, '<br>');
  };
  /* Plain-text version (for search, page titles, truncation) */
  U.plain = (text) => String(text == null ? '' : text).replace(/\$([^$\n]+)\$/g, '$1').replace(/\*\*/g, '');
  U.truncate = (s, n) => { s = U.plain(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n).trimEnd() + '…' : s; };

  /* ---------- DOM builder ----------
     h('div', {class:'x', onclick: fn}, 'text', childNode, [more children]) */
  U.h = function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    U.append(el, kids);
    return el;
  };
  U.append = function append(el, kids) {
    for (const k of kids) {
      if (k == null || k === false) continue;
      if (Array.isArray(k)) append(el, k);
      else if (k instanceof Node) el.appendChild(k);
      else el.appendChild(document.createTextNode(String(k)));
    }
    return el;
  };
  U.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------- Misc ---------- */
  U.shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  U.clone = (o) => JSON.parse(JSON.stringify(o));
  U.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  U.uid = (prefix) => (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 8);
  U.slug = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9؀-ۿ]+/g, '-').replace(/^-+|-+$/g, '');
  /* Safe id for use in file names / ids (ascii only). */
  U.asciiSlug = (s, fallback) => {
    const out = String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return out || fallback || U.uid('x');
  };
  U.pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
  U.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  U.fmtBytes = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
  U.download = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
  U.readFileText = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });

  /* Titles in the catalog can be plain strings or {ar:'..', en:'..'}. */
  U.tr = (v) => {
    if (v && typeof v === 'object') return v[QZ.i18n ? QZ.i18n.lang : 'ar'] || v.ar || v.en || '';
    return v == null ? '' : String(v);
  };

  /* ---------- Icons (inline SVG, Lucide-style strokes) ---------- */
  const P = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    'chevron-right': '<path d="M9 6l6 6-6 6"/>',
    'chevron-left': '<path d="M15 6l-6 6 6 6"/>',
    'chevron-down': '<path d="M6 9l6 6 6-6"/>',
    'chevron-up': '<path d="M6 15l6-6 6 6"/>',
    'arrow-left': '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    'arrow-right': '<path d="M5 12h14M12 5l7 7-7 7"/>',
    'arrow-up': '<path d="M12 19V5M5 12l7-7 7 7"/>',
    'arrow-down': '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    camera: '<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    star: '<path d="M12 2l3 7 7 .5-5.3 4.6L18.5 22 12 18l-6.5 4 1.8-7.9L2 9.5 9 9z"/>',
    refresh: '<path d="M3 12a9 9 0 0115-6.7L21 8M21 3v5h-5M21 12a9 9 0 01-15 6.7L3 16M3 21v-5h5"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>',
    folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
    sliders: '<path d="M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2"/><circle cx="14" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18 14 14 0 010-18"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    cloud: '<path d="M16 16l-4-4-4 4M12 12v9"/><path d="M20.4 18.4A5 5 0 0018 9h-1.3A8 8 0 104 16.3"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    undo: '<path d="M3 7v6h6M21 17a9 9 0 00-15-6.7L3 13"/>',
    layers: '<path d="M12 2l10 5-10 5L2 7z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',
    code: '<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>',
    zoom: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/>',
    skip: '<path d="M5 4l10 8-10 8zM19 5v14"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 005 5L21 13l-8 8-4-4 8-8zM3 21l4-4"/>',
  };
  QZ.icon = function icon(name, size) {
    const s = size || 20;
    const wrap = document.createElement('span');
    wrap.className = 'ico';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      (P[name] || P.info) + '</svg>';
    return wrap;
  };
  QZ.iconNames = Object.keys(P);
})();
