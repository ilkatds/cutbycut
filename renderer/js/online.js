'use strict';
// ============ Online catalog panel ============
const ONL = { kind: 'sound', q: '', license: 'all', page: 1, items: [], total: 0, busy: false, error: '', preview: null };
const ONL_TABS = [['sound', '🔊 Звуки'], ['music', '🎵 Музыка'], ['video', '🎞 Видео'], ['image', '🖼 Картинки']];
const ONL_SUGGEST = {
  sound: ['whoosh', 'explosion', 'laugh', 'applause', 'click', 'rain', 'glitch', 'notification', 'punch', 'swoosh'],
  music: ['lofi', 'epic', 'happy', 'chill', 'electronic', 'piano', 'rock', 'funny'],
  video: ['green screen', 'explosion', 'smoke', 'fire', 'city night', 'nature', 'particles', 'countdown'],
  image: ['background', 'texture', 'sky', 'meme', 'frame', 'gradient', 'space'],
};

async function onlineSearch(page = 1) {
  ONL.busy = true; ONL.error = ''; ONL.page = page;
  if (curPanel === 'online') setPanel('online');
  try {
    const r = await api.onlineSearch({ kind: ONL.kind, q: ONL.q || ONL_SUGGEST[ONL.kind][0], page, license: ONL.license });
    ONL.items = page > 1 ? ONL.items.concat(r.items) : r.items;
    ONL.total = r.total;
  } catch (e) {
    ONL.error = /NOKEY/.test(e.message) ? 'NOKEY' : e.message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
    if (page === 1) ONL.items = [];
  }
  ONL.busy = false;
  if (curPanel === 'online') setPanel('online');
}
function stopOnlinePreview() { if (ONL.preview) { ONL.preview.pause(); ONL.preview = null; } $$('.onlPlay').forEach((b) => { b.textContent = '▶'; }); }

PANELS.online = function (p) {
  p.append(h('h3', {}, '🌐 Онлайн-каталог'));
  const tabs = h('div', { class: 'seg', style: { marginBottom: '8px' } });
  for (const [k, n] of ONL_TABS) tabs.append(h('button', { class: ONL.kind === k ? 'on' : '', onclick: () => { if (ONL.kind !== k) { stopOnlinePreview(); ONL.kind = k; ONL.items = []; onlineSearch(1); } } }, n));
  p.append(tabs);
  const inp = h('input', { type: 'text', value: ONL.q, placeholder: 'Поиск (лучше на английском): ' + ONL_SUGGEST[ONL.kind].slice(0, 3).join(', '), style: { flex: 1, minWidth: 0 } });
  const go = () => { ONL.q = inp.value.trim(); stopOnlinePreview(); onlineSearch(1); };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  p.append(h('div', { class: 'panelBar' }, inp, h('button', { class: 'primary', onclick: go }, '🔎')));
  const chips = h('div', { style: { marginBottom: '6px' } });
  for (const s of ONL_SUGGEST[ONL.kind]) chips.append(h('span', { class: 'chip', onclick: () => { inp.value = s; go(); } }, s));
  p.append(chips);
  if (ONL.kind !== 'video') {
    const lic = h('select', {}, h('option', { value: 'all' }, 'Лицензии CC0 и CC BY (с указанием автора)'), h('option', { value: 'cc0' }, 'Только CC0 (без условий)'));
    lic.value = ONL.license;
    lic.addEventListener('change', () => { ONL.license = lic.value; onlineSearch(1); });
    p.append(h('div', { class: 'panelBar' }, lic));
  }
  if (ONL.error === 'NOKEY') {
    p.append(h('div', { class: 'note' }, 'Для видео нужен бесплатный ключ Pixabay или Pexels.'), h('button', { onclick: () => openSettings('online') }, '⚙ Вставить ключ'));
    return;
  }
  if (ONL.error) p.append(h('div', { class: 'note', style: { color: '#ff8a7a' } }, 'Ошибка: ' + ONL.error));
  if (ONL.busy && !ONL.items.length) { p.append(h('div', { class: 'note' }, 'Ищу… Openverse иногда отвечает до минуты, особенно на новый запрос.')); return; }
  if (!ONL.items.length && !ONL.busy) {
    if (!ONL.error) setTimeout(() => { if (!ONL.items.length && !ONL.busy && curPanel === 'online') onlineSearch(1); }, 50);
    return;
  }
  const isAudio = ONL.kind === 'sound' || ONL.kind === 'music';
  const wrap = h('div', { class: isAudio ? '' : 'grid' });
  for (const it of ONL.items) wrap.append(isAudio ? onlineAudioRow(it) : onlineTile(it));
  p.append(wrap);
  p.append(h('div', { class: 'btnRow', style: { margin: '10px 0' } }, h('button', { disabled: ONL.busy, onclick: () => onlineSearch(ONL.page + 1) }, ONL.busy ? 'Загрузка…' : 'Показать ещё')));
  p.append(h('div', { class: 'note' }, 'Материалы принадлежат авторам. CC0 — можно без условий; CC BY — укажите автора (CutByCut сохранит список авторов при экспорте). Pixabay/Pexels — бесплатно для роликов, нельзя продавать сами файлы.'));
};

function licBadge(it) { return h('span', { class: 'chip', style: { margin: 0, padding: '1px 6px', fontSize: '10px', cursor: 'default' }, title: it.source }, it.license); }
function onlineAudioRow(it) {
  const play = h('button', { class: 'onlPlay', title: 'Прослушать', style: { width: '30px', padding: '4px 0' } }, '▶');
  play.addEventListener('click', () => {
    const was = ONL.preview && ONL.preview.__id === it.id;
    stopOnlinePreview();
    if (was) return;
    const a = new Audio(it.preview); a.__id = it.id; a.volume = 0.8;
    a.play().catch(() => toast('Не удалось воспроизвести'));
    a.onended = stopOnlinePreview;
    ONL.preview = a; play.textContent = '❚❚';
  });
  const add = h('button', { class: 'primary', title: 'Скачать и добавить в позицию головки', style: { padding: '4px 10px' }, onclick: (e) => onlineAdd(it, e.currentTarget) }, '+');
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px', background: 'var(--bg2)', borderRadius: '8px', marginBottom: '5px' } },
    play,
    h('div', { style: { flex: 1, minWidth: 0 } },
      h('div', { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, title: it.title, 'data-no-i18n': '' }, it.title),
      h('div', { class: 'note', style: { margin: 0, display: 'flex', gap: '6px', alignItems: 'center' } }, h('span', { 'data-no-i18n': '' }, it.author ? '© ' + it.author : ''), it.duration ? fmtDur(it.duration) : '', licBadge(it))),
    add);
}
function onlineTile(it) {
  const thumb = h('div', { class: 'thumb', style: { backgroundImage: `url("${it.thumb}")` } });
  if (it.duration) thumb.append(h('span', { class: 'badge' }, fmtDur(it.duration)));
  const tile = h('div', { class: 'tile', title: `${it.title} — ${it.author} (${it.license})` }, thumb, h('div', { class: 'name', 'data-no-i18n': '' }, it.author ? '© ' + it.author : it.title),
    h('button', { class: 'add', title: 'Скачать и добавить', onclick: (e) => { e.stopPropagation(); onlineAdd(it, e.currentTarget); } }, '+'));
  if (it.kind === 'video') {
    let v = null;
    tile.addEventListener('mouseenter', () => { v = h('video', { src: it.preview, muted: true, autoplay: true, loop: true, style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' } }); v.muted = true; thumb.append(v); });
    tile.addEventListener('mouseleave', () => { if (v) { v.remove(); v = null; } });
  }
  tile.addEventListener('click', () => onlineAdd(it, $('.add', tile)));
  return tile;
}
async function onlineAdd(it, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const name = `${it.title || it.source} ${it.id}`.slice(0, 70);
    const file = await api.onlineDownload({ url: it.download, name, ext: it.ext });
    const m = await importFile(file, (it.title || it.source).slice(0, 60));
    if (!m) throw new Error('файл не распознан');
    m.credit = { title: it.title, author: it.author, license: it.license, licenseUrl: it.licenseUrl, url: it.landing, source: it.source };
    if (m.type === 'audio') addMediaToTimeline(m); else addAtPlayhead(m);
    toast('Добавлено: ' + (it.title || '').slice(0, 50));
  } catch (e) { toast('Не удалось скачать: ' + e.message.replace(/^Error invoking remote method '[^']*': (Error: )?/, ''), 5000); }
  if (btn) { btn.disabled = false; btn.textContent = '+'; }
}

// Credits for everything from the catalog that is used on the timeline
function creditsText() {
  const used = new Set(P().clips.map((c) => c.mediaId));
  const list = P().media.filter((m) => m.credit && used.has(m.id));
  if (!list.length) return '';
  return list.map((m) => `• «${m.credit.title || m.name}» — ${m.credit.author || '?'} (${m.credit.source}), ${m.credit.license}${m.credit.licenseUrl ? ' ' + m.credit.licenseUrl : ''}${m.credit.url ? '\n  ' + m.credit.url : ''}`).join('\n');
}
