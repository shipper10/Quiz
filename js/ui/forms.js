/* ==========================================================================
   ui/forms.js — small reusable form + button builders (used by the editor
   and by the editor widgets inside each question type).
   ========================================================================== */
(function () {
  'use strict';
  const QZ = (window.QZ = window.QZ || {});
  const { h, uid, debounce } = QZ.util;
  const F = (QZ.forms = {});
  const UI = (QZ.ui = QZ.ui || {});

  /* ---------- buttons ---------- */
  /* UI.btn('Save', {icon:'save', variant:'primary'|'ghost'|'danger'|'soft', onClick, small, href}) */
  UI.btn = function (label, o) {
    o = o || {};
    const tag = o.href ? 'a' : 'button';
    const el = h(tag, {
      class: 'btn' + (o.variant ? ' btn-' + o.variant : '') + (o.small ? ' btn-sm' : '') + (o.block ? ' btn-block' : '') + (o.cls ? ' ' + o.cls : ''),
      type: o.href ? null : o.type || 'button',
      href: o.href || null,
      disabled: o.disabled ? true : null,
      title: o.title || null,
      onclick: o.onClick || null,
    });
    if (o.icon) el.appendChild(QZ.icon(o.icon, o.small ? 16 : 18));
    if (label) el.appendChild(h('span', { class: 'btn-label' }, label));
    return el;
  };
  /* Icon-only button (always has an accessible name) */
  UI.iconBtn = function (icon, label, onClick, cls) {
    const el = h('button', { class: 'icon-btn' + (cls ? ' ' + cls : ''), type: 'button', 'aria-label': label, title: label, onclick: onClick });
    el.appendChild(QZ.icon(icon, 20));
    return el;
  };

  /* ---------- fields ---------- */
  F.field = function (label, control, o) {
    o = o || {};
    const id = o.id || uid('f');
    const first = control.matches && control.matches('input,textarea,select') ? control : control.querySelector && control.querySelector('input,textarea,select');
    if (first && !first.id) first.id = id;
    return h('div', { class: 'field' + (o.cls ? ' ' + o.cls : '') },
      label ? h('label', { class: 'label', for: first ? first.id : null }, label, o.optional ? h('span', { class: 'label-opt' }, ' · ' + QZ.t('common.optional')) : null) : null,
      control,
      o.hint ? h('p', { class: 'hint' }, o.hint) : null
    );
  };
  F.input = function (o) {
    o = o || {};
    const el = h('input', { class: 'input', type: o.type || 'text', value: o.value == null ? '' : o.value, placeholder: o.placeholder || null, dir: o.dir || null, autocomplete: 'off', 'aria-label': o.ariaLabel || null, min: o.min, max: o.max });
    if (o.onInput) el.addEventListener('input', () => o.onInput(el.value, el));
    return el;
  };
  F.textarea = function (o) {
    o = o || {};
    const el = h('textarea', { class: 'input textarea', rows: o.rows || 3, placeholder: o.placeholder || null, dir: o.dir || null, 'aria-label': o.ariaLabel || null });
    el.value = o.value == null ? '' : o.value;
    const grow = () => { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight + 2, 420) + 'px'; };
    el.addEventListener('input', () => { grow(); if (o.onInput) o.onInput(el.value, el); });
    setTimeout(grow, 0);
    requestAnimationFrame(grow);
    return el;
  };
  F.select = function (options, value, onChange, attrs) {
    const el = h('select', Object.assign({ class: 'input select' }, attrs || {}));
    options.forEach((o) => {
      const op = h('option', { value: o.value }, o.label);
      if (String(o.value) === String(value)) op.selected = true;
      el.appendChild(op);
    });
    if (onChange) el.addEventListener('change', () => onChange(el.value, el));
    return el;
  };
  F.checkbox = function (label, checked, onChange, o) {
    const id = uid('c');
    const input = h('input', { type: 'checkbox', id, class: 'check-input' });
    input.checked = !!checked;
    if (onChange) input.addEventListener('change', () => onChange(input.checked));
    return h('label', { class: 'check' + (o && o.cls ? ' ' + o.cls : ''), for: id }, input, h('span', { class: 'check-box', 'aria-hidden': 'true' }, QZ.icon('check', 14)), h('span', { class: 'check-label' }, label));
  };
  /* Segmented radio group: options = [{value,label}] */
  F.segmented = function (name, options, value, onChange, o) {
    const g = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': (o && o.ariaLabel) || null });
    options.forEach((op) => {
      const id = uid('r');
      const input = h('input', { type: 'radio', name, id, value: op.value, class: 'seg-input' });
      input.checked = String(op.value) === String(value);
      input.addEventListener('change', () => { if (input.checked && onChange) onChange(op.value); });
      g.appendChild(h('label', { class: 'seg-item', for: id }, input, h('span', { class: 'seg-label' }, op.label)));
    });
    return g;
  };

  /* Up / down / delete controls for one row of a list */
  F.rowControls = function (o) {
    return h('div', { class: 'row-ctl' },
      o.onUp ? UI.iconBtn('arrow-up', QZ.t('common.moveUp'), o.onUp, 'icon-btn-sm') : null,
      o.onDown ? UI.iconBtn('arrow-down', QZ.t('common.moveDown'), o.onDown, 'icon-btn-sm') : null,
      o.onRemove ? UI.iconBtn('trash', QZ.t('common.delete'), o.onRemove, 'icon-btn-sm danger') : null
    );
  };
  /* Move item i by delta inside array a (returns true if moved) */
  F.moveItem = function (a, i, delta) {
    const j = i + delta;
    if (j < 0 || j >= a.length) return false;
    const x = a[i]; a[i] = a[j]; a[j] = x;
    return true;
  };

  F.debounce = debounce;
})();
