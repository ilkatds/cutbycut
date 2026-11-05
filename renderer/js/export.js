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
    items.push({ path: m.path, srcIn: c.in, srcOut, speed: c.speed, volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut, start: c.start, trackId: c.trackId, clipId: c.id });
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
function exportButtonClick() { if (S.mode === 'photo') return openPhotoExport(); if (S.mode === 'audio') return openAudioExport(); if ([...EXP.jobs.values()].some((j) => !j.done) || EXP.jobs.size) openExportJobs(); else openExport(); }

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
const clipName = (c) => { const m = c.mediaId && mediaById(c.mediaId); return m ? m.name : c.type; };
// opt.mode: 'all' = speech of the whole timeline mixed together;
// 'sel' = each selected clip with sound on its own, captions linked to that clip (they move with it)
async function runCaptions(opt, btn, log) {
  const jobs = [];
  if (opt.mode === 'sel') {
    const all = audioItems();
    const picked = P().clips.filter((c) => S.sel.has(c.id) && (c.type === 'video' || c.type === 'audio'));
    if (!picked.length) { toast('Выделите на таймлайне аудио или видео со звуком', 4000); return; }
    for (const c of picked) {
      const it = all.find((x) => x.clipId === c.id);
      if (!it) { toast(`«${clipName(c)}»: нет звука или он выключен — пропускаю`, 4000); continue; }
      jobs.push({ items: [{ ...it, start: 0 }], offset: c.start, duration: (it.srcOut - it.srcIn) / it.speed, clip: c, name: clipName(c) });
    }
    if (!jobs.length) return;
  } else {
    const items = audioItems();
    if (!items.length) { toast('На таймлайне нет звука'); return; }
    jobs.push({ items, offset: 0, duration: projectDuration(), clip: null, name: 'всё видео' });
  }
  btn.disabled = true;
  log.textContent = '';
  const onLog = (s) => { log.textContent = (log.textContent + s).slice(-3000); log.scrollTop = log.scrollHeight; };
  api.onWhisperLog(onLog);
  try {
    const results = [];
    for (let j = 0; j < jobs.length; j++) {
      const job = jobs[j];
      btn.textContent = jobs.length > 1 ? `Распознаю клип ${j + 1} из ${jobs.length}…` : 'Распознаю… (может занять несколько минут)';
      const segs = await api.whisper({ audio: job.items, duration: job.duration, language: opt.language, model: opt.model, prompt: SET.capHints || '' });
      const chunks = [];
      for (const s of segs) {
        const words = (s.words && s.words.length ? s.words : null);
        if (!words) { chunks.push({ start: s.start, end: s.end, text: s.text, words: null }); continue; }
        for (let i = 0; i < words.length; i += opt.words) {
          const part = words.slice(i, i + opt.words);
          chunks.push({ start: part[0].start, end: part[part.length - 1].end, text: part.map((w) => w.word.trim()).join(' '), words: part });
        }
      }
      if (chunks.length) results.push({ job, chunks });
    }
    if (!results.length) { toast('Речь не найдена'); return; }
    let total = 0;
    change(() => {
      let shared = null; // whole-video mode: one new track
      for (const { job, chunks } of results) {
        const a = job.offset, b = job.offset + job.duration;
        // a captions track that is free over this clip, otherwise a new one
        let tr = job.clip ? P().tracks.find((t) => t.captions && !t.locked && !P().clips.some((x) => x.trackId === t.id && x.start < b && x.start + x.dur > a)) : shared;
        if (!tr) { tr = { id: uid('t'), kind: 'text', name: 'Субтитры', captions: true }; P().tracks.unshift(tr); if (!job.clip) shared = tr; }
        for (let i = 0; i < chunks.length; i++) {
          const ch = chunks[i];
          const end = i + 1 < chunks.length ? Math.min(chunks[i + 1].start, ch.end + 0.6) : Math.min(ch.end + 0.3, job.duration);
          const c = makeClip('text', { trackId: tr.id, start: Math.max(0, a + ch.start), dur: Math.max(0.2, end - ch.start) });
          Object.assign(c.text, TEXT_DEFAULT, opt.style, { text: applyCapDict(ch.text) });
          if (P().height > P().width) c.text.size = Math.round(c.text.size * 1.1);
          c.tf.y = opt.y * P().height;
          if (ch.words) { c.words = ch.words.map((w) => ({ start: a + w.start - c.start, end: a + w.end - c.start, word: w.word })); retimeWords(c); }
          if (job.clip && opt.link) { c.link = job.clip.id; c.linkAt = job.clip.start; }
          P().clips.push(c);
          total++;
        }
      }
    });
    toast(`Добавлено субтитров: ${total}` + (opt.mode === 'sel' && opt.link ? ' — они двигаются вместе со своим клипом' : ''), 4000);
  } catch (e) {
    onLog('\nОшибка: ' + e.message);
    toast('Ошибка распознавания — подробности в журнале', 4000);
  } finally {
    btn.disabled = false; btn.textContent = 'Распознать речь';
  }
}

// ============ Voice recording ============
let recorder = null, recCountdown = null;
const fmtClockShort = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// Big overlay over the player: countdown digits, then a red "● REC 0:07" timer
function recOverlay() {
  let el = $('#recOverlay');
  if (!el) { el = h('div', { id: 'recOverlay' }); $('#stageWrap').append(el); }
  return el;
}
function recBeep(high) {
  if (SET.recBeep === false) return;
  try {
    const ac = recBeep.ac || (recBeep.ac = new AudioContext());
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = high ? 1320 : 880;
    g.gain.setValueAtTime(0.25, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + (high ? 0.35 : 0.15));
    o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.4);
  } catch (_) {}
}
function stopCountdown(mic) {
  clearInterval(recCountdown.timer);
  recCountdown = null;
  mic.close();
  $('#recBtn').classList.remove('recording', 'counting');
  recOverlay().remove();
  toast('Запись отменена');
}
async function toggleRecord() {
  if (recorder) { recorder.stop(); return; }
  if (recCountdown) { stopCountdown(recCountdown.mic); return; } // second press during the countdown cancels it
  if (toggleRecord.opening) return;
  // selected device + noise suppression from Settings → Microphone
  let mic;
  toggleRecord.opening = true;
  try { mic = await micOpen(); } catch (e) { toast('Нет доступа к микрофону'); return; } finally { toggleRecord.opening = false; }
  if (S.playing) pause();
  // the microphone is opened before the countdown, so recording starts exactly on "0"
  let left = Math.max(0, Math.round(+SET.recCountdown || 0));
  if (left > 0) {
    $('#recBtn').classList.add('counting');
    const ov = recOverlay();
    const show = () => { ov.className = 'count'; ov.textContent = ''; ov.append(h('b', {}, String(left)), h('span', {}, 'Запись начнётся через… (🎙 или Esc — отмена)')); };
    show(); recBeep(false);
    recCountdown = { mic, timer: setInterval(() => {
      left--;
      if (left > 0) { show(); recBeep(false); return; }
      clearInterval(recCountdown.timer); recCountdown = null;
      recBeep(true);
      startRecording(mic);
    }, 1000) };
    return;
  }
  startRecording(mic);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && recCountdown) { e.stopPropagation(); stopCountdown(recCountdown.mic); } }, true);
function startRecording(mic) {
  const chunks = [];
  const at = S.time;
  $('#recBtn').classList.remove('counting');
  const ov = recOverlay(), t0 = performance.now();
  ov.className = 'rec'; ov.textContent = '';
  const clock = h('span'), lvl = h('i');
  ov.append(clock, h('span', { class: 'recLvl' }, lvl));
  const tick = () => { clock.textContent = `● REC ${fmtClockShort((performance.now() - t0) / 1000)}`; };
  tick();
  const timer = setInterval(tick, 250);
  const meter = setInterval(() => { lvl.style.width = (clamp((mic.level().peak + 60) / 60, 0, 1) * 100).toFixed(0) + '%'; }, 60);
  // uncompressed PCM when the browser can, so the voice is not compressed twice (WebM Opus -> AAC)
  const pcm = MediaRecorder.isTypeSupported('audio/webm;codecs=pcm');
  recorder = new MediaRecorder(mic.stream, pcm ? { mimeType: 'audio/webm;codecs=pcm' } : { mimeType: 'audio/webm', audioBitsPerSecond: 256000 });
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.onstop = async () => {
    mic.close();
    recorder = null;
    clearInterval(timer); clearInterval(meter); ov.remove();
    $('#recBtn').classList.remove('recording');
    if (S.playing) pause();
    const blob = new Blob(chunks, { type: 'audio/webm' });
    const raw = await api.saveBlob(await blob.arrayBuffer(), 'webm');
    const fixed = await api.extractAudio(raw, true);
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
