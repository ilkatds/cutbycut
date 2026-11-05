'use strict';
// ============ Timeline ============
const TRACK_H = { video: 56, main: 66, text: 34, fx: 30, audio: 46 };
const KIND_LABEL = { video: 'Видео', text: 'Текст', fx: 'Эффекты', audio: 'Аудио' };

const TL = {
  rows: [], // [{ track, y, h }]
  drag: null,

  trackH(tr) { return Math.round((tr.main && tr.kind !== 'audio' ? TRACK_H.main : TRACK_H[tr.kind]) * (+SET.trackScale || 1) * (S.mode === 'audio' && tr.kind === 'audio' ? 1.9 : 1)); },

  render() {
    const pr = P();
    const tracksEl = $('#tlTracks'), headEl = $('#tlHeadList');
    tracksEl.innerHTML = ''; headEl.innerHTML = '';
    this.rows = [];
    let y = 0;
    const scroll = $('#tlScroll');
    const total = Math.max(projectDuration() + 30, scroll.clientWidth / S.pps);
    const width = Math.ceil(total * S.pps);
    $('#tlInner').style.width = width + 'px';
    for (const tr of pr.tracks) {
      const hgt = this.trackH(tr);
      this.rows.push({ track: tr, y, h: hgt });
      const row = h('div', { class: 'track' + (tr.main ? ' main' : ''), style: { height: hgt + 'px' }, 'data-track': tr.id });
      tracksEl.append(row);
      headEl.append(this.header(tr, hgt));
      for (const c of clipsOn(tr.id)) row.append(this.clipEl(c));
      if (tr.kind === 'video') this.junctions(tr, row);
      y += hgt;
    }
    tracksEl.style.height = y + 'px';
    $('#tlInner').style.height = (y + 26 + 40) + 'px';
    this.drawRuler();
    this.drawStrips();
    this.updatePlayhead();
    $('#tdur').textContent = fmtTime(projectDuration(), pr.fps);
  },

  header(tr, hgt) {
    const btn = (label, title, on, fn) => h('button', { class: on ? 'on' : '', title, onclick: (e) => { e.stopPropagation(); fn(); } }, label);
    const el = h('div', { class: 'thead' + (tr.main ? ' main' : ''), style: { height: hgt + 'px' } },
      h('span', { class: 'tn', title: tr.name }, tr.name),
      tr.kind !== 'fx' && tr.kind !== 'text' ? btn(tr.muted ? '🔇' : '🔊', 'Звук', tr.muted, () => change(() => { tr.muted = !tr.muted; })) : null,
      tr.kind !== 'audio' ? btn(tr.hidden ? '◌' : '👁', 'Показать/скрыть', tr.hidden, () => change(() => { tr.hidden = !tr.hidden; })) : null,
      btn(tr.locked ? '🔒' : '🔓', 'Блокировка', tr.locked, () => change(() => { tr.locked = !tr.locked; })),
    );
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showMenu(e.clientX, e.clientY, [
        { label: 'Переименовать', action: async () => { const n = await askText('Название дорожки', tr.name); if (n) change(() => { tr.name = n; }); } },
        { label: 'Добавить дорожку ' + KIND_LABEL[tr.kind].toLowerCase(), action: () => change(() => addTrack(tr.kind, tr.id)) },
        { label: 'Удалить дорожку', disabled: tr.main, action: () => change(() => { P().clips = P().clips.filter((c) => c.trackId !== tr.id); P().tracks = P().tracks.filter((t) => t !== tr); }) },
      ]);
    });
    return el;
  },

  clipEl(c) {
    const pps = S.pps;
    const tr = trackById(c.trackId);
    const cls = ['clip', c.type, S.sel.has(c.id) ? 'sel' : ''].join(' ');
    const el = h('div', { class: cls, 'data-clip': c.id, style: { left: c.start * pps + 'px', width: Math.max(4, c.dur * pps) + 'px' } });
    const m = c.mediaId ? mediaById(c.mediaId) : null;
    let label = c.name;
    if (c.type === 'text' || c.type === 'sticker') label = (c.type === 'sticker' ? '' : 'T  ') + c.text.text.replace(/\n/g, ' ');
    if (c.type === 'fx') label = '✦ ' + (EFFECTS.find((e) => e.id === c.fx.id) || {}).name;
    if (c.type === 'filter') label = '◐ ' + (FILTERS.find((e) => e.id === c.filter.id) || {}).name;
    if (c.type === 'adjust') label = '☼ Коррекция';
    if (c.type === 'gen') label = '🎞 ' + c.name + (c.gen.text ? ': ' + c.gen.text : '');
    if (m && !label) label = m.name;
    if (c.speed && c.speed !== 1) label = `${c.speed}x · ` + label;
    if (c.freeze != null) label = '❄ ' + label;
    if (c.reversed) label = '⇆ ' + label;
    if (c.type === 'video' || c.type === 'image' || c.type === 'audio') el.append(h('canvas', { class: 'strip' }));
    el.append(h('div', { class: 'lbl' }, label));
    el.append(h('div', { class: 'meta' }, fmtDur(c.dur)));
    if (!tr.locked) { el.append(h('div', { class: 'trim l', 'data-trim': 'l' })); el.append(h('div', { class: 'trim r', 'data-trim': 'r' })); }
    if (c.fadeIn > 0) el.append(h('div', { class: 'fadeL', style: { left: 0, width: c.fadeIn * pps + 'px', background: 'linear-gradient(to right, rgba(0,0,0,.5), transparent)' } }));
    if (c.fadeOut > 0) el.append(h('div', { class: 'fadeR', style: { right: 0, width: c.fadeOut * pps + 'px', background: 'linear-gradient(to left, rgba(0,0,0,.5), transparent)' } }));
    const kfTimes = new Set();
    for (const k of Object.keys(c.kf || {})) for (const f of c.kf[k]) kfTimes.add(f.t.toFixed(3));
    for (const t of kfTimes) el.append(h('div', { class: 'kfdot', style: { left: parseFloat(t) * pps + 'px' } }));
    if (tr.locked) el.style.opacity = 0.6;
    return el;
  },

  junctions(tr, row) {
    const list = clipsOn(tr.id);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      if (Math.abs(a.start + a.dur - b.start) > 0.05) continue;
      const j = h('div', { class: 'junction' + (b.trans ? ' has' : ''), title: b.trans ? 'Переход: ' + (TRANSITIONS.find((x) => x.id === b.trans.id) || {}).name : 'Добавить переход', style: { left: b.start * S.pps + 'px' } }, b.trans ? '⧓' : '+');
      j.addEventListener('pointerdown', (e) => e.stopPropagation());
      j.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!b.trans) change(() => { b.trans = { id: 'fade', dur: Math.min(+SET.transDur || 0.5, b.dur / 2, a.dur / 2) }; });
        selectOnly(b.id);
        INSP.tab = 'transition';
        INSP.render();
        setPanel('transitions');
      });
      row.append(j);
    }
  },

  drawStrips() {
    const scroll = $('#tlScroll');
    const vx0 = scroll.scrollLeft - 200, vx1 = scroll.scrollLeft + scroll.clientWidth + 200;
    for (const el of $$('.clip', $('#tlTracks'))) {
      const cv = $('canvas.strip', el);
      if (!cv) continue;
      const c = clipById(el.dataset.clip);
      if (!c) continue;
      const left = c.start * S.pps, w = c.dur * S.pps;
      const x0 = Math.max(left, vx0), x1 = Math.min(left + w, vx1);
      if (x1 <= x0) { cv.width = 1; continue; }
      const hh = el.clientHeight || 50;
      cv.style.left = x0 - left + 'px'; cv.style.width = x1 - x0 + 'px'; cv.style.inset = 'auto'; cv.style.top = '0'; cv.style.height = '100%';
      cv.width = Math.ceil(x1 - x0); cv.height = hh;
      const ctx = cv.getContext('2d');
      const m = mediaById(c.mediaId); if (!m) continue;
      const cc = S.cache[m.id] || {};
      if (c.type === 'audio' || (c.type === 'video' && false)) this.wave(ctx, c, m, cc, x0 - left, cv.width, hh, 0, hh);
      else if (c.type === 'video') {
        const thumbH = hh - (m.hasAudio ? 16 : 0);
        this.film(ctx, c, m, cc, x0 - left, cv.width, thumbH);
        if (m.hasAudio && !c.muted) this.wave(ctx, c, m, cc, x0 - left, cv.width, 16, thumbH, hh, true);
      } else if (c.type === 'image') {
        const im = cc.img;
        if (im && im.complete && im.naturalWidth) {
          const tw = hh * im.naturalWidth / im.naturalHeight;
          for (let x = -((x0 - left) % tw); x < cv.width; x += tw) ctx.drawImage(im, x, 0, tw, hh);
        }
      }
    }
  },
  film(ctx, c, m, cc, off, w, hh) {
    const sp = cc.sprite;
    if (!sp || !sp.complete || !sp.naturalWidth) return;
    const n = cc.spriteCount, fw = sp.naturalWidth / n, fh = sp.naturalHeight;
    const tw = hh * (fw / fh);
    const start = Math.floor(off / tw) * tw;
    for (let x = start; x < off + w; x += tw) {
      const tt = c.start + (x + tw / 2) / S.pps;
      const st = srcTime(c, tt);
      const idx = clamp(Math.floor((st / Math.max(0.01, m.duration)) * n), 0, n - 1);
      ctx.drawImage(sp, idx * fw, 0, fw, fh, x - off, 0, tw, hh);
    }
  },
  wave(ctx, c, m, cc, off, w, hh, y0, y1, dark) {
    const pk = cc.peaks;
    ctx.fillStyle = dark ? 'rgba(10,30,40,.75)' : 'rgba(0,0,0,0)';
    if (dark) ctx.fillRect(0, y0, w, hh);
    if (!pk) return;
    ctx.fillStyle = dark ? 'rgba(120,230,210,.85)' : 'rgba(210,255,248,.75)';
    const mid = y0 + hh / 2;
    for (let x = 0; x < w; x++) {
      const tt = c.start + (x + off) / S.pps;
      const s0 = srcTime(c, tt);
      const s1 = srcTime(c, tt + 1 / S.pps);
      let a = Math.floor(s0 * 100), b = Math.max(a + 1, Math.floor(s1 * 100));
      let mx = 0;
      for (let i = a; i < b && i < pk.length; i++) if (pk[i] > mx) mx = pk[i];
      const v = (mx / 255) * Math.min(2, c.volume) * fadeGain(c, tt);
      const hgt = Math.max(1, v * hh * 0.95);
      ctx.fillRect(x, mid - hgt / 2, 1, hgt);
    }
  },

  drawRuler() {
    const cv = $('#ruler'), scroll = $('#tlScroll');
    const w = scroll.clientWidth;
    cv.width = w; cv.height = 26;
    cv.style.width = w + 'px';
    cv.style.left = scroll.scrollLeft + 'px';
    cv.style.position = 'sticky';
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, 26);
    const uc = uiColors();
    ctx.fillStyle = uc.bg; ctx.fillRect(0, 0, w, 26);
    const pps = S.pps;
    const steps = [1 / 30, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const step = steps.find((s) => s * pps >= 70) || 600;
    const sub = step >= 1 ? (step >= 10 ? 5 : step === 5 ? 5 : step === 2 ? 4 : 5) : 5;
    const t0 = scroll.scrollLeft / pps, t1 = (scroll.scrollLeft + w) / pps;
    ctx.strokeStyle = uc.line; ctx.fillStyle = uc.text; ctx.font = '10.5px Segoe UI'; ctx.textBaseline = 'top';
    ctx.beginPath();
    for (let t = Math.floor(t0 / step) * step; t <= t1; t += step) {
      const x = Math.round(t * pps - scroll.scrollLeft) + 0.5;
      ctx.moveTo(x, 12); ctx.lineTo(x, 26);
      const lbl = step < 1 ? fmtTime(t, P().fps) : `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;
      ctx.fillText(lbl, x + 3, 2);
      for (let i = 1; i < sub; i++) { const xs = Math.round((t + (step * i) / sub) * pps - scroll.scrollLeft) + 0.5; ctx.moveTo(xs, 20); ctx.lineTo(xs, 26); }
    }
    ctx.stroke();
    for (const cu of P().cuts || []) {
      const x0 = cu.from * pps - scroll.scrollLeft, x1 = cu.to * pps - scroll.scrollLeft;
      if (x1 < 0 || x0 > w) continue;
      ctx.fillStyle = cu.on === false ? 'rgba(150,150,170,.25)' : 'rgba(255,107,74,.35)';
      ctx.fillRect(x0, 20, x1 - x0, 6);
    }
    if (S.markIn != null) { const x = S.markIn * pps - scroll.scrollLeft; ctx.fillStyle = '#3cd36a'; ctx.fillRect(x, 0, 3, 26); }
    for (const mk of P().markers) {
      const x = mk.t * pps - scroll.scrollLeft;
      if (x < -10 || x > w + 10) continue;
      ctx.fillStyle = mk.color || '#ffb03a';
      ctx.beginPath(); ctx.moveTo(x - 5, 0); ctx.lineTo(x + 5, 0); ctx.lineTo(x + 5, 8); ctx.lineTo(x, 13); ctx.lineTo(x - 5, 8); ctx.fill();
    }
  },

  updatePlayhead(follow) {
    const x = S.time * S.pps;
    $('#playhead').style.left = x + 'px';
    $('#tcur').textContent = fmtTime(S.time, P().fps);
    const ac = $('#aiCtx');
    if (ac && typeof aiCtxText === 'function') ac.textContent = aiCtxText();
    if (follow) {
      const sc = $('#tlScroll');
      if (x > sc.scrollLeft + sc.clientWidth - 40) sc.scrollLeft = x - 80;
      else if (x < sc.scrollLeft) sc.scrollLeft = Math.max(0, x - 80);
    }
  },

  setZoom(pps, anchorTime) {
    const sc = $('#tlScroll');
    const at = anchorTime != null ? anchorTime : S.time;
    const ax = at * S.pps - sc.scrollLeft;
    S.pps = clamp(pps, 2, 600);
    $('#zoom').value = Math.round((Math.log(S.pps / 2) / Math.log(300)) * 100);
    this.render();
    sc.scrollLeft = Math.max(0, at * S.pps - ax);
    this.drawRuler(); this.drawStrips();
  },
  zoomFit() {
    const d = projectDuration() || 10;
    this.setZoom(($('#tlScroll').clientWidth - 60) / d, 0);
    $('#tlScroll').scrollLeft = 0;
  },

  // ---------- Coordinates ----------
  timeAt(clientX) { const r = $('#tlTracks').getBoundingClientRect(); return Math.max(0, (clientX - r.left) / S.pps); },
  rowAt(clientY) {
    const r = $('#tlTracks').getBoundingClientRect();
    const y = clientY - r.top;
    if (y < 0) return { above: true, row: this.rows[0] };
    for (const row of this.rows) if (y >= row.y && y < row.y + row.h) return { row };
    return { below: true, row: this.rows[this.rows.length - 1] };
  },
  snapPoints(exclude) {
    const pts = [0, S.time];
    for (const c of P().clips) if (!exclude.has(c.id)) pts.push(c.start, c.start + c.dur);
    for (const m of P().markers) pts.push(m.t);
    return pts;
  },
  snap(t, pts) {
    if (!$('#snap').checked) return { t, hit: null };
    const th = 8 / S.pps;
    let best = null, bd = th;
    for (const p of pts) { const d = Math.abs(p - t); if (d < bd) { bd = d; best = p; } }
    return best != null ? { t: best, hit: best } : { t, hit: null };
  },
  showSnap(t) {
    const el = $('#snapLine');
    if (t == null) { el.style.display = 'none'; return; }
    el.style.display = 'block'; el.style.left = t * S.pps + 'px';
  },

  // ---------- Pointer interactions ----------
  init() {
    const tracks = $('#tlTracks');
    const sc = $('#tlScroll');
    sc.addEventListener('scroll', () => { this.drawRuler(); clearTimeout(this._st); this._st = setTimeout(() => this.drawStrips(), 30); $('#tlHeadList').style.transform = `translateY(${-sc.scrollTop}px)`; });
    sc.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.altKey) { e.preventDefault(); this.setZoom(S.pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15), this.timeAt(e.clientX)); }
      else if (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX) && sc.scrollHeight <= sc.clientHeight + 2) { e.preventDefault(); sc.scrollLeft += e.deltaY; }
    }, { passive: false });
    $('#ruler').addEventListener('pointerdown', (e) => this.scrubStart(e));
    $('#playhead .knob').addEventListener('pointerdown', (e) => this.scrubStart(e));
    $('#playhead .grab').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.scrubStart(e); });
    tracks.addEventListener('pointerdown', (e) => this.down(e));
    tracks.addEventListener('dblclick', (e) => {
      const el = e.target.closest('.clip'); if (!el) return;
      const c = clipById(el.dataset.clip);
      if (c && (c.type === 'text')) { INSP.tab = 'text'; INSP.render(); setTimeout(() => { const ta = $('#inspector textarea'); if (ta) { ta.focus(); ta.select(); } }, 0); }
    });
    tracks.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const el = e.target.closest('.clip');
      if (!el) { showMenu(e.clientX, e.clientY, [{ label: 'Вставить', key: 'Ctrl+V', action: smartPaste }, { label: 'Добавить маркер', key: 'M', action: () => cmd('marker') }]); return; }
      const c = clipById(el.dataset.clip);
      if (!S.sel.has(c.id)) selectOnly(c.id);
      const media = c.type === 'video' || c.type === 'audio';
      showMenu(e.clientX, e.clientY, [
        { label: 'Разделить', key: 'Ctrl+B', action: () => cmd('split') },
        { label: 'Копировать', key: 'Ctrl+C', action: copyClips },
        { label: 'Вырезать', key: 'Ctrl+X', action: () => { copyClips(); cmd('delete'); } },
        { label: 'Вставить', key: 'Ctrl+V', action: smartPaste },
        { label: 'Дублировать', key: 'Ctrl+D', action: () => cmd('duplicate') },
        '-',
        { label: 'Отделить аудио', disabled: !(c.type === 'video' && hasAudioTrack(c)), action: () => cmd('detachAudio') },
        { label: 'Реверс', disabled: !media, action: () => cmd('reverse') },
        { label: 'Стоп-кадр', disabled: c.type !== 'video', action: () => cmd('freeze') },
        { label: c.muted ? 'Включить звук' : 'Выключить звук', disabled: !media, action: () => change(() => { c.muted = !c.muted; }) },
        { label: 'Заменить медиа…', disabled: !(c.mediaId), action: () => replaceMedia(c) },
        '-',
        { label: 'Удалить', key: 'Del', action: () => cmd('delete') },
        { label: 'Удалить со сдвигом', key: 'Shift+Del', action: () => cmd('rippleDelete') },
      ]);
    });
    // Drag & drop from asset panels
    tracks.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('application/x-sklejka')) return;
      e.preventDefault();
      const { row } = this.rowAt(e.clientY);
      $$('.track.dropTarget').forEach((x) => x.classList.remove('dropTarget'));
      const el = $(`.track[data-track="${row.track.id}"]`); if (el) el.classList.add('dropTarget');
    });
    tracks.addEventListener('dragleave', () => $$('.track.dropTarget').forEach((x) => x.classList.remove('dropTarget')));
    tracks.addEventListener('drop', (e) => {
      $$('.track.dropTarget').forEach((x) => x.classList.remove('dropTarget'));
      const raw = e.dataTransfer.getData('application/x-sklejka');
      if (!raw) return;
      e.preventDefault();
      const d = JSON.parse(raw);
      const { row } = this.rowAt(e.clientY);
      dropAsset(d, this.timeAt(e.clientX), row.track);
    });
    window.addEventListener('resize', () => { this.drawRuler(); this.drawStrips(); });
  },

  scrubStart(e) {
    e.preventDefault();
    const was = S.playing; if (was) pause();
    const mv = (ev) => {
      let t = this.timeAt(ev.clientX);
      if (!ev.shiftKey) { const sn = this.snap(t, this.snapPoints(new Set()).slice(2).concat([0])); t = sn.t; }
      seek(t, true);
    };
    mv(e);
    $('#playhead').classList.add('drag');
    document.body.style.cursor = 'ew-resize';
    const sc = $('#tlScroll');
    // auto-scroll when dragging past the visible edge
    let lastX = e.clientX;
    const edge = setInterval(() => {
      const r = sc.getBoundingClientRect();
      if (lastX > r.right - 20) { sc.scrollLeft += 15; mv({ clientX: lastX, shiftKey: true }); }
      else if (lastX < r.left + 20 && sc.scrollLeft > 0) { sc.scrollLeft -= 15; mv({ clientX: lastX, shiftKey: true }); }
    }, 30);
    const track = (ev) => { lastX = ev.clientX; };
    const up = () => {
      clearInterval(edge);
      $('#playhead').classList.remove('drag');
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointermove', track); window.removeEventListener('pointerup', up);
      if (was) play();
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointermove', track); window.addEventListener('pointerup', up);
  },

  down(e) {
    if (e.button !== 0) return;
    const clipEl = e.target.closest('.clip');
    if (!clipEl) {
      // empty area: seek + marquee
      if (!e.ctrlKey && !e.shiftKey) { S.sel.clear(); }
      seek(this.timeAt(e.clientX));
      const r = $('#tlInner').getBoundingClientRect();
      const x0 = e.clientX - r.left, y0 = e.clientY - r.top;
      const mq = $('#marquee');
      const before = new Set(S.sel);
      const mv = (ev) => {
        const x1 = ev.clientX - r.left, y1 = ev.clientY - r.top;
        if (Math.abs(x1 - x0) < 4 && Math.abs(y1 - y0) < 4) return;
        Object.assign(mq.style, { display: 'block', left: Math.min(x0, x1) + 'px', top: Math.min(y0, y1) + 'px', width: Math.abs(x1 - x0) + 'px', height: Math.abs(y1 - y0) + 'px' });
        const mr = mq.getBoundingClientRect();
        S.sel = new Set(before);
        for (const ce of $$('.clip', $('#tlTracks'))) { const cr = ce.getBoundingClientRect(); if (cr.right > mr.left && cr.left < mr.right && cr.bottom > mr.top && cr.top < mr.bottom) S.sel.add(ce.dataset.clip); }
        $$('.clip', $('#tlTracks')).forEach((ce) => ce.classList.toggle('sel', S.sel.has(ce.dataset.clip)));
      };
      const up = () => { mq.style.display = 'none'; window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); onSelChange(); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      onSelChange();
      return;
    }
    const c = clipById(clipEl.dataset.clip);
    const tr = trackById(c.trackId);
    if (e.ctrlKey || e.metaKey) { if (S.sel.has(c.id)) S.sel.delete(c.id); else S.sel.add(c.id); onSelChange(); return; }
    if (!S.sel.has(c.id) || e.shiftKey) { if (!e.shiftKey) S.sel.clear(); S.sel.add(c.id); onSelChange(); }
    if (tr.locked) return;
    const trim = e.target.dataset.trim;
    const startX = e.clientX, startY = e.clientY;
    let moved = false, undoPushed = false;
    const sel = P().clips.filter((x) => S.sel.has(x.id) && !trackById(x.trackId).locked);
    const orig = new Map(sel.map((x) => [x.id, { start: x.start, dur: x.dur, in: x.in, trackId: x.trackId }]));
    const pts = this.snapPoints(new Set(sel.map((x) => x.id)));
    const m = c.mediaId ? mediaById(c.mediaId) : null;
    const limited = m && m.type !== 'image' && c.freeze == null;
    const mv = (ev) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) < 3 && Math.abs(ev.clientY - startY) < 3) return;
      if (!undoPushed) { pushUndo(); undoPushed = true; }
      moved = true;
      const dt = dx / S.pps;
      const o = orig.get(c.id);
      if (trim === 'l') {
        let ns = this.snap(o.start + dt, pts);
        let d = ns.t - o.start;
        const minD = 2 / P().fps;
        if (c.in != null && limited) d = Math.max(d, -o.in / c.speed);
        d = Math.min(d, o.dur - minD);
        d = Math.max(d, -o.start);
        c.start = o.start + d; c.dur = o.dur - d;
        if (c.in != null && c.freeze == null) c.in = o.in + d * c.speed;
        this.showSnap(ns.hit != null && Math.abs(ns.t - c.start) < 1e-6 ? ns.hit : null);
      } else if (trim === 'r') {
        let ns = this.snap(o.start + o.dur + dt, pts);
        let nd = ns.t - o.start;
        nd = Math.max(nd, 2 / P().fps);
        if (limited) nd = Math.min(nd, (m.duration - c.in) / c.speed);
        c.dur = nd;
        this.showSnap(ns.hit != null && Math.abs(ns.t - (c.start + c.dur)) < 1e-6 ? ns.hit : null);
      } else {
        // move: snap the leading clip's start or end
        let ns = this.snap(o.start + dt, pts);
        let ne = this.snap(o.start + o.dur + dt, pts);
        let shift = dt, hit = null;
        if (ns.hit != null && (ne.hit == null || Math.abs(ns.t - (o.start + dt)) <= Math.abs(ne.t - (o.start + o.dur + dt)))) { shift = ns.t - o.start; hit = ns.hit; }
        else if (ne.hit != null) { shift = ne.t - o.start - o.dur; hit = ne.hit; }
        const minStart = Math.min(...sel.map((x) => orig.get(x.id).start));
        shift = Math.max(shift, -minStart);
        for (const x of sel) x.start = orig.get(x.id).start + shift;
        this.showSnap(hit);
        if (sel.length === 1) {
          const { row, above, below } = this.rowAt(ev.clientY);
          if (row && row.track.kind === KIND_OF[c.type]) c.trackId = row.track.id;
          this._newTrack = (above || below) ? { above, kind: KIND_OF[c.type] } : null;
        }
      }
      // live update element positions (captions linked to a moved clip follow it)
      if (!trim) {
        syncLinked();
        for (const x of P().clips) if (x.link && orig.has(x.link)) { const el = $(`.clip[data-clip="${x.id}"]`); if (el) el.style.left = x.start * S.pps + 'px'; }
      }
      for (const x of sel) {
        let el = $(`.clip[data-clip="${x.id}"]`);
        const row = $(`.track[data-track="${x.trackId}"]`);
        if (el && row && el.parentElement !== row) row.append(el);
        if (el) { el.style.left = x.start * S.pps + 'px'; el.style.width = Math.max(4, x.dur * S.pps) + 'px'; el.classList.add('ghost'); }
      }
      if (trim) seekPreviewForTrim(c, trim);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      this.showSnap(null);
      if (!moved) { if (!e.shiftKey && S.sel.size > 1) { selectOnly(c.id); } return; }
      if (!trim && sel.length === 1) {
        if (this._newTrack) {
          const kind = this._newTrack.kind;
          const ref = this._newTrack.above ? P().tracks.find((t) => t.kind === kind) : [...P().tracks].reverse().find((t) => t.kind === kind);
          const nt = addTrack(kind, ref ? ref.id : null, !this._newTrack.above);
          c.trackId = nt.id;
        }
        resolveOverlap(c);
      }
      this._newTrack = null;
      afterChange();
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  },
};

function seekPreviewForTrim(c, side) {
  S.time = side === 'l' ? c.start : Math.max(c.start, c.start + c.dur - 1 / P().fps);
  requestRender(); TL.updatePlayhead();
}

// ---------- Track helpers ----------
function addTrack(kind, refId, below) {
  const pr = P();
  const n = pr.tracks.filter((t) => t.kind === kind).length + 1;
  const tr = { id: uid('t'), kind, name: (kind === 'video' ? 'Наложение' : KIND_LABEL[kind]) + ' ' + n };
  let idx;
  if (refId) idx = pr.tracks.findIndex((t) => t.id === refId) + (below ? 1 : 0);
  else if (kind === 'audio') idx = pr.tracks.length;
  else if (kind === 'video') idx = pr.tracks.findIndex((t) => t.main);
  else if (kind === 'fx') idx = pr.tracks.findIndex((t) => t.kind === 'video');
  else idx = 0;
  if (kind === 'video') { const mi = pr.tracks.findIndex((t) => t.main); if (idx > mi) idx = mi; }
  if (kind === 'audio') { const mi = pr.tracks.findIndex((t) => t.main); if (idx <= mi) idx = mi + 1; }
  pr.tracks.splice(Math.max(0, idx), 0, tr);
  return tr;
}
function overlaps(c, trackId, start = c.start, dur = c.dur) {
  return P().clips.some((o) => o !== c && o.trackId === trackId && o.start < start + dur - 1e-4 && o.start + o.dur > start + 1e-4);
}
function resolveOverlap(c) {
  const tr = trackById(c.trackId);
  if (tr.main && $('#magnet').checked) return; // magnet re-packs
  if (!overlaps(c, c.trackId)) return;
  // try other tracks of same kind
  for (const t of P().tracks) if (t.kind === tr.kind && !t.main && !t.locked && !overlaps(c, t.id)) { c.trackId = t.id; return; }
  const nt = addTrack(tr.kind, tr.id, tr.kind === 'audio');
  c.trackId = nt.id;
}
function freeTrack(kind, start, dur, preferId) {
  const probe = { id: '__probe' };
  if (preferId && !overlaps(probe, preferId, start, dur)) return trackById(preferId);
  for (const t of P().tracks) if (t.kind === kind && !t.main && !t.locked && !overlaps(probe, t.id, start, dur)) return t;
  return addTrack(kind);
}
function packMain() {
  if (!$('#magnet').checked) return;
  const main = P().tracks.find((t) => t.main);
  if (!main) return;
  let t = 0;
  for (const c of clipsOn(main.id)) { c.start = t; t += c.dur; }
}
