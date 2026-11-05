'use strict';
// ============ Left asset panels ============
let curPanel = 'media';
let fxCat = 'Все', fltCat = 'Все', fxTarget = 'track';

function setPanel(tab) {
  const moved = curPanel !== tab;
  curPanel = tab;
  $$('#rail button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const p = $('#panel');
  p.innerHTML = '';
  (PANELS[tab] || PANELS.media)(p);
  if (moved) { p.classList.remove('panelIn'); void p.offsetWidth; p.classList.add('panelIn'); }
  updateRailInk();
}
function dragData(el, data) {
  el.draggable = true;
  el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/x-sklejka', JSON.stringify(data)); e.dataTransfer.effectAllowed = 'copy'; });
}
function catChips(p, cats, cur, set) {
  const wrap = h('div', { style: { marginBottom: '8px' } });
  for (const c of ['Все', ...cats]) wrap.append(h('span', { class: 'chip' + (c === cur ? ' on' : ''), onclick: () => set(c) }, c));
  p.append(wrap);
}
function selectedVisual() {
  const c = [...S.sel].map(clipById).find((c) => c && (c.type === 'video' || c.type === 'image'));
  return c || null;
}

const PANELS = {
  canvas(p) { canvasPanel(p); },
  media(p) {
    p.append(h('h3', {}, S.mode === 'photo' ? 'Изображения' : 'Медиа'));
    p.append(h('div', { class: 'drop', onclick: importDialog }, h('div', { style: { fontSize: '22px' } }, '⇪'), S.mode === 'photo' ? 'Открыть фото или картинку' : 'Импорт видео, фото, аудио', h('div', { class: 'note' }, 'или перетащите файлы в окно')));
    mediaToolsRow(p);
    const vis = P().media.filter((m) => (S.mode === 'photo' ? m.type === 'image' : m.type !== 'audio'));
    if (!vis.length) { p.append(h('div', { class: 'note' }, S.mode === 'photo' ? 'Здесь появятся открытые изображения. Двойной клик добавляет новый слой.' : 'Здесь появятся импортированные файлы. Нажмите «+» или перетащите на таймлайн.')); return; }
    const grid = h('div', { class: 'grid' });
    for (const m of vis) grid.append(mediaTile(m));
    p.append(grid);
  },

  audio(p) {
    p.append(h('h3', {}, 'Аудио'));
    p.append(h('div', { class: 'btnRow', style: { marginBottom: '10px' } },
      h('button', { onclick: importDialog }, '⇪ Импорт музыки'),
      h('button', { onclick: () => cmd('record') }, '🎙 Записать голос')));
    const aud = P().media.filter((m) => m.type === 'audio' || (S.mode === 'audio' && m.hasAudio));
    if (aud.length) {
      p.append(h('h4', {}, 'Ваши файлы'));
      const grid = h('div', { class: 'grid' });
      for (const m of aud) grid.append(mediaTile(m));
      p.append(grid);
    }
    p.append(h('h4', {}, 'Звуковые эффекты'));
    p.append(h('div', { class: 'note' }, 'Синтезируются прямо в программе — свободны от авторских прав.'));
    const g = h('div', { class: 'grid' });
    for (const s of SFX) {
      const tile = h('div', { class: 'tile' },
        h('div', { class: 'thumb', style: { background: 'linear-gradient(135deg,#1f4f4b,#123)' } }, s.icon),
        h('div', { class: 'name' }, s.name),
        h('button', { class: 'add', title: 'Добавить', onclick: (e) => { e.stopPropagation(); addSfx(s, S.time); } }, '+'));
      tile.addEventListener('click', () => previewSfx(s));
      dragData(tile, { kind: 'sfx', id: s.id });
      g.append(tile);
    }
    p.append(g);
  },

  text(p) {
    p.append(h('h3', {}, 'Текст'));
    p.append(h('button', { class: 'primary', style: { width: '100%', marginBottom: '10px' }, onclick: () => addText({}, S.time) }, '+ Добавить текст'));
    p.append(h('h4', {}, 'Шаблоны'));
    const g = h('div', { class: 'grid' });
    TEXT_TEMPLATES.forEach((tp, i) => {
      const st = { ...TEXT_DEFAULT, ...tp.s };
      const el = h('div', { class: 'preset', style: presetStyle(st), onclick: () => addText({ template: i }, S.time) }, (st.uppercase ? tp.text.toUpperCase() : tp.text).split('\n')[0]);
      el.title = tp.name;
      dragData(el, { kind: 'text', template: i });
      g.append(el);
    });
    p.append(g);
    myPresetsSection(p, 'text');
    p.append(h('h4', {}, 'Стили (к выделенному тексту)'));
    const g2 = h('div', { class: 'grid' });
    TEXT_STYLES.forEach((s) => {
      const st = { ...TEXT_DEFAULT, ...s.s };
      g2.append(h('div', { class: 'preset', style: presetStyle(st), title: s.name, onclick: () => applyTextStyle(s.s) }, s.name));
    });
    p.append(g2);
  },

  stickers(p) {
    p.append(h('h3', {}, 'Стикеры'));
    p.append(h('div', { class: 'note' }, 'Клик — добавить в позицию головки. Анимацию стикера настройте справа во вкладке «Анимация».'));
    for (const [cat, list] of Object.entries(STICKERS)) {
      p.append(h('h4', {}, cat));
      const g = h('div', { class: 'grid small' });
      for (const ch of list) {
        const el = h('div', { class: 'emoji', onclick: () => addSticker(ch, S.time) }, ch);
        dragData(el, { kind: 'sticker', ch });
        g.append(el);
      }
      p.append(g);
    }
  },

  effects(p) {
    p.append(h('h3', {}, 'Эффекты'));
    p.append(h('div', { class: 'seg', style: { marginBottom: '8px' } },
      h('button', { class: fxTarget === 'track' ? 'on' : '', onclick: () => { fxTarget = 'track'; setPanel('effects'); } }, 'На дорожку эффектов'),
      h('button', { class: fxTarget === 'clip' ? 'on' : '', onclick: () => { fxTarget = 'clip'; setPanel('effects'); } }, 'К выделенному клипу')));
    catChips(p, [...new Set(EFFECTS.map((e) => e.cat))], fxCat, (c) => { fxCat = c; setPanel('effects'); });
    const g = h('div', { class: 'grid' });
    const thumbs = [];
    for (const fx of EFFECTS.filter((e) => fxCat === 'Все' || e.cat === fxCat)) {
      const cv = h('canvas', { width: 160, height: 90 });
      const tile = h('div', { class: 'tile fxTile' }, h('div', { class: 'thumb' }, cv), h('div', { class: 'name' }, fx.name),
        h('button', { class: 'add', onclick: (e) => { e.stopPropagation(); applyEffectAsset(fx.id); } }, '+'));
      tile.addEventListener('click', () => applyEffectAsset(fx.id));
      dragData(tile, { kind: 'fx', id: fx.id });
      g.append(tile);
      thumbs.push([cv, fx]);
    }
    p.append(g);
    animateFxThumbs(thumbs);
  },

  transitions(p) {
    p.append(h('h3', {}, 'Переходы'));
    p.append(h('div', { class: 'note' }, 'Выделите клип — переход встанет на его начало (между ним и предыдущим). Или нажмите «+» на стыке клипов на таймлайне.'));
    const g = h('div', { class: 'grid' });
    const thumbs = [];
    for (const tr of TRANSITIONS) {
      const cv = h('canvas', { width: 160, height: 90 });
      const tile = h('div', { class: 'tile fxTile' }, h('div', { class: 'thumb' }, cv), h('div', { class: 'name' }, tr.name));
      tile.addEventListener('click', () => applyTransition(tr.id));
      dragData(tile, { kind: 'transition', id: tr.id });
      g.append(tile);
      thumbs.push([cv, tr]);
    }
    p.append(g);
    p.append(h('div', { class: 'btnRow', style: { marginTop: '10px' } },
      h('button', { onclick: () => applyTransition(null, true) }, 'Применить ко всем стыкам'),
      h('button', { onclick: () => change(() => P().clips.forEach((c) => { c.trans = null; })) }, 'Убрать все')));
    animateTransThumbs(thumbs);
  },

  filters(p) {
    p.append(h('h3', {}, 'Фильтры'));
    const sv = selectedVisual();
    p.append(h('div', { class: 'note' }, sv ? 'Применяется к выделенному клипу.' : 'Ничего не выделено — фильтр будет добавлен слоем на дорожку эффектов (действует на всё под ним).'));
    myPresetsSection(p, 'look');
    catChips(p, [...new Set(FILTERS.map((f) => f.cat))], fltCat, (c) => { fltCat = c; setPanel('filters'); });
    const g = h('div', { class: 'grid' });
    const snap = previewSnapshot();
    for (const f of FILTERS.filter((x) => fltCat === 'Все' || x.cat === fltCat)) {
      const cv = h('canvas', { width: 160, height: 90 });
      drawFilterThumb(cv, snap, f);
      const on = sv && sv.filter && sv.filter.id === f.id;
      const tile = h('div', { class: 'tile', style: on ? { borderColor: 'var(--accent)' } : {} }, h('div', { class: 'thumb' }, cv), h('div', { class: 'name' }, f.name));
      tile.addEventListener('click', () => applyFilterAsset(f.id));
      dragData(tile, { kind: 'filter', id: f.id });
      g.append(tile);
    }
    p.append(g);
  },

  adjust(p) {
    p.append(h('h3', {}, 'Коррекция'));
    p.append(h('div', { class: 'note' }, 'Цветокоррекция клипа — во вкладке «Коррекция» справа (выделите клип). Слой коррекции действует на всё, что ниже него на таймлайне.'));
    p.append(h('button', { class: 'primary', style: { width: '100%' }, onclick: () => {
      change(() => {
        const tr = freeTrack('fx', S.time, 5, (P().tracks.find((t) => t.kind === 'fx') || {}).id);
        const c = makeClip('adjust', { start: S.time, dur: 5, trackId: tr.id });
        P().clips.push(c); selectOnly(c.id, true);
      });
    } }, '+ Слой коррекции'));
    const sv = selectedVisual();
    if (sv) p.append(h('button', { style: { width: '100%', marginTop: '8px' }, onclick: () => { INSP.tab = 'adjust'; INSP.render(); } }, 'Открыть коррекцию выделенного клипа'));
  },

  captions(p) {
    p.append(h('h3', {}, 'Автосубтитры'));
    p.append(h('div', { class: 'note' }, 'Распознавание речи на вашем компьютере (Whisper). Интернет не нужен; при первом запуске модель скачивается один раз.'));
    const modeNote = h('div', { class: 'note' });
    const linkRow = h('div', { class: 'row wide' });
    const link = h('input', { type: 'checkbox' }); link.checked = capUi.link;
    link.addEventListener('change', () => { capUi.link = link.checked; });
    linkRow.append(h('label', {}, 'Двигать вместе с клипом'), h('div', {}, link));
    const drawMode = () => {
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === capUi.mode));
      const n = P().clips.filter((c) => S.sel.has(c.id) && (c.type === 'video' || c.type === 'audio')).length;
      modeNote.textContent = capUi.mode === 'all' ? 'Звук берётся со всего таймлайна сразу.'
        : `Каждый выделенный клип распознаётся отдельно, субтитры встают ровно под него. Выделено клипов со звуком: ${n}. Ctrl+щелчок — выделить несколько.`;
      linkRow.style.display = capUi.mode === 'sel' ? '' : 'none';
    };
    const seg = h('div', { class: 'seg' }, ...[['all', 'Всё видео'], ['sel', 'Только выделенное']].map(([m, n]) => h('button', { 'data-m': m, onclick: () => { capUi.mode = m; drawMode(); } }, n)));
    p.append(h('div', { class: 'row wide' }, h('label', {}, 'Что распознать'), seg), modeNote, linkRow);
    drawMode();
    capUi.redraw = drawMode;
    const lang = h('select', {}, ...[['ru', 'Русский'], ['en', 'English'], ['uk', 'Українська'], ['auto', 'Автоопределение']].map(([v, n]) => h('option', { value: v }, n)));
    const model = h('select', {}, ...[['base', 'Быстрая (base)'], ['small', 'Хорошая (small)'], ['medium', 'Точная (medium, медленно)'], ['tiny', 'Черновик (tiny)']].map(([v, n]) => h('option', { value: v }, n)));
    model.value = SET.capModel || 'small';
    lang.value = SET.capLang || 'ru';
    const words = h('input', { type: 'number', min: 1, max: 20, value: SET.capWords || 5 });
    const styleSel = h('select', {}, ...TEXT_STYLES.map((s, i) => h('option', { value: i }, s.name)));
    styleSel.value = String(TEXT_STYLES.findIndex((s) => s.name === 'Субтитры'));
    const pos = h('select', {}, h('option', { value: '0.3' }, 'Снизу'), h('option', { value: '0' }, 'По центру'), h('option', { value: '-0.3' }, 'Сверху'));
    p.append(h('div', { class: 'row wide' }, h('label', {}, 'Язык'), lang));
    p.append(h('div', { class: 'row wide' }, h('label', {}, 'Качество'), model));
    p.append(h('div', { class: 'row wide' }, h('label', {}, 'Слов в строке'), words));
    p.append(h('div', { class: 'row wide' }, h('label', {}, 'Стиль'), styleSel));
    p.append(h('div', { class: 'row wide' }, h('label', {}, 'Положение'), pos));
    const log = h('div', { class: 'note', style: { whiteSpace: 'pre-wrap', maxHeight: '140px', overflow: 'auto', fontFamily: 'Consolas', fontSize: '10.5px' } });
    const btn = h('button', { class: 'primary', style: { width: '100%' } }, 'Распознать речь');
    btn.addEventListener('click', () => runCaptions({ mode: capUi.mode, link: capUi.link, language: lang.value, model: model.value, words: +words.value || 5, style: TEXT_STYLES[+styleSel.value].s, y: +pos.value }, btn, log));
    p.append(btn, log);
    p.append(h('button', { style: { width: '100%', marginTop: '6px' }, onclick: () => change(() => { const ids = new Set(P().tracks.filter((t) => t.captions).map((t) => t.id)); P().clips = P().clips.filter((c) => !ids.has(c.trackId)); P().tracks = P().tracks.filter((t) => !t.captions); }) }, 'Удалить все субтитры'));
    captionTools(p);
  },
};

const capUi = { mode: 'all', link: true, redraw: null, find: '', repl: '', whole: true, cs: false, remember: true, filter: '' };

// ---------- Fixing recognised captions ----------
const captionClips = () => P().clips.filter((c) => c.type === 'text' && (c.words || (trackById(c.trackId) || {}).captions)).sort((a, b) => a.start - b.start);
// Word timings drive the karaoke highlight: same number of words -> keep timings, otherwise spread
// the old span over the new words by their length
function retimeWords(c) {
  if (!c.words || !c.words.length) return;
  const toks = c.text.text.split(/\s+/).filter(Boolean);
  if (!toks.length) { c.words = []; return; }
  if (toks.length === c.words.length) { toks.forEach((t, i) => { c.words[i].word = ' ' + t; }); return; }
  const a = c.words[0].start, b = c.words[c.words.length - 1].end;
  const tot = toks.reduce((s, t) => s + t.length + 1, 0);
  let acc = 0;
  c.words = toks.map((t) => { const s = a + ((b - a) * acc) / tot; acc += t.length + 1; return { start: s, end: a + ((b - a) * acc) / tot, word: ' ' + t }; });
}
function replaceRe(from, whole, cs) {
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(whole ? `(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])` : esc, 'gu' + (cs ? '' : 'i'));
}
// remembered fixes, applied to every new recognition
function applyCapDict(text) {
  for (const d of SET.capDict || []) if (d.from) text = text.replace(replaceRe(d.from, true, false), d.to);
  return text;
}
function captionTools(p) {
  // --- editor ---
  p.append(h('h3', { style: { marginTop: '18px' } }, 'Исправить субтитры'));
  const caps = captionClips();
  if (!caps.length) { p.append(h('div', { class: 'note' }, 'Здесь появится список субтитров после распознавания — любое слово можно будет исправить.')); }
  else {
    const filter = h('input', { type: 'text', placeholder: '🔍 Найти в субтитрах…', value: capUi.filter, style: { width: '100%', marginBottom: '6px' } });
    const list = h('div', { class: 'capList' });
    const draw = () => {
      list.textContent = '';
      const q = capUi.filter.trim().toLowerCase();
      for (const c of caps) {
        if (q && !c.text.text.toLowerCase().includes(q)) continue;
        const inp = h('input', { type: 'text', value: c.text.text });
        inp.addEventListener('focus', () => { seek(c.start + 0.01); selectOnly(c.id); });
        inp.addEventListener('input', () => { beginEdit(); c.text.text = inp.value; requestRender(); });
        inp.addEventListener('change', () => { retimeWords(c); endEdit(); TL.render(); });
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); const n = inp.parentElement.nextElementSibling; if (n) n.querySelector('input').focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); const n = inp.parentElement.previousElementSibling; if (n) n.querySelector('input').focus(); } });
        list.append(h('div', { class: 'capRow' + (S.time >= c.start && S.time < c.start + c.dur ? ' now' : '') },
          h('button', { class: 'capT', title: 'Перейти', onclick: () => { seek(c.start + 0.01); selectOnly(c.id); } }, fmtTime(c.start, P().fps).slice(0, 5)), inp));
      }
      if (!list.children.length) list.append(h('div', { class: 'note' }, 'Ничего не найдено.'));
    };
    filter.addEventListener('input', () => { capUi.filter = filter.value; draw(); });
    draw();
    p.append(h('div', { class: 'note' }, `Субтитров: ${caps.length}. Щёлкните строку — видео перейдёт туда; Enter / ↓ — следующая строка.`), filter, list);
  }
  // --- find & replace ---
  p.append(h('h3', { style: { marginTop: '18px' } }, 'Найти и заменить'));
  const fi = h('input', { type: 'text', placeholder: 'Что: склика', value: capUi.find, style: { width: '100%' } });
  const ri = h('input', { type: 'text', placeholder: 'На что: CutByCut', value: capUi.repl, style: { width: '100%', marginTop: '6px' } });
  const chkRow = (label, key) => { const i = h('input', { type: 'checkbox' }); i.checked = capUi[key]; i.addEventListener('change', () => { capUi[key] = i.checked; count(); }); return h('label', { class: 'capChk' }, i, label); };
  const go = h('button', { class: 'primary', style: { width: '100%', marginTop: '6px' } }, 'Заменить везде');
  const matches = () => { if (!capUi.find) return 0; const re = replaceRe(capUi.find, capUi.whole, capUi.cs); return captionClips().reduce((n, c) => n + (c.text.text.match(re) || []).length, 0); };
  const count = () => { const n = matches(); go.textContent = capUi.find ? `Заменить везде (${n})` : 'Заменить везде'; go.disabled = !n; };
  fi.addEventListener('input', () => { capUi.find = fi.value; count(); });
  ri.addEventListener('input', () => { capUi.repl = ri.value; });
  go.addEventListener('click', async () => {
    const re = replaceRe(capUi.find, capUi.whole, capUi.cs);
    let n = 0;
    change(() => { for (const c of captionClips()) { const t = c.text.text.replace(re, () => { n++; return capUi.repl; }); if (t !== c.text.text) { c.text.text = t; retimeWords(c); } } });
    if (capUi.remember && capUi.whole) await saveSetting({ capDict: [...(SET.capDict || []).filter((d) => d.from.toLowerCase() !== capUi.find.toLowerCase()), { from: capUi.find, to: capUi.repl }] });
    toast(`Заменено: ${n}`);
    capUi.find = capUi.repl = '';
    setPanel('captions');
  });
  p.append(fi, ri, h('div', { class: 'capChks' }, chkRow('Целое слово', 'whole'), chkRow('Учитывать регистр', 'cs'), chkRow('Запомнить и исправлять в новых субтитрах', 'remember')), go);
  count();
  // --- remembered fixes ---
  const dict = SET.capDict || [];
  if (dict.length) {
    const dl = h('div', { class: 'capDict' });
    dict.forEach((d, i) => dl.append(h('span', { class: 'chip' }, `${d.from} → ${d.to}`, h('b', { title: 'Забыть', onclick: async () => { await saveSetting({ capDict: dict.filter((_, j) => j !== i) }); setPanel('captions'); } }, ' ✕'))));
    p.append(h('div', { class: 'note' }, 'Запомненные исправления (применяются сами при распознавании):'), dl);
  }
  // --- hints for Whisper ---
  p.append(h('h3', { style: { marginTop: '18px' } }, 'Подсказки для распознавания'));
  const hints = h('textarea', { placeholder: 'CutByCut, Minecraft, FNAF, ник друга…', style: { minHeight: '54px' } }, SET.capHints || '');
  hints.addEventListener('change', () => saveSetting({ capHints: hints.value.trim() }));
  p.append(hints, h('div', { class: 'note' }, 'Имена, ники, названия игр и английские слова через запятую — Whisper будет писать их именно так.'));
}
function presetStyle(st) {
  const s = { fontFamily: `"${st.font}"`, fontWeight: st.bold ? 700 : 400, fontStyle: st.italic ? 'italic' : 'normal', color: st.color };
  if (st.gradient) Object.assign(s, { background: `linear-gradient(${st.color},${st.color2})`, WebkitBackgroundClip: 'text', color: 'transparent' });
  if (st.strokeWidth) s.WebkitTextStroke = Math.min(2, st.strokeWidth / 4) + 'px ' + st.strokeColor;
  if (st.glow) s.textShadow = `0 0 8px ${st.glowColor}, 0 0 14px ${st.glowColor}`;
  else if (st.shadowBlur || st.shadowDist) s.textShadow = `2px 2px ${st.shadowBlur / 2}px ${st.shadowColor}`;
  if (st.bgOpacity > 0) s.boxShadow = `inset 0 0 0 100px ${rgba(st.bgColor, st.bgOpacity)}`;
  if (st.uppercase) s.textTransform = 'uppercase';
  return s;
}

function mediaTile(m) {
  const used = P().clips.some((c) => c.mediaId === m.id);
  const thumb = h('div', { class: 'thumb' });
  const cc = S.cache[m.id] || {};
  if (m.hidden) return h('span');
  if (m.type === 'image') thumb.style.backgroundImage = `url("${fileUrl(m.path)}")`;
  else if (m.type === 'video' && cc.spritePath) {
    const cv = h('canvas', { width: 160, height: 90 });
    const draw = () => { const sp = cc.sprite; if (!sp || !sp.naturalWidth) return; const fw = sp.naturalWidth / cc.spriteCount; const x = cv.getContext('2d'); const idx = Math.min(cc.spriteCount - 1, 1); const sc = Math.max(160 / fw, 90 / sp.naturalHeight); x.drawImage(sp, idx * fw, 0, fw, sp.naturalHeight, (160 - fw * sc) / 2, (90 - sp.naturalHeight * sc) / 2, fw * sc, sp.naturalHeight * sc); };
    if (cc.sprite && cc.sprite.complete) draw(); else if (cc.sprite) cc.sprite.addEventListener('load', draw);
    thumb.append(cv);
  } else if (m.type === 'audio') { thumb.style.background = 'linear-gradient(135deg,#1f6b64,#132)'; thumb.textContent = '♪'; }
  else thumb.textContent = '…';
  if (m.duration) thumb.append(h('span', { class: 'badge' }, fmtDur(m.duration)));
  if (cc.proxyP != null) thumb.append(h('span', { class: 'badge', id: 'px_' + m.id, style: { left: '4px', right: 'auto', background: 'rgba(255,107,74,.85)' }, title: 'Создаётся лёгкая копия для плавного превью' }, `прокси ${Math.round(cc.proxyP * 100)}%`));
  else if (cc.proxy) thumb.append(h('span', { class: 'badge', style: { left: '4px', right: 'auto' }, title: 'Превью использует лёгкую копию (экспорт — оригинал)' }, '⚡'));
  const tile = h('div', { class: 'tile' + (used ? ' used' : ''), title: m.path }, thumb, h('div', { class: 'name' }, m.name),
    h('button', { class: 'add', title: 'Добавить на таймлайн', onclick: (e) => { e.stopPropagation(); addMediaToTimeline(m); } }, '+'));
  tile.addEventListener('dblclick', () => addMediaToTimeline(m));
  tile.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showMenu(e.clientX, e.clientY, [
      { label: 'Добавить на таймлайн', action: () => addMediaToTimeline(m) },
      { label: 'Показать в папке', action: () => api.showItem(m.path) },
      { label: 'Удалить из проекта', action: () => change(() => { P().clips = P().clips.filter((c) => c.mediaId !== m.id); P().media = P().media.filter((x) => x !== m); }) },
    ]);
  });
  dragData(tile, { kind: 'media', id: m.id });
  return tile;
}

// ---------- Live thumbnails for effects/transitions ----------
let thumbAnim = 0;
function previewSnapshot() {
  const src = $('#preview');
  const c = document.createElement('canvas'); c.width = 160; c.height = 90;
  const x = c.getContext('2d');
  const hasContent = P().clips.length > 0;
  if (hasContent && src.width > 2) {
    const sc = Math.max(160 / src.width, 90 / src.height);
    x.drawImage(src, (160 - src.width * sc) / 2, (90 - src.height * sc) / 2, src.width * sc, src.height * sc);
  } else {
    const g = x.createLinearGradient(0, 0, 160, 90); g.addColorStop(0, '#ff9a5a'); g.addColorStop(0.5, '#c8508c'); g.addColorStop(1, '#3a4bb0');
    x.fillStyle = g; x.fillRect(0, 0, 160, 90);
    x.fillStyle = '#ffe8a0'; x.beginPath(); x.arc(110, 38, 16, 0, 7); x.fill();
    x.fillStyle = '#1c2340'; x.beginPath(); x.moveTo(0, 90); x.lineTo(40, 50); x.lineTo(75, 75); x.lineTo(105, 55); x.lineTo(160, 90); x.fill();
  }
  return c;
}
function drawFilterThumb(cv, snap, f) {
  const x = cv.getContext('2d');
  const look = lookFor({ id: f.id, amt: 1 }, null);
  x.filter = look.css || 'none'; x.drawImage(snap, 0, 0); x.filter = 'none';
  applyTints(x, look, 160, 90, 0);
}
function animateFxThumbs(list) {
  cancelAnimationFrame(thumbAnim);
  const snap = previewSnapshot();
  const t0 = performance.now();
  const frame = () => {
    if (curPanel !== 'effects') return;
    const lt = (performance.now() - t0) / 1000;
    for (const [cv, fx] of list) {
      const x = cv.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
      x.clearRect(0, 0, 160, 90); x.drawImage(snap, 0, 0);
      try { applyEffect(fx.id, cv, lt % 3, 3, 0.8, 160 / 1280, lt); } catch (_) {}
    }
    thumbAnim = requestAnimationFrame(() => setTimeout(frame, 50));
  };
  frame();
}
function animateTransThumbs(list) {
  cancelAnimationFrame(thumbAnim);
  const A = previewSnapshot();
  const B = document.createElement('canvas'); B.width = 160; B.height = 90;
  const bx = B.getContext('2d'); bx.filter = 'hue-rotate(160deg) saturate(1.3)'; bx.drawImage(A, 0, 0); bx.filter = 'none';
  bx.fillStyle = 'rgba(255,255,255,.9)'; bx.font = '700 28px Segoe UI'; bx.textAlign = 'center'; bx.textBaseline = 'middle'; bx.fillText('B', 80, 45);
  const ax = A.getContext('2d'); ax.fillStyle = 'rgba(255,255,255,.9)'; ax.font = '700 28px Segoe UI'; ax.textAlign = 'center'; ax.textBaseline = 'middle'; ax.fillText('A', 80, 45);
  const t0 = performance.now();
  const frame = () => {
    if (curPanel !== 'transitions') return;
    const lt = ((performance.now() - t0) / 1000) % 2;
    const p = clamp((lt - 0.4) / 1.1, 0, 1);
    for (const [cv, tr] of list) {
      const x = cv.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.filter = 'none'; x.globalCompositeOperation = 'source-over';
      x.clearRect(0, 0, 160, 90);
      try { drawTransition(tr.id, x, A, B, p, 160, 90, 160 / 1280); } catch (_) {}
    }
    thumbAnim = requestAnimationFrame(() => setTimeout(frame, 40));
  };
  frame();
}

// ---------- Applying assets ----------
function applyEffectAsset(id, at) {
  const sel = [...S.sel].map(clipById).filter((c) => c && isVisual(c));
  if (fxTarget === 'clip' && sel.length && at == null) {
    change(() => sel.forEach((c) => { c.fxList = c.fxList || []; c.fxList.push({ id, amt: 0.6 }); }));
    toast('Эффект добавлен к клипу');
    return;
  }
  change(() => {
    const t = at != null ? at : S.time;
    const tr = freeTrack('fx', t, 3, (P().tracks.find((x) => x.kind === 'fx') || {}).id);
    const c = makeClip('fx', { start: t, dur: 3, trackId: tr.id });
    c.fx.id = id;
    P().clips.push(c); selectOnly(c.id, true);
  });
}
function applyFilterAsset(id, at, clipTarget) {
  const sv = clipTarget || (at == null ? selectedVisual() : null);
  if (sv) { change(() => { sv.filter = { id, amt: sv.filter ? sv.filter.amt : 1 }; }); setPanel('filters'); return; }
  change(() => {
    const t = at != null ? at : S.time;
    const tr = freeTrack('fx', t, 5, (P().tracks.find((x) => x.kind === 'fx') || {}).id);
    const c = makeClip('filter', { start: t, dur: 5, trackId: tr.id });
    c.filter.id = id;
    P().clips.push(c); selectOnly(c.id, true);
  });
}
function applyTransition(id, all) {
  if (all) {
    const tid = id || 'fade';
    change(() => {
      for (const tr of P().tracks.filter((t) => t.kind === 'video')) {
        const list = clipsOn(tr.id);
        for (let i = 1; i < list.length; i++) if (Math.abs(list[i - 1].start + list[i - 1].dur - list[i].start) < 0.05) list[i].trans = { id: tid, dur: Math.min(+SET.transDur || 0.5, list[i].dur / 2, list[i - 1].dur / 2) };
      }
    });
    toast('Переход применён ко всем стыкам');
    return;
  }
  let target = [...S.sel].map(clipById).find((c) => c && (c.type === 'video' || c.type === 'image'));
  if (!target) {
    const main = P().tracks.find((t) => t.main);
    const list = clipsOn(main.id);
    let best = null, bd = Infinity;
    for (let i = 1; i < list.length; i++) { const d = Math.abs(list[i].start - S.time); if (d < bd) { bd = d; best = list[i]; } }
    target = best;
  }
  if (!target || !prevOnTrack(target)) { toast('Нужно два соседних клипа на одной дорожке'); return; }
  const pv = prevOnTrack(target);
  change(() => { target.trans = { id, dur: target.trans ? target.trans.dur : Math.min(+SET.transDur || 0.5, target.dur / 2, pv.dur / 2) }; });
  selectOnly(target.id);
  INSP.tab = 'transition'; INSP.render();
  seek(Math.max(0, target.start - 0.3));
  setTimeout(() => { if (!S.playing) play(); setTimeout(() => { if (S.playing && S.time > target.start + target.trans.dur + 0.2) pause(); }, (target.trans.dur + 0.8) * 1000); }, 50);
}
function applyTextStyle(st) {
  const list = [...S.sel].map(clipById).filter((c) => c && c.type === 'text');
  if (!list.length) { toast('Выделите текстовый клип'); return; }
  change(() => list.forEach((c) => { const keep = { text: c.text.text, size: c.text.size }; Object.assign(c.text, { ...TEXT_DEFAULT, ...st, text: keep.text }); if (!st.size) c.text.size = keep.size; }));
}

function addText(opt, at) {
  let c;
  change(() => {
    const tp = opt.template != null ? TEXT_TEMPLATES[opt.template] : null;
    const tr = freeTrack('text', at, 3, (P().tracks.find((x) => x.kind === 'text') || {}).id);
    c = makeClip('text', { start: at, dur: +SET.textDur || 3, trackId: tr.id });
    if (tp) {
      Object.assign(c.text, tp.s, { text: tp.text });
      if (tp.x != null) c.tf.x = tp.x * P().width;
      if (tp.y != null) c.tf.y = tp.y * P().height;
      if (tp.anim) Object.assign(c.anim, tp.anim);
    } else c.text.strokeWidth = 0;
    if (P().height > P().width) c.text.size = Math.round(c.text.size * 0.9);
    P().clips.push(c);
    selectOnly(c.id, true);
  });
  INSP.tab = 'text'; INSP.render();
  return c;
}
function addSticker(ch, at) {
  change(() => {
    const tr = freeTrack('text', at, 3, (P().tracks.find((x) => x.kind === 'text') || {}).id);
    const c = makeClip('sticker', { start: at, dur: +SET.textDur || 3, trackId: tr.id, name: ch });
    Object.assign(c.text, { text: ch, size: 220, font: 'Segoe UI Emoji', bold: false, strokeWidth: 0 });
    c.anim.in = 'pop'; c.anim.loop = 'float';
    P().clips.push(c); selectOnly(c.id, true);
  });
}

// Drop from asset panel onto timeline
function dropAsset(d, t, track) {
  if (d.kind === 'media') {
    const m = mediaById(d.id); if (!m) return;
    if (S.mode === 'photo') { photoAddImage(m); return; }
    if (S.mode === 'audio' && !m.hasAudio) { toast('В этом файле нет звука'); return; }
    const kind = m.type === 'audio' || S.mode === 'audio' ? 'audio' : 'video';
    let tr = track && track.kind === kind ? track : null;
    change(() => {
      const c = clipFromMedia(m);
      c.start = t;
      if (!tr) tr = freeTrack(kind, t, c.dur);
      c.trackId = tr.id;
      if (tr.main && $('#magnet').checked) {
        const list = clipsOn(tr.id);
        const after = list.filter((x) => x.start + x.dur / 2 < t);
        c.start = after.length ? after[after.length - 1].start + after[after.length - 1].dur - 0.001 : -1;
      }
      P().clips.push(c);
      resolveOverlap(c);
      selectOnly(c.id, true);
    });
  } else if (d.kind === 'text') addText({ template: d.template }, t);
  else if (d.kind === 'sticker') addSticker(d.ch, t);
  else if (d.kind === 'fx') {
    if (track && track.kind === 'video') {
      const c = clipsOn(track.id).find((x) => activeAt(x, t));
      if (c) { change(() => { c.fxList = c.fxList || []; c.fxList.push({ id: d.id, amt: 0.6 }); }); toast('Эффект добавлен к клипу'); return; }
    }
    applyEffectAsset(d.id, t);
  } else if (d.kind === 'filter') {
    const c = track && track.kind === 'video' ? clipsOn(track.id).find((x) => activeAt(x, t)) : null;
    applyFilterAsset(d.id, t, c);
  } else if (d.kind === 'transition') {
    const c = track && track.kind === 'video' ? clipsOn(track.id).reduce((best, x) => (!best || Math.abs(x.start - t) < Math.abs(best.start - t) ? x : best), null) : null;
    if (c) { S.sel = new Set([c.id]); applyTransition(d.id); }
  } else if (d.kind === 'sfx') addSfx(SFX.find((s) => s.id === d.id), t);
  else if (d.kind === 'gen') addGen(d.id, t);
}

// ============ Built-in sound effects (synthesised) ============
const SFX = [
  { id: 'whoosh', name: 'Свуш', icon: '💨', dur: 0.8 },
  { id: 'pop', name: 'Поп', icon: '🫧', dur: 0.25 },
  { id: 'ding', name: 'Дзинь', icon: '🔔', dur: 1.5 },
  { id: 'boom', name: 'Бум', icon: '💥', dur: 1.6 },
  { id: 'click', name: 'Клик', icon: '🖱', dur: 0.08 },
  { id: 'beep', name: 'Цензура', icon: '🤬', dur: 1.0 },
  { id: 'riser', name: 'Нарастание', icon: '📈', dur: 3 },
  { id: 'laser', name: 'Лазер', icon: '🔫', dur: 0.4 },
  { id: 'coin', name: 'Монетка', icon: '🪙', dur: 0.5 },
  { id: 'error', name: 'Ошибка', icon: '❌', dur: 0.6 },
  { id: 'drum', name: 'Барабанная дробь', icon: '🥁', dur: 2.5 },
  { id: 'heartbeat', name: 'Сердцебиение', icon: '💓', dur: 2 },
  { id: 'swipe', name: 'Перелистывание', icon: '📄', dur: 0.35 },
  { id: 'tada', name: 'Та-да!', icon: '🎉', dur: 1.6 },
  { id: 'glitchsfx', name: 'Глитч', icon: '📺', dur: 0.7 },
  { id: 'bass', name: 'Бас-дроп', icon: '🔊', dur: 1.8 },
];
async function synthSfx(s) {
  const sr = 48000, len = Math.ceil(s.dur * sr);
  const ac = new OfflineAudioContext(2, len, sr);
  const out = ac.createGain(); out.connect(ac.destination);
  const noise = () => { const b = ac.createBuffer(1, len, sr); const d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; const n = ac.createBufferSource(); n.buffer = b; return n; };
  const osc = (type, f) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; return o; };
  const env = (g, a, peak, dec, t0 = 0) => { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec); };
  const T = s.dur;
  switch (s.id) {
    case 'whoosh': { const n = noise(); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(300, 0); f.frequency.exponentialRampToValueAtTime(4000, T * 0.5); f.frequency.exponentialRampToValueAtTime(500, T); const g = ac.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.9, T * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, T); n.connect(f).connect(g).connect(out); n.start(); break; }
    case 'pop': { const o = osc('sine', 900); o.frequency.exponentialRampToValueAtTime(180, 0.12); const g = ac.createGain(); env(g, 0.003, 0.9, 0.15); o.connect(g).connect(out); o.start(); break; }
    case 'ding': for (const [f, a] of [[1318, 0.5], [2636, 0.2], [3954, 0.08]]) { const o = osc('sine', f); const g = ac.createGain(); env(g, 0.005, a, 1.4); o.connect(g).connect(out); o.start(); } break;
    case 'boom': { const o = osc('sine', 120); o.frequency.exponentialRampToValueAtTime(30, 1.2); const g = ac.createGain(); env(g, 0.005, 1, 1.5); o.connect(g).connect(out); o.start(); const n = noise(); const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g2 = ac.createGain(); env(g2, 0.003, 0.8, 0.9); n.connect(f).connect(g2).connect(out); n.start(); break; }
    case 'click': { const n = noise(); const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2000; const g = ac.createGain(); env(g, 0.001, 0.8, 0.04); n.connect(f).connect(g).connect(out); n.start(); break; }
    case 'beep': { const o = osc('sine', 1000); const g = ac.createGain(); g.gain.setValueAtTime(0.5, 0); g.gain.setValueAtTime(0.5, T - 0.02); g.gain.linearRampToValueAtTime(0, T); o.connect(g).connect(out); o.start(); break; }
    case 'riser': { const n = noise(); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(200, 0); f.frequency.exponentialRampToValueAtTime(8000, T); const g = ac.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.9, T * 0.97); g.gain.linearRampToValueAtTime(0, T); n.connect(f).connect(g).connect(out); n.start(); const o = osc('sawtooth', 110); o.frequency.exponentialRampToValueAtTime(880, T); const g2 = ac.createGain(); g2.gain.setValueAtTime(0.0001, 0); g2.gain.exponentialRampToValueAtTime(0.15, T * 0.97); g2.gain.linearRampToValueAtTime(0, T); o.connect(g2).connect(out); o.start(); break; }
    case 'laser': { const o = osc('square', 2200); o.frequency.exponentialRampToValueAtTime(120, 0.35); const g = ac.createGain(); env(g, 0.002, 0.3, 0.35); o.connect(g).connect(out); o.start(); break; }
    case 'coin': { const o = osc('square', 988); o.frequency.setValueAtTime(1319, 0.08); const g = ac.createGain(); g.gain.setValueAtTime(0.25, 0); g.gain.exponentialRampToValueAtTime(0.0001, 0.48); o.connect(g).connect(out); o.start(); break; }
    case 'error': for (let i = 0; i < 2; i++) { const o = osc('square', 180); const g = ac.createGain(); env(g, 0.005, 0.3, 0.2, i * 0.27); o.connect(g).connect(out); o.start(); } break;
    case 'drum': { for (let t = 0; t < T - 0.4; t += 0.05) { const n = noise(); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; const g = ac.createGain(); env(g, 0.002, 0.25 + 0.5 * t / T, 0.06, t); n.connect(f).connect(g).connect(out); n.start(t); } const o = osc('sine', 150); o.frequency.setValueAtTime(150, T - 0.4); o.frequency.exponentialRampToValueAtTime(50, T); const g = ac.createGain(); g.gain.setValueAtTime(0.0001, 0); env(g, 0.003, 1, 0.38, T - 0.4); o.connect(g).connect(out); o.start(); const n2 = noise(); const g3 = ac.createGain(); g3.gain.setValueAtTime(0.0001, 0); env(g3, 0.003, 0.6, 0.38, T - 0.4); n2.connect(g3).connect(out); n2.start(); break; }
    case 'heartbeat': for (const t of [0, 0.25, 1, 1.25]) { const o = osc('sine', 70); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); const g = ac.createGain(); g.gain.setValueAtTime(0.0001, 0); env(g, 0.01, t % 1 ? 0.6 : 1, 0.2, t); o.connect(g).connect(out); o.start(); } break;
    case 'swipe': { const n = noise(); const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.setValueAtTime(800, 0); f.frequency.exponentialRampToValueAtTime(5000, T); const g = ac.createGain(); env(g, 0.06, 0.6, 0.28); n.connect(f).connect(g).connect(out); n.start(); break; }
    case 'tada': for (const [f, t] of [[523, 0], [659, 0.12], [784, 0.24], [1046, 0.36]]) { const o = osc('triangle', f); const g = ac.createGain(); g.gain.setValueAtTime(0.0001, 0); env(g, 0.01, 0.3, 1.2 - t * 0.5, t); o.connect(g).connect(out); o.start(); } break;
    case 'glitchsfx': for (let t = 0; t < T; t += 0.035) { const o = osc(Math.random() > 0.5 ? 'square' : 'sawtooth', 100 + Math.random() * 2000); const g = ac.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.setValueAtTime(0.2 * Math.random(), t); g.gain.setValueAtTime(0.0001, t + 0.03); o.connect(g).connect(out); o.start(); } break;
    default: if (typeof extraSfx === 'function') extraSfx(s.id, ac, out, { noise, osc, env, T }); break;
    case 'bass': { const o = osc('sine', 60); o.frequency.setValueAtTime(110, 0); o.frequency.exponentialRampToValueAtTime(38, 1.4); const g = ac.createGain(); env(g, 0.01, 1, 1.7); const ws = ac.createWaveShaper(); const cu = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; cu[i] = Math.tanh(x * 3); } ws.curve = cu; o.connect(ws).connect(g).connect(out); o.start(); break; }
  }
  return ac.startRendering();
}
function wavFromBuffer(buf) {
  const ch = buf.numberOfChannels, sr = buf.sampleRate, n = buf.length;
  const ab = new ArrayBuffer(44 + n * ch * 2); const v = new DataView(ab);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * ch * 2, true);
  const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = clamp(data[c][i], -1, 1); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return ab;
}
async function previewSfx(s) {
  const buf = await synthSfx(s);
  AC.resume();
  const src = AC.createBufferSource(); src.buffer = buf; src.connect(AC.destination); src.start();
}
async function addSfx(s, at) {
  const buf = await synthSfx(s);
  const p = await api.saveBlob(wavFromBuffer(buf), 'wav');
  const m = await importFile(p, s.name);
  if (!m) return;
  change(() => {
    const c = clipFromMedia(m);
    c.start = at;
    const tr = freeTrack('audio', at, c.dur, (P().tracks.find((x) => x.kind === 'audio') || {}).id);
    c.trackId = tr.id;
    P().clips.push(c); selectOnly(c.id, true);
  });
}
