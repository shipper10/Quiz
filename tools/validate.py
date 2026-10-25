#!/usr/bin/env python3
"""Check every content file for mistakes (the same rules the editor uses).

    python3 tools/validate.py            # check ./content
    python3 tools/validate.py --quiet    # only print errors

Exit code 1 if there is any ERROR (warnings do not fail). Runs automatically on
GitHub for every push (see .github/workflows/validate.yml).
"""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CONTENT = os.path.join(ROOT, "content")
QUIET = "--quiet" in sys.argv

errors, warnings = [], []


def err(where, msg):
    errors.append(f"ERROR   {where}: {msg}")


def warn(where, msg):
    warnings.append(f"warning {where}: {msg}")


def load(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return None
    except json.JSONDecodeError as e:
        err(os.path.relpath(path, ROOT), f"invalid JSON ({e})")
        return None


def blank(v):
    return not isinstance(v, str) or not v.strip()


# ---- one checker per question type (keep in sync with js/types/*.js) ----
def check_mcq(q, w):
    o = q.get("options")
    if not isinstance(o, list) or len(o) < 2:
        return err(w, "mcq needs at least 2 options")
    if any(blank(x) for x in o):
        err(w, "mcq has an empty option")
    a = q.get("answer")
    if not isinstance(a, int) or isinstance(a, bool) or not 0 <= a < len(o):
        err(w, "mcq 'answer' must be the index (0-based) of the correct option")
    r = q.get("optionReasons")
    if r is not None and (not isinstance(r, list) or len(r) > len(o)):
        warn(w, "optionReasons should be a list with one item per option")


def check_truefalse(q, w):
    if not isinstance(q.get("answer"), bool):
        err(w, "truefalse 'answer' must be true or false")


def check_multitf(q, w):
    st = q.get("statements")
    if not isinstance(st, list) or not st:
        return err(w, "multitf needs 'statements'")
    for i, s in enumerate(st, 1):
        if not isinstance(s, dict) or blank(s.get("text")) or not isinstance(s.get("answer"), bool):
            err(w, f"statement {i} needs 'text' and a true/false 'answer'")


def check_matching(q, w):
    pairs = q.get("pairs")
    if not isinstance(pairs, list) or not pairs:
        return err(w, "matching needs 'pairs'")
    opts = q.get("options") or []
    for i, p in enumerate(pairs, 1):
        if not isinstance(p, dict) or blank(p.get("term")) or blank(p.get("definition")):
            err(w, f"pair {i} needs 'term' and 'definition'")
        elif opts and p["definition"] not in opts:
            err(w, f"pair {i}: definition is not in 'options' (must match exactly)")


def check_shortanswer(q, w):
    if blank(q.get("answer")):
        err(w, "shortanswer needs 'answer'")


def check_compare(q, w):
    asp, a, b = q.get("aspects"), q.get("itemA"), q.get("itemB")
    if not isinstance(asp, list) or not asp:
        return err(w, "compare needs 'aspects'")
    for name, it in (("itemA", a), ("itemB", b)):
        if not isinstance(it, dict) or blank(it.get("name")):
            return err(w, f"{name} needs a 'name'")
        v = it.get("values")
        if not isinstance(v, list) or len(v) < len(asp):
            err(w, f"{name}.values needs one value per aspect ({len(asp)})")
        elif any(blank(x) for x in v[: len(asp)]):
            err(w, f"{name} has an empty value")


CHECKS = {
    "mcq": check_mcq,
    "truefalse": check_truefalse,
    "multitf": check_multitf,
    "matching": check_matching,
    "shortanswer": check_shortanswer,
    "compare": check_compare,
}


def main():
    catalog = load(os.path.join(CONTENT, "catalog.json"))
    if catalog is None:
        err("content/catalog.json", "missing")
        return finish(0, 0)
    ids_in_catalog = []
    for y in catalog.get("years", []):
        for s in y.get("semesters", []):
            ids_in_catalog += s.get("subjects", [])
    on_disk = []
    subj_dir = os.path.join(CONTENT, "subjects")
    if os.path.isdir(subj_dir):
        on_disk = sorted(d for d in os.listdir(subj_dir) if os.path.isdir(os.path.join(subj_dir, d)))
    for sid in ids_in_catalog:
        if sid not in on_disk:
            err("catalog.json", f"subject '{sid}' has no folder content/subjects/{sid}/")
    for sid in on_disk:
        if sid not in ids_in_catalog:
            warn("catalog.json", f"subject folder '{sid}' is not listed in any semester")

    nsub = nq = 0
    for sid in on_disk:
        base = os.path.join(subj_dir, sid)
        sj = load(os.path.join(base, "subject.json"))
        if sj is None:
            err(f"subjects/{sid}", "subject.json missing")
            continue
        nsub += 1
        sources = {s.get("id") for s in sj.get("sources", [])}
        seen_ids, seen_files = set(), set()
        for l in sj.get("lessons", []):
            lid, fname = l.get("id"), l.get("file")
            where = f"{sid}/{fname}"
            if not lid or not fname:
                err(f"subjects/{sid}/subject.json", "every lesson needs 'id' and 'file'")
                continue
            if fname in seen_files:
                err(where, "lesson file listed twice")
            seen_files.add(fname)
            if l.get("source") and l["source"] not in sources:
                err(where, f"unknown lesson source '{l['source']}'")
            data = load(os.path.join(base, fname))
            if data is None:
                err(where, "lesson file missing")
                continue
            qs = data if isinstance(data, list) else data.get("questions", [])
            if l.get("count") is not None and l["count"] != len(qs):
                warn(where, f"subject.json says {l['count']} questions but the file has {len(qs)} (run the editor or fix 'count')")
            for i, q in enumerate(qs, 1):
                nq += 1
                qid = q.get("id") if isinstance(q, dict) else None
                w = f"{where} #{i} ({qid})"
                if not isinstance(q, dict) or not qid:
                    err(w, "missing 'id'")
                    continue
                if qid in seen_ids:
                    err(w, "duplicate id in this subject")
                seen_ids.add(qid)
                if blank(q.get("text")):
                    err(w, "missing 'text'")
                chk = CHECKS.get(q.get("type"))
                if chk is None:
                    err(w, f"unknown type '{q.get('type')}' (known: {', '.join(CHECKS)})")
                else:
                    chk(q, w)
                if blank(q.get("explanation")):
                    warn(w, "no explanation")
                if q.get("source") and q["source"] not in sources:
                    err(w, f"unknown source '{q['source']}'")
                img = q.get("image")
                if img and not img.startswith(("data:", "http://", "https://")) and not os.path.isfile(os.path.join(base, img)):
                    err(w, f"image file not found: {img}")
    finish(nsub, nq)


def finish(nsub, nq):
    if not QUIET:
        for m in warnings[:50]:
            print(m)
        if len(warnings) > 50:
            print(f"... and {len(warnings) - 50} more warnings")
    for m in errors:
        print(m)
    print(f"\nChecked {nsub} subject(s), {nq} question(s): {len(errors)} error(s), {len(warnings)} warning(s).")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
