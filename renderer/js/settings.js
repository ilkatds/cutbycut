'use strict';
// ============ Settings ============
const SET_DEFAULTS = {
  lang: 'ru', theme: 'cream', uiScale: 1,
  startMode: 'ask', lookAccent: '', lookFont: '', lookFontSize: 12.5, lookRadius: 14, lookGap: 8, lookDensity: 'normal', lookAnim: true, lookAnimSpeed: 1, lookShadow: true, lookColors: {},
  railPos: 'left', railLabels: true, railWidth: 66, topbarPos: 'top', tlToolbarPos: 'top', transportPos: 'bottom', tlHeadPos: 'left', trackScale: 1, layouts: {}, layoutsSaved: [], uiItems: {},
  uiV: 0, autosaveSec: 30, versionsKeep: 20, projectsDir: '', exportDir: '', showStart: true, tourDone: false,
  previewQ: 0.75, useProxy: true, proxyMinDur: 90, scrubAudio: false,
  recCountdown: 3, recBeep: true,
  micId: '', micNoise: 'off', micGate: 0, micHighpass: true, micEcho: false, micAgc: false, micGain: 0,
  magnet: true, snap: true, imageDur: 4, textDur: 3, transDur: 0.5, defaultZoom: 60,
  expRes: 1080, expFps: 30, expQuality: 'rec', expCodec: 'h264', expEncoder: 'auto', expSpeed: 'medium', expNameTpl: '{project}', expAfter: 'folder', expNotify: true, expCredits: true,
  aiModel: 'claude-sonnet-5-5', aiRadius: 10, aiOverview: true, aiVoiceModel: 'small', aiVoiceAuto: true, aiVoiceSend: false, aiVoicePreload: false,
  capLang: 'ru', capModel: 'small', capWords: 5, capDict: [], capHints: '',
  bgMode: 'local', bgModel: '', removeBgKey: '', pixabayKey: '', pexelsKey: '', freesoundKey: '',
  keys: {}, recent: [], textPresets: [], lookPresets: [],
};
let SET = { ...SET_DEFAULTS };
async function loadSettings() {
  SET = { ...SET_DEFAULTS, ...(await api.settingsGet()) };
  // first start after the move to CutByCut: the new cream look replaces the old default theme
  if (SET.uiV < 2) { SET.uiV = 2; SET.theme = 'cream'; api.settingsSet({ uiV: 2, theme: 'cream' }); }
  return SET;
}
function saveSetting(patch) { Object.assign(SET, patch); return api.settingsSet(patch); }

// Apply everything that has a live effect
function applySettings() {
  applyLook();
  api.setZoom(clamp(+SET.uiScale || 1, 0.7, 1.6));
  S.previewScale = +SET.previewQ || 0.75;
  const pq = $('#previewQ'); if (pq) pq.value = String(S.previewScale);
  applyModeFlags();
  S.useProxy = SET.useProxy !== false;
  for (const [id, key] of [['magnet', 'magnet'], ['snap', 'snap'], ['scrubAudio', 'scrubAudio']]) { const el = $('#' + id); if (el) el.checked = !!SET[key]; }
  if (typeof AI !== 'undefined') { AI.model = SET.aiModel; AI.radius = +SET.aiRadius || 10; }
  S.exportPrefs = { res: SET.expRes, fps: SET.expFps, quality: SET.expQuality, codec: SET.expCodec, encoder: SET.expEncoder, speed: SET.expSpeed };
  clearInterval(applySettings._as);
  applySettings._as = setInterval(autosave, Math.max(10, +SET.autosaveSec || 30) * 1000);
  requestRender();
}

// ---------- Hotkeys that can be re-bound ----------
const ACTIONS = [
  ['play', 'Воспроизведение / пауза', 'Space'], ['split', 'Разделить', 'Ctrl+B'], ['splitLeft', 'Удалить слева от головки', 'Q'], ['splitRight', 'Удалить справа от головки', 'W'],
  ['delete', 'Удалить', 'Delete'], ['rippleDelete', 'Удалить со сдвигом', 'Shift+Delete'], ['duplicate', 'Дублировать', 'Ctrl+D'], ['undo', 'Отменить', 'Ctrl+Z'], ['redo', 'Повторить', 'Ctrl+Y'],
  ['marker', 'Маркер', 'M'], ['zoomIn', 'Приблизить таймлайн', '='], ['zoomOut', 'Отдалить таймлайн', '-'], ['zoomFit', 'Вместить таймлайн', 'Shift+Z'],
  ['save', 'Сохранить проект', 'Ctrl+S'], ['open', 'Открыть проект', 'Ctrl+O'], ['export', 'Экспорт', 'Ctrl+E'], ['fullscreen', 'Полный экран', 'F'],
  ['ai', 'ИИ-помощник', 'Ctrl+K'], ['aiVoice', 'Голосовой ввод помощнику', ''], ['silence', 'Вырезать паузы', ''], ['sync', 'Синхронизация', ''], ['freeze', 'Стоп-кадр', ''], ['detachAudio', 'Отделить аудио', ''],
  ['uiEditor', 'Редактор интерфейса', ''], ['help', 'Руководство', 'F1'], ['settings', 'Настройки', 'Ctrl+,'],
];
function comboOf(e) {
  const k = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(k)) return '';
  return [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.shiftKey ? 'Shift' : '', e.altKey ? 'Alt' : '', k].filter(Boolean).join('+');
}
// returns true when a custom binding handled the key
function customKey(e) {
  const combo = comboOf(e);
  if (!combo) return false;
  for (const [id, , def] of ACTIONS) {
    const bound = SET.keys[id] != null ? SET.keys[id] : null;
    if (bound && bound === combo) { e.preventDefault(); cmd(id); return true; }
    if (!bound && (id === 'help' || id === 'settings') && def === combo) { e.preventDefault(); cmd(id); return true; }
  }
  return false;
}

// ---------- Microphone test in the settings (stops by itself once the tab is gone) ----------
const micState = { mic: null, listen: false, raw: false, token: 0 };
const micTabOpen = (meter) => meter.el.isConnected && !$('#modal').classList.contains('hidden');
async function micTestStart(meter, status) {
  const token = ++micState.token;
  if (micState.mic) { micState.mic.close(); micState.mic = null; }
  let mic;
  try { mic = await micOpen(); } catch (e) { status.textContent = 'Нет доступа к микрофону: ' + e.message; return; }
  if (token !== micState.token || !micTabOpen(meter)) { mic.close(); return; }
  micState.mic = mic;
  mic.monitor(micState.listen, micState.raw);
  status.textContent = 'Работает: ' + (mic.label || 'микрофон по умолчанию');
  const loop = () => {
    if (micState.mic !== mic) return;
    if (!micTabOpen(meter)) { mic.close(); micState.mic = null; micState.listen = false; return; }
    meter.set(mic.level());
    requestAnimationFrame(loop);
  };
  loop();
}

// ---------- Settings window ----------
const fmtBytes = (b) => (b > 1e9 ? (b / 1e9).toFixed(2) + ' ГБ' : b > 1e6 ? (b / 1e6).toFixed(0) + ' МБ' : (b / 1e3).toFixed(0) + ' КБ');
let setTab = 'general';
function openSettings(tab) {
  if (tab) setTab = tab;
  openModal((box) => {
    box.style.width = '900px'; box.style.maxWidth = '94vw'; box.style.padding = '0';
    const tabs = [['general', '⚙ Общие'], ['look', '🎨 Внешний вид'], ['layout', '⊞ Раскладка'], ['preview', '▶ Превью'], ['timeline', '▤ Таймлайн'], ['export', '⇪ Экспорт'], ['ai', '✨ ИИ-помощник'], ['mic', '🎙 Микрофон'], ['captions', '≣ Субтитры и фон'], ['online', '🌐 Онлайн-каталог'], ['keys', '⌨ Горячие клавиши'], ['storage', '🗄 Хранилище'], ['about', 'ℹ О программе']];
    const nav = h('div', { style: { width: '210px', borderRight: '1px solid var(--line)', padding: '14px 8px', display: 'flex', flexDirection: 'column', gap: '2px', flex: 'none' } });
    const body = h('div', { style: { flex: 1, padding: '18px 22px', overflowY: 'auto', maxHeight: '78vh' } });
    for (const [id, n] of tabs) nav.append(h('button', { class: 'ghost' + (setTab === id ? ' on' : ''), style: { textAlign: 'left', padding: '8px 10px' }, onclick: () => { setTab = id; openSettings(); } }, n));
    box.append(h('div', { style: { display: 'flex', minHeight: '520px' } }, nav, body));
    const row = (label, ctl, note) => { body.append(h('div', { class: 'row', style: { gridTemplateColumns: '220px 1fr' } }, h('label', {}, label), ctl)); if (note) body.append(h('div', { class: 'note', style: { margin: '-2px 0 10px 226px' } }, note)); };
    const sel = (key, opts, after) => { const s = h('select', {}, ...opts.map(([v, n]) => h('option', { value: v }, n))); s.value = String(SET[key]); s.addEventListener('change', async () => { const v = typeof SET_DEFAULTS[key] === 'number' ? +s.value : s.value; await saveSetting({ [key]: v }); applySettings(); if (after) after(v); }); return s; };
    const chk = (key, after) => { const i = h('input', { type: 'checkbox' }); i.checked = !!SET[key]; i.addEventListener('change', async () => { await saveSetting({ [key]: i.checked }); applySettings(); if (after) after(i.checked); }); return h('div', {}, i); };
    const num = (key, min, max, step = 1) => { const i = h('input', { type: 'number', min, max, step, value: SET[key], style: { width: '90px' } }); i.addEventListener('change', async () => { await saveSetting({ [key]: clamp(+i.value, min, max) }); applySettings(); }); return i; };
    const txt = (key, ph, pw) => { const i = h('input', { type: pw ? 'password' : 'text', value: SET[key] || '', placeholder: ph || '', style: { width: '100%' } }); i.addEventListener('change', () => saveSetting({ [key]: i.value.trim() })); return i; };
    const dir = (key) => {
      const lbl = h('span', { class: 'note', style: { margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, SET[key] || 'по умолчанию');
      return h('div', { class: 'panelBar', style: { margin: 0 } }, lbl, h('button', { onclick: async () => { const d = await api.pickDir(SET[key]); if (d) { await saveSetting({ [key]: d }); lbl.textContent = d; } } }, 'Выбрать…'), h('button', { onclick: async () => { await saveSetting({ [key]: '' }); lbl.textContent = 'по умолчанию'; } }, 'Сброс'));
    };
    // live sliders and colours for the look: they apply while dragging
    const slide = (key, min, max, step, unit = '') => { const v = h('span', { class: 'note', style: { margin: 0, width: '46px' } }, SET[key] + unit); const i = h('input', { type: 'range', min, max, step, value: SET[key], style: { flex: 1 } }); i.addEventListener('input', () => { SET[key] = +i.value; v.textContent = i.value + unit; applyLook(); layoutStage(); }); i.addEventListener('change', () => { saveSetting({ [key]: +i.value }); TL.render(); }); return h('div', { class: 'panelBar', style: { margin: 0 } }, i, v); };
    const pickColor = (get, set, def) => { const i = h('input', { type: 'color', value: get() || def }); i.addEventListener('input', () => set(i.value)); return h('div', { class: 'panelBar', style: { margin: 0 } }, i, h('button', { onclick: () => { set(''); openSettings(); } }, 'Сброс')); };
    const relayout = () => { layoutStage(); TL.render(); };
    const title = (s) => body.append(h('h2', { style: { margin: '0 0 14px' } }, s));
    const sub = (s) => body.append(h('h4', { style: { margin: '18px 0 8px', color: 'var(--dim)', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '.5px' } }, s));
    switch (setTab) {
      case 'general':
        title('Общие');
        row('Язык интерфейса', sel('lang', LANGS.map((l) => [l.code, l.name]), (v) => setLanguage(v)));
        row('Масштаб интерфейса', sel('uiScale', [[0.8, '80%'], [0.9, '90%'], [1, '100%'], [1.1, '110%'], [1.25, '125%'], [1.5, '150%']]));
        sub('Проекты');
        row('Автосохранение каждые, с', num('autosaveSec', 10, 600));
        row('Хранить резервных версий', num('versionsKeep', 0, 200), 'Каждое сохранение и автосохранение кладёт копию проекта в историю версий (Файл → «Версии проекта»).');
        row('Папка проектов', dir('projectsDir'));
        row('При запуске', sel('startMode', [['ask', 'Спрашивать, какой редактор открыть'], ...Object.entries(MODES).map(([m, d]) => [m, 'Сразу: ' + d.name])]));
        row('Экскурсия по программе', h('div', {}, h('button', { onclick: () => { closeModal(); startTour(); } }, 'Пройти ещё раз')));
        break;
      case 'look': {
        title('Внешний вид');
        row('Тема', sel('theme', [['cream', 'Кремовая'], ['cocoa', 'Какао (тёмная)'], ['light', 'Светлая'], ['dark', 'Графит'], ['contrast', 'Высокий контраст']], () => { SET.lookColors = {}; saveSetting({ lookColors: {} }); applyLook(); relayout(); openSettings(); }));
        row('Цвет акцента', pickColor(() => SET.lookAccent, (v) => { SET.lookAccent = v; saveSetting({ lookAccent: v }); applyLook(); relayout(); }, getComputedStyle(document.body).getPropertyValue('--accent').trim()));
        row('Шрифт', sel('lookFont', [['', 'Segoe UI'], ['Bahnschrift', 'Bahnschrift'], ['Calibri', 'Calibri'], ['Candara', 'Candara'], ['Corbel', 'Corbel'], ['Verdana', 'Verdana'], ['Trebuchet MS', 'Trebuchet MS'], ['Georgia', 'Georgia'], ['Consolas', 'Consolas']]));
        row('Размер текста', slide('lookFontSize', 10, 17, 0.5, ' px'));
        row('Масштаб интерфейса', sel('uiScale', [[0.8, '80%'], [0.9, '90%'], [1, '100%'], [1.1, '110%'], [1.25, '125%'], [1.5, '150%']]));
        row('Плотность', sel('lookDensity', [['dense', 'Компактно'], ['normal', 'Обычно'], ['comfy', 'Просторно']]));
        sub('Формы');
        row('Скругление панелей', slide('lookRadius', 0, 28, 1, ' px'));
        row('Отступы между панелями', slide('lookGap', 0, 24, 1, ' px'));
        row('Мягкие тени', chk('lookShadow'));
        sub('Движение');
        row('Анимации', chk('lookAnim'));
        row('Скорость анимаций', slide('lookAnimSpeed', 0.25, 3, 0.25, '×'));
        sub('Свои цвета');
        for (const [k, n] of LOOK_COLORS) row(n, pickColor(() => (SET.lookColors || {})[k], (v) => { const c = { ...(SET.lookColors || {}) }; if (v) c[k] = v; else delete c[k]; SET.lookColors = c; saveSetting({ lookColors: c }); applyLook(); relayout(); }, getComputedStyle(document.body).getPropertyValue(k).trim()));
        body.append(h('div', { class: 'btnRow', style: { marginTop: '10px' } }, h('button', { onclick: async () => { const d = {}; for (const k of ['theme', 'lookAccent', 'lookFont', 'lookFontSize', 'lookRadius', 'lookGap', 'lookDensity', 'lookAnim', 'lookAnimSpeed', 'lookShadow', 'lookColors']) d[k] = SET_DEFAULTS[k]; await saveSetting(d); applySettings(); relayout(); openSettings(); } }, 'Вернуть всё как было')));
        break;
      }
      case 'layout':
        title('Раскладка');
        body.append(h('div', { class: 'note' }, 'Здесь задаётся положение частей окна. Панели и кнопки можно расставить руками в редакторе интерфейса. У каждого редактора раскладка своя.'));
        body.append(h('div', { class: 'btnRow', style: { marginBottom: '12px' } }, h('button', { class: 'primary', onclick: () => { closeModal(); UIED.open(); } }, '⊞ Открыть редактор интерфейса')));
        row('Готовая раскладка', (() => { const s = h('select', {}, h('option', { value: '' }, 'Выбрать…'), ...LAYOUT_PRESETS[curMode()].map(([id, n]) => h('option', { value: id }, n))); s.addEventListener('change', () => { if (s.value) setTree(presetTree(curMode(), s.value)); }); return s; })());
        row('Верхняя панель', sel('topbarPos', [['top', 'Сверху'], ['bottom', 'Снизу']], relayout));
        row('Вкладки материалов', sel('railPos', [['left', 'Слева'], ['right', 'Справа'], ['top', 'Сверху'], ['bottom', 'Снизу']], relayout));
        row('Подписи вкладок', chk('railLabels', relayout));
        row('Ширина вкладок', slide('railWidth', 44, 110, 2, ' px'));
        row('Кнопки плеера', sel('transportPos', [['bottom', 'Снизу'], ['top', 'Сверху']], relayout));
        row('Кнопки таймлайна', sel('tlToolbarPos', [['top', 'Сверху'], ['bottom', 'Снизу']], relayout));
        row('Названия дорожек', sel('tlHeadPos', [['left', 'Слева'], ['right', 'Справа']], relayout));
        row('Высота дорожек', slide('trackScale', 0.6, 2, 0.1, '×'));
        body.append(h('div', { class: 'btnRow', style: { marginTop: '10px' } }, h('button', { onclick: async () => { const layouts = { ...SET.layouts }, uiItems = { ...SET.uiItems }; delete layouts[curMode()]; delete uiItems[curMode()]; await saveSetting({ layouts, uiItems }); SET.layouts = layouts; SET.uiItems = uiItems; ensureTree(); applyUiItems(); renderDock(true); } }, 'Сбросить раскладку этого редактора')));
        break;
      case 'preview':
        title('Превью');
        row('Качество превью', sel('previewQ', [[0.5, '½ — быстрее'], [0.75, '¾ — рекомендуется'], [1, 'Полное']]));
        row('Прокси для плавного превью', chk('useProxy'), 'Лёгкая копия длинных и 60-кадровых видео: перемотка мгновенная, без артефактов. Экспорт всегда из оригинала.');
        row('Создавать прокси для видео длиннее, с', num('proxyMinDur', 0, 3600));
        row('Звук при перемотке', chk('scrubAudio'));
        break;
      case 'timeline':
        title('Таймлайн');
        row('Магнит главной дорожки', chk('magnet'));
        row('Привязка к краям и маркерам', chk('snap'));
        row('Длительность фото, с', num('imageDur', 0.5, 60, 0.5));
        row('Длительность текста и стикеров, с', num('textDur', 0.5, 60, 0.5));
        row('Длительность перехода, с', num('transDur', 0.1, 3, 0.1));
        row('Масштаб таймлайна при открытии', sel('defaultZoom', [[20, 'Мелко'], [60, 'Средне'], [150, 'Крупно']]));
        sub('Запись голоса');
        row('Отсчёт перед записью', sel('recCountdown', [[0, 'Без отсчёта'], [1, '1 секунда'], [2, '2 секунды'], [3, '3 секунды'], [5, '5 секунд'], [10, '10 секунд'], [15, '15 секунд'], [20, '20 секунд'], [30, '30 секунд']]), 'После нажатия 🎙 на превью идёт обратный отсчёт, запись начинается на нуле. Повторное нажатие 🎙 или Esc отменяет.');
        row('Звуковой сигнал отсчёта', chk('recBeep'), 'Короткий писк каждую секунду и высокий — в момент начала записи. В запись он не попадает.');
        break;
      case 'export': {
        title('Экспорт');
        row('Разрешение по умолчанию', sel('expRes', [[480, '480p'], [720, '720p'], [1080, '1080p'], [1440, '1440p'], [2160, '4K']]));
        row('Кадров в секунду', sel('expFps', [[24, '24'], [25, '25'], [30, '30'], [50, '50'], [60, '60']]));
        row('Качество', sel('expQuality', [['low', 'Небольшой файл'], ['rec', 'Рекомендуемое'], ['high', 'Высокое'], ['max', 'Максимальное']]));
        row('Формат', sel('expCodec', [['h264', 'MP4 H.264'], ['hevc', 'MP4 H.265'], ['gif', 'GIF']]));
        const encSel = sel('expEncoder', [['auto', 'Автоматически (видеокарта, если есть)'], ['cpu', 'Процессор (x264/x265)']]);
        row('Кодировщик', encSel, 'Видеокарта (AMD AMF / NVIDIA NVENC / Intel QSV) кодирует в разы быстрее процессора.');
        api.encoders().then((list) => { for (const e of list) encSel.append(h('option', { value: e }, e.replace('_amf', ' (AMD)').replace('_nvenc', ' (NVIDIA)').replace('_qsv', ' (Intel)'))); encSel.value = SET.expEncoder; });
        row('Скорость кодирования (процессор)', sel('expSpeed', [['ultrafast', 'Максимальная'], ['veryfast', 'Быстрая'], ['fast', 'Повыше среднего'], ['medium', 'Средняя'], ['slow', 'Медленная — меньше файл']]));
        row('Шаблон имени файла', txt('expNameTpl', '{project} {date}'), 'Можно использовать {project}, {date}, {time}, {res}, {fps}.');
        row('Папка для видео', dir('exportDir'));
        row('После экспорта', sel('expAfter', [['folder', 'Показать в папке'], ['play', 'Открыть видео'], ['phone', 'Отправить на телефон'], ['none', 'Ничего']]));
        row('Уведомление Windows по окончании', chk('expNotify'));
        row('Сохранять список авторов (credits)', chk('expCredits'), 'Для материалов из онлайн-каталога с лицензией CC BY рядом с видео создаётся текстовый файл с авторами.');
        break;
      }
      case 'ai':
        title('ИИ-помощник');
        row('Модель', sel('aiModel', [['claude-sonnet-5-5', 'Sonnet 5.5 — быстро'], ['claude-opus-5-5', 'Opus 5.5 — умнее'], ['claude-haiku-5-5', 'Haiku 5.5 — самый быстрый']]));
        row('Смотреть вокруг головки', sel('aiRadius', [[5, '±5 с'], [10, '±10 с'], [20, '±20 с'], [30, '±30 с']]));
        row('Видеть всё видео целиком', chk('aiOverview'), 'Раскадровка всего ролика готовится заранее и обновляется после изменений.');
        sub('Голосовой ввод');
        row('Качество распознавания', sel('aiVoiceModel', [['base', 'Быстрое (base)'], ['small', 'Хорошее (small) — рекомендуется'], ['medium', 'Точное (medium, медленно)']]), 'Распознаёт Whisper на вашем компьютере, интернет не нужен. Язык и подсказки (имена, английские слова) — как у субтитров. Микрофон и шумоподавление — во вкладке «Микрофон».');
        row('Останавливать, когда замолчите', chk('aiVoiceAuto'), 'Иначе — второе нажатие 🎙.');
        row('Сразу отправлять помощнику', chk('aiVoiceSend'), 'Выключено — текст появится в поле, его можно поправить и отправить Enter.');
        row('Готовить распознавание заранее', chk('aiVoicePreload'), 'Модель загружается при открытии помощника — первая фраза распознаётся быстрее, но занимает память. Без этого модель загружается при первом нажатии 🎙 и держится 10 минут.');
        break;
      case 'captions':
        title('Субтитры и удаление фона');
        sub('Автосубтитры');
        row('Язык речи', sel('capLang', [['ru', 'Русский'], ['uk', 'Українська'], ['en', 'English'], ['pl', 'Polski'], ['de', 'Deutsch'], ['auto', 'Автоопределение']]));
        row('Качество распознавания', sel('capModel', [['tiny', 'Черновик'], ['base', 'Быстрое'], ['small', 'Хорошее'], ['medium', 'Точное (медленно)']]));
        row('Слов в строке', num('capWords', 1, 20));
        sub('Удаление фона');
        row('Режим', sel('bgMode', [['local', 'Нейросеть на ПК'], ['api', 'API remove.bg']]));
        row('API-ключ remove.bg', txt('removeBgKey', 'ключ с remove.bg', true));
        break;
      case 'mic': {
        title('Микрофон');
        // a live test chain runs while this tab is open: meter + optional monitoring in the headphones
        const meter = micMeter(), status = h('div', { class: 'note', style: { margin: '4px 0 0' } }, 'Подключаю микрофон…');
        const monBtn = h('button', {}, micState.listen ? '⏹ Перестать слушать' : '🎧 Слушать себя');
        const rawSeg = h('div', { class: 'seg' });
        const drawSeg = () => { rawSeg.textContent = ''; for (const [v, n] of [[false, 'С обработкой'], [true, 'Без обработки']]) rawSeg.append(h('button', { class: micState.raw === v ? 'on' : '', onclick: () => { micState.raw = v; drawSeg(); if (micState.mic) micState.mic.monitor(micState.listen, micState.raw); } }, n)); };
        drawSeg();
        monBtn.addEventListener('click', () => { micState.listen = !micState.listen; monBtn.textContent = micState.listen ? '⏹ Перестать слушать' : '🎧 Слушать себя'; if (micState.mic) micState.mic.monitor(micState.listen, micState.raw); });
        const restart = () => micTestStart(meter, status);
        const devSel = h('select', {}, h('option', { value: '' }, 'По умолчанию (как в Windows)'));
        devSel.addEventListener('change', async () => { await saveSetting({ micId: devSel.value }); restart(); });
        micDevices().then((list) => {
          for (const d of list) devSel.append(h('option', { value: d.deviceId }, d.label || 'Микрофон'));
          if (SET.micId && !list.some((d) => d.deviceId === SET.micId)) devSel.append(h('option', { value: SET.micId }, '(выбранный микрофон отключён)'));
          devSel.value = SET.micId || '';
        }).catch(() => {});
        row('Устройство', h('div', { class: 'panelBar', style: { margin: 0 } }, devSel, h('button', { title: 'Обновить список', onclick: () => openSettings() }, '⟳')));
        sub('Проверка');
        body.append(meter.el, status);
        row('Предпрослушивание', h('div', { class: 'panelBar', style: { margin: 0 } }, monBtn, rawSeg), 'Наденьте наушники — через колонки звук зациклится. «Без обработки» — чтобы сравнить, сколько шума убирается.');
        sub('Обработка');
        row('Шумоподавление', sel('micNoise', MIC_NOISE, restart), 'Нейросети убирают клавиатуру, вентилятор, улицу и оставляют только голос. GTCRN чище, RNNoise легче для процессора.');
        row('Шумовой порог', sel('micGate', [[0, 'Выключен'], [-65, '−65 дБ (очень тихо)'], [-55, '−55 дБ'], [-48, '−48 дБ'], [-42, '−42 дБ'], [-36, '−36 дБ'], [-30, '−30 дБ (только громко)']], restart), 'Всё тише порога заглушается полностью. Белая метка на шкале — где сейчас порог: говорите, и полоса должна заходить за неё.');
        row('Убрать низкий гул', chk('micHighpass', restart), 'Срезает гул ниже 90 Гц: сеть, вибрация стола, ветер.');
        row('Подавление эха', chk('micEcho', restart), 'Нужно только при записи через колонки. Портит качество голоса («как по телефону») — в наушниках держите выключенным.');
        row('Автогромкость', chk('micAgc', restart), 'Сама выравнивает громкость, но может «качать» уровень.');
        row('Усиление', sel('micGain', [[-6, '−6 дБ'], [0, '0 дБ'], [3, '+3 дБ'], [6, '+6 дБ'], [10, '+10 дБ'], [15, '+15 дБ'], [20, '+20 дБ']], restart));
        body.append(h('div', { class: 'note' }, 'Эти настройки применяются к записи голоса (🎙 на панели таймлайна).'));
        restart();
        break;
      }
      case 'online':
        title('Онлайн-каталог');
        body.append(h('div', { class: 'note' }, 'Звуки, музыка и картинки из Openverse работают без ключа (сервис иногда отвечает медленно). Для видео-футажей нужен бесплатный ключ Pixabay и/или Pexels: зарегистрируйтесь на сайте и вставьте ключ сюда.'));
        row('Ключ Pixabay', txt('pixabayKey', 'pixabay.com/api/docs', true));
        row('Ключ Pexels', txt('pexelsKey', 'pexels.com/api', true));
        row('Ключ Freesound (звуки)', txt('freesoundKey', 'freesound.org/apiv2/apply', true), 'Необязательно: добавляет в поиск звуков библиотеку Freesound (только CC0 и CC BY).');
        break;
      case 'keys': {
        title('Горячие клавиши');
        body.append(h('div', { class: 'note' }, 'Нажмите на сочетание и затем новую клавишу. Esc — отмена, Backspace — вернуть по умолчанию.'));
        for (const [id, name, def] of ACTIONS) {
          const cur = SET.keys[id] != null ? SET.keys[id] : def;
          const b = h('button', { style: { minWidth: '140px', fontFamily: 'Consolas, monospace' } }, cur || '—');
          b.addEventListener('click', () => {
            b.textContent = 'нажмите клавишу…';
            const on = async (e) => {
              e.preventDefault(); e.stopPropagation();
              if (e.key === 'Escape') { b.textContent = cur || '—'; }
              else if (e.key === 'Backspace') { const k = { ...SET.keys }; delete k[id]; await saveSetting({ keys: k }); b.textContent = def || '—'; }
              else { const c = comboOf(e); if (!c) return; await saveSetting({ keys: { ...SET.keys, [id]: c } }); b.textContent = c; }
              window.removeEventListener('keydown', on, true);
            };
            window.addEventListener('keydown', on, true);
          });
          row(name, b);
        }
        break;
      }
      case 'storage': {
        title('Хранилище');
        const info = h('div', { class: 'note' }, 'Подсчёт…');
        body.append(info);
        api.storageInfo().then((s) => {
          info.innerHTML = '';
          const line = (n, v, what) => info.append(h('div', { class: 'row', style: { gridTemplateColumns: '220px 120px 1fr' } }, h('label', {}, n), h('span', {}, fmtBytes(v)), what ? h('div', {}, h('button', { onclick: async () => { if ((await api.confirm('Очистить? Файлы создадутся заново при необходимости.', ['Очистить', 'Отмена'])) === 0) { await api.storageClear(what); openSettings(); } } }, 'Очистить')) : h('span')));
          line('Прокси-копии видео', s.proxies, 'proxies');
          line('Временные файлы', s.temp, 'temp');
          line('Версии проектов', s.versions);
          line('Скачанные материалы', s.downloads);
        });
        break;
      }
      case 'about':
        title('О программе');
        body.append(h('div', { style: { fontSize: '30px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' } }, h('img', { src: 'logo.svg', style: { width: '40px', height: '40px' } }), 'CutByCut'));
        body.append(h('div', { class: 'note', style: { fontSize: '13px', lineHeight: 1.7 } }, 'Видео, аудио и фото в одном бесплатном редакторе. Версия 2.0.', h('br'), 'Видео: FFmpeg · Субтитры: Whisper · Удаление фона: rembg · ИИ-помощник: Claude', h('br'), 'Онлайн-материалы: Openverse, Pixabay, Pexels — соблюдайте их лицензии.'));
        body.append(h('button', { onclick: () => { closeModal(); openGuide(); } }, '📖 Открыть руководство'));
        break;
    }
    body.append(h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: closeModal }, 'Готово')));
  });
}
