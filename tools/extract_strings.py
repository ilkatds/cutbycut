"""Collect user-visible Russian strings from the renderer for translation.

Writes tools/i18n_source.json: a sorted list of unique strings. Template literals with ${...}
become patterns with {0}, {1}, ... placeholders.
"""
import json
import os
import re

ROOT = os.path.join(os.path.dirname(__file__), '..', 'renderer')
CYR = re.compile(r'[А-Яа-яЁё]')
# '...', "...", `...` literals (no newlines)
LIT = re.compile(r"'((?:[^'\\\n]|\\.)*)'|\"((?:[^\"\\\n]|\\.)*)\"|`((?:[^`\\]|\\.)*)`")
SKIP_FILES = set()
# the AI prompt texts are sent to the model, not shown — they stay Russian
SKIP_MARKERS = ('AI_PROTOCOL', 'AI_VISION')


def strings_from_js(src):
    out = set()
    # drop the AI prompt template literals entirely
    for marker in SKIP_MARKERS:
        m = re.search(r'const ' + marker + r' = `', src)
        if m:
            end = src.find('`;', m.end())
            src = src[:m.start()] + src[end + 2:]
    for m in LIT.finditer(src):
        s = m.group(1) or m.group(2) or m.group(3)
        if not s or not CYR.search(s):
            continue
        if m.group(3) is not None and '${' in s:
            # split template into pattern; skip ones with nested backticks
            i = [0]
            def rep(_):
                k = i[0]; i[0] += 1
                return '{' + str(k) + '}'
            s = re.sub(r'\$\{(?:[^{}]|\{[^{}]*\})*\}', rep, s)
        s = s.replace("\\'", "'").replace('\\"', '"').replace('\\n', '\n')
        s = s.strip()
        if len(s) < 1 or len(s) > 400:
            continue
        out.add(s)
    return out


def strings_from_html(src):
    out = set()
    for m in re.finditer(r'>([^<>]+)<', src):
        s = m.group(1).strip()
        if s and CYR.search(s):
            out.add(s)
    for m in re.finditer(r'(?:title|placeholder)="([^"]+)"', src):
        if CYR.search(m.group(1)):
            out.add(m.group(1).strip())
    return out


def main():
    found = set()
    for dirpath, _, files in os.walk(ROOT):
        for f in files:
            p = os.path.join(dirpath, f)
            if f.endswith('.js') and f != 'i18n.js' and 'lang' not in dirpath:
                src = open(p, encoding='utf-8').read()
                if f == 'guide.js':
                    src = src[:src.index('const GUIDE_RU')] + src[src.index('function guideFor'):]
                found |= strings_from_js(src)
            elif f.endswith('.html'):
                found |= strings_from_html(open(p, encoding='utf-8').read())
    items = sorted(found)
    dst = os.path.join(os.path.dirname(__file__), 'i18n_source.json')
    json.dump(items, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(len(items), 'strings ->', dst)


if __name__ == '__main__':
    main()
