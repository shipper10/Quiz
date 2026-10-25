/* ==========================================================================
   editor/publish.js — get drafts out of the browser:
     • exportZip()  → a .zip you can unzip into the project folder
     • publish()    → one commit to GitHub through the web API (needs a token)
   ========================================================================== */
(function () {
  'use strict';
  const QZ = window.QZ;

  /* ---------------- minimal ZIP writer (no compression) ---------------- */
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  })();

  async function toBytes(f) {
    if (f.blob) return new Uint8Array(await f.blob.arrayBuffer());
    return new TextEncoder().encode(f.text || '');
  }

  async function makeZip(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    const d = new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const name = enc.encode(f.path);
      const data = f.bytes;
      const crc = CRC(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    let csize = 0; central.forEach((c) => (csize += c.length));
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }

  /* ---------------- GitHub helpers ---------------- */
  function b64(bytes) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  async function gh(cfg, method, path, body) {
    const res = await fetch('https://api.github.com/repos/' + cfg.repo + path, {
      method,
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + cfg.token, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let msg = res.status + '';
      try { const j = await res.json(); msg += ' ' + (j.message || ''); } catch (e) { /* ignore */ }
      if (res.status === 401 || res.status === 403) msg += ' — token?';
      if (res.status === 404) msg += ' — repo/branch/token permissions?';
      throw new Error(msg);
    }
    return res.json();
  }

  QZ.publish = {
    /* Default repository guessed from the page address (GitHub Pages) */
    guessRepo() {
      const m = location.hostname.match(/^([^.]+)\.github\.io$/);
      if (m) { const repo = location.pathname.split('/')[1]; if (repo) return m[1] + '/' + repo; }
      return 'shipper10/Quiz';
    },

    async exportZip() {
      const drafts = QZ.drafts.files(false);
      const files = [];
      const deleted = [];
      for (const f of drafts) {
        if (f.kind === 'deleted') { deleted.push(f.path); continue; }
        files.push({ path: f.path, bytes: await toBytes(f) });
      }
      if (deleted.length) files.push({ path: 'DELETED-files.txt', bytes: new TextEncoder().encode('Delete these files from the project:\n' + deleted.join('\n') + '\n') });
      return makeZip(files);
    },

    /* cfg: {repo, branch, token, message}; onProgress(i, n) */
    async publish(cfg, onProgress) {
      const files = QZ.drafts.files(false);
      if (!files.length) throw new Error(QZ.t('ed.publishNothing'));
      const branch = cfg.branch || 'main';
      const ref = await gh(cfg, 'GET', '/git/ref/heads/' + encodeURIComponent(branch));
      const parentSha = ref.object.sha;
      const parent = await gh(cfg, 'GET', '/git/commits/' + parentSha);
      const tree = [];
      let i = 0;
      /* Only ask GitHub to delete files that really exist in the repository (a lesson created and
         deleted before publishing was never there). */
      let existing = null;
      if (files.some((f) => f.kind === 'deleted')) {
        const full = await gh(cfg, 'GET', '/git/trees/' + parent.tree.sha + '?recursive=1');
        existing = new Set((full.tree || []).map((x) => x.path));
      }
      for (const f of files) {
        if (f.kind === 'deleted') {
          if (existing.has(f.path)) tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null });
          i++; continue;
        }
        const bytes = await toBytes(f);
        const blob = await gh(cfg, 'POST', '/git/blobs', { content: b64(bytes), encoding: 'base64' });
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
        i++; if (onProgress) onProgress(i, files.length);
      }
      if (!tree.length) { await QZ.drafts.markPublished(files.map((f) => f.path)); return 0; }
      const newTree = await gh(cfg, 'POST', '/git/trees', { base_tree: parent.tree.sha, tree });
      const commit = await gh(cfg, 'POST', '/git/commits', { message: cfg.message || 'Update content', tree: newTree.sha, parents: [parentSha] });
      await gh(cfg, 'PATCH', '/git/refs/heads/' + encodeURIComponent(branch), { sha: commit.sha });
      await QZ.drafts.markPublished(files.map((f) => f.path));
      return files.length;
    },
  };
})();
