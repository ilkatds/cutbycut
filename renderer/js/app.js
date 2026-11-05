'use strict';
// ============ History ============
const undoStack = [], redoStack = [];
function snapshot() { return JSON.stringify(P()); }
function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 150) undoStack.shift(); redoStack.length = 0; }
function restore(json) {
  S.project = JSON.parse(json);
  for (const id of [...S.sel]) if (!clipById(id)) S.sel.delete(id);
  for (const m of P().media) loadMediaCache(m);
  afterChange();
}
function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); }
function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); }
function change(fn) { pushUndo(); fn(); afterChange(); }
function afterChange(light) {
  S.ver = (S.ver || 0) + 1;
  if (S.mode === 'photo') photoNormalize();
  packMain();
  syncLinked();
  markDirty();
  TL.render();
  LAYERS.render();
  if (!light) INSP.render(); else INSP.refreshKf();
  requestRender();
  if (curPanel === 'media' || curPanel === 'audio') setPanel(curPanel);
}
function markDirty() { S.dirty = true; $('#saveState').textContent = '● не сохранено'; }

// ============ Selection ============
function selectOnly(id) { S.sel = new Set(id ? [id] : []); onSelChange(); }
// Captions made for one clip carry link = that clip's id and linkAt = where the clip started.
// Whenever the clip ends up elsewhere (dragged, magnet track, assistant...) they shift by the same amount.
function syncLinked() {
  const byId = new Map(P().clips.map((c) => [c.id, c]));
  for (const c of P().clips) {
    if (!c.link) continue;
    const host = byId.get(c.link);
    if (!host) { delete c.link; delete c.linkAt; continue; } // the clip was deleted: captions stay where they are
    const d = host.start - c.linkAt;
    if (Math.abs(d) > 1e-6) { c.start = Math.max(0, c.start + d); c.linkAt = host.start; }
  }
}
function onSelChange() {
  $$('.clip', $('#tlTracks')).forEach((el) => el.classList.toggle('sel', S.sel.has(el.dataset.clip)));
  INSP.render();
  updateOverlay();
  LAYERS.render();
  if (curPanel === 'filters') setPanel('filters');
  if (curPanel === 'captions' && capUi.redraw) capUi.redraw(); // live "selected clips" count
}

// ============ Media import ============
async function importAndLayer() { const files = await api.openMedia(); for (const f of files) { const m = await importFile(f); if (m) photoAddImage(m); } }
async function importDialog() { const files = await api.openMedia(); for (const f of files) await importFile(f); }
async function importFile(path, name) {
  try {
    const exist = P().media.find((m) => m.path === path);
    if (exist) return exist;
    const info = await api.probe(path);
    if (info.type !== 'image' && !(info.duration > 0)) { toast('Не удалось прочитать файл: ' + baseName(path)); return null; }
    const m = { id: uid('m'), path, name: name || noExt(baseName(path)), type: info.type, duration: info.duration, width: info.width, height: info.height, hasAudio: info.hasAudio, fps: info.fps };
    if (m.type === 'image') { const im = await loadImage(path); m.width = im.naturalWidth; m.height = im.naturalHeight; }
    P().media.push(m);
    loadMediaCache(m);
    markDirty();
    if (curPanel === 'media' || curPanel === 'audio') setPanel(m.type === 'audio' && curPanel === 'audio' ? 'audio' : curPanel);
    return m;
  } catch (e) {
    toast('Ошибка импорта: ' + e.message, 4000);
    return null;
  }
}
function loadImage(p) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = fileUrl(p); }); }
function loadMediaCache(m) {
  const cc = (S.cache[m.id] = S.cache[m.id] || {});
  if (cc.loading) return;
  cc.loading = true;
  if (m.type === 'image') getImg(m);
  if (m.type === 'video') ensureProxy(m);
  if (m.type === 'video') {
    api.thumbs(m.path, m.duration).then((r) => {
      cc.spritePath = r.path; cc.spriteCount = r.count;
      cc.sprite = new Image(); cc.sprite.onload = () => { TL.drawStrips(); if (curPanel === 'media') setPanel('media'); }; cc.sprite.src = fileUrl(r.path);
    }).catch(() => {});
  }
  if (m.hasAudio) api.peaks(m.path).then((p) => { cc.peaks = p; TL.drawStrips(); }).catch(() => {});
}
// ---------- Preview proxies (one at a time, in the background) ----------
const proxyQueue = [];
let proxyBusy = false;
api.onProxyProgress(({ id, p }) => {
  const cc = S.cache[id]; if (cc) cc.proxyP = p;
  const el = document.getElementById('px_' + id);
  if (el) el.textContent = `прокси ${Math.round(p * 100)}%`;
});
async function ensureProxy(m) {
  const needs = m.duration >= (+SET.proxyMinDur || 0) && (m.width > 1280 || (m.fps || 30) > 31 || m.duration > (+SET.proxyMinDur || 90));
  if (!needs) return;
  const cc = (S.cache[m.id] = S.cache[m.id] || {});
  const have = await api.proxyExisting(m.path);
  if (have) { cc.proxy = have; requestRender(); return; }
  if (!proxyQueue.includes(m)) proxyQueue.push(m);
  runProxyQueue();
}
async function runProxyQueue() {
  if (proxyBusy) return;
  const m = proxyQueue.shift();
  if (!m) return;
  proxyBusy = true;
  const cc = (S.cache[m.id] = S.cache[m.id] || {});
  cc.proxyP = 0;
  if (curPanel === 'media') setPanel('media');
  try {
    cc.proxy = await api.proxyMake({ id: m.id, file: m.path, duration: m.duration });
    toast(`Превью «${m.name}» ускорено: создана лёгкая копия для монтажа`, 3500);
    requestRender();
  } catch (e) { console.warn('proxy', e); }
  cc.proxyP = null;
  proxyBusy = false;
  if (curPanel === 'media') setPanel('media');
  runProxyQueue();
}

function clipFromMedia(m) {
  const type = m.type === 'audio' || S.mode === 'audio' ? 'audio' : m.type;
  const c = makeClip(type, { mediaId: m.id, name: m.name, dur: m.type === 'image' ? (+SET.imageDur || 4) : m.duration });
  return c;
}
function autoRatio(m) {
  if (P().clips.some((c) => c.type === 'video' || c.type === 'image') || !m.width) return;
  const ar = m.width / m.height;
  let best = RATIOS[0], bd = Infinity;
  for (const r of RATIOS) { const d = Math.abs(Math.log(r.w / r.h / ar)); if (d < bd) { bd = d; best = r; } }
  if (best.id !== P().ratio) { setRatio(best.id); toast('Формат холста: ' + best.label); }
}
function addMediaToTimeline(m) {
  if (S.mode === 'photo') { photoAddImage(m); return; }
  if (S.mode === 'audio' && !m.hasAudio) { toast('В этом файле нет звука'); return; }
  change(() => {
    const c = clipFromMedia(m);
    if (c.type === 'audio') {
      c.start = S.time;
      c.trackId = freeTrack('audio', S.time, c.dur, (P().tracks.find((t) => t.kind === 'audio') || {}).id).id;
    } else {
      autoRatio(m);
      const main = P().tracks.find((t) => t.main);
      c.trackId = main.id;
      if ($('#magnet').checked) {
        const list = clipsOn(main.id);
        const cur = list.find((x) => activeAt(x, S.time));
        c.start = cur ? cur.start + cur.dur - 0.0005 : (list.length && S.time < list[0].start ? -1 : 1e9);
      } else { c.start = S.time; resolveOverlap(c); }
    }
    P().clips.push(c);
    selectOnly(c.id);
  });
  const c = [...S.sel].map(clipById)[0];
  if (c) { seek(c.start); TL.updatePlayhead(true); }
}
function replaceMedia(c) {
  api.openMedia().then(async (files) => {
    if (!files[0]) return;
    const m = await importFile(files[0]);
    if (!m) return;
    change(() => { c.mediaId = m.id; c.in = 0; if (m.duration) c.dur = Math.min(c.dur, m.duration / c.speed); c.reversed = false; });
  });
}

function setRatio(id) {
  const r = RATIOS.find((x) => x.id === id) || RATIOS[0];
  P().ratio = r.id; P().width = r.w; P().height = r.h;
  $('#ratioSel').value = r.id;
  layoutStage();
}

// ============ Clip operations ============
let clipboard = null;
function cloneClip(c) { const n = deep(c); n.id = uid('c'); return n; }
function splitClip(c, t) {
  if (t <= c.start + 1 / P().fps || t >= c.start + c.dur - 1 / P().fps) return null;
  const leftDur = t - c.start;
  const r = cloneClip(c);
  r.start = t; r.dur = c.dur - leftDur;
  if (c.in != null && c.freeze == null) r.in = c.in + leftDur * c.speed;
  r.trans = null; r.anim.in = 'none'; if (r.fadeIn != null) r.fadeIn = 0;
  c.dur = leftDur; c.anim.out = 'none'; if (c.fadeOut != null) c.fadeOut = 0;
  r.kf = {}; const lk = {};
  for (const [p, list] of Object.entries(c.kf || {})) {
    const L = list.filter((k) => k.t <= leftDur), R = list.filter((k) => k.t >= leftDur).map((k) => ({ t: k.t - leftDur, v: k.v }));
    if (L.length) lk[p] = L; if (R.length) r.kf[p] = R;
  }
  c.kf = lk;
  if (c.words) { r.words = c.words.filter((w) => w.end > leftDur).map((w) => ({ ...w, start: w.start - leftDur, end: w.end - leftDur })); c.words = c.words.filter((w) => w.start < leftDur); }
  P().clips.push(r);
  return r;
}
function targetsAtPlayhead() {
  let list = [...S.sel].map(clipById).filter((c) => c && activeAt(c, S.time) && !trackById(c.trackId).locked);
  if (!list.length) { const main = P().tracks.find((t) => t.main); list = clipsOn(main.id).filter((c) => activeAt(c, S.time)); }
  return list;
}
function deleteSel(ripple) {
  const del = new Set([...S.sel].filter((id) => { const c = clipById(id); return c && !trackById(c.trackId).locked; }));
  if (!del.size) return;
  change(() => {
    if (ripple) {
      for (const id of del) {
        const c = clipById(id);
        for (const o of P().clips) if (o.trackId === c.trackId && o.start >= c.start + c.dur - 1e-4 && !del.has(o.id)) o.start -= c.dur;
      }
    }
    P().clips = P().clips.filter((c) => !del.has(c.id));
    S.sel.clear();
  });
}
function copyClips() {
  const list = [...S.sel].map(clipById).filter(Boolean);
  if (!list.length) return;
  const t0 = Math.min(...list.map((c) => c.start));
  clipboard = list.map((c) => ({ ...deep(c), _off: c.start - t0 }));
  clipMarker = 'sklejka-clips:' + uid('cb');
  api.clipWriteText(clipMarker);
  toast(`Скопировано: ${list.length}`);
}
function pasteClips() {
  if (!clipboard) return;
  change(() => {
    S.sel.clear();
    for (const src of clipboard) {
      const c = deep(src); c.id = uid('c'); c.start = S.time + c._off; delete c._off;
      if (!trackById(c.trackId)) c.trackId = freeTrack(KIND_OF[c.type], c.start, c.dur).id;
      P().clips.push(c); resolveOverlap(c); S.sel.add(c.id);
    }
  });
}

async function cmd(name) {
  const sel = [...S.sel].map(clipById).filter(Boolean);
  const one = sel[0];
  switch (name) {
    case 'new': case 'hub': if (await confirmDiscard()) HUB.open({ closable: true }); break;
    case 'uiEditor': UIED.open(); break;
    case 'projectMenu': projectMenu(); break;
    case 'open': if (await confirmDiscard()) { const p = await api.openProjectDialog(); if (p) await openProjectFile(p); } break;
    case 'save': await saveProject(false); break;
    case 'saveAs': await saveProject(true); break;
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'export': exportButtonClick(); break;
    case 'help': openGuide(); break;
    case 'settings': openSettings(); break;
    case 'versions': openVersions(); break;
    case 'play': if (S.mode !== 'photo') { S.playing ? pause() : play(); } break;
    case 'prevFrame': seek(S.time - 1 / P().fps); break;
    case 'nextFrame': seek(S.time + 1 / P().fps); break;
    case 'snapshot': { const cv = document.createElement('canvas'); const { W, H } = { W: P().width, H: P().height }; cv.width = W; cv.height = H; renderFrame(cv.getContext('2d'), S.time, W, H); cv.toBlob(async (b) => { const p = await api.snapshot(await b.arrayBuffer(), 'кадр.png'); if (p) toast('Кадр сохранён'); }, 'image/png'); break; }
    case 'fullscreen': document.body.classList.toggle('fs'); setTimeout(layoutStage, 30); break;
    case 'split': { const list = targetsAtPlayhead(); if (!list.length) { toast('Под головкой нет клипа'); break; } change(() => { const news = []; for (const c of list) { const r = splitClip(c, S.time); if (r) news.push(r.id); } if (news.length) S.sel = new Set(news); }); break; }
    case 'splitLeft': case 'splitRight': {
      const list = targetsAtPlayhead(); if (!list.length) break;
      change(() => {
        for (const c of list) {
          const r = splitClip(c, S.time);
          if (!r) continue;
          if (name === 'splitLeft') { P().clips = P().clips.filter((x) => x !== c); if (!trackById(r.trackId).main || !$('#magnet').checked) {} }
          else P().clips = P().clips.filter((x) => x !== r);
        }
      });
      if (name === 'splitLeft' && $('#magnet').checked) seek(Math.min(S.time, projectDuration()));
      break;
    }
    case 'delete': deleteSel(false); break;
    case 'rippleDelete': deleteSel(true); break;
    case 'duplicate': if (!sel.length) break; change(() => { S.sel.clear(); for (const c of sel) { const n = cloneClip(c); n.start = c.start + c.dur; n.trans = null; P().clips.push(n); if (!(trackById(n.trackId).main && $('#magnet').checked)) { for (const o of P().clips) if (o !== n && o !== c && o.trackId === c.trackId && o.start >= c.start + c.dur - 1e-4 && false) o.start += c.dur; resolveOverlap(n); } else n.start = c.start + c.dur - 0.0005; S.sel.add(n.id); } }); break;
    case 'freeze': {
      const c = (sel.find((x) => x.type === 'video' && activeAt(x, S.time))) || targetsAtPlayhead().find((x) => x.type === 'video');
      if (!c) { toast('Выделите видеоклип под головкой'); break; }
      change(() => {
        const t = S.time;
        const st = srcTime(c, t);
        const r = splitClip(c, t);
        const fz = cloneClip(c);
        Object.assign(fz, { start: t, dur: 3, freeze: st, muted: true, trans: null, kf: {}, anim: { ...c.anim, in: 'none', out: 'none' }, fadeIn: 0, fadeOut: 0 });
        for (const o of P().clips) if (o.trackId === c.trackId && o.start >= t - 1e-4 && o !== fz) o.start += 3;
        P().clips.push(fz);
        S.sel = new Set([fz.id]);
      });
      break;
    }
    case 'reverse': {
      const c = sel.find((x) => x.type === 'video' || x.type === 'audio');
      if (!c) { toast('Выделите видео или аудио'); break; }
      const m = mediaById(c.mediaId);
      if (c.reversed && c.origMediaId) { change(() => { const om = mediaById(c.origMediaId); c.in = Math.max(0, om.duration - (c.in + c.dur * c.speed)); c.mediaId = c.origMediaId; c.reversed = false; }); break; }
      toast('Создаю реверс… это может занять время', 60000);
      try {
        const p = await api.reverse(m.path, m.type === 'video');
        const rm = await importFile(p, m.name + ' (реверс)');
        if (!rm) break;
        rm.hidden = true;
        change(() => { c.origMediaId = c.mediaId; c.in = Math.max(0, rm.duration - (c.in + c.dur * c.speed)); c.mediaId = rm.id; c.reversed = true; });
        toast('Реверс готов');
      } catch (e) { toast('Не удалось: ' + e.message, 5000); }
      break;
    }
    case 'detachAudio': {
      const c = sel.find((x) => x.type === 'video');
      if (!c || !hasAudioTrack(c)) { toast('Выделите видео со звуком'); break; }
      change(() => {
        const a = makeClip('audio', { mediaId: c.mediaId, in: c.in, speed: c.speed, start: c.start, dur: c.dur, volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut, name: c.name + ' (аудио)' });
        a.trackId = freeTrack('audio', a.start, a.dur, (P().tracks.find((t) => t.kind === 'audio') || {}).id).id;
        c.muted = true;
        P().clips.push(a);
        S.sel = new Set([a.id]);
      });
      break;
    }
    case 'rotate90': if (!sel.length) break; change(() => sel.filter(isVisual).forEach((c) => { c.tf.rot = ((c.tf.rot || 0) + 90) % 360; })); break;
    case 'record': toggleRecord(); break;
    case 'marker': change(() => { const i = P().markers.findIndex((m) => Math.abs(m.t - S.time) < 2 / S.pps * 3); if (i >= 0) P().markers.splice(i, 1); else P().markers.push({ t: S.time, color: '#ffb03a' }); }); break;
    case 'zoomIn': TL.setZoom(S.pps * 1.3); break;
    case 'zoomOut': TL.setZoom(S.pps / 1.3); break;
    case 'zoomFit': TL.zoomFit(); break;
    case 'selectAll': S.sel = new Set(P().clips.map((c) => c.id)); onSelChange(); break;
    case 'shortcuts': showShortcuts(); break;
    case 'ai': setPanel('ai'); break;
    case 'aiVoice': if (curPanel !== 'ai') setPanel('ai'); aiVoiceToggle(); break;
    case 'sync': openSync(); break;
    case 'silence': change(() => cutSilence(0.05, 0.6, 0.12)); break;
  }
}
function editPoints() {
  const pts = new Set([0]);
  for (const c of P().clips) { pts.add(+c.start.toFixed(4)); pts.add(+(c.start + c.dur).toFixed(4)); }
  for (const m of P().markers) pts.add(+m.t.toFixed(4));
  return [...pts].sort((a, b) => a - b);
}

function showShortcuts() {
  const rows = [
    ['Пробел', 'Воспроизведение / пауза'], ['← / →', 'Кадр назад / вперёд (Shift — на секунду)'], ['↑ / ↓', 'К предыдущей / следующей склейке'], ['Home / End', 'В начало / конец'],
    ['Ctrl+B, S', 'Разделить в позиции головки'], ['Q / W', 'Удалить слева / справа от головки'], ['Del', 'Удалить'], ['Shift+Del', 'Удалить со сдвигом'],
    ['Ctrl+C / X / V', 'Копировать / вырезать / вставить'], ['Ctrl+D', 'Дублировать'], ['Ctrl+Z / Ctrl+Y', 'Отменить / повторить'], ['Ctrl+A', 'Выделить всё'],
    ['M', 'Маркер'], ['+ / −, Ctrl+колесо', 'Масштаб таймлайна'], ['Shift+Z', 'Вместить таймлайн'], ['Ctrl+I', 'Импорт медиа'], ['Ctrl+S / Ctrl+Shift+S', 'Сохранить / сохранить как'],
    ['Ctrl+O / Ctrl+N', 'Открыть / новый проект'], ['Ctrl+E', 'Экспорт'], ['F', 'Полноэкранный просмотр'], ['Esc', 'Снять выделение'],
  ];
  openModal((box) => {
    box.append(h('h2', {}, 'Горячие клавиши'));
    const t = h('table', { class: 'keys' });
    for (const [k, d] of rows) t.append(h('tr', {}, h('td', {}, k), h('td', {}, d)));
    box.append(t, h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: closeModal }, 'Закрыть')));
  });
}

// ============ Project files ============
function serialize() { const p = deep(P()); p.name = $('#projName').textContent.trim() || 'Без названия'; return JSON.stringify({ app: 'cutbycut', version: 1, project: p }, null, 1); }
async function saveProject(as) {
  P().name = $('#projName').textContent.trim() || 'Без названия';
  let p = S.projectPath;
  if (!p || as) { const info = await api.info(); p = await api.saveProjectDialog(`${SET.projectsDir || info.docs}\\${P().name}.cutbycut`); if (!p) return false; }
  await api.writeTextSafe(p, serialize());
  S.projectPath = p; S.dirty = false;
  rememberRecent(p);
  saveVersion(true);
  $('#saveState').textContent = '✓ сохранено';
  toast('Проект сохранён');
  return true;
}
async function openProjectFile(p) {
  try {
    const j = JSON.parse(await api.readText(p));
    S.project = j.project;
    S.projectPath = /autosave\.sklejka$|[\\/]versions[\\/]/i.test(p) ? null : p;
    rememberRecent(p);
    undoStack.length = 0; redoStack.length = 0; S.sel.clear(); S.time = 0;
    S.cache = {};
    for (const [, e] of elPool) { e.el.pause(); e.el.removeAttribute('src'); e.el.remove(); }
    elPool.clear();
    const missing = [];
    for (const m of P().media) { if (!(await api.exists(m.path))) missing.push(m.name); else loadMediaCache(m); }
    loadUI();
    S.dirty = false; $('#saveState').textContent = '';
    if (missing.length) toast(`Не найдены файлы (${missing.length}). Укажите папку: «Ещё» → «Найти пропавшие файлы»`, 7000);
  } catch (e) { toast('Не удалось открыть проект: ' + e.message, 5000); }
}
async function confirmDiscard() {
  if (!S.dirty || !P().clips.length) return true;
  const r = await api.confirm('Сохранить изменения в проекте?', ['Сохранить', 'Не сохранять', 'Отмена']);
  if (r === 0) return await saveProject(false);
  return r === 1;
}
async function autosave() {
  if (!S.dirty || S.exporting) return;
  try { await api.writeTextSafe(await api.autosavePath(), serialize()); } catch (_) {}
  saveVersion(false);
}

// ============ Preview overlay (move / scale / rotate on canvas) ============
function stageScale() { return $('#stage').clientWidth / P().width; }
function updateOverlay() {
  const ov = $('#overlay');
  const ids = [...S.sel];
  const c = ids.length === 1 ? clipById(ids[0]) : null;
  let box = $('.box', ov);
  if (!c || !isVisual(c) || !activeAt(c, S.time) || !S.bounds[c.id] || S.playing) { if (box) box.remove(); return; }
  const b = S.bounds[c.id], d = stageScale();
  if (!box) {
    box = h('div', { class: 'box' }, h('div', { class: 'h nw', 'data-h': 'scale' }), h('div', { class: 'h ne', 'data-h': 'scale' }), h('div', { class: 'h sw', 'data-h': 'scale' }), h('div', { class: 'h se', 'data-h': 'scale' }), h('div', { class: 'h rot', 'data-h': 'rot' }));
    ov.append(box);
  }
  Object.assign(box.style, { left: ((P().width / 2 + b.cx - b.w / 2) * d) + 'px', top: ((P().height / 2 + b.cy - b.h / 2) * d) + 'px', width: b.w * d + 'px', height: b.h * d + 'px', transform: `rotate(${b.rot}deg)` });
}
function hitTest(px, py) {
  // px,py in project coords relative to centre; topmost visual track first
  const t = S.time;
  for (const tr of P().tracks) {
    if (tr.kind !== 'video' && tr.kind !== 'text') continue;
    if (tr.hidden || tr.locked) continue;
    for (const c of clipsOn(tr.id).filter((c) => activeAt(c, t)).reverse()) {
      const b = S.bounds[c.id]; if (!b) continue;
      const a = (-b.rot * Math.PI) / 180, dx = px - b.cx, dy = py - b.cy;
      const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) return c;
    }
  }
  return null;
}
function initOverlay() {
  const ov = $('#overlay');
  ov.addEventListener('pointerdown', (e) => {
    if (S.playing) pause();
    const r = ov.getBoundingClientRect();
    const d = stageScale();
    const toP = (ev) => ({ x: (ev.clientX - r.left) / d - P().width / 2, y: (ev.clientY - r.top) / d - P().height / 2 });
    const p0 = toP(e);
    // Alt+click/drag aims the spotlight of the selected clip (Alt+Shift = end point of a pan)
    if (e.altKey) {
      const sc = [...S.sel].map(clipById).filter(Boolean)[0];
      const fx = sc && (sc.type === 'fx' ? (sc.fx.id === 'spotlight' ? sc.fx : null) : (sc.fxList || []).find((f) => f.id === 'spotlight'));
      if (fx) {
        e.preventDefault();
        pushUndo();
        const end = e.shiftKey && fx.spotMode === 'pan';
        const aim = (p) => { fx[end ? 'sx2' : 'sx'] = clamp(p.x / (P().width / 2), -1, 1); fx[end ? 'sy2' : 'sy'] = clamp(p.y / (P().height / 2), -1, 1); if (fx.spotMode !== 'pan') fx.spotMode = 'point'; requestRender(); };
        aim(p0);
        const mv = (ev) => aim(toP(ev));
        const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); afterChange(); };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
        return;
      }
    }
    const handle = e.target.dataset.h;
    let c = [...S.sel].length === 1 ? clipById([...S.sel][0]) : null;
    if (!handle) { c = hitTest(p0.x, p0.y); selectOnly(c ? c.id : null); if (!c) return; }
    if (!c) return;
    e.preventDefault();
    const b = S.bounds[c.id];
    const start = { x: propAt(c, 'x', S.time), y: propAt(c, 'y', S.time), scale: propAt(c, 'scale', S.time), rot: propAt(c, 'rot', S.time) };
    const d0 = Math.hypot(p0.x - b.cx, p0.y - b.cy);
    const a0 = Math.atan2(p0.y - b.cy, p0.x - b.cx);
    let edited = false;
    const mv = (ev) => {
      const p = toP(ev);
      if (!edited) { beginEdit(); edited = true; }
      $$('.guide', ov).forEach((g) => g.remove());
      if (handle === 'scale') setProp(c, 'scale', clamp(start.scale * (Math.hypot(p.x - b.cx, p.y - b.cy) / Math.max(1, d0)), 0.01, 20));
      else if (handle === 'rot') {
        let rot = start.rot + ((Math.atan2(p.y - b.cy, p.x - b.cx) - a0) * 180) / Math.PI;
        if (ev.shiftKey) rot = Math.round(rot / 15) * 15; else for (const sn of [-180, -90, 0, 90, 180]) if (Math.abs(rot - sn) < 3) rot = sn;
        setProp(c, 'rot', rot);
      } else {
        let nx = start.x + p.x - p0.x, ny = start.y + p.y - p0.y;
        const th = 10 / d;
        if (Math.abs(nx) < th) { nx = 0; ov.append(h('div', { class: 'guide vx', style: { left: (P().width / 2) * d + 'px' } })); }
        if (Math.abs(ny) < th) { ny = 0; ov.append(h('div', { class: 'guide hy', style: { top: (P().height / 2) * d + 'px' } })); }
        setProp(c, 'x', nx); setProp(c, 'y', ny);
      }
      requestRender();
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); $$('.guide', ov).forEach((g) => g.remove()); if (edited) endEdit(); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  });
  ov.addEventListener('wheel', (e) => {
    const c = [...S.sel].length === 1 ? clipById([...S.sel][0]) : null;
    if (!c || !isVisual(c) || !activeAt(c, S.time)) return;
    e.preventDefault();
    beginEdit(); setProp(c, 'scale', clamp(propAt(c, 'scale', S.time) * (e.deltaY < 0 ? 1.05 : 1 / 1.05), 0.01, 20)); requestRender();
    clearTimeout(ov._wt); ov._wt = setTimeout(endEdit, 300);
  }, { passive: false });
}

// ============ Layout ============
function layoutStage() {
  const wrap = $('#stageWrap'), st = $('#stage');
  const W = wrap.clientWidth - 24, H = wrap.clientHeight - 24;
  const ar = P().width / P().height;
  let w = W, hh = W / ar;
  if (hh > H) { hh = H; w = H * ar; }
  st.style.width = Math.max(10, w) + 'px'; st.style.height = Math.max(10, hh) + 'px';
  requestRender();
}
// ============ Keyboard ============
function initKeys() {
  window.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) {
      if (e.key === 'Escape') e.target.blur();
      if (e.key === 'Enter' && e.target.id === 'projName') { e.preventDefault(); e.target.blur(); }
      return;
    }
    if (!$('#modal').classList.contains('hidden')) { if (e.key === 'Escape' && !S.exporting) closeModal(); return; }
    if (customKey(e)) return;
    const k = e.key, ctrl = e.ctrlKey || e.metaKey;
    const map = () => {
      if (k === ' ') return cmd('play');
      if (ctrl && (k === 'z' || k === 'я') && e.shiftKey) return cmd('redo');
      if (ctrl && (k === 'z' || k === 'я' || k === 'Z')) return cmd('undo');
      if (ctrl && (k === 'y' || k === 'н')) return cmd('redo');
      if (ctrl && (k === 'b' || k === 'и')) return cmd('split');
      if (ctrl && (k === 'c' || k === 'с')) return copyClips();
      if (ctrl && (k === 'x' || k === 'ч')) { copyClips(); return cmd('delete'); }
      if (ctrl && (k === 'v' || k === 'м')) return smartPaste();
      if (ctrl && (k === 'd' || k === 'в')) return cmd('duplicate');
      if (ctrl && (k === 'a' || k === 'ф')) return cmd('selectAll');
      if (ctrl && (k === 's' || k === 'ы' || k === 'S' || k === 'Ы')) return cmd(e.shiftKey ? 'saveAs' : 'save');
      if (ctrl && (k === 'o' || k === 'щ')) return cmd('open');
      if (ctrl && (k === 'n' || k === 'т')) return cmd('new');
      if (ctrl && (k === 'e' || k === 'у')) return cmd('export');
      if (ctrl && (k === 'i' || k === 'ш')) return importDialog();
      if (ctrl && (k === 'k' || k === 'л')) return cmd('ai');
      if (ctrl) return 'pass';
      if (S.mode === 'photo' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 's', 'ы', 'q', 'й', 'w', 'ц', 'm', 'ь', 'i', 'ш', 'o', 'щ'].includes(k)) return;
      if (k === 'ArrowLeft') return seek(S.time - (e.shiftKey ? 1 : 1 / P().fps));
      if (k === 'ArrowRight') return seek(S.time + (e.shiftKey ? 1 : 1 / P().fps));
      if (k === 'ArrowUp') { const pts = editPoints().filter((p) => p < S.time - 1e-3); return seek(pts.length ? pts[pts.length - 1] : 0); }
      if (k === 'ArrowDown') { const pts = editPoints().filter((p) => p > S.time + 1e-3); return seek(pts.length ? pts[0] : projectDuration()); }
      if (k === 'Home') return seek(0);
      if (k === 'End') return seek(projectDuration());
      if (k === 'Delete' || k === 'Backspace') return cmd(e.shiftKey ? 'rippleDelete' : 'delete');
      if (k === 's' || k === 'ы') return cmd('split');
      if (k === 'q' || k === 'й') return cmd('splitLeft');
      if (k === 'w' || k === 'ц') return cmd('splitRight');
      if (k === 'm' || k === 'ь') return cmd('marker');
      if (k === 'i' || k === 'ш') return markIn();
      if (k === 'o' || k === 'щ') return markOut();
      if (k === '+' || k === '=') return cmd('zoomIn');
      if (k === '-' || k === '_') return cmd('zoomOut');
      if ((k === 'Z' || k === 'Я') && e.shiftKey) return cmd('zoomFit');
      if (k === 'f' || k === 'а') return cmd('fullscreen');
      if (k === 'Escape') { if (document.body.classList.contains('fs')) return cmd('fullscreen'); return selectOnly(null); }
      if (k === 'F12') return api.devtools();
      return 'pass';
    };
    if (map() !== 'pass') e.preventDefault();
  });
}

// ============ Boot ============
function loadUI() {
  $('#projName').textContent = P().name;
  $('#ratioSel').value = P().ratio;
  applyMode(P().mode || 'video');
  layoutStage();
  TL.render();
  INSP.render();
  setPanel(curPanel);
  requestRender();
}
async function boot() {
  S.project = newProject();
  await loadSettings();
  const jobId = new URLSearchParams(location.search).get('job');
  if (jobId) { await runBackgroundJob(+jobId); return; }
  await setLanguage(SET.lang);
  $('#ratioSel').append(...RATIOS.map((r) => h('option', { value: r.id }, r.label)));
  $('#ratioSel').addEventListener('change', (e) => change(() => setRatio(e.target.value)));
  $('#previewQ').addEventListener('change', (e) => { S.previewScale = +e.target.value; saveSetting({ previewQ: S.previewScale }); requestRender(); });
  $('#snap').addEventListener('change', (e) => saveSetting({ snap: e.target.checked }));
  $('#scrubAudio').addEventListener('change', (e) => saveSetting({ scrubAudio: e.target.checked }));
  $('#zoom').addEventListener('input', (e) => TL.setZoom(2 * Math.pow(300, e.target.value / 100)));
  $('#magnet').addEventListener('change', (e) => { saveSetting({ magnet: e.target.checked }); change(() => {}); });
  $('#projName').addEventListener('blur', () => { const n = $('#projName').textContent.trim(); if (n && n !== P().name) { P().name = n; markDirty(); } });
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-cmd]'); if (b) cmd(b.dataset.cmd); });
  $$('#rail button').forEach((b) => b.addEventListener('click', () => setPanel(b.dataset.tab)));
  // OS file drop
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer.types.includes('Files')) { dragDepth++; $('#dropHint').classList.remove('hidden'); } });
  window.addEventListener('dragleave', (e) => { if (e.dataTransfer.types.includes('Files') && --dragDepth <= 0) { dragDepth = 0; $('#dropHint').classList.add('hidden'); } });
  window.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', async (e) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault(); dragDepth = 0; $('#dropHint').classList.add('hidden');
    const overTl = e.target.closest('#tlTracks');
    const t = overTl ? TL.timeAt(e.clientX) : null;
    for (const f of e.dataTransfer.files) {
      const p = api.pathForFile(f);
      if (/\.(sklejka|cutbycut)$/i.test(p)) { if (await confirmDiscard()) await openProjectFile(p); return; }
      if (S.mode === 'photo' && !/\.(png|jpe?g|webp|gif|bmp)$/i.test(p)) { toast('В фоторедактор можно добавить только изображения'); continue; }
      const m = await importFile(p);
      if (m && overTl) { const { row } = TL.rowAt(e.clientY); dropAsset({ kind: 'media', id: m.id }, t, row.track); }
      else if (m && S.mode === 'photo') photoAddImage(m);
    }
  });
  new ResizeObserver(() => layoutStage()).observe($('#stageWrap'));
  $('#modeChip').addEventListener('click', modeMenu);
  $('#layAddImg').addEventListener('click', importAndLayer);
  $('#layAddText').addEventListener('click', () => addText({}, 0));
  initDock();
  initUiItems();
  initKeys();
  initOverlay();
  TL.init();
  applySettings();
  loadUI();
  TL.setZoom(+SET.defaultZoom || 60, 0);
  const info = await api.info();
  if (!info.ffmpeg) toast('FFmpeg не найден — экспорт недоступен. Установите: winget install Gyan.FFmpeg', 10000);
  api.onBeforeClose(async () => { if (await confirmDiscard()) api.closeNow(); });
  // restore last session / recent projects
  let auto = null;
  const ap = await api.autosavePath();
  if (await api.exists(ap)) {
    try { const j = JSON.parse(await api.readText(ap)); if (j.project && j.project.clips && j.project.clips.length) auto = { path: ap, project: j.project }; } catch (_) {}
  }
  if (!auto && MODES[SET.startMode]) newProjectIn(SET.startMode);
  else await HUB.open({ auto });
}
window.addEventListener('DOMContentLoaded', boot);
window.addEventListener('error', (e) => { console.error(e.error || e.message); toast('Ошибка: ' + (e.message || e.error), 4000); });
