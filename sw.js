/* Offline support.
   App files: served from the cache instantly, and refreshed in the background (so the NEXT visit
   has the newest version — no manual version bump needed for normal updates).
   Content (content/*): network first, so new questions appear as soon as you are online,
   with the cached copy as the offline fallback. */
const VERSION = 'v1';
const SHELL = `quizhub-shell-${VERSION}`;
const DATA = `quizhub-data-${VERSION}`;
const SHELL_FILES = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg',
  'js/util.js', 'js/i18n.js', 'js/store.js', 'js/drafts.js', 'js/content.js', 'js/ui/forms.js', 'js/ui/shell.js',
  'js/types/registry.js', 'js/types/mcq.js', 'js/types/truefalse.js', 'js/types/multitf.js', 'js/types/matching.js', 'js/types/shortanswer.js', 'js/types/compare.js',
  'js/views/quiz.js', 'js/views/home.js', 'js/views/subject.js', 'js/views/browse.js', 'js/views/settings.js',
  'js/editor/images.js', 'js/editor/publish.js', 'js/editor/data.js', 'js/editor/editor-main.js', 'js/editor/editor-subject.js', 'js/editor/editor-question.js', 'js/main.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const isContent = url.pathname.includes('/content/');
  if (isContent) {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(DATA).then((c) => c.put(req, copy)); return res; }).catch(() => caches.match(req)));
  } else {
    e.respondWith(caches.open(SHELL).then((c) => c.match(req).then((hit) => {
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
  }
});
