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
- {"need":"loud","from":сек,"to":сек,"track":"имя дорожки"?,"reply":"что ищу"} — моменты резкого громкого звука (время, сила): выстрелы, взрывы, смерти, крики, удары, а на дорожке с музыкой — её биты и акценты. Мгновенно, работает на любой длине — используй его первым для поиска событий по звуку и для синхронизации с музыкой, потом уточняй кадрами через frames;
- {"need":"speech","from":сек,"to":сек,"reply":"что ищу"} — расшифровка речи отрезка, не больше 10 минут за запрос (это медленно: минуты работы). Только когда действительно важны слова.
Не угадывай время на глаз по грубой раскадровке, если от этого зависит монтаж, — уточни через frames.`;

const AI_PROTOCOL = `Ты — ИИ-помощник монтажёра внутри видеоредактора «CutByCut». Пользователь пишет по-русски, что сделать с проектом.
Из инструментов можно использовать только Read — чтобы посмотреть картинки из рабочей папки. Итоговый ответ — ТОЛЬКО один JSON-объект без markdown:
{"reply":"коротко по-русски, что сделано или ответ на вопрос","ops":[ ...операции по порядку... ]}
Время — в секундах таймлайна. Клипы указывай по id из состояния проекта. Если просьба неясна — ops пустой, в reply уточняющий вопрос.

Операции:
{"op":"addMedia","media":"<id медиа>","track":"main|overlay|audio","start":сек?}  — добавить файл на таймлайн (main: склеивается подряд)
{"op":"split","t":сек,"clip":"<id>"?}  — разрезать (без clip — все клипы главной дорожки под t)
{"op":"delete","clips":["<id>",...]}
{"op":"deleteRange","from":сек,"to":сек}  — вырезать промежуток с главной дорожки со сдвигом
{"op":"place","from":сек,"to":сек,"at":сек}  — скопировать кусок таймлайна from–to (картинка вместе со звуком игры) на дорожку наложения так, чтобы он начинался ровно в at. Исходники и главная дорожка не меняются, магнит его не двигает. Так собирай нарезки и подборки под музыку/удары и всё, где важно точное время.
ВАЖНО: delete и deleteRange — только когда пользователь прямо просит что-то удалить или вырезать. Исходные записи, из которых берёшь моменты, не удаляй.
{"op":"silence","threshold":0.05,"minGap":0.6,"pad":0.12}  — автоматически вырезать паузы/тишину с главной дорожки (джамп-каты)
{"op":"move","clip":"<id>","start":сек}
{"op":"trim","clip":"<id>","start":сек?,"end":сек?}  — новые границы клипа на таймлайне
{"op":"speed","clip":"<id>","speed":0.1..10}
{"op":"volume","clip":"<id>","volume":0..4,"fadeIn":сек?,"fadeOut":сек?,"muted":bool?}
{"op":"filter","clip":"<id>|null","id":"<filterId>","amt":0..1}  — null = слоем на всё видео
{"op":"mask","clip":"<id>","type":"none|circle|rect|round|heart|star|triangle|diamond|hexagon|band|vband|split|linear|radial","mode":"cut|darken|blur|gray|pixel","size":0.05..3,"feather":0..1,"strength":0..1,"color":"#000000","x":-1..1,"y":-1..1,"rot":-180..180,"aspect":0.2..4,"invert":false}  — маска видео/фото; darken = затемнение снаружи (виньетка: radial+darken, кинополосы: band+darken+feather 0, затемнение снизу: linear+darken+y 0.15), blur/gray/pixel = размыть/обесцветить/пикселизировать снаружи (invert — внутри, например цензура)
{"op":"adjust","clip":"<id>","brightness":-100..100,"contrast":..,"saturation":..,"exposure":..,"temperature":..,"tint":..,"hue":-180..180,"fade":0..100,"vignette":0..100,"grain":0..100,"blur":0..100}
{"op":"effect","id":"<effectId>","start":сек,"dur":сек,"amt":0..1,"clip":"<id>"?}  — с clip: эффект на клип, без — на дорожку эффектов. Для spotlight (прожектор) можно задать, куда светит: "spotMode":"auto|point|pan","sx":-1..1,"sy":-1..1 (−1 = левый/верхний край), для pan ещё "sx2","sy2" (конечная точка), "size":0.2..3,"soft":0..1,"speed":0..4,"range":0..2
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
  const ta = h('textarea', { id: 'aiInput', placeholder: 'Например: вырежи паузы, добавь субтитры и эффект тряски на 10-й секунде… или нажмите 🎙 и скажите голосом', style: { minHeight: '80px' } });
  const model = h('select', {}, h('option', { value: 'claude-sonnet-5-5' }, 'Sonnet 5.5 (быстро)'), h('option', { value: 'claude-opus-5-5' }, 'Opus 5.5 (умнее)'), h('option', { value: 'claude-haiku-5-5' }, 'Haiku 5.5 (самый быстрый)'));
  model.value = AI.model;
  model.addEventListener('change', () => { AI.model = model.value; saveSetting({ aiModel: model.value }); });
  if (AI.busy) log.append(h('div', { id: 'aiStatus', class: 'aiProg' }));
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
  const vBtn = h('button', { id: 'aiVoiceBtn', title: 'Голосовой ввод: нажмите и говорите, остановится сам, когда замолчите', onclick: () => aiVoiceToggle() }, '🎙');
  const vSend = h('input', { type: 'checkbox' }); vSend.checked = !!SET.aiVoiceSend;
  vSend.addEventListener('change', () => saveSetting({ aiVoiceSend: vSend.checked }));
  p.append(ta, h('div', { id: 'aiVoiceNote', class: 'note', style: { display: 'none', margin: '4px 0 0' } }),
    h('div', { class: 'btnRow', style: { marginTop: '6px', alignItems: 'center' } }, vBtn, h('label', { class: 'capChk', title: 'Отправлять помощнику сразу после распознавания' }, vSend, 'сразу отправлять')));
  p.append(h('div', { class: 'btnRow', style: { marginTop: '6px', alignItems: 'center' } }, model, h('span', { class: 'grow' }),
    AI.history.length ? h('button', { onclick: () => { AI.history = []; setPanel('ai'); } }, 'Очистить') : null, send));
  if (AI.available === false) p.append(h('div', { class: 'note', style: { color: '#ff8a7a' } }, 'Claude Code не найден на компьютере. Установите приложение Claude и войдите в аккаунт.'));
  if (AI.needLogin) p.append(h('div', { class: 'btnRow', style: { marginTop: '8px' } },
    h('button', { class: 'primary', onclick: async () => { try { await api.aiLogin(); AI.needLogin = false; setPanel('ai'); } catch (e) { toast(e.message, 5000); } } }, '🔑 Войти заново')));
  aiDrawProgress();
  aiVoiceDraw();
  if (SET.aiVoicePreload && !AI.voiceWarm) { AI.voiceWarm = true; api.voiceWarm(SET.aiVoiceModel).then(() => { AI.voiceReady = true; }, () => { AI.voiceWarm = false; }); }
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
// ---------- Voice input: microphone (with the settings' noise suppression) -> local Whisper -> text box ----------
// Stops by itself after ~1.5 s of silence once speech was heard (or on the second press, or after a minute).
async function aiVoiceToggle() {
  const v = AI.voice;
  if (v && v.stage === 'rec') { v.stop(); return; }
  if (v) return; // still recognising
  let mic;
  try { mic = await micOpen(); } catch (e) { toast('Нет доступа к микрофону'); return; }
  // the model loads while the user is speaking
  if (!AI.voiceWarm) { AI.voiceWarm = true; api.voiceWarm(SET.aiVoiceModel).then(() => { AI.voiceReady = true; }, () => { AI.voiceWarm = false; }); }
  const chunks = [], rec = new MediaRecorder(mic.stream, { mimeType: 'audio/webm' });
  const st = AI.voice = { stage: 'rec', t0: performance.now(), level: -100, heard: false, quietSince: 0 };
  rec.ondataavailable = (e) => chunks.push(e.data);
  st.stop = () => { if (st.stage !== 'rec') return; st.stage = 'stt'; clearInterval(st.timer); rec.stop(); };
  rec.onstop = async () => {
    mic.close();
    aiVoiceDraw();
    const dur = (performance.now() - st.t0) / 1000;
    try {
      if (!st.heard && dur < 1.2) throw new Error('ничего не услышал');
      const data = await new Blob(chunks, { type: 'audio/webm' }).arrayBuffer();
      const text = (await api.voiceTranscribe({ data, model: SET.aiVoiceModel, language: SET.capLang || 'ru', prompt: SET.capHints || '' })).trim();
      AI.voice = null; AI.voiceReady = true;
      if (!text) { toast('Речь не распознана — попробуйте ещё раз'); aiVoiceDraw(); return; }
      const ta = $('#aiInput');
      const full = ta && ta.value.trim() ? ta.value.trim() + ' ' + text : text;
      if (SET.aiVoiceSend && !AI.busy) { if (ta) ta.value = ''; aiSend(full); return; }
      if (ta) { ta.value = full; ta.focus(); ta.setSelectionRange(full.length, full.length); }
      aiVoiceDraw();
    } catch (e) {
      AI.voice = null; aiVoiceDraw();
      toast('Голосовой ввод: ' + e.message.replace(/^Error invoking remote method '[^']*': (Error: )?/, ''), 5000);
    }
  };
  rec.start();
  st.timer = setInterval(() => {
    const lv = mic.level(), now = performance.now();
    st.level = lv.peak;
    if (lv.rms > -42) { st.heard = true; st.quietSince = 0; }
    else if (st.heard && SET.aiVoiceAuto !== false) { st.quietSince = st.quietSince || now; if (now - st.quietSince > 1500) st.stop(); }
    if (now - st.t0 > 60000) st.stop();
    aiVoiceDraw();
  }, 80);
  aiVoiceDraw();
}
function aiVoiceDraw() {
  const b = $('#aiVoiceBtn'), n = $('#aiVoiceNote'), v = AI.voice;
  if (!b || !n) return;
  b.classList.toggle('recording', !!v && v.stage === 'rec');
  b.disabled = !!v && v.stage === 'stt';
  if (!v) { b.textContent = '🎙'; n.style.display = 'none'; return; }
  n.style.display = '';
  if (v.stage === 'rec') {
    const s = (performance.now() - v.t0) / 1000;
    b.textContent = `⏹ ${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const w = (clamp((v.level + 60) / 60, 0, 1) * 100).toFixed(0);
    n.textContent = '';
    n.append(h('span', { class: 'aiVoiceLvl' }, h('i', { style: { width: w + '%' } })), v.heard ? 'Слушаю… остановлю сам, когда замолчите' : 'Говорите…');
  } else n.textContent = 'Распознаю речь…' + (AI.voiceReady ? '' : ' (первый раз загружается модель — это может занять до минуты)');
}

// ---------- Live progress in the chat: finished steps, current step with a bar, timers ----------
const aiDur = (s) => { s = Math.max(0, Math.round(s)); return s >= 60 ? `${Math.floor(s / 60)} мин ${s % 60} с` : `${s} с`; };
const aiClock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// A new text starts a new step (the previous one goes to the log); pct (0..1) and detail refine the current one
function aiStatus(s, pct = null, detail = '') {
  const now = performance.now();
  if (s !== AI.status) {
    if (AI.status) AI.steps.push({ text: AI.status, sec: (now - AI.stepT0) / 1000 }, ...AI.notes);
    AI.status = s; AI.stepT0 = now; AI.eta = null; AI.notes = [];
  }
  AI.pct = pct; AI.detail = detail;
  aiDrawProgress();
}
// sub-steps (which picture Claude opened, how many phrases were heard) sit under the current step
// Stop at any stage: Claude, speech recognition (ffmpeg + Whisper) and the remaining rounds
function aiStop() {
  if (!AI.busy || AI.stopping) return;
  AI.stopping = true;
  aiDrawProgress();
  api.aiCancel().catch(() => {});
  api.whisperCancel().catch(() => {});
}
function aiNote(text) { AI.notes.push({ text, note: true }); aiDrawProgress(); }
function aiDrawProgress() {
  const el = $('#aiStatus');
  if (!el || !AI.busy) return;
  const now = performance.now();
  const log = el.parentElement, stick = log && log.scrollHeight - log.scrollTop - log.clientHeight < 30;
  el.textContent = '';
  for (const st of AI.steps.slice(-12)) el.append(h('div', { class: 'aiStep' + (st.note ? ' note2' : '') }, st.note ? st.text : `✓ ${st.text}`, st.note ? null : h('span', { class: 'aiT' }, aiDur(st.sec))));
  el.append(h('div', { class: 'aiCur' }, h('span', { class: 'aiSpin' }), AI.status || 'Думаю…', h('span', { class: 'aiT' }, aiDur((now - AI.stepT0) / 1000))));
  if (AI.pct != null) el.append(h('div', { class: 'aiBar' }, h('i', { style: { width: (clamp(AI.pct, 0, 1) * 100).toFixed(1) + '%' } })));
  for (const st of AI.notes.slice(-6)) el.append(h('div', { class: 'aiStep note2' }, st.text));
  const sub = [AI.pct != null ? Math.floor(clamp(AI.pct, 0, 1) * 100) + '%' : '', AI.detail, AI.eta != null ? `осталось ≈ ${aiDur(AI.eta)}` : ''].filter(Boolean).join(' · ');
  if (sub) el.append(h('div', { class: 'aiSub' }, sub));
  el.append(h('div', { class: 'aiSub', style: { display: 'flex', alignItems: 'center' } }, h('span', { style: { flex: 1 } }, `Всего: ${aiDur((now - AI.t0) / 1000)}`),
    h('button', { class: 'aiStop', onclick: aiStop, disabled: AI.stopping }, AI.stopping ? 'Останавливаю…' : '⏹ Остановить')));
  if (stick) log.scrollTop = log.scrollHeight;
}
const aiFileName = (f) => {
  let m;
  if (f === 'now.jpg') return 'кадр под головкой';
  if (f === 'window.jpg') return `раскадровку ±${AI.radius} с вокруг головки`;
  if ((m = /^full_(\d+)/.exec(f))) return `раскадровку всего видео, часть ${+m[1]}${AI.ov ? ' из ' + AI.ov.files.length : ''}`;
  if (/^detail_/.test(f)) return 'подробную раскадровку';
  return f;
};
api.onAiProgress((p) => {
  if (!AI.busy) return;
  if (p.kind === 'read') { aiNote(`👁 Смотрит ${aiFileName(p.file)}`); }
  else if (p.kind === 'text') { const t = p.text.replace(/\s+/g, ' '); if (!/^\s*[{`]/.test(t)) aiStatus(AI.status, null, '💭 ' + (t.length > 160 ? t.slice(0, 160) + '…' : t)); }
  else if (p.kind === 'thinking') aiStatus(AI.status, null, '💭 размышляет…');
});
// Whisper: preparing the sound, loading the model, then how far it has listened
api.onWhisperProgress((p) => {
  if (!AI.busy || !AI.listening) return;
  const L = AI.listening;
  if (p.stage === 'mix') aiStatus(AI.status, 0.1 * (p.total ? p.done / p.total : 0), (p.text || `готовлю звук: ${p.done} из ${p.total}`).replace(/^Сведение звука:/, 'готовлю звук:'));
  else if (p.stage === 'lanes') aiStatus(AI.status, 0.1, (p.text || 'свожу дорожки').toLowerCase());
  else if (p.stage === 'download') aiStatus(AI.status, 0.1, `скачиваю модель распознавания: ${p.pct}%`);
  else if (p.stage === 'model') { aiStatus(AI.status, 0.1, 'загружаю модель распознавания'); L.listenT0 = null; }
  else if (p.stage === 'listen') {
    const now = performance.now();
    if (L.listenT0 == null) L.listenT0 = now;
    const frac = clamp(p.at / Math.max(0.1, p.duration), 0, 1);
    const spent = (now - L.listenT0) / 1000;
    AI.listenEta = frac > 0.02 && spent > 3 ? spent * (1 - frac) / frac : null;
    const said = p.text ? ` · «${p.text.length > 90 ? p.text.slice(0, 90) + '…' : p.text}»` : '';
    aiStatus(AI.status, 0.1 + 0.9 * frac, `прослушано ${aiClock(p.at)} из ${aiClock(p.duration)} (до ${aiClock(L.a + p.at)} на таймлайне)${said}`);
    AI.eta = AI.listenEta;
    aiDrawProgress();
  }
});

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
  // already being built in the background: report its progress to the new caller
  if (AI.ovBuilding && AI.ovBuilding.sig === sig) { if (onProgress) AI.ovBuilding.cb = onProgress; return AI.ovBuilding.promise; }
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
      const sheet = await makeSheet(chunk, { cw: land ? 320 : 150, cols: land ? 6 : 8, label: (t) => fmtS(t), progress: (k) => { const cb = (AI.ovBuilding && AI.ovBuilding.cb) || onProgress; if (cb) cb(i + k, times.length); } });
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


// ---------- Sudden loud moments (from the waveform peaks already computed for the timeline) ----------
// Cheap way to find shots, deaths, hits, screams, beats of a song: onset strength of the audio envelope.
function aiLoud(a, b, trackName) {
  const dur = projectDuration();
  a = clamp(a, 0, dur); b = clamp(b, a + 0.5, dur);
  const n = Math.ceil((b - a) * 100), env = new Float32Array(n), who = new Array(n);
  const tr = trackName ? P().tracks.find((t) => t.name.toLowerCase() === String(trackName).toLowerCase()) : null;
  for (const c of P().clips) {
    if ((c.type !== 'video' && c.type !== 'audio') || c.muted || c.volume <= 0) continue;
    if (tr && c.trackId !== tr.id) continue;
    const t0 = (trackById(c.trackId) || {}); if (t0.muted) continue;
    const pk = (S.cache[c.mediaId] || {}).peaks;
    if (!pk) continue;
    const s = Math.max(a, c.start), e = Math.min(b, c.start + c.dur);
    for (let t = s; t < e; t += 0.01) {
      const i = Math.floor((t - a) * 100), src = Math.floor((c.in + (t - c.start) * c.speed) * 100);
      const v = ((pk[src] || 0) / 255) * Math.min(1.5, c.volume);
      if (i >= 0 && i < n && v > env[i]) { env[i] = v; who[i] = c; }
    }
  }
  const flux = new Float32Array(n);
  for (let i = 1; i < n; i++) flux[i] = Math.max(0, env[i] - env[i - 1]);
  const hits = [];
  let sum = 0; const W = 150; // 1.5 s moving mean on each side
  for (let i = 0; i < Math.min(n, W); i++) sum += flux[i];
  for (let i = 1; i < n - 1; i++) {
    const lo = i - W - 1, hi = i + W;
    if (hi < n) sum += flux[hi];
    if (lo >= 0) sum -= flux[lo];
    const mean = sum / (Math.min(n, hi + 1) - Math.max(0, lo + 1));
    if (flux[i] > mean * 3 + 0.05 && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1]) hits.push({ t: a + i / 100, s: flux[i] / (mean + 0.01), lvl: env[i], c: who[i] });
  }
  // keep the strongest, at least 0.25 s apart, then list by time
  hits.sort((x, y) => y.s - x.s);
  const keep = [];
  for (const hh of hits) { if (keep.length >= 80) break; if (keep.every((k) => Math.abs(k.t - hh.t) > 0.25)) keep.push(hh); }
  if (!keep.length) return 'Резких звуков не найдено (или волна этих клипов ещё не готова).';
  keep.sort((x, y) => x.t - y.t);
  return keep.map((k) => `${k.t.toFixed(2)} с — сила ${k.s.toFixed(1)}, громкость ${(k.lvl * 100).toFixed(0)}%${k.c ? ' (' + clipName(k.c) + ')' : ''}`).join('\n');
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
    const segs = await api.whisper({ audio: items, duration: b - a, language: 'auto', model: 'base', prompt: SET.capHints || '' });
    res = segs.length ? segs.map((s) => `[${(s.start + a).toFixed(1)}–${(s.end + a).toFixed(1)} с] ${s.text}`).join('\n') : 'Речь не распознана (тишина, музыка или шум).';
  }
  AI.speechCache.set(key, res);
  return res;
}
async function aiDetail(a, b, n, onProgress) {
  const dur = projectDuration();
  a = clamp(a, 0, dur); b = clamp(b, a + 0.1, dur);
  const count = clamp(Math.round((b - a) / 0.25), 2, 24);
  const times = [];
  for (let i = 0; i < count; i++) times.push(Math.min(a + ((b - a) * i) / (count - 1), dur - 0.04));
  const sheet = await makeSheet(times, { label: (t) => fmtS(t), progress: onProgress });
  const name = `detail_${n}.jpg`;
  await api.aiSaveFile(name, await toJpeg(sheet));
  requestRender();
  return { name, step: (b - a) / (count - 1), a, b };
}

async function aiSend(text) {
  AI.history.push({ role: 'user', text });
  if (S.playing) pause(); // "здесь" must stay where the user stopped
  AI.busy = true;
  AI.stopping = false;
  AI.steps = []; AI.notes = []; AI.t0 = AI.stepT0 = performance.now(); AI.pct = null; AI.detail = ''; AI.eta = null; AI.listening = null;
  AI.status = `Смотрю кадр и ±${AI.radius} с вокруг головки`;
  const tick = setInterval(aiDrawProgress, 1000);
  setPanel('ai');
  const hist = AI.history.slice(-8, -1).map((m) => `${m.role === 'user' ? 'Пользователь' : 'Помощник'}: ${m.text}`).join('\n');
  let reply;
  try {
    let vis = null, ov = null;
    try { vis = await aiCaptureContext(); } catch (e) { console.warn('ai capture', e); }
    if (SET.aiOverview !== false) try {
      const cached = AI.ov && AI.ov.sig === aiSignature();
      if (!cached) aiStatus('Просматриваю всё видео');
      ov = await aiOverview((i, n) => aiStatus('Просматриваю всё видео', (i + 1) / n, `кадр ${i + 1} из ${n}`));
      if (cached) aiNote('Раскадровка всего видео уже готова');
    } catch (e) { console.warn('ai overview', e); }
    let visText = vis ? `${AI_VISION}\nГоловка стоит на ${S.time.toFixed(1)} с. Раскадровка window.jpg охватывает ${vis.from.toFixed(1)}–${vis.to.toFixed(1)} с.` : '';
    if (ov) visText += `\nРаскадровка всего видео (${ov.dur.toFixed(1)} с): ${ov.files.join(', ')} — ${ov.count} кадров, примерно каждые ${ov.step.toFixed(1)} с.`;
    const base = `${AI_PROTOCOL}\n\n${visText}\n\nКаталоги:\n${aiCatalog()}\n\nСостояние проекта:\n${aiState()}\n\n${hist ? 'Предыдущий диалог:\n' + hist + '\n\n' : ''}Запрос пользователя: ${text}`;
    const extra = [];
    const ROUNDS = 6;
    let j;
    for (let round = 0; round < ROUNDS; round++) {
      if (AI.stopping) throw new Error('остановлено');
      aiStatus(round ? `Claude думает над деталями (раунд ${round + 1} из ${ROUNDS})` : 'Claude думает над запросом');
      const tail = extra.length ? `\n\nДополнительная информация по твоим запросам:\n${extra.join('\n\n')}\n\n${round === ROUNDS - 1 ? 'Теперь выполни запрос. Поле need больше не используй.' : `Если нужно — можешь запросить ещё (осталось запросов: ${ROUNDS - 1 - round}).`}` : '';
      const raw = await api.aiAsk({ prompt: base + tail, model: AI.model });
      try { j = parseAiJson(raw); } catch (_) { j = { reply: raw, ops: [] }; }
      if (!j.need || round === ROUNDS - 1) break;
      const dur = projectDuration();
      const a = clamp(nfin(j.from, vis ? vis.from : 0), 0, dur), b = clamp(nfin(j.to, vis ? vis.to + 2 : dur), 0, dur);
      if (j.need === 'frames') {
        aiStatus(`Разглядываю ${fmtTime(a, P().fps)}–${fmtTime(b, P().fps)} покадрово`);
        const d = await aiDetail(a, b, round + 1, (i, n) => aiStatus(AI.status, (i + 1) / n, `кадр ${i + 1} из ${n}`));
        extra.push(`Подробная раскадровка ${a.toFixed(1)}–${b.toFixed(1)} с: файл ${d.name} (кадры каждые ${d.step.toFixed(2)} с, подписано время).`);
      } else if (j.need === 'loud') {
        aiStatus(`Ищу резкие звуки ${fmtTime(a, P().fps)}–${fmtTime(b, P().fps)}`);
        const res = aiLoud(a, b, j.track);
        aiNote(`🔊 Найдено моментов: ${res.startsWith('Резких') ? 0 : res.split('\n').length}`);
        extra.push(`Резкие звуки ${a.toFixed(1)}–${b.toFixed(1)} с${j.track ? ' (дорожка ' + j.track + ')' : ''}, время таймлайна:\n${res}`);
      } else if (j.need === 'speech') {
        const capped = b - a > 600;
        const b2 = capped ? a + 600 : b;
        aiStatus(`Слушаю речь ${fmtTime(a, P().fps)}–${fmtTime(b2, P().fps)}`, 0, 'подготовка');
        AI.listening = { a, b: b2 };
        let said;
        try { said = await aiSpeech(a, b2); } finally { AI.listening = null; }
        if (capped) said += `\n(Прослушаны только первые 10 минут запрошенного отрезка ${a.toFixed(0)}–${b.toFixed(0)} с. Для поиска событий используй loud.)`;
        const lines = said.split('\n').filter((l) => l.startsWith('[')).length;
        aiNote(lines ? `🎧 Распознано фраз: ${lines}` : `🎧 ${said}`);
        extra.push(`Расшифровка речи ${a.toFixed(1)}–${b2.toFixed(1)} с (время таймлайна):\n${said}`);
      } else break;
    }
    if (AI.stopping) throw new Error('остановлено');
    const ops = Array.isArray(j.ops) ? j.ops : [];
    if (ops.length) aiStatus(`Применяю изменения: ${ops.length} шт.`);
    const res = ops.length ? await runOps(ops) : { done: 0, errors: [] };
    reply = (j.reply || 'Готово.') + (res.errors.length ? `\n\n⚠ Не выполнено: ${res.errors.join('; ')}` : '');
  } catch (e) {
    const msg = e.message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
    if (/OAuth|authenticat|login|401|session expired/i.test(msg)) {
      AI.needLogin = true;
      reply = 'Вход в Claude истёк — помощнику нужно войти заново. Нажмите «Войти заново» ниже, в открывшемся окне наберите /login и войдите в браузере, затем повторите запрос.';
    } else if (AI.stopping) reply = '⏹ Остановлено. Ничего не изменено.';
    else reply = 'Ошибка: ' + msg;
  }
  clearInterval(tick);
  AI.busy = false; AI.status = ''; AI.listening = null; AI.stopping = false;
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
    case 'place': {
      const from = nfin(o.from, NaN), to = nfin(o.to, NaN), at = Math.max(0, nfin(o.at, S.time));
      if (!(to > from)) throw new Error('place: нужен отрезок from < to');
      const main = pr.tracks.find((t) => t.main);
      const vis = (c) => (c.type === 'video' || c.type === 'image') && c.start < to && c.start + c.dur > from;
      let src = pr.clips.filter((c) => c.trackId === main.id && vis(c));
      if (!src.length) src = pr.clips.filter((c) => vis(c) && KIND_OF[c.type] === 'video');
      if (!src.length) throw new Error(`place: на ${from.toFixed(1)}–${to.toFixed(1)} с нет видео`);
      const tr = freeTrack('video', at, to - from).id;
      for (const c of src) {
        const s = Math.max(from, c.start), e = Math.min(to, c.start + c.dur);
        const n = cloneClip(c);
        n.start = at + (s - from); n.dur = e - s; n.trackId = tr;
        if (n.in != null && n.freeze == null) n.in = c.in + (s - c.start) * c.speed;
        delete n.trans; delete n.link; delete n.linkAt;
        pr.clips.push(n);
      }
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
    case 'mask': {
      const c = needClip(o.clip);
      if (!c.mask) throw new Error('маска только для видео и фото');
      if (o.type && !MASK_SHAPES.find((m) => m.id === o.type)) throw new Error('нет маски ' + o.type);
      if (o.mode && !MASK_MODES.find(([id]) => id === o.mode)) throw new Error('нет режима маски ' + o.mode);
      c.mask = { ...MASK_DEFAULT, ...c.mask };
      for (const k of Object.keys(MASK_DEFAULT)) if (o[k] != null) c.mask[k] = o[k];
      return;
    }
    case 'adjust': { const c = needClip(o.clip); if (!c.adj) throw new Error('клип не поддерживает коррекцию'); for (const k of Object.keys(ADJUST_DEFAULT)) if (o[k] != null) c.adj[k] = o[k]; return; }
    case 'effect': {
      if (!EFFECTS.find((f) => f.id === o.id)) throw new Error('нет эффекта ' + o.id);
      const fx = { id: o.id, amt: nfin(o.amt, 0.6) };
      if (o.id === 'spotlight') for (const k of Object.keys(SPOT_DEFAULT)) if (o[k] != null) fx[k] = o[k];
      if (o.clip) { const c = needClip(o.clip); c.fxList = c.fxList || []; c.fxList.push(fx); return; }
      const st = nfin(o.start, S.time), dur = nfin(o.dur, 3);
      const tr = freeTrack('fx', st, dur, (pr.tracks.find((x) => x.kind === 'fx') || {}).id);
      const c = makeClip('fx', { start: st, dur, trackId: tr.id }); c.fx = fx; pr.clips.push(c);
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
