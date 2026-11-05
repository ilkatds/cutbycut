'use strict';
// ============ Text input dialog (window.prompt does not exist in Electron) ============
function askText(title, value = '') {
  return new Promise((resolve) => {
    openModal((box) => {
      box.append(h('h2', {}, title));
      const i = h('input', { type: 'text', value, style: { width: '100%' } });
      const ok = () => { closeModal(); resolve(i.value.trim() || null); };
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') { closeModal(); resolve(null); } });
      box.append(i, h('div', { class: 'actions' }, h('button', { onclick: () => { closeModal(); resolve(null); } }, 'Отмена'), h('button', { class: 'primary', onclick: ok }, 'OK')));
      setTimeout(() => { i.focus(); i.select(); }, 30);
    });
  });
}

// ============ Recent projects & versions ============
async function rememberRecent(path) {
  if (!path || /[\\/]versions[\\/]|autosave\.sklejka$/i.test(path)) return;
  const list = (SET.recent || []).filter((r) => r.path !== path);
  list.unshift({ path, name: P().name, mode: P().mode || 'video', time: Date.now() });
  await saveSetting({ recent: list.slice(0, 12) });
}
let lastVersionAt = 0;
async function saveVersion(force) {
  if (!SET.versionsKeep || !P() || !P().clips.length) return;
  if (!force && Date.now() - lastVersionAt < 120000) return;
  lastVersionAt = Date.now();
  try { await api.versionsSave({ name: P().name, json: serialize(), keep: SET.versionsKeep }); } catch (_) {}
}
function fmtWhen(ms) {
  const d = new Date(ms), now = new Date();
  const same = d.toDateString() === now.toDateString();
  return (same ? 'сегодня ' : d.toLocaleDateString('ru-RU') + ' ') + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
async function openVersions() {
  const list = await api.versionsList();
  openModal((box) => {
    box.style.width = '640px';
    box.append(h('h2', {}, '🕘 Версии проектов'));
    box.append(h('div', { class: 'note' }, 'Копии создаются при каждом сохранении и автоматически во время работы. Открытие версии не удаляет текущий проект.'));
    if (!list.length) box.append(h('div', { class: 'empty' }, 'Пока нет сохранённых версий.'));
    let cur = null;
    for (const v of list.slice(0, 200)) {
      if (v.project !== cur) { cur = v.project; box.append(h('h4', { 'data-no-i18n': '' }, v.project)); }
      box.append(h('div', { class: 'panelBar', style: { background: 'var(--bg2)', padding: '6px 10px', borderRadius: '8px', marginBottom: '4px' } },
        h('span', { style: { flex: 1 } }, fmtWhen(v.time)), h('span', { class: 'note', style: { margin: 0 } }, Math.round(v.size / 1024) + ' КБ'),
        h('button', { onclick: async () => { if (await confirmDiscard()) { closeModal(); await openProjectFile(v.file); S.projectPath = null; markDirty(); toast('Версия открыта — сохраните её как новый проект (Ctrl+Shift+S) или поверх старого'); } } }, 'Открыть')));
    }
    box.append(h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: closeModal }, 'Закрыть')));
  });
}
// ============ My presets: text styles and clip looks ============
const TEXT_STYLE_KEYS = ['font', 'size', 'color', 'bold', 'italic', 'underline', 'align', 'letterSpacing', 'lineHeight', 'strokeColor', 'strokeWidth', 'shadowColor', 'shadowBlur', 'shadowDist', 'bgColor', 'bgOpacity', 'bgRadius', 'gradient', 'color2', 'glow', 'glowColor', 'textAnim', 'highlightColor', 'maxWidth', 'uppercase'];
async function saveTextPreset(c) {
  const name = await askText('Название стиля', c.text.text.slice(0, 20));
  if (!name) return;
  const s = {};
  for (const k of TEXT_STYLE_KEYS) s[k] = c.text[k];
  await saveSetting({ textPresets: [...(SET.textPresets || []), { name, s, anim: deep(c.anim) }] });
  toast('Стиль сохранён — он во вкладке «Текст» → «Мои стили»');
  if (curPanel === 'text') setPanel('text');
}
async function saveLookPreset(c) {
  const name = await askText('Название образа', c.name || 'Мой образ');
  if (!name) return;
  await saveSetting({ lookPresets: [...(SET.lookPresets || []), { name, filter: deep(c.filter), adj: deep(c.adj), fxList: deep(c.fxList || []) }] });
  toast('Образ сохранён — он во вкладке «Фильтры» → «Мои образы»');
  if (curPanel === 'filters') setPanel('filters');
}
function applyLookPreset(pr) {
  const list = [...S.sel].map(clipById).filter((c) => c && (c.type === 'video' || c.type === 'image'));
  if (!list.length) { toast('Выделите видео или фото'); return; }
  change(() => list.forEach((c) => { c.filter = deep(pr.filter); c.adj = { ...ADJUST_DEFAULT, ...deep(pr.adj) }; c.fxList = deep(pr.fxList); }));
}
function myPresetsSection(p, kind) {
  const list = kind === 'text' ? SET.textPresets || [] : SET.lookPresets || [];
  if (!list.length) return;
  p.append(h('h4', {}, kind === 'text' ? 'Мои стили' : 'Мои образы'));
  const g = h('div', { class: 'grid' });
  list.forEach((pr, i) => {
    const el = kind === 'text'
      ? h('div', { class: 'preset', style: presetStyle({ ...TEXT_DEFAULT, ...pr.s }), title: pr.name, onclick: () => applyTextStyle(pr.s) }, pr.name)
      : h('div', { class: 'chip', style: { textAlign: 'center', margin: 0, padding: '8px' }, onclick: () => applyLookPreset(pr) }, '🎨 ' + pr.name);
    el.setAttribute('data-no-i18n', '');
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, [{ label: 'Удалить', action: async () => { const arr = [...list]; arr.splice(i, 1); await saveSetting(kind === 'text' ? { textPresets: arr } : { lookPresets: arr }); setPanel(curPanel); } }]); });
    g.append(el);
  });
  p.append(g);
}
