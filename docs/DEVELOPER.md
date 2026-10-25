# Developer guide

Plain HTML + CSS + JavaScript. No build step, no framework, no dependencies. Open `index.html` through any static server.

## Architecture

```
js/util.js        helpers: h() DOM builder, fmt() safe rich text, icons
js/i18n.js        interface strings (ar/en) — QZ.t('key')
js/store.js       settings, progress (localStorage), quiz session (resume)
js/drafts.js      unpublished editor changes (IndexedDB)
js/content.js     reads catalog / subject / lesson / images (drafts → bundle → network)
js/ui/forms.js    buttons, inputs, segmented controls
js/ui/shell.js    page frame, hash router, modals, toasts
js/types/*.js     ONE FILE PER QUESTION TYPE (+ registry.js)
js/views/*.js     pages: quiz engine + results, home, subject, browse, settings
js/editor/*.js    editor: data layer, images, publish/zip, pages
```

All code lives under the global `QZ` namespace. Script order is set in `index.html`.

**Content model** (`content/`): `catalog.json` (years → semesters → subject ids) · `subjects/<id>/subject.json` (info, `sources[]`, `lessons[]` with `file`/`count`) · `subjects/<id>/<lesson>.json` (`{questions:[…]}`) · `subjects/<id>/images/*`.
A question's identity is `subject/id` (progress is stored under it) — **never reuse or change an id** once students have answered.

Every question: `{ id, type, text, explanation?, image?, imageAlt?, source? , …type fields }`.
Text supports `$H_2O$`, `$Ca^{2+}$`, `$alpha$`, `**bold**`, line breaks (see `QZ.util.fmt`); it is escaped, never raw HTML.

## Add a question type (the whole job)

1. Copy `js/types/shortanswer.js` to `js/types/<yourtype>.js` and edit.
2. Add `<script src="js/types/<yourtype>.js"></script>` to `index.html` (after `registry.js`), and the file to `SHELL_FILES` in `sw.js`.
3. (Optional) add a rule to `tools/validate.py` → `CHECKS`.

A type calls `QZ.types.register({...})`:

| key | purpose |
|---|---|
| `id` | the value of `"type"` in JSON |
| `label` | `{ar, en}` name shown in UI |
| `tone` | tag colour: `blue purple amber teal rose slate` |
| `blank()` | new empty question (used by "New question") |
| `validate(q)` | array of i18n error keys (`'err.xxx'`); empty = valid |
| `mount(q, el, ctx)` | draw the interactive question into `el`; call `ctx.grade(true/false)` **once** when answered. Return `{timeout()}` to handle the timer. `ctx.setKeys(fn)` adds keyboard shortcuts |
| `view(q, ctx)` | read-only answer display (Browse page) |
| `fields` | `[{kind:'custom', render(q, api)}]` — the editor form for the type's own fields. Call `api.change()` after every edit. `api.dir` = subject text direction |

Add UI strings with `QZ.i18n.extend({ 'key': 'عربي' }, { 'key': 'English' })`.
The **editor form, validation, "try it", import and browse page work automatically** for the new type.

## Change the look

Colours/spacing are CSS variables at the top of `css/app.css` (light + `[data-theme="dark"]`). Layout uses logical properties (`margin-inline`, `inset-inline-start`, …) so RTL/LTR both work. Content text uses `dir="auto"`, so Arabic and English questions each align correctly.

## Editor internals

- Edits go to `QZ.drafts` (IndexedDB) keyed by repo path; `QZ.content` reads drafts first, so changes show instantly.
- `editor/publish.js`: `exportZip()` (store-only ZIP) and `publish()` — one commit via the GitHub Git Data API (blobs → tree → commit → ref); deletions only for files that exist.
- `editor/images.js`: any image → canvas → JPEG (max 1400px, q 0.85, white background); SVG/GIF kept.

## Offline

- `sw.js`: app files stale-while-revalidate, `content/*` network-first with cache fallback.
- `tools/bundle.py` → single `dist/quiz-offline.html` (`window.QZ_BUNDLE` holds JSON + data-URI images).

## Checks

`python3 tools/validate.py` (also CI). When you change validation rules in a type, mirror them in `validate.py`.
