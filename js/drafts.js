/* ==========================================================================
   drafts.js — unpublished edits made in the editor.
   Stored in the browser (IndexedDB) so nothing is lost on refresh.
   A draft is a JSON file, an image Blob, or a "deleted" marker, keyed by the
   path it has in the repository, e.g.
     content/subjects/biochemistry/lesson-1.json
     content/subjects/biochemistry/images/CARB_MCQ_038.jpg
   The reader (content.js) checks drafts first, so edits show up immediately.
   After publishing, drafts stay (flagged `published`) until you clean them up,
   because the website needs about a minute to show the new version.
   ========================================================================== */
(function () {
  'use strict';
  const QZ = (window.QZ = window.QZ || {});
  const DB = 'quizhub-drafts', STORE = 'files';
  const mem = new Map(); // path -> {path, kind:'json'|'blob'|'deleted', value, updated, published}
  let db = null;
  let persistent = false;

  function open() {
    return new Promise((resolve) => {
      if (!window.indexedDB) return resolve(null);
      let req;
      try { req = indexedDB.open(DB, 1); } catch (e) { return resolve(null); }
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'path' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
  }
  function tx(mode, fn) {
    return new Promise((resolve) => {
      if (!db) return resolve();
      try {
        const t = db.transaction(STORE, mode);
        fn(t.objectStore(STORE));
        t.oncomplete = () => resolve();
        t.onerror = () => resolve();
        t.onabort = () => resolve();
      } catch (e) { resolve(); }
    });
  }
  async function put(rec) { mem.set(rec.path, rec); await tx('readwrite', (s) => s.put(rec)); }

  QZ.drafts = {
    get persistent() { return persistent; },

    async init() {
      db = await open();
      persistent = !!db;
      if (!db) return;
      await new Promise((resolve) => {
        try {
          const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
          req.onsuccess = () => { (req.result || []).forEach((r) => mem.set(r.path, r)); resolve(); };
          req.onerror = () => resolve();
        } catch (e) { resolve(); }
      });
    },

    has(path) { return mem.has(path); },
    isDeleted(path) { const r = mem.get(path); return !!r && r.kind === 'deleted'; },
    /* JSON draft (deep copy so callers can't change it by accident), or null */
    getJSON(path) { const r = mem.get(path); return r && r.kind === 'json' ? JSON.parse(JSON.stringify(r.value)) : null; },
    getBlob(path) { const r = mem.get(path); return r && r.kind === 'blob' ? r.value : null; },
    updatedAt(path) { const r = mem.get(path); return r ? r.updated : 0; },

    putJSON(path, obj) { return put({ path, kind: 'json', value: JSON.parse(JSON.stringify(obj)), updated: Date.now(), published: false }); },
    putBlob(path, blob) { return put({ path, kind: 'blob', value: blob, updated: Date.now(), published: false }); },
    markDeleted(path) { return put({ path, kind: 'deleted', value: null, updated: Date.now(), published: false }); },
    async remove(path) { mem.delete(path); await tx('readwrite', (s) => s.delete(path)); },
    async clear() { mem.clear(); await tx('readwrite', (s) => s.clear()); },

    /* After a successful publish: keep them (the site needs a minute) but flag them. */
    async markPublished(paths) {
      for (const p of paths) { const r = mem.get(p); if (r) { r.published = true; await put(r); } }
    },
    async clearPublished() {
      for (const r of Array.from(mem.values())) if (r.published) await QZ.drafts.remove(r.path);
    },

    /* [{path, kind, size, updated, published}] */
    list() {
      return Array.from(mem.values())
        .map((r) => ({ path: r.path, kind: r.kind, updated: r.updated, published: !!r.published, size: r.kind === 'blob' ? r.value.size : r.kind === 'json' ? JSON.stringify(r.value).length : 0 }))
        .sort((a, b) => (a.path < b.path ? -1 : 1));
    },
    pendingCount() { return Array.from(mem.values()).filter((r) => !r.published).length; },
    count() { return mem.size; },

    /* Files to export/publish (only not-yet-published ones by default):
       [{path, kind, blob|text|null}] */
    files(includePublished) {
      return Array.from(mem.values())
        .filter((r) => includePublished || !r.published)
        .map((r) => ({
          path: r.path,
          kind: r.kind,
          blob: r.kind === 'blob' ? r.value : null,
          text: r.kind === 'json' ? JSON.stringify(r.value, null, 2) + '\n' : null,
        }));
    },
  };
})();
