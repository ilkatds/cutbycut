'use strict';
// ============ AI assistant: Claude edits the timeline through a JSON command protocol ============
const AI = { history: [], busy: false, model: 'claude-sonnet-5-5', available: null, radius: 10, status: '' };

const AI_VISION = `Пользователь работает в позиции головки таймлайна — это «здесь», «тут», «сейчас», «этот момент», «это место». Клипы под головкой перечислены в состоянии (atPlayhead).
В твоей рабочей папке лежат картинки (открывай инструментом Read, другие файлы не трогай):
- now.jpg — кадр итогового видео прямо под головкой. Если запрос касается того, что в кадре или в этом моменте, — сначала посмотри его.
- window.jpg — раскадровка итогового видео вокруг головки (подписано время таймлайна, текущий кадр обведён красным). Открывай её, когда не до конца понимаешь, о каком моменте или событии речь, или когда нужно найти что-то рядом с головкой.
- full_01.jpg, full_02.jpg … — раскадровка ВСЕГО итогового видео от начала до конца (под каждым кадром время таймлайна, красная рамка — позиция головки). Открывай их, когда запрос касается всего ролика, начала/конца, другого места («найди, где…», «в момент, когда…»), структуры или сюжета.
Если нужно больше информации, вместо ops верни запрос (тебе пришлют результат и спросят снова):
- {"need":"frames","from":сек,"to":сек,"reply":"что ищу"} — подробная раскадровка отрезка (до 24 кадров), чтобы точно найти момент;
- {"need":"speech","from":сек,"to":сек,"reply":"что ищу"} — расшифровка речи отрезка (можно всё видео: from 0, to длительность).
Не угадывай время на глаз по грубой раскадровке, если от этого зависит монтаж, — уточни через frames.`;

const AI_PROTOCOL = `Ты — ИИ-помощник монтажёра внутри видеоредактора «Склейка». Пользователь пишет по-русски, что сделать с проектом.
Из инструментов можно использовать только Read — чтобы посмотреть картинки из рабочей папки. Итоговый ответ — ТОЛЬКО один JSON-объект без markdown:
{"reply":"коротко по-русски, что сделано или ответ на вопрос","ops":[ ...операции по порядку... ]}
Время — в секундах таймлайна. Клипы указывай по id из состояния проекта. Если просьба неясна — ops пустой, в reply уточняющий вопрос.

Операции:
{"op":"addMedia","media":"<id медиа>","track":"main|overlay|audio","start":сек?}  — добавить файл на таймлайн (main: склеивается подряд)
{"op":"split","t":сек,"clip":"<id>"?}  — разрезать (без clip — все клипы главной дорожки под t)
{"op":"delete","clips":["<id>",...]}
{"op":"deleteRange","from":сек,"to":сек}  — вырезать промежуток с главной дорожки со сдвигом
{"op":"silence","threshold":0.05,"minGap":0.6,"pad":0.12}  — автоматически вырезать паузы/тишину с главной дорожки (джамп-каты)
{"op":"move","clip":"<id>","start":сек}
{"op":"trim","clip":"<id>","start":сек?,"end":сек?}  — новые границы клипа на таймлайне
{"op":"speed","clip":"<id>","speed":0.1..10}
{"op":"volume","clip":"<id>","volume":0..4,"fadeIn":сек?,"fadeOut":сек?,"muted":bool?}
{"op":"filter","clip":"<id>|null","id":"<filterId>","amt":0..1}  — null = слоем на всё видео
{"op":"adjust","clip":"<id>","brightness":-100..100,"contrast":..,"saturation":..,"exposure":..,"temperature":..,"tint":..,"hue":-180..180,"fade":0..100,"vignette":0..100,"grain":0..100,"blur":0..100}
{"op":"effect","id":"<effectId>","start":сек,"dur":сек,"amt":0..1,"clip":"<id>"?}  — с clip: эффект на клип, без — на дорожку эффектов
{"op":"transition","clip":"<id>|all","id":"<transitionId>","dur":сек}  — переход в начало клипа (от предыдущего)
{"op":"text","text":"...","start":сек,"dur":сек,"style":"<имя стиля>"?,"y":-0.45..0.45?,"x":-0.45..0.45?,"size":px?,"color":"#hex"?,"in":"<animIn>"?,"out":"<animOut>"?,"loop":"<animLoop>"?,"textAnim":"<textAnim>"?}
{"op":"sticker","emoji":"😂","start":сек,"dur":сек,"x":-0.45..0.45?,"y":?,"scale":1?,"in":?,"loop":?}
{"op":"anim","clip":"<id>","in":?,"inDur":?,"out":?,"outDur":?,"loop":?}
{"op":"transform","clip":"<id>","x":px?,"y":px?,"scale":1=вписать?,"rot":град?,"opacity":0..1?}
{"op":"keyframe","clip":"<id>","prop":"x|y|scale|rot|opacity","t":сек,"v":число}
{"op":"fill","clip":"<id>"}  — растянуть на весь кадр без полей
{"op":"ratio","id":"16:9|9:16|1:1|4:3|3:4|4:5|21:9|2:1"}
{"op":"bg","type":"color|blur","color":"#hex"?}
{"op":"sfx","id":"<sfxId>","start":сек}
{"op":"captions","language":"ru|en|auto","words":5}  — автосубтитры по речи
{"op":"freeze","clip":"<id>","t":сек}  {"op":"reverse","clip":"<id>"}  {"op":"detachAudio","clip":"<id>"}
{"op":"marker","t":сек}  {"op":"seek","t":сек}  {"op":"play"}  {"op":"export"}  — seek, play и export только если пользователь прямо об этом просит
{"op":"select","clips":["<id>"]}
{"op":"footage","id":"<footageId>","start":сек,"dur":сек?,"text":"..."?,"text2":"..."?,"color":"#hex"?,"x":-0.45..0.45?,"y":?}  — анимированный футаж (ачивка, подписка, отсчёт…)
{"op":"sync","footage":"<id>","text":"<id>","priority":"text|footage"}  — синхронизировать текст с футажом (text: текст повторяет появление/анимацию футажа; footage: футаж подгоняется под текст)
{"op":"cut","from":сек,"to":сек,"name":"..."}  — отметить фрагмент для нарезки
{"op":"highlights","len":сек,"count":N,"mode":"loud|talk"}  — найти яркие моменты и отметить их фрагментами
{"op":"assemble"}  — собрать отмеченные фрагменты в один ролик
{"op":"download","url":"https://..."}  — скачать видео/футаж по ссылке и добавить на таймлайн
{"op":"removeBg","clip":"<id>"}  — убрать фон у фото/видео нейросетью`;

function aiCatalog() {
  return [
    'filterId: ' + FILTERS.map((f) => `${f.id}(${f.name})`).join(', '),
    'effectId: ' + EFFECTS.map((f) => `${f.id}(${f.name})`).join(', '),
    'transitionId: ' + TRANSITIONS.map((f) => `${f.id}(${f.name})`).join(', '),
    'animIn: ' + ANIM_IN.map((a) => a.id).join(','), 'animOut: ' + ANIM_OUT.map((a) => a.id).join(','), 'animLoop: ' + ANIM_LOOP.map((a) => a.id).join(','),
    'textAnim: ' + TEXT_ANIM.map((a) => a.id).join(','),
    'стили текста: ' + TEXT_STYLES.map((s) => s.name).join(', '),
    'sfxId: ' + SFX.map((s) => `${s.id}(${s.name})`).join(', '),
    'footageId: ' + GENS.map((g) => `${g.id}(${g.name})`).join(', '),
  ].join('\n');
}
function aiState() {
  const pr = P();
  const r = (v) => Math.round(v * 100) / 100;
  const under = pr.clips.filter((c) => activeAt(c, S.time)).map((c) => {
    const o = { id: c.id, type: c.type, track: (trackById(c.trackId) || {}).name, start: r(c.start), end: r(c.start + c.dur), localTime: r(S.time - c.start) };
    if (c.mediaId) o.sourceTime = r(srcTime(c, S.time));
    if (c.text) o.text = c.text.text.slice(0, 80);
    if (c.fx) o.effect = c.fx.id;
    return o;
  });
  return JSON.stringify({
    canvas: `${pr.width}x${pr.height} (${pr.ratio})`, fps: pr.fps, duration: r(projectDuration()), playhead: r(S.time), atPlayhead: under, selected: [...S.sel],
    media: pr.media.filter((m) => !m.hidden).map((m) => ({ id: m.id, name: m.name, type: m.type, dur: r(m.duration), size: m.width ? `${m.width}x${m.height}` : undefined, audio: m.hasAudio })),
    tracks: pr.tracks.map((t) => ({
      id: t.id, kind: t.kind, name: t.name, main: !!t.main,
      clips: clipsOn(t.id).map((c) => {
        const o = { id: c.id, type: c.type, start: r(c.start), dur: r(c.dur) };
        if (c.mediaId) { o.media = c.mediaId; o.in = r(c.in); if (c.speed !== 1) o.speed = c.speed; if (c.volume !== 1) o.volume = c.volume; if (c.muted) o.muted = true; }
        if (c.text) o.text = c.text.text.slice(0, 60);
        if (c.fx) o.effect = c.fx.id;
        if (c.filter && c.filter.id !== 'none') o.filter = c.filter.id;
        if (c.trans) o.transition = c.trans.id;
        if (c.gen) o.footage = c.gen.id + (c.gen.text ? ': ' + c.gen.text : '');
        return o;
      }),
    })),
  });
}

PANELS.ai = function (p) {
  p.append(h('h3', {}, '✨ ИИ-помощник'));
  p.append(h('div', { class: 'note' }, 'Напишите, что сделать с видео, — Claude выполнит это на таймлайне. Любое действие можно отменить Ctrl+Z.'));
  const log = h('div', { id: 'aiLog', style: { display: 'flex', flexDirection: 'column', gap: '8px', margin: '10px 0', maxHeight: 'calc(100vh - 470px)', minHeight: '120px', overflowY: 'auto' } });
  const bubble = (who, text) => h('div', { style: { alignSelf: who === 'user' ? 'flex-end' : 'flex-start', background: who === 'user' ? 'var(--accentBg)' : 'var(--bg2)', color: who === 'user' ? 'var(--text)' : 'var(--text)', border: who === 'user' ? '1px solid var(--accent)' : '1px solid var(--line)', padding: '7px 10px', borderRadius: '10px', maxWidth: '92%', whiteSpace: 'pre-wrap', lineHeight: 1.4, userSelect: 'text' } }, text);
  for (const m of AI.history) log.append(bubble(m.role, m.text));
  if (!AI.history.length) log.append(h('div', { class: 'note' }, 'Примеры:'));
  p.append(log);
  if (!AI.history.length) {
    const ex = ['Вырежи все паузы и тишину', 'Добавь субтитры по речи', 'Поставь переход «растворение» между всеми клипами', 'Сделай вертикальное видео для TikTok с размытым фоном', 'Добавь в начало заголовок «Мой влог» с анимацией', 'Сделай цветокоррекцию в стиле кино', 'Ускорь второй клип в 2 раза'];
    const w = h('div', {});
    for (const e of ex) w.append(h('span', { class: 'chip', onclick: () => { ta.value = e; ta.focus(); } }, e));
    log.append(w);
  }
  const ta = h('textarea', { placeholder: 'Например: вырежи паузы, добавь субтитры и эффект тряски на 10-й секунде…', style: { minHeight: '80px' } });
  const model = h('select', {}, h('option', { value: 'claude-sonnet-5-5' }, 'Sonnet 5.5 (быстро)'), h('option', { value: 'claude-opus-5-5' }, 'Opus 5.5 (умнее)'), h('option', { value: 'claude-haiku-5-5' }, 'Haiku 5.5 (самый быстрый)'));
  model.value = AI.model;
  model.addEventListener('change', () => { AI.model = model.value; saveSetting({ aiModel: model.value }); });
  if (AI.busy) log.append(h('div', { id: 'aiStatus', class: 'note', style: { alignSelf: 'flex-start' } }, AI.status || 'Думаю…'));
  const send = h('button', { class: 'primary' }, AI.busy ? 'Думаю…' : 'Отправить');
  send.disabled = AI.busy;
  const go = () => { const t = ta.value.trim(); if (t && !AI.busy) aiSend(t); };
  send.addEventListener('click', go);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
  const radius = h('select', { title: 'Сколько секунд вокруг головки помощник просматривает, если не понял запрос' }, ...[[5, '±5 с'], [10, '±10 с'], [20, '±20 с'], [30, '±30 с']].map(([v, n]) => h('option', { value: v }, n)));
  radius.value = AI.radius;
  radius.addEventListener('change', () => { AI.radius = +radius.value; saveSetting({ aiRadius: AI.radius }); ctxLine.textContent = aiCtxText(); });
  const ctxLine = h('span', { id: 'aiCtx', class: 'note', style: { margin: 0 } }, aiCtxText());
  p.append(h('div', { class: 'btnRow', style: { alignItems: 'center', marginBottom: '6px' } }, ctxLine, h('span', { class: 'grow' }), radius));
  p.append(ta, h('div', { class: 'btnRow', style: { marginTop: '6px', alignItems: 'center' } }, model, h('span', { class: 'grow' }),
    AI.history.length ? h('button', { onclick: () => { AI.history = []; setPanel('ai'); } }, 'Очистить') : null, send));
  if (AI.available === false) p.append(h('div', { class: 'note', style: { color: '#ff8a7a' } }, 'Claude Code не найден на компьютере. Установите приложение Claude и войдите в аккаунт.'));
  if (AI.needLogin) p.append(h('div', { class: 'btnRow', style: { marginTop: '8px' } },
    h('button', { class: 'primary', onclick: async () => { try { await api.aiLogin(); AI.needLogin = false; setPanel('ai'); } catch (e) { toast(e.message, 5000); } } }, '🔑 Войти заново')));
  setTimeout(() => { log.scrollTop = log.scrollHeight; ta.focus(); }, 0);
  // prepare the whole-video storyboard in the background so the first question is fast
  if (!AI.busy && projectDuration() > 0 && SET.aiOverview !== false) setTimeout(() => { if (!S.exporting) aiOverview().catch(() => {}); }, 300);
};

function parseAiJson(text) {
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  return JSON.parse(s);
}

function aiCtxText() {
  return `📍 Головка ${fmtTime(S.time, P().fps)} · вижу кадр и ${fmtTime(Math.max(0, S.time - AI.radius), P().fps)}–${fmtTime(Math.min(projectDuration(), S.time + AI.radius), P().fps)}`;
}
function aiStatus(s) { AI.status = s; const el = $('#aiStatus'); if (el) el.textContent = s; }

// ---------- What the assistant sees: frame under the playhead + storyboard around it ----------
const even2 = (v) => Math.max(2, Math.round(v / 2) * 2);
async function framesAt(t, W, H) {
  const frames = new Map();
  for (const { c } of neededMedia(t)) {
    if (c.type !== 'video' || frames.has(c.id)) continue;
    const tr = trackById(c.trackId);
    if (tr && tr.hidden) continue;
    const m = mediaById(c.mediaId);
    if (!m || !m.width) continue;
    const fit = Math.min(W / m.width, H / m.height) * Math.min(2, Math.max(1, c.tf.scale));
    const w = even2(Math.min(m.width, m.width * fit)), hh = even2(Math.min(m.height, m.height * fit));
    const buf = await api.frameAt({ file: m.path, t: srcTime(c, t), w, h: hh });
    if (!buf) continue;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
    cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.length), w, hh), 0, 0);
    frames.set(c.id, cv);
  }
  return frames;
}
function renderWith(frames, t, W, H) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const prev = frameSource;
  frameSource = (c) => {
    const m = mediaById(c.mediaId);
    if (!m) return null;
    if (m.type === 'image') { const im = getImg(m); return im.complete && im.naturalWidth ? im : null; }
    return frames.get(c.id) || null;
  };
  try { renderFrame(cv.getContext('2d'), t, W, H); } finally { frameSource = prev; }
  return cv;
}
const toJpeg = (cv) => new Promise((res) => cv.toBlob((b) => b.arrayBuffer().then(res), 'image/jpeg', 0.85));
// Storyboard sheet: frames rendered from the final timeline, each labelled with its time
async function makeSheet(times, o) {
  const pr = P(), ar = pr.width / pr.height;
  const cw = o.cw || (ar >= 1 ? 384 : even2(216 * ar)), ch = even2(cw / ar);
  const lab = 22, cols = o.cols || (ar >= 1 ? 4 : 6);
  const rows = Math.ceil(times.length / cols);
  const sheet = document.createElement('canvas'); sheet.width = cols * cw; sheet.height = rows * (ch + lab);
  const sx = sheet.getContext('2d');
  sx.fillStyle = '#111'; sx.fillRect(0, 0, sheet.width, sheet.height);
  // decode frames in parallel (each one is a separate ffmpeg seek), then draw in order
  const maps = new Array(times.length);
  let next = 0, done = 0;
  const worker = async () => { while (next < times.length) { const i = next++; maps[i] = await framesAt(times[i], cw, ch); done++; if (o.progress) o.progress(done - 1, times.length); } };
  await Promise.all(Array.from({ length: Math.min(6, times.length) }, worker));
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const fr = renderWith(maps[i], t, cw, ch);
    const x = (i % cols) * cw, y = Math.floor(i / cols) * (ch + lab);
    const cur = o.cur != null && Math.abs(t - o.cur) < 1e-6;
    sx.drawImage(fr, x, y + lab);
    sx.fillStyle = cur ? '#e3242b' : '#2a2a2a'; sx.fillRect(x, y, cw, lab);
    sx.fillStyle = '#fff'; sx.font = '700 14px Segoe UI'; sx.textBaseline = 'middle'; sx.textAlign = 'left';
    sx.fillText(o.label(t, cur), x + 7, y + lab / 2);
    if (cur) { sx.strokeStyle = '#e3242b'; sx.lineWidth = 4; sx.strokeRect(x + 2, y + 2, cw - 4, ch + lab - 4); }
  }
  return sheet;
}
const fmtS = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')} (${t.toFixed(1)} с)`;

async function aiCaptureContext() {
  const pr = P(), dur = projectDuration();
  if (!dur) return null;
  await api.aiReset(true);
  const ar = pr.width / pr.height;
  const t0 = clamp(S.time, 0, Math.max(0, dur - 0.04));
  const NW = ar >= 1 ? 960 : even2(960 * ar), NH = ar >= 1 ? even2(960 / ar) : 960;
  const now = renderWith(await framesAt(t0, NW, NH), t0, NW, NH);
  await api.aiSaveFile('now.jpg', await toJpeg(now));
  const R = AI.radius, step = Math.max(1, R / 5);
  const times = [];
  for (let k = -5; k <= 5; k++) { const t = t0 + k * step; if (t >= 0 && t <= dur - 0.04) times.push(k === 0 ? t0 : t); }
  const sheet = await makeSheet(times, { cur: t0, label: (t, cur) => `${cur ? '▶ СЕЙЧАС  ' : ((t - t0) > 0 ? '+' : '') + (t - t0).toFixed(1) + 'с  ·  '}${t.toFixed(1)} с` });
  await api.aiSaveFile('window.jpg', await toJpeg(sheet));
  requestRender();
  return { from: times[0], to: times[times.length - 1] };
}

// ---------- Whole-video storyboard (cached until the timeline changes) ----------
function aiSignature() {
  const pr = P();
  return JSON.stringify([pr.width, pr.height, pr.bg, pr.tracks.map((t) => [t.id, t.hidden]), pr.clips.map((c) => [c.id, c.trackId, c.start, c.dur, c.in, c.speed, c.mediaId, c.tf, c.kf, c.anim, c.filter, c.adj, c.fx, c.fxList, c.text, c.gen, c.trans, c.crop, c.mask])]);
}
async function aiOverview(onProgress) {
  const sig = aiSignature();
  if (AI.ov && AI.ov.sig === sig && (await api.aiHasFiles(AI.ov.files))) return AI.ov;
  if (AI.ovBuilding && AI.ovBuilding.sig === sig) return AI.ovBuilding.promise;
  const build = (async () => {
    const dur = projectDuration();
    if (!dur) return null;
    const MAX = 96, PER = 24;
    const step = Math.max(2, dur / MAX);
    const times = [];
    for (let t = Math.min(step / 2, dur / 2); t < dur - 0.04; t += step) times.push(t);
    const files = [];
    const land = P().width >= P().height;
    for (let i = 0; i < times.length; i += PER) {
      const chunk = times.slice(i, i + PER);
      const sheet = await makeSheet(chunk, { cw: land ? 320 : 150, cols: land ? 6 : 8, label: (t) => fmtS(t), progress: (k) => onProgress && onProgress(i + k, times.length) });
      const name = `full_${String(files.length + 1).padStart(2, '0')}.jpg`;
      await api.aiSaveFile(name, await toJpeg(sheet));
      files.push(name);
    }
    requestRender();
    return { sig, files, step, count: times.length, dur };
  })();
  AI.ovBuilding = { sig, promise: build };
  try { AI.ov = await build; return AI.ov; } finally { AI.ovBuilding = null; }
}

// ---------- Speech of any range (cached per timeline state) ----------
async function aiSpeech(a, b) {
  const key = aiSignature().length + ':' + a.toFixed(1) + '-' + b.toFixed(1);
  AI.speechCache = AI.speechCache || new Map();
  if (AI.speechCache.has(key)) return AI.speechCache.get(key);
  const items = audioItemsRange(a, b);
  let res;
  if (!items.length) res = 'В этом диапазоне нет звука.';
  else {
    const segs = await api.whisper({ audio: items, duration: b - a, language: 'auto', model: 'base' });
    res = segs.length ? segs.map((s) => `[${(s.start + a).toFixed(1)}–${(s.end + a).toFixed(1)} с] ${s.text}`).join('\n') : 'Речь не распознана (тишина, музыка или шум).';
  }
  AI.speechCache.set(key, res);
  return res;
}
async function aiDetail(a, b, n) {
  const dur = projectDuration();
  a = clamp(a, 0, dur); b = clamp(b, a + 0.1, dur);
  const count = clamp(Math.round((b - a) / 0.25), 2, 24);
  const times = [];
  for (let i = 0; i < count; i++) times.push(Math.min(a + ((b - a) * i) / (count - 1), dur - 0.04));
  const sheet = await makeSheet(times, { label: (t) => fmtS(t) });
  const name = `detail_${n}.jpg`;
  await api.aiSaveFile(name, await toJpeg(sheet));
  requestRender();
  return { name, step: (b - a) / (count - 1), a, b };
}

async function aiSend(text) {
  AI.history.push({ role: 'user', text });
  if (S.playing) pause(); // "здесь" must stay where the user stopped
  AI.busy = true;
  AI.status = `Смотрю кадр и ±${AI.radius} с вокруг головки…`;
  setPanel('ai');
  const hist = AI.history.slice(-8, -1).map((m) => `${m.role === 'user' ? 'Пользователь' : 'Помощник'}: ${m.text}`).join('\n');
  let reply;
  try {
    let vis = null, ov = null;
    try { vis = await aiCaptureContext(); } catch (e) { console.warn('ai capture', e); }
    if (SET.aiOverview !== false) try { ov = await aiOverview((i, n) => aiStatus(`Просматриваю всё видео: кадр ${i + 1} из ${n}…`)); } catch (e) { console.warn('ai overview', e); }
    let visText = vis ? `${AI_VISION}\nГоловка стоит на ${S.time.toFixed(1)} с. Раскадровка window.jpg охватывает ${vis.from.toFixed(1)}–${vis.to.toFixed(1)} с.` : '';
    if (ov) visText += `\nРаскадровка всего видео (${ov.dur.toFixed(1)} с): ${ov.files.join(', ')} — ${ov.count} кадров, примерно каждые ${ov.step.toFixed(1)} с.`;
    const base = `${AI_PROTOCOL}\n\n${visText}\n\nКаталоги:\n${aiCatalog()}\n\nСостояние проекта:\n${aiState()}\n\n${hist ? 'Предыдущий диалог:\n' + hist + '\n\n' : ''}Запрос пользователя: ${text}`;
    const extra = [];
    const ROUNDS = 4;
    let j;
    for (let round = 0; round < ROUNDS; round++) {
      aiStatus(round ? 'Думаю над деталями…' : 'Думаю…');
      const tail = extra.length ? `\n\nДополнительная информация по твоим запросам:\n${extra.join('\n\n')}\n\n${round === ROUNDS - 1 ? 'Теперь выполни запрос. Поле need больше не используй.' : `Если нужно — можешь запросить ещё (осталось запросов: ${ROUNDS - 1 - round}).`}` : '';
      const raw = await api.aiAsk({ prompt: base + tail, model: AI.model });
      try { j = parseAiJson(raw); } catch (_) { j = { reply: raw, ops: [] }; }
      if (!j.need || round === ROUNDS - 1) break;
      const dur = projectDuration();
      const a = clamp(nfin(j.from, vis ? vis.from : 0), 0, dur), b = clamp(nfin(j.to, vis ? vis.to + 2 : dur), 0, dur);
      if (j.need === 'frames') {
        aiStatus(`Разглядываю ${fmtTime(a, P().fps)}–${fmtTime(b, P().fps)}…`);
        const d = await aiDetail(a, b, round + 1);
        extra.push(`Подробная раскадровка ${a.toFixed(1)}–${b.toFixed(1)} с: файл ${d.name} (кадры каждые ${d.step.toFixed(2)} с, подписано время).`);
      } else if (j.need === 'speech') {
        aiStatus(`Слушаю речь ${fmtTime(a, P().fps)}–${fmtTime(b, P().fps)}${b - a > 120 ? ' (длинный отрезок — это займёт время)' : ''}…`);
        extra.push(`Расшифровка речи ${a.toFixed(1)}–${b.toFixed(1)} с (время таймлайна):\n${await aiSpeech(a, b)}`);
      } else break;
    }
    const ops = Array.isArray(j.ops) ? j.ops : [];
    const res = ops.length ? await runOps(ops) : { done: 0, errors: [] };
    reply = (j.reply || 'Готово.') + (res.errors.length ? `\n\n⚠ Не выполнено: ${res.errors.join('; ')}` : '');
  } catch (e) {
    const msg = e.message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
    if (/OAuth|authenticat|login|401|session expired/i.test(msg)) {
      AI.needLogin = true;
      reply = 'Вход в Claude истёк — помощнику нужно войти заново. Нажмите «Войти заново» ниже, в открывшемся окне наберите /login и войдите в браузере, затем повторите запрос.';
    } else reply = 'Ошибка: ' + msg;
  }
  AI.busy = false; AI.status = '';
  AI.history.push({ role: 'assistant', text: reply });
  if (curPanel === 'ai') setPanel('ai'); else toast('✨ ' + reply.slice(0, 120), 5000);
}

// ---------- Operation executor ----------
const nfin = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
async function runOps(ops) {
  const errors = [];
  const later = [];
  pushUndo();
  for (const o of ops) {
    try {
      const r = execOp(o);
      if (r && r.then) later.push(r);
    } catch (e) { errors.push(`${o.op}: ${e.message}`); }
    packMain();
  }
  afterChange();
  for (const r of later) { try { await r; } catch (e) { errors.push(e.message); } }
  return { errors };
}
function needClip(id) { const c = clipById(id); if (!c) throw new Error('нет клипа ' + id); return c; }
function execOp(o) {
  const pr = P();
  switch (o.op) {
    case 'addMedia': {
      const m = mediaById(o.media); if (!m) throw new Error('нет медиа ' + o.media);
      const c = clipFromMedia(m);
      if (m.type === 'audio' || o.track === 'audio') { c.type = m.type === 'audio' ? 'audio' : c.type; c.start = nfin(o.start, S.time); c.trackId = freeTrack('audio', c.start, c.dur, (pr.tracks.find((t) => t.kind === 'audio') || {}).id).id; if (m.type !== 'audio') Object.assign(c, makeClip('audio', { mediaId: m.id, name: m.name, dur: m.duration, start: c.start, trackId: c.trackId })); }
      else if (o.track === 'overlay') { c.start = nfin(o.start, S.time); c.trackId = freeTrack('video', c.start, c.dur).id; }
      else { autoRatio(m); const main = pr.tracks.find((t) => t.main); c.trackId = main.id; c.start = o.start != null ? o.start - 0.0005 : 1e9; }
      pr.clips.push(c);
      return;
    }
    case 'split': {
      const list = o.clip ? [needClip(o.clip)] : clipsOn(pr.tracks.find((t) => t.main).id).filter((c) => activeAt(c, o.t));
      for (const c of list) splitClip(c, o.t);
      return;
    }
    case 'delete': { const ids = new Set(o.clips || []); pr.clips = pr.clips.filter((c) => !ids.has(c.id)); for (const id of ids) S.sel.delete(id); return; }
    case 'deleteRange': deleteRange(o.from, o.to); return;
    case 'silence': cutSilence(nfin(o.threshold, 0.05), nfin(o.minGap, 0.6), nfin(o.pad, 0.12)); return;
    case 'move': { const c = needClip(o.clip); c.start = Math.max(0, o.start); resolveOverlap(c); return; }
    case 'trim': {
      const c = needClip(o.clip);
      const m = c.mediaId ? mediaById(c.mediaId) : null;
      if (o.start != null) { const d = o.start - c.start; if (c.in != null && c.freeze == null) c.in = Math.max(0, c.in + d * c.speed); c.start = o.start; c.dur -= d; }
      if (o.end != null) c.dur = o.end - c.start;
      if (m && m.type !== 'image' && c.freeze == null) c.dur = Math.min(c.dur, (m.duration - c.in) / c.speed);
      c.dur = Math.max(0.05, c.dur);
      return;
    }
    case 'speed': setSpeed(needClip(o.clip), clamp(o.speed, 0.1, 10)); return;
    case 'volume': { const c = needClip(o.clip); if (o.volume != null) c.volume = clamp(o.volume, 0, 4); if (o.fadeIn != null) c.fadeIn = o.fadeIn; if (o.fadeOut != null) c.fadeOut = o.fadeOut; if (o.muted != null) c.muted = !!o.muted; return; }
    case 'filter': {
      if (!FILTERS.find((f) => f.id === o.id)) throw new Error('нет фильтра ' + o.id);
      if (o.clip) { const c = needClip(o.clip); c.filter = { id: o.id, amt: nfin(o.amt, 1) }; return; }
      const tr = freeTrack('fx', 0, projectDuration(), (pr.tracks.find((x) => x.kind === 'fx') || {}).id);
      pr.clips.push(makeClip('filter', { start: 0, dur: projectDuration() || 5, trackId: tr.id, filter: { id: o.id, amt: nfin(o.amt, 1) } }));
      return;
    }
    case 'adjust': { const c = needClip(o.clip); if (!c.adj) throw new Error('клип не поддерживает коррекцию'); for (const k of Object.keys(ADJUST_DEFAULT)) if (o[k] != null) c.adj[k] = o[k]; return; }
    case 'effect': {
      if (!EFFECTS.find((f) => f.id === o.id)) throw new Error('нет эффекта ' + o.id);
      if (o.clip) { const c = needClip(o.clip); c.fxList = c.fxList || []; c.fxList.push({ id: o.id, amt: nfin(o.amt, 0.6) }); return; }
      const st = nfin(o.start, S.time), dur = nfin(o.dur, 3);
      const tr = freeTrack('fx', st, dur, (pr.tracks.find((x) => x.kind === 'fx') || {}).id);
      const c = makeClip('fx', { start: st, dur, trackId: tr.id }); c.fx = { id: o.id, amt: nfin(o.amt, 0.6) }; pr.clips.push(c);
      return;
    }
    case 'transition': {
      if (!TRANSITIONS.find((f) => f.id === o.id)) throw new Error('нет перехода ' + o.id);
      const dur = nfin(o.dur, 0.5);
      const list = o.clip === 'all' ? pr.clips.filter((c) => (c.type === 'video' || c.type === 'image') && prevOnTrack(c)) : [needClip(o.clip)];
      for (const c of list) { const pv = prevOnTrack(c); if (!pv) throw new Error('перед клипом нет соседнего'); c.trans = { id: o.id, dur: Math.min(dur, c.dur / 2, pv.dur / 2) }; }
      return;
    }
    case 'text': {
      const st = nfin(o.start, S.time), dur = nfin(o.dur, 3);
      const tr = freeTrack('text', st, dur, (pr.tracks.find((x) => x.kind === 'text' && !x.captions) || {}).id);
      const c = makeClip('text', { start: st, dur, trackId: tr.id });
      const style = TEXT_STYLES.find((s) => s.name.toLowerCase() === String(o.style || '').toLowerCase());
      Object.assign(c.text, style ? style.s : {}, { text: String(o.text || 'Текст') });
      if (o.size) c.text.size = o.size; if (o.color) c.text.color = o.color; if (o.textAnim) c.text.textAnim = o.textAnim;
      if (o.x != null) c.tf.x = o.x * pr.width; if (o.y != null) c.tf.y = o.y * pr.height;
      if (o.in) c.anim.in = o.in; if (o.out) c.anim.out = o.out; if (o.loop) c.anim.loop = o.loop;
      pr.clips.push(c);
      return;
    }
    case 'sticker': {
      const st = nfin(o.start, S.time), dur = nfin(o.dur, 3);
      const tr = freeTrack('text', st, dur, (pr.tracks.find((x) => x.kind === 'text' && !x.captions) || {}).id);
      const c = makeClip('sticker', { start: st, dur, trackId: tr.id, name: o.emoji });
      Object.assign(c.text, { text: o.emoji || '⭐', size: 220, font: 'Segoe UI Emoji', bold: false, strokeWidth: 0 });
      if (o.x != null) c.tf.x = o.x * pr.width; if (o.y != null) c.tf.y = o.y * pr.height; if (o.scale) c.tf.scale = o.scale;
      c.anim.in = o.in || 'pop'; c.anim.loop = o.loop || 'none';
      pr.clips.push(c);
      return;
    }
    case 'anim': { const c = needClip(o.clip); for (const k of ['in', 'inDur', 'out', 'outDur', 'loop']) if (o[k] != null) c.anim[k] = o[k]; return; }
    case 'transform': { const c = needClip(o.clip); for (const k of ['x', 'y', 'scale', 'rot', 'opacity']) if (o[k] != null) c.tf[k] = o[k]; return; }
    case 'keyframe': { const c = needClip(o.clip); c.kf = c.kf || {}; const L = (c.kf[o.prop] = c.kf[o.prop] || []); const lt = clamp(o.t - c.start, 0, c.dur); const ex = L.find((k) => Math.abs(k.t - lt) < 0.01); if (ex) ex.v = o.v; else L.push({ t: lt, v: o.v }); L.sort((a, b) => a.t - b.t); return; }
    case 'fill': fitClip(needClip(o.clip), 'cover'); return;
    case 'ratio': setRatio(o.id); return;
    case 'bg': if (o.type) pr.bg.type = o.type; if (o.color) pr.bg.color = o.color; return;
    case 'sfx': { const s = SFX.find((x) => x.id === o.id); if (!s) throw new Error('нет звука ' + o.id); return addSfx(s, nfin(o.start, S.time)); }
    case 'captions': {
      const btn = h('button'), log = h('div');
      return runCaptions({ language: o.language || 'ru', model: 'small', words: o.words || 5, style: (TEXT_STYLES.find((s) => s.name === 'Субтитры') || {}).s, y: 0.3 }, btn, log);
    }
    case 'freeze': { const c = needClip(o.clip); S.sel = new Set([c.id]); S.time = nfin(o.t, S.time); return cmd('freeze'); }
    case 'reverse': { S.sel = new Set([needClip(o.clip).id]); return cmd('reverse'); }
    case 'detachAudio': { S.sel = new Set([needClip(o.clip).id]); return cmd('detachAudio'); }
    case 'marker': pr.markers.push({ t: o.t, color: '#ffb03a' }); return;
    case 'seek': S.time = Math.max(0, o.t); return;
    case 'select': S.sel = new Set((o.clips || []).filter((id) => clipById(id))); return;
    case 'play': setTimeout(play, 100); return;
    case 'export': setTimeout(openExport, 100); return;
    case 'footage': {
      const g = GENS.find((x) => x.id === o.id); if (!g) throw new Error('нет футажа ' + o.id);
      const tr = freeTrack('text', nfin(o.start, S.time), nfin(o.dur, g.dur), (pr.tracks.find((x) => x.kind === 'text' && !x.captions) || {}).id);
      const c = makeClip('gen', { start: nfin(o.start, S.time), dur: nfin(o.dur, g.dur), trackId: tr.id, name: g.name });
      c.gen = { id: g.id, text: o.text != null ? o.text : g.text, text2: o.text2 != null ? o.text2 : g.text2, color: o.color || g.color, color2: o.color2 || g.color2 };
      if (o.x != null) c.tf.x = o.x * pr.width; if (o.y != null) c.tf.y = o.y * pr.height;
      pr.clips.push(c);
      return;
    }
    case 'sync': { const f = needClip(o.footage), t = needClip(o.text); return runSync(f, t, { prio: o.priority === 'footage' ? 'footage' : 'text', timing: true, anim: true, place: true }); }
    case 'cut': cuts().push({ id: uid('cut'), from: Math.max(0, o.from), to: o.to, name: o.name || 'Фрагмент ' + (cuts().length + 1), on: true }); return;
    case 'highlights': for (const f of findHighlights(nfin(o.len, 20), nfin(o.count, 8), o.mode === 'talk' ? 'talk' : 'loud')) cuts().push({ id: uid('cut'), from: f.from, to: f.to, name: 'Момент ' + (cuts().length + 1), on: true }); return;
    case 'assemble': setTimeout(assembleCuts, 50); return;
    case 'download': return downloadUrl(o.url).then((m) => { if (m) addAtPlayhead(m); });
    case 'removeBg': return removeBg(needClip(o.clip));
    default: throw new Error('неизвестная операция');
  }
}

// ---------- Range removal & silence cutting (main track) ----------
function deleteRange(from, to) {
  if (!(to > from)) return;
  const main = P().tracks.find((t) => t.main);
  for (const c of clipsOn(main.id)) { if (activeAt(c, to)) splitClip(c, to); }
  for (const c of clipsOn(main.id)) { if (activeAt(c, from)) splitClip(c, from); }
  P().clips = P().clips.filter((c) => !(c.trackId === main.id && c.start >= from - 1e-4 && c.start + c.dur <= to + 1e-4));
  if (!$('#magnet').checked) for (const c of P().clips) if (c.trackId === main.id && c.start >= to - 1e-4) c.start -= to - from;
  packMain();
}
function silentRanges(thr, minGap, pad) {
  const main = P().tracks.find((t) => t.main);
  const ranges = [];
  for (const c of clipsOn(main.id)) {
    if (c.type !== 'video' && c.type !== 'audio') continue;
    const pk = (S.cache[c.mediaId] || {}).peaks;
    if (!pk) continue;
    const step = 0.02;
    let s0 = null;
    for (let t = c.start; t <= c.start + c.dur + 1e-6; t += step) {
      const st = srcTime(c, t);
      const i = Math.floor(st * 100);
      let mx = 0; for (let j = i - 1; j <= i + 1; j++) if (pk[j] > mx) mx = pk[j];
      const quiet = mx / 255 < thr && t < c.start + c.dur;
      if (quiet && s0 == null) s0 = t;
      if ((!quiet || t >= c.start + c.dur - 1e-6) && s0 != null) {
        const e = Math.min(t, c.start + c.dur);
        if (e - s0 >= minGap) ranges.push([s0 + (s0 > c.start + 0.01 ? pad : 0), e - (e < c.start + c.dur - 0.01 ? pad : 0)]);
        s0 = null;
      }
    }
  }
  return ranges.filter(([a, b]) => b - a > 0.05);
}
function cutSilence(thr, minGap, pad) {
  const ranges = silentRanges(thr, minGap, pad);
  if (!ranges.length) { toast('Пауз не найдено'); return 0; }
  const wasMagnet = $('#magnet').checked;
  $('#magnet').checked = false;
  for (const [a, b] of ranges.sort((x, y) => y[0] - x[0])) deleteRange(a, b);
  $('#magnet').checked = wasMagnet;
  packMain();
  toast(`Вырезано пауз: ${ranges.length}`);
  return ranges.length;
}
api.aiAvailable().then((v) => { AI.available = v; });
