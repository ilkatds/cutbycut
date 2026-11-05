'use strict';
// ============ Projects that can move: collect files, relink, custom canvas, exit to other editors ============
function projectMenu() {
  const r = $('[data-cmd="projectMenu"]').getBoundingClientRect();
  showMenu(r.left, r.bottom + 6, [
    { label: '📦 Собрать проект в одну папку', action: collectProject },
    { label: '🔎 Найти пропавшие файлы', action: relinkMissing },
    '-',
    { label: '🎞 Для других редакторов (FCPXML)', disabled: S.mode === 'photo', action: exportFcpxml },
    { label: '≣ Субтитры в файл SRT', disabled: S.mode === 'photo', action: exportSrt },
  ]);
}
const safeName = (s) => (s || 'Без названия').replace(/[\\/:*?"<>|]/g, '_').trim();

// Everything the project uses goes next to it, so the folder can be moved to another disk or computer
async function collectProject() {
  const base = await api.pickDir(SET.projectsDir || '');
  if (!base) return;
  P().name = $('#projName').textContent.trim() || P().name;
  const root = `${base}\\${safeName(P().name)}`, dir = `${root}\\Материалы`;
  const used = P().media;
  let done = 0;
  const missing = [];
  const next = {};
  for (const m of used) {
    toast(`Копирую файлы: ${done + 1} из ${used.length}`, 60000);
    if (!(await api.exists(m.path))) { missing.push(m.name); done++; continue; }
    try { next[m.id] = await api.copyInto(m.path, dir); } catch (e) { toast('Не удалось скопировать: ' + m.name, 6000); return; }
    done++;
  }
  // paths change only after every copy succeeded
  for (const m of used) if (next[m.id]) m.path = next[m.id];
  S.projectPath = `${root}\\${safeName(P().name)}.cutbycut`;
  await saveProject(false);
  toast(missing.length ? `Проект собран, но не найдено файлов: ${missing.length}` : `✓ Проект собран: ${used.length} файлов`, 7000);
  api.showItem(S.projectPath);
}

async function relinkMissing() {
  const missing = [];
  for (const m of P().media) if (!(await api.exists(m.path))) missing.push(m);
  if (!missing.length) { toast('Все файлы проекта на месте'); return; }
  const dir = await api.pickDir('');
  if (!dir) return;
  const found = await api.findFiles(dir, missing.map((m) => baseName(m.path)));
  let n = 0;
  for (const m of missing) {
    const p = found[baseName(m.path).toLowerCase()];
    if (!p) continue;
    m.path = p; S.cache[m.id] = {}; loadMediaCache(m); n++;
  }
  if (n) { markDirty(); afterChange(); }
  toast(n === missing.length ? `✓ Найдены все файлы: ${n}` : `Найдено ${n} из ${missing.length}. Остальные поищите в другой папке`, 7000);
}

// Free canvas size for any project, not only the listed ratios
function canvasSizeRow() {
  const pr = P();
  const w = h('input', { type: 'number', min: 16, max: 8000, value: pr.width, style: { width: '72px' } });
  const hh = h('input', { type: 'number', min: 16, max: 8000, value: pr.height, style: { width: '72px' } });
  const apply = () => change(() => setCanvasSize(clamp(+w.value || 16, 16, 8000), clamp(+hh.value || 16, 16, 8000)));
  w.addEventListener('change', apply); hh.addEventListener('change', apply);
  return h('div', { class: 'row wide' }, h('label', {}, 'Размер'), h('div', { class: 'panelBar', style: { margin: 0 } }, w, '×', hh));
}

// FCPXML carries the edit itself: which file, which piece, where and on which layer
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function buildFcpxml(pr) {
  const fps = pr.fps || 30;
  const time = (t) => `${Math.round(Math.max(0, t) * fps) * 100}/${fps * 100}s`;
  const clips = pr.clips.filter((c) => (c.type === 'video' || c.type === 'image' || c.type === 'audio') && pr.media.some((m) => m.id === c.mediaId)).sort((a, b) => a.start - b.start);
  const usedIds = [...new Set(clips.map((c) => c.mediaId))];
  const assets = usedIds.map((id, i) => {
    const m = pr.media.find((x) => x.id === id);
    return `<asset id="a${i + 1}" name="${xmlEsc(m.name)}" src="${xmlEsc(fileUrl(m.path))}" start="0s" duration="${time(m.duration || 3600)}" hasVideo="${m.type === 'audio' ? 0 : 1}" hasAudio="${m.hasAudio ? 1 : 0}" format="r1"/>`;
  }).join('\n    ');
  const ref = (id) => `a${usedIds.indexOf(id) + 1}`;
  const visual = pr.tracks.filter((t) => t.kind !== 'audio');
  const audio = pr.tracks.filter((t) => t.kind === 'audio');
  // visual layers go up from 1 with the top track highest, sound goes below zero
  const lane = (c) => {
    const vi = visual.findIndex((t) => t.id === c.trackId);
    return vi >= 0 ? visual.length - vi : -(audio.findIndex((t) => t.id === c.trackId) + 1);
  };
  const total = clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0);
  const body = clips.map((c) => `<asset-clip ref="${ref(c.mediaId)}" lane="${lane(c)}" offset="${time(c.start)}" name="${xmlEsc(c.name || '')}" start="${time(c.in || 0)}" duration="${time(c.dur)}"/>`).join('\n              ');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" frameDuration="100/${fps * 100}s" width="${pr.width}" height="${pr.height}"/>
    ${assets}
  </resources>
  <library>
    <event name="CutByCut">
      <project name="${xmlEsc(pr.name)}">
        <sequence format="r1" duration="${time(total)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
            <gap name="Монтаж" offset="0s" start="0s" duration="${time(total)}">
              ${body}
            </gap>
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
  const left = pr.clips.length - clips.length;
  const speed = clips.filter((c) => c.speed && c.speed !== 1).length;
  return { xml, count: clips.length, left, speed };
}
async function exportFcpxml() {
  const r = buildFcpxml({ ...P(), name: $('#projName').textContent.trim() || P().name });
  if (!r.count) { toast('На таймлайне нет видео, фото или звука'); return; }
  const info = await api.info();
  const path = await api.saveFile({ title: 'Перенос в другой редактор', def: `${SET.exportDir || info.docs}\\${safeName(P().name)}.fcpxml`, filters: [{ name: 'FCPXML', extensions: ['fcpxml'] }] });
  if (!path) return;
  await api.writeText(path, r.xml);
  toast(`✓ Перенесено клипов: ${r.count}. Не переносятся: текст и эффекты (${r.left}), скорость у ${r.speed} клипов`, 9000);
}

// Text clips as a subtitle file, in timeline order
function buildSrt(clips) {
  const stamp = (t) => {
    const ms = Math.round(t * 1000), p = (n, l = 2) => String(n).padStart(l, '0');
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
  };
  return [...clips].sort((a, b) => a.start - b.start).map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.start + c.dur)}\n${c.text.text}\n`).join('\n');
}
async function exportSrt() {
  const all = P().clips.filter((c) => c.type === 'text' && c.text && c.text.text.trim());
  const subTrack = P().tracks.find((t) => t.name === 'Субтитры');
  const onSub = subTrack ? all.filter((c) => c.trackId === subTrack.id) : [];
  const list = onSub.length ? onSub : all;
  if (!list.length) { toast('В проекте нет текста'); return; }
  const info = await api.info();
  const path = await api.saveFile({ title: 'Субтитры', def: `${SET.exportDir || info.docs}\\${safeName(P().name)}.srt`, filters: [{ name: 'SRT', extensions: ['srt'] }] });
  if (!path) return;
  await api.writeText(path, buildSrt(list));
  toast(`✓ Субтитров сохранено: ${list.length}`, 5000);
}
