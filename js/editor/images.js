/* ==========================================================================
   editor/images.js — the easy image picker.
   Pick from gallery, take a photo, paste (Ctrl+V / long-press paste) or drag &
   drop. The image is shrunk automatically and saved as a normal file next to
   the subject (no more Base64 text inside the questions).
   ========================================================================== */
(function () {
  'use strict';
  const QZ = window.QZ;
  const { h, fmtBytes } = QZ.util;
  const UI = QZ.ui;

  const MAX_SIDE = 1400; // longest side in pixels
  const QUALITY = 0.85;

  function loadBitmap(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file).catch(() => viaImg(file));
    }
    return viaImg(file);
  }
  function viaImg(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  /* file -> {blob, ext, before, after} (shrunk). SVG/GIF are kept as they are. */
  QZ.processImage = async function (file) {
    const before = file.size;
    if (/svg|gif/i.test(file.type)) {
      return { blob: file, ext: /svg/i.test(file.type) ? 'svg' : 'gif', before, after: before };
    }
    const bmp = await loadBitmap(file);
    const w0 = bmp.width, h0 = bmp.height;
    const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale)), hh = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = hh;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // transparent PNGs become white (chemical structures stay readable)
    ctx.fillRect(0, 0, w, hh);
    ctx.drawImage(bmp, 0, 0, w, hh);
    if (bmp.close) bmp.close();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', QUALITY));
    if (!blob) throw new Error('encode');
    // if "shrinking" made a small file bigger, keep the original type
    if (blob.size >= before && scale === 1 && /jpe?g|png|webp/i.test(file.type)) {
      return { blob: file, ext: /png/i.test(file.type) ? 'png' : /webp/i.test(file.type) ? 'webp' : 'jpg', before, after: before };
    }
    return { blob, ext: 'jpg', before, after: blob.size };
  };

  /* Image field for the question form.
     api: {subjectId, qid(), get() -> ref|undefined, set(ref|undefined), change()} */
  QZ.imageField = function (api) {
    const t = QZ.t;
    const previewHost = h('div', { class: 'img-preview' });
    const status = h('p', { class: 'hint', 'aria-live': 'polite' });
    const fileIn = h('input', { type: 'file', accept: 'image/*', hidden: true });
    const camIn = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
    const drop = h('div', { class: 'img-drop', tabindex: '0', role: 'button', 'aria-label': t('ed.pickImage'), onclick: () => fileIn.click(), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } } },
      QZ.icon('image', 28), h('span', null, t('ed.pasteHint')));

    function redraw() {
      previewHost.textContent = '';
      const ref = api.get();
      if (!ref) { previewHost.appendChild(drop); return; }
      previewHost.appendChild(h('img', { class: 'img-thumb', src: QZ.content.imageURL(api.subjectId, ref), alt: '' }));
    }
    async function take(file) {
      if (!file || !/^image\//.test(file.type)) { UI.toast(t('ed.imageFail'), 'error'); return; }
      status.textContent = t('ed.imageProcessing');
      try {
        const r = await QZ.processImage(file);
        const name = api.qid().replace(/[^A-Za-z0-9_-]/g, '_') + '-' + Date.now().toString(36).slice(-4) + '.' + r.ext;
        const path = QZ.content.imagePath(api.subjectId, 'images/' + name);
        await QZ.drafts.putBlob(path, r.blob);
        api.set('images/' + name);
        const msg = t('ed.imageSaved', { a: fmtBytes(r.before), b: fmtBytes(r.after) });
        status.textContent = msg;
        UI.toast(msg);
        redraw(); api.change();
      } catch (e) { console.error(e); status.textContent = ''; UI.toast(t('ed.imageFail'), 'error'); }
    }
    fileIn.addEventListener('change', () => { take(fileIn.files[0]); fileIn.value = ''; });
    camIn.addEventListener('change', () => { take(camIn.files[0]); camIn.value = ''; });

    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
    drop.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) take(f); });

    /* Paste anywhere on the page while this form is open */
    const onPaste = (e) => {
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (const it of items) {
        if (it.kind === 'file' && /^image\//.test(it.type)) { e.preventDefault(); take(it.getAsFile()); return; }
      }
    };
    document.addEventListener('paste', onPaste);
    QZ.router.onLeave(() => document.removeEventListener('paste', onPaste));

    const wrap = h('div', { class: 'img-field' },
      previewHost,
      h('div', { class: 'btn-row' },
        UI.btn(t('ed.pickImage'), { icon: 'upload', variant: 'soft', small: true, onClick: () => fileIn.click() }),
        UI.btn(t('ed.takePhoto'), { icon: 'camera', variant: 'soft', small: true, onClick: () => camIn.click() }),
        UI.btn(t('ed.removeImage'), { icon: 'trash', variant: 'ghost', small: true, cls: 'img-remove', onClick: () => { api.set(undefined); status.textContent = ''; redraw(); api.change(); } })
      ),
      status, fileIn, camIn
    );
    const removeBtn = wrap.querySelector('.img-remove');
    const origRedraw = redraw;
    redraw = function () { origRedraw(); removeBtn.hidden = !api.get(); };
    redraw();
    return wrap;
  };
})();
