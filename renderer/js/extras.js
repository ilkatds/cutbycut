'use strict';
// ============ Smart paste (clips / images / files / links) ============
let clipMarker = null;
async function smartPaste() {
  const cb = await api.clipRead();
  const text = (cb.text || '').trim();
  if (clipboard && clipMarker && text === clipMarker) return pasteClips();
  if (cb.files.length) {
    for (const f of cb.files) { const m = await importFile(f); if (m) addAtPlayhead(m); }
    return;
  }
  if (cb.image) {
    const m = await importFile(cb.image, 'Вставка ' + new Date().toLocaleTimeString('ru-RU'));
    if (m) { addAtPlayhead(m); toast('Картинка вставлена из буфера обмена'); }
    return;
  }
  if (/^https?:\/\/\S+$/i.test(text)) { const m = await downloadUrl(text); if (m) addAtPlayhead(m); return; }
  if (clipboard) return pasteClips();
  toast('В буфере обмена нет картинки, файла или ссылки');
}
// Pasted/dropped visual media goes on top of the main video when something already plays there
function addAtPlayhead(m) {
  const main = P().tracks.find((t) => t.main);
  const busy = main && clipsOn(main.id).some((c) => activeAt(c, S.time));
  if (m.type === 'audio' || !busy) { addMediaToTimeline(m); return; }
  change(() => {
    const c = clipFromMedia(m);
    c.start = S.time;
    if (m.type === 'image') c.dur = 4;
    c.trackId = freeTrack('video', c.start, c.dur).id;
    P().clips.push(c);
    selectOnly(c.id);
  });
}

// ============ Download by link ============
const DL = { busy: false, pct: 0, url: '' };
api.onDownloadProgress((p) => { DL.pct = p; const el = $('#dlBar'); if (el) el.style.width = p + '%'; const st = $('#dlStatus'); if (st) st.textContent = `Скачиваю… ${p.toFixed(0)}%`; });
async function downloadUrl(url) {
  if (DL.busy) { toast('Уже идёт загрузка'); return null; }
  DL.busy = true; DL.pct = 0; DL.url = url;
  if (curPanel === 'media') setPanel('media');
  toast('Скачиваю по ссылке…', 3000);
  try {
    const files = await api.download(url);
    let last = null;
    for (const f of files) last = (await importFile(f)) || last;
    toast(last ? 'Скачано: ' + last.name : 'Файл скачан, но не распознан', 4000);
    return last;
  } catch (e) {
    toast('Не удалось скачать: ' + e.message, 6000);
    return null;
  } finally {
    DL.busy = false;
    if (curPanel === 'media') setPanel('media');
  }
}
function mediaToolsRow(p) {
  const inp = h('input', { type: 'text', placeholder: 'Ссылка на видео/футаж (YouTube, TikTok, VK, прямая ссылка)…', style: { flex: 1, minWidth: 0 } });
  const go = h('button', { class: 'primary', disabled: DL.busy, onclick: () => { const u = inp.value.trim(); if (u) downloadUrl(u); } }, '⇩');
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
  p.append(h('div', { class: 'panelBar' }, inp, go));
  if (DL.busy) {
    p.append(h('div', { class: 'progress' }, h('div', { id: 'dlBar', style: { width: DL.pct + '%' } })));
    p.append(h('div', { class: 'panelBar' }, h('span', { id: 'dlStatus', class: 'note', style: { margin: 0, flex: 1 } }, `Скачиваю… ${DL.pct.toFixed(0)}%`), h('button', { onclick: () => api.downloadCancel() }, 'Отмена')));
  }
  p.append(h('div', { class: 'btnRow', style: { marginBottom: '10px' } },
    h('button', { onclick: smartPaste, title: 'Картинка, файл или ссылка из буфера обмена (Ctrl+V)' }, '📋 Вставить из буфера')));
}

// ============ Synchronisation: text ↔ footage ============
function syncPair() {
  const sel = [...S.sel].map(clipById).filter(Boolean);
  const footage = sel.find((c) => c.type === 'video') || sel.find((c) => c.type === 'image');
  const text = sel.find((c) => c !== footage && (c.type === 'text' || c.type === 'sticker' || c.type === 'gen' || c.type === 'image' || c.type === 'video'));
  return footage && text ? { footage, text } : null;
}
function openSync() {
  const pair = syncPair();
  if (!pair) { toast('Выделите футаж и текст (Ctrl+клик по обоим)'); return; }
  const st = Object.assign({ prio: 'text', timing: true, anim: true, place: true }, S.syncPrefs || {});
  openModal((box) => {
    box.append(h('h2', {}, '⇄ Синхронизация'));
    box.append(h('div', { class: 'note' }, `Футаж: «${pair.footage.name || 'клип'}» · Текст: «${(pair.text.text ? pair.text.text.text : pair.text.name || '').slice(0, 40)}»`));
    const prio = h('div', { class: 'seg', style: { margin: '10px 0' } });
    const opts = [['text', 'Текст подстраивается под футаж'], ['footage', 'Футаж подстраивается под текст']];
    const draw = () => { prio.innerHTML = ''; for (const [v, n] of opts) prio.append(h('button', { class: st.prio === v ? 'on' : '', onclick: () => { st.prio = v; draw(); } }, n)); };
    draw();
    box.append(h('div', {}, h('b', {}, 'Приоритет')), prio);
    const cb = (key, label) => { const i = h('input', { type: 'checkbox' }); i.checked = st[key]; i.addEventListener('change', () => { st[key] = i.checked; }); return h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '6px 0' } }, i, label); };
    box.append(cb('timing', 'Время появления и исчезновения'), cb('anim', 'Анимация: плавность, масштаб, движение — как в футаже'), cb('place', 'Положение и размер (текст внутри плашки футажа)'));
    box.append(h('div', { class: 'note' }, 'Программа покадрово анализирует футаж: где появляется плашка/объект, как он растёт, двигается и проявляется, — и переносит это на текст ключевыми кадрами. Лучше всего работает с футажами на однотонном фоне (чёрный, зелёный) или с прозрачностью.'));
    const status = h('div', { class: 'note' });
    const go = h('button', { class: 'primary' }, 'Синхронизировать');
    go.addEventListener('click', async () => {
      S.syncPrefs = { ...st };
      go.disabled = true; status.textContent = 'Анализирую футаж…';
      try { const msg = await runSync(pair.footage, pair.text, st); closeModal(); toast(msg, 5000); }
      catch (e) { status.textContent = 'Ошибка: ' + e.message; go.disabled = false; }
    });
    box.append(status, h('div', { class: 'actions' }, h('button', { onclick: closeModal }, 'Отмена'), go));
  });
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  let idx = 0, dmax = 0;
  const a = pts[0], b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const v = a.v + ((b.v - a.v) * (p.t - a.t)) / Math.max(1e-6, b.t - a.t);
    const d = Math.abs(p.v - v);
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= eps) return [a, b];
  return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps));
}
function measureClip(c) {
  if (c.text) {
    const cv = document.createElement('canvas').getContext('2d');
    const L = layoutText(cv, c.text, 1);
    return { w: L.w + c.text.size * 0.7, h: L.h + c.text.size * 0.3 };
  }
  const b = S.bounds[c.id];
  return b ? { w: b.w / Math.max(0.01, c.tf.scale), h: b.h / Math.max(0.01, c.tf.scale) } : { w: 400, h: 120 };
}
async function runSync(f, tx, st) {
  const m = mediaById(f.mediaId);
  const pr = P();
  pushUndo();
  // footage on the magnetic main track would be re-packed — lift it to an overlay track
  if (st.prio === 'footage' && trackById(f.trackId).main) f.trackId = freeTrack('video', f.start, f.dur).id;
  // --- analyse footage motion ---
  let frames = null, plateau = null;
  if (m.type === 'video') {
    const res = await api.analyze({ file: m.path, in: f.in, srcLen: f.dur * f.speed, speed: f.speed, width: m.width, height: m.height, fps: 20, key: f.chroma && f.chroma.on ? hexToRgb(f.chroma.color) : null, alpha: /\.webm$/i.test(m.path) });
    frames = res.frames;
    const maxE = Math.max(...frames.map((x) => x.energy));
    const fullFrame = frames.filter((x) => x.cov > 0.85).length > frames.length * 0.6;
    if (maxE > 0.5 && !fullFrame) {
      const thr = maxE * 0.08;
      const vis = frames.filter((x) => x.energy > thr);
      const strong = vis.filter((x) => x.energy >= maxE * 0.85);
      const med = (k) => strong.map((x) => x[k]).sort((a, b) => a - b)[strong.length >> 1];
      plateau = { tA: vis[0].t, tB: vis[vis.length - 1].t + 0.05, E: med('energy'), x0: med('x0'), x1: med('x1'), y0: med('y0'), y1: med('y1'), thr };
    }
  }
  // --- footage display geometry (canvas px) ---
  const fit = Math.min(pr.width / (m.width || 16), pr.height / (m.height || 9));
  const geo = () => { const dw = (m.width || 16) * fit * f.tf.scale, dh = (m.height || 9) * fit * f.tf.scale; return { dw, dh }; };
  const tA = plateau ? plateau.tA : 0, tB = plateau ? Math.min(plateau.tB, f.dur) : f.dur;
  let timeScale = 1;
  // --- priority: footage adapts to text ---
  if (st.prio === 'footage') {
    if (st.timing) {
      const want = clamp((f.speed * (tB - tA)) / Math.max(0.1, tx.dur), 0.25, 4);
      timeScale = f.speed / want;
      setSpeed(f, want);
      f.start = Math.max(0, tx.start - tA * timeScale);
    }
    if (st.place && plateau) {
      const sz = measureClip(tx);
      let { dw } = geo();
      const boxW = (plateau.x1 - plateau.x0) * dw;
      f.tf.scale = clamp(f.tf.scale * ((sz.w * 1.25) / Math.max(10, boxW)), 0.05, 20);
      const g = geo();
      const cx = f.tf.x + ((plateau.x0 + plateau.x1) / 2 - 0.5) * g.dw, cy = f.tf.y + ((plateau.y0 + plateau.y1) / 2 - 0.5) * g.dh;
      f.tf.x += tx.tf.x - cx; f.tf.y += tx.tf.y - cy;
    }
    resolveOverlap(f);
  }
  // --- priority: text adapts to footage (also used to copy the motion in both modes) ---
  const T = (t) => f.start + t * timeScale; // footage-relative analysis time -> timeline
  if (st.prio === 'text' && st.timing) { tx.start = T(tA); tx.dur = Math.max(0.2, (tB - tA) * timeScale); }
  const g = geo();
  if (plateau && st.place && st.prio === 'text') {
    tx.tf.x = f.tf.x + ((plateau.x0 + plateau.x1) / 2 - 0.5) * g.dw;
    tx.tf.y = f.tf.y + ((plateau.y0 + plateau.y1) / 2 - 0.5) * g.dh;
    if (tx.text) {
      const sz = measureClip(tx);
      const boxW = (plateau.x1 - plateau.x0) * g.dw, boxH = (plateau.y1 - plateau.y0) * g.dh;
      const k = Math.min((0.72 * boxW) / sz.w, (0.55 * boxH) / sz.h);
      tx.text.size = clamp(Math.round(tx.text.size * k), 10, 400);
    }
    tx.tf.scale = 1;
  }
  let keyed = 0;
  if (st.anim) {
    tx.kf = {};
    if (plateau) {
      const pw = plateau.x1 - plateau.x0, pcx = (plateau.x0 + plateau.x1) / 2, pcy = (plateau.y0 + plateau.y1) / 2;
      const base = { x: tx.tf.x, y: tx.tf.y, scale: tx.tf.scale, opacity: 1 };
      const series = { opacity: [], scale: [], x: [], y: [] };
      for (const fr of frames) {
        const lt = T(fr.t) - tx.start;
        if (lt < -0.01 || lt > tx.dur + 0.01) continue;
        const on = fr.energy > plateau.thr;
        series.opacity.push({ t: clamp(lt, 0, tx.dur), v: clamp(fr.energy / plateau.E, 0, 1) });
        if (on) {
          series.scale.push({ t: clamp(lt, 0, tx.dur), v: base.scale * clamp((fr.x1 - fr.x0) / pw, 0.05, 3) });
          series.x.push({ t: clamp(lt, 0, tx.dur), v: base.x + ((fr.x0 + fr.x1) / 2 - pcx) * g.dw });
          series.y.push({ t: clamp(lt, 0, tx.dur), v: base.y + ((fr.y0 + fr.y1) / 2 - pcy) * g.dh });
        }
      }
      const eps = { opacity: 0.04, scale: 0.03, x: 4, y: 4 };
      for (const [k, list] of Object.entries(series)) {
        if (list.length < 2) continue;
        const vals = list.map((p) => p.v);
        if (Math.max(...vals) - Math.min(...vals) < eps[k] * 1.5) continue;
        tx.kf[k] = rdp(list, eps[k]);
        keyed += tx.kf[k].length;
      }
      tx.anim = { ...tx.anim, in: 'none', out: 'none' };
    } else {
      // no measurable motion (photo, full-frame video): reuse the footage clip's own animation settings
      tx.anim = deep(f.anim);
      for (const k of Object.keys(f.kf || {})) if (k === 'opacity' || k === 'scale') tx.kf[k] = deep(f.kf[k]).map((p) => ({ t: p.t + (f.start - tx.start), v: p.v }));
    }
  }
  afterChange();
  selectOnly(tx.id);
  if (m.type === 'video' && !plateau) return 'Синхронизировано время и анимация. Объект в футаже выделить не удалось (нужен однотонный фон или прозрачность).';
  return `Синхронизировано: ${st.prio === 'text' ? 'текст повторяет футаж' : 'футаж подогнан под текст'}${keyed ? `, ключевых кадров: ${keyed}` : ''}.`;
}

// ============ AI background removal ============
const BG_MODELS = [
  ['u2net_human_seg', 'Люди (быстро, для блогов и стримов)'],
  ['isnet-general-use', 'Универсальная точная'],
  ['u2net', 'Универсальная'],
  ['silueta', 'Быстрая (ниже качество)'],
  ['birefnet-general', 'Лучшее качество (медленно)'],
];
const BG = { busy: false };
api.onBgProgress((p) => {
  const bar = $('#bgBar'); if (bar && p.p != null) bar.style.width = (p.p * 100).toFixed(1) + '%';
  const st = $('#bgStatus'); if (st && p.msg) st.textContent = p.msg;
});
async function bgSection(box, c) {
  const s = INSP.sec(box, '✂ Удаление фона (ИИ)');
  const settings = await api.settingsGet();
  const mode = settings.bgMode || 'local';
  const m = mediaById(c.mediaId);
  INSP.seg(s, 'Режим', [['local', 'Нейросеть на ПК'], ['api', 'API remove.bg']], () => mode, (v) => api.settingsSet({ bgMode: v }).then(() => INSP.render()));
  if (mode === 'local') {
    const sel = h('select', {}, ...BG_MODELS.map(([v, n]) => h('option', { value: v }, n)));
    sel.value = settings.bgModel || (m.type === 'image' ? 'isnet-general-use' : 'u2net_human_seg');
    sel.addEventListener('change', () => api.settingsSet({ bgModel: sel.value }));
    s.append(h('div', { class: 'row wide' }, h('label', {}, 'Модель'), sel));
    if (m.type === 'video') s.append(h('div', { class: 'note' }, `Обрабатывается только используемый отрезок (${fmtDur(c.dur * c.speed)}): примерно ${Math.ceil(c.dur * c.speed * Math.min(30, m.fps || 30) * 0.4 / 60)} мин на процессоре.`));
  } else {
    const key = h('input', { type: 'password', placeholder: 'API-ключ remove.bg', value: settings.removeBgKey || '', style: { width: '100%' } });
    key.addEventListener('change', () => api.settingsSet({ removeBgKey: key.value.trim() }));
    s.append(h('div', { class: 'row wide' }, h('label', {}, 'Ключ'), key));
    s.append(h('div', { class: 'note' }, 'Ключ берётся на remove.bg → API. Через API обрабатываются фото; видео — только нейросетью на ПК.'));
  }
  const btns = h('div', { class: 'btnRow' });
  btns.append(h('button', { class: 'primary', disabled: BG.busy, onclick: () => removeBg(c) }, BG.busy ? 'Обработка…' : 'Убрать фон'));
  if (c.bgOrigMediaId) btns.append(h('button', { onclick: () => change(() => { c.mediaId = c.bgOrigMediaId; c.in = c.bgOrigIn; delete c.bgOrigMediaId; }) }, 'Вернуть фон'));
  s.append(btns);
  if (BG.busy) s.append(h('div', { class: 'progress' }, h('div', { id: 'bgBar' })), h('div', { id: 'bgStatus', class: 'note' }, 'Запуск…'), h('button', { onclick: () => api.bgCancel() }, 'Отмена'));
}
async function removeBg(c) {
  const m = mediaById(c.mediaId);
  const settings = await api.settingsGet();
  const mode = settings.bgMode || 'local';
  if (mode === 'local' && !(await api.bgCheck())) { toast('Нейросеть не установлена: выполните  pip install "rembg[cpu]"', 8000); return; }
  BG.busy = true; INSP.render();
  try {
    const out = await api.bgRemove({
      mode, model: settings.bgModel || (m.type === 'image' ? 'isnet-general-use' : 'u2net_human_seg'),
      type: m.type, file: m.path, in: c.in || 0, srcLen: m.type === 'image' ? 0 : c.dur * c.speed, fps: m.fps, hasAudio: m.hasAudio,
    });
    const nm = await importFile(out, m.name + ' (без фона)');
    if (!nm) throw new Error('результат не импортировался');
    change(() => {
      c.bgOrigMediaId = c.mediaId; c.bgOrigIn = c.in;
      c.mediaId = nm.id;
      if (m.type === 'video') c.in = 0;
    });
    toast('Фон удалён', 3000);
  } catch (e) {
    toast('Удаление фона: ' + e.message, 7000);
  } finally {
    BG.busy = false; INSP.render();
  }
}

// ============ Voice changer / noise reduction / stabilisation / beats ============
const VOICES = [['denoise', 'Шумоподавление'], ['chipmunk', 'Бурундук'], ['deep', 'Низкий голос'], ['monster', 'Монстр'], ['robot', 'Робот'], ['echo', 'Эхо'], ['cave', 'Пещера'], ['radio', 'Рация'], ['phone', 'Телефон'], ['megaphone', 'Мегафон']];
async function processAudio(c, kind) {
  const m = mediaById(c.mediaId);
  const label = (VOICES.find((v) => v[0] === kind) || [0, kind])[1];
  toast(`Обработка звука: ${label}…`, 30000);
  try {
    const out = await api.process({ kind, file: m.path, in: c.in, srcLen: c.dur * c.speed });
    const nm = await importFile(out, `${m.name} (${label})`);
    if (!nm) throw new Error('файл не создан');
    nm.hidden = true;
    change(() => {
      if (c.type === 'video') {
        const a = makeClip('audio', { mediaId: nm.id, in: 0, speed: c.speed, start: c.start, dur: c.dur, volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut, name: `${c.name} (${label})` });
        a.trackId = freeTrack('audio', a.start, a.dur, (P().tracks.find((t) => t.kind === 'audio') || {}).id).id;
        c.muted = true;
        P().clips.push(a);
        S.sel = new Set([a.id]);
      } else {
        c.origAudioMediaId = c.origAudioMediaId || c.mediaId; c.origAudioIn = c.origAudioIn != null ? c.origAudioIn : c.in;
        c.mediaId = nm.id; c.in = 0; c.name = `${m.name.replace(/ \(.*\)$/, '')} (${label})`;
      }
    });
    toast(`Готово: ${label}`);
  } catch (e) { toast('Обработка звука: ' + e.message, 6000); }
}
async function stabilizeClip(c) {
  const m = mediaById(c.mediaId);
  toast('Стабилизация… (анализ движения, затем выравнивание)', 120000);
  try {
    const out = await api.process({ kind: 'stabilize', file: m.path, in: c.in, srcLen: c.dur * c.speed });
    const nm = await importFile(out, m.name + ' (стабилизировано)');
    if (!nm) throw new Error('файл не создан');
    nm.hidden = true;
    change(() => { c.stabOrigMediaId = c.mediaId; c.stabOrigIn = c.in; c.mediaId = nm.id; c.in = 0; });
    toast('Видео стабилизировано');
  } catch (e) { toast('Стабилизация: ' + e.message, 6000); }
}
// Onset detection on the waveform -> markers on every beat
function findBeats(c) {
  const pk = (S.cache[c.mediaId] || {}).peaks;
  if (!pk) { toast('Волна ещё не готова'); return; }
  const a = Math.floor(c.in * 100), b = Math.min(pk.length, Math.floor((c.in + c.dur * c.speed) * 100));
  const env = [];
  for (let i = a; i < b; i++) env.push(pk[i] / 255);
  const flux = env.map((v, i) => Math.max(0, v - (env[i - 1] || 0)));
  const beats = [];
  let last = -1e9;
  for (let i = 1; i < flux.length - 1; i++) {
    const lo = Math.max(0, i - 50), hi = Math.min(flux.length, i + 50);
    let mean = 0; for (let j = lo; j < hi; j++) mean += flux[j]; mean /= hi - lo;
    if (flux[i] > mean * 2.2 + 0.04 && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1] && i - last > 22) { beats.push(i); last = i; }
  }
  if (!beats.length) { toast('Ритм не найден'); return; }
  change(() => {
    P().markers = P().markers.filter((m) => !(m.beat && m.t >= c.start && m.t <= c.start + c.dur));
    for (const i of beats) P().markers.push({ t: c.start + i / 100 / c.speed, color: '#3cc8ff', beat: true });
  });
  const iv = beats.slice(1).map((v, i) => v - beats[i]).sort((x, y) => x - y);
  const bpm = iv.length ? Math.round(6000 / iv[iv.length >> 1]) : 0;
  toast(`Найдено ударов: ${beats.length}${bpm ? ` · ≈${bpm} BPM` : ''}. Клипы прилипают к синим маркерам.`, 5000);
}
