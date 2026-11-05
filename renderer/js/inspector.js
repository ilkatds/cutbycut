'use strict';
// ============ Right inspector ============
let gesture = false;
function beginEdit() { if (!gesture) { pushUndo(); gesture = true; } }
function endEdit() { gesture = false; afterChange(true); }

const INSP = {
  tab: null,
  render() {
    const box = $('#inspector'), tabsEl = $('#inspTabs');
    box.innerHTML = ''; tabsEl.innerHTML = '';
    const sel = [...S.sel].map(clipById).filter(Boolean);
    if (!sel.length) { this.tabs(tabsEl, [['project', 'Проект']]); this.project(box); return; }
    const c = sel[0];
    const tabs = [];
    if (c.type === 'text') tabs.push(['text', 'Текст']);
    if (c.type === 'sticker') tabs.push(['sticker', 'Стикер']);
    if (c.type === 'gen') tabs.push(['gen', 'Футаж']);
    if (c.type === 'video' || c.type === 'image') tabs.push(['video', c.type === 'video' ? 'Видео' : 'Фото']);
    if (isVisual(c) && S.mode !== 'photo') tabs.push(['anim', 'Анимация']);
    if (c.type === 'video' || c.type === 'audio') tabs.push(['audio', 'Аудио'], ['speed', 'Скорость']);
    if (c.type === 'video' || c.type === 'image') tabs.push(['adjust', 'Коррекция'], ['mask', 'Маска']);
    if (isVisual(c)) tabs.push(['clipfx', 'Эффекты']);
    if ((c.type === 'video' || c.type === 'image') && prevOnTrack(c) && S.mode !== 'photo') tabs.push(['transition', 'Переход']);
    if (c.type === 'fx') tabs.push(['fx', 'Эффект']);
    if (c.type === 'filter') tabs.push(['filter', 'Фильтр']);
    if (c.type === 'adjust') tabs.push(['adjust', 'Коррекция']);
    if (!tabs.find((t) => t[0] === this.tab)) this.tab = tabs[0][0];
    this.tabs(tabsEl, tabs);
    if (sel.length > 1) box.append(h('div', { class: 'note' }, `Выделено клипов: ${sel.length}. Изменения применяются к первому.`));
    if (sel.length >= 2 && syncPair()) box.append(h('button', { class: 'primary', style: { width: '100%', marginBottom: '12px' }, onclick: openSync }, '⇄ Синхронизировать текст и футаж'));
    (this[this.tab] || (() => {})).call(this, box, c);
  },
  tabs(el, list) {
    for (const [id, name] of list) el.append(h('button', { class: this.tab === id || list.length === 1 ? 'active' : '', onclick: () => { this.tab = id; this.render(); } }, name));
  },
  refreshKf() {
    for (const b of $$('#inspector .kf')) {
      const c = clipById(b.dataset.clip); if (!c) continue;
      const list = (c.kf && c.kf[b.dataset.prop]) || [];
      const lt = S.time - c.start;
      b.classList.toggle('has', list.length > 0);
      b.classList.toggle('at', list.some((k) => Math.abs(k.t - lt) < 0.5 / P().fps));
      b.textContent = list.some((k) => Math.abs(k.t - lt) < 0.5 / P().fps) ? '◆' : '◇';
    }
    for (const inp of $$('#inspector [data-kfprop]')) {
      const c = clipById(inp.dataset.clip); if (!c) continue;
      const v = propAt(c, inp.dataset.kfprop, S.time) * (+inp.dataset.mul || 1);
      if (document.activeElement !== inp) inp.value = +v.toFixed(2);
    }
  },

  // ----- builders -----
  sec(box, title, extra) { const s = h('div', { class: 'sec' }, h('div', { class: 'title' }, h('span', {}, title), extra || null)); box.append(s); return s; },
  slider(parent, label, get, set, min, max, step = 1, opt = {}) {
    const mul = opt.mul || 1;
    const r = h('input', { type: 'range', min, max, step, value: get() * mul });
    const n = h('input', { type: 'number', min, max, step, value: +(get() * mul).toFixed(2) });
    if (opt.kf) { r.dataset.kfprop = n.dataset.kfprop = opt.kf; r.dataset.clip = n.dataset.clip = opt.clip.id; r.dataset.mul = n.dataset.mul = mul; }
    const apply = (v) => { beginEdit(); set(clamp(+v, -1e9, 1e9) / mul); requestRender(); };
    r.addEventListener('input', () => { n.value = r.value; apply(r.value); });
    r.addEventListener('change', endEdit);
    n.addEventListener('change', () => { r.value = n.value; apply(n.value); endEdit(); });
    r.addEventListener('dblclick', () => { if (opt.def != null) { r.value = n.value = opt.def * mul; apply(opt.def * mul); endEdit(); } });
    let kfBtn = h('span');
    if (opt.kf) {
      kfBtn = h('button', { class: 'kf', title: 'Ключевой кадр', 'data-clip': opt.clip.id, 'data-prop': opt.kf, onclick: () => toggleKf(opt.clip, opt.kf) }, '◇');
    }
    parent.append(h('div', { class: 'row' }, h('label', { title: label }, label), r, n, kfBtn));
    return r;
  },
  color(parent, label, get, set) {
    const i = h('input', { type: 'color', value: get() });
    i.addEventListener('input', () => { beginEdit(); set(i.value); requestRender(); });
    i.addEventListener('change', endEdit);
    parent.append(h('div', { class: 'row wide' }, h('label', {}, label), h('div', {}, i)));
  },
  select(parent, label, opts, get, set) {
    const s = h('select', {}, ...opts.map(([v, n]) => h('option', { value: v }, n)));
    s.value = get();
    s.addEventListener('change', () => { pushUndo(); set(s.value); afterChange(); });
    parent.append(h('div', { class: 'row wide' }, h('label', {}, label), s));
    return s;
  },
  toggle(parent, label, get, set) {
    const i = h('input', { type: 'checkbox' }); i.checked = !!get();
    i.addEventListener('change', () => { pushUndo(); set(i.checked); afterChange(); });
    parent.append(h('div', { class: 'row wide' }, h('label', {}, label), h('div', {}, i)));
  },
  seg(parent, label, opts, get, set) {
    const wrap = h('div', { class: 'seg' });
    for (const [v, n] of opts) wrap.append(h('button', { class: get() === v ? 'on' : '', onclick: () => { pushUndo(); set(v); afterChange(); } }, n));
    parent.append(label ? h('div', { class: 'row wide' }, h('label', {}, label), wrap) : wrap);
  },

  // ----- tabs -----
  project(box) {
    const pr = P();
    if (S.mode === 'audio') { box.append(h('div', { class: 'empty' }, 'Выделите клип на дорожке: здесь появятся громкость, затухания и скорость.')); return; }
    if (S.mode === 'photo') { box.append(h('div', { class: 'empty' }, 'Выделите слой: здесь появятся положение, цвет, маска и кадрирование. Размер и фон — во вкладке «Холст».')); return; }
    const s = this.sec(box, 'Холст');
    s.append(canvasSizeRow());
    this.select(s, 'Формат', [...RATIOS.map((r) => [r.id, r.label]), ...(pr.ratio === 'custom' ? [['custom', 'Свой размер']] : [])], () => pr.ratio, (v) => setRatio(v));
    this.select(s, 'Кадров/с', [[24, '24'], [25, '25'], [30, '30'], [50, '50'], [60, '60']].map(([a, b]) => [String(a), b]), () => String(pr.fps), (v) => { pr.fps = +v; });
    const pv = this.sec(box, 'Превью');
    this.toggle(pv, 'Прокси (плавно)', () => S.useProxy !== false, (v) => { S.useProxy = v; });
    pv.append(h('div', { class: 'note' }, 'Для длинных и 60-кадровых записей создаётся лёгкая копия: превью плавное и без артефактов. Экспорт всегда из оригинала.'));
    const b = this.sec(box, 'Фон');
    this.seg(b, null, [['color', 'Цвет'], ['blur', 'Размытие']], () => pr.bg.type, (v) => { pr.bg.type = v; });
    this.color(b, 'Цвет фона', () => pr.bg.color, (v) => { pr.bg.color = v; });
    if (pr.bg.type === 'blur') this.slider(b, 'Размытие', () => pr.bg.blur, (v) => { pr.bg.blur = v; }, 5, 120, 1);
    const i = this.sec(box, 'Сведения');
    i.append(h('div', { class: 'note' }, `Размер: ${pr.width}×${pr.height}`, h('br'), `Длительность: ${fmtTime(projectDuration(), pr.fps)}`, h('br'), `Клипов: ${pr.clips.length}, медиа: ${pr.media.length}`));
    box.append(h('div', { class: 'empty' }, 'Выделите клип на таймлайне, чтобы изменить его свойства.'));
  },

  transform(box, c) {
    const s = this.sec(box, 'Положение и размер', h('button', { onclick: () => { pushUndo(); c.tf = { x: 0, y: 0, scale: 1, rot: 0, opacity: 1, flipH: false, flipV: false }; c.kf = {}; afterChange(); } }, 'Сброс'));
    const kfSet = (prop) => (v) => setProp(c, prop, v);
    this.slider(s, 'Масштаб', () => propAt(c, 'scale', S.time), kfSet('scale'), 1, 500, 1, { mul: 100, kf: 'scale', clip: c, def: 1 });
    this.slider(s, 'Позиция X', () => propAt(c, 'x', S.time), kfSet('x'), -P().width, P().width, 1, { kf: 'x', clip: c, def: 0 });
    this.slider(s, 'Позиция Y', () => propAt(c, 'y', S.time), kfSet('y'), -P().height, P().height, 1, { kf: 'y', clip: c, def: 0 });
    this.slider(s, 'Поворот', () => propAt(c, 'rot', S.time), kfSet('rot'), -360, 360, 1, { kf: 'rot', clip: c, def: 0 });
    this.slider(s, 'Непрозрачность', () => propAt(c, 'opacity', S.time), kfSet('opacity'), 0, 100, 1, { mul: 100, kf: 'opacity', clip: c, def: 1 });
    s.append(h('div', { class: 'btnRow' },
      h('button', { onclick: () => change(() => { c.tf.flipH = !c.tf.flipH; }) }, '⇋ Отразить'),
      h('button', { onclick: () => change(() => { c.tf.flipV = !c.tf.flipV; }) }, '⇵ Перевернуть'),
      h('button', { onclick: () => change(() => fitClip(c, 'cover')) }, 'Заполнить'),
      h('button', { onclick: () => change(() => fitClip(c, 'fit')) }, 'Вписать')));
    const bl = this.sec(box, 'Наложение');
    this.select(bl, 'Режим', [['source-over', 'Обычный'], ['multiply', 'Умножение'], ['screen', 'Экран'], ['overlay', 'Перекрытие'], ['darken', 'Затемнение'], ['lighten', 'Осветление'], ['color-dodge', 'Осветление основы'], ['color-burn', 'Затемнение основы'], ['hard-light', 'Жёсткий свет'], ['soft-light', 'Мягкий свет'], ['difference', 'Разница'], ['exclusion', 'Исключение'], ['hue', 'Тон'], ['saturation', 'Насыщенность'], ['color', 'Цветность'], ['luminosity', 'Яркость'], ['lighter', 'Добавление']], () => c.blend || 'source-over', (v) => { c.blend = v; });
  },

  video(box, c) {
    this.transform(box, c);
    if (c.type === 'video' || c.type === 'image') {
      const ck = this.sec(box, 'Хромакей');
      this.toggle(ck, 'Включить', () => c.chroma.on, (v) => { c.chroma.on = v; });
      if (c.chroma.on) {
        this.color(ck, 'Цвет ключа', () => c.chroma.color, (v) => { c.chroma.color = v; });
        this.slider(ck, 'Интенсивность', () => c.chroma.sim, (v) => { c.chroma.sim = v; }, 0, 100, 1, { mul: 100 });
        this.slider(ck, 'Сглаживание', () => c.chroma.smooth, (v) => { c.chroma.smooth = v; }, 0, 100, 1, { mul: 100 });
        ck.append(h('div', { class: 'note' }, 'Подсказка: зелёный — #00ff00, синий — #0000ff. Можно выбрать пипеткой в палитре.'));
      }
    }
    if (c.type === 'video' || c.type === 'image') {
      c.crop = c.crop || { l: 0, r: 0, t: 0, b: 0 };
      const cr = this.sec(box, 'Кадрирование', h('button', { onclick: () => change(() => { c.crop = { l: 0, r: 0, t: 0, b: 0 }; }) }, 'Сброс'));
      for (const [k2, n] of [['l', 'Слева'], ['r', 'Справа'], ['t', 'Сверху'], ['b', 'Снизу']]) this.slider(cr, n, () => c.crop[k2], (v) => { c.crop[k2] = clamp(v, 0, 0.45); }, 0, 45, 0.5, { mul: 100, def: 0 });
    }
    if (c.type === 'video') {
      const sb = this.sec(box, 'Стабилизация');
      sb.append(h('div', { class: 'btnRow' }, h('button', { onclick: () => stabilizeClip(c) }, '🎥 Стабилизировать дрожание'),
        c.stabOrigMediaId ? h('button', { onclick: () => change(() => { c.mediaId = c.stabOrigMediaId; c.in = c.stabOrigIn; delete c.stabOrigMediaId; }) }, 'Отменить') : null));
    }
    bgSection(box, c);
    if (c.type === 'image') {
      const d = this.sec(box, 'Длительность');
      this.slider(d, 'Секунды', () => c.dur, (v) => { c.dur = Math.max(0.1, v); }, 0.1, 60, 0.1);
    }
  },

  sticker(box, c) {
    const s = this.sec(box, 'Стикер');
    const inp = h('input', { type: 'text', value: c.text.text, style: { width: '100%', fontSize: '22px' } });
    inp.addEventListener('change', () => change(() => { c.text.text = inp.value; c.name = inp.value; }));
    s.append(inp);
    this.transform(box, c);
  },

  text(box, c) {
    const tx = c.text;
    const host = c.link && clipById(c.link);
    if (host) {
      const others = P().clips.filter((x) => x.link === c.link);
      box.append(h('div', { class: 'note', style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        h('span', { style: { flex: 1 } }, `🔗 Двигается вместе с «${clipName(host)}» (субтитров: ${others.length})`),
        h('button', { onclick: () => change(() => { for (const x of others) { delete x.link; delete x.linkAt; } }) }, 'Отвязать')));
    }
    const s = this.sec(box, 'Текст');
    const ta = h('textarea', {}, tx.text);
    ta.addEventListener('input', () => { beginEdit(); tx.text = ta.value; requestRender(); });
    ta.addEventListener('change', () => { if (typeof retimeWords === 'function') retimeWords(c); endEdit(); TL.render(); });
    s.append(ta);
    s.append(h('div', { class: 'btnRow', style: { marginTop: '6px' } }, h('button', { onclick: () => saveTextPreset(c) }, '💾 Сохранить стиль')));
    const f = this.sec(box, 'Шрифт');
    this.select(f, 'Шрифт', FONTS.map((x) => [x, x]), () => tx.font, (v) => { tx.font = v; });
    this.slider(f, 'Размер', () => tx.size, (v) => { tx.size = v; }, 8, 400, 1);
    f.append(h('div', { class: 'btnRow', style: { marginBottom: '8px' } },
      h('button', { class: tx.bold ? 'on' : '', onclick: () => change(() => { tx.bold = !tx.bold; }) }, h('b', {}, 'Ж')),
      h('button', { class: tx.italic ? 'on' : '', onclick: () => change(() => { tx.italic = !tx.italic; }) }, h('i', {}, 'К')),
      h('button', { class: tx.underline ? 'on' : '', onclick: () => change(() => { tx.underline = !tx.underline; }) }, h('u', {}, 'Ч')),
      h('button', { class: tx.uppercase ? 'on' : '', onclick: () => change(() => { tx.uppercase = !tx.uppercase; }) }, 'АА'),
      h('span', { class: 'grow' }),
      ...[['left', '⯇'], ['center', '≡'], ['right', '⯈']].map(([v, n]) => h('button', { class: tx.align === v ? 'on' : '', onclick: () => change(() => { tx.align = v; }) }, n))));
    this.slider(f, 'Межбуквенный', () => tx.letterSpacing, (v) => { tx.letterSpacing = v; }, -10, 60, 1);
    this.slider(f, 'Межстрочный', () => tx.lineHeight, (v) => { tx.lineHeight = v; }, 70, 250, 1, { mul: 100 });
    this.slider(f, 'Ширина блока', () => tx.maxWidth, (v) => { tx.maxWidth = v; }, 10, 100, 1, { mul: 100 });
    const col = this.sec(box, 'Цвет');
    this.color(col, 'Цвет', () => tx.color, (v) => { tx.color = v; });
    this.toggle(col, 'Градиент', () => tx.gradient, (v) => { tx.gradient = v; });
    if (tx.gradient) this.color(col, 'Цвет 2', () => tx.color2, (v) => { tx.color2 = v; });
    const st = this.sec(box, 'Обводка');
    this.color(st, 'Цвет', () => tx.strokeColor, (v) => { tx.strokeColor = v; });
    this.slider(st, 'Толщина', () => tx.strokeWidth, (v) => { tx.strokeWidth = v; }, 0, 30, 0.5);
    const bg = this.sec(box, 'Фон');
    this.color(bg, 'Цвет', () => tx.bgColor, (v) => { tx.bgColor = v; });
    this.slider(bg, 'Непрозрачность', () => tx.bgOpacity, (v) => { tx.bgOpacity = v; }, 0, 100, 1, { mul: 100 });
    this.slider(bg, 'Скругление', () => tx.bgRadius, (v) => { tx.bgRadius = v; }, 0, 80, 1);
    const sh = this.sec(box, 'Тень и свечение');
    this.color(sh, 'Цвет тени', () => tx.shadowColor, (v) => { tx.shadowColor = v; });
    this.slider(sh, 'Размытие', () => tx.shadowBlur, (v) => { tx.shadowBlur = v; }, 0, 60, 1);
    this.slider(sh, 'Смещение', () => tx.shadowDist, (v) => { tx.shadowDist = v; }, 0, 40, 1);
    this.color(sh, 'Свечение', () => tx.glowColor, (v) => { tx.glowColor = v; });
    this.slider(sh, 'Сила свечения', () => tx.glow, (v) => { tx.glow = v; }, 0, 80, 1);
    const an = this.sec(box, 'Анимация текста');
    this.select(an, 'Тип', TEXT_ANIM.map((a) => [a.id, a.name]), () => tx.textAnim, (v) => { tx.textAnim = v; });
    if (tx.textAnim === 'karaoke') this.color(an, 'Подсветка', () => tx.highlightColor, (v) => { tx.highlightColor = v; });
    const tts = this.sec(box, 'Озвучка текста');
    const voiceSel = h('select', {}, h('option', { value: '' }, 'Голос по умолчанию'));
    api.ttsVoices().then((vs) => { for (const v of vs) voiceSel.append(h('option', { value: v.name }, `${v.name} (${v.culture})`)); const ru = vs.find((v) => /ru/i.test(v.culture)); if (ru) voiceSel.value = ru.name; });
    const rate = h('input', { type: 'range', min: -5, max: 5, value: 0 });
    tts.append(h('div', { class: 'row wide' }, h('label', {}, 'Голос'), voiceSel));
    tts.append(h('div', { class: 'row wide' }, h('label', {}, 'Скорость'), rate));
    tts.append(h('button', { style: { width: '100%' }, onclick: async (e) => {
      e.target.disabled = true; e.target.textContent = 'Синтез…';
      try {
        const p = await api.ttsSpeak({ text: tx.text, voice: voiceSel.value, rate: +rate.value });
        const m = await importFile(p, 'Озвучка: ' + tx.text.slice(0, 20));
        if (m) change(() => { const cl = clipFromMedia(m); cl.start = c.start; cl.trackId = freeTrack('audio', c.start, cl.dur).id; P().clips.push(cl); });
        toast('Озвучка добавлена на аудиодорожку');
      } catch (err) { toast('Не удалось озвучить: ' + err.message, 5000); }
      e.target.disabled = false; e.target.textContent = 'Озвучить текст';
    } }, 'Озвучить текст'));
    this.transform(box, c);
  },

  anim(box, c) {
    const a = c.anim;
    const s = this.sec(box, 'Появление');
    this.grid(s, ANIM_IN, () => a.in, (v) => { a.in = v; });
    this.slider(s, 'Длительность', () => a.inDur, (v) => { a.inDur = v; }, 0.1, Math.max(0.2, c.dur), 0.05);
    const o = this.sec(box, 'Исчезновение');
    this.grid(o, ANIM_OUT, () => a.out, (v) => { a.out = v; });
    this.slider(o, 'Длительность', () => a.outDur, (v) => { a.outDur = v; }, 0.1, Math.max(0.2, c.dur), 0.05);
    const l = this.sec(box, 'Цикл');
    this.grid(l, ANIM_LOOP, () => a.loop, (v) => { a.loop = v; });
    this.slider(l, 'Скорость', () => a.loopSpeed, (v) => { a.loopSpeed = v; }, 0.1, 5, 0.1);
  },
  grid(parent, list, get, set) {
    const g = h('div', { class: 'grid small', style: { marginBottom: '8px' } });
    for (const it of list) g.append(h('div', { class: 'chip' + (get() === it.id ? ' on' : ''), style: { textAlign: 'center', margin: 0 }, onclick: () => { pushUndo(); set(it.id); afterChange(); } }, it.name));
    parent.append(g);
  },

  audio(box, c) {
    const m = mediaById(c.mediaId);
    if (c.type === 'video' && m && !m.hasAudio) { box.append(h('div', { class: 'empty' }, 'В этом видео нет звуковой дорожки.')); return; }
    const s = this.sec(box, 'Громкость');
    this.slider(s, 'Громкость', () => c.volume, (v) => { c.volume = v; }, 0, 400, 1, { mul: 100, def: 1 });
    this.slider(s, 'Нарастание', () => c.fadeIn, (v) => { c.fadeIn = v; }, 0, Math.min(10, c.dur / 2), 0.05);
    this.slider(s, 'Затухание', () => c.fadeOut, (v) => { c.fadeOut = v; }, 0, Math.min(10, c.dur / 2), 0.05);
    this.toggle(s, 'Без звука', () => c.muted, (v) => { c.muted = v; });
    const vc = this.sec(box, 'Обработка голоса');
    const vg = h('div', { class: 'grid small', style: { marginBottom: '6px' } });
    for (const [id, n] of VOICES) vg.append(h('div', { class: 'chip', style: { textAlign: 'center', margin: 0 }, onclick: () => processAudio(c, id) }, n));
    vc.append(vg, h('div', { class: 'note' }, 'Создаёт обработанную копию звука (оригинал не меняется, Ctrl+Z — вернуть).'));
    if (c.origAudioMediaId) vc.append(h('button', { onclick: () => change(() => { c.mediaId = c.origAudioMediaId; c.in = c.origAudioIn; delete c.origAudioMediaId; }) }, 'Вернуть исходный звук'));
    const b = this.sec(box, 'Действия');
    b.append(h('div', { class: 'btnRow' },
      h('button', { onclick: () => findBeats(c) }, '♩ Найти ритм (маркеры)'),
      c.type === 'video' ? h('button', { onclick: () => cmd('detachAudio') }, 'Отделить аудио') : null,
      h('button', { onclick: () => normalizeVolume(c) }, 'Нормализовать громкость'),
      h('button', { onclick: () => autoDuck(c) }, 'Фоновая музыка (30%)')));
  },

  speed(box, c) {
    const s = this.sec(box, 'Скорость');
    const presets = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10];
    const g = h('div', { class: 'btnRow', style: { marginBottom: '10px' } });
    for (const p of presets) g.append(h('button', { class: c.speed === p ? 'on' : '', onclick: () => change(() => setSpeed(c, p)) }, p + 'x'));
    s.append(g);
    const r = this.slider(s, 'Скорость', () => c.speed, (v) => setSpeed(c, clamp(v, 0.1, 10)), 0.1, 10, 0.05, { def: 1 });
    r.addEventListener('change', () => TL.render());
    s.append(h('div', { class: 'note' }, `Длительность клипа: ${fmtDur(c.dur)}. Тон голоса сохраняется.`));
    if (c.type === 'video') {
      const f = this.sec(box, 'Стоп-кадр');
      f.append(h('button', { onclick: () => cmd('freeze') }, '❄ Стоп-кадр в позиции головки'));
    }
    const rv = this.sec(box, 'Реверс');
    rv.append(h('button', { onclick: () => cmd('reverse') }, c.reversed ? 'Отменить реверс' : '⇆ Воспроизвести задом наперёд'));
  },

  adjust(box, c) {
    const adj = c.adj;
    if (c.filter) {
      const f = this.sec(box, 'Фильтр', h('button', { onclick: () => setPanel('filters') }, 'Каталог'));
      this.select(f, 'Фильтр', FILTERS.map((x) => [x.id, x.name]), () => c.filter.id, (v) => { c.filter.id = v; });
      this.slider(f, 'Сила', () => c.filter.amt, (v) => { c.filter.amt = v; }, 0, 100, 1, { mul: 100 });
    }
    const s = this.sec(box, 'Цвет и свет', h('button', { onclick: () => change(() => Object.assign(adj, ADJUST_DEFAULT)) }, 'Сброс'));
    if (c.filter) s.append(h('div', { class: 'btnRow', style: { marginBottom: '8px' } }, h('button', { onclick: () => saveLookPreset(c) }, '💾 Сохранить образ')));
    for (const [k, n, mn, mx] of ADJUST_FIELDS) this.slider(s, n, () => adj[k], (v) => { adj[k] = v; }, mn, mx, 1, { def: 0 });
  },

  mask(box, c) {
    // older projects store only type/size/feather/invert
    for (const [k, v] of Object.entries(MASK_DEFAULT)) if (c.mask[k] == null) c.mask[k] = v;
    const mk = c.mask;
    const ps = this.sec(box, 'Готовые маски');
    const pg = h('div', { class: 'grid small', style: { marginBottom: '8px' } });
    for (const pr of MASK_PRESETS) pg.append(h('div', { class: 'chip', style: { textAlign: 'center', margin: 0 }, onclick: () => { pushUndo(); Object.assign(mk, MASK_DEFAULT, pr.m); afterChange(); } }, pr.name));
    ps.append(pg);
    const s = this.sec(box, 'Маска', mk.type !== 'none' ? h('button', { onclick: () => { pushUndo(); Object.assign(mk, MASK_DEFAULT); afterChange(); } }, 'Убрать') : null);
    this.grid(s, MASK_SHAPES, () => mk.type, (v) => { mk.type = v; });
    if (mk.type === 'none') return;
    this.select(s, 'Режим', MASK_MODES, () => mk.mode, (v) => { mk.mode = v; });
    if (mk.mode === 'darken') this.color(s, 'Цвет', () => mk.color, (v) => { mk.color = v; });
    if (mk.mode !== 'cut') this.slider(s, mk.mode === 'darken' ? 'Затемнение' : 'Сила', () => mk.strength, (v) => { mk.strength = v; }, 0, 100, 1, { mul: 100, def: 0.7 });
    if (!['linear', 'split'].includes(mk.type)) this.slider(s, 'Размер', () => mk.size, (v) => { mk.size = v; }, 5, 300, 1, { mul: 100, def: 0.8 });
    this.slider(s, 'Мягкость края', () => mk.feather, (v) => { mk.feather = v; }, 0, 100, 1, { mul: 100, def: 0.05 });
    if (!['band', 'vband', 'split', 'linear'].includes(mk.type)) this.slider(s, 'Ширина / высота', () => mk.aspect, (v) => { mk.aspect = v; }, 20, 400, 1, { mul: 100, def: 1 });
    if (mk.type === 'round') this.slider(s, 'Скругление', () => mk.round, (v) => { mk.round = v; }, 0, 100, 1, { mul: 100, def: 0.25 });
    const p = this.sec(box, 'Положение маски', h('button', { onclick: () => { pushUndo(); Object.assign(mk, { x: 0, y: 0, rot: 0 }); afterChange(); } }, 'Сброс'));
    this.slider(p, 'По горизонтали', () => mk.x, (v) => { mk.x = v; }, -100, 100, 1, { mul: 100, def: 0 });
    this.slider(p, 'По вертикали', () => mk.y, (v) => { mk.y = v; }, -100, 100, 1, { mul: 100, def: 0 });
    this.slider(p, 'Поворот', () => mk.rot, (v) => { mk.rot = v; }, -180, 180, 1, { def: 0 });
    this.toggle(p, 'Инвертировать', () => mk.invert, (v) => { mk.invert = v; });
  },

  clipfx(box, c) {
    c.fxList = c.fxList || [];
    const s = this.sec(box, 'Эффекты клипа', h('button', { onclick: () => { fxTarget = 'clip'; setPanel('effects'); } }, '+ Добавить'));
    if (!c.fxList.length) s.append(h('div', { class: 'note' }, 'Нет эффектов. Откройте «Эффекты» слева и выберите «К выделенному клипу», или перетащите эффект на клип.'));
    c.fxList.forEach((fx, i) => {
      const w = h('div', { class: 'sec', style: { background: 'var(--bg2)', padding: '8px', borderRadius: '8px' } });
      this.select(w, 'Эффект', EFFECTS.map((e) => [e.id, e.name]), () => fx.id, (v) => { fx.id = v; });
      this.slider(w, 'Сила', () => fx.amt, (v) => { fx.amt = v; }, 0, 100, 1, { mul: 100 });
      this.fxOptions(w, fx);
      w.append(h('button', { onclick: () => change(() => c.fxList.splice(i, 1)) }, 'Удалить'));
      s.append(w);
    });
  },

  transition(box, c) {
    const pv = prevOnTrack(c);
    const s = this.sec(box, 'Переход в начале клипа');
    if (!pv) { s.append(h('div', { class: 'note' }, 'Перед клипом нет соседнего клипа.')); return; }
    this.select(s, 'Тип', [['', 'Нет'], ...TRANSITIONS.map((t) => [t.id, t.name])], () => (c.trans ? c.trans.id : ''), (v) => { c.trans = v ? { id: v, dur: c.trans ? c.trans.dur : 0.5 } : null; });
    if (c.trans) {
      this.slider(s, 'Длительность', () => c.trans.dur, (v) => { c.trans.dur = clamp(v, 0.1, c.dur); }, 0.1, Math.max(0.2, Math.min(3, c.dur)), 0.05);
      s.append(h('div', { class: 'btnRow' },
        h('button', { onclick: () => applyTransition(c.trans.id, true) }, 'Применить ко всем'),
        h('button', { onclick: () => { seek(Math.max(0, c.start - 0.5)); play(); } }, '▶ Просмотр')));
    }
  },

  fx(box, c) {
    const s = this.sec(box, 'Эффект');
    this.select(s, 'Эффект', EFFECTS.map((e) => [e.id, `${e.cat}: ${e.name}`]), () => c.fx.id, (v) => { c.fx.id = v; });
    this.slider(s, 'Сила', () => c.fx.amt, (v) => { c.fx.amt = v; }, 0, 100, 1, { mul: 100 });
    this.fxOptions(s, c.fx);
    s.append(h('div', { class: 'note' }, 'Эффект на дорожке эффектов действует на все видео ниже него. Растяните клип эффекта за края, чтобы изменить время действия.'));
  },
  // settings that only some effects have
  fxOptions(s, fx) {
    if (fx.id !== 'spotlight') return;
    for (const [k, v] of Object.entries(SPOT_DEFAULT)) if (fx[k] == null) fx[k] = v;
    this.seg(s, 'Куда светит', [['auto', 'Блуждает'], ['point', 'В точку'], ['pan', 'Из точки в точку']], () => fx.spotMode, (v) => { fx.spotMode = v; });
    const one = fx.spotMode === 'pan' ? ' (начало)' : fx.spotMode === 'auto' ? ' (центр блуждания)' : '';
    this.slider(s, 'Влево ↔ вправо' + one, () => fx.sx, (v) => { fx.sx = v; }, -100, 100, 1, { mul: 100, def: 0 });
    this.slider(s, 'Вверх ↕ вниз' + one, () => fx.sy, (v) => { fx.sy = v; }, -100, 100, 1, { mul: 100, def: 0 });
    if (fx.spotMode === 'pan') {
      this.slider(s, 'Влево ↔ вправо (конец)', () => fx.sx2, (v) => { fx.sx2 = v; }, -100, 100, 1, { mul: 100, def: 0.5 });
      this.slider(s, 'Вверх ↕ вниз (конец)', () => fx.sy2, (v) => { fx.sy2 = v; }, -100, 100, 1, { mul: 100, def: 0 });
    }
    if (fx.spotMode === 'auto') {
      this.slider(s, 'Скорость', () => fx.speed, (v) => { fx.speed = v; }, 0, 400, 1, { mul: 100, def: 1 });
      this.slider(s, 'Размах', () => fx.range, (v) => { fx.range = v; }, 0, 200, 1, { mul: 100, def: 1 });
    }
    this.slider(s, 'Размер луча', () => fx.size, (v) => { fx.size = v; }, 20, 300, 1, { mul: 100, def: 1 });
    this.slider(s, 'Мягкость края', () => fx.soft, (v) => { fx.soft = v; }, 2, 100, 1, { mul: 100, def: 0.73 });
    s.append(h('div', { class: 'note' }, fx.spotMode === 'pan' ? 'Alt + щелчок или перетаскивание по превью ставит начальную точку, Alt + Shift — конечную.' : 'Alt + щелчок или перетаскивание по превью — луч встанет в эту точку (режим «В точку»).'));
  },
  filter(box, c) {
    const s = this.sec(box, 'Фильтр');
    this.select(s, 'Фильтр', FILTERS.map((x) => [x.id, x.name]), () => c.filter.id, (v) => { c.filter.id = v; });
    this.slider(s, 'Сила', () => c.filter.amt, (v) => { c.filter.amt = v; }, 0, 100, 1, { mul: 100 });
  },
};

// ---------- Keyframe helpers ----------
function setProp(c, prop, v) {
  const list = c.kf && c.kf[prop];
  if (list && list.length) {
    const lt = clamp(S.time - c.start, 0, c.dur);
    const k = list.find((k) => Math.abs(k.t - lt) < 0.5 / P().fps);
    if (k) k.v = v; else { list.push({ t: lt, v }); list.sort((a, b) => a.t - b.t); }
  } else c.tf[prop] = v;
}
function toggleKf(c, prop) {
  pushUndo();
  c.kf = c.kf || {};
  const list = (c.kf[prop] = c.kf[prop] || []);
  const lt = clamp(S.time - c.start, 0, c.dur);
  const i = list.findIndex((k) => Math.abs(k.t - lt) < 0.5 / P().fps);
  if (i >= 0) { list.splice(i, 1); if (!list.length) delete c.kf[prop]; }
  else { list.push({ t: lt, v: propAt(c, prop, S.time) }); list.sort((a, b) => a.t - b.t); }
  if (!activeAt(c, S.time)) toast('Головка вне клипа — ключ поставлен на край');
  afterChange();
}
function fitClip(c, mode) {
  const m = mediaById(c.mediaId); if (!m || !m.width) return;
  const fit = Math.min(P().width / m.width, P().height / m.height);
  const cover = Math.max(P().width / m.width, P().height / m.height);
  c.kf.scale = undefined; delete c.kf.scale;
  c.tf.scale = mode === 'cover' ? cover / fit : 1;
  c.tf.x = 0; c.tf.y = 0;
}
function setSpeed(c, sp) {
  const m = mediaById(c.mediaId);
  const srcLen = c.dur * c.speed;
  c.speed = +sp.toFixed(3);
  c.dur = srcLen / c.speed;
  if (m && m.duration && c.in + c.dur * c.speed > m.duration) c.dur = (m.duration - c.in) / c.speed;
}
function normalizeVolume(c) {
  const cc = S.cache[c.mediaId];
  if (!cc || !cc.peaks) { toast('Волна ещё не готова'); return; }
  const a = Math.floor(c.in * 100), b = Math.floor((c.in + c.dur * c.speed) * 100);
  let mx = 1;
  for (let i = a; i < b && i < cc.peaks.length; i++) mx = Math.max(mx, cc.peaks[i]);
  change(() => { c.volume = clamp((255 / mx) * 0.89, 0.05, 4); });
  toast(`Громкость: ${Math.round(c.volume * 100)}%`);
}
function autoDuck(music) {
  // lower this clip where other audio tracks have loud speech: approximate by setting volume 30%
  change(() => { music.volume = 0.3; });
  toast('Громкость снижена до 30%, чтобы не перекрывать речь');
}
