'use strict';
// ============ Interface translation ============
// The interface is written in Russian. Every text node, title and placeholder that appears in the
// page is looked up in the active language's dictionary (lang/<code>.js) and replaced; the Russian
// original is kept on the node so switching language again works without a restart.
// Dynamic strings ("Найдено ударов: 12") are matched by patterns with {0}, {1}… placeholders.
const LANGS = [
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'uk', name: 'Українська', flag: '🇺🇦' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
];
window.LANG_DICTS = window.LANG_DICTS || {};
const I18N = { lang: 'ru', dict: null, exact: new Map(), patterns: [], observer: null };

function compilePatterns(dict) {
  I18N.exact = new Map();
  I18N.patterns = [];
  for (const [src, dst] of Object.entries(dict || {})) {
    if (!dst) continue;
    if (/\{\d+\}/.test(src)) {
      const parts = src.split(/(\{\d+\})/);
      const order = [];
      const re = parts.map((p) => { const m = p.match(/^\{(\d+)\}$/); if (m) { order.push(+m[1]); return '([\\s\\S]*?)'; } return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('');
      I18N.patterns.push({ re: new RegExp('^' + re + '$'), order, dst });
    } else I18N.exact.set(src, dst);
  }
}
// translate one string (Russian in, current language out)
function tr(s) {
  if (I18N.lang === 'ru' || !s) return s;
  const key = s.trim();
  if (!key || !/[А-Яа-яЁё]/.test(key)) return s;
  let out = I18N.exact.get(key);
  if (out == null) {
    for (const p of I18N.patterns) {
      const m = key.match(p.re);
      if (!m) continue;
      const vals = {};
      p.order.forEach((k, i) => { vals[k] = m[i + 1]; });
      out = p.dst.replace(/\{(\d+)\}/g, (_, k) => (vals[k] != null ? tr(vals[k]) : ''));
      break;
    }
  }
  if (out == null) {
    // "Ошибка экспорта: <details>" — translate the known prefix, keep the rest as is
    const i = key.indexOf(': ');
    const pre = i > 0 ? I18N.exact.get(key.slice(0, i + 1)) : null;
    if (pre) out = pre + key.slice(i + 1);
  }
  if (out == null) return s;
  return s.replace(key, out);
}
// format helper for code: t('Найдено: {0}', n)
function t(s, ...args) { let r = tr(s); args.forEach((a, i) => { r = r.split('{' + i + '}').join(a); }); return r; }

const ATTRS = ['title', 'placeholder'];
function translateTree(root) {
  if (!root) return;
  if (root.nodeType === 3) { translateText(root); return; }
  if (root.nodeType !== 1) return;
  if (root.closest && root.closest('[data-no-i18n]')) return;
  const tag = root.tagName;
  if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') return;
  translateAttrs(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => {
      if (n.nodeType === 1) {
        if (n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.tagName === 'TEXTAREA' || n.hasAttribute('data-no-i18n')) return NodeFilter.FILTER_REJECT;
        translateAttrs(n);
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n;
  while ((n = walker.nextNode())) translateText(n);
}
function translateText(node) {
  const cur = node.nodeValue;
  if (node.__tr != null && cur === node.__tr) return; // already ours
  if (node.__tr != null && cur !== node.__tr) node.__ru = cur; // changed by the app
  if (node.__ru == null) node.__ru = cur;
  const out = tr(node.__ru);
  node.__tr = out;
  if (out !== cur) node.nodeValue = out;
}
function translateAttrs(el) {
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const cur = el.getAttribute(a);
    el.__ruA = el.__ruA || {};
    if (el.__trA && el.__trA[a] === cur) continue;
    el.__ruA[a] = cur;
    const out = tr(cur);
    el.__trA = el.__trA || {};
    el.__trA[a] = out;
    if (out !== cur) el.setAttribute(a, out);
  }
}
function loadLangScript(code) {
  return new Promise((res) => {
    if (code === 'ru' || window.LANG_DICTS[code]) return res();
    const s = document.createElement('script');
    s.src = `lang/${code}.js`;
    s.onload = res; s.onerror = res;
    document.head.append(s);
  });
}
async function setLanguage(code) {
  if (!LANGS.find((l) => l.code === code)) code = 'ru';
  await loadLangScript(code);
  I18N.lang = code;
  compilePatterns(window.LANG_DICTS[code]);
  document.documentElement.lang = code;
  // restore originals, then translate the whole page
  const all = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = all.nextNode())) if (n.__ru != null) { n.nodeValue = n.__ru; n.__tr = null; }
  for (const el of document.querySelectorAll('[title],[placeholder]')) if (el.__ruA) for (const [a, v] of Object.entries(el.__ruA)) { el.setAttribute(a, v); if (el.__trA) el.__trA[a] = null; }
  translateTree(document.body);
  if (!I18N.observer) {
    I18N.observer = new MutationObserver((muts) => {
      if (I18N.lang === 'ru') return;
      for (const m of muts) {
        if (m.type === 'characterData') translateText(m.target);
        else if (m.type === 'attributes') translateAttrs(m.target);
        else for (const nd of m.addedNodes) translateTree(nd);
      }
    });
    I18N.observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
}
