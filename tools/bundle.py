#!/usr/bin/env python3
"""Build ONE self-contained file that works offline, with no server.

    python3 tools/bundle.py                 # writes dist/quiz-offline.html
    python3 tools/bundle.py -o my.html

Everything (app code, styles, all subjects, images) is packed inside the single
HTML file, so you can send it on WhatsApp/Telegram or open it from a phone's
files. Student progress is kept in that browser.
"""
import base64
import json
import mimetypes
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def read(p, mode="r"):
    with open(os.path.join(ROOT, p), mode, **({"encoding": "utf-8"} if "b" not in mode else {})) as f:
        return f.read()


def main():
    out = "dist/quiz-offline.html"
    if "-o" in sys.argv:
        out = sys.argv[sys.argv.index("-o") + 1]

    html = read("index.html")

    # content bundle: every json file as an object, every image as a data: URI
    bundle = {}
    for dirpath, _, files in os.walk(os.path.join(ROOT, "content")):
        for fn in sorted(files):
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
            if fn.endswith(".json"):
                with open(full, encoding="utf-8") as f:
                    bundle[rel] = json.load(f)
            else:
                mime = mimetypes.guess_type(fn)[0] or "application/octet-stream"
                with open(full, "rb") as f:
                    bundle[rel] = f"data:{mime};base64," + base64.b64encode(f.read()).decode()
    bundle_js = "window.QZ_BUNDLE=" + json.dumps(bundle, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/") + ";"

    # inline the stylesheet
    css = read("css/app.css")
    html = re.sub(r'<link rel="stylesheet" href="css/app.css">', lambda m: "<style>\n" + css + "\n</style>", html)
    # remove manifest/icon links that need files
    html = re.sub(r'<link rel="(manifest|apple-touch-icon)"[^>]*>\n?', "", html)
    icon = "data:image/svg+xml;base64," + base64.b64encode(read("icons/icon.svg", "rb")).decode()
    html = re.sub(r'<link rel="icon"[^>]*>', f'<link rel="icon" href="{icon}">', html)

    # inline every local script, after the content bundle
    def inline(m):
        src = m.group(1)
        js = read(src).replace("</script", "<\\/script")
        return "<script>\n" + js + "\n</script>"

    html = re.sub(r'<script src="([^"]+)"></script>', inline, html)
    html = html.replace('<div id="app">', "<script>" + bundle_js + "</script>\n<div id=\"app\">", 1)

    dest = os.path.join(ROOT, out)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Wrote {out} ({os.path.getsize(dest) / 1048576:.1f} MB)")


if __name__ == "__main__":
    main()
