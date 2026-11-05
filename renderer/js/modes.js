'use strict';
// ============ Three editors in one app: video, audio, photo ============
const MODES = {
  video: {
    name: 'Видеоредактор', short: 'Видео', icon: '🎬', panels: ['assets', 'player', 'inspector', 'timeline'],
    tabs: ['media', 'audio', 'text', 'footage', 'stickers', 'effects', 'transitions', 'filters', 'adjust', 'cuts', 'captions', 'online', 'ai'],
    desc: 'Таймлайн, текст, эффекты, переходы, субтитры и ИИ-помощник',
  },
  audio: {
    name: 'Аудиоредактор', short: 'Аудио', icon: '🎧', panels: ['assets', 'player', 'inspector', 'timeline'],
    tabs: ['audio', 'cuts', 'online'],
    off: ['c:freeze', 'c:rotate90', 'c:sync', 'c:detachAudio', 'i:ratioSel', 'i:previewQ', 'c:snapshot', 'c:fullscreen'],
    desc: 'Дорожки, запись голоса, громкость и затухания, экспорт в MP3, WAV, FLAC',
  },
  photo: {
    name: 'Фоторедактор', short: 'Фото', icon: '🖼', panels: ['assets', 'player', 'inspector', 'layers'],
    tabs: ['media', 'canvas', 'text', 'stickers', 'filters', 'effects', 'adjust', 'online'],
    off: ['c:prevFrame', 'c:play', 'c:nextFrame', 'c:snapshot', 'i:previewQ', 'i:ratioSel', 'i:tcWrap'],
    desc: 'Слои, кадрирование, фильтры, текст и стикеры, экспорт в PNG, JPG, WEBP',
  },
};
const MODE_ICONS = {
  video: '<svg viewBox="0 0 48 48"><rect x="5" y="10" width="38" height="28" rx="6"/><path d="M20 18l11 6-11 6z" class="f"/><path d="M5 18h6M5 30h6M37 18h6M37 30h6"/></svg>',
  audio: '<svg viewBox="0 0 48 48"><path d="M6 24v0M13 17v14M20 9v30M27 15v18M34 20v8M41 24v0" stroke-width="4.5"/></svg>',
  photo: '<svg viewBox="0 0 48 48"><rect x="6" y="9" width="36" height="30" rx="6"/><circle cx="17" cy="19" r="3.5" class="f"/><path d="M7 34l10-9 7 6 7-8 11 11"/></svg>',
};

// Apply a mode to the whole window (also after opening a project of another kind)
function applyMode(mode) {
  if (!MODES[mode]) mode = 'video';
  const changed = S.mode !== mode;
  S.mode = mode;
  if (P()) P().mode = mode;
  for (const m of Object.keys(MODES)) document.body.classList.toggle('mode-' + m, m === mode);
  const chip = $('#modeChip');
  if (chip) chip.textContent = `${MODES[mode].icon} ${MODES[mode].short} ▾`;
  applyModeFlags();
  applyUiItems();
  if (!MODES[mode].tabs.includes(curPanel)) curPanel = MODES[mode].tabs[0];
  ensureTree();
  renderDock(changed);
  LAYERS.render();
  AVIZ.run(mode === 'audio');
  document.title = `${MODES[mode].name} — CutByCut`;
}
// things the settings also touch: the mode wins over them while it is active
function applyModeFlags() {
  const mg = $('#magnet');
  if (mg) mg.checked = S.mode === 'audio' ? false : !!SET.magnet;
  if (S.mode === 'photo') S.previewScale = 1;
}
async function pickMode(mode) {
  newProjectIn(mode);
  HUB.close();
  if (!SET.tourDone && mode === 'video' && !(SET.recent || []).length) setTimeout(() => startTour(), 500);
}
function newProjectIn(mode) {
  S.project = newProject(mode);
  S.projectPath = null;
  undoStack.length = 0; redoStack.length = 0;
  S.sel.clear(); S.time = 0;
  S.dirty = false;
  $('#saveState').textContent = '';
  loadUI();
}
function modeMenu(e) {
  const r = e.currentTarget.getBoundingClientRect();
  const items = Object.entries(MODES).map(([m, d]) => ({ label: `${d.icon} ${d.name}${m === S.mode ? ' ✓' : ''}`, action: () => switchMode(m) }));
  showMenu(r.left, r.bottom + 6, [...items, '-', { label: '🏠 Начальный экран', action: () => cmd('hub') }, { label: '⊞ Редактор интерфейса', key: 'Ctrl+Shift+L', action: () => cmd('uiEditor') }]);
}
async function switchMode(m) {
  if (m === S.mode) return;
  // a video project is the same timeline for the audio editor; a photo is a different kind of project
  const keeps = P().clips.length && m !== 'photo' && S.mode !== 'photo';
  if (keeps) { applyMode(m); markDirty(); setPanel(curPanel); return; }
  if (await confirmDiscard()) newProjectIn(m);
}

// ============ Start screen ============
const HUB = {
  el: null,
  async open(opt = {}) {
    this.close(true);
    const recent = [];
    for (const r of SET.recent || []) { const st = await api.stat(r.path); if (st) recent.push({ ...r, mtime: st.mtime }); }
    const card = (m, i) => {
      const d = MODES[m];
      const c = h('button', { class: 'hubCard hc-' + m, style: { animationDelay: 120 + i * 70 + 'ms' }, onclick: () => pickMode(m) },
        h('span', { class: 'hubIcon', html: MODE_ICONS[m] }), h('b', {}, d.name), h('span', { class: 'hubDesc' }, d.desc));
      return c;
    };
    const remember = h('select', { title: 'Что открывать при запуске' },
      h('option', { value: 'ask' }, 'Показывать этот экран при запуске'), ...Object.entries(MODES).map(([m, d]) => h('option', { value: m }, 'Сразу открывать: ' + d.name)));
    remember.value = SET.startMode || 'ask';
    remember.addEventListener('change', () => saveSetting({ startMode: remember.value }));
    const el = h('div', { id: 'hub' }, h('div', { class: 'hubBlob a' }), h('div', { class: 'hubBlob b' }), h('div', { class: 'hubBlob c' }));
    const inner = h('div', { class: 'hubInner' });
    inner.append(h('div', { class: 'hubBrand' }, h('img', { src: 'logo.svg', alt: '' }), h('span', {}, 'CutByCut')));
    inner.append(h('div', { class: 'hubSub' }, 'Что будем делать?'));
    if (opt.auto) {
      inner.append(h('div', { class: 'hubRestore' }, h('span', {}, h('b', {}, 'Несохранённая работа: '), h('span', { 'data-no-i18n': '' }, `«${opt.auto.project.name}», клипов: ${opt.auto.project.clips.length}`)),
        h('button', { class: 'primary', onclick: async () => { HUB.close(); await openProjectFile(opt.auto.path); markDirty(); } }, 'Восстановить')));
    }
    inner.append(h('div', { class: 'hubCards' }, ...Object.keys(MODES).map(card)));
    if (recent.length) {
      inner.append(h('h4', {}, 'Последние проекты'));
      inner.append(h('div', { class: 'hubRecent' }, ...recent.slice(0, 6).map((r) => h('button', { class: 'hubRec', title: r.path, onclick: async () => { HUB.close(); await openProjectFile(r.path); } },
        h('span', { class: 'hubRecName', 'data-no-i18n': '' }, (MODES[r.mode] || MODES.video).icon + ' ' + (r.name || baseName(r.path))), h('span', { class: 'note' }, fmtWhen(r.mtime))))));
    }
    inner.append(h('div', { class: 'hubFoot' },
      h('button', { onclick: async () => { const p = await api.openProjectDialog(); if (p) { HUB.close(); await openProjectFile(p); } } }, '📂 Открыть проект…'),
      h('button', { onclick: () => { HUB.close(); openVersions(); } }, '🕘 Версии'),
      h('span', { class: 'grow' }), remember,
      opt.closable ? h('button', { onclick: () => HUB.close() }, 'Назад') : null));
    el.append(inner);
    document.body.append(el);
    this.el = el;
  },
  close(now) {
    const el = this.el;
    this.el = null;
    if (!el) return;
    if (now || document.body.classList.contains('noanim')) { el.remove(); return; }
    el.classList.add('out');
    setTimeout(() => el.remove(), 340);
  },
};

// ============ Photo editor: the project is one still picture made of layers ============
const PHOTO_DUR = 10;
// Every clip is a layer: it starts at zero and has a track of its own, so the track order is the layer order
function photoNormalize() {
  const pr = P();
  S.time = 0;
  const seen = new Set();
  for (const c of [...pr.clips]) {
    c.start = 0; c.dur = PHOTO_DUR; c.trans = null;
    if (c.anim) Object.assign(c.anim, { in: 'none', out: 'none', loop: 'none' });
    if (c.text) c.text.textAnim = 'none';
    if (seen.has(c.trackId)) {
      const idx = pr.tracks.findIndex((t) => t.id === c.trackId), src = pr.tracks[idx];
      const nt = { id: uid('t'), kind: src.kind, name: src.kind === 'fx' ? 'Эффект' : 'Слой' };
      pr.tracks.splice(idx, 0, nt);
      c.trackId = nt.id;
    }
    seen.add(c.trackId);
  }
}
function setCanvasSize(w, hh) {
  P().width = Math.max(16, Math.round(w)); P().height = Math.max(16, Math.round(hh)); P().ratio = 'custom';
  layoutStage();
}
function photoAddImage(m) {
  if (m.type !== 'image') { toast('В фоторедактор можно добавить только изображения'); return; }
  change(() => {
    const main = P().tracks.find((t) => t.main);
    const c = makeClip('image', { mediaId: m.id, name: m.name, dur: PHOTO_DUR });
    if (!clipsOn(main.id).length) { c.trackId = main.id; if (m.width) setCanvasSize(m.width, m.height); }
    else { const tr = { id: uid('t'), kind: 'video', name: 'Слой' }; P().tracks.unshift(tr); c.trackId = tr.id; }
    P().clips.push(c);
    S.sel = new Set([c.id]);
  });
}
const CANVAS_SIZES = [['1:1 Instagram', 1080, 1080], ['4:5 Instagram', 1080, 1350], ['9:16 Stories', 1080, 1920], ['16:9 Full HD', 1920, 1080], ['16:9 превью YouTube', 1280, 720], ['A4 300 dpi', 2480, 3508]];
function canvasPanel(p) {
  const pr = P();
  p.append(h('h3', {}, 'Холст'));
  const w = h('input', { type: 'number', min: 16, max: 8000, value: pr.width, style: { width: '84px' } });
  const hh = h('input', { type: 'number', min: 16, max: 8000, value: pr.height, style: { width: '84px' } });
  const apply = () => change(() => setCanvasSize(clamp(+w.value || 16, 16, 8000), clamp(+hh.value || 16, 16, 8000)));
  w.addEventListener('change', apply); hh.addEventListener('change', apply);
  p.append(h('div', { class: 'panelBar' }, w, '×', hh, h('span', { class: 'note', style: { margin: 0 } }, 'пикс.')));
  p.append(h('div', { class: 'btnRow', style: { marginBottom: '12px' } },
    h('button', { title: 'Поменять ширину и высоту', onclick: () => { change(() => setCanvasSize(pr.height, pr.width)); setPanel('canvas'); } }, '⟳ Повернуть холст'),
    h('button', { title: 'Размер как у нижнего изображения', onclick: () => { const c = clipsOn(pr.tracks.find((t) => t.main).id)[0], m = c && mediaById(c.mediaId); if (m && m.width) { change(() => setCanvasSize(m.width, m.height)); setPanel('canvas'); } } }, '⤢ По изображению')));
  p.append(h('h4', {}, 'Готовые размеры'));
  const g = h('div', { class: 'grid small', style: { gridTemplateColumns: '1fr 1fr' } });
  for (const [n, a, b] of CANVAS_SIZES) g.append(h('div', { class: 'chip', style: { margin: 0, textAlign: 'center', padding: '8px 4px', borderRadius: '10px' }, onclick: () => { change(() => setCanvasSize(a, b)); setPanel('canvas'); } }, n, h('div', { class: 'note', style: { margin: '2px 0 0' } }, `${a}×${b}`)));
  p.append(g);
  p.append(h('h4', {}, 'Фон'));
  const col = h('input', { type: 'color', value: pr.bg.color || '#ffffff' });
  col.addEventListener('input', () => { pr.bg.color = col.value; pr.bg.type = 'color'; pr.bg.transparent = false; markDirty(); requestRender(); });
  const tr = h('input', { type: 'checkbox' }); tr.checked = !!pr.bg.transparent;
  tr.addEventListener('change', () => { pr.bg.transparent = tr.checked; markDirty(); requestRender(); });
  p.append(h('div', { class: 'panelBar' }, col, h('label', { class: 'tog', style: { marginLeft: '8px' } }, tr, h('span', {}, 'Прозрачный (для PNG и WEBP)'))));
}
function layerName(c) {
  if (c.text && c.type !== 'image') return (c.text.text || 'Текст').split('\n')[0];
  const m = c.mediaId && mediaById(c.mediaId);
  if (m) return m.name;
  if (c.type === 'fx' && c.fx) { const e = EFFECTS.find((x) => x.id === c.fx.id); return e ? e.name : 'Эффект'; }
  return c.type === 'filter' ? 'Фильтр' : c.type === 'adjust' ? 'Коррекция' : c.name || 'Слой';
}
const LAYERS = {
  render() {
    const box = $('#layersList');
    if (!box || S.mode !== 'photo' || !P()) return;
    box.innerHTML = '';
    const rows = [];
    for (const tr of P().tracks) { if (tr.kind === 'audio') continue; const c = clipsOn(tr.id)[0]; if (c) rows.push({ tr, c }); }
    if (!rows.length) { box.append(h('div', { class: 'empty' }, 'Пока нет слоёв. Откройте фото или добавьте текст.')); return; }
    for (const { tr, c } of rows) {
      const m = c.mediaId && mediaById(c.mediaId);
      const th = h('span', { class: 'layThumb' }, m && m.type === 'image' ? null : c.type === 'text' ? 'T' : c.type === 'sticker' ? (c.text.text || '').slice(0, 2) : '✦');
      if (m && m.type === 'image') th.style.backgroundImage = `url("${fileUrl(m.path)}")`;
      const row = h('div', { class: 'layRow' + (S.sel.has(c.id) ? ' sel' : '') + (tr.hidden ? ' off' : ''), 'data-track': tr.id },
        h('i', { class: 'layGrip', title: 'Тяните, чтобы изменить порядок' }, '⠿'), th,
        h('span', { class: 'layName', 'data-no-i18n': '' }, layerName(c)),
        h('button', { title: tr.hidden ? 'Показать' : 'Скрыть', onclick: (e) => { e.stopPropagation(); change(() => { tr.hidden = !tr.hidden; }); } }, tr.hidden ? '◌' : '👁'),
        h('button', { title: tr.locked ? 'Разблокировать' : 'Заблокировать', onclick: (e) => { e.stopPropagation(); change(() => { tr.locked = !tr.locked; }); } }, tr.locked ? '🔒' : '🔓'),
        h('button', { title: 'Удалить слой', onclick: (e) => { e.stopPropagation(); change(() => { P().clips = P().clips.filter((x) => x !== c); S.sel.delete(c.id); }); } }, '🗑'));
      row.addEventListener('click', () => selectOnly(c.id));
      $('.layGrip', row).addEventListener('pointerdown', (e) => this.drag(e, row));
      box.append(row);
    }
  },
  drag(e0, row) {
    e0.preventDefault(); e0.stopPropagation();
    const box = $('#layersList');
    row.classList.add('dragging');
    const mv = (ev) => {
      const kids = [...box.children].filter((k) => k !== row);
      const r0 = new Map(kids.map((k) => [k, k.getBoundingClientRect().top]));
      const after = kids.find((k) => { const r = k.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
      if (row.nextElementSibling === after) return;
      if (after) box.insertBefore(row, after); else box.append(row);
      if (!document.body.classList.contains('noanim')) for (const k of kids) { const d = r0.get(k) - k.getBoundingClientRect().top; if (d) k.animate([{ transform: `translateY(${d}px)` }, { transform: 'none' }], { duration: 170, easing: 'cubic-bezier(.22,.8,.24,1)' }); }
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      row.classList.remove('dragging');
      const order = [...box.children].map((k) => k.dataset.track);
      change(() => {
        const used = order.map(trackById).filter(Boolean);
        const rest = P().tracks.filter((t) => !order.includes(t.id));
        P().tracks = [...used, ...rest];
      });
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  },
};
function openPhotoExport() {
  if (!P().clips.length) { toast('Сначала добавьте изображение'); return; }
  const pr = P();
  openModal((box) => {
    box.append(h('h2', {}, 'Экспорт изображения'));
    const name = h('input', { type: 'text', value: (pr.name || 'image').replace(/[\\/:*?"<>|]/g, '_'), style: { width: '100%' } });
    const fmt = h('select', {}, h('option', { value: 'png' }, 'PNG — без потерь'), h('option', { value: 'jpeg' }, 'JPG — меньше размер'), h('option', { value: 'webp' }, 'WEBP — для сайтов'));
    fmt.value = SET.photoFmt || 'png';
    const q = h('input', { type: 'range', min: 40, max: 100, value: SET.photoQ || 92 });
    const qv = h('span', { class: 'note', style: { margin: 0 } });
    const scale = h('select', {}, ...[[0.25, '25%'], [0.5, '50%'], [1, '100%'], [2, '200%']].map(([v, n]) => h('option', { value: v }, n)));
    scale.value = '1';
    const info = h('div', { class: 'note' });
    const upd = () => { qv.textContent = q.value + '%'; const k = +scale.value; info.textContent = `Размер: ${Math.round(pr.width * k)}×${Math.round(pr.height * k)} пикс.`; q.disabled = fmt.value === 'png'; };
    q.addEventListener('input', upd); scale.addEventListener('change', upd); fmt.addEventListener('change', upd); upd();
    const row = (l, c) => h('div', { class: 'row' }, h('label', {}, l), c);
    box.append(row('Название', name), row('Формат', fmt), row('Качество', h('div', { class: 'panelBar', style: { margin: 0 } }, q, qv)), row('Масштаб', scale), info);
    const go = h('button', { class: 'primary' }, 'Сохранить');
    box.append(h('div', { class: 'actions' }, h('button', { onclick: closeModal }, 'Отмена'), go));
    go.addEventListener('click', async () => {
      saveSetting({ photoFmt: fmt.value, photoQ: +q.value });
      const ext = fmt.value === 'jpeg' ? 'jpg' : fmt.value;
      const info0 = await api.info();
      const path = await api.saveFile({ title: 'Сохранить изображение', def: `${SET.exportDir || info0.docs}\\${name.value || 'image'}.${ext}`, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
      if (!path) return;
      const k = +scale.value, W = Math.round(pr.width * k), H = Math.round(pr.height * k);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      renderFrame(ctx, 0, W, H);
      requestRender();
      cv.toBlob(async (b) => {
        await api.writeBytes(path, await b.arrayBuffer());
        closeModal();
        toast('✓ Изображение сохранено: ' + baseName(path), 5000);
        if (SET.expAfter === 'folder') api.showItem(path); else if (SET.expAfter === 'play') api.openPath(path);
      }, 'image/' + fmt.value, +q.value / 100);
    });
  });
}

// ============ Audio editor: export and the picture in place of the video player ============
function openAudioExport() {
  const items = audioItems();
  if (!items.length) { toast('На дорожках нет звука'); return; }
  if (S.playing) pause();
  openModal((box) => {
    box.append(h('h2', {}, 'Экспорт аудио'));
    const name = h('input', { type: 'text', value: (P().name || 'audio').replace(/[\\/:*?"<>|]/g, '_'), style: { width: '100%' } });
    const fmt = h('select', {}, h('option', { value: 'mp3' }, 'MP3 — везде открывается'), h('option', { value: 'wav' }, 'WAV — без сжатия'), h('option', { value: 'flac' }, 'FLAC — без потерь'), h('option', { value: 'm4a' }, 'M4A (AAC)'), h('option', { value: 'ogg' }, 'OGG (Vorbis)'));
    fmt.value = SET.audioFmt || 'mp3';
    const br = h('select', {}, ...[128, 192, 256, 320].map((v) => h('option', { value: v }, v + ' кбит/с')));
    br.value = String(SET.audioBr || 256);
    const norm = h('input', { type: 'checkbox' }); norm.checked = !!SET.audioNorm;
    const upd = () => { br.disabled = !['mp3', 'ogg', 'm4a'].includes(fmt.value); };
    fmt.addEventListener('change', upd); upd();
    const status = h('div', { class: 'note' }, `Длительность: ${fmtDur(projectDuration())}. Сводятся все незаглушённые дорожки.`);
    const row = (l, c) => h('div', { class: 'row' }, h('label', {}, l), c);
    box.append(row('Название', name), row('Формат', fmt), row('Битрейт', br), row('Выровнять громкость', h('label', { class: 'tog' }, norm, h('span', {}, 'до −16 LUFS, как на стримингах'))), status);
    const go = h('button', { class: 'primary' }, 'Экспортировать');
    box.append(h('div', { class: 'actions' }, h('button', { onclick: closeModal }, 'Отмена'), go));
    go.addEventListener('click', async () => {
      saveSetting({ audioFmt: fmt.value, audioBr: +br.value, audioNorm: norm.checked });
      const info0 = await api.info();
      const path = await api.saveFile({ title: 'Экспорт аудио', def: `${SET.exportDir || info0.docs}\\${name.value || 'audio'}.${fmt.value}`, filters: [{ name: fmt.value.toUpperCase(), extensions: [fmt.value] }] });
      if (!path) return;
      go.disabled = true; status.textContent = 'Свожу звук…';
      const off = (msg) => { status.textContent = msg; };
      api.onExportStatus(off);
      try {
        await api.exportAudio({ path, items, duration: projectDuration(), format: fmt.value, bitrate: +br.value, loudnorm: norm.checked });
        closeModal();
        toast('✓ Аудио сохранено: ' + baseName(path), 5000);
        if (SET.expAfter === 'folder') api.showItem(path); else if (SET.expAfter === 'play') api.openPath(path);
      } catch (e) { status.textContent = 'Ошибка: ' + e.message.slice(0, 300); go.disabled = false; }
    });
  });
}
// Spectrum while playing, the whole mix as one waveform below it
const AVIZ = {
  on: false, ver: -1, w: 0, peaks: null, smooth: null,
  run(on) { if (on === this.on) return; this.on = on; if (on) { this.bind(); this.tick(); } },
  bind() {
    const cv = $('#audioViz');
    if (cv.dataset.bound) return;
    cv.dataset.bound = '1';
    cv.addEventListener('pointerdown', (e) => {
      const go = (ev) => { const r = cv.getBoundingClientRect(); seek(clamp((ev.clientX - r.left) / r.width, 0, 1) * Math.max(0.01, projectDuration())); };
      go(e);
      const up = () => { window.removeEventListener('pointermove', go); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', go); window.addEventListener('pointerup', up);
    });
  },
  overview(w) {
    const D = Math.max(0.01, projectDuration());
    const out = new Float32Array(w);
    for (const c of P().clips) {
      if (c.type !== 'audio' && c.type !== 'video') continue;
      const tr = trackById(c.trackId), cc = S.cache[c.mediaId];
      if (c.muted || (tr && (tr.muted || tr.hidden)) || !cc || !cc.peaks) continue;
      const a = Math.floor((c.start / D) * w), b = Math.min(w, Math.ceil(((c.start + c.dur) / D) * w));
      for (let x = a; x < b; x++) {
        const t = (x / w) * D;
        const i = Math.floor(srcTime(c, t) * 100);
        const v = ((cc.peaks[i] || 0) / 255) * Math.min(2, c.volume) * fadeGain(c, t);
        if (v > out[x]) out[x] = v;
      }
    }
    return out;
  },
  tick() {
    if (!this.on) return;
    requestAnimationFrame(() => this.tick());
    const cv = $('#audioViz');
    if (!cv || !cv.offsetParent) return;
    const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); this.ver = -1; }
    const x = cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    const col = uiColors();
    const pad = 18, sH = H * 0.54, oTop = sH + 14, oH = Math.max(20, H - oTop - pad);
    // spectrum
    const n = Math.max(16, Math.min(72, Math.floor((W - pad * 2) / 11)));
    if (!this.freq) this.freq = new Uint8Array(AC_AN.frequencyBinCount);
    if (!this.smooth || this.smooth.length !== n) this.smooth = new Float32Array(n);
    AC_AN.getByteFrequencyData(this.freq);
    const bw = (W - pad * 2) / n;
    x.fillStyle = col.accent;
    for (let i = 0; i < n; i++) {
      const a = Math.floor(Math.pow(i / n, 1.8) * this.freq.length * 0.7), b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / n, 1.8) * this.freq.length * 0.7));
      let v = 0;
      for (let k = a; k < b; k++) v = Math.max(v, this.freq[k]);
      v = S.playing ? v / 255 : 0;
      this.smooth[i] += (v - this.smooth[i]) * (v > this.smooth[i] ? 0.55 : 0.14);
      const hh = Math.max(3, this.smooth[i] * (sH - pad - 6));
      x.globalAlpha = 0.28 + this.smooth[i] * 0.72;
      x.beginPath(); x.roundRect(pad + i * bw + 1.5, sH - hh, Math.max(2, bw - 3), hh, 3); x.fill();
    }
    x.globalAlpha = 1;
    // the whole mix
    const ow = Math.max(1, Math.floor(W - pad * 2));
    const known = P().media.filter((m) => (S.cache[m.id] || {}).peaks).length;
    if (this.ver !== S.ver || this.w !== ow || this.known !== known) { this.peaks = this.overview(ow); this.ver = S.ver; this.w = ow; this.known = known; }
    const D = Math.max(0.01, projectDuration()), px = (S.time / D) * ow, mid = oTop + oH / 2;
    for (let i = 0; i < ow; i++) {
      const hh = Math.max(1, Math.min(1, this.peaks[i]) * oH);
      x.fillStyle = i < px ? col.accent : col.line;
      x.fillRect(pad + i, mid - hh / 2, 1, hh);
    }
    x.fillStyle = col.text;
    x.fillRect(pad + px, oTop - 3, 1.5, oH + 6);
    x.font = '600 11px "Segoe UI"'; x.textBaseline = 'top';
    if (!P().clips.length) { x.textAlign = 'center'; x.fillText(tr('Перетащите сюда аудиофайл или запишите голос'), W / 2, sH / 2); x.textAlign = 'left'; }
  },
};
