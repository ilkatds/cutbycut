'use strict';
// ============ Export ============
const dec = new Map(); // clipId -> { key, w, h, canvas, ctx, img }

function audioItems() {
  const items = [];
  for (const c of P().clips) {
    if (c.type !== 'video' && c.type !== 'audio') continue;
    const m = mediaById(c.mediaId);
    const tr = trackById(c.trackId);
    if (!m || !m.hasAudio || c.muted || c.freeze != null || (tr && tr.muted) || c.volume <= 0) continue;
    const srcOut = Math.min(m.duration || 1e9, c.in + c.dur * c.speed);
    if (srcOut - c.in < 0.01) continue;
    items.push({ path: m.path, srcIn: c.in, srcOut, speed: c.speed, volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut, start: c.start, trackId: c.trackId });
  }
  return items;
}

// Audio items restricted to the timeline range [a, b], re-based so that a = 0
function audioItemsRange(a, b) {
  const items = [];
  for (const it of audioItems()) {
    const end = it.start + (it.srcOut - it.srcIn) / it.speed;
    const s = Math.max(it.start, a), e = Math.min(end, b);
    if (e - s < 0.02) continue;
    items.push({ ...it, start: s - a, srcIn: it.srcIn + (s - it.start) * it.speed, srcOut: it.srcIn + (e - it.start) * it.speed, fadeIn: s > it.start + 0.01 ? 0 : it.fadeIn, fadeOut: e < end - 0.01 ? 0 : it.fadeOut });
  }
  return items;
}

function decodeSize(c, W, H) {
  const m = mediaById(c.mediaId);
  const fit = Math.min(W / m.width, H / m.height);
  let mx = Math.max(1, c.tf.scale);
  for (const k of (c.kf && c.kf.scale) || []) mx = Math.max(mx, k.v);
  const s = Math.min(1, fit * Math.min(mx, 3));
  const even = (v) => Math.max(2, Math.round(v / 2) * 2);
  return { w: even(m.width * s), h: even(m.height * s) };
}
async function prefetch(t, W, H, fps) {
  const need = [];
  for (const { c } of neededMedia(t)) if (c.type === 'video') need.push(c);
  const ids = new Set(need.map((c) => c.id));
  for (const [id, d] of dec) if (!ids.has(id)) { const c = clipById(id); if (!c || t > c.start + c.dur + 2) { api.decClose(d.key); dec.delete(id); } }
  await Promise.all(need.map(async (c) => {
    let d = dec.get(c.id);
    const m = mediaById(c.mediaId);
    if (!d) {
      const { w, h: hh } = decodeSize(c, W, H);
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = hh;
      const freeze = c.freeze != null;
      // start decoding where this clip is first needed (range exports start mid-clip)
      const base = freeze ? 0 : Math.max(0, Math.round((t - c.start) * fps));
      d = { key: c.id + '_' + Date.now(), w, h: hh, canvas, ctx: canvas.getContext('2d'), img: new ImageData(w, hh), n: -1, base };
      await api.decOpen({ key: d.key, path: m.path, in: freeze ? c.freeze : c.in + (base / fps) * c.speed, speed: freeze ? 1 : c.speed, fps, w, h: hh, single: freeze });
      dec.set(c.id, d);
    }
    const n = c.freeze != null ? 0 : Math.max(0, Math.round((t - c.start) * fps));
    if (n === d.n) return;
    const buf = await api.decFrame(d.key, Math.max(0, n - d.base));
    if (buf && buf.length === d.w * d.h * 4) { d.img.data.set(buf); d.ctx.putImageData(d.img, 0, 0); d.ok = true; }
    d.n = n;
  }));
}
function exportSource(c) {
  const m = mediaById(c.mediaId);
  if (!m) return null;
  if (m.type === 'image') { const im = getImg(m); return im.complete && im.naturalWidth ? im : null; }
  const d = dec.get(c.id);
  return d && d.ok ? d.canvas : null;
}

function exportDims(shortSide) {
  const pr = P();
  const s = shortSide / Math.min(pr.width, pr.height);
  const even = (v) => Math.round(v / 2) * 2;
  return { W: even(pr.width * s), H: even(pr.height * s) };
}

// ---------- Export dialog (renders in a hidden background window, so editing can continue) ----------
const EXP = { jobs: new Map() }; // id -> { name, path, p, eta, msg, done, ok, error }
const CRF = { low: 28, rec: 21, high: 18, max: 15 };
function fileNameFromTemplate(tpl, o) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (tpl || '{project}')
    .replace(/\{project\}/g, P().name || 'video')
    .replace(/\{date\}/g, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
    .replace(/\{time\}/g, `${pad(d.getHours())}-${pad(d.getMinutes())}`)
    .replace(/\{res\}/g, o.res + 'p').replace(/\{fps\}/g, o.fps + 'fps')
    .replace(/[\\/:*?"<>|]/g, '_').trim() || 'video';
}
function openExport() {
  if (!P().clips.length) { toast('Таймлайн пуст'); return; }
  if (S.playing) pause();
  const st = Object.assign({ res: 1080, fps: P().fps, quality: 'rec', codec: 'h264', encoder: 'auto', speed: 'medium' }, S.exportPrefs || {});
  openModal((box) => {
    box.append(h('h2', {}, 'Экспорт'));
    const name = h('input', { type: 'text', value: fileNameFromTemplate(SET.expNameTpl, st), style: { width: '100%' } });
    const res = h('select', {}, ...[[480, '480p'], [720, '720p'], [1080, '1080p (рекомендуется)'], [1440, '2K / 1440p'], [2160, '4K / 2160p']].map(([v, n]) => h('option', { value: v }, n)));
    res.value = st.res;
    const fps = h('select', {}, ...[24, 25, 30, 50, 60].map((v) => h('option', { value: v }, v + ' кадр/с')));
    fps.value = st.fps;
    const q = h('select', {}, h('option', { value: 'low' }, 'Небольшой файл'), h('option', { value: 'rec' }, 'Рекомендуемое'), h('option', { value: 'high' }, 'Высокое'), h('option', { value: 'max' }, 'Максимальное'));
    q.value = st.quality;
    const codec = h('select', {}, h('option', { value: 'h264' }, 'MP4 (H.264) — везде открывается'), h('option', { value: 'hevc' }, 'MP4 (H.265/HEVC) — меньше размер'), h('option', { value: 'gif' }, 'GIF-анимация'));
    codec.value = st.codec;
    const enc = h('select', {}, h('option', { value: 'auto' }, 'Автоматически (видеокарта, если есть)'), h('option', { value: 'cpu' }, 'Процессор'));
    api.encoders().then((list) => { for (const e of list) enc.append(h('option', { value: e }, e.replace('_amf', ' — AMD').replace('_nvenc', ' — NVIDIA').replace('_qsv', ' — Intel'))); enc.value = st.encoder || 'auto'; if (!enc.value) enc.value = 'auto'; });
    const speed = h('select', {}, h('option', { value: 'ultrafast' }, 'Максимальная'), h('option', { value: 'veryfast' }, 'Быстрая'), h('option', { value: 'fast' }, 'Повыше среднего'), h('option', { value: 'medium' }, 'Средняя'), h('option', { value: 'slow' }, 'Медленная — меньше файл'));
    speed.value = st.speed || 'medium';
    const info = h('div', { class: 'note' });
    const upd = () => { const { W, H } = exportDims(+res.value); info.textContent = `Размер кадра: ${W}×${H}. Длительность: ${fmtTime(projectDuration(), +fps.value)}. Экспорт идёт в фоне — можно продолжать монтаж.`; };
    res.addEventListener('change', upd); upd();
    const row = (l, c) => h('div', { class: 'row' }, h('label', {}, l), c);
    box.append(row('Название', name), row('Разрешение', res), row('Частота кадров', fps), row('Качество', q), row('Формат', codec), row('Кодировщик', enc), row('Скорость (процессор)', speed), info);
    const go = h('button', { class: 'primary' }, 'Экспортировать');
    box.append(h('div', { class: 'actions' }, h('button', { onclick: closeModal }, 'Отмена'), go));
    go.addEventListener('click', async () => {
      S.exportPrefs = { res: +res.value, fps: +fps.value, quality: q.value, codec: codec.value, encoder: enc.value, speed: speed.value };
      const ext = codec.value === 'gif' ? 'gif' : 'mp4';
      const info0 = await api.info();
      const dir = SET.exportDir || info0.videos;
      const path = await api.saveExportDialog(`${dir}\\${(name.value || 'video').replace(/[\\/:*?"<>|]/g, '_')}.${ext}`);
      if (!path) return;
      startBackgroundExport({ path, short: +res.value, fps: +fps.value, crf: CRF[q.value] + (codec.value === 'hevc' ? 4 : 0), codec: codec.value, encoder: enc.value, speed: speed.value });
      closeModal();
      openExportJobs();
    });
  });
}
async function startBackgroundExport(opts) {
  P().name = $('#projName').textContent.trim() || P().name;
  const id = await api.bgExportStart({ project: deep(P()), opts });
  EXP.jobs.set(id, { id, name: opts.path.split(/[\\/]/).pop(), path: opts.path, p: 0, eta: 0, msg: 'Подготовка…', done: false });
  updateExportBtn();
  toast('Экспорт запущен в фоне — можно продолжать монтаж');
  return id;
}
api.onBgExportProgress(({ id, p, eta, msg }) => {
  const j = EXP.jobs.get(id); if (!j) return;
  j.p = p; j.eta = eta; if (msg) j.msg = msg;
  updateExportBtn();
  const el = document.getElementById('job_' + id);
  if (el) drawJobRow(el, j);
});
api.onBgExportDone(async (r) => {
  const j = EXP.jobs.get(r.id); if (!j) return;
  Object.assign(j, { done: true, ok: r.ok, error: r.error, p: r.ok ? 1 : j.p, path: r.path || j.path });
  updateExportBtn();
  const el = document.getElementById('job_' + r.id);
  if (el) drawJobRow(el, j);
  if (!r.ok) { if (!r.cancelled) toast('Ошибка экспорта: ' + (r.error || '').slice(0, 160), 8000); return; }
  if (SET.expCredits) { const cr = creditsText(); if (cr) await api.writeText(j.path.replace(/\.\w+$/, '') + ' — авторы материалов.txt', 'Использованные материалы:\n' + cr + '\n'); }
  if (SET.expAfter === 'folder') api.showItem(j.path);
  else if (SET.expAfter === 'play') api.openPath(j.path);
  else if (SET.expAfter === 'phone') sendToPhone(j.path);
  if (!$('#modal').classList.contains('hidden')) return;
  toast('✓ Экспорт готов: ' + j.name, 6000);
});
function updateExportBtn() {
  const btn = $('#exportBtn');
  const active = [...EXP.jobs.values()].filter((j) => !j.done);
  btn.textContent = active.length ? `⇪ ${Math.round((active.reduce((a, j) => a + j.p, 0) / active.length) * 100)}%` : '⇪ Экспорт';
  btn.title = active.length ? 'Идёт экспорт — нажмите, чтобы посмотреть' : 'Экспорт (Ctrl+E)';
}
function drawJobRow(el, j) {
  el.innerHTML = '';
  const pct = Math.round(j.p * 100);
  el.append(h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px' } }, h('b', { 'data-no-i18n': '' }, j.name), h('span', {}, j.done ? (j.ok ? '✓ Готово' : j.error === 'cancelled' ? 'Отменён' : 'Ошибка') : pct + '%')));
  el.append(h('div', { class: 'progress' }, h('div', { style: { width: (j.done && j.ok ? 100 : pct) + '%' } })));
  if (!j.done) {
    const eta = j.eta || 0;
    el.append(h('div', { class: 'note', style: { margin: '0 0 6px' } }, j.msg && j.p < 0.001 ? j.msg : `осталось ≈ ${Math.floor(eta / 3600) ? Math.floor(eta / 3600) + ' ч ' : ''}${Math.round((eta % 3600) / 60)} мин`));
    el.append(h('div', { class: 'btnRow' }, h('button', { onclick: () => api.bgExportCancel(j.id) }, 'Отменить')));
  } else if (j.ok) {
    el.append(h('div', { class: 'btnRow' },
      h('button', { onclick: () => api.showItem(j.path) }, 'Показать в папке'),
      h('button', { onclick: () => api.openPath(j.path) }, '▶ Открыть'),
      h('button', { class: 'primary', onclick: () => sendToPhone(j.path) }, '📱 На телефон')));
  } else el.append(h('div', { class: 'note', style: { color: '#ff8a7a' } }, (j.error || '').slice(0, 400)));
}
function openExportJobs() {
  openModal((box) => {
    box.append(h('h2', {}, 'Экспорт'));
    if (!EXP.jobs.size) box.append(h('div', { class: 'note' }, 'Нет задач.'));
    for (const j of [...EXP.jobs.values()].reverse()) { const el = h('div', { id: 'job_' + j.id, style: { background: 'var(--bg2)', borderRadius: '10px', padding: '12px 14px', marginBottom: '8px' } }); drawJobRow(el, j); box.append(el); }
    box.append(h('div', { class: 'actions' }, h('button', { onclick: () => { closeModal(); openExport(); } }, '+ Новый экспорт'), h('button', { class: 'primary', onclick: closeModal }, 'Закрыть')));
  });
}
function exportButtonClick() { if ([...EXP.jobs.values()].some((j) => !j.done) || EXP.jobs.size) openExportJobs(); else openExport(); }

// ---------- Phone ----------
async function sendToPhone(file) {
  const st = await api.phoneDevices();
  if (!st.adb) { toast('Не найден adb (Android Platform Tools). Установите: winget install Google.PlatformTools', 8000); return; }
  if (!st.devices.length) { toast(st.unauthorized ? 'Разрешите отладку на экране телефона и повторите' : 'Телефон не найден: подключите кабелем и включите «Отладку по USB»', 8000); return; }
  const dev = st.devices[0];
  toast(`Отправляю на ${dev.model}…`, 60000);
  try { await api.phoneSend({ file, device: dev.id }); toast(`✓ Видео в галерее телефона ${dev.model}`, 6000); }
  catch (e) { toast('Не удалось отправить: ' + e.message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '').slice(0, 200), 8000); }
}

// ---------- Background job window: render the project it was given ----------
async function runBackgroundJob(id) {
  const data = await api.bgExportGet(id);
  if (!data) return;
  S.project = data.project;
  S.time = 0;
  // images must be decoded before the first frame
  await Promise.all(P().media.filter((m) => m.type === 'image').map((m) => new Promise((res) => { const im = getImg(m); if (im.complete) res(); else { im.addEventListener('load', res); im.addEventListener('error', res); } })));
  await document.fonts.ready;
  api.onBgExportCancel(() => { S.cancelExport = true; });
  api.onExportStatus((msg) => api.bgExportProgress({ id, p: 0, eta: 0, msg }));
  let last = 0;
  try {
    const r = await runExport(data.opts, (p, eta) => { const now = performance.now(); if (now - last > 400 || p >= 1) { last = now; api.bgExportProgress({ id, p, eta }); } });
    if (r.cancelled) api.bgExportDone({ id, ok: false, cancelled: true, error: 'cancelled', notify: false });
    else api.bgExportDone({ id, ok: r.ok, path: r.path, error: r.error });
  } catch (e) {
    api.bgExportDone({ id, ok: false, error: e.message });
  }
}

// ---------- Render loop shared by all exports ----------
async function runExport(o, onProgress) {
  const { W, H } = exportDims(o.short);
  const from = o.from || 0;
  const duration = (o.to != null ? o.to : projectDuration()) - from;
  const frames = Math.max(1, Math.round(duration * o.fps));
  S.exporting = true; S.cancelExport = false;
  pauseAll();
  frameSource = exportSource;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const t0 = performance.now();
  const inflight = [];
  try {
    await api.exportStart({ path: o.path, width: W, height: H, fps: o.fps, crf: o.crf, codec: o.codec, encoder: o.encoder || 'cpu', speed: o.speed || 'medium', audio: o.to != null || from ? audioItemsRange(from, from + duration) : audioItems(), duration });
    for (let i = 0; i < frames; i++) {
      if (S.cancelExport) { await Promise.all(inflight); await api.exportCancel(); return { cancelled: true }; }
      const t = from + i / o.fps;
      await prefetch(t, W, H, o.fps);
      renderFrame(ctx, t, W, H);
      // keep up to 3 frames on their way to the encoder while the next one is being drawn
      inflight.push(api.exportFrame(ctx.getImageData(0, 0, W, H).data));
      if (inflight.length >= 3) await inflight.shift();
      if (i % 3 === 0 || i === frames - 1) {
        const el = (performance.now() - t0) / 1000;
        onProgress((i + 1) / frames, (el / (i + 1)) * (frames - i - 1));
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await Promise.all(inflight);
    return await api.exportFinish();
  } catch (e) {
    try { await api.exportCancel(); } catch (_) {}
    throw e;
  } finally {
    frameSource = previewSource;
    for (const d of dec.values()) api.decClose(d.key);
    dec.clear();
    S.exporting = false;
    requestRender();
  }
}

// ============ Auto captions ============
async function runCaptions(opt, btn, log) {
  const items = audioItems();
  if (!items.length) { toast('На таймлайне нет звука'); return; }
  btn.disabled = true; btn.textContent = 'Распознаю… (может занять несколько минут)';
  log.textContent = '';
  const onLog = (s) => { log.textContent = (log.textContent + s).slice(-3000); log.scrollTop = log.scrollHeight; };
  api.onWhisperLog(onLog);
  try {
    const segs = await api.whisper({ audio: items, duration: projectDuration(), language: opt.language, model: opt.model });
    const chunks = [];
    for (const s of segs) {
      const words = (s.words && s.words.length ? s.words : null);
      if (!words) { chunks.push({ start: s.start, end: s.end, text: s.text, words: null }); continue; }
      for (let i = 0; i < words.length; i += opt.words) {
        const part = words.slice(i, i + opt.words);
        chunks.push({ start: part[0].start, end: part[part.length - 1].end, text: part.map((w) => w.word.trim()).join(' '), words: part });
      }
    }
    if (!chunks.length) { toast('Речь не найдена'); return; }
    change(() => {
      const tr = { id: uid('t'), kind: 'text', name: 'Субтитры', captions: true };
      P().tracks.unshift(tr);
      for (let i = 0; i < chunks.length; i++) {
        const ch = chunks[i];
        const end = i + 1 < chunks.length ? Math.min(chunks[i + 1].start, ch.end + 0.6) : ch.end + 0.3;
        const c = makeClip('text', { trackId: tr.id, start: Math.max(0, ch.start), dur: Math.max(0.2, end - ch.start) });
        Object.assign(c.text, TEXT_DEFAULT, opt.style, { text: ch.text });
        if (P().height > P().width) c.text.size = Math.round(c.text.size * 1.1);
        c.tf.y = opt.y * P().height;
        if (ch.words) c.words = ch.words.map((w) => ({ start: w.start - c.start, end: w.end - c.start, word: w.word }));
        P().clips.push(c);
      }
    });
    toast(`Добавлено субтитров: ${chunks.length}`);
  } catch (e) {
    onLog('\nОшибка: ' + e.message);
    toast('Ошибка распознавания — подробности в журнале', 4000);
  } finally {
    btn.disabled = false; btn.textContent = 'Распознать речь';
  }
}

// ============ Voice recording ============
let recorder = null;
async function toggleRecord() {
  if (recorder) { recorder.stop(); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { toast('Нет доступа к микрофону'); return; }
  const chunks = [];
  const at = S.time;
  recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    recorder = null;
    $('#recBtn').classList.remove('recording');
    if (S.playing) pause();
    const blob = new Blob(chunks, { type: 'audio/webm' });
    const raw = await api.saveBlob(await blob.arrayBuffer(), 'webm');
    const fixed = await api.extractAudio(raw);
    const m = await importFile(fixed, 'Голос ' + new Date().toLocaleTimeString('ru-RU'));
    if (!m) return;
    change(() => {
      const c = clipFromMedia(m); c.start = at;
      c.trackId = freeTrack('audio', at, c.dur).id;
      P().clips.push(c); selectOnly(c.id, true);
    });
    toast('Запись добавлена');
  };
  recorder.start();
  $('#recBtn').classList.add('recording');
  toast('Идёт запись… нажмите 🎙 ещё раз, чтобы остановить');
  if (projectDuration() > S.time) play();
}

// sound is mixed before the frames are rendered; show its progress in the export dialog
api.onExportStatus((m) => { const el = document.getElementById('expStatus'); if (el) el.textContent = m; });
