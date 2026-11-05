'use strict';
// ============ State ============
const S = {
  project: null,
  time: 0,
  playing: false,
  sel: new Set(),
  pps: 60, // timeline pixels per second
  cache: {}, // mediaId -> { img, sprite, spriteCount, peaks }
  bounds: {}, // clipId -> { cx, cy, w, h, rot } in project px
  previewScale: 0.75,
  exporting: false,
  dirty: false,
};

function newProject(mode = 'video') {
  const id = (k) => uid('t');
  if (mode === 'audio') return {
    version: 1, mode, name: 'Без названия',
    ratio: '16:9', width: 1920, height: 1080, fps: 30,
    bg: { type: 'color', color: '#000000', blur: 40 },
    media: [],
    tracks: [{ id: id(), kind: 'audio', name: 'Дорожка 1', main: true }, { id: id(), kind: 'audio', name: 'Дорожка 2' }, { id: id(), kind: 'audio', name: 'Дорожка 3' }],
    clips: [], markers: [],
  };
  if (mode === 'photo') return {
    version: 1, mode, name: 'Без названия',
    ratio: 'custom', width: 1080, height: 1080, fps: 30,
    bg: { type: 'color', color: '#ffffff', blur: 40 },
    media: [],
    tracks: [{ id: id(), kind: 'text', name: 'Текст' }, { id: id(), kind: 'video', name: 'Фон', main: true }],
    clips: [], markers: [],
  };
  return {
    version: 1,
    mode,
    name: 'Без названия',
    ratio: '16:9', width: 1920, height: 1080, fps: 30,
    bg: { type: 'color', color: '#000000', blur: 40 },
    media: [],
    tracks: [
      { id: id(), kind: 'text', name: 'Текст' },
      { id: id(), kind: 'fx', name: 'Эффекты' },
      { id: id(), kind: 'video', name: 'Наложение' },
      { id: id(), kind: 'video', name: 'Главная', main: true },
      { id: id(), kind: 'audio', name: 'Аудио' },
    ],
    clips: [],
    markers: [],
  };
}

const P = () => S.project;
const mediaById = (id) => P().media.find((m) => m.id === id);
const trackById = (id) => P().tracks.find((t) => t.id === id);
const clipById = (id) => P().clips.find((c) => c.id === id);
const clipsOn = (trackId) => P().clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
const projectDuration = () => P().clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0);
const isVisual = (c) => ['video', 'image', 'text', 'sticker', 'gen'].includes(c.type);
const hasAudioTrack = (c) => (c.type === 'video' || c.type === 'audio') && (mediaById(c.mediaId) || {}).hasAudio;
const KIND_OF = { video: 'video', image: 'video', text: 'text', sticker: 'text', gen: 'text', fx: 'fx', filter: 'fx', adjust: 'fx', audio: 'audio' };

function makeClip(type, extra = {}) {
  const c = {
    id: uid('c'), type, trackId: null, start: 0, dur: 3, name: '',
    tf: { x: 0, y: 0, scale: 1, rot: 0, opacity: 1, flipH: false, flipV: false },
    kf: {}, blend: 'source-over',
    anim: { in: 'none', inDur: 0.5, out: 'none', outDur: 0.5, loop: 'none', loopSpeed: 1 },
  };
  if (type === 'video' || type === 'image' || type === 'audio') Object.assign(c, { mediaId: null, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, muted: false, freeze: null });
  if (type === 'video' || type === 'image') Object.assign(c, { filter: { id: 'none', amt: 1 }, adj: { ...ADJUST_DEFAULT }, fxList: [], chroma: { on: false, color: '#00ff00', sim: 0.35, smooth: 0.1 }, trans: null, mask: { ...MASK_DEFAULT } });
  if (type === 'text' || type === 'sticker') Object.assign(c, { text: { ...TEXT_DEFAULT }, words: null, fxList: [], trans: null });
  if (type === 'gen') Object.assign(c, { gen: { id: 'achievement', text: '', text2: '', color: '#2a2f3d', color2: '#ffc83c' }, fxList: [], trans: null });
  if (type === 'fx') c.fx = { id: 'shake', amt: 0.6 };
  if (type === 'filter') c.filter = { id: 'vivid', amt: 1 };
  if (type === 'adjust') c.adj = { ...ADJUST_DEFAULT };
  return Object.assign(c, extra);
}

// ============ Keyframes & animation ============
const KF_PROPS = ['x', 'y', 'scale', 'rot', 'opacity'];
function propAt(c, name, t) {
  const list = c.kf && c.kf[name];
  if (!list || !list.length) return c.tf[name];
  const lt = t - c.start;
  if (lt <= list[0].t) return list[0].v;
  if (lt >= list[list.length - 1].t) return list[list.length - 1].v;
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1];
    if (lt >= a.t && lt <= b.t) return lerp(a.v, b.v, easeInOut((lt - a.t) / Math.max(1e-6, b.t - a.t)));
  }
  return c.tf[name];
}
function easeBounce(x) {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}
function applyAnim(vs, id, p, isOut) {
  if (id === 'none' || p >= 1) return;
  const e = easeOut(p);
  const W = P().width, H = P().height;
  if (isOut) { if (id === 'zoomIn') id = 'zoomOut'; else if (id === 'zoomOut') id = 'zoomIn'; else if (id === 'slideU') id = 'slideD2'; else if (id === 'slideD') id = 'slideU2'; }
  switch (id) {
    case 'fade': vs.alpha *= p; break;
    case 'zoomIn': vs.scale *= lerp(0.3, 1, e); vs.alpha *= p; break;
    case 'zoomOut': vs.scale *= lerp(1.8, 1, e); vs.alpha *= p; break;
    case 'slideL': vs.x -= W * 0.6 * (1 - e); vs.alpha *= Math.min(1, p * 2); break;
    case 'slideR': vs.x += W * 0.6 * (1 - e); vs.alpha *= Math.min(1, p * 2); break;
    case 'slideU': vs.y += H * 0.5 * (1 - e); vs.alpha *= Math.min(1, p * 2); break;
    case 'slideD': vs.y -= H * 0.5 * (1 - e); vs.alpha *= Math.min(1, p * 2); break;
    case 'slideU2': vs.y += H * 0.5 * (1 - e); vs.alpha *= Math.min(1, p * 2); break;
    case 'slideD2': vs.y -= H * 0.5 * (1 - e); vs.alpha *= Math.min(1, p * 2); break;
    case 'pop': vs.scale *= Math.max(0, easeBack(p)); vs.alpha *= Math.min(1, p * 3); break;
    case 'spin': vs.rot += (isOut ? 180 : -180) * (1 - e); vs.scale *= lerp(0.3, 1, e); vs.alpha *= p; break;
    case 'blur': vs.blur += 40 * (1 - p); vs.alpha *= p; break;
    case 'drop': vs.y -= H * 0.6 * (1 - easeBounce(p)); break;
    case 'elastic': vs.scale *= Math.max(0, easeElastic(p)); break;
    case 'flip': vs.sx *= Math.max(0.001, e); vs.alpha *= Math.min(1, p * 2); break;
  }
}
function applyLoop(vs, id, lt, speed) {
  if (!id || id === 'none') return;
  const t = lt * (speed || 1);
  const H = P().height;
  switch (id) {
    case 'pulse': vs.scale *= 1 + 0.06 * Math.sin(t * Math.PI * 2 * 1.2); break;
    case 'swing': vs.rot += 8 * Math.sin(t * Math.PI * 2 * 0.8); break;
    case 'float': vs.y += H * 0.02 * Math.sin(t * Math.PI * 2 * 0.6); break;
    case 'shake': vs.x += noise1(t * 18) * 12; vs.y += noise1(t * 18 + 40) * 12; vs.rot += noise1(t * 14 + 9) * 2; break;
    case 'spin': vs.rot += 120 * t; break;
    case 'heartbeat': { const ph = (t % 1); vs.scale *= 1 + 0.12 * (Math.exp(-ph * 14) + 0.6 * Math.exp(-Math.max(0, ph - 0.22) * 14) * (ph > 0.22)); break; }
    case 'wobble': { const s = Math.sin(t * Math.PI * 2 * 1.5) * 0.07; vs.sx *= 1 + s; vs.sy *= 1 - s; break; }
    case 'blink': vs.alpha *= Math.sin(t * Math.PI * 2 * 1.3) > -0.4 ? 1 : 0.15; break;
  }
}
function visualState(c, t) {
  const vs = {
    x: propAt(c, 'x', t), y: propAt(c, 'y', t), scale: propAt(c, 'scale', t), rot: propAt(c, 'rot', t), alpha: propAt(c, 'opacity', t),
    sx: c.tf.flipH ? -1 : 1, sy: c.tf.flipV ? -1 : 1, blur: 0,
  };
  const lt = t - c.start;
  const a = c.anim || {};
  if (a.in && a.in !== 'none') applyAnim(vs, a.in, clamp(lt / Math.max(0.05, a.inDur), 0, 1), false);
  if (a.out && a.out !== 'none') applyAnim(vs, a.out, clamp((c.dur - lt) / Math.max(0.05, a.outDur), 0, 1), true);
  applyLoop(vs, a.loop, lt, a.loopSpeed);
  return vs;
}

// ============ Media sources (preview) ============
const AC = new (window.AudioContext || window.webkitAudioContext)();
// everything the preview plays goes through here, the audio editor's spectrum listens to it
const AC_MASTER = AC.createGain(), AC_AN = AC.createAnalyser();
AC_AN.fftSize = 2048;
AC_MASTER.connect(AC_AN);
AC_MASTER.connect(AC.destination);
const elPool = new Map(); // player key -> { el, src, gain, owner }
// preview plays the light proxy copy when it is ready (export always reads m.path)
function mediaPath(m) { const cc = S.cache[m.id]; return (S.useProxy !== false && cc && cc.proxy) || m.path; }
// Players are shared: per media file and track there are two <video> elements used in turn
// (even/odd clips), so while one plays the other is already seeked to the next clip.
// A timeline cut into hundreds of pieces therefore needs 2 players, not hundreds.
let laneMap = new Map(), laneVer = -1, laneClips = null;
function laneIndex(c) {
  if (laneVer !== S.ver || laneClips !== P().clips) {
    laneMap = new Map();
    for (const tr of P().tracks) clipsOn(tr.id).forEach((x, i) => laneMap.set(x.id, i));
    laneVer = S.ver; laneClips = P().clips;
  }
  return laneMap.get(c.id) || 0;
}
const elKey = (c) => `${c.mediaId}|${c.trackId}|${laneIndex(c) % 2}`;
function getEl(c) {
  const m = mediaById(c.mediaId);
  if (!m) return null;
  const src = fileUrl(mediaPath(m));
  const key = elKey(c);
  let e = elPool.get(key);
  if (e && e.src !== src) { e.el.pause(); e.el.removeAttribute('src'); e.el.load(); e.el.remove(); elPool.delete(key); e = null; }
  if (!e) {
    const el = document.createElement(m.type === 'audio' ? 'audio' : 'video');
    el.preload = 'auto';
    el.playsInline = true;
    el.src = src;
    el.preservesPitch = true;
    // keep it in the page and "visible" (1 px, almost transparent) so Chromium decodes at full rate
    let pool = document.getElementById('mediaPool');
    if (!pool) { pool = h('div', { id: 'mediaPool', style: { position: 'fixed', left: 0, top: 0, width: '2px', height: '2px', overflow: 'hidden', opacity: 0.01, pointerEvents: 'none', zIndex: -1 } }); document.body.append(pool); }
    Object.assign(el.style, { width: '2px', height: '2px' });
    pool.append(el);
    let gain = null;
    try {
      const node = AC.createMediaElementSource(el);
      gain = AC.createGain();
      node.connect(gain).connect(AC_MASTER);
    } catch (_) {}
    e = { el, src, gain, pending: null, cache: null, cacheOk: false, owner: null };
    const ent = e;
    el.addEventListener('seeked', () => {
      // scrubbing: jump straight to the newest requested time once the previous seek lands
      if (ent.pending != null) { const p = ent.pending; ent.pending = null; if (Math.abs(el.currentTime - p) > 0.01) el.currentTime = p; }
      if (!S.playing) requestRender();
    });
    el.addEventListener('loadeddata', () => requestRender());
    elPool.set(key, e);
  }
  return e;
}
function getImg(m) {
  const cc = (S.cache[m.id] = S.cache[m.id] || {});
  if (!cc.img) {
    cc.img = new Image();
    cc.img.onload = () => { requestRender(); if ((typeof TL !== 'undefined')) TL.render(); };
    cc.img.src = fileUrl(m.path);
  }
  return cc.img;
}
function srcTime(c, t) {
  const m = mediaById(c.mediaId);
  const dur = m ? m.duration : 0;
  const s = c.freeze != null ? c.freeze : c.in + (t - c.start) * c.speed;
  return dur ? clamp(s, 0, Math.max(0, dur - 0.04)) : s;
}
function fadeGain(c, t) {
  const lt = t - c.start;
  let g = 1;
  if (c.fadeIn > 0) g *= clamp(lt / c.fadeIn, 0, 1);
  if (c.fadeOut > 0) g *= clamp((c.dur - lt) / c.fadeOut, 0, 1);
  return g;
}
function prevOnTrack(c) {
  const list = clipsOn(c.trackId);
  let best = null;
  for (const o of list) if (o !== c && Math.abs(o.start + o.dur - c.start) < 0.05 && isVisual(o)) best = o;
  return best;
}
function activeAt(c, t) { return t >= c.start - 1e-6 && t < c.start + c.dur - 1e-6; }

// Media clips needed at time t: { clip, extended }
function neededMedia(t) {
  const out = [];
  for (const c of P().clips) {
    if (c.type !== 'video' && c.type !== 'audio') continue;
    if (activeAt(c, t)) out.push({ c, ext: false });
  }
  for (const c of P().clips) {
    if (!c.trans || !activeAt(c, t) || t > c.start + c.trans.dur) continue;
    const pv = prevOnTrack(c);
    if (pv && pv.type === 'video') out.push({ c: pv, ext: true });
  }
  return out;
}

function syncMedia(t, playing) {
  const need = neededMedia(t);
  const ids = new Set(need.map((n) => n.c.id));
  const keys = new Set(need.map((n) => elKey(n.c)));
  // pre-roll: the next clip on each lane gets its (idle) player seeked and buffered in advance
  const upcoming = P().clips.filter((c) => (c.type === 'video' || c.type === 'audio') && !ids.has(c.id) && c.start > t && c.start - t < 1.5).sort((a, b) => a.start - b.start);
  for (const c of upcoming) {
    const key = elKey(c);
    if (keys.has(key)) continue; // that player is busy with the current clip
    const e = getEl(c);
    if (!e) continue;
    keys.add(key);
    e.owner = c.id; e.pending = null;
    if (!e.el.paused) e.el.pause();
    if (e.gain) e.gain.gain.value = 0;
    const st0 = srcTime(c, c.start);
    if (!e.el.seeking && Math.abs(e.el.currentTime - st0) > 0.05) e.el.currentTime = st0;
  }
  for (const [key, e] of elPool) if (!keys.has(key) && !e.el.paused) e.el.pause();
  for (const { c, ext } of need) {
    const e = getEl(c);
    if (!e) continue;
    const el = e.el;
    const fresh = e.owner !== c.id;
    if (fresh) { e.owner = c.id; e.pending = null; }
    const tr = trackById(c.trackId);
    const st = srcTime(c, t);
    let g = ext || c.muted || (tr && tr.muted) || c.freeze != null ? 0 : c.volume * fadeGain(c, t);
    if (e.gain) e.gain.gain.value = g; else el.volume = clamp(g, 0, 1);
    if (playing && c.freeze == null) {
      const rate = clamp(c.speed, 0.0625, 16);
      if (el.playbackRate !== rate) el.playbackRate = rate;
      e.pending = null;
      if (el.paused || fresh) {
        if (Math.abs(el.currentTime - st) > 0.08) el.currentTime = st;
        if (el.paused) el.play().catch(() => {});
      } else if (S.clockId !== c.id && !el.seeking && Math.abs(el.currentTime - st) > 0.35 * Math.max(1, c.speed)) {
        // only secondary elements are corrected; the clock element defines the time itself
        el.currentTime = st;
      }
    } else {
      if (!el.paused) el.pause();
      if (Math.abs(el.currentTime - st) > 0.5 / P().fps) {
        // don't restart a seek that is still decoding — queue the latest target instead
        if (el.seeking) e.pending = st; else el.currentTime = st;
      } else e.pending = null;
    }
  }
}
// The element that drives playback time: prefer a clip with sound on the main track
function pickClock(t) {
  let best = null, score = -1;
  for (const { c, ext } of neededMedia(t)) {
    if (ext || c.freeze != null) continue;
    const e = elPool.get(elKey(c));
    if (!e || e.owner !== c.id) continue;
    const tr = trackById(c.trackId);
    const s = (hasAudioTrack(c) ? 2 : 0) + (tr && tr.main ? 1 : 0);
    if (s > score) { score = s; best = { c, el: e.el }; }
  }
  return best;
}
function pauseAll() { for (const e of elPool.values()) e.el.pause(); }
function scrubBlip() {
  if (!$('#scrubAudio').checked) return;
  const need = neededMedia(S.time).filter((n) => !n.ext && hasAudioTrack(n.c));
  for (const { c } of need) {
    const e = getEl(c); if (!e) continue;
    e.el.play().catch(() => {});
    clearTimeout(e._blip);
    e._blip = setTimeout(() => { if (!S.playing) e.el.pause(); }, 120);
  }
}

// ============ Canvas helpers ============
class CanvasPool {
  constructor() { this.list = []; }
  get(i, w, h) {
    let c = this.list[i];
    if (!c) { c = document.createElement('canvas'); this.list[i] = c; }
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext('2d', { willReadFrequently: false });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    ctx.clearRect(0, 0, w, h);
    return c;
  }
}
const layers = new CanvasPool();
const scratch = new CanvasPool();
let noiseTiles = null;
function noiseTile(i) {
  if (!noiseTiles) {
    noiseTiles = [];
    for (let n = 0; n < 6; n++) {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const x = c.getContext('2d'); const d = x.createImageData(256, 256);
      for (let p = 0; p < d.data.length; p += 4) { const v = Math.random() * 255; d.data[p] = d.data[p + 1] = d.data[p + 2] = v; d.data[p + 3] = 255; }
      x.putImageData(d, 0, 0); noiseTiles.push(c);
    }
  }
  return noiseTiles[((i % 6) + 6) % 6];
}

// Build CSS filter + overlay tints from filter preset and adjustments
function lookFor(filter, adj) {
  const f = (filter && FILTERS.find((x) => x.id === filter.id)) || FILTERS[0];
  const amt = filter ? filter.amt : 1;
  const p = f.p;
  const L = (v, n) => lerp(n, v == null ? n : v, amt);
  const a = adj || ADJUST_DEFAULT;
  let b = L(p.b, 1) * (1 + a.brightness / 200) * Math.pow(2, a.exposure / 100);
  let c = L(p.c, 1) * (1 + a.contrast / 150);
  let s = L(p.s, 1) * (1 + a.saturation / 100);
  const hue = L(p.h, 0) + a.hue;
  const parts = [];
  if (Math.abs(b - 1) > 1e-3) parts.push(`brightness(${b.toFixed(3)})`);
  if (Math.abs(c - 1) > 1e-3) parts.push(`contrast(${c.toFixed(3)})`);
  if (Math.abs(s - 1) > 1e-3) parts.push(`saturate(${Math.max(0, s).toFixed(3)})`);
  if (hue) parts.push(`hue-rotate(${hue.toFixed(1)}deg)`);
  if (p.sep) parts.push(`sepia(${L(p.sep, 0).toFixed(3)})`);
  if (p.gray) parts.push(`grayscale(${L(p.gray, 0).toFixed(3)})`);
  if (p.inv) parts.push(`invert(${L(p.inv, 0).toFixed(3)})`);
  const tints = [];
  if (p.tint) tints.push({ color: p.tint, a: p.ta * amt, mode: p.tb || 'soft-light' });
  if (p.tint2) tints.push({ color: p.tint2, a: p.ta2 * amt, mode: 'soft-light' });
  if (a.temperature) tints.push({ color: a.temperature > 0 ? '#ff8a1e' : '#1e8aff', a: Math.abs(a.temperature) / 100 * 0.35, mode: 'soft-light' });
  if (a.tint) tints.push({ color: a.tint > 0 ? '#ff1ee6' : '#1eff6a', a: Math.abs(a.tint) / 100 * 0.25, mode: 'soft-light' });
  const fade = L(p.fade, 0) + a.fade / 100 * 0.35;
  if (fade > 0) tints.push({ color: '#808080', a: fade, mode: 'lighten' });
  return { css: parts.join(' '), tints, vignette: a.vignette / 100, grain: a.grain / 100, blur: a.blur / 100 * 30 };
}

function applyTints(ctx, look, w, h, t) {
  for (const ti of look.tints) {
    ctx.globalCompositeOperation = ti.mode; ctx.globalAlpha = clamp(ti.a, 0, 1);
    ctx.fillStyle = ti.color; ctx.fillRect(0, 0, w, h);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  if (look.vignette > 0) drawVignette(ctx, w, h, look.vignette);
  if (look.grain > 0) {
    ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = look.grain * 0.5;
    ctx.fillStyle = ctx.createPattern(noiseTile(Math.floor(t * 24)), 'repeat'); ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
}
function drawVignette(ctx, w, h, amt) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) / 2);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${clamp(amt, 0, 1) * 0.85})`);
  ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

function chromaKey(src, sw, sh, ck) {
  const cv = scratch.get(9, Math.max(1, Math.round(sw)), Math.max(1, Math.round(sh)));
  const x = cv.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0, cv.width, cv.height);
  const d = x.getImageData(0, 0, cv.width, cv.height);
  const [kr, kg, kb] = hexToRgb(ck.color);
  const sim = ck.sim * 255 * 1.2, sm = Math.max(1, ck.smooth * 255);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const dr = px[i] - kr, dg = px[i + 1] - kg, db = px[i + 2] - kb;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db) * 0.577;
    if (dist < sim) px[i + 3] = 0;
    else if (dist < sim + sm) px[i + 3] = px[i + 3] * ((dist - sim) / sm);
    // spill suppression
    if (kg > kr && kg > kb && px[i + 1] > Math.max(px[i], px[i + 2])) px[i + 1] = Math.max(px[i], px[i + 2]);
  }
  x.putImageData(d, 0, 0);
  return cv;
}

// ============ Text ============
function textFont(tx, k) {
  return `${tx.italic ? 'italic ' : ''}${tx.bold ? '700 ' : '400 '}${Math.max(1, tx.size * k)}px "${tx.font}"`;
}
function layoutText(ctx, tx, k) {
  ctx.font = textFont(tx, k);
  ctx.letterSpacing = (tx.letterSpacing * k) + 'px';
  const maxW = (tx.maxWidth || 0.86) * P().width * k;
  const raw = (tx.uppercase ? tx.text.toUpperCase() : tx.text).split('\n');
  const lines = [];
  const space = ctx.measureText(' ').width;
  let wi = 0;
  for (const para of raw) {
    const words = para.split(/ +/).filter((w, i, a) => w.length || a.length === 1);
    let line = [], lw = 0;
    for (const w of words) {
      const ww = ctx.measureText(w).width;
      if (line.length && lw + space + ww > maxW) { lines.push({ words: line, w: lw }); line = []; lw = 0; }
      lw += (line.length ? space : 0) + ww;
      line.push({ text: w, w: ww, i: wi++ });
    }
    lines.push({ words: line, w: lw });
  }
  const lh = tx.size * k * tx.lineHeight;
  const bw = Math.max(1, ...lines.map((l) => l.w));
  return { lines, lh, w: bw, h: lh * lines.length, space, count: wi };
}
function drawText(ctx, c, t, k) {
  const tx = c.text;
  const L = layoutText(ctx, tx, k);
  const lt = t - c.start;
  const totalChars = tx.text.length;
  let visibleChars = Infinity, activeWord = -1, wordsShown = Infinity;
  const anim = tx.textAnim;
  if (anim === 'typewriter') visibleChars = Math.floor(totalChars * clamp(lt / Math.min(c.dur * 0.7, Math.max(0.3, totalChars * 0.07)), 0, 1));
  if (anim === 'words') wordsShown = Math.floor(L.count * clamp(lt / Math.min(c.dur * 0.7, L.count * 0.25), 0, 1)) + 1;
  if (anim === 'karaoke') {
    if (c.words && c.words.length) { activeWord = c.words.findIndex((w) => lt >= w.start && lt < w.end); if (activeWord < 0) activeWord = c.words.filter((w) => w.start <= lt).length - 1; }
    else activeWord = Math.floor(L.count * clamp(lt / c.dur, 0, 0.999));
  }
  const padX = tx.size * k * 0.35, padY = tx.size * k * 0.15;
  const bx = -L.w / 2, by = -L.h / 2;
  if (tx.bgOpacity > 0) {
    ctx.save();
    ctx.globalAlpha *= tx.bgOpacity;
    ctx.fillStyle = tx.bgColor;
    ctx.beginPath();
    ctx.roundRect(bx - padX, by - padY, L.w + padX * 2, L.h + padY * 2, tx.bgRadius * k);
    ctx.fill();
    ctx.restore();
  }
  if (anim === 'reveal') {
    ctx.beginPath();
    ctx.rect(bx - padX, by - padY - L.h, (L.w + padX * 2) * easeOut(clamp(lt / Math.min(1, c.dur * 0.6), 0, 1)), L.h * 3 + padY * 2);
    ctx.clip();
  }
  let fill = tx.color;
  if (tx.gradient) { const g = ctx.createLinearGradient(0, by, 0, by + L.h); g.addColorStop(0, tx.color); g.addColorStop(1, tx.color2); fill = g; }
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  let charCount = 0;
  L.lines.forEach((line, li) => {
    const y = by + L.lh * (li + 0.5);
    let x = tx.align === 'left' ? bx : tx.align === 'right' ? bx + L.w - line.w : -line.w / 2;
    for (const w of line.words) {
      let str = w.text;
      if (charCount >= visibleChars) return;
      if (charCount + str.length > visibleChars) str = str.slice(0, visibleChars - charCount);
      charCount += w.text.length + 1;
      if (w.i >= wordsShown) return;
      ctx.save();
      let col = fill, sc = 1, dy = 0, al = 1;
      if (anim === 'words' && w.i === wordsShown - 1) { const p = clamp((lt % 0.25) / 0.25, 0, 1); al = p; dy = (1 - easeOut(p)) * 20 * k; }
      if (anim === 'karaoke') { if (w.i === activeWord) { col = tx.highlightColor; sc = 1.08; } }
      ctx.globalAlpha *= al;
      ctx.translate(x + w.w / 2, y + dy);
      ctx.scale(sc, sc);
      ctx.translate(-w.w / 2, 0);
      if (anim === 'letters') drawLetters(ctx, str, tx, col, k, lt, w.i);
      else drawWord(ctx, str, tx, col, k);
      ctx.restore();
      x += w.w + L.space;
    }
  });
  return { w: L.w + padX * 2, h: L.h + padY * 2 };
}
function drawWord(ctx, str, tx, col, k) {
  if (tx.glow > 0) { ctx.shadowColor = tx.glowColor; ctx.shadowBlur = tx.glow * k; ctx.fillStyle = col; ctx.fillText(str, 0, 0); ctx.fillText(str, 0, 0); }
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  if (tx.shadowBlur > 0 || tx.shadowDist > 0) { ctx.shadowColor = tx.shadowColor; ctx.shadowBlur = tx.shadowBlur * k; ctx.shadowOffsetX = tx.shadowDist * k * 0.7; ctx.shadowOffsetY = tx.shadowDist * k * 0.7; }
  if (tx.strokeWidth > 0) { ctx.lineWidth = tx.strokeWidth * 2 * k; ctx.strokeStyle = tx.strokeColor; ctx.strokeText(str, 0, 0); ctx.shadowColor = 'transparent'; }
  ctx.fillStyle = col; ctx.fillText(str, 0, 0);
  if (tx.underline) { const w = ctx.measureText(str).width; ctx.fillRect(0, tx.size * k * 0.42, w, Math.max(1, tx.size * k * 0.06)); }
}
function drawLetters(ctx, str, tx, col, k, lt, wi) {
  let x = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const delay = (wi * 4 + i) * 0.04;
    const p = clamp((lt - delay) / 0.35, 0, 1);
    const cw = ctx.measureText(ch).width;
    if (p > 0) {
      ctx.save();
      ctx.globalAlpha *= p;
      ctx.translate(x, -(1 - easeBack(p)) * tx.size * k * 0.6);
      drawWord(ctx, ch, tx, col, k);
      ctx.restore();
    }
    x += cw + tx.letterSpacing * k;
  }
}

// ============ Clip layer rendering ============
// src provider: (clip, t) -> drawable or null. Preview uses <video>, export uses decoded frames.
let frameSource = previewSource;
function previewSource(c) {
  const m = mediaById(c.mediaId);
  if (!m) return null;
  if (m.type === 'image') { const im = getImg(m); return im.complete && im.naturalWidth ? im : null; }
  const e = getEl(c);
  if (!e) return null;
  const el = e.el;
  const ready = e.owner === c.id && el.readyState >= 2 && !el.seeking;
  if (ready) {
    // remember the last decoded frame so a seek/buffering moment shows a picture, never black
    // (while playing, refresh it ~8 times a second to keep it cheap)
    const now = performance.now();
    if (!S.playing || !e.cacheAt || now - e.cacheAt > 120) {
      const w = Math.min(el.videoWidth, S.playing ? 960 : 1280), hh = Math.round(w * el.videoHeight / el.videoWidth) || 1;
      if (w > 0) {
        if (!e.cache) e.cache = document.createElement('canvas');
        if (e.cache.width !== w || e.cache.height !== hh) { e.cache.width = w; e.cache.height = hh; }
        e.cache.getContext('2d').drawImage(el, 0, 0, w, hh);
        e.cacheOk = true; e.cacheT = el.currentTime; e.cacheAt = now;
      }
    }
    return el;
  }
  const want = srcTime(c, S.time);
  if (e.cacheOk && Math.abs(e.cacheT - want) < 2) return e.cache;
  return thumbFrame(m, want) || (e.cacheOk ? e.cache : null);
}
// Low-res frame from the timeline filmstrip: instant fallback while a far seek decodes
function thumbFrame(m, st) {
  const cc = S.cache[m.id];
  const sp = cc && cc.sprite;
  if (!sp || !sp.complete || !sp.naturalWidth) return null;
  const n = cc.spriteCount, fw = sp.naturalWidth / n, fh = sp.naturalHeight;
  const idx = clamp(Math.floor((st / Math.max(0.01, m.duration)) * n), 0, n - 1);
  if (!cc.thumbCv) { cc.thumbCv = document.createElement('canvas'); cc.thumbCv.width = Math.round(fw); cc.thumbCv.height = fh; }
  if (cc.thumbIdx !== idx) { cc.thumbCv.getContext('2d').drawImage(sp, idx * fw, 0, fw, fh, 0, 0, cc.thumbCv.width, fh); cc.thumbIdx = idx; }
  return cc.thumbCv;
}
function renderClipLayer(c, t, W, H, k, slot) {
  const cv = layers.get(slot, W, H);
  const ctx = cv.getContext('2d');
  const vs = visualState(c, t);
  ctx.save();
  ctx.translate(W / 2 + vs.x * k, H / 2 + vs.y * k);
  ctx.rotate((vs.rot * Math.PI) / 180);
  if (c.type === 'text' || c.type === 'sticker' || c.type === 'gen') {
    ctx.scale(vs.scale * vs.sx, vs.scale * vs.sy);
    if (vs.blur > 0) ctx.filter = `blur(${(vs.blur * k).toFixed(1)}px)`;
    const sz = c.type === 'gen' ? (({ w, h: hh }) => ({ w: w * k, h: hh * k }))(drawGen(ctx, c, t, k)) : drawText(ctx, c, t, k);
    S.bounds[c.id] = { cx: vs.x, cy: vs.y, w: (sz.w / k) * vs.scale, h: (sz.h / k) * vs.scale, rot: vs.rot };
    ctx.restore();
  } else {
    const m = mediaById(c.mediaId);
    const src = frameSource(c, t);
    if (!src && m && m.type !== 'audio') S.frameMissing = true;
    const mw = m.width || (src && (src.videoWidth || src.naturalWidth || src.width)) || 16;
    const mh = m.height || (src && (src.videoHeight || src.naturalHeight || src.height)) || 9;
    const fit = Math.min(P().width / mw, P().height / mh);
    const dw = mw * fit * k, dh = mh * fit * k;
    S.bounds[c.id] = { cx: vs.x, cy: vs.y, w: mw * fit * vs.scale, h: mh * fit * vs.scale, rot: vs.rot };
    ctx.scale(vs.scale * vs.sx, vs.scale * vs.sy);
    const look = lookFor(c.filter, c.adj);
    const blur = vs.blur + look.blur;
    if (src) {
      let drawSrc = src;
      if (c.chroma && c.chroma.on) drawSrc = chromaKey(src, Math.min(dw * vs.scale, 1280), Math.min(dh * vs.scale, 720), c.chroma);
      ctx.save();
      ctx.filter = (look.css + (blur > 0 ? ` blur(${(blur * k).toFixed(1)}px)` : '')).trim() || 'none';
      const cr = c.crop;
      if (cr && (cr.l || cr.r || cr.t || cr.b)) {
        const sw = drawSrc.videoWidth || drawSrc.naturalWidth || drawSrc.width, sh = drawSrc.videoHeight || drawSrc.naturalHeight || drawSrc.height;
        ctx.drawImage(drawSrc, cr.l * sw, cr.t * sh, sw * (1 - cr.l - cr.r), sh * (1 - cr.t - cr.b), -dw / 2 + cr.l * dw, -dh / 2 + cr.t * dh, dw * (1 - cr.l - cr.r), dh * (1 - cr.t - cr.b));
      } else ctx.drawImage(drawSrc, -dw / 2, -dh / 2, dw, dh);
      ctx.filter = 'none';
      if (look.tints.length || look.vignette || look.grain) {
        ctx.beginPath(); ctx.rect(-dw / 2, -dh / 2, dw, dh); ctx.clip();
        if (c.chroma && c.chroma.on) ctx.globalCompositeOperation = 'source-atop';
        ctx.translate(-dw / 2, -dh / 2);
        applyTints(ctx, look, dw, dh, t);
      }
      ctx.restore();
      if (c.mask && c.mask.type !== 'none') applyMask(cv, ctx, c.mask, dw, dh, k);
    }
    ctx.restore();
  }
  if (c.fxList && c.fxList.length) for (const fx of c.fxList) applyEffect(fx.id, cv, t - c.start, c.dur, fx.amt, k, t, fx);
  return { cv, alpha: clamp(vs.alpha, 0, 1) };
}
// ============ Masks ============
// A mask is an alpha shape in the clip's own coordinates (it moves, scales and rotates with the clip).
// mode: cut = hide outside; darken/blur/gray/pixel = change only what is outside, keep the clip.
const MASK_DEFAULT = { type: 'none', mode: 'cut', size: 0.8, feather: 0.05, invert: false, x: 0, y: 0, rot: 0, aspect: 1, round: 0.25, color: '#000000', strength: 0.7 };
const MASK_SHAPES = [
  { id: 'none', name: 'Нет' }, { id: 'circle', name: 'Круг / овал' }, { id: 'rect', name: 'Прямоугольник' }, { id: 'round', name: 'Скруглённый' },
  { id: 'heart', name: 'Сердце' }, { id: 'star', name: 'Звезда' }, { id: 'triangle', name: 'Треугольник' }, { id: 'diamond', name: 'Ромб' },
  { id: 'hexagon', name: 'Шестиугольник' }, { id: 'band', name: 'Полоса' }, { id: 'vband', name: 'Вертикальная полоса' }, { id: 'split', name: 'Половина' },
  { id: 'linear', name: 'Градиент' }, { id: 'radial', name: 'Виньетка' },
];
const MASK_MODES = [['cut', 'Обрезать снаружи'], ['darken', 'Затемнить снаружи'], ['blur', 'Размыть снаружи'], ['gray', 'Ч/б снаружи'], ['pixel', 'Пикселизировать снаружи']];
const MASK_PRESETS = [
  { name: 'Затемнение краёв', m: { type: 'radial', mode: 'darken', size: 1.25, feather: 0.2, strength: 0.75, color: '#000000', aspect: 1.5 } },
  { name: 'Прожектор', m: { type: 'circle', mode: 'darken', size: 0.55, feather: 0.12, strength: 0.85, color: '#000000' } },
  { name: 'Кинополосы', m: { type: 'band', mode: 'darken', size: 1.5, feather: 0, strength: 1, color: '#000000' } },
  { name: 'Затемнение снизу', m: { type: 'linear', mode: 'darken', y: 0.15, feather: 0.35, strength: 0.85, color: '#000000' } },
  { name: 'Затемнение сверху', m: { type: 'linear', mode: 'darken', y: -0.15, rot: 180, feather: 0.35, strength: 0.85, color: '#000000' } },
  { name: 'Засветка краёв', m: { type: 'radial', mode: 'darken', size: 1.2, feather: 0.25, strength: 0.7, color: '#ffffff', aspect: 1.5 } },
  { name: 'Фокус размытием', m: { type: 'circle', mode: 'blur', size: 0.6, feather: 0.1, strength: 0.5 } },
  { name: 'Ч/б вокруг', m: { type: 'circle', mode: 'gray', size: 0.6, feather: 0.08, strength: 1 } },
  { name: 'Цензура', m: { type: 'rect', mode: 'pixel', size: 0.3, feather: 0, strength: 0.5, invert: true } },
  { name: 'Плавный край сбоку', m: { type: 'linear', mode: 'cut', rot: 90, feather: 0.3 } },
  { name: 'Окно', m: { type: 'round', mode: 'cut', size: 0.75, feather: 0.01, round: 0.3 } },
  { name: 'Сердечко', m: { type: 'heart', mode: 'darken', size: 0.9, feather: 0.06, strength: 0.9, color: '#1a0008' } },
];
const maskPool = new CanvasPool();
function polyPath(x, n, R, a, inner = 0) {
  const pts = inner ? n * 2 : n;
  for (let i = 0; i < pts; i++) {
    const r = inner && i % 2 ? R * inner : R, ang = -Math.PI / 2 + (i * Math.PI * 2) / pts;
    const px = Math.cos(ang) * r * a, py = Math.sin(ang) * r;
    if (i) x.lineTo(px, py); else x.moveTo(px, py);
  }
  x.closePath();
}
function maskShapePath(x, mk, dw, dh, R, big) {
  const s = mk.size, a = mk.aspect;
  switch (mk.type) {
    case 'circle': x.ellipse(0, 0, R * a, R, 0, 0, Math.PI * 2); break;
    case 'rect': x.rect((-dw * s * a) / 2, (-dh * s) / 2, dw * s * a, dh * s); break;
    case 'round': { const w = dw * s * a, hh = dh * s; x.roundRect(-w / 2, -hh / 2, w, hh, (clamp(mk.round, 0, 1) * Math.min(w, hh)) / 2); break; }
    case 'heart':
      x.moveTo(0, R * 0.35);
      x.bezierCurveTo(-R * 1.2 * a, -R * 0.55, -R * 0.45 * a, -R * 1.15, 0, -R * 0.55);
      x.bezierCurveTo(R * 0.45 * a, -R * 1.15, R * 1.2 * a, -R * 0.55, 0, R * 0.35);
      x.closePath(); break;
    case 'star': polyPath(x, 5, R, a, 0.45); break;
    case 'triangle': polyPath(x, 3, R, a); break;
    case 'diamond': polyPath(x, 4, R, a); break;
    case 'hexagon': polyPath(x, 6, R, a); break;
    case 'band': x.rect(-big, -dh * s * 0.25, big * 2, dh * s * 0.5); break;
    case 'vband': x.rect(-dw * s * 0.25, -big, dw * s * 0.5, big * 2); break;
    case 'split': x.rect(-big, -big, big * 2, big); break; // upper half; rotate to pick the side
  }
}
// White where the clip is kept, transparent where the mask mode applies
function buildMask(mk, tf, dw, dh, W, H) {
  const cv = maskPool.get(0, W, H), x = cv.getContext('2d');
  x.setTransform(tf);
  x.translate(mk.x * dw, mk.y * dh);
  x.rotate((mk.rot * Math.PI) / 180);
  const R = (Math.min(dw, dh) / 2) * mk.size, big = (dw + dh) * 4;
  if (mk.type === 'linear') {
    const fw = Math.max(1, mk.feather * dh * 2);
    const g = x.createLinearGradient(0, -fw / 2, 0, fw / 2);
    g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(-big, -big, big * 2, big * 2);
  } else if (mk.type === 'radial') {
    x.scale(mk.aspect, 1);
    const g = x.createRadialGradient(0, 0, R * clamp(1 - mk.feather * 4, 0, 0.98), 0, 0, R);
    g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(-big, -big, big * 2, big * 2);
  } else {
    const f = mk.feather * 0.35 * Math.min(dw, dh) * Math.hypot(tf.a, tf.b); // blur sigma; the visible edge is ~3x wider
    if (f > 0.5) x.filter = `blur(${f.toFixed(1)}px)`;
    x.fillStyle = '#fff';
    x.beginPath(); maskShapePath(x, mk, dw, dh, R, big); x.fill();
    x.filter = 'none';
  }
  if (mk.invert) { x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'xor'; x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'source-over'; }
  return cv;
}
function applyMask(cv, ctx, mask, dw, dh, k) {
  const mk = { ...MASK_DEFAULT, ...mask };
  const W = cv.width, H = cv.height;
  const m = buildMask(mk, ctx.getTransform(), dw, dh, W, H);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (mk.mode === 'cut') { ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(m, 0, 0); ctx.restore(); return; }
  const st = clamp(mk.strength, 0, 1);
  const o = maskPool.get(1, W, H), ox = o.getContext('2d');
  if (mk.mode === 'darken') { ox.globalAlpha = st; ox.fillStyle = mk.color; ox.fillRect(0, 0, W, H); ox.globalAlpha = 1; }
  else if (mk.mode === 'blur') { ox.filter = `blur(${((2 + st * 30) * k).toFixed(1)}px)`; ox.drawImage(cv, 0, 0); ox.filter = 'none'; }
  else if (mk.mode === 'gray') { ox.filter = 'grayscale(1)'; ox.drawImage(cv, 0, 0); ox.filter = 'none'; ctx.globalAlpha = st; }
  else if (mk.mode === 'pixel') {
    const b = Math.max(2, (4 + st * 40) * k), sm = maskPool.get(2, Math.max(1, Math.ceil(W / b)), Math.max(1, Math.ceil(H / b)));
    sm.getContext('2d').drawImage(cv, 0, 0, sm.width, sm.height);
    ox.imageSmoothingEnabled = false; ox.drawImage(sm, 0, 0, W, H); ox.imageSmoothingEnabled = true;
  }
  ox.globalCompositeOperation = 'destination-out'; ox.drawImage(m, 0, 0); ox.globalCompositeOperation = 'source-over';
  ctx.globalCompositeOperation = 'source-atop';
  ctx.drawImage(o, 0, 0);
  ctx.restore();
}

// ============ Effects (operate on a whole canvas) ============
function copyOf(cv, slot = 1) { const s = scratch.get(slot, cv.width, cv.height); s.getContext('2d').drawImage(cv, 0, 0); return s; }
function channel(src, color, slot) {
  const s = scratch.get(slot, src.width, src.height); const x = s.getContext('2d');
  x.drawImage(src, 0, 0); x.globalCompositeOperation = 'multiply'; x.fillStyle = color; x.fillRect(0, 0, s.width, s.height);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-over';
  return s;
}
function rgbSplit(cv, off, offY = 0) {
  const w = cv.width, hh = cv.height, ctx = cv.getContext('2d');
  const src = copyOf(cv, 1);
  const r = channel(src, '#ff0000', 2), g = channel(src, '#00ff00', 3), b = channel(src, '#0000ff', 4);
  ctx.clearRect(0, 0, w, hh);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, hh);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(r, -off, -offY); ctx.drawImage(g, 0, 0); ctx.drawImage(b, off, offY);
  ctx.globalCompositeOperation = 'source-over';
}
function drawTransformed(cv, fn) {
  const ctx = cv.getContext('2d'), w = cv.width, hh = cv.height;
  const src = copyOf(cv, 1);
  ctx.clearRect(0, 0, w, hh);
  ctx.save(); fn(ctx, w, hh); ctx.drawImage(src, -w / 2, -hh / 2); ctx.restore();
}
function particles(ctx, w, hh, lt, n, draw) {
  for (let i = 0; i < n; i++) draw(i, hash(i * 3.1), hash(i * 7.7 + 1), hash(i * 1.3 + 5));
}
// opt: the effect object itself, for effects with their own settings (e.g. where the spotlight points)
function applyEffect(id, cv, lt, dur, amt, k, gt, opt) {
  const ctx = cv.getContext('2d');
  const w = cv.width, hh = cv.height;
  const p = clamp(lt / Math.max(0.01, dur), 0, 1);
  ctx.save();
  switch (id) {
    case 'shake': {
      const a = 28 * amt * k;
      drawTransformed(cv, (x) => { x.translate(w / 2 + noise1(lt * 16) * a, hh / 2 + noise1(lt * 16 + 50) * a); x.rotate(noise1(lt * 12 + 9) * 0.02 * amt); x.scale(1.06, 1.06); });
      break;
    }
    case 'zoompulse': { const ph = (lt % 0.6) / 0.6; const s = 1 + 0.2 * amt * Math.exp(-ph * 6); drawTransformed(cv, (x) => { x.translate(w / 2, hh / 2); x.scale(s, s); }); break; }
    case 'heartbeat': { const ph = lt % 1; const s = 1 + 0.08 * amt * (Math.exp(-ph * 12) + (ph > 0.25 ? 0.7 * Math.exp(-(ph - 0.25) * 12) : 0)); drawTransformed(cv, (x) => { x.translate(w / 2, hh / 2); x.scale(s, s); }); break; }
    case 'slowzoom': { const s = 1 + 0.3 * amt * easeInOut(p); drawTransformed(cv, (x) => { x.translate(w / 2, hh / 2); x.scale(s, s); }); break; }
    case 'spin': { drawTransformed(cv, (x) => { x.translate(w / 2, hh / 2); x.rotate(lt * Math.PI * amt); const s = 1 + 0.8 * amt; x.scale(s, s); }); break; }
    case 'swing': { drawTransformed(cv, (x) => { x.translate(w / 2, hh / 2); x.rotate(Math.sin(lt * 2.4) * 0.1 * amt); x.scale(1.15, 1.15); }); break; }
    case 'glitch': {
      const step = Math.floor(lt * 14);
      const strong = hash(step) < 0.25 + 0.5 * amt;
      if (strong) {
        const src = copyOf(cv, 5);
        const n = 6 + Math.floor(hash(step + 2) * 8);
        for (let i = 0; i < n; i++) {
          const y = hash(step * 13 + i) * hh, sh = (0.02 + hash(step * 7 + i) * 0.08) * hh;
          const dx = (hash(step * 5 + i) - 0.5) * w * 0.12 * amt;
          ctx.clearRect(0, y, w, sh);
          ctx.drawImage(src, 0, y, w, sh, dx, y, w, sh);
        }
        rgbSplit(cv, (6 + 14 * hash(step + 9)) * k * amt);
      } else rgbSplit(cv, 2 * k * amt);
      break;
    }
    case 'rgbsplit': rgbSplit(cv, (4 + 8 * (0.5 + 0.5 * Math.sin(lt * 3))) * k * amt, 2 * k * amt); break;
    case 'pixelate': {
      const b = Math.max(2, Math.round((4 + 30 * amt) * k));
      const sw = Math.max(1, Math.round(w / b)), sh = Math.max(1, Math.round(hh / b));
      const s = scratch.get(6, sw, sh); s.getContext('2d').drawImage(cv, 0, 0, sw, sh);
      ctx.clearRect(0, 0, w, hh); ctx.imageSmoothingEnabled = false; ctx.drawImage(s, 0, 0, w, hh); ctx.imageSmoothingEnabled = true;
      break;
    }
    case 'wave': {
      const src = copyOf(cv, 5); const strip = Math.max(2, Math.round(4 * k));
      ctx.clearRect(0, 0, w, hh);
      for (let y = 0; y < hh; y += strip) ctx.drawImage(src, 0, y, w, strip, Math.sin(y / (40 * k) + lt * 4) * 18 * k * amt, y, w, strip);
      break;
    }
    case 'mirror': { const src = copyOf(cv, 5); ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1); ctx.drawImage(src, 0, 0, w / 2, hh, 0, 0, w / 2, hh); ctx.restore(); break; }
    case 'kaleido': {
      const src = copyOf(cv, 5); ctx.clearRect(0, 0, w, hh);
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { ctx.save(); ctx.translate(w / 2, hh / 2); ctx.scale(sx, sy); ctx.drawImage(src, w * 0.25, hh * 0.25, w / 2, hh / 2, -w / 2, -hh / 2, w / 2, hh / 2); ctx.restore(); }
      break;
    }
    case 'split3': {
      const src = copyOf(cv, 5); ctx.clearRect(0, 0, w, hh);
      if (w >= hh) for (let i = 0; i < 3; i++) ctx.drawImage(src, w / 3, 0, w / 3, hh, (i * w) / 3, 0, w / 3, hh);
      else for (let i = 0; i < 3; i++) ctx.drawImage(src, 0, hh / 3, w, hh / 3, 0, (i * hh) / 3, w, hh / 3);
      break;
    }
    case 'grid4': { const src = copyOf(cv, 5); ctx.clearRect(0, 0, w, hh); for (let i = 0; i < 4; i++) ctx.drawImage(src, (i % 2) * w / 2, Math.floor(i / 2) * hh / 2, w / 2, hh / 2); break; }
    case 'vhs': {
      drawTransformed(cv, (x) => { x.translate(w / 2 + noise1(lt * 30) * 2 * k, hh / 2); });
      rgbSplit(cv, 3 * k * amt);
      ctx.globalAlpha = 0.25 * amt; ctx.fillStyle = '#000';
      for (let y = 0; y < hh; y += 3 * k) ctx.fillRect(0, y, w, 1 * k);
      const band = ((lt * 0.25) % 1) * hh;
      ctx.globalAlpha = 0.18 * amt; ctx.fillStyle = '#fff'; ctx.fillRect(0, band, w, 18 * k);
      ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.3 * amt;
      ctx.fillStyle = ctx.createPattern(noiseTile(Math.floor(lt * 24)), 'repeat'); ctx.fillRect(0, 0, w, hh);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.9;
      ctx.font = `700 ${Math.round(34 * k)}px Consolas`; ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4 * k;
      ctx.fillText('PLAY ▶', 40 * k, 60 * k);
      const d = new Date(2001, 5, 14, 19, 30, Math.floor(gt));
      ctx.fillText(`${d.toLocaleDateString('ru-RU')}  ${d.toLocaleTimeString('ru-RU')}`, 40 * k, hh - 40 * k);
      break;
    }
    case 'oldfilm': {
      const src = copyOf(cv, 5);
      ctx.clearRect(0, 0, w, hh);
      const fl = 0.85 + hash(Math.floor(lt * 18)) * 0.25;
      ctx.filter = `sepia(${0.8 * amt}) contrast(1.1) brightness(${fl.toFixed(3)})`;
      ctx.drawImage(src, noise1(lt * 20) * 2 * k, noise1(lt * 9) * 3 * k);
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.35 * amt;
      ctx.fillStyle = ctx.createPattern(noiseTile(Math.floor(lt * 24)), 'repeat'); ctx.fillRect(0, 0, w, hh);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.5 * amt; ctx.strokeStyle = '#1a1208'; ctx.lineWidth = 1.5 * k;
      const f = Math.floor(lt * 18);
      for (let i = 0; i < 3; i++) if (hash(f * 3 + i) > 0.5) { const x = hash(f * 11 + i) * w; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (hash(f + i) - 0.5) * 20 * k, hh); ctx.stroke(); }
      ctx.fillStyle = '#1a1208';
      for (let i = 0; i < 8; i++) if (hash(f * 17 + i) > 0.6) { ctx.beginPath(); ctx.arc(hash(f * 5 + i) * w, hash(f * 9 + i) * hh, (1 + hash(i + f) * 3) * k, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1; drawVignette(ctx, w, hh, 0.8 * amt);
      break;
    }
    case 'grain': ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.5 * amt; ctx.fillStyle = ctx.createPattern(noiseTile(Math.floor(lt * 24)), 'repeat'); ctx.fillRect(0, 0, w, hh); break;
    case 'scanlines': {
      ctx.globalAlpha = 0.35 * amt; ctx.fillStyle = '#000';
      for (let y = 0; y < hh; y += 4 * k) ctx.fillRect(0, y, w, 2 * k);
      ctx.globalAlpha = 1; drawVignette(ctx, w, hh, 0.6 * amt);
      ctx.globalAlpha = 0.06 * amt * (0.5 + hash(Math.floor(lt * 30))); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh);
      break;
    }
    case 'camrec': {
      const m = 36 * k, L = 70 * k; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4 * k; ctx.globalAlpha = 0.9 * amt;
      ctx.beginPath();
      ctx.moveTo(m, m + L); ctx.lineTo(m, m); ctx.lineTo(m + L, m);
      ctx.moveTo(w - m - L, m); ctx.lineTo(w - m, m); ctx.lineTo(w - m, m + L);
      ctx.moveTo(m, hh - m - L); ctx.lineTo(m, hh - m); ctx.lineTo(m + L, hh - m);
      ctx.moveTo(w - m - L, hh - m); ctx.lineTo(w - m, hh - m); ctx.lineTo(w - m, hh - m - L);
      ctx.stroke();
      if (Math.floor(lt * 1.6) % 2 === 0) { ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(m + 40 * k, m + 46 * k, 13 * k, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(34 * k)}px Consolas`; ctx.textBaseline = 'middle';
      ctx.fillText('REC', m + 64 * k, m + 47 * k);
      ctx.fillText(fmtTime(lt, 30).replace(/:(\d\d)$/, '.$1'), w - m - 220 * k, m + 47 * k);
      ctx.strokeRect(w - m - 120 * k, hh - m - 60 * k, 70 * k, 30 * k); ctx.fillRect(w - m - 114 * k, hh - m - 54 * k, 46 * k, 18 * k);
      ctx.beginPath(); ctx.moveTo(w / 2 - 20 * k, hh / 2); ctx.lineTo(w / 2 + 20 * k, hh / 2); ctx.moveTo(w / 2, hh / 2 - 20 * k); ctx.lineTo(w / 2, hh / 2 + 20 * k); ctx.lineWidth = 2 * k; ctx.stroke();
      break;
    }
    case 'flash': { ctx.globalAlpha = amt * Math.pow(1 - clamp(lt / Math.min(0.6, dur), 0, 1), 2); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh); break; }
    case 'strobe': { if (Math.floor(lt * 10) % 2 === 0) { ctx.globalAlpha = 0.75 * amt; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh); } break; }
    case 'darkflash': { ctx.globalAlpha = amt * (0.5 + 0.5 * Math.sin(lt * 5)) * 0.8; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, hh); break; }
    case 'lightleak': {
      ctx.globalCompositeOperation = 'screen';
      const cols = ['255,120,40', '255,60,140', '255,200,80'];
      for (let i = 0; i < 3; i++) {
        const x = w * (0.5 + 0.6 * Math.sin(lt * 0.5 + i * 2.1)), y = hh * (0.5 + 0.5 * Math.cos(lt * 0.4 + i * 1.7)), r = Math.max(w, hh) * (0.45 + 0.1 * i);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${cols[i]},${0.55 * amt})`); g.addColorStop(1, `rgba(${cols[i]},0)`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, hh);
      }
      break;
    }
    case 'glow': { const src = copyOf(cv, 5); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.7 * amt; ctx.filter = `blur(${(16 * k).toFixed(1)}px) brightness(1.3)`; ctx.drawImage(src, 0, 0); break; }
    case 'rainbow': { const src = copyOf(cv, 5); ctx.clearRect(0, 0, w, hh); ctx.filter = `hue-rotate(${(lt * 200 * amt) % 360}deg) saturate(${1 + amt})`; ctx.drawImage(src, 0, 0); break; }
    case 'vignette': drawVignette(ctx, w, hh, amt); break;
    case 'snow': particles(ctx, w, hh, lt, 140, (i, a, b, c) => { const sp = 40 + c * 90; const x = (a * w + Math.sin(lt * (0.5 + c) + i) * 30 * k) % w; const y = ((b * hh + lt * sp * k) % (hh + 20)) - 10; ctx.globalAlpha = (0.5 + c * 0.5) * amt; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, (1.5 + c * 3.5) * k, 0, 7); ctx.fill(); }); break;
    case 'rain': ctx.strokeStyle = 'rgba(200,220,255,0.6)'; ctx.lineWidth = 1.5 * k; particles(ctx, w, hh, lt, 200, (i, a, b, c) => { const sp = 900 + c * 600; const x = a * w; const y = ((b * hh + lt * sp * k) % (hh + 60)) - 30; ctx.globalAlpha = 0.6 * amt; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4 * k, y + (20 + c * 20) * k); ctx.stroke(); }); ctx.globalAlpha = 0.15 * amt; ctx.fillStyle = '#001'; ctx.fillRect(0, 0, w, hh); break;
    case 'dust': particles(ctx, w, hh, lt, 70, (i, a, b, c) => { const x = (a * w + noise1(lt * 0.3 + i) * 60 * k + w) % w; const y = (b * hh + noise1(lt * 0.25 + i * 3) * 60 * k + hh) % hh; ctx.globalAlpha = (0.2 + 0.5 * (0.5 + 0.5 * Math.sin(lt * 2 + i))) * amt; ctx.fillStyle = '#ffe9c4'; ctx.beginPath(); ctx.arc(x, y, (1 + c * 2.5) * k, 0, 7); ctx.fill(); }); break;
    case 'sparkles': particles(ctx, w, hh, lt, 60, (i, a, b, c) => { const tw = Math.max(0, Math.sin(lt * (2 + c * 4) + i * 1.7)); if (tw < 0.05) return; const x = a * w, y = b * hh, r = (6 + c * 16) * k * tw; ctx.globalAlpha = tw * amt; ctx.fillStyle = '#fff8d0'; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill(); }); break;
    case 'hearts': ctx.textAlign = 'center'; particles(ctx, w, hh, lt, 30, (i, a, b, c) => { const sp = 60 + c * 80; const y = hh + 40 * k - ((b * hh + lt * sp * k) % (hh + 80 * k)); const x = a * w + Math.sin(lt * 1.5 + i) * 25 * k; ctx.globalAlpha = clamp(y / hh, 0, 1) * amt; ctx.font = `${Math.round((24 + c * 30) * k)}px "Segoe UI Emoji"`; ctx.fillText('❤️', x, y); }); break;
    case 'confetti': { const cols = ['#ff6b4a', '#ffd23c', '#3cc8ff', '#7dff8a', '#ff4ad8', '#ffffff']; particles(ctx, w, hh, lt, 120, (i, a, b, c) => { const sp = 120 + c * 160; const y = ((b * hh * 0.5 + lt * sp * k) % (hh + 40)) - 20; const x = a * w + Math.sin(lt * 2 + i) * 30 * k; ctx.save(); ctx.translate(x, y); ctx.rotate(lt * (2 + c * 5) + i); ctx.scale(1, Math.cos(lt * 6 + i)); ctx.globalAlpha = amt; ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(-5 * k, -3 * k, 10 * k, 6 * k); ctx.restore(); }); break; }
    case 'letterbox': { const bh = hh * 0.12 * amt * easeOut(clamp(lt / 0.6, 0, 1)); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, bh); ctx.fillRect(0, hh - bh, w, bh); break; }
    case 'blurframe': { const src = copyOf(cv, 5); ctx.clearRect(0, 0, w, hh); ctx.filter = `blur(${(24 * k).toFixed(1)}px) brightness(0.8)`; ctx.drawImage(src, -40 * k, -40 * k, w + 80 * k, hh + 80 * k); ctx.filter = 'none'; const ins = 0.1 * amt; ctx.beginPath(); ctx.roundRect(w * ins, hh * ins, w * (1 - 2 * ins), hh * (1 - 2 * ins), 24 * k); ctx.clip(); ctx.drawImage(src, w * ins, hh * ins, w * (1 - 2 * ins), hh * (1 - 2 * ins)); break; }
    case 'blurin': { const src = copyOf(cv, 5); ctx.clearRect(0, 0, w, hh); ctx.filter = `blur(${(14 * k * amt * (0.5 + 0.5 * Math.sin(lt * 2.2))).toFixed(1)}px)`; ctx.drawImage(src, 0, 0); break; }
    case 'bwflash': { if (Math.floor(lt * 4) % 2 === 0) { const src = copyOf(cv, 5); ctx.clearRect(0, 0, w, hh); ctx.filter = `grayscale(${amt}) contrast(1.2)`; ctx.drawImage(src, 0, 0); } break; }
    case 'vintageframe': {
      const src = copyOf(cv, 5); ctx.clearRect(0, 0, w, hh); ctx.fillStyle = '#1b1b1b'; ctx.fillRect(0, 0, w, hh);
      ctx.translate(w / 2, hh / 2); ctx.rotate(-0.03 * amt); const s = 0.78; const fw = w * s, fh = hh * s; const b = 18 * k;
      ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 30 * k; ctx.fillStyle = '#f4f1ea'; ctx.fillRect(-fw / 2 - b, -fh / 2 - b, fw + b * 2, fh + b * 4); ctx.shadowColor = 'transparent';
      ctx.filter = 'sepia(.25) contrast(1.05)'; ctx.drawImage(src, -fw / 2, -fh / 2, fw, fh);
      break;
    }
    default: if (typeof extraEffect === 'function') extraEffect(id, cv, ctx, lt, dur, amt, k, gt, opt);
  }
  ctx.restore();
}

// ============ Transitions ============
function drawTransition(id, ctx, A, B, p, W, H, k) {
  const e = easeInOut(p);
  ctx.save();
  const both = (aA, aB) => { ctx.globalAlpha = aA; ctx.drawImage(A, 0, 0); ctx.globalAlpha = aB; ctx.drawImage(B, 0, 0); ctx.globalAlpha = 1; };
  switch (id) {
    case 'fade': both(1, e); break;
    case 'black': case 'white': case 'flashT': {
      const col = id === 'black' ? '#000' : '#fff';
      const mid = id === 'flashT' ? 0.3 : 0.5;
      if (p < mid) { ctx.drawImage(A, 0, 0); ctx.globalAlpha = p / mid; } else { ctx.drawImage(B, 0, 0); ctx.globalAlpha = (1 - p) / (1 - mid); }
      if (id === 'flashT') ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); break;
    }
    case 'pushL': ctx.drawImage(A, -e * W, 0); ctx.drawImage(B, (1 - e) * W, 0); break;
    case 'pushR': ctx.drawImage(A, e * W, 0); ctx.drawImage(B, -(1 - e) * W, 0); break;
    case 'pushU': ctx.drawImage(A, 0, -e * H); ctx.drawImage(B, 0, (1 - e) * H); break;
    case 'pushD': ctx.drawImage(A, 0, e * H); ctx.drawImage(B, 0, -(1 - e) * H); break;
    case 'slideOver': ctx.drawImage(A, 0, 0); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 40 * k; ctx.drawImage(B, (1 - e) * W, 0); break;
    case 'wipeL': ctx.drawImage(A, 0, 0); ctx.beginPath(); ctx.rect(W * (1 - e), 0, W * e, H); ctx.clip(); ctx.drawImage(B, 0, 0); break;
    case 'wipeR': ctx.drawImage(A, 0, 0); ctx.beginPath(); ctx.rect(0, 0, W * e, H); ctx.clip(); ctx.drawImage(B, 0, 0); break;
    case 'circle': ctx.drawImage(A, 0, 0); ctx.beginPath(); ctx.arc(W / 2, H / 2, (Math.hypot(W, H) / 2) * e, 0, 7); ctx.clip(); ctx.drawImage(B, 0, 0); break;
    case 'diamond': { ctx.drawImage(A, 0, 0); const r = (W + H) / 2 * e; ctx.beginPath(); ctx.moveTo(W / 2, H / 2 - r); ctx.lineTo(W / 2 + r, H / 2); ctx.lineTo(W / 2, H / 2 + r); ctx.lineTo(W / 2 - r, H / 2); ctx.closePath(); ctx.clip(); ctx.drawImage(B, 0, 0); break; }
    case 'blinds': { ctx.drawImage(A, 0, 0); const n = 10, bh = H / n; ctx.beginPath(); for (let i = 0; i < n; i++) ctx.rect(0, i * bh, W, bh * e); ctx.clip(); ctx.drawImage(B, 0, 0); break; }
    case 'zoomIn': { ctx.save(); ctx.globalAlpha = 1 - e; ctx.translate(W / 2, H / 2); ctx.scale(1 + e * 0.6, 1 + e * 0.6); ctx.drawImage(A, -W / 2, -H / 2); ctx.restore(); ctx.globalAlpha = e; ctx.translate(W / 2, H / 2); ctx.scale(0.7 + 0.3 * e, 0.7 + 0.3 * e); ctx.drawImage(B, -W / 2, -H / 2); break; }
    case 'zoomOut': { ctx.save(); ctx.globalAlpha = 1 - e; ctx.translate(W / 2, H / 2); ctx.scale(1 - e * 0.4, 1 - e * 0.4); ctx.drawImage(A, -W / 2, -H / 2); ctx.restore(); ctx.globalAlpha = e; ctx.translate(W / 2, H / 2); ctx.scale(1.5 - 0.5 * e, 1.5 - 0.5 * e); ctx.drawImage(B, -W / 2, -H / 2); break; }
    case 'blur': { ctx.filter = `blur(${(e * 30 * k).toFixed(1)}px)`; ctx.globalAlpha = 1; ctx.drawImage(A, 0, 0); ctx.filter = `blur(${((1 - e) * 30 * k).toFixed(1)}px)`; ctx.globalAlpha = e; ctx.drawImage(B, 0, 0); break; }
    case 'spin': { const img = p < 0.5 ? A : B; const q = p < 0.5 ? p * 2 : (1 - p) * 2; ctx.translate(W / 2, H / 2); ctx.rotate(q * Math.PI * (p < 0.5 ? 1 : -1)); const s = 1 + q * 0.6; ctx.scale(s, s); ctx.filter = `blur(${(q * 12 * k).toFixed(1)}px)`; ctx.drawImage(img, -W / 2, -H / 2); break; }
    case 'glitch': { const tmp = scratch.get(7, W, H); const tx = tmp.getContext('2d'); tx.drawImage(p < 0.5 ? A : B, 0, 0); applyEffect('glitch', tmp, p * 20, 1, 1, k, 0); ctx.drawImage(tmp, 0, 0); break; }
    case 'pixel': { const img = p < 0.5 ? A : B; const q = 1 - Math.abs(2 * p - 1); const b = Math.max(1, Math.round(1 + 50 * q * k)); const sw = Math.max(1, Math.round(W / b)), sh = Math.max(1, Math.round(H / b)); const tmp = scratch.get(8, sw, sh); tmp.getContext('2d').drawImage(img, 0, 0, sw, sh); ctx.imageSmoothingEnabled = false; ctx.drawImage(tmp, 0, 0, W, H); break; }
    default: both(1, e);
  }
  ctx.restore();
}

// ============ Frame composition ============
function renderFrame(ctx, t, W, H) {
  const pr = P();
  const k = W / pr.width;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  if (pr.bg.transparent) ctx.clearRect(0, 0, W, H);
  else {
    ctx.fillStyle = pr.bg.type === 'color' || pr.bg.type === 'blur' ? pr.bg.color : '#000';
    ctx.fillRect(0, 0, W, H);
  }
  const mainTrack = pr.tracks.find((tr) => tr.main);
  if (pr.bg.type === 'blur' && mainTrack) {
    const c = clipsOn(mainTrack.id).find((c) => activeAt(c, t) && (c.type === 'video' || c.type === 'image'));
    const src = c && frameSource(c, t);
    if (src) {
      const m = mediaById(c.mediaId);
      const mw = m.width || 16, mh = m.height || 9;
      const cover = Math.max(W / mw, H / mh) * 1.1;
      ctx.filter = `blur(${(pr.bg.blur * k).toFixed(1)}px) brightness(0.85)`;
      ctx.drawImage(src, (W - mw * cover) / 2, (H - mh * cover) / 2, mw * cover, mh * cover);
      ctx.filter = 'none';
    }
  }
  const tracks = pr.tracks.filter((tr) => tr.kind !== 'audio' && !tr.hidden);
  for (let ti = tracks.length - 1; ti >= 0; ti--) {
    const tr = tracks[ti];
    const list = clipsOn(tr.id).filter((c) => activeAt(c, t));
    for (const c of list) {
      if (tr.kind === 'fx') { applyFxClip(ctx.canvas, c, t, k); continue; }
      const pv = c.trans && t <= c.start + c.trans.dur ? prevOnTrack(c) : null;
      if (pv) {
        const A = renderClipLayer(pv, t, W, H, k, 0);
        const aCv = scratch.get(10, W, H); const ax = aCv.getContext('2d'); ax.globalAlpha = A.alpha; ax.drawImage(A.cv, 0, 0);
        const B = renderClipLayer(c, t, W, H, k, 1);
        const bCv = scratch.get(11, W, H); const bx = bCv.getContext('2d'); bx.globalAlpha = B.alpha; bx.drawImage(B.cv, 0, 0);
        const comp = layers.get(2, W, H);
        drawTransition(c.trans.id, comp.getContext('2d'), aCv, bCv, clamp((t - c.start) / c.trans.dur, 0, 1), W, H, k);
        ctx.globalCompositeOperation = c.blend || 'source-over';
        ctx.drawImage(comp, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
      } else {
        const L = renderClipLayer(c, t, W, H, k, 0);
        ctx.globalAlpha = L.alpha;
        ctx.globalCompositeOperation = c.blend || 'source-over';
        ctx.drawImage(L.cv, 0, 0);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
    }
  }
  ctx.restore();
}
function applyFxClip(cv, c, t, k) {
  const lt = t - c.start;
  if (c.type === 'fx') { applyEffect(c.fx.id, cv, lt, c.dur, c.fx.amt, k, t, c.fx); return; }
  const look = c.type === 'filter' ? lookFor(c.filter, null) : lookFor(null, c.adj);
  const ctx = cv.getContext('2d');
  const src = copyOf(cv, 12);
  ctx.save();
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.filter = (look.css + (look.blur > 0 ? ` blur(${(look.blur * k).toFixed(1)}px)` : '')).trim() || 'none';
  ctx.drawImage(src, 0, 0);
  ctx.filter = 'none';
  applyTints(ctx, look, cv.width, cv.height, t);
  ctx.restore();
}

// ============ Preview loop ============
let renderQueued = false;
function requestRender() {
  if (renderQueued || S.exporting) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; drawPreview(); });
}
// Render into a back buffer and only show it when every video frame was available,
// so a player that is still loading keeps the previous picture instead of a black flash.
let backCv = null;
function presentFrame(t) {
  const cv = $('#preview');
  if (!backCv) backCv = document.createElement('canvas');
  if (backCv.width !== cv.width || backCv.height !== cv.height) { backCv.width = cv.width; backCv.height = cv.height; S.hadFrame = false; }
  S.frameMissing = false;
  renderFrame(backCv.getContext('2d'), t, cv.width, cv.height);
  if (!S.frameMissing || !S.hadFrame || !S.playing || S.missStreak > 45) {
    const pc = cv.getContext('2d');
    if (P().bg.transparent) pc.clearRect(0, 0, cv.width, cv.height);
    pc.drawImage(backCv, 0, 0);
    if (S.frameMissing) {
      // nothing decoded yet (file still opening): say so instead of a silent black screen
      pc.save(); pc.fillStyle = 'rgba(255,255,255,.7)'; pc.font = `600 ${Math.round(cv.height / 24)}px "Segoe UI"`; pc.textAlign = 'center'; pc.textBaseline = 'middle';
      pc.fillText(tr('Загрузка видео…'), cv.width / 2, cv.height / 2); pc.restore();
    } else S.hadFrame = true;
    S.missStreak = 0;
  } else S.missStreak = (S.missStreak || 0) + 1;
}
function drawPreview() {
  const cv = $('#preview');
  if (!cv || !P()) return;
  const W = Math.max(2, Math.round(P().width * S.previewScale * Math.min(1, 1280 / P().width)));
  const H = Math.max(2, Math.round((W * P().height) / P().width));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  if (!S.playing) syncMedia(S.time, false);
  presentFrame(S.time);
  if (window.updateOverlay) updateOverlay();
}
let playRaf = 0;
function play() {
  if (S.playing) return;
  AC.resume();
  const total = projectDuration();
  if (!total) return;
  if (S.time >= total - 0.02) S.time = 0;
  S.playing = true;
  S.clockId = null;
  let wall0 = performance.now(), wallT0 = S.time, stallSince = 0, lastDraw = 0, lastTc = -1, lastTcAt = performance.now(), lastKick = 0;
  $('#playBtn').textContent = '❚❚';
  let lastLoop = performance.now();
  const loop = (now = performance.now()) => {
    if (!S.playing) return;
    // time comes from the playing video itself (smooth, no drift fights); wall clock only when nothing plays
    const clk = pickClock(S.time);
    let t;
    const tc = clk ? clk.c.start + (clk.el.currentTime - clk.c.in) / clk.c.speed : 0;
    // a "playing" player whose time does not move is stuck: fall back to the wall clock and kick it
    if (clk && tc !== lastTc) { lastTc = tc; lastTcAt = now; }
    const stuck = clk && now - lastTcAt > 400;
    if (stuck && now - lastKick > 1000) { lastKick = now; clk.el.currentTime = srcTime(clk.c, S.time); }
    const dt = (now - lastLoop) / 1000;
    if (clk && !stuck && !clk.el.paused && !clk.el.seeking && clk.el.readyState >= 3 && Math.abs(tc - S.time) < 0.3) {
      // follow the video, but never faster than real time (no run-away when a player is ahead)
      S.clockId = clk.c.id;
      t = clamp(tc, S.time, S.time + dt * 1.1 + 0.002);
      wall0 = now; wallT0 = t; stallSince = 0;
    } else if (clk && !stuck && Math.abs(tc - S.time) >= 0.3 && !clk.el.seeking && !clk.el.paused) {
      S.clockId = null; // let syncMedia pull this player back to the right time
      t = S.time + dt;
    } else if (clk && !stuck && now - (stallSince || (stallSince = now)) < 700) {
      t = S.time; // media is buffering: hold the picture instead of running ahead
    } else {
      S.clockId = null;
      t = S.time + dt;
    }
    t = Math.max(t, S.time);
    if (t >= projectDuration()) { S.time = projectDuration(); pause(); return; }
    S.time = t;
    syncMedia(t, true);
    if (now - lastDraw >= 14) {
      lastDraw = now;
      presentFrame(t);
      if ((typeof TL !== 'undefined')) TL.updatePlayhead(true);
    }
    lastLoop = now;
    playRaf = requestAnimationFrame(loop);
  };
  loop();
}
function pause() {
  S.playing = false;
  cancelAnimationFrame(playRaf);
  pauseAll();
  $('#playBtn').textContent = '▶';
  requestRender();
  if ((typeof TL !== 'undefined')) TL.updatePlayhead();
  if ((typeof INSP !== 'undefined')) INSP.refreshKf();
}
function seek(t, scrub) {
  const was = S.playing;
  if (was) { S.playing = false; cancelAnimationFrame(playRaf); pauseAll(); }
  S.time = clamp(t, 0, Math.max(projectDuration(), 0));
  if (was) { S.playing = false; play(); }
  else { requestRender(); if (scrub) scrubBlip(); }
  if ((typeof TL !== 'undefined')) TL.updatePlayhead();
  if ((typeof INSP !== 'undefined')) INSP.refreshKf();
}
