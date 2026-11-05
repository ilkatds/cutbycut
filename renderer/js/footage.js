'use strict';
// ============ Animated footage (drawn in code, every text/colour editable) ============
const GENS = [
  { id: 'achievement', name: 'Достижение', cat: 'Игровые', dur: 4, text: 'Первая победа', text2: 'ДОСТИЖЕНИЕ ПОЛУЧЕНО', color: '#2a2f3d', color2: '#ffc83c' },
  { id: 'achievementEmpty', name: 'Достижение (пустое)', cat: 'Игровые', dur: 4, text: '', text2: '', color: '#2a2f3d', color2: '#ffc83c' },
  { id: 'levelup', name: 'Новый уровень', cat: 'Игровые', dur: 3, text: 'LEVEL UP!', text2: 'Уровень 10', color: '#7a3cff', color2: '#ffe14a' },
  { id: 'hpbar', name: 'Полоска здоровья', cat: 'Игровые', dur: 4, text: '25', text2: 'HP', color: '#e3242b', color2: '#3cd36a' },
  { id: 'subscribe', name: 'Подписка', cat: 'Соцсети', dur: 4, text: 'ПОДПИСАТЬСЯ', text2: 'ВЫ ПОДПИСАНЫ', color: '#e3242b', color2: '#5a5f6e' },
  { id: 'like', name: 'Лайк', cat: 'Соцсети', dur: 2.5, text: '', text2: '', color: '#2f80ff', color2: '#ffffff' },
  { id: 'message', name: 'Сообщение', cat: 'Соцсети', dur: 4, text: 'Ты где?? 😂', text2: 'Друг', color: '#2b5278', color2: '#ffffff' },
  { id: 'countdown', name: 'Отсчёт 3-2-1', cat: 'Титры', dur: 3, text: '', text2: '', color: '#ffffff', color2: '#ff6b4a' },
  { id: 'chapter', name: 'Глава', cat: 'Титры', dur: 4, text: 'ГЛАВА 1', text2: 'Начало', color: '#ffffff', color2: '#ff6b4a' },
  { id: 'lowerthird', name: 'Подпись (плашка)', cat: 'Титры', dur: 5, text: 'Имя Фамилия', text2: 'кто это', color: '#ff6b4a', color2: '#ffffff' },
  { id: 'loading', name: 'Загрузка', cat: 'Титры', dur: 4, text: 'Загрузка…', text2: '', color: '#ffffff', color2: '#3cc8ff' },
  { id: 'boom', name: 'Комикс «БУМ!»', cat: 'Акценты', dur: 1.5, text: 'БУМ!', text2: '', color: '#ffd23c', color2: '#e3242b' },
  { id: 'circle', name: 'Обвести кругом', cat: 'Акценты', dur: 3, text: '', text2: '', color: '#ff2a2a', color2: '#ffffff' },
  { id: 'arrow', name: 'Стрелка', cat: 'Акценты', dur: 3, text: 'ВОТ ОН', text2: '', color: '#ff2a2a', color2: '#ffffff' },
  { id: 'check', name: 'Галочка', cat: 'Акценты', dur: 2, text: '', text2: '', color: '#3cd36a', color2: '#ffffff' },
  { id: 'cross', name: 'Крестик', cat: 'Акценты', dur: 2, text: '', text2: '', color: '#e3242b', color2: '#ffffff' },
];

function genEnv(lt, dur, inD = 0.45, outD = 0.35) {
  const pin = clamp(lt / inD, 0, 1), pout = clamp((dur - lt) / outD, 0, 1);
  return { pin, pout, e: easeBack(pin), a: Math.min(pin * 1.5, 1) * pout };
}
function rr(ctx, x, y, w, hh, r) { ctx.beginPath(); ctx.roundRect(x, y, w, hh, r); }
function txt(ctx, s, x, y, size, color, weight = 800, align = 'center', font = 'Segoe UI') {
  ctx.font = `${weight} ${size}px "${font}"`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}
// Draws centred at (0,0) in project px * k. Returns the bounds {w, h} in project px.
function drawGen(ctx, c, t, k) {
  const g = c.gen, lt = t - c.start, dur = c.dur, K = (v) => v * k;
  const env = genEnv(lt, dur);
  ctx.save();
  switch (g.id) {
    case 'achievement': case 'achievementEmpty': {
      const W = 620, H = 120;
      const slide = (1 - easeOut(env.pin)) * 80 + (1 - env.pout) * -60;
      ctx.globalAlpha *= env.a;
      ctx.translate(K(slide), 0); ctx.scale(lerp(0.85, 1, easeOut(env.pin)), lerp(0.85, 1, easeOut(env.pin)));
      ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = K(24);
      ctx.fillStyle = g.color; rr(ctx, K(-W / 2), K(-H / 2), K(W), K(H), K(18)); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.save(); rr(ctx, K(-W / 2), K(-H / 2), K(W), K(H), K(18)); ctx.clip();
      const sx = lerp(-W, W, clamp((lt - 0.5) / 0.8, 0, 1));
      const gr = ctx.createLinearGradient(K(sx - 80), 0, K(sx + 80), 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(K(-W / 2), K(-H / 2), K(W), K(H)); ctx.restore();
      ctx.fillStyle = g.color2; ctx.beginPath(); ctx.arc(K(-W / 2 + 62), 0, K(40) * clamp(easeBack(clamp((lt - 0.15) / 0.4, 0, 1)), 0, 1.3), 0, 7); ctx.fill();
      txt(ctx, '🏆', K(-W / 2 + 62), K(3), K(40) * clamp((lt - 0.15) / 0.4, 0, 1), '#000', 400, 'center', 'Segoe UI Emoji');
      if (g.id === 'achievement') {
        ctx.globalAlpha *= clamp((lt - 0.3) / 0.3, 0, 1);
        txt(ctx, g.text2, K(-W / 2 + 122), K(-22), K(20), g.color2, 700, 'left');
        txt(ctx, g.text, K(-W / 2 + 122), K(14), K(36), '#ffffff', 800, 'left');
      }
      ctx.restore();
      return { w: W, h: H };
    }
    case 'levelup': {
      ctx.globalAlpha *= env.a;
      ctx.save(); ctx.rotate(lt * 0.6);
      for (let i = 0; i < 16; i++) { ctx.rotate(Math.PI / 8); ctx.fillStyle = i % 2 ? rgba(g.color2, 0.25) : rgba(g.color, 0.25); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(K(-40), K(-420)); ctx.lineTo(K(40), K(-420)); ctx.fill(); }
      ctx.restore();
      const s = env.e; ctx.scale(s, s);
      ctx.shadowColor = g.color; ctx.shadowBlur = K(30);
      ctx.lineWidth = K(10); ctx.strokeStyle = g.color; ctx.font = `900 ${K(120)}px "Arial Black"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText(g.text, 0, 0);
      txt(ctx, g.text, 0, 0, K(120), g.color2, 900, 'center', 'Arial Black');
      ctx.shadowColor = 'transparent';
      txt(ctx, g.text2, 0, K(95), K(44), '#fff', 700);
      ctx.restore();
      return { w: 760, h: 320 };
    }
    case 'hpbar': {
      const W = 560, H = 46;
      ctx.globalAlpha *= env.a;
      ctx.translate(0, K((1 - easeOut(env.pin)) * -60));
      const target = clamp(+g.text || 0, 0, 100) / 100;
      const v = lerp(1, target, easeInOut(clamp((lt - 0.6) / 1.0, 0, 1)));
      const ghost = lerp(1, target, easeInOut(clamp((lt - 1.2) / 1.0, 0, 1)));
      ctx.fillStyle = 'rgba(0,0,0,.6)'; rr(ctx, K(-W / 2 - 6), K(-H / 2 - 6), K(W + 12), K(H + 12), K(10)); ctx.fill();
      ctx.fillStyle = '#ffe9a0'; ctx.fillRect(K(-W / 2), K(-H / 2), K(W * ghost), K(H));
      ctx.fillStyle = v > 0.3 ? g.color2 : g.color; ctx.fillRect(K(-W / 2), K(-H / 2), K(W * v), K(H));
      txt(ctx, `${g.text2} ${Math.round(v * 100)}`, 0, 0, K(26), '#fff', 800);
      ctx.restore();
      return { w: W + 12, h: H + 12 };
    }
    case 'subscribe': {
      const clickT = Math.min(1.4, dur * 0.4);
      const done = lt > clickT;
      ctx.globalAlpha *= env.a;
      const s = env.e * (lt > clickT && lt < clickT + 0.15 ? 0.92 : 1);
      ctx.scale(s, s);
      const label = done ? g.text2 : g.text;
      ctx.font = `800 ${K(40)}px "Segoe UI"`;
      const W = ctx.measureText(label).width / k + 120, H = 84;
      ctx.fillStyle = done ? g.color2 : g.color; rr(ctx, K(-W / 2), K(-H / 2), K(W), K(H), K(14)); ctx.fill();
      txt(ctx, label, K(20), 0, K(40), '#fff', 800);
      txt(ctx, done ? '🔔' : '▶', K(-W / 2 + 42), K(2), K(34), '#fff', 400, 'center', 'Segoe UI Emoji');
      if (done) { ctx.save(); ctx.translate(K(W / 2 + 50), 0); ctx.rotate(Math.sin((lt - clickT) * 25) * 0.35 * Math.max(0, 1 - (lt - clickT))); txt(ctx, '🔔', 0, 0, K(54), '#fff', 400, 'center', 'Segoe UI Emoji'); ctx.restore(); }
      // cursor
      const cp = clamp((lt - 0.4) / Math.max(0.1, clickT - 0.4), 0, 1);
      ctx.save(); ctx.translate(K(lerp(W * 0.9, 30, easeInOut(cp))), K(lerp(H * 1.4, 10, easeInOut(cp))));
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = K(3);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, K(46)); ctx.lineTo(K(12), K(35)); ctx.lineTo(K(22), K(56)); ctx.lineTo(K(30), K(52)); ctx.lineTo(K(20), K(32)); ctx.lineTo(K(36), K(32)); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.restore();
      return { w: W + 120, h: H + 40 };
    }
    case 'like': {
      const s = env.e;
      ctx.globalAlpha *= env.a;
      const burst = clamp((lt - 0.2) / 0.5, 0, 1);
      if (burst > 0 && burst < 1) for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.fillStyle = i % 2 ? g.color : '#ffd23c'; ctx.globalAlpha = (1 - burst) * env.a; ctx.beginPath(); ctx.arc(Math.cos(a) * K(120 * easeOut(burst)), Math.sin(a) * K(120 * easeOut(burst)), K(10 * (1 - burst)), 0, 7); ctx.fill(); }
      ctx.globalAlpha = env.a;
      ctx.scale(s, s);
      ctx.fillStyle = g.color; ctx.beginPath(); ctx.arc(0, 0, K(80), 0, 7); ctx.fill();
      txt(ctx, '👍', 0, K(4), K(84), '#fff', 400, 'center', 'Segoe UI Emoji');
      ctx.restore();
      return { w: 260, h: 260 };
    }
    case 'message': {
      const W = 560, H = 110;
      ctx.globalAlpha *= env.a;
      ctx.translate(0, K((1 - easeOut(env.pin)) * 50));
      ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = K(20);
      ctx.fillStyle = g.color; rr(ctx, K(-W / 2 + 70), K(-H / 2), K(W - 70), K(H), K(22)); ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#6aa3d8'; ctx.beginPath(); ctx.arc(K(-W / 2 + 30), K(H / 2 - 30), K(30), 0, 7); ctx.fill();
      txt(ctx, (g.text2 || '?')[0], K(-W / 2 + 30), K(H / 2 - 30), K(28), '#fff', 700);
      txt(ctx, g.text2, K(-W / 2 + 92), K(-22), K(24), '#8fc6ff', 700, 'left');
      if (lt < 0.9) { for (let i = 0; i < 3; i++) { ctx.globalAlpha = env.a * (0.4 + 0.6 * Math.abs(Math.sin(lt * 6 - i * 0.7))); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(K(-W / 2 + 102 + i * 24), K(16), K(7), 0, 7); ctx.fill(); } }
      else txt(ctx, g.text, K(-W / 2 + 92), K(16), K(34), g.color2, 500, 'left', 'Segoe UI Emoji');
      ctx.restore();
      return { w: W, h: H };
    }
    case 'countdown': {
      const n = 3, seg = dur / n, i = Math.min(n - 1, Math.floor(lt / seg)), p = (lt - i * seg) / seg;
      ctx.lineWidth = K(14); ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.beginPath(); ctx.arc(0, 0, K(170), 0, 7); ctx.stroke();
      ctx.strokeStyle = g.color2; ctx.beginPath(); ctx.arc(0, 0, K(170), -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke();
      ctx.globalAlpha *= 1 - Math.max(0, p - 0.8) * 5;
      const s = lerp(1.6, 1, easeOut(Math.min(1, p * 3)));
      ctx.scale(s, s);
      txt(ctx, String(n - i), 0, K(8), K(200), g.color, 900, 'center', 'Arial Black');
      ctx.restore();
      return { w: 380, h: 380 };
    }
    case 'chapter': {
      const p = easeOut(env.pin);
      ctx.globalAlpha *= env.pout;
      ctx.fillStyle = g.color2; ctx.fillRect(K(-300 * p), K(-74), K(600 * p), K(4)); ctx.fillRect(K(-300 * p), K(70), K(600 * p), K(4));
      ctx.save(); ctx.beginPath(); ctx.rect(K(-400), K(-70), K(800), K(140)); ctx.clip();
      ctx.translate(0, K((1 - p) * 100));
      txt(ctx, g.text, 0, K(-14), K(70), g.color, 900, 'center', 'Arial Black');
      ctx.restore();
      ctx.globalAlpha *= clamp((lt - 0.4) / 0.4, 0, 1);
      txt(ctx, g.text2, 0, K(112), K(36), g.color, 500, 'center', 'Georgia');
      ctx.restore();
      return { w: 800, h: 300 };
    }
    case 'lowerthird': {
      const p = easeOut(env.pin), q = env.pout;
      ctx.font = `800 ${K(46)}px "Segoe UI"`; const w1 = ctx.measureText(g.text).width / k + 60;
      ctx.font = `500 ${K(28)}px "Segoe UI"`; const w2 = ctx.measureText(g.text2).width / k + 50;
      const W = Math.max(w1, w2 + 20);
      ctx.translate(K(-W / 2), 0);
      ctx.globalAlpha *= q;
      ctx.fillStyle = g.color; ctx.fillRect(0, K(-56), K(10), K(110) * p);
      ctx.save(); ctx.beginPath(); ctx.rect(K(10), K(-60), K(W * p), K(130)); ctx.clip();
      ctx.fillStyle = 'rgba(15,16,22,.88)'; ctx.fillRect(K(10), K(-56), K(w1), K(66));
      txt(ctx, g.text, K(36), K(-23), K(46), '#fff', 800, 'left');
      ctx.fillStyle = g.color; ctx.fillRect(K(10), K(12), K(w2), K(42));
      txt(ctx, g.text2, K(34), K(33), K(28), g.color2, 500, 'left');
      ctx.restore(); ctx.restore();
      return { w: W + 20, h: 130 };
    }
    case 'loading': {
      const W = 600, H = 26;
      ctx.globalAlpha *= env.a;
      const v = easeInOut(clamp(lt / Math.max(0.3, dur - 0.6), 0, 1));
      txt(ctx, `${g.text} ${Math.round(v * 100)}%`, 0, K(-40), K(36), g.color, 700);
      ctx.strokeStyle = g.color; ctx.lineWidth = K(3); rr(ctx, K(-W / 2), K(-H / 2 + 14), K(W), K(H), K(13)); ctx.stroke();
      ctx.fillStyle = g.color2; rr(ctx, K(-W / 2 + 5), K(-H / 2 + 19), K((W - 10) * v), K(H - 10), K(8)); ctx.fill();
      ctx.restore();
      return { w: W, h: 120 };
    }
    case 'boom': {
      const s = env.e * (1 + 0.05 * Math.sin(lt * 40) * Math.max(0, 1 - lt * 2));
      ctx.globalAlpha *= env.pout;
      ctx.rotate(-0.08); ctx.scale(s, s);
      const star = (r1, r2, n, col) => { ctx.fillStyle = col; ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const r = (i % 2 ? r2 : r1) * (1 + 0.08 * hash(i)); const a = (i / (n * 2)) * Math.PI * 2; ctx.lineTo(Math.cos(a) * K(r), Math.sin(a) * K(r) * 0.75); } ctx.closePath(); ctx.fill(); };
      star(300, 190, 14, g.color2); star(250, 160, 14, g.color);
      ctx.lineWidth = K(10); ctx.strokeStyle = '#000'; ctx.font = `900 ${K(110)}px "Impact"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText(g.text, 0, 0);
      txt(ctx, g.text, 0, 0, K(110), '#fff', 900, 'center', 'Impact');
      ctx.restore();
      return { w: 600, h: 460 };
    }
    case 'circle': {
      const p = easeInOut(clamp(lt / 0.6, 0, 1));
      ctx.globalAlpha *= env.pout;
      ctx.strokeStyle = g.color; ctx.lineWidth = K(12); ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i <= 80 * p; i++) { const a = -2.2 + (i / 80) * Math.PI * 2.15; const r = 1 + 0.06 * Math.sin(i * 0.3); ctx.lineTo(Math.cos(a) * K(220) * r, Math.sin(a) * K(140) * r); }
      ctx.stroke();
      ctx.restore();
      return { w: 480, h: 320 };
    }
    case 'arrow': {
      const p = easeOut(clamp(lt / 0.4, 0, 1));
      ctx.globalAlpha *= env.pout * p;
      const b = Math.sin(lt * 8) * K(14);
      ctx.translate(b, -b);
      ctx.fillStyle = g.color; ctx.strokeStyle = '#000'; ctx.lineWidth = K(5);
      ctx.beginPath(); ctx.moveTo(K(-60), K(60)); ctx.lineTo(K(-60), K(-10)); ctx.lineTo(K(-20), K(25)); ctx.lineTo(K(70), K(-65)); ctx.lineTo(K(95), K(-40)); ctx.lineTo(K(5), K(50)); ctx.lineTo(K(40), K(90)); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (g.text) { ctx.lineWidth = K(8); ctx.strokeStyle = '#000'; ctx.font = `900 ${K(54)}px "Impact"`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.strokeText(g.text, K(100), K(-80)); txt(ctx, g.text, K(100), K(-80), K(54), g.color2, 900, 'left', 'Impact'); }
      ctx.restore();
      return { w: 420, h: 260 };
    }
    case 'check': case 'cross': {
      const p = clamp(lt / 0.5, 0, 1);
      ctx.globalAlpha *= env.pout;
      const s = easeBack(clamp(lt / 0.35, 0, 1));
      ctx.scale(s, s);
      ctx.fillStyle = g.color; ctx.beginPath(); ctx.arc(0, 0, K(110), 0, 7); ctx.fill();
      ctx.strokeStyle = g.color2; ctx.lineWidth = K(24); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      if (g.id === 'check') { const pts = [[-52, 4], [-14, 44], [56, -38]]; ctx.moveTo(K(pts[0][0]), K(pts[0][1])); const q = p * 2; if (q < 1) ctx.lineTo(K(lerp(pts[0][0], pts[1][0], q)), K(lerp(pts[0][1], pts[1][1], q))); else { ctx.lineTo(K(pts[1][0]), K(pts[1][1])); ctx.lineTo(K(lerp(pts[1][0], pts[2][0], q - 1)), K(lerp(pts[1][1], pts[2][1], q - 1))); } }
      else { const q = p * 2; ctx.moveTo(K(-45), K(-45)); ctx.lineTo(K(lerp(-45, 45, Math.min(1, q))), K(lerp(-45, 45, Math.min(1, q)))); if (q > 1) { ctx.moveTo(K(45), K(-45)); ctx.lineTo(K(lerp(45, -45, q - 1)), K(lerp(-45, 45, q - 1))); } }
      ctx.stroke();
      ctx.restore();
      return { w: 240, h: 240 };
    }
  }
  ctx.restore();
  return { w: 200, h: 100 };
}

PANELS.footage = function (p) {
  p.append(h('h3', {}, '🎞 Футажи'));
  p.append(h('div', { class: 'note' }, 'Анимированные футажи с прозрачным фоном. Текст и цвета меняются справа. «Достижение (пустое)» можно синхронизировать со своим текстом (⇄ Синхр.). Любые другие футажи — вставьте ссылку во вкладке «Медиа».'));
  const cats = [...new Set(GENS.map((g) => g.cat))];
  const thumbs = [];
  for (const cat of cats) {
    p.append(h('h4', {}, cat));
    const grid = h('div', { class: 'grid' });
    for (const g of GENS.filter((x) => x.cat === cat)) {
      const cv = h('canvas', { width: 160, height: 90 });
      const tile = h('div', { class: 'tile' }, h('div', { class: 'thumb', style: { background: 'repeating-conic-gradient(#2a2c36 0 25%, #22242d 0 50%) 0 0/16px 16px' } }, cv), h('div', { class: 'name' }, g.name),
        h('button', { class: 'add', onclick: (e) => { e.stopPropagation(); addGen(g.id, S.time); } }, '+'));
      tile.addEventListener('click', () => addGen(g.id, S.time));
      dragData(tile, { kind: 'gen', id: g.id });
      grid.append(tile);
      thumbs.push([cv, g]);
    }
    p.append(grid);
  }
  cancelAnimationFrame(thumbAnim);
  const t0 = performance.now();
  const frame = () => {
    if (curPanel !== 'footage') return;
    const now = (performance.now() - t0) / 1000;
    for (const [cv, g] of thumbs) {
      const x = cv.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.clearRect(0, 0, 160, 90);
      const fake = { start: 0, dur: g.dur, gen: { ...g } };
      const sc = 160 / 1920 * 2.4;
      x.translate(80, 45);
      try { drawGen(x, fake, now % (g.dur + 0.6), sc); } catch (_) {}
    }
    thumbAnim = requestAnimationFrame(() => setTimeout(frame, 40));
  };
  frame();
};
function addGen(id, at) {
  const g = GENS.find((x) => x.id === id);
  if (!g) return null;
  let c;
  change(() => {
    const tr = freeTrack('text', at, g.dur, (P().tracks.find((x) => x.kind === 'text' && !x.captions) || {}).id);
    c = makeClip('gen', { start: at, dur: g.dur, trackId: tr.id, name: g.name });
    c.gen = { id: g.id, text: g.text, text2: g.text2, color: g.color, color2: g.color2 };
    if (['lowerthird'].includes(g.id)) { c.tf.x = -P().width * 0.25; c.tf.y = P().height * 0.3; }
    if (['achievement', 'achievementEmpty', 'message', 'hpbar'].includes(g.id)) c.tf.y = -P().height * 0.3;
    if (['subscribe', 'like'].includes(g.id)) c.tf.y = P().height * 0.28;
    P().clips.push(c); selectOnly(c.id);
  });
  return c;
}
INSP.gen = function (box, c) {
  const g = c.gen;
  const s = this.sec(box, GENS.find((x) => x.id === g.id)?.name || 'Футаж');
  const field = (label, key) => { const i = h('input', { type: 'text', value: g[key] || '', style: { width: '100%' } }); i.addEventListener('input', () => { beginEdit(); g[key] = i.value; requestRender(); }); i.addEventListener('change', endEdit); s.append(h('div', { class: 'row wide' }, h('label', {}, label), i)); };
  if (!['like', 'countdown', 'circle', 'check', 'cross', 'achievementEmpty'].includes(g.id)) { field('Текст', 'text'); field('Текст 2', 'text2'); }
  this.color(s, 'Цвет', () => g.color, (v) => { g.color = v; });
  this.color(s, 'Цвет 2', () => g.color2, (v) => { g.color2 = v; });
  this.slider(s, 'Длительность', () => c.dur, (v) => { c.dur = Math.max(0.3, v); }, 0.3, 20, 0.1);
  this.transform(box, c);
};

// ============ Extra effects ============
EFFECTS.push(
  { id: 'earthquake', name: 'Землетрясение', cat: 'Динамика' },
  { id: 'drunk', name: 'Пьяная камера', cat: 'Динамика' },
  { id: 'zoomblur', name: 'Зум-размытие', cat: 'Динамика' },
  { id: 'speedlines', name: 'Линии скорости', cat: 'Динамика' },
  { id: 'shockwave', name: 'Ударная волна', cat: 'Динамика' },
  { id: 'tvoff', name: 'Выключение ТВ', cat: 'Ретро' },
  { id: 'tvon', name: 'Включение ТВ', cat: 'Ретро' },
  { id: 'static', name: 'Помехи', cat: 'Ретро' },
  { id: 'thermal', name: 'Тепловизор', cat: 'Искажения' },
  { id: 'nightvision', name: 'Ночное видение', cat: 'Искажения' },
  { id: 'duotone', name: 'Дуотон', cat: 'Искажения' },
  { id: 'danger', name: 'Опасность', cat: 'Свет' },
  { id: 'spotlight', name: 'Прожектор', cat: 'Свет' },
  { id: 'sunrays', name: 'Лучи солнца', cat: 'Свет' },
  { id: 'lensflare', name: 'Блик объектива', cat: 'Свет' },
  { id: 'bokeh', name: 'Боке', cat: 'Частицы' },
  { id: 'fireflies', name: 'Светлячки', cat: 'Частицы' },
  { id: 'matrix', name: 'Матрица', cat: 'Частицы' },
  { id: 'starfield', name: 'Звёзды', cat: 'Частицы' },
  { id: 'bubbles', name: 'Пузыри', cat: 'Частицы' },
);
// Spotlight: x/y from -1 (left/top) to 1 (right/bottom); auto = wanders around (sx, sy), pan = slides from point 1 to point 2
const SPOT_DEFAULT = { spotMode: 'auto', sx: 0, sy: 0, sx2: 0.5, sy2: 0, size: 1, soft: 0.73, speed: 1, range: 1 };
function extraEffect(id, cv, ctx, lt, dur, amt, k, gt, opt) {
  const w = cv.width, hh = cv.height, p = clamp(lt / Math.max(0.01, dur), 0, 1);
  switch (id) {
    case 'earthquake': { const a = 70 * amt * k; drawTransformed(cv, (x) => { x.translate(w / 2 + noise1(lt * 30) * a, hh / 2 + noise1(lt * 30 + 7) * a); x.rotate(noise1(lt * 20 + 3) * 0.05 * amt); x.scale(1.15, 1.15); }); ctx.filter = 'none'; break; }
    case 'drunk': { const src = copyOf(cv, 5); ctx.clearRect(0, 0, w, hh); ctx.save(); ctx.translate(w / 2, hh / 2); ctx.rotate(Math.sin(lt * 1.3) * 0.06 * amt); ctx.scale(1.1 + 0.04 * Math.sin(lt * 0.9), 1.1); ctx.drawImage(src, -w / 2, -hh / 2); ctx.restore(); ctx.globalAlpha = 0.45 * amt; ctx.drawImage(src, Math.sin(lt * 2) * 30 * k, 0); break; }
    case 'zoomblur': { const src = copyOf(cv, 5); ctx.globalAlpha = 0.18 * amt; for (let i = 1; i <= 6; i++) { const s = 1 + i * 0.025 * amt; ctx.drawImage(src, (w - w * s) / 2, (hh - hh * s) / 2, w * s, hh * s); } break; }
    case 'speedlines': { ctx.strokeStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 60; i++) { const a = hash(i * 3 + Math.floor(lt * 12)) * Math.PI * 2, r0 = Math.min(w, hh) * (0.35 + 0.2 * hash(i)), r1 = Math.hypot(w, hh); ctx.lineWidth = (1 + 3 * hash(i + 9)) * k; ctx.globalAlpha = amt * (0.3 + 0.7 * hash(i + 5)); ctx.beginPath(); ctx.moveTo(w / 2 + Math.cos(a) * r0, hh / 2 + Math.sin(a) * r0); ctx.lineTo(w / 2 + Math.cos(a) * r1, hh / 2 + Math.sin(a) * r1); ctx.stroke(); } break; }
    case 'shockwave': { const q = (lt % 1.2) / 1.2, r = Math.hypot(w, hh) * 0.6 * easeOut(q); ctx.strokeStyle = `rgba(255,255,255,${(1 - q) * 0.8 * amt})`; ctx.lineWidth = 30 * k * (1 - q); ctx.beginPath(); ctx.arc(w / 2, hh / 2, r, 0, 7); ctx.stroke(); drawTransformed(cv, (x) => { const s = 1 + 0.04 * amt * (1 - q); x.translate(w / 2, hh / 2); x.scale(s, s); }); break; }
    case 'tvoff': case 'tvon': {
      const q = id === 'tvoff' ? clamp((lt - (dur - 0.6)) / 0.6, 0, 1) : 1 - clamp(lt / 0.6, 0, 1);
      if (q <= 0) break;
      const src = copyOf(cv, 5); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, hh);
      const sy = Math.max(0.004, 1 - easeIn(Math.min(1, q * 1.6))), sx = q > 0.6 ? Math.max(0.002, 1 - easeIn((q - 0.6) / 0.4)) : 1;
      ctx.save(); ctx.translate(w / 2, hh / 2); ctx.scale(sx, sy); ctx.filter = `brightness(${1 + q * 2})`; ctx.drawImage(src, -w / 2, -hh / 2); ctx.restore();
      break;
    }
    case 'static': { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.55 * amt; const pat = ctx.createPattern(noiseTile(Math.floor(lt * 30)), 'repeat'); ctx.fillStyle = pat; ctx.fillRect(0, 0, w, hh); ctx.globalAlpha = 0.25 * amt; ctx.fillStyle = '#000'; for (let y = (lt * 200 * k) % (8 * k); y < hh; y += 8 * k) ctx.fillRect(0, y, w, 3 * k); break; }
    case 'thermal': { const src = copyOf(cv, 5); ctx.clearRect(0, 0, w, hh); ctx.filter = 'grayscale(1) contrast(1.4)'; ctx.drawImage(src, 0, 0); ctx.filter = 'none'; const g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#1a0060'); g.addColorStop(0.35, '#c4006b'); g.addColorStop(0.65, '#ff8a00'); g.addColorStop(1, '#fff36b'); ctx.globalCompositeOperation = 'color'; ctx.globalAlpha = amt; ctx.fillStyle = g; ctx.fillRect(0, 0, w, hh); ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = '#ff5a00'; ctx.globalAlpha = 0.35 * amt; ctx.fillRect(0, 0, w, hh); break; }
    case 'nightvision': { const src = copyOf(cv, 5); ctx.clearRect(0, 0, w, hh); ctx.filter = 'grayscale(1) brightness(1.4) contrast(1.3)'; ctx.drawImage(src, 0, 0); ctx.filter = 'none'; ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#3cff5a'; ctx.globalAlpha = amt; ctx.fillRect(0, 0, w, hh); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.4 * amt; ctx.fillStyle = ctx.createPattern(noiseTile(Math.floor(lt * 24)), 'repeat'); ctx.fillRect(0, 0, w, hh); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; drawVignette(ctx, w, hh, 0.9 * amt); break; }
    case 'duotone': { const src = copyOf(cv, 5); ctx.clearRect(0, 0, w, hh); ctx.filter = 'grayscale(1) contrast(1.2)'; ctx.drawImage(src, 0, 0); ctx.filter = 'none'; ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = amt; ctx.fillStyle = '#ff3c8a'; ctx.fillRect(0, 0, w, hh); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = '#1e2bff'; ctx.globalAlpha = 0.6 * amt; ctx.fillRect(0, 0, w, hh); break; }
    case 'danger': { const pulse = 0.5 + 0.5 * Math.sin(lt * 7); const g = ctx.createRadialGradient(w / 2, hh / 2, Math.min(w, hh) * 0.25, w / 2, hh / 2, Math.hypot(w, hh) / 2); g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(220,0,0,${(0.4 + 0.45 * pulse) * amt})`); ctx.fillStyle = g; ctx.fillRect(0, 0, w, hh); break; }
    case 'spotlight': {
      const o = { ...SPOT_DEFAULT, ...opt };
      let x, y;
      if (o.spotMode === 'point') { x = o.sx; y = o.sy; }
      else if (o.spotMode === 'pan') { const q = easeInOut(p); x = lerp(o.sx, o.sx2, q); y = lerp(o.sy, o.sy2, q); }
      else { x = o.sx + 0.6 * o.range * Math.sin(lt * 0.8 * o.speed); y = o.sy + 0.4 * o.range * Math.cos(lt * 0.6 * o.speed); }
      x = w * (0.5 + x / 2); y = hh * (0.5 + y / 2);
      const R = Math.min(w, hh) * 0.45 * o.size;
      const g = ctx.createRadialGradient(x, y, R * clamp(1 - o.soft, 0, 0.98), x, y, R);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.85 * amt})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, hh); break;
    }
    case 'sunrays': { ctx.globalCompositeOperation = 'screen'; ctx.translate(w * 0.85, -hh * 0.1); ctx.rotate(Math.sin(lt * 0.3) * 0.05); for (let i = 0; i < 9; i++) { const a = 0.9 + i * 0.12; const g = ctx.createLinearGradient(0, 0, Math.cos(a) * w, Math.sin(a) * w); g.addColorStop(0, `rgba(255,220,150,${0.35 * amt * (0.5 + 0.5 * hash(i))})`); g.addColorStop(1, 'rgba(255,220,150,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a - 0.03) * w * 1.6, Math.sin(a - 0.03) * w * 1.6); ctx.lineTo(Math.cos(a + 0.03) * w * 1.6, Math.sin(a + 0.03) * w * 1.6); ctx.fill(); } break; }
    case 'lensflare': { ctx.globalCompositeOperation = 'screen'; const fx = w * (0.2 + 0.6 * p), fy = hh * 0.25; const cxp = w / 2, cyp = hh / 2; for (let i = 0; i < 6; i++) { const q = i / 5 * 1.8; const x = fx + (cxp - fx) * q, y = fy + (cyp - fy) * q, r = (i === 0 ? 120 : 20 + 40 * hash(i)) * k; const g = ctx.createRadialGradient(x, y, 0, x, y, r); const col = ['255,240,200', '255,160,80', '120,200,255', '255,120,200', '180,255,180', '255,255,255'][i]; g.addColorStop(0, `rgba(${col},${(i === 0 ? 0.9 : 0.35) * amt})`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); } break; }
    case 'bokeh': { ctx.globalCompositeOperation = 'screen'; particles(ctx, w, hh, lt, 40, (i, a, b, c) => { const x = (a * w + Math.sin(lt * 0.3 + i) * 40 * k), y = (b * hh + Math.cos(lt * 0.25 + i) * 30 * k), r = (20 + 50 * c) * k; const g = ctx.createRadialGradient(x, y, 0, x, y, r); const col = ['255,200,120', '255,140,180', '160,200,255'][i % 3]; g.addColorStop(0, `rgba(${col},${0.35 * amt})`); g.addColorStop(0.8, `rgba(${col},${0.25 * amt})`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }); break; }
    case 'fireflies': { ctx.globalCompositeOperation = 'lighter'; particles(ctx, w, hh, lt, 50, (i, a, b, c) => { const x = (a * w + noise1(lt * 0.4 + i) * 120 * k + w) % w, y = (b * hh + noise1(lt * 0.35 + i * 2) * 90 * k + hh) % hh; const tw = 0.5 + 0.5 * Math.sin(lt * (2 + 3 * c) + i); const r = (6 + 8 * c) * k; const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(230,255,120,${tw * amt})`); g.addColorStop(1, 'rgba(230,255,120,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }); break; }
    case 'matrix': { ctx.fillStyle = `rgba(0,0,0,${0.35 * amt})`; ctx.fillRect(0, 0, w, hh); const fs = Math.max(8, 18 * k); ctx.font = `${fs}px Consolas`; const cols = Math.floor(w / fs); for (let i = 0; i < cols; i++) { const sp = 4 + 8 * hash(i); const head = ((hash(i * 7) * hh + lt * sp * fs * 3) % (hh + 20 * fs)); for (let j = 0; j < 18; j++) { const y = head - j * fs; if (y < 0 || y > hh) continue; ctx.fillStyle = j === 0 ? `rgba(220,255,220,${amt})` : `rgba(40,255,90,${amt * (1 - j / 18)})`; ctx.fillText(String.fromCharCode(0x30a0 + Math.floor(hash(i * 31 + j + Math.floor(lt * 8)) * 90)), i * fs, y); } } break; }
    case 'starfield': { ctx.fillStyle = '#fff'; particles(ctx, w, hh, lt, 160, (i, a, b, c) => { const z = 1 - ((c + lt * 0.25) % 1); const x = w / 2 + (a - 0.5) * w / z * 0.5, y = hh / 2 + (b - 0.5) * hh / z * 0.5; if (x < 0 || x > w || y < 0 || y > hh) return; ctx.globalAlpha = amt * (1 - z); ctx.beginPath(); ctx.arc(x, y, (1 - z) * 3 * k + 0.5, 0, 7); ctx.fill(); }); break; }
    case 'bubbles': { ctx.strokeStyle = 'rgba(200,240,255,.8)'; particles(ctx, w, hh, lt, 40, (i, a, b, c) => { const sp = 50 + 80 * c; const y = hh + 40 * k - ((b * hh + lt * sp * k) % (hh + 80 * k)); const x = a * w + Math.sin(lt * 2 + i) * 20 * k; const r = (8 + 22 * c) * k; ctx.globalAlpha = amt * 0.8; ctx.lineWidth = 2 * k; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.globalAlpha = amt * 0.5; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.2, 0, 7); ctx.fill(); }); break; }
  }
}

// ============ Extra sound effects ============
SFX.push(
  { id: 'hit', name: 'Удар', icon: '👊', dur: 0.5 },
  { id: 'scratch', name: 'Скретч пластинки', icon: '💿', dur: 0.6 },
  { id: 'horn', name: 'Горн', icon: '📯', dur: 1.4 },
  { id: 'buzzer', name: 'Неверно', icon: '🚫', dur: 0.9 },
  { id: 'correct', name: 'Верно', icon: '✔️', dur: 0.8 },
  { id: 'typing', name: 'Печать', icon: '⌨️', dur: 1.5 },
  { id: 'shutter', name: 'Затвор камеры', icon: '📸', dur: 0.4 },
  { id: 'notify', name: 'Уведомление', icon: '💬', dur: 0.6 },
  { id: 'rewind', name: 'Перемотка', icon: '⏪', dur: 1.2 },
  { id: 'slideup', name: 'Свисток вверх', icon: '⤴️', dur: 0.8 },
  { id: 'slidedown', name: 'Свисток вниз', icon: '⤵️', dur: 0.8 },
  { id: 'thunder', name: 'Гром', icon: '⛈', dur: 3 },
  { id: 'wind', name: 'Ветер', icon: '🌬', dur: 3 },
  { id: 'cash', name: 'Касса', icon: '💵', dur: 1 },
  { id: 'levelupsfx', name: 'Новый уровень', icon: '⬆️', dur: 1.2 },
  { id: 'tick', name: 'Тиканье часов', icon: '⏱', dur: 3 },
  { id: 'jump', name: 'Прыжок', icon: '🦘', dur: 0.4 },
  { id: 'magic', name: 'Волшебство', icon: '🪄', dur: 1.5 },
);
function extraSfx(id, ac, out, H) {
  const { noise, osc, env, T } = H;
  const tone = (type, f, t0, d, a, f2) => { const o = osc(type, f); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d); const g = ac.createGain(); g.gain.setValueAtTime(0.0001, 0); env(g, 0.005, a, d, t0); o.connect(g).connect(out); o.start(t0); o.stop(t0 + d + 0.05); };
  const nz = (t0, d, a, type, f, q = 1) => { const n = noise(); const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ac.createGain(); g.gain.setValueAtTime(0.0001, 0); env(g, 0.003, a, d, t0); n.connect(fl).connect(g).connect(out); n.start(t0); n.stop(t0 + d + 0.05); return fl; };
  switch (id) {
    case 'hit': tone('sine', 160, 0, 0.3, 1, 40); nz(0, 0.12, 0.8, 'lowpass', 2500); break;
    case 'scratch': { const n = noise(); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 4; f.frequency.setValueAtTime(400, 0); f.frequency.linearRampToValueAtTime(2500, 0.15); f.frequency.linearRampToValueAtTime(300, 0.35); f.frequency.linearRampToValueAtTime(1800, 0.55); const g = ac.createGain(); g.gain.value = 0.9; n.connect(f).connect(g).connect(out); n.start(); break; }
    case 'horn': for (const f of [233, 294, 349, 466]) { const o = osc('sawtooth', f); const g = ac.createGain(); g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.12, 0.05); g.gain.setValueAtTime(0.12, T - 0.2); g.gain.linearRampToValueAtTime(0, T); const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 2200; o.connect(fl).connect(g).connect(out); o.start(); } break;
    case 'buzzer': { const o = osc('sawtooth', 110); const o2 = osc('square', 116); const g = ac.createGain(); g.gain.setValueAtTime(0.25, 0); g.gain.setValueAtTime(0.25, T - 0.05); g.gain.linearRampToValueAtTime(0, T); o.connect(g); o2.connect(g); g.connect(out); o.start(); o2.start(); break; }
    case 'correct': tone('sine', 880, 0, 0.3, 0.4); tone('sine', 1318, 0.12, 0.6, 0.4); break;
    case 'typing': for (let t = 0.02; t < T - 0.1; t += 0.06 + Math.random() * 0.08) nz(t, 0.03, 0.5 + Math.random() * 0.3, 'highpass', 1800 + Math.random() * 2000); break;
    case 'shutter': nz(0, 0.05, 0.8, 'highpass', 1500); nz(0.12, 0.06, 0.6, 'bandpass', 3000, 2); break;
    case 'notify': tone('sine', 1046, 0, 0.25, 0.4); tone('sine', 1568, 0.1, 0.4, 0.35); break;
    case 'rewind': { const o = osc('sawtooth', 300); o.frequency.linearRampToValueAtTime(1800, T); const lfo = osc('square', 18); const lg = ac.createGain(); lg.gain.value = 0.15; const g = ac.createGain(); g.gain.value = 0.15; lfo.connect(lg.gain); o.connect(lg).connect(g).connect(out); o.start(); lfo.start(); nz(0, T, 0.25, 'bandpass', 3000, 1); break; }
    case 'slideup': tone('sine', 400, 0, T, 0.4, 1600); break;
    case 'slidedown': tone('sine', 1600, 0, T, 0.4, 350); break;
    case 'thunder': { const f = nz(0, 2.8, 1, 'lowpass', 400); f.frequency.setValueAtTime(1200, 0); f.frequency.exponentialRampToValueAtTime(150, 2.5); nz(0.05, 0.4, 0.8, 'lowpass', 2500); break; }
    case 'wind': { const n = noise(); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; const lfo = osc('sine', 0.3); const lg = ac.createGain(); lg.gain.value = 500; lfo.connect(lg).connect(f.frequency); f.frequency.value = 700; const g = ac.createGain(); g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.6, 0.8); g.gain.setValueAtTime(0.6, T - 0.8); g.gain.linearRampToValueAtTime(0, T); n.connect(f).connect(g).connect(out); n.start(); lfo.start(); break; }
    case 'cash': nz(0, 0.08, 0.6, 'highpass', 2500); tone('triangle', 2093, 0.12, 0.8, 0.35); tone('triangle', 2637, 0.12, 0.8, 0.25); break;
    case 'levelupsfx': [523, 659, 784, 1046, 1318].forEach((f, i) => tone('square', f, i * 0.08, 0.35, 0.12)); break;
    case 'tick': for (let t = 0; t < T - 0.05; t += 0.5) nz(t, 0.02, 0.7, 'bandpass', t % 1 ? 2400 : 3200, 6); break;
    case 'jump': tone('square', 300, 0, 0.3, 0.2, 900); break;
    case 'magic': for (let i = 0; i < 14; i++) tone('sine', 1200 + Math.random() * 2400, i * 0.07, 0.4, 0.12); break;
  }
}
