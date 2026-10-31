'use strict';
// ============ Нарезка: fragments of the timeline, auto highlights, batch export ============
const CUT = { len: 20, count: 8, mode: 'loud', vertical: false, busy: false };
const cuts = () => (P().cuts = P().cuts || []);

function markIn() { S.markIn = S.time; if (S.markOut != null && S.markOut <= S.markIn) S.markOut = null; TL.drawRuler(); if (curPanel === 'cuts') setPanel('cuts'); toast('Начало фрагмента: ' + fmtTime(S.time, P().fps)); }
function markOut() {
  S.markOut = S.time;
  if (S.markIn != null && S.markIn < S.markOut) { addCut(S.markIn, S.markOut); S.markIn = S.markOut = null; }
  else toast('Конец фрагмента: ' + fmtTime(S.time, P().fps) + ' — теперь поставьте начало (I)');
  TL.drawRuler();
  if (curPanel === 'cuts') setPanel('cuts');
}
function addCut(from, to, name, score) {
  change(() => { cuts().push({ id: uid('cut'), from: Math.max(0, from), to: Math.min(projectDuration(), to), name: name || 'Фрагмент ' + (cuts().length + 1), on: true, score }); cuts().sort((a, b) => a.from - b.from); });
}

// Loudness curve of the whole timeline at 10 Hz, from the cached waveform peaks
function loudnessCurve() {
  const dur = projectDuration(), n = Math.ceil(dur * 10);
  const curve = new Float32Array(n);
  for (const c of P().clips) {
    if (c.type !== 'video' && c.type !== 'audio') continue;
    const tr = trackById(c.trackId);
    if (c.muted || (tr && tr.muted) || c.freeze != null) continue;
    const pk = (S.cache[c.mediaId] || {}).peaks;
    if (!pk) continue;
    const a = Math.floor(c.start * 10), b = Math.min(n, Math.ceil((c.start + c.dur) * 10));
    for (let i = a; i < b; i++) {
      const s0 = srcTime(c, i / 10), s1 = srcTime(c, (i + 1) / 10);
      let mx = 0;
      for (let j = Math.floor(s0 * 100); j < Math.max(Math.floor(s0 * 100) + 1, Math.floor(s1 * 100)); j++) if (pk[j] > mx) mx = pk[j];
      curve[i] = Math.max(curve[i], (mx / 255) * c.volume);
    }
  }
  return curve;
}
function findHighlights(len, count, mode) {
  const cv = loudnessCurve(), n = cv.length;
  if (!n) return [];
  // short-term energy (1 s) vs local baseline (median of ±30 s)
  const win = 10, base = 300;
  const st = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += cv[i] * cv[i]; if (i >= win) acc -= cv[i - win] * cv[i - win]; st[i] = Math.sqrt(acc / Math.min(win, i + 1)); }
  const score = new Float32Array(n);
  const sample = [];
  for (let i = 0; i < n; i += 5) sample.push(st[i]);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, Math.floor((i - base) / 5)), b = Math.min(sample.length, Math.floor((i + base) / 5));
    const loc = sample.slice(a, b).sort((x, y) => x - y);
    const med = loc[loc.length >> 1] || 0.001;
    if (mode === 'talk') {
      // share of non-silent time in the next fragment
      score[i] = st[i] > 0.06 ? 1 : 0;
    } else score[i] = st[i] / (med + 0.02);
  }
  if (mode === 'talk') {
    const L = len * 10, out = new Float32Array(n);
    let s = 0;
    for (let i = n - 1; i >= 0; i--) { s += score[i]; if (i + L < n) s -= score[i + L]; out[i] = s / L; }
    score.set(out);
  }
  const res = [];
  const used = new Uint8Array(n);
  for (let k = 0; k < count; k++) {
    let best = -1, bi = -1;
    for (let i = 0; i < n; i++) if (!used[i] && score[i] > best) { best = score[i]; bi = i; }
    if (bi < 0 || best <= 0) break;
    const t = bi / 10;
    const from = mode === 'talk' ? t : Math.max(0, t - len * 0.6);
    const to = Math.min(projectDuration(), from + len);
    res.push({ from, to, score: best });
    for (let i = Math.max(0, Math.floor((from - len * 0.5) * 10)); i < Math.min(n, Math.ceil((to + len * 0.5) * 10)); i++) used[i] = 1;
  }
  return res.sort((a, b) => a.from - b.from);
}

PANELS.cuts = function (p) {
  p.append(h('h3', {}, '✂ Нарезка'));
  p.append(h('div', { class: 'note' }, 'Отметьте фрагменты клавишами I (начало) и O (конец) или найдите яркие моменты автоматически. Затем соберите их в один ролик или экспортируйте каждый отдельно.'));
  p.append(h('div', { class: 'btnRow', style: { marginBottom: '8px' } },
    h('button', { onclick: markIn, title: 'I' }, '[ Начало (I)'),
    h('button', { onclick: markOut, title: 'O' }, 'Конец (O) ]'),
    h('button', { onclick: () => addCut(S.time, S.time + CUT.len) }, `+ ${CUT.len} с от головки`)));
  if (S.markIn != null) p.append(h('div', { class: 'note' }, `Начало отмечено: ${fmtTime(S.markIn, P().fps)} — поставьте конец (O)`));

  const auto = h('div', { class: 'sec', style: { background: 'var(--bg2)', padding: '8px', borderRadius: '8px' } });
  auto.append(h('div', { class: 'title' }, h('span', {}, 'Автопоиск моментов')));
  const mode = h('select', {}, h('option', { value: 'loud' }, 'Громкие моменты (крики, смех, взрывы)'), h('option', { value: 'talk' }, 'Самые «разговорные» отрезки'));
  mode.value = CUT.mode; mode.addEventListener('change', () => { CUT.mode = mode.value; });
  const len = h('input', { type: 'number', min: 3, max: 180, value: CUT.len }); len.addEventListener('change', () => { CUT.len = +len.value || 20; });
  const cnt = h('input', { type: 'number', min: 1, max: 50, value: CUT.count }); cnt.addEventListener('change', () => { CUT.count = +cnt.value || 8; });
  auto.append(h('div', { class: 'row wide' }, h('label', {}, 'Искать'), mode), h('div', { class: 'row wide' }, h('label', {}, 'Длина, с'), len), h('div', { class: 'row wide' }, h('label', {}, 'Сколько'), cnt));
  auto.append(h('button', { class: 'primary', style: { width: '100%' }, onclick: () => {
    const found = findHighlights(CUT.len, CUT.count, CUT.mode);
    if (!found.length) { toast('Не нашёл — нужна звуковая дорожка (подождите, пока построится волна)'); return; }
    change(() => { found.forEach((f, i) => cuts().push({ id: uid('cut'), from: f.from, to: f.to, name: 'Момент ' + (cuts().length + 1), on: true, score: f.score })); cuts().sort((a, b) => a.from - b.from); });
    toast(`Найдено моментов: ${found.length}`);
  } }, 'Найти'));
  p.append(auto);

  const list = cuts();
  p.append(h('h4', {}, `Фрагменты (${list.length})`));
  if (!list.length) p.append(h('div', { class: 'note' }, 'Пока пусто.'));
  for (const c of list) {
    const chk = h('input', { type: 'checkbox' }); chk.checked = c.on !== false;
    chk.addEventListener('change', () => { c.on = chk.checked; markDirty(); TL.drawRuler(); });
    const name = h('input', { type: 'text', value: c.name, style: { flex: 1, minWidth: 0 } });
    name.addEventListener('change', () => { c.name = name.value; markDirty(); });
    const num = (key) => { const i = h('input', { type: 'number', step: 0.5, value: c[key].toFixed(1), style: { width: '64px' } }); i.addEventListener('change', () => change(() => { c[key] = clamp(+i.value, 0, projectDuration()); if (c.to <= c.from) c.to = c.from + 1; })); return i; };
    const row = h('div', { style: { background: 'var(--bg2)', borderRadius: '8px', padding: '6px', marginBottom: '6px' } },
      h('div', { class: 'panelBar', style: { marginBottom: '4px' } }, chk, name,
        h('button', { title: 'Просмотр', onclick: () => previewCut(c) }, '▶'),
        h('button', { title: 'Удалить', onclick: () => change(() => { P().cuts = cuts().filter((x) => x !== c); }) }, '🗑')),
      h('div', { class: 'panelBar', style: { margin: 0, color: 'var(--dim)' } }, 'с', num('from'), 'по', num('to'), h('span', { class: 'grow' }), fmtDur(c.to - c.from)));
    p.append(row);
  }
  if (list.length) {
    const vert = h('input', { type: 'checkbox' }); vert.checked = CUT.vertical; vert.addEventListener('change', () => { CUT.vertical = vert.checked; });
    p.append(h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '8px 0' } }, vert, 'Экспортировать вертикально 9:16 (Shorts / TikTok / Reels)'));
    p.append(h('div', { class: 'btnRow' },
      h('button', { class: 'primary', disabled: CUT.busy, onclick: exportCuts }, CUT.busy ? 'Экспорт…' : '⇪ Экспорт каждого отдельно'),
      h('button', { onclick: assembleCuts }, 'Собрать в один ролик'),
      h('button', { onclick: () => change(() => { P().cuts = []; }) }, 'Очистить')));
    p.append(h('div', { id: 'cutStatus', class: 'note' }));
  }
};

function previewCut(c) {
  seek(c.from); play();
  clearInterval(previewCut._t);
  previewCut._t = setInterval(() => { if (!S.playing || S.time >= c.to) { clearInterval(previewCut._t); if (S.playing) pause(); } }, 50);
}

// Rebuild the timeline so that it contains only the checked fragments, back to back
function assembleCuts() {
  const ranges = cuts().filter((c) => c.on !== false).sort((a, b) => a.from - b.from);
  if (!ranges.length) { toast('Отметьте хотя бы один фрагмент'); return; }
  change(() => {
    const out = [];
    let pos = 0;
    for (const r of ranges) {
      for (const c of P().clips) {
        const s = Math.max(c.start, r.from), e = Math.min(c.start + c.dur, r.to);
        if (e - s < 0.02) continue;
        const n = deep(c);
        n.id = uid('c');
        const cut = s - c.start;
        n.start = pos + (s - r.from);
        n.dur = e - s;
        if (n.in != null && n.freeze == null) n.in = c.in + cut * c.speed;
        if (cut > 0.01) { n.trans = null; if (n.anim) n.anim.in = 'none'; if (n.fadeIn) n.fadeIn = 0; }
        if (e < c.start + c.dur - 0.01) { if (n.anim) n.anim.out = 'none'; if (n.fadeOut) n.fadeOut = 0; }
        for (const k of Object.keys(n.kf || {})) n.kf[k] = n.kf[k].map((p) => ({ t: p.t - cut, v: p.v })).filter((p) => p.t >= -0.5 && p.t <= n.dur + 0.5);
        if (n.words) n.words = n.words.map((w) => ({ ...w, start: w.start - cut, end: w.end - cut })).filter((w) => w.end > 0 && w.start < n.dur);
        out.push(n);
      }
      pos += r.to - r.from;
    }
    P().clips = out;
    P().cuts = [];
    P().markers = [];
    S.sel.clear();
    S.time = 0;
  });
  toast('Нарезка собрана на таймлайне (Ctrl+Z — вернуть)');
}

async function exportCuts() {
  const ranges = cuts().filter((c) => c.on !== false);
  if (!ranges.length) { toast('Отметьте хотя бы один фрагмент'); return; }
  const info = await api.info();
  const first = await api.saveExportDialog(`${info.videos}\\${(P().name || 'нарезка').replace(/[\\/:*?"<>|]/g, '_')} 01.mp4`);
  if (!first) return;
  const dir = first.replace(/[\\/][^\\/]+$/, '');
  const stem = first.replace(/^.*[\\/]/, '').replace(/\s*\d*\.mp4$/i, '');
  CUT.busy = true; setPanel('cuts');
  const saved = { ratio: P().ratio, w: P().width, h: P().height, bg: deep(P().bg) };
  if (CUT.vertical) { setRatio('9:16'); P().bg = { ...P().bg, type: 'blur' }; }
  const st = () => $('#cutStatus');
  let done = 0;
  try {
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i];
      const path = `${dir}\\${stem} ${String(i + 1).padStart(2, '0')}.mp4`;
      const res = await runExport({ path, short: +SET.expRes || 1080, fps: +SET.expFps || P().fps, crf: 20, codec: 'h264', encoder: SET.expEncoder || 'auto', speed: SET.expSpeed || 'medium', from: r.from, to: r.to }, (p, eta) => { if (st()) st().textContent = `Фрагмент ${i + 1} из ${ranges.length}: ${(p * 100).toFixed(0)}% · осталось ≈ ${fmtDur(eta)}`; });
      if (res.cancelled) break;
      if (!res.ok) throw new Error(res.error);
      done++;
    }
    toast(`Экспортировано фрагментов: ${done}`, 5000);
    if (done) api.showItem(`${dir}\\${stem} 01.mp4`);
  } catch (e) {
    toast('Ошибка экспорта: ' + e.message, 6000);
  } finally {
    if (CUT.vertical) { P().ratio = saved.ratio; P().width = saved.w; P().height = saved.h; P().bg = saved.bg; layoutStage(); }
    CUT.busy = false;
    if (curPanel === 'cuts') setPanel('cuts');
  }
}
