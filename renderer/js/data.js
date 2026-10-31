'use strict';
// Presets: everything here is original, generated in code at render time.

const RATIOS = [
  { id: '16:9', w: 1920, h: 1080, label: '16:9 — YouTube' },
  { id: '9:16', w: 1080, h: 1920, label: '9:16 — TikTok / Shorts' },
  { id: '1:1', w: 1080, h: 1080, label: '1:1 — Квадрат' },
  { id: '4:3', w: 1440, h: 1080, label: '4:3' },
  { id: '3:4', w: 1080, h: 1440, label: '3:4' },
  { id: '4:5', w: 1080, h: 1350, label: '4:5 — Instagram' },
  { id: '21:9', w: 2520, h: 1080, label: '21:9 — Кино' },
  { id: '2:1', w: 2160, h: 1080, label: '2:1' },
];

const FONTS = ['Segoe UI', 'Arial', 'Arial Black', 'Impact', 'Bahnschrift', 'Calibri', 'Cambria', 'Candara', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel', 'Courier New', 'Franklin Gothic Medium', 'Gabriola', 'Georgia', 'Lucida Console', 'Palatino Linotype', 'Segoe Print', 'Segoe Script', 'Sylfaen', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'];

// Filter = colour look. Values are at 100% intensity; intensity lerps from neutral.
const FILTERS = [
  { id: 'none', name: 'Нет', cat: 'Основные', p: {} },
  { id: 'vivid', name: 'Сочный', cat: 'Основные', p: { c: 1.12, s: 1.45, b: 1.03 } },
  { id: 'clear', name: 'Чистый', cat: 'Основные', p: { c: 1.08, s: 1.1, b: 1.06 } },
  { id: 'warm', name: 'Тёплый', cat: 'Основные', p: { s: 1.1, tint: '#ff9a3c', ta: 0.16, tb: 'soft-light' } },
  { id: 'cool', name: 'Холодный', cat: 'Основные', p: { s: 1.05, tint: '#3c8cff', ta: 0.18, tb: 'soft-light' } },
  { id: 'soft', name: 'Мягкий', cat: 'Основные', p: { c: 0.9, b: 1.06, s: 0.92, tint: '#fff1e6', ta: 0.08, tb: 'screen' } },
  { id: 'bw', name: 'Ч/Б', cat: 'Ч/Б', p: { gray: 1, c: 1.1 } },
  { id: 'noir', name: 'Нуар', cat: 'Ч/Б', p: { gray: 1, c: 1.45, b: 0.92 } },
  { id: 'silver', name: 'Серебро', cat: 'Ч/Б', p: { gray: 1, c: 0.9, b: 1.08, tint: '#c9d6ff', ta: 0.1, tb: 'soft-light' } },
  { id: 'sepia', name: 'Сепия', cat: 'Ретро', p: { sep: 0.85, c: 1.05 } },
  { id: 'vintage', name: 'Винтаж', cat: 'Ретро', p: { sep: 0.35, c: 0.9, s: 0.8, tint: '#ffb26b', ta: 0.15, tb: 'soft-light', fade: 0.12 } },
  { id: 'film', name: 'Плёнка', cat: 'Ретро', p: { c: 1.05, s: 0.85, tint: '#2b5f5a', ta: 0.12, tb: 'soft-light', fade: 0.08 } },
  { id: 'polaroid', name: 'Полароид', cat: 'Ретро', p: { c: 0.92, s: 0.9, b: 1.05, tint: '#ffd9a8', ta: 0.18, tb: 'overlay', fade: 0.1 } },
  { id: 'faded', name: 'Выцветший', cat: 'Ретро', p: { c: 0.82, s: 0.7, fade: 0.2 } },
  { id: 'cine', name: 'Кино', cat: 'Кино', p: { c: 1.15, s: 1.1, tint: '#0f6b78', ta: 0.18, tb: 'soft-light', tint2: '#ff8a3d', ta2: 0.1 } },
  { id: 'drama', name: 'Драма', cat: 'Кино', p: { c: 1.35, s: 0.85, b: 0.95 } },
  { id: 'matte', name: 'Матовый', cat: 'Кино', p: { c: 0.9, s: 0.9, fade: 0.14, tint: '#28323c', ta: 0.12, tb: 'soft-light' } },
  { id: 'night', name: 'Ночной город', cat: 'Кино', p: { c: 1.2, s: 1.2, b: 0.88, tint: '#3c2bff', ta: 0.18, tb: 'soft-light' } },
  { id: 'blockbuster', name: 'Блокбастер', cat: 'Кино', p: { c: 1.25, s: 1.15, tint: '#0a7a8f', ta: 0.22, tb: 'overlay' } },
  { id: 'sunset', name: 'Закат', cat: 'Природа', p: { s: 1.25, tint: '#ff5e3a', ta: 0.2, tb: 'soft-light' } },
  { id: 'summer', name: 'Лето', cat: 'Природа', p: { s: 1.3, b: 1.05, tint: '#ffd23c', ta: 0.14, tb: 'soft-light' } },
  { id: 'autumn', name: 'Осень', cat: 'Природа', p: { s: 1.1, h: -10, tint: '#c8641e', ta: 0.2, tb: 'soft-light' } },
  { id: 'forest', name: 'Лес', cat: 'Природа', p: { s: 1.1, h: 8, tint: '#2e8b57', ta: 0.15, tb: 'soft-light' } },
  { id: 'mint', name: 'Мята', cat: 'Природа', p: { s: 0.95, b: 1.05, tint: '#5fffc8', ta: 0.12, tb: 'soft-light' } },
  { id: 'pastel', name: 'Пастель', cat: 'Стиль', p: { c: 0.85, s: 0.75, b: 1.1, tint: '#ffc6e8', ta: 0.12, tb: 'screen' } },
  { id: 'lavender', name: 'Лаванда', cat: 'Стиль', p: { s: 0.95, tint: '#b07cff', ta: 0.16, tb: 'soft-light' } },
  { id: 'neon', name: 'Неон', cat: 'Стиль', p: { c: 1.2, s: 1.7, tint: '#ff2bd6', ta: 0.12, tb: 'soft-light' } },
  { id: 'cyber', name: 'Кибер', cat: 'Стиль', p: { c: 1.2, s: 1.3, h: 15, tint: '#00e1ff', ta: 0.16, tb: 'soft-light', tint2: '#ff2bd6', ta2: 0.1 } },
  { id: 'pink', name: 'Розовый', cat: 'Стиль', p: { s: 1.05, b: 1.05, tint: '#ff7fb5', ta: 0.16, tb: 'soft-light' } },
  { id: 'gold', name: 'Золото', cat: 'Стиль', p: { s: 1.1, sep: 0.2, tint: '#ffbf3c', ta: 0.18, tb: 'overlay' } },
  { id: 'invert', name: 'Негатив', cat: 'Стиль', p: { inv: 1 } },
];

const ADJUST_DEFAULT = { brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: 0, hue: 0, fade: 0, vignette: 0, blur: 0, sharpen: 0, grain: 0 };
const ADJUST_FIELDS = [
  ['brightness', 'Яркость', -100, 100],
  ['contrast', 'Контраст', -100, 100],
  ['saturation', 'Насыщенность', -100, 100],
  ['exposure', 'Экспозиция', -100, 100],
  ['temperature', 'Температура', -100, 100],
  ['tint', 'Оттенок', -100, 100],
  ['hue', 'Тон', -180, 180],
  ['fade', 'Выцветание', 0, 100],
  ['vignette', 'Виньетка', 0, 100],
  ['grain', 'Зерно', 0, 100],
  ['blur', 'Размытие', 0, 100],
];

// Effects: applied to everything below them on the timeline (effect track), or to a single clip.
const EFFECTS = [
  { id: 'shake', name: 'Тряска камеры', cat: 'Динамика', color: '#7a5bc4' },
  { id: 'zoompulse', name: 'Зум-удар', cat: 'Динамика', color: '#7a5bc4' },
  { id: 'heartbeat', name: 'Пульс', cat: 'Динамика', color: '#7a5bc4' },
  { id: 'slowzoom', name: 'Медленный наезд', cat: 'Динамика', color: '#7a5bc4' },
  { id: 'spin', name: 'Вращение', cat: 'Динамика', color: '#7a5bc4' },
  { id: 'swing', name: 'Качание', cat: 'Динамика', color: '#7a5bc4' },
  { id: 'glitch', name: 'Глитч', cat: 'Искажения', color: '#c44a7a' },
  { id: 'rgbsplit', name: 'RGB-сдвиг', cat: 'Искажения', color: '#c44a7a' },
  { id: 'pixelate', name: 'Пикселизация', cat: 'Искажения', color: '#c44a7a' },
  { id: 'wave', name: 'Волна', cat: 'Искажения', color: '#c44a7a' },
  { id: 'mirror', name: 'Зеркало', cat: 'Искажения', color: '#c44a7a' },
  { id: 'kaleido', name: 'Калейдоскоп', cat: 'Искажения', color: '#c44a7a' },
  { id: 'split3', name: 'Тройной экран', cat: 'Искажения', color: '#c44a7a' },
  { id: 'grid4', name: 'Сетка 2×2', cat: 'Искажения', color: '#c44a7a' },
  { id: 'vhs', name: 'VHS', cat: 'Ретро', color: '#b07a2f' },
  { id: 'oldfilm', name: 'Старое кино', cat: 'Ретро', color: '#b07a2f' },
  { id: 'grain', name: 'Зерно плёнки', cat: 'Ретро', color: '#b07a2f' },
  { id: 'scanlines', name: 'Кинескоп', cat: 'Ретро', color: '#b07a2f' },
  { id: 'camrec', name: 'Камера REC', cat: 'Ретро', color: '#b07a2f' },
  { id: 'flash', name: 'Вспышка', cat: 'Свет', color: '#c4a03a' },
  { id: 'strobe', name: 'Стробоскоп', cat: 'Свет', color: '#c4a03a' },
  { id: 'lightleak', name: 'Засветка', cat: 'Свет', color: '#c4a03a' },
  { id: 'glow', name: 'Свечение', cat: 'Свет', color: '#c4a03a' },
  { id: 'rainbow', name: 'Радуга', cat: 'Свет', color: '#c4a03a' },
  { id: 'darkflash', name: 'Затемнение', cat: 'Свет', color: '#c4a03a' },
  { id: 'vignette', name: 'Виньетка', cat: 'Свет', color: '#c4a03a' },
  { id: 'snow', name: 'Снег', cat: 'Частицы', color: '#3a8fc4' },
  { id: 'sparkles', name: 'Блёстки', cat: 'Частицы', color: '#3a8fc4' },
  { id: 'hearts', name: 'Сердечки', cat: 'Частицы', color: '#3a8fc4' },
  { id: 'rain', name: 'Дождь', cat: 'Частицы', color: '#3a8fc4' },
  { id: 'confetti', name: 'Конфетти', cat: 'Частицы', color: '#3a8fc4' },
  { id: 'dust', name: 'Пыль', cat: 'Частицы', color: '#3a8fc4' },
  { id: 'letterbox', name: 'Кинорамка', cat: 'Рамки', color: '#4a8f6a' },
  { id: 'blurframe', name: 'Размытые края', cat: 'Рамки', color: '#4a8f6a' },
  { id: 'blurin', name: 'Расфокус', cat: 'Рамки', color: '#4a8f6a' },
  { id: 'bwflash', name: 'Ч/Б мигание', cat: 'Рамки', color: '#4a8f6a' },
  { id: 'vintageframe', name: 'Фото-рамка', cat: 'Рамки', color: '#4a8f6a' },
];

const TRANSITIONS = [
  { id: 'fade', name: 'Растворение' },
  { id: 'black', name: 'Через чёрный' },
  { id: 'white', name: 'Через белый' },
  { id: 'pushL', name: 'Сдвиг влево' },
  { id: 'pushR', name: 'Сдвиг вправо' },
  { id: 'pushU', name: 'Сдвиг вверх' },
  { id: 'pushD', name: 'Сдвиг вниз' },
  { id: 'wipeL', name: 'Шторка влево' },
  { id: 'wipeR', name: 'Шторка вправо' },
  { id: 'circle', name: 'Круг' },
  { id: 'zoomIn', name: 'Наезд' },
  { id: 'zoomOut', name: 'Отъезд' },
  { id: 'blur', name: 'Размытие' },
  { id: 'spin', name: 'Вихрь' },
  { id: 'glitch', name: 'Глитч' },
  { id: 'flashT', name: 'Вспышка' },
  { id: 'slideOver', name: 'Наплыв' },
  { id: 'diamond', name: 'Ромб' },
  { id: 'blinds', name: 'Жалюзи' },
  { id: 'pixel', name: 'Пиксели' },
];

const ANIM_IN = [
  { id: 'none', name: 'Нет' }, { id: 'fade', name: 'Появление' }, { id: 'zoomIn', name: 'Увеличение' }, { id: 'zoomOut', name: 'Уменьшение' },
  { id: 'slideL', name: 'Слева' }, { id: 'slideR', name: 'Справа' }, { id: 'slideU', name: 'Снизу' }, { id: 'slideD', name: 'Сверху' },
  { id: 'pop', name: 'Пружина' }, { id: 'spin', name: 'Вращение' }, { id: 'blur', name: 'Из размытия' }, { id: 'drop', name: 'Падение' },
  { id: 'elastic', name: 'Резинка' }, { id: 'flip', name: 'Переворот' },
];
const ANIM_OUT = [
  { id: 'none', name: 'Нет' }, { id: 'fade', name: 'Исчезание' }, { id: 'zoomIn', name: 'Увеличение' }, { id: 'zoomOut', name: 'Уменьшение' },
  { id: 'slideL', name: 'Влево' }, { id: 'slideR', name: 'Вправо' }, { id: 'slideU', name: 'Вверх' }, { id: 'slideD', name: 'Вниз' },
  { id: 'pop', name: 'Пружина' }, { id: 'spin', name: 'Вращение' }, { id: 'blur', name: 'В размытие' }, { id: 'flip', name: 'Переворот' },
];
const ANIM_LOOP = [
  { id: 'none', name: 'Нет' }, { id: 'pulse', name: 'Пульс' }, { id: 'swing', name: 'Качание' }, { id: 'float', name: 'Парение' },
  { id: 'shake', name: 'Дрожь' }, { id: 'spin', name: 'Вращение' }, { id: 'heartbeat', name: 'Сердце' }, { id: 'wobble', name: 'Желе' }, { id: 'blink', name: 'Мигание' },
];
const TEXT_ANIM = [
  { id: 'none', name: 'Нет' }, { id: 'typewriter', name: 'Печатная машинка' }, { id: 'words', name: 'По словам' }, { id: 'letters', name: 'Буквы с прыжком' },
  { id: 'reveal', name: 'Проявление' }, { id: 'karaoke', name: 'Караоке' },
];

const TEXT_DEFAULT = {
  text: 'Текст', font: 'Segoe UI', size: 90, color: '#ffffff', bold: true, italic: false, underline: false, align: 'center',
  letterSpacing: 0, lineHeight: 1.15, strokeColor: '#000000', strokeWidth: 0, shadowColor: '#000000', shadowBlur: 0, shadowDist: 0,
  bgColor: '#000000', bgOpacity: 0, bgRadius: 14, gradient: false, color2: '#ffb03a', glow: 0, glowColor: '#ff6b4a',
  textAnim: 'none', highlightColor: '#ffe14a', maxWidth: 0.86, uppercase: false,
};

const TEXT_STYLES = [
  { name: 'Обычный', s: {} },
  { name: 'Обводка', s: { strokeWidth: 8, strokeColor: '#000000' } },
  { name: 'Мем', s: { font: 'Impact', bold: false, uppercase: true, strokeWidth: 10, strokeColor: '#000000', size: 110 } },
  { name: 'Жёлтый', s: { color: '#ffe14a', strokeWidth: 8, strokeColor: '#000000', font: 'Arial Black' } },
  { name: 'Плашка', s: { color: '#111111', bgColor: '#ffffff', bgOpacity: 1, bgRadius: 18 } },
  { name: 'Тёмная плашка', s: { color: '#ffffff', bgColor: '#000000', bgOpacity: 0.65, bgRadius: 12 } },
  { name: 'Неон', s: { color: '#ffe9ff', glow: 30, glowColor: '#ff2bd6' } },
  { name: 'Киберсиний', s: { color: '#d9fbff', glow: 26, glowColor: '#00c8ff', font: 'Bahnschrift' } },
  { name: 'Градиент', s: { gradient: true, color: '#ff6b4a', color2: '#ffd23c', font: 'Arial Black' } },
  { name: 'Закат', s: { gradient: true, color: '#ff2bd6', color2: '#ff9a3c', strokeWidth: 4, strokeColor: '#2a0030' } },
  { name: 'Тень', s: { shadowColor: '#000000', shadowBlur: 12, shadowDist: 8 } },
  { name: 'Ретро', s: { font: 'Georgia', italic: true, color: '#ffd9a8', shadowColor: '#7a2a00', shadowDist: 6, shadowBlur: 0 } },
  { name: 'Красный', s: { color: '#ffffff', bgColor: '#e3242b', bgOpacity: 1, bgRadius: 6, uppercase: true, font: 'Arial Black' } },
  { name: 'Рукописный', s: { font: 'Segoe Script', bold: false, size: 80, shadowBlur: 6, shadowColor: '#000000' } },
  { name: 'Моно', s: { font: 'Consolas', bold: false, color: '#7dff8a', bgColor: '#000000', bgOpacity: 0.7, bgRadius: 4 } },
  { name: 'Субтитры', s: { size: 64, strokeWidth: 6, strokeColor: '#000000', textAnim: 'karaoke', highlightColor: '#ffe14a' } },
];

const TEXT_TEMPLATES = [
  { name: 'Заголовок', text: 'ЗАГОЛОВОК', s: { size: 150, font: 'Arial Black', uppercase: true, strokeWidth: 0, shadowBlur: 20, shadowColor: '#000000' }, anim: { in: 'pop', out: 'fade' } },
  { name: 'Подзаголовок', text: 'Подзаголовок', s: { size: 70, bold: false, bgColor: '#000000', bgOpacity: 0.55 }, anim: { in: 'slideU', out: 'fade' } },
  { name: 'Подпись внизу', text: 'Имя Фамилия\nдолжность', s: { size: 54, align: 'left', bgColor: '#ff6b4a', bgOpacity: 1, bgRadius: 8 }, y: 0.32, x: -0.25, anim: { in: 'slideL', out: 'slideL' } },
  { name: 'Мем-текст', text: 'КОГДА ПОНЯЛ', s: TEXT_STYLES[2].s, y: -0.36, anim: { in: 'none', out: 'none' } },
  { name: 'Печатная машинка', text: 'Однажды...', s: { font: 'Consolas', bold: false, textAnim: 'typewriter' }, anim: { in: 'none', out: 'fade' } },
  { name: 'Неоновая вывеска', text: 'OPEN', s: TEXT_STYLES[6].s, anim: { in: 'fade', out: 'fade', loop: 'blink' } },
  { name: 'Подпишись!', text: 'ПОДПИШИСЬ 🔔', s: TEXT_STYLES[12].s, y: 0.3, anim: { in: 'elastic', out: 'zoomOut', loop: 'pulse' } },
  { name: 'Конец', text: 'Конец', s: { font: 'Georgia', italic: true, size: 130, bold: false }, anim: { in: 'blur', out: 'fade' } },
];

const STICKERS = {
  'Эмоции': '😂🤣😭😍🥰😎🤔😱😡🤯🥶🥵😴🤡💀👻😈🙈🤫🫠🥹😏🤨😬'.match(/\p{Extended_Pictographic}/gu),
  'Жесты': '👍👎👏🙏👌✌️🤞🤙💪👀🫵👉👈☝️🖕✋'.match(/\p{Extended_Pictographic}/gu),
  'Символы': '❤️🔥💯⭐✨💥💢💤💫⚡❗❓✅❌⚠️🔔🎉🎊🏆🎯💎👑🚀'.match(/\p{Extended_Pictographic}/gu),
  'Предметы': '🎮🎧📷🎬🎤💻📱💰💸🍕🍔🍿☕🎂🎁⏰🔑🗿🧠'.match(/\p{Extended_Pictographic}/gu),
  'Стрелки': ['⬆️', '⬇️', '⬅️', '➡️', '↗️', '↘️', '🔄', '🔃', '⤴️', '⤵️'],
};
