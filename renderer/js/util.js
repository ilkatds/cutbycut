'use strict';
// ---------- Generic helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const deep = (o) => JSON.parse(JSON.stringify(o));
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;
const easeBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const easeElastic = (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1);

function fmtTime(t, fps = 30) {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60), s = Math.floor(t % 60), f = Math.floor((t * fps) % fps + 1e-6);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
}
function fmtDur(t) {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60), s = (t % 60);
  return m ? `${m}:${String(Math.floor(s)).padStart(2, '0')}` : `${s.toFixed(1)}с`;
}
function fileUrl(p) {
  const parts = p.replace(/\\/g, '/').split('/');
  return 'file:///' + parts.map((s, i) => (i === 0 && /^[A-Za-z]:$/.test(s) ? s : encodeURIComponent(s))).join('/');
}
function baseName(p) { return p.replace(/\\/g, '/').split('/').pop(); }
function noExt(n) { return n.replace(/\.[^.]+$/, ''); }

// Deterministic pseudo random (for effects that must look identical in preview and export)
function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function noise1(t) { const i = Math.floor(t), f = t - i; const u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; }

function toast(msg, ms = 2200) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), ms);
}

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

function hexToRgb(hex) {
  hex = (hex || '#000000').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }

// ---------- Context menu ----------
function showMenu(x, y, items) {
  const m = $('#ctxMenu');
  m.innerHTML = '';
  for (const it of items) {
    if (it === '-') { m.append(h('hr')); continue; }
    const d = h('div', { class: it.disabled ? 'dis' : '' }, h('span', {}, it.label), it.key ? h('kbd', {}, it.key) : null);
    d.addEventListener('click', () => { hideMenu(); it.action(); });
    m.append(d);
  }
  m.classList.remove('hidden');
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 6) + 'px';
  m.style.top = Math.min(y, innerHeight - r.height - 6) + 'px';
}
function hideMenu() { $('#ctxMenu').classList.add('hidden'); }
document.addEventListener('mousedown', (e) => { if (!e.target.closest('#ctxMenu')) hideMenu(); });

// ---------- Modal ----------
function openModal(build) {
  const m = $('#modal'), box = $('.box', m);
  box.innerHTML = '';
  build(box);
  m.classList.remove('hidden');
}
function closeModal() { $('#modal').classList.add('hidden'); }
