'use strict';
// ============ Interface: appearance, dockable panels, editor of the whole layout ============
// A layout is a tree: { d: 'row' | 'col', s: [weights], c: [children] }, a leaf is a panel id.
// Panels are real DOM sections moved between boxes, so their listeners and canvases survive.
const DOCK_PANELS = {
  assets: { el: '#left', name: 'Материалы', side: 'left' },
  player: { el: '#center', name: 'Плеер', side: 'top' },
  inspector: { el: '#right', name: 'Свойства', side: 'right' },
  timeline: { el: '#timelineArea', name: 'Таймлайн', side: 'bottom' },
  layers: { el: '#layersArea', name: 'Слои', side: 'right' },
};
const row3 = (a, b, c, s = [0.22, 0.56, 0.22]) => ({ d: 'row', s, c: [a, b, c] });
const LAYOUT_PRESETS = {
  video: [
    ['standard', 'Стандарт', () => ({ d: 'col', s: [0.63, 0.37], c: [row3('assets', 'player', 'inspector'), 'timeline'] })],
    ['mirror', 'Зеркало', () => ({ d: 'col', s: [0.63, 0.37], c: [row3('inspector', 'player', 'assets'), 'timeline'] })],
    ['top', 'Таймлайн сверху', () => ({ d: 'col', s: [0.37, 0.63], c: ['timeline', row3('assets', 'player', 'inspector')] })],
    ['cinema', 'Большой плеер', () => ({ d: 'row', s: [0.22, 0.78], c: [{ d: 'col', s: [0.5, 0.5], c: ['assets', 'inspector'] }, { d: 'col', s: [0.68, 0.32], c: ['player', 'timeline'] }] })],
    ['tall', 'Панели справа', () => ({ d: 'row', s: [0.72, 0.28], c: [{ d: 'col', s: [0.6, 0.4], c: ['player', 'timeline'] }, { d: 'col', s: [0.55, 0.45], c: ['assets', 'inspector'] }] })],
  ],
  audio: [
    ['standard', 'Стандарт', () => ({ d: 'col', s: [0.36, 0.64], c: [row3('assets', 'player', 'inspector', [0.24, 0.52, 0.24]), 'timeline'] })],
    ['mirror', 'Зеркало', () => ({ d: 'col', s: [0.36, 0.64], c: [row3('inspector', 'player', 'assets', [0.24, 0.52, 0.24]), 'timeline'] })],
    ['tracks', 'Только дорожки', () => ({ d: 'col', s: [0.26, 0.74], c: ['player', 'timeline'] })],
    ['side', 'Панели сбоку', () => ({ d: 'row', s: [0.76, 0.24], c: [{ d: 'col', s: [0.3, 0.7], c: ['player', 'timeline'] }, { d: 'col', s: [0.55, 0.45], c: ['assets', 'inspector'] }] })],
  ],
  photo: [
    ['standard', 'Стандарт', () => row3('assets', 'player', { d: 'col', s: [0.6, 0.4], c: ['inspector', 'layers'] })],
    ['mirror', 'Зеркало', () => row3({ d: 'col', s: [0.6, 0.4], c: ['inspector', 'layers'] }, 'player', 'assets')],
    ['layersLeft', 'Слои слева', () => row3({ d: 'col', s: [0.62, 0.38], c: ['assets', 'layers'] }, 'player', 'inspector')],
    ['focus', 'Большой холст', () => ({ d: 'row', s: [0.8, 0.2], c: ['player', { d: 'col', s: [0.34, 0.33, 0.33], c: ['assets', 'inspector', 'layers'] }] })],
  ],
};
const presetTree = (mode, id) => (LAYOUT_PRESETS[mode].find((p) => p[0] === id) || LAYOUT_PRESETS[mode][0])[2]();
const curMode = () => S.mode || 'video';
const curTree = () => (SET.layouts && SET.layouts[curMode()]) || presetTree(curMode());

// ---------- Appearance ----------
const LOOK_COLORS = [['--bg0', 'Фон окна'], ['--bg1', 'Панели'], ['--bg2', 'Карточки'], ['--bg3', 'Кнопки'], ['--line', 'Линии'], ['--text', 'Текст'], ['--dim', 'Подписи'], ['--video', 'Клипы: видео'], ['--image', 'Клипы: фото'], ['--audio', 'Клипы: звук'], ['--textc', 'Клипы: текст'], ['--fx', 'Клипы: эффекты']];
function applyLook() {
  const b = document.body, st = b.style, root = document.documentElement;
  for (const t of ['cream', 'cocoa', 'light', 'contrast']) b.classList.toggle(t, SET.theme === t);
  for (const [k] of LOOK_COLORS) { const v = (SET.lookColors || {})[k]; if (v) st.setProperty(k, v); else st.removeProperty(k); }
  if (SET.lookAccent) { st.setProperty('--accent', SET.lookAccent); st.setProperty('--accentBg', rgba(SET.lookAccent, 0.14)); }
  else { st.removeProperty('--accent'); st.removeProperty('--accentBg'); }
  root.style.fontSize = (+SET.lookFontSize || 12.5) + 'px';
  st.setProperty('--font', SET.lookFont ? `"${SET.lookFont}", "Segoe UI", system-ui, sans-serif` : '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif');
  st.setProperty('--r', (+SET.lookRadius || 0) + 'px');
  st.setProperty('--r2', Math.min(10, Math.round((+SET.lookRadius || 0) * 0.62)) + 'px');
  st.setProperty('--gap', (+SET.lookGap || 0) + 'px');
  st.setProperty('--rail-w', (+SET.railWidth || 66) + 'px');
  st.setProperty('--anim', SET.lookAnim ? String(1 / (+SET.lookAnimSpeed || 1)) : '0');
  b.classList.toggle('noanim', !SET.lookAnim);
  b.classList.toggle('noshadow', !SET.lookShadow);
  b.classList.toggle('dense', SET.lookDensity === 'dense');
  b.classList.toggle('comfy', SET.lookDensity === 'comfy');
  b.classList.toggle('noRailLabels', !SET.railLabels);
  for (const [k, cls] of [['railPos', 'rail-'], ['topbarPos', 'topbar-'], ['tlToolbarPos', 'tltools-'], ['transportPos', 'transport-'], ['tlHeadPos', 'tlhead-']])
    for (const v of ['left', 'right', 'top', 'bottom']) b.classList.toggle(cls + v, SET[k] === v);
  UI_COLORS = null;
  updateRailInk();
}
let UI_COLORS = null;
// colours for the parts drawn on a canvas (they cannot use CSS variables directly)
function uiColors() {
  if (!UI_COLORS) { const cs = getComputedStyle(document.body); UI_COLORS = { bg: cs.getPropertyValue('--bg1').trim(), line: cs.getPropertyValue('--bg4').trim(), text: cs.getPropertyValue('--dim').trim(), accent: cs.getPropertyValue('--accent').trim() }; }
  return UI_COLORS;
}
function updateRailInk() {
  const rail = $('#rail'), ink = $('#railInk'), a = rail && $('button.active', rail);
  if (!ink) return;
  if (!a || !a.offsetParent) { ink.style.opacity = 0; return; }
  Object.assign(ink.style, { opacity: 1, width: a.offsetWidth + 'px', height: a.offsetHeight + 'px', transform: `translate(${a.offsetLeft}px, ${a.offsetTop}px)` });
}

// ---------- Dock: build the tree ----------
function panelEl(id) { return $(DOCK_PANELS[id].el); }
function treeLeaves(n, out = []) { if (typeof n === 'string') out.push(n); else n.c.forEach((x) => treeLeaves(x, out)); return out; }
function normalizeTree(n) {
  if (!n) return null;
  if (typeof n === 'string') return n;
  const kids = [], w = [];
  n.c.forEach((c, i) => {
    const x = normalizeTree(c);
    if (!x) return;
    const sw = (n.s && n.s[i]) || 1 / n.c.length;
    if (typeof x !== 'string' && x.d === n.d) { const tot = x.s.reduce((a, b) => a + b, 0); x.c.forEach((cc, j) => { kids.push(cc); w.push((sw * x.s[j]) / tot); }); }
    else { kids.push(x); w.push(sw); }
  });
  if (!kids.length) return null;
  if (kids.length === 1) return kids[0];
  const tot = w.reduce((a, b) => a + b, 0);
  return { d: n.d, s: w.map((v) => v / tot), c: kids };
}
function removeLeaf(n, id) {
  if (typeof n === 'string') return n === id ? null : n;
  return normalizeTree({ d: n.d, s: n.s, c: n.c.map((c) => removeLeaf(c, id)) }) ;
}
// put panel `id` next to `target` (zone: left | right | top | bottom); target null = the whole window edge
function insertLeaf(root, id, target, zone) {
  const d = zone === 'left' || zone === 'right' ? 'row' : 'col', first = zone === 'left' || zone === 'top';
  const wrap = (node) => ({ d, s: first ? [0.5, 0.5] : [0.5, 0.5], c: first ? [id, node] : [node, id] });
  if (!target) { const t = wrap(root); t.s = first ? [0.26, 0.74] : [0.74, 0.26]; return normalizeTree(t); }
  const walk = (n) => {
    if (typeof n === 'string') return n === target ? wrap(n) : n;
    return { d: n.d, s: n.s, c: n.c.map(walk) };
  };
  return normalizeTree(walk(root));
}
function swapLeaves(n, a, b) {
  if (typeof n === 'string') return n === a ? b : n === b ? a : n;
  return { d: n.d, s: n.s, c: n.c.map((c) => swapLeaves(c, a, b)) };
}
function sanitizeTree(tree, mode) {
  // only panels this editor has; the player is always there
  const allowed = MODES[mode].panels;
  let t = tree;
  for (const id of treeLeaves(tree)) if (!allowed.includes(id)) t = removeLeaf(t, id);
  if (!t) return presetTree(mode);
  if (!treeLeaves(t).includes('player')) t = insertLeaf(t, 'player', null, 'top');
  return t;
}

function renderDock(animate) {
  const root = $('#workspace'), park = $('#dockPark');
  const tree = sanitizeTree(curTree(), curMode());
  const before = animate && !document.body.classList.contains('noanim') ? new Map(Object.keys(DOCK_PANELS).map((id) => [id, panelEl(id).offsetParent ? panelEl(id).getBoundingClientRect() : null])) : null;
  const scroll = { l: $('#tlScroll').scrollLeft, t: $('#tlScroll').scrollTop };
  for (const id of Object.keys(DOCK_PANELS)) { const el = panelEl(id); el.classList.add('dockPanel'); el.style.flex = ''; park.append(el); }
  root.innerHTML = '';
  const build = (n) => {
    if (typeof n === 'string') return panelEl(n);
    const box = h('div', { class: 'dockBox d-' + n.d });
    n.c.forEach((c, i) => {
      if (i) box.append(makeResizer(n, i - 1, box));
      const el = build(c);
      el.style.flex = `${n.s[i]} 1 0px`;
      box.append(el);
    });
    return box;
  };
  const el = build(tree);
  el.style.flex = '1 1 0px';
  root.append(el);
  $('#tlScroll').scrollLeft = scroll.l; $('#tlScroll').scrollTop = scroll.t;
  // the panels glide from their old places to the new ones
  if (before) for (const [id, r0] of before) {
    const e = panelEl(id);
    if (!e.offsetParent) continue;
    const r1 = e.getBoundingClientRect();
    if (!r0) { e.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 300 * (+getComputedStyle(document.body).getPropertyValue('--anim') || 1), easing: 'cubic-bezier(.22,.8,.24,1)' }); continue; }
    if (Math.abs(r0.left - r1.left) + Math.abs(r0.top - r1.top) + Math.abs(r0.width - r1.width) + Math.abs(r0.height - r1.height) < 2) continue;
    e.style.transformOrigin = 'top left';
    e.animate([{ transform: `translate(${r0.left - r1.left}px, ${r0.top - r1.top}px) scale(${r0.width / r1.width}, ${r0.height / r1.height})` }, { transform: 'none' }], { duration: 340 * (+getComputedStyle(document.body).getPropertyValue('--anim') || 1), easing: 'cubic-bezier(.22,.8,.24,1)' });
  }
  layoutStage();
  if (P()) TL.render();
  if (document.body.classList.contains('editing')) UIED.decorate();
  updateRailInk();
}
function saveTree(tree) {
  SET.layouts = { ...(SET.layouts || {}), [curMode()]: tree };
  clearTimeout(saveTree._t);
  saveTree._t = setTimeout(() => saveSetting({ layouts: SET.layouts }), 300);
}
function makeResizer(node, i, box) {
  const r = h('div', { class: 'resizer ' + (node.d === 'row' ? 'v' : 'h') });
  r.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const horiz = node.d === 'row';
    const kids = [...box.children].filter((c) => !c.classList.contains('resizer'));
    const px = kids.map((k) => (horiz ? k.offsetWidth : k.offsetHeight));
    const total = px.reduce((a, b) => a + b, 0);
    const minOf = (k) => { const cs = getComputedStyle(k); return Math.max(60, parseFloat(horiz ? cs.minWidth : cs.minHeight) || 0); };
    const p0 = horiz ? e.clientX : e.clientY, a0 = px[i], b0 = px[i + 1];
    const minA = minOf(kids[i]), minB = minOf(kids[i + 1]);
    document.body.classList.add('resizing');
    r.classList.add('on');
    const mv = (ev) => {
      const dx = clamp((horiz ? ev.clientX : ev.clientY) - p0, minA - a0, b0 - minB);
      px[i] = a0 + dx; px[i + 1] = b0 - dx;
      kids.forEach((k, j) => { node.s[j] = px[j] / total; k.style.flex = `${node.s[j]} 1 0px`; });
      layoutStage();
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
      r.classList.remove('on');
      saveTree(rootTreeOf());
      TL.render();
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  });
  return r;
}
// the tree objects are mutated by the resizers, keep the one that was built
function rootTreeOf() { return (SET.layouts && SET.layouts[curMode()]) || (SET.layouts = { ...(SET.layouts || {}), [curMode()]: sanitizeTree(presetTree(curMode()), curMode()) })[curMode()]; }
function setTree(tree, animate = true) {
  SET.layouts = { ...(SET.layouts || {}), [curMode()]: tree };
  renderDock(animate);
  saveTree(tree);
}
function initDock() {
  if (!SET.layouts) SET.layouts = {};
  // resizers mutate the stored tree in place: make sure it exists and is valid before the first build
  new ResizeObserver(() => { clearTimeout(initDock._t); initDock._t = setTimeout(() => { if (P() && $('#tlScroll').clientWidth) TL.render(); updateRailInk(); }, 120); }).observe($('#workspace'));
  window.addEventListener('keydown', (e) => { if (e.ctrlKey && e.shiftKey && e.code === 'KeyL') { e.preventDefault(); cmd('uiEditor'); } });
}
function ensureTree() {
  const m = curMode();
  const t = sanitizeTree((SET.layouts && SET.layouts[m]) || presetTree(m), m);
  SET.layouts = { ...(SET.layouts || {}), [m]: t };
}
function togglePanel(id, show) {
  const t = rootTreeOf();
  if (id === 'player') return;
  if (show) { const side = DOCK_PANELS[id].side; setTree(insertLeaf(t, id, null, side)); }
  else setTree(removeLeaf(t, id));
}

// ---------- Toolbar items: order, hiding, moving between bars ----------
const BARS = { topMenu: '#topMenu', topRight: '#topRight', playerHead: '#playerHead', transport: '#transport', tlToolbar: '#tlToolbar', rail: '#rail' };
const BAR_NAMES = { topMenu: 'Верхняя панель слева', topRight: 'Верхняя панель справа', playerHead: 'Над плеером', transport: 'Под плеером', tlToolbar: 'Панель таймлайна', rail: 'Вкладки материалов' };
const UI_ITEMS = { map: new Map(), def: {} };
function uiKey(el, bar, i) {
  if (el.dataset.cmd) return 'c:' + el.dataset.cmd;
  if (el.dataset.tab) return 't:' + el.dataset.tab;
  if (el.id) return 'i:' + el.id;
  const inp = $('input[id]', el);
  if (inp) return 'i:' + inp.id;
  if (el.classList.contains('grow')) return `g:${bar}${i}`;
  if (el.classList.contains('sep')) return `s:${bar}${i}`;
  return `x:${bar}${i}`;
}
function itemName(k) {
  const el = UI_ITEMS.map.get(k);
  if (!el) return k;
  if (el.classList.contains('grow')) return '↔ Пружина';
  if (el.classList.contains('sep')) return '| Разделитель';
  return ((el.title || el.textContent || k).trim()).split(' (')[0];
}
function initUiItems() {
  for (const [bar, sel] of Object.entries(BARS)) {
    UI_ITEMS.def[bar] = [];
    [...$(sel).children].forEach((el, i) => {
      if (el.id === 'railInk') return;
      const k = uiKey(el, bar, i);
      el.dataset.ui = k;
      el.classList.add('uiItem');
      UI_ITEMS.map.set(k, el);
      UI_ITEMS.def[bar].push(k);
    });
    $(sel).classList.add('uiBar');
    $(sel).dataset.bar = bar;
  }
}
const uiState = () => (SET.uiItems || {})[curMode()] || { bars: {}, hidden: [] };
function applyUiItems() {
  const st = uiState(), off = new Set(MODES[curMode()].off || []), tabs = MODES[curMode()].tabs;
  const placed = new Set();
  for (const bar of Object.keys(BARS)) {
    const box = $(BARS[bar]);
    for (const k of st.bars[bar] || UI_ITEMS.def[bar]) {
      const el = UI_ITEMS.map.get(k);
      if (!el || placed.has(k)) continue;
      placed.add(k); box.append(el);
    }
  }
  // items added in a later version stay on their default bar
  for (const bar of Object.keys(BARS)) for (const k of UI_ITEMS.def[bar]) if (!placed.has(k)) $(BARS[bar]).append(UI_ITEMS.map.get(k));
  for (const [k, el] of UI_ITEMS.map) {
    el.classList.toggle('uiHidden', (st.hidden || []).includes(k));
    el.classList.toggle('modeOff', off.has(k) || (k.startsWith('t:') && !tabs.includes(k.slice(2))));
  }
  updateRailInk();
}
function saveUiItems(patch) {
  const st = { bars: { ...uiState().bars }, hidden: [...(uiState().hidden || [])], ...patch };
  const all = { ...(SET.uiItems || {}), [curMode()]: st };
  saveSetting({ uiItems: all });
  return st;
}
function readBarsFromDom() {
  const bars = {};
  for (const bar of Object.keys(BARS)) bars[bar] = [...$(BARS[bar]).children].map((e) => e.dataset.ui).filter(Boolean);
  return bars;
}

// ---------- The interface editor ----------
const UIED = {
  backup: null,
  open() {
    if (document.body.classList.contains('editing')) return;
    if (S.playing) pause();
    selectOnly(null);
    hideMenu();
    closeModal();
    this.backup = JSON.stringify({ layouts: SET.layouts, uiItems: SET.uiItems, theme: SET.theme, railPos: SET.railPos, topbarPos: SET.topbarPos, tlToolbarPos: SET.tlToolbarPos, transportPos: SET.transportPos, tlHeadPos: SET.tlHeadPos, railLabels: SET.railLabels });
    document.body.classList.add('editing');
    this.drawer();
    this.decorate();
    window.addEventListener('pointerdown', this.onDown, true);
    window.addEventListener('click', this.onClick, true);
    window.addEventListener('mousedown', this.onMouse, true);
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('pointerover', this.onOver, true);
  },
  close(keep) {
    if (!keep && this.backup) {
      const b = JSON.parse(this.backup);
      Object.assign(SET, b);
      saveSetting(b);
      applyLook(); applyUiItems(); renderDock(true);
    }
    document.body.classList.remove('editing');
    $$('.dockShade, #uiEditor, #uiHideBtn, #dropZone').forEach((e) => e.remove());
    window.removeEventListener('pointerdown', this.onDown, true);
    window.removeEventListener('click', this.onClick, true);
    window.removeEventListener('mousedown', this.onMouse, true);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('pointerover', this.onOver, true);
    layoutStage();
    if (keep) toast('Интерфейс сохранён');
  },
  // a shade with a handle over every panel; the toolbars stay above it and can be rearranged
  decorate() {
    $$('.dockShade').forEach((e) => e.remove());
    for (const id of treeLeaves(rootTreeOf())) {
      const el = panelEl(id);
      const grip = h('div', { class: 'dockPill', 'data-panel': id }, h('i', {}, '⠿'), h('b', {}, DOCK_PANELS[id].name),
        id === 'player' ? null : h('button', { class: 'dockHide', title: 'Скрыть панель', 'data-hide-panel': id }, '×'));
      el.append(h('div', { class: 'dockShade' }, grip));
    }
  },
  onKey: (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); UIED.close(true); } else if (!e.target.closest || !e.target.closest('#uiEditor')) { e.stopPropagation(); } },
  onMouse: (e) => { if (!e.target.closest('#uiEditor')) e.preventDefault(); },
  // nothing in the app reacts while the editor is open, except the editor's own controls
  onClick: (e) => {
    if (e.target.closest('#uiEditor')) return;
    const hp = e.target.closest('[data-hide-panel]');
    if (hp) { togglePanel(hp.dataset.hidePanel, false); UIED.drawer(); }
    const hb = e.target.closest('#uiHideBtn');
    if (hb) UIED.hideItem(hb.dataset.key);
    e.stopPropagation(); e.preventDefault();
  },
  onOver: (e) => {
    if (UIED.dragging) return;
    const it = e.target.closest && e.target.closest('.uiItem');
    let b = $('#uiHideBtn');
    if (e.target.closest && e.target.closest('#uiHideBtn')) return;
    if (!it) { if (b) b.style.display = 'none'; return; }
    if (!b) { b = h('button', { id: 'uiHideBtn', title: 'Скрыть' }, '×'); document.body.append(b); }
    const r = it.getBoundingClientRect();
    Object.assign(b.style, { display: 'block', left: r.right - 9 + 'px', top: r.top - 7 + 'px' });
    b.dataset.key = it.dataset.ui;
  },
  hideItem(k) {
    const st = uiState();
    saveUiItems({ hidden: [...new Set([...(st.hidden || []), k])] });
    applyUiItems();
    const b = $('#uiHideBtn'); if (b) b.style.display = 'none';
    this.drawer();
  },
  onDown: (e) => {
    if (e.target.closest('#uiEditor') || e.target.closest('#uiHideBtn') || e.target.closest('[data-hide-panel]')) return;
    const pill = e.target.closest('.dockPill');
    if (pill) { e.preventDefault(); e.stopPropagation(); UIED.dragPanel(e, pill.dataset.panel); return; }
    const it = e.target.closest('.uiItem');
    if (it) { e.preventDefault(); e.stopPropagation(); UIED.dragItem(e, it); return; }
    e.stopPropagation();
  },
  // ----- drag a panel onto another panel's side or the window's edge -----
  dragPanel(e0, id) {
    const ghost = h('div', { class: 'dockGhost' }, DOCK_PANELS[id].name);
    let zoneEl = $('#dropZone');
    if (!zoneEl) { zoneEl = h('div', { id: 'dropZone' }); document.body.append(zoneEl); }
    document.body.append(ghost);
    panelEl(id).classList.add('dockSource');
    this.dragging = true;
    let drop = null;
    const show = (r) => { if (!r) { zoneEl.style.opacity = 0; return; } Object.assign(zoneEl.style, { opacity: 1, left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); };
    const mv = (ev) => {
      ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
      const ws = $('#workspace').getBoundingClientRect();
      const edge = 26;
      let z = null;
      if (ev.clientX < ws.left + edge) z = 'left'; else if (ev.clientX > ws.right - edge) z = 'right'; else if (ev.clientY < ws.top + edge) z = 'top'; else if (ev.clientY > ws.bottom - edge) z = 'bottom';
      if (z) {
        const w = ws.width * 0.26, hh = ws.height * 0.3;
        drop = { target: null, zone: z };
        show({ left: z === 'right' ? ws.right - w : ws.left, top: z === 'bottom' ? ws.bottom - hh : ws.top, width: z === 'left' || z === 'right' ? w : ws.width, height: z === 'top' || z === 'bottom' ? hh : ws.height });
        return;
      }
      const leaf = treeLeaves(rootTreeOf()).find((p) => { const r = panelEl(p).getBoundingClientRect(); return p !== id && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom; });
      if (!leaf) { drop = null; show(null); return; }
      const r = panelEl(leaf).getBoundingClientRect();
      const fx = (ev.clientX - r.left) / r.width, fy = (ev.clientY - r.top) / r.height;
      const dist = [['left', fx], ['right', 1 - fx], ['top', fy], ['bottom', 1 - fy]].sort((a, b) => a[1] - b[1])[0];
      if (dist[1] > 0.28) { drop = { target: leaf, zone: 'swap' }; show(r); return; }
      drop = { target: leaf, zone: dist[0] };
      show({ left: dist[0] === 'right' ? r.left + r.width / 2 : r.left, top: dist[0] === 'bottom' ? r.top + r.height / 2 : r.top, width: dist[0] === 'left' || dist[0] === 'right' ? r.width / 2 : r.width, height: dist[0] === 'top' || dist[0] === 'bottom' ? r.height / 2 : r.height });
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      this.dragging = false;
      ghost.remove(); show(null);
      panelEl(id).classList.remove('dockSource');
      if (!drop) return;
      const t = rootTreeOf();
      if (drop.zone === 'swap') setTree(swapLeaves(t, id, drop.target));
      else { const rest = removeLeaf(t, id); if (rest) setTree(insertLeaf(rest, id, drop.target, drop.zone)); }
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    mv(e0);
  },
  // ----- drag a button along a toolbar or to another toolbar; the neighbours make room -----
  dragItem(e0, it) {
    const fromBar = it.parentElement.dataset.bar, x0 = e0.clientX, y0 = e0.clientY;
    let ghost = null;
    const canEnter = (bar) => (fromBar === 'rail') === (bar === 'rail');
    const flip = (box, fn) => {
      const kids = [...box.children].filter((c) => c !== it && c.offsetParent);
      const r0 = new Map(kids.map((k) => [k, k.getBoundingClientRect()]));
      fn();
      if (document.body.classList.contains('noanim')) return;
      for (const k of kids) { const a = r0.get(k), b = k.getBoundingClientRect(); const dx = a.left - b.left, dy = a.top - b.top; if (dx || dy) k.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 170, easing: 'cubic-bezier(.22,.8,.24,1)' }); }
    };
    const mv = (ev) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
        this.dragging = true;
        ghost = it.cloneNode(true);
        ghost.classList.add('itemGhost');
        const r = it.getBoundingClientRect();
        ghost.style.width = r.width + 'px'; ghost.style.height = r.height + 'px';
        document.body.append(ghost);
        it.classList.add('itemDragging');
        const b = $('#uiHideBtn'); if (b) b.style.display = 'none';
      }
      ghost.style.transform = `translate(${ev.clientX - 16}px, ${ev.clientY - 14}px)`;
      const bar = Object.values(BARS).map((s) => $(s)).find((b) => { if (!b.offsetParent || !canEnter(b.dataset.bar)) return false; const r = b.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top - 6 && ev.clientY <= r.bottom + 6; });
      if (!bar) return;
      const kids = [...bar.children].filter((c) => c !== it && c.id !== 'railInk' && c.offsetParent);
      const vertical = getComputedStyle(bar).flexDirection.startsWith('column');
      const after = kids.find((k) => { const r = k.getBoundingClientRect(); return vertical ? ev.clientY < r.top + r.height / 2 : ev.clientX < r.left + r.width / 2; });
      if (it.nextElementSibling === after && it.parentElement === bar) return;
      flip(bar, () => { if (after) bar.insertBefore(it, after); else bar.append(it); });
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      this.dragging = false;
      if (!ghost) return;
      ghost.remove();
      it.classList.remove('itemDragging');
      saveUiItems({ bars: readBarsFromDom() });
      updateRailInk();
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  },
  // ----- the floating control sheet -----
  drawer() {
    const old = $('#uiEditor');
    const pos = old ? { left: old.style.left, top: old.style.top } : null;
    if (old) old.remove();
    const m = curMode();
    const sec = (t, ...kids) => h('div', { class: 'edSec' }, h('h4', {}, t), ...kids);
    const opt = (key, list) => {
      const seg = h('div', { class: 'seg' });
      for (const [v, n] of list) seg.append(h('button', { class: SET[key] === v ? 'on' : '', onclick: async () => { await saveSetting({ [key]: v }); applyLook(); layoutStage(); TL.render(); this.drawer(); } }, n));
      return seg;
    };
    const line = (l, c) => h('div', { class: 'edRow' }, h('span', {}, l), c);
    const head = h('div', { class: 'edHead' }, h('b', {}, '⊞ Редактор интерфейса'), h('span', { class: 'grow' }), h('i', {}, '⠿'));
    const box = h('div', { id: 'uiEditor' }, head);
    const body = h('div', { class: 'edBody' });
    box.append(body);
    body.append(h('div', { class: 'note', style: { marginTop: 0 } }, 'Тяните панели за ярлык: на край другой панели — встать рядом, в середину — поменяться местами, к краю окна — занять всю сторону. Кнопки на панелях перетаскиваются прямо мышкой, × скрывает.'));
    const curStr = JSON.stringify(treeLeaves(rootTreeOf()));
    body.append(sec('Готовые раскладки', h('div', { class: 'edGrid' }, ...LAYOUT_PRESETS[m].map(([id, n]) => h('button', { onclick: () => { setTree(presetTree(m, id)); this.drawer(); } }, n)))));
    const hiddenPanels = MODES[m].panels.filter((p) => !treeLeaves(rootTreeOf()).includes(p));
    body.append(sec('Панели', h('div', { class: 'edGrid' }, ...MODES[m].panels.filter((p) => p !== 'player').map((p) => {
      const on = !hiddenPanels.includes(p);
      return h('button', { class: on ? 'on' : '', onclick: () => { togglePanel(p, !on); this.drawer(); } }, (on ? '✓ ' : '+ ') + DOCK_PANELS[p].name);
    }))));
    body.append(sec('Положение',
      line('Верхняя панель', opt('topbarPos', [['top', 'Сверху'], ['bottom', 'Снизу']])),
      line('Вкладки материалов', opt('railPos', [['left', 'Слева'], ['right', 'Справа'], ['top', 'Сверху'], ['bottom', 'Снизу']])),
      line('Кнопки плеера', opt('transportPos', [['bottom', 'Снизу'], ['top', 'Сверху']])),
      line('Кнопки таймлайна', opt('tlToolbarPos', [['top', 'Сверху'], ['bottom', 'Снизу']])),
      line('Названия дорожек', opt('tlHeadPos', [['left', 'Слева'], ['right', 'Справа']])),
      line('Подписи вкладок', opt('railLabels', [[true, 'Да'], [false, 'Нет']]))));
    const st = uiState();
    const hidden = (st.hidden || []).filter((k) => UI_ITEMS.map.has(k));
    if (hidden.length) body.append(sec('Скрытые кнопки', h('div', { class: 'edChips' }, ...hidden.map((k) => h('span', { class: 'chip', title: 'Вернуть', onclick: () => { saveUiItems({ hidden: st.hidden.filter((x) => x !== k) }); applyUiItems(); this.drawer(); } }, '+ ' + itemName(k))))));
    const saved = (SET.layoutsSaved || []).filter((s) => s.mode === m);
    body.append(sec('Мои раскладки',
      h('div', { class: 'edChips' }, ...saved.map((s) => h('span', { class: 'chip', 'data-no-i18n': '', title: 'Применить, правая кнопка — удалить', onclick: () => { setTree(deep(s.tree)); saveUiItems(deep(s.items)); applyUiItems(); this.drawer(); },
        oncontextmenu: async (e) => { e.preventDefault(); await saveSetting({ layoutsSaved: SET.layoutsSaved.filter((x) => x !== s) }); this.drawer(); } }, s.name))),
      h('button', { onclick: async () => { const name = await this.askName(); if (!name) return; await saveSetting({ layoutsSaved: [...(SET.layoutsSaved || []), { name, mode: m, tree: deep(rootTreeOf()), items: deep({ ...uiState(), bars: readBarsFromDom() }) }] }); this.drawer(); } }, '＋ Сохранить текущую')));
    box.append(h('div', { class: 'edFoot' },
      h('button', { onclick: () => { saveUiItems({ bars: {}, hidden: [] }); applyUiItems(); setTree(presetTree(m)); this.drawer(); } }, 'Сбросить'),
      h('span', { class: 'grow' }),
      h('button', { onclick: () => this.close(false) }, 'Отмена'),
      h('button', { class: 'primary', onclick: () => this.close(true) }, 'Готово')));
    document.body.append(box);
    if (pos && pos.left) { box.style.left = pos.left; box.style.top = pos.top; box.style.right = 'auto'; box.classList.add('still'); }
    head.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = box.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      box.style.right = 'auto';
      const mv = (ev) => { box.style.left = clamp(ev.clientX - dx, 0, innerWidth - r.width) + 'px'; box.style.top = clamp(ev.clientY - dy, 0, innerHeight - 60) + 'px'; };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
  },
  askName() {
    return new Promise((res) => {
      const body = $('#uiEditor .edBody');
      const i = h('input', { type: 'text', placeholder: 'Название раскладки', style: { width: '100%' } });
      const done = (v) => { i.remove(); res(v); };
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(i.value.trim()); if (e.key === 'Escape') done(null); e.stopPropagation(); });
      i.addEventListener('blur', () => done(i.value.trim()));
      body.append(i);
      i.focus();
    });
  },
};
