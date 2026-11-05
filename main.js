const { app, BrowserWindow, ipcMain, dialog, shell, Menu, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFileSync } = require('child_process');

app.commandLine.appendSwitch('allow-file-access-from-files');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// The editor's <video> elements are drawn onto a canvas, never shown directly: stop Chromium
// from treating them as background video and throttling/suspending their decoding.
app.commandLine.appendSwitch('disable-background-media-suspend');
app.commandLine.appendSwitch('disable-features', 'BackgroundVideoTrackOptimization,BackgroundVideoPauseOptimization,MediaSessionService');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-accelerated-video-decode');

// Settings, proxies and project versions stay where the app kept them under its old name.
app.setPath('userData', path.join(app.getPath('appData'), 'Склейка'));

const TMP = path.join(os.tmpdir(), 'sklejka');
fs.mkdirSync(TMP, { recursive: true });

// ---------- FFmpeg discovery ----------
function findTool(name) {
  try {
    const out = execFileSync('where', [name], { encoding: 'utf8', windowsHide: true });
    const first = out.split(/\r?\n/).find(Boolean);
    if (first && fs.existsSync(first)) return first;
  } catch (_) {}
  const local = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  try {
    for (const dir of fs.readdirSync(local)) {
      if (!/ffmpeg/i.test(dir)) continue;
      const root = path.join(local, dir);
      for (const sub of fs.readdirSync(root)) {
        const p = path.join(root, sub, 'bin', name + '.exe');
        if (fs.existsSync(p)) return p;
      }
    }
  } catch (_) {}
  const bundled = path.join(__dirname, 'bin', name + '.exe');
  if (fs.existsSync(bundled)) return bundled;
  return null;
}
const FFMPEG = findTool('ffmpeg');
const FFPROBE = findTool('ffprobe');

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 940,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#f6efe3',
    title: 'CutByCut',
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      backgroundThrottling: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  const logFile = path.join(TMP, 'console.log');
  fs.writeFileSync(logFile, '');
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level >= 2) fs.appendFileSync(logFile, `[${level}] ${message} (${path.basename(source || '')}:${line})\n`);
  });
  win.on('close', (e) => {
    if (win.__allowClose) return;
    e.preventDefault();
    win.webContents.send('app:beforeClose');
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

ipcMain.on('app:closeNow', () => { if (win) { win.__allowClose = true; win.close(); } });
ipcMain.on('app:devtools', () => win && win.webContents.toggleDevTools());
ipcMain.handle('app:info', () => ({ ffmpeg: !!FFMPEG, ffprobe: !!FFPROBE, tmp: TMP, videos: app.getPath('videos'), docs: app.getPath('documents') }));

// ---------- Dialogs ----------
const MEDIA_EXT = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'wmv', 'flv', 'mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac', 'opus', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];
ipcMain.handle('dialog:openMedia', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Импорт медиа',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Медиа', extensions: MEDIA_EXT }, { name: 'Все файлы', extensions: ['*'] }],
  });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('dialog:saveExport', async (_e, def) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Экспорт видео',
    defaultPath: def,
    filters: [{ name: 'MP4', extensions: ['mp4'] }, { name: 'GIF', extensions: ['gif'] }],
  });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('dialog:saveProject', async (_e, def) => {
  const r = await dialog.showSaveDialog(win, { title: 'Сохранить проект', defaultPath: def, filters: [{ name: 'Проект CutByCut', extensions: ['cutbycut'] }, { name: 'Проект Склейки (старый формат)', extensions: ['sklejka'] }] });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('dialog:openProject', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Открыть проект', properties: ['openFile'], filters: [{ name: 'Проект CutByCut', extensions: ['cutbycut', 'sklejka'] }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dialog:saveFile', async (_e, { title, def, filters }) => {
  const r = await dialog.showSaveDialog(win, { title, defaultPath: def, filters });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('dialog:confirm', async (_e, { message, buttons }) => {
  const r = await dialog.showMessageBox(win, { type: 'question', message, buttons, cancelId: buttons.length - 1, defaultId: 0 });
  return r.response;
});

ipcMain.handle('fs:writeText', (_e, p, text) => { fs.writeFileSync(p, text, 'utf8'); return true; });
ipcMain.handle('fs:writeBytes', (_e, p, data) => { fs.writeFileSync(p, Buffer.from(data)); return true; });
// Copy a file into a folder without overwriting a different file of the same name
ipcMain.handle('fs:copyInto', async (_e, src, dir) => {
  fs.mkdirSync(dir, { recursive: true });
  const { name, ext } = path.parse(src);
  let dst = path.join(dir, name + ext);
  for (let i = 2; fs.existsSync(dst); i++) {
    if (fs.statSync(dst).size === fs.statSync(src).size) return dst;
    dst = path.join(dir, `${name} (${i})${ext}`);
  }
  await fs.promises.copyFile(src, dst);
  return dst;
});
// Look for files by name in a folder and its subfolders: { "name.mp4": "full path" }
ipcMain.handle('fs:findFiles', (_e, dir, names) => {
  const want = new Set(names.map((n) => n.toLowerCase())), found = {};
  const walk = (d, depth) => {
    let list = [];
    try { list = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of list) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 8) walk(p, depth + 1); }
      else if (want.has(e.name.toLowerCase()) && !found[e.name.toLowerCase()]) found[e.name.toLowerCase()] = p;
    }
  };
  walk(dir, 0);
  return found;
});
ipcMain.handle('fs:readText', (_e, p) => fs.readFileSync(p, 'utf8'));
ipcMain.handle('fs:exists', (_e, p) => fs.existsSync(p));
ipcMain.handle('fs:autosavePath', () => path.join(app.getPath('userData'), 'autosave.sklejka'));
ipcMain.handle('shell:show', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('shell:open', (_e, p) => shell.openPath(p));

// ---------- Media probing ----------
function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true, ...opts });
    const out = [];
    let err = '';
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => { err += d.toString(); if (err.length > 20000) err = err.slice(-20000); });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(err.slice(-1500) || 'exit ' + code))));
  });
}

ipcMain.handle('media:probe', async (_e, file) => {
  const ext = path.extname(file).slice(1).toLowerCase();
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'].includes(ext);
  if (!FFPROBE) return { type: isImage ? 'image' : (['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac', 'opus'].includes(ext) ? 'audio' : 'video'), duration: 0, hasAudio: !isImage };
  const buf = await run(FFPROBE, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]);
  const j = JSON.parse(buf.toString());
  const v = (j.streams || []).find((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
  const a = (j.streams || []).find((s) => s.codec_type === 'audio');
  let fps = 30;
  if (v && v.avg_frame_rate && v.avg_frame_rate !== '0/0') {
    const [n, d] = v.avg_frame_rate.split('/').map(Number);
    if (d) fps = n / d;
  }
  let rotation = 0;
  if (v && v.side_data_list) { const r = v.side_data_list.find((s) => s.rotation != null); if (r) rotation = Math.abs(r.rotation); }
  let width = v ? v.width : 0, height = v ? v.height : 0;
  if (rotation === 90 || rotation === 270) [width, height] = [height, width];
  const duration = parseFloat((j.format && j.format.duration) || (v && v.duration) || (a && a.duration) || 0) || 0;
  let type = 'video';
  if (isImage) type = 'image';
  else if (!v) type = 'audio';
  return { type, duration: type === 'image' ? 0 : duration, width, height, fps, hasAudio: !!a };
});

// Waveforms and filmstrips of hour-long recordings mean reading the whole multi-GB file. They are cached
// on disk (keyed by path + size + mtime, like proxies), and run through small queues: ten parallel full
// reads of one disk made each of them crawl.
const MEDIA_CACHE = path.join(app.getPath('userData'), 'mediacache');
function mediaCacheFile(file, tag) {
  try {
    const st = fs.statSync(file);
    fs.mkdirSync(MEDIA_CACHE, { recursive: true });
    return path.join(MEDIA_CACHE, require('crypto').createHash('sha1').update(file + '|' + st.size + '|' + st.mtimeMs).digest('hex').slice(0, 16) + tag);
  } catch (_) { return null; }
}
// smallest job first: a song's waveform is ready in a second instead of waiting behind hour-long recordings
function queue(n) {
  let active = 0;
  const waiting = [];
  const next = () => { if (active < n && waiting.length) { active++; const { fn, res, rej } = waiting.shift(); fn().then(res, rej).finally(() => { active--; next(); }); } };
  return (fn, size = 0) => new Promise((res, rej) => {
    const i = waiting.findIndex((w) => w.size > size);
    waiting.splice(i < 0 ? waiting.length : i, 0, { fn, res, rej, size });
    next();
  });
}
const fileSize = (f) => { try { return fs.statSync(f).size; } catch (_) { return 0; } };
const peaksQueue = queue(2), thumbsQueue = queue(1);
ipcMain.handle('media:peaks', async (_e, file) => {
  if (!FFMPEG) return null;
  const cached = mediaCacheFile(file, '.peaks');
  if (cached && fs.existsSync(cached)) return Array.from(fs.readFileSync(cached));
  const peaks = await peaksQueue(() => computePeaks(file), fileSize(file));
  if (cached && peaks) try { fs.writeFileSync(cached, Buffer.from(peaks)); } catch (_) {}
  return peaks;
});
async function computePeaks(file) {
  const rate = 4000, per = 40; // 100 peaks per second
  const buf = await run(FFMPEG, ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(rate), '-f', 's16le', '-']);
  const n = Math.floor(buf.length / 2);
  const peaks = new Array(Math.ceil(n / per));
  for (let i = 0, k = 0; i < n; i += per, k++) {
    let m = 0;
    const end = Math.min(n, i + per);
    for (let j = i; j < end; j++) { const s = Math.abs(buf.readInt16LE(j * 2)); if (s > m) m = s; }
    peaks[k] = Math.round((m / 32768) * 255);
  }
  return peaks;
}

// ---------- Preview proxies ----------
// Long-GOP recordings (OBS: B-frames, keyframe every few seconds) seek slowly and the decoder shows
// broken frames after a seek. The preview plays a light copy instead: 960 px, 30 fps, a keyframe
// every 0.5 s and no B-frames. Export and analysis always use the original file.
const PROXY_DIR = path.join(app.getPath('userData'), 'proxies');
function proxyPathFor(file) {
  const st = fs.statSync(file);
  const h = require('crypto').createHash('sha1').update(file + '|' + st.size + '|' + st.mtimeMs).digest('hex').slice(0, 16);
  return path.join(PROXY_DIR, h + '.mp4');
}
ipcMain.handle('proxy:existing', (_e, file) => { try { const p = proxyPathFor(file); return fs.existsSync(p) ? p : null; } catch (_) { return null; } });
const proxyProcs = new Map();
ipcMain.handle('proxy:make', (_e, { id, file, duration }) => {
  fs.mkdirSync(PROXY_DIR, { recursive: true });
  const out = proxyPathFor(file);
  if (fs.existsSync(out)) return out;
  const tmp = out.replace(/\.mp4$/, '.part.mp4');
  const args = ['-y', '-v', 'error', '-progress', 'pipe:1', '-nostats', '-i', file, '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', "scale='min(960,iw)':-2,fps=30", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
    '-g', '15', '-keyint_min', '15', '-sc_threshold', '0', '-bf', '0', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-movflags', '+faststart', tmp];
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { windowsHide: true });
    proxyProcs.set(id, p);
    let err = '';
    p.stdout.on('data', (d) => {
      const m = d.toString().match(/out_time_ms=(\d+)/g);
      if (m && duration) win.webContents.send('proxy:progress', { id, p: Math.min(1, +m[m.length - 1].split('=')[1] / 1e6 / duration) });
    });
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', reject);
    p.on('close', (code) => {
      proxyProcs.delete(id);
      if (code === 0) { fs.renameSync(tmp, out); resolve(out); }
      else { try { fs.unlinkSync(tmp); } catch (_) {} reject(new Error(err.slice(-400) || 'прокси не создан')); }
    });
  });
});
ipcMain.handle('proxy:cancelAll', () => { for (const p of proxyProcs.values()) try { p.kill(); } catch (_) {} });
app.on('before-quit', () => { for (const p of proxyProcs.values()) try { p.kill(); } catch (_) {} });

// Filmstrip sprite for the timeline (keyframes only, fast)
ipcMain.handle('media:thumbs', async (_e, file, duration) => {
  const count = Math.max(6, Math.min(60, Math.ceil(duration / 2)));
  const cached = mediaCacheFile(file, `.th${count}.jpg`);
  if (cached && fs.existsSync(cached)) return { path: cached, count };
  const out = cached || path.join(TMP, 'th_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '.jpg');
  const vf = `fps=${(count / Math.max(0.1, duration)).toFixed(5)},scale=-2:90,tile=${count}x1`;
  await thumbsQueue(async () => {
    try {
      await run(FFMPEG, ['-y', '-v', 'error', '-skip_frame', 'nokey', '-i', file, '-an', '-vf', vf, '-frames:v', '1', '-q:v', '5', out]);
    } catch (_) {
      await run(FFMPEG, ['-y', '-v', 'error', '-i', file, '-an', '-vf', vf, '-frames:v', '1', '-q:v', '5', out]);
    }
  }, fileSize(file));
  return { path: out, count };
});

// ---------- Frame-exact decoders for export ----------
const decoders = new Map();
ipcMain.handle('dec:open', (_e, o) => {
  const old = decoders.get(o.key);
  if (old) { try { old.p.kill(); } catch (_) {} }
  const vf = `setpts=(PTS-STARTPTS)/${o.speed},fps=${o.fps},scale=${o.w}:${o.h}:flags=bicubic,format=rgba`;
  const args = ['-v', 'error', '-ss', o.in.toFixed(4), ...(/.webm$/i.test(o.path) ? ['-c:v', 'libvpx-vp9'] : []), '-i', o.path, '-an', '-vf', vf];
  if (o.single) args.push('-frames:v', '1');
  args.push('-f', 'rawvideo', '-pix_fmt', 'rgba', '-');
  const p = spawn(FFMPEG, args, { windowsHide: true });
  const d = { p, chunks: [], size: 0, frameBytes: o.w * o.h * 4, next: 0, ended: false, waiters: [], last: null, owner: _e.sender.id };
  p.stdout.on('data', (b) => {
    d.chunks.push(b); d.size += b.length;
    if (d.size > d.frameBytes * 4) p.stdout.pause();
    flush(d);
  });
  p.on('close', () => { d.ended = true; flush(d); });
  p.on('error', () => { d.ended = true; flush(d); });
  p.stderr.on('data', () => {});
  decoders.set(o.key, d);
  return true;
});
function takeFrame(d) {
  if (d.size < d.frameBytes) return null;
  const buf = Buffer.concat(d.chunks);
  const frame = buf.subarray(0, d.frameBytes);
  const rest = buf.subarray(d.frameBytes);
  d.chunks = rest.length ? [rest] : [];
  d.size = rest.length;
  if (d.size < d.frameBytes * 2) d.p.stdout.resume();
  return Buffer.from(frame);
}
function flush(d) {
  // d.last is frame number d.next-1; older requests get the latest frame
  while (d.waiters.length) {
    const w = d.waiters[0];
    if (d.last && d.next - 1 >= w.n) { d.waiters.shift(); w.resolve(d.last); continue; }
    const f = takeFrame(d);
    if (f) { d.last = f; d.next++; continue; }
    if (d.ended) { d.waiters.shift(); w.resolve(d.last); continue; }
    return;
  }
}
ipcMain.handle('dec:frame', (_e, key, n) => {
  const d = decoders.get(key);
  if (!d) return null;
  return new Promise((resolve) => { d.waiters.push({ n, resolve }); flush(d); });
});
ipcMain.handle('dec:close', (_e, key) => {
  const d = decoders.get(key);
  if (d) { try { d.p.kill(); } catch (_) {} decoders.delete(key); }
});
ipcMain.handle('dec:closeAll', (_e) => {
  for (const [k, d] of decoders) if (d.owner === _e.sender.id) { try { d.p.kill(); } catch (_) {} decoders.delete(k); }
});

// Audio processing (noise reduction, voice changer) and video stabilisation -> new media file
const VOICE = {
  denoise: 'highpass=f=70,afftdn=nf=-28:nr=18,loudnorm=I=-16:TP=-1.5',
  chipmunk: 'rubberband=pitch=1.6',
  deep: 'rubberband=pitch=0.75',
  monster: 'rubberband=pitch=0.55,aecho=0.8:0.6:40:0.3',
  robot: "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75,volume=2",
  echo: 'aecho=0.8:0.88:90:0.45',
  cave: 'aecho=0.8:0.85:400|800:0.45|0.3',
  radio: 'highpass=f=350,lowpass=f=3000,acrusher=bits=8:mode=log:aa=1:mix=0.35,volume=1.6',
  phone: 'highpass=f=450,lowpass=f=3200,volume=1.8',
  megaphone: 'highpass=f=600,lowpass=f=4000,acompressor=threshold=0.1:ratio=8,volume=2.5',
};
ipcMain.handle('media:process', async (_e, o) => {
  const stamp = Date.now().toString(36);
  if (o.kind === 'stabilize') {
    const trf = path.join(TMP, 'stab_' + stamp + '.trf');
    const out = path.join(TMP, 'stab_' + stamp + '.mp4');
    const cut = ['-ss', o.in.toFixed(3), '-t', o.srcLen.toFixed(3), '-i', o.file];
    // vidstab writes the .trf path into a filter string — escape the drive colon
    const trfEsc = trf.replace(/\\/g, '/').replace(':', '\\:');
    await run(FFMPEG, ['-y', '-v', 'error', ...cut, '-vf', `vidstabdetect=shakiness=7:accuracy=12:result='${trfEsc}'`, '-f', 'null', '-']);
    await run(FFMPEG, ['-y', '-v', 'error', ...cut, '-vf', `vidstabtransform=input='${trfEsc}':smoothing=25:zoom=4,unsharp=5:5:0.6:3:3:0.3`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', out]);
    return out;
  }
  const f = VOICE[o.kind];
  if (!f) throw new Error('неизвестная обработка');
  const out = path.join(TMP, 'aud_' + o.kind + '_' + stamp + '.m4a');
  await run(FFMPEG, ['-y', '-v', 'error', '-ss', o.in.toFixed(3), '-t', o.srcLen.toFixed(3), '-i', o.file, '-vn', '-af', 'aresample=48000,' + f, '-c:a', 'aac', '-b:a', '192k', out]);
  return out;
});

ipcMain.handle('media:reverse', async (_e, file, hasVideo) => {
  const out = path.join(TMP, 'rev_' + Date.now() + (hasVideo ? '.mp4' : '.m4a'));
  const args = ['-y', '-v', 'error', '-i', file];
  if (hasVideo) args.push('-vf', 'reverse', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p');
  else args.push('-vn');
  args.push('-af', 'areverse', '-c:a', 'aac', '-b:a', '192k', out);
  try { await run(FFMPEG, args); } catch (e) {
    // retry without audio (source may have no audio stream)
    const a2 = ['-y', '-v', 'error', '-i', file, '-vf', 'reverse', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', out];
    await run(FFMPEG, a2);
  }
  return out;
});

// lossless: voice recordings go to 24-bit WAV, so nothing is lost before the final export
ipcMain.handle('media:extractAudio', async (_e, file, lossless) => {
  const out = path.join(TMP, 'aud_' + Date.now() + (lossless ? '.wav' : '.m4a'));
  await run(FFMPEG, ['-y', '-v', 'error', '-i', file, '-vn', ...(lossless ? ['-c:a', 'pcm_s24le'] : ['-c:a', 'aac', '-b:a', '192k']), out]);
  return out;
});

ipcMain.handle('media:saveBlob', (_e, data, ext) => {
  const out = path.join(TMP, 'rec_' + Date.now() + '.' + ext);
  fs.writeFileSync(out, Buffer.from(data));
  return out;
});

ipcMain.handle('media:snapshot', (_e, data, def) => {
  const p = dialog.showSaveDialogSync(win, { title: 'Сохранить кадр', defaultPath: def, filters: [{ name: 'PNG', extensions: ['png'] }] });
  if (!p) return null;
  fs.writeFileSync(p, Buffer.from(data));
  return p;
});

// ---------- Clipboard ----------
ipcMain.handle('clip:read', () => {
  const out = { text: clipboard.readText() || '', image: null, files: [] };
  try {
    const raw = clipboard.readBuffer('FileNameW');
    if (raw && raw.length) out.files = raw.toString('ucs2').split('\0').filter((p) => p && fs.existsSync(p));
  } catch (_) {}
  const img = clipboard.readImage();
  if (!img.isEmpty()) {
    const p = path.join(TMP, 'paste_' + Date.now() + '.png');
    fs.writeFileSync(p, img.toPNG());
    out.image = p;
  }
  return out;
});
ipcMain.handle('clip:writeText', (_e, t) => clipboard.writeText(t));

// ---------- Download by link (yt-dlp: YouTube, TikTok, VK, direct links…) ----------
function findYtDlp() {
  try {
    const out = execFileSync('where', ['yt-dlp'], { encoding: 'utf8', windowsHide: true });
    const first = out.split(/\r?\n/).find(Boolean);
    if (first) return first;
  } catch (_) {}
  return null;
}
let dlProc = null;
ipcMain.handle('dl:url', async (_e, url) => {
  const outDir = path.join(app.getPath('videos'), 'CutByCut загрузки');
  fs.mkdirSync(outDir, { recursive: true });
  const ytdlp = findYtDlp();
  if (!ytdlp) {
    // plain direct download fallback
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    let name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'file') || 'file';
    if (!/\.\w{2,4}$/.test(name)) name += '.mp4';
    const p = path.join(outDir, name.replace(/[\\/:*?"<>|]/g, '_'));
    fs.writeFileSync(p, Buffer.from(await r.arrayBuffer()));
    return [p];
  }
  const args = ['--no-playlist', '--newline', '--no-mtime', '--restrict-filenames',
    '-f', 'bv*[ext=mp4][vcodec^=avc]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b', '--merge-output-format', 'mp4',
    '-o', path.join(outDir, '%(title).70s [%(id)s].%(ext)s'), '--print', 'after_move:filepath'];
  if (FFMPEG) args.push('--ffmpeg-location', path.dirname(FFMPEG));
  args.push(url);
  return new Promise((resolve, reject) => {
    const p = spawn(ytdlp, args, { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
    dlProc = p;
    const files = [];
    let err = '';
    p.stdout.on('data', (d) => {
      for (const line of d.toString('utf8').split(/\r?\n/)) {
        const m = line.match(/\[download\]\s+([\d.]+)%/);
        if (m) win.webContents.send('dl:progress', +m[1]);
        else if (line.trim() && fs.existsSync(line.trim())) files.push(line.trim());
      }
    });
    p.stderr.on('data', (d) => { err += d.toString('utf8'); });
    p.on('error', reject);
    p.on('close', (code) => {
      dlProc = null;
      if (code === 0 && files.length) resolve(files);
      else reject(new Error((err.split(/\r?\n/).filter((l) => /ERROR/.test(l)).pop() || err.slice(-400) || 'не удалось скачать').replace(/^ERROR:\s*/, '')));
    });
  });
});
ipcMain.handle('dl:cancel', () => { if (dlProc) try { dlProc.kill(); } catch (_) {} });

// ---------- Online catalog (open licenses only) ----------
// Openverse: CC0 / CC BY sounds, music, images (no key). Pixabay / Pexels: free stock video (user's key).
const UA = { 'User-Agent': 'CutByCut/2.0 (free video editor)' };
async function getJson(url, headers = {}, timeoutMs = 50000) {
  // Openverse is sometimes slow: time out and retry once
  for (let attempt = 0; attempt < 2; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetch(url, { headers: { ...UA, ...headers }, signal: ac.signal });
      if (!r.ok) throw new Error(`${new URL(url).hostname}: ${r.status}`);
      return await r.json();
    } catch (e) {
      if (attempt === 1) throw new Error(e.name === 'AbortError' ? `${new URL(url).hostname}: нет ответа` : e.message);
    } finally { clearTimeout(timer); }
  }
}
const licOk = (lic, mode) => (mode === 'cc0' ? lic === 'cc0' || lic === 'pdm' : ['cc0', 'pdm', 'by'].includes(lic));
const ovLicense = (r) => (r.license === 'pdm' ? 'Public Domain' : (r.license || '').toUpperCase() + (r.license_version ? ' ' + r.license_version : ''));
ipcMain.handle('online:search', async (_e, o) => {
  const q = encodeURIComponent(o.q || '');
  const page = o.page || 1;
  if (o.kind === 'sound' || o.kind === 'music') {
    const s = readSettings();
    const items = [];
    const errs = [];
    // Openverse: plain query (its filters are slow), filtered here by license and kind
    try {
      const j = await getJson(`https://api.openverse.org/v1/audio/?q=${q}&page=${page}&page_size=20`);
      for (const r of j.results || []) {
        if (!licOk(r.license, o.license) || !r.url) continue;
        const dur = (r.duration || 0) / 1000;
        const isMusic = r.category === 'music' || (!r.category && dur > 45);
        if ((o.kind === 'music') !== isMusic) continue;
        items.push({ id: 'ov_' + r.id, kind: 'audio', title: r.title || 'Без названия', author: r.creator || '', license: ovLicense(r), licenseUrl: r.license_url, landing: r.foreign_landing_url, preview: r.url, download: r.url, thumb: r.thumbnail, duration: dur, ext: (r.filetype || 'mp3').replace('mpeg', 'mp3'), source: 'Openverse' + (r.provider ? ' / ' + r.provider : '') });
      }
    } catch (e) { errs.push(e.message); }
    // Freesound (optional free key): CC0 and Attribution only
    if (s.freesoundKey) {
      try {
        const lf = o.license === 'cc0' ? 'license:"Creative Commons 0"' : '(license:"Creative Commons 0" OR license:"Attribution")';
        const df = o.kind === 'music' ? ' duration:[45 TO *]' : ' duration:[0 TO 45]';
        const j = await getJson(`https://freesound.org/apiv2/search/text/?query=${q}&page=${page}&page_size=20&fields=id,name,username,license,previews,duration,url&filter=${encodeURIComponent(lf + df)}&token=${encodeURIComponent(s.freesoundKey)}`);
        for (const r of j.results || []) {
          const pv = r.previews && (r.previews['preview-hq-mp3'] || r.previews['preview-lq-mp3']);
          if (!pv) continue;
          items.push({ id: 'fs_' + r.id, kind: 'audio', title: r.name, author: r.username, license: /Attribution/.test(r.license) && !/Noncommercial/.test(r.license) ? 'CC BY' : 'CC0', licenseUrl: r.license, landing: r.url, preview: pv, download: pv, duration: r.duration, ext: 'mp3', source: 'Freesound' });
        }
      } catch (e) { errs.push(e.message); }
    }
    if (!items.length && errs.length) throw new Error(errs.join('; '));
    return { total: items.length, items };
  }
  if (o.kind === 'image') {
    const j = await getJson(`https://api.openverse.org/v1/images/?q=${q}&page=${page}&page_size=20`);
    return { total: j.result_count, items: (j.results || []).filter((r) => licOk(r.license, o.license) && r.url).map((r) => ({ id: 'ovi_' + r.id, kind: 'image', title: r.title || '', author: r.creator || '', license: ovLicense(r), licenseUrl: r.license_url, landing: r.foreign_landing_url, preview: r.thumbnail || r.url, download: r.url, thumb: r.thumbnail || r.url, width: r.width, height: r.height, ext: r.filetype || 'jpg', source: 'Openverse' })) };
  }
  if (o.kind === 'video') {
    const s = readSettings();
    const out = [];
    const errs = [];
    if (s.pixabayKey) {
      try {
        const j = await getJson(`https://pixabay.com/api/videos/?key=${encodeURIComponent(s.pixabayKey)}&q=${q}&page=${page}&per_page=20&safesearch=true`);
        for (const v of j.hits || []) {
          const f = v.videos.medium || v.videos.small || v.videos.large;
          const big = v.videos.large && v.videos.large.url ? v.videos.large : f;
          out.push({ id: 'pb_' + v.id, kind: 'video', title: v.tags, author: v.user, license: 'Pixabay License', licenseUrl: 'https://pixabay.com/service/license-summary/', landing: v.pageURL, preview: (v.videos.tiny || f).url, download: big.url, thumb: f.thumbnail, duration: v.duration, width: big.width, height: big.height, ext: 'mp4', source: 'Pixabay' });
        }
      } catch (e) { errs.push(e.message); }
    }
    if (s.pexelsKey) {
      try {
        const j = await getJson(`https://api.pexels.com/videos/search?query=${q}&page=${page}&per_page=20`, { Authorization: s.pexelsKey });
        for (const v of j.videos || []) {
          const files = (v.video_files || []).filter((f) => f.file_type === 'video/mp4').sort((a, b) => (a.width || 0) - (b.width || 0));
          const small = files.find((f) => (f.width || 0) >= 480) || files[0];
          const big = files.filter((f) => (f.width || 0) <= 1920).pop() || files[files.length - 1];
          if (!small) continue;
          out.push({ id: 'px_' + v.id, kind: 'video', title: (v.url || '').split('/').filter(Boolean).pop() || 'Pexels', author: v.user ? v.user.name : '', license: 'Pexels License', licenseUrl: 'https://www.pexels.com/license/', landing: v.url, preview: small.link, download: big.link, thumb: v.image, duration: v.duration, width: big.width, height: big.height, ext: 'mp4', source: 'Pexels' });
        }
      } catch (e) { errs.push(e.message); }
    }
    if (!s.pixabayKey && !s.pexelsKey) throw new Error('NOKEY');
    if (!out.length && errs.length) throw new Error(errs.join('; '));
    return { total: out.length, items: out };
  }
  return { total: 0, items: [] };
});
ipcMain.handle('online:download', async (_e, { url, name, ext }) => {
  const dir = path.join(app.getPath('videos'), 'CutByCut загрузки', 'Онлайн');
  fs.mkdirSync(dir, { recursive: true });
  const safe = (name || 'file').replace(/[\\/:*?"<>|\r\n]+/g, '_').slice(0, 80).trim() || 'file';
  const p = path.join(dir, `${safe}.${(ext || 'bin').replace(/[^a-z0-9]/gi, '')}`);
  if (fs.existsSync(p)) return p;
  const r = await fetch(url, { headers: UA, redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  fs.writeFileSync(p, Buffer.from(await r.arrayBuffer()));
  return p;
});

// ---------- Project versions (history of saves and autosaves) ----------
const VERSIONS = path.join(app.getPath('userData'), 'versions');
const safeName = (n) => (n || 'Без названия').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60).trim() || 'project';
ipcMain.handle('versions:save', (_e, { name, json, keep }) => {
  const dir = path.join(VERSIONS, safeName(name));
  fs.mkdirSync(dir, { recursive: true });
  const d = new Date(), pad = (n) => String(n).padStart(2, '0');
  const file = path.join(dir, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.sklejka`);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, file);
  const all = fs.readdirSync(dir).filter((f) => f.endsWith('.sklejka')).sort();
  for (const f of all.slice(0, Math.max(0, all.length - (keep || 20)))) try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
  return file;
});
ipcMain.handle('versions:list', () => {
  const out = [];
  try {
    for (const p of fs.readdirSync(VERSIONS)) {
      const dir = path.join(VERSIONS, p);
      for (const f of fs.readdirSync(dir)) if (f.endsWith('.sklejka')) { const st = fs.statSync(path.join(dir, f)); out.push({ project: p, file: path.join(dir, f), time: st.mtimeMs, size: st.size }); }
    }
  } catch (_) {}
  return out.sort((a, b) => b.time - a.time);
});
// atomic write for project files: never leave a half-written project behind
ipcMain.handle('fs:writeTextSafe', (_e, p, text) => { const tmp = p + '.tmp'; fs.writeFileSync(tmp, text, 'utf8'); fs.renameSync(tmp, p); return true; });
ipcMain.handle('fs:stat', (_e, p) => { try { const st = fs.statSync(p); return { size: st.size, mtime: st.mtimeMs }; } catch (_) { return null; } });

// ---------- Folders, storage, encoders (for the settings window) ----------
ipcMain.handle('dialog:pickDir', async (_e, def) => {
  const r = await dialog.showOpenDialog(win, { title: 'Выберите папку', defaultPath: def || undefined, properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
function dirSize(d) {
  let total = 0;
  try { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); total += f.isDirectory() ? dirSize(p) : fs.statSync(p).size; } } catch (_) {}
  return total;
}
ipcMain.handle('storage:info', () => ({ proxies: dirSize(path.join(app.getPath('userData'), 'proxies')), temp: dirSize(TMP), versions: dirSize(path.join(app.getPath('userData'), 'versions')), downloads: dirSize(path.join(app.getPath('videos'), 'CutByCut загрузки')) }));
ipcMain.handle('storage:clear', (_e, what) => {
  const target = what === 'proxies' ? path.join(app.getPath('userData'), 'proxies') : what === 'temp' ? TMP : null;
  if (!target) return false;
  for (const f of fs.readdirSync(target)) { if (/^export_job_/.test(f)) continue; try { fs.rmSync(path.join(target, f), { recursive: true, force: true }); } catch (_) {} }
  fs.mkdirSync(target, { recursive: true });
  return true;
});
// Which hardware video encoders really work on this PC (each one is test-encoded once)
let encodersCache = null;
ipcMain.handle('export:encoders', () => detectEncoders());
async function detectEncoders() {
  if (encodersCache) return encodersCache;
  const list = ['h264_nvenc', 'hevc_nvenc', 'h264_amf', 'hevc_amf', 'h264_qsv', 'hevc_qsv'];
  let names = '';
  try { names = (await run(FFMPEG, ['-hide_banner', '-encoders'])).toString(); } catch (_) {}
  const ok = [];
  for (const enc of list) {
    if (!names.includes(enc)) continue;
    try { await run(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=640x360:d=0.2', '-frames:v', '3', '-c:v', enc, '-f', 'null', '-']); ok.push(enc); } catch (_) {}
  }
  encodersCache = ok;
  return ok;
}

// ---------- Settings (API keys etc.) ----------
const SETTINGS = path.join(app.getPath('userData'), 'settings.json');
function readSettings() { try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch (_) { return {}; } }
ipcMain.handle('settings:get', () => readSettings());
ipcMain.handle('settings:set', (_e, patch) => { const s = { ...readSettings(), ...patch }; fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 1)); return s; });

// ---------- Footage motion analysis (for "Синхронизация") ----------
// Decodes the used part of a clip at low resolution and measures, per frame, where the
// non-background content is (bbox), how much of it there is and how strong it is.
ipcMain.handle('media:analyze', async (_e, o) => {
  const W = 160, H = Math.max(2, Math.round((160 * o.height) / o.width / 2) * 2), fps = o.fps || 20;
  const pre = /\.webm$/i.test(o.file) ? ['-c:v', 'libvpx-vp9'] : [];
  const buf = await run(FFMPEG, ['-v', 'error', '-ss', o.in.toFixed(3), ...pre, '-i', o.file, '-t', (o.srcLen + 0.05).toFixed(3), '-an',
    '-vf', `setpts=(PTS-STARTPTS)/${o.speed},fps=${fps},scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']);
  const fb = W * H * 4, n = Math.floor(buf.length / fb);
  if (!n) throw new Error('не удалось прочитать кадры');
  // background colour: chroma key colour if given, otherwise median of border pixels across frames
  let bg;
  if (o.key) bg = o.key;
  else {
    const rs = [], gs = [], bs = [];
    for (let f = 0; f < n; f += Math.max(1, Math.floor(n / 30))) {
      const base = f * fb;
      for (let x = 0; x < W; x += 4) for (const y of [0, 1, H - 2, H - 1]) { const i = base + (y * W + x) * 4; rs.push(buf[i]); gs.push(buf[i + 1]); bs.push(buf[i + 2]); }
      for (let y = 0; y < H; y += 4) for (const x of [0, 1, W - 2, W - 1]) { const i = base + (y * W + x) * 4; rs.push(buf[i]); gs.push(buf[i + 1]); bs.push(buf[i + 2]); }
    }
    const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
    bg = [med(rs), med(gs), med(bs)];
  }
  const alphaMode = !!o.alpha;
  const frames = [];
  const colX = new Float64Array(W), rowY = new Float64Array(H);
  for (let f = 0; f < n; f++) {
    colX.fill(0); rowY.fill(0);
    let energy = 0, cnt = 0;
    const base = f * fb;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = base + (y * W + x) * 4;
      let d;
      if (alphaMode) d = buf[i + 3];
      else { const dr = buf[i] - bg[0], dg = buf[i + 1] - bg[1], db = buf[i + 2] - bg[2]; d = Math.sqrt(dr * dr + dg * dg + db * db) * 0.577; }
      if (d > 28) { cnt++; energy += d; colX[x] += d; rowY[y] += d; }
    }
    const ext = (arr, total) => {
      let a = 0, b = arr.length - 1, acc = 0;
      for (; a < arr.length; a++) { acc += arr[a]; if (acc > total * 0.02) break; }
      acc = 0;
      for (; b > 0; b--) { acc += arr[b]; if (acc > total * 0.02) break; }
      return [a, b];
    };
    const [x0, x1] = energy ? ext(colX, energy) : [0, 0];
    const [y0, y1] = energy ? ext(rowY, energy) : [0, 0];
    frames.push({ t: f / fps, cov: cnt / (W * H), energy: energy / (W * H), x0: x0 / W, x1: (x1 + 1) / W, y0: y0 / H, y1: (y1 + 1) / H });
  }
  return { fps, frames, bg };
});

// ---------- AI background removal ----------
ipcMain.handle('bg:check', async () => {
  try { await run('python', ['-c', 'import rembg, onnxruntime; print("ok")']); return true; } catch (_) { return false; }
});
let bgProc = null;
ipcMain.handle('bg:remove', async (_e, o) => {
  const isImg = o.type === 'image';
  const outDir = path.join(app.getPath('videos'), 'CutByCut загрузки');
  fs.mkdirSync(outDir, { recursive: true });
  const stem = path.basename(o.file).replace(/\.[^.]+$/, '') + '_нет_фона_' + Date.now().toString(36);
  const send = (p, msg) => win.webContents.send('bg:progress', { p, msg });
  if (o.mode === 'api') {
    const key = readSettings().removeBgKey;
    if (!key) throw new Error('Не указан API-ключ remove.bg (Настройки удаления фона)');
    const one = async (src, dst) => {
      const fd = new FormData();
      fd.append('image_file', new Blob([fs.readFileSync(src)]), path.basename(src));
      fd.append('size', 'auto');
      const r = await fetch('https://api.remove.bg/v1.0/removebg', { method: 'POST', headers: { 'X-Api-Key': key }, body: fd });
      if (!r.ok) throw new Error('remove.bg: ' + r.status + ' ' + (await r.text()).slice(0, 200));
      fs.writeFileSync(dst, Buffer.from(await r.arrayBuffer()));
    };
    if (isImg) { const dst = path.join(outDir, stem + '.png'); await one(o.file, dst); return dst; }
    throw new Error('Через API обрабатываются только фото (каждый кадр видео — отдельный платный запрос). Для видео выберите локальную нейросеть.');
  }
  // local neural network (rembg)
  const script = path.join(__dirname, 'tools', 'bgremove.py');
  const work = path.join(TMP, 'bg_' + Date.now());
  fs.mkdirSync(work, { recursive: true });
  const runPy = (args) => new Promise((resolve, reject) => {
    const p = spawn('python', [script, ...args], { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
    bgProc = p;
    let err = '';
    p.stdout.on('data', (d) => { for (const l of d.toString().split(/\r?\n/)) { const m = l.match(/^PROG (\d+)\/(\d+)/); if (m) send(+m[1] / +m[2], `Кадр ${m[1]} из ${m[2]}`); else if (/^MSG /.test(l)) send(null, l.slice(4)); } });
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', reject);
    p.on('close', (c) => { bgProc = null; c === 0 ? resolve() : reject(new Error(err.split(/\r?\n/).filter(Boolean).slice(-3).join(' ') || 'ошибка нейросети')); });
  });
  if (isImg) {
    const dst = path.join(outDir, stem + '.png');
    await runPy(['--model', o.model || 'isnet-general-use', '--in', o.file, '--out', dst]);
    return dst;
  }
  const fps = Math.min(30, o.fps || 30);
  send(0, 'Извлекаю кадры…');
  await run(FFMPEG, ['-y', '-v', 'error', '-ss', o.in.toFixed(3), '-i', o.file, '-t', o.srcLen.toFixed(3), '-an', '-vf', `fps=${fps},scale='min(1280,iw)':-2`, path.join(work, 'f_%06d.png')]);
  await runPy(['--model', o.model || 'u2net_human_seg', '--dir', work]);
  send(1, 'Собираю видео с прозрачностью…');
  const dst = path.join(outDir, stem + '.webm');
  const args = ['-y', '-v', 'error', '-framerate', String(fps), '-i', path.join(work, 'o_%06d.png')];
  if (o.hasAudio) args.push('-ss', o.in.toFixed(3), '-t', o.srcLen.toFixed(3), '-i', o.file, '-map', '0:v', '-map', '1:a?', '-c:a', 'libopus', '-b:a', '160k');
  args.push('-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '30', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-auto-alt-ref', '0', '-shortest', dst);
  await run(FFMPEG, args);
  try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) {}
  return dst;
});
ipcMain.handle('bg:cancel', () => { if (bgProc) try { bgProc.kill(); } catch (_) {} });

// ---------- Text to speech (Windows voices) ----------
function psRun(script) {
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]);
}
ipcMain.handle('tts:voices', async () => {
  try {
    const out = await psRun("Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; [Console]::OutputEncoding=[Text.Encoding]::UTF8; $s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name + '|' + $_.VoiceInfo.Culture.Name }");
    return out.toString('utf8').split(/\r?\n/).filter(Boolean).map((l) => { const [name, culture] = l.split('|'); return { name, culture }; });
  } catch (_) { return []; }
});
ipcMain.handle('tts:speak', async (_e, { text, voice, rate }) => {
  const out = path.join(TMP, 'tts_' + Date.now() + '.wav');
  const txtFile = out + '.txt';
  fs.writeFileSync(txtFile, text, 'utf8');
  const esc = (s) => s.replace(/'/g, "''");
  const script = `Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; ` +
    (voice ? `$s.SelectVoice('${esc(voice)}'); ` : '') +
    `$s.Rate=${Math.round(rate || 0)}; $s.SetOutputToWaveFile('${esc(out)}'); $s.Speak([IO.File]::ReadAllText('${esc(txtFile)}',[Text.Encoding]::UTF8)); $s.Dispose()`;
  await psRun(script);
  return out;
});

// ---------- Audio graph (shared by export and captions) ----------
function audioGraph(items, duration, firstInput) {
  const inputs = [];
  const filters = [];
  const labels = [];
  let idx = firstInput;
  for (const a of items) {
    inputs.push('-i', a.path);
    const ch = [`atrim=start=${a.srcIn.toFixed(4)}:end=${a.srcOut.toFixed(4)}`, 'asetpts=PTS-STARTPTS'];
    ch.push(...atempoChain(a.speed));
    ch.push('aformat=sample_rates=48000:channel_layouts=stereo');
    ch.push(`volume=${a.volume.toFixed(3)}`);
    const len = (a.srcOut - a.srcIn) / a.speed;
    if (a.fadeIn > 0) ch.push(`afade=t=in:st=0:d=${a.fadeIn.toFixed(3)}`);
    if (a.fadeOut > 0) ch.push(`afade=t=out:st=${Math.max(0, len - a.fadeOut).toFixed(3)}:d=${a.fadeOut.toFixed(3)}`);
    const ms = Math.max(0, Math.round(a.start * 1000));
    ch.push(`adelay=${ms}|${ms}`);
    filters.push(`[${idx}:a]${ch.join(',')}[a${idx}]`);
    labels.push(`[a${idx}]`);
    idx++;
  }
  if (labels.length) {
    filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,apad,atrim=0:${duration.toFixed(4)}[aout]`);
  } else {
    inputs.push('-f', 'lavfi', '-t', duration.toFixed(4), '-i', 'anullsrc=r=48000:cl=stereo');
    filters.push(`[${idx}:a]anull[aout]`);
  }
  return { inputs, filter: filters.join(';') };
}

// Audio mix of the whole timeline -> one WAV file. Every clip is cut to an exact length on its own,
// clips are laid out back-to-back per lane with silence in the gaps, then the few lanes are mixed.
// Unlike one giant filter graph this works for any number of clips (Windows limits a command line
// to 32 767 characters, which a 400-clip montage exceeded).
// opt.speech: 16 kHz mono 16-bit — enough for recognition and ~12x less data than the export mix
// (an hour of studio-format audio is 1.4 GB per intermediate file). opt.job: { cancelled, procs } for "Stop".
async function renderAudioMix(items, duration, onStatus, opt = {}) {
  const dir = path.join(TMP, 'mix_' + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  const SR = opt.speech ? 16000 : 48000;
  const fmt = opt.speech ? ['-c:a', 'pcm_s16le', '-ar', String(SR), '-ac', '1'] : ['-c:a', 'pcm_f32le', '-ar', String(SR), '-ac', '2'];
  const layout = opt.speech ? 'mono' : 'stereo';
  const job = opt.job || {};
  const check = () => { if (job.cancelled) throw new Error('остановлено'); };
  // ffmpeg with -progress: reports how far inside one long clip it is
  const runP = (args, len, label) => new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ['-progress', 'pipe:1', '-nostats', ...args], { windowsHide: true });
    (job.procs = job.procs || new Set()).add(p);
    let err = '', last = 0;
    p.stdout.on('data', (d) => {
      const m = /out_time_us=(\d+)/.exec(d.toString());
      const now = Date.now();
      if (m && onStatus && len > 20 && now - last > 700) { last = now; onStatus(`${label} ${Math.min(99, Math.round((+m[1] / 1e6 / len) * 100))}%`); }
    });
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', reject);
    p.on('close', (c) => { job.procs.delete(p); if (job.cancelled) reject(new Error('остановлено')); else if (c === 0) resolve(); else reject(new Error(err.slice(-600) || 'ffmpeg ' + c)); });
  });
  const silence = path.join(dir, 'silence.wav');
  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-t', Math.max(0.1, duration + 1).toFixed(3), '-i', `anullsrc=r=${SR}:cl=${layout}`, ...fmt, silence]);
  check();
  if (!items.length) return silence;
  // lanes: non-overlapping runs of clips, keeping clips of the same track together when possible
  const sorted = items.map((a, i) => ({ ...a, i, len: (a.srcOut - a.srcIn) / a.speed })).sort((a, b) => a.start - b.start);
  const lanes = [];
  for (const a of sorted) {
    let lane = lanes.find((l) => l.track === a.trackId && l.end <= a.start + 1e-3) || lanes.find((l) => l.end <= a.start + 1e-3);
    if (!lane) { lane = { track: a.trackId, end: 0, list: [] }; lanes.push(lane); }
    lane.list.push(a); lane.end = a.start + a.len;
  }
  // cut every clip to its exact length (4 at a time)
  let done = 0, next = 0;
  const cut = async (a) => {
    check();
    const ch = [...atempoChain(a.speed), `aformat=sample_rates=${SR}:channel_layouts=${layout}`, `volume=${a.volume.toFixed(3)}`];
    if (a.fadeIn > 0) ch.push(`afade=t=in:st=0:d=${a.fadeIn.toFixed(3)}`);
    if (a.fadeOut > 0) ch.push(`afade=t=out:st=${Math.max(0, a.len - a.fadeOut).toFixed(3)}:d=${a.fadeOut.toFixed(3)}`);
    ch.push('apad', `atrim=end_sample=${Math.round(a.len * SR)}`);
    a.file = path.join(dir, `seg_${a.i}.wav`);
    await runP(['-y', '-v', 'error', '-ss', a.srcIn.toFixed(4), '-t', (a.srcOut - a.srcIn + 0.05).toFixed(4), '-i', a.path, '-vn', '-af', ch.join(','), ...fmt, a.file], a.len, `Сведение звука: фрагмент ${done + 1} из ${sorted.length},`);
    done++;
    if (onStatus) onStatus(`Сведение звука: ${done} из ${sorted.length}`);
  };
  await Promise.all(Array.from({ length: Math.min(4, sorted.length) }, async () => { while (next < sorted.length) await cut(sorted[next++]); }));
  // one file per lane: clips with silence between them, sample-exact positions
  const laneFiles = [];
  for (let li = 0; li < lanes.length; li++) {
    const lines = [];
    let cursor = 0; // in samples
    for (const a of lanes[li].list) {
      const at = Math.round(a.start * SR);
      if (at > cursor) lines.push(`file '${silence.split(path.sep).join('/')}'`, 'inpoint 0', `outpoint ${((at - cursor) / SR).toFixed(6)}`);
      lines.push(`file '${a.file.split(path.sep).join('/')}'`);
      cursor = Math.max(cursor, at) + Math.round(a.len * SR);
    }
    const list = path.join(dir, `lane_${li}.txt`);
    fs.writeFileSync(list, lines.join('\n'), 'utf8');
    const out = path.join(dir, `lane_${li}.wav`);
    check();
    await runP(['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, ...fmt, out], lanes[li].end, `Сведение дорожки ${li + 1} из ${lanes.length}:`);
    laneFiles.push(out);
  }
  if (onStatus) onStatus('Сведение дорожек…');
  const mix = path.join(dir, 'mix.wav');
  const ins = laneFiles.flatMap((f) => ['-i', f]);
  const graph = laneFiles.length > 1
    ? `${laneFiles.map((_, i) => `[${i}:a]`).join('')}amix=inputs=${laneFiles.length}:normalize=0:dropout_transition=0,apad,atrim=0:${duration.toFixed(4)}[aout]`
    : `[0:a]apad,atrim=0:${duration.toFixed(4)}[aout]`;
  check();
  await runP(['-y', '-v', 'error', ...ins, '-filter_complex', graph, '-map', '[aout]', ...fmt, mix], duration, 'Сведение дорожек:');
  for (const f of fs.readdirSync(dir)) if (f !== 'mix.wav') try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
  return mix;
}

// ---------- Auto captions (local Whisper) ----------
// Whisper prints "[mm:ss.mmm --> mm:ss.mmm] text" per segment; the end time of the last one
// against the audio length gives the progress.
const whisperTime = (s) => s.split(':').reduce((a, v) => a * 60 + parseFloat(v), 0);
const whisperJobs = new Map(); // sender id -> job, so "Stop" can kill ffmpeg and Whisper
ipcMain.handle('captions:cancel', (e) => {
  const job = whisperJobs.get(e.sender.id);
  if (!job) return false;
  job.cancelled = true;
  for (const p of job.procs || []) try { p.kill(); } catch (_) {}
  return true;
});
ipcMain.handle('captions:whisper', async (e, { audio, duration, language, model, prompt }) => {
  const job = { cancelled: false, procs: new Set() };
  whisperJobs.set(e.sender.id, job);
  try { return await whisperRun(e, job, { audio, duration, language, model, prompt }); }
  finally { if (whisperJobs.get(e.sender.id) === job) whisperJobs.delete(e.sender.id); }
});
async function whisperRun(e, job, { audio, duration, language, model, prompt }) {
  const send = (p) => { if (!e.sender.isDestroyed()) e.sender.send('captions:progress', { duration, ...p }); };
  const outDir = path.join(TMP, 'whisper_' + Date.now());
  fs.mkdirSync(outDir, { recursive: true });
  const wav = path.join(outDir, 'in.wav');
  const total = audio.length;
  send({ stage: 'mix', done: 0, total });
  const mix = await renderAudioMix(audio, duration, (s) => {
    const m = /фрагмент (\d+) из (\d+),? ?(\d+)?%?/.exec(s) || /(\d+) из (\d+)/.exec(s);
    const pct = /(\d+)%/.exec(s);
    if (/Сведение звука/.test(s) && m) send({ stage: 'mix', done: +m[1] - (pct ? 1 - +pct[1] / 100 : 0), total: +m[2], text: s });
    else send({ stage: 'lanes', text: s });
  }, { speech: true, job });
  fs.renameSync(mix, wav); // already 16 kHz mono
  send({ stage: 'model' });
  const args = ['-m', 'whisper', wav, '--model', model || 'small', '--output_format', 'json', '--output_dir', outDir, '--fp16', 'False', '--word_timestamps', 'True', '--verbose', 'True'];
  if (language && language !== 'auto') args.push('--language', language);
  // names and English words the user wants spelled exactly (Whisper takes them as preceding context)
  if (prompt) args.push('--initial_prompt', prompt);
  await new Promise((resolve, reject) => {
    if (job.cancelled) { reject(new Error('остановлено')); return; }
    const p = spawn('python', args, { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' } });
    job.procs.add(p);
    let err = '', buf = '';
    p.stdout.on('data', (d) => {
      const s = d.toString();
      win.webContents.send('captions:log', s);
      buf += s;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) {
        const m = /^\[([\d:.]+) --> ([\d:.]+)\]\s*(.*)$/.exec(l.trim());
        if (m) send({ stage: 'listen', at: whisperTime(m[2]), text: m[3] });
        else if (/^Detected language/i.test(l)) send({ stage: 'listen', at: 0, text: l.trim() });
      }
    });
    p.stderr.on('data', (d) => {
      const s = d.toString();
      err += s;
      win.webContents.send('captions:log', s);
      const m = /(\d+)%\|/.exec(s); // first run downloads the model
      if (m) send({ stage: 'download', pct: +m[1] });
    });
    p.on('error', reject);
    p.on('close', (c) => (job.cancelled ? reject(new Error('остановлено')) : c === 0 ? resolve() : reject(new Error(err.slice(-1200)))));
  });
  const j = JSON.parse(fs.readFileSync(path.join(outDir, 'in.json'), 'utf8'));
  return (j.segments || []).map((s) => ({ start: s.start, end: s.end, text: s.text.trim(), words: (s.words || []).map((w) => ({ start: w.start, end: w.end, word: w.word })) }));
}

// ---------- Voice input for the assistant: a Whisper process that stays loaded ----------
let voice = null; // { proc, pending: Map, ready: Promise, idle }
function voiceWorker() {
  if (voice) { clearTimeout(voice.idle); voice.idle = setTimeout(voiceStop, 10 * 60 * 1000); return voice; }
  const proc = spawn('python', [path.join(__dirname, 'tools', 'whisper_worker.py')], { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' } });
  const v = { proc, pending: new Map(), seq: 0, err: '' };
  let buf = '', readyOk;
  v.ready = new Promise((res, rej) => { readyOk = res; v.readyFail = rej; });
  v.ready.catch(() => {}); // a worker that dies before anyone asked is not an error by itself
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (d) => {
    buf += d;
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (const l of lines) {
      let j; try { j = JSON.parse(l); } catch (_) { continue; }
      if (j.ready) { readyOk(); continue; }
      const p = v.pending.get(j.id);
      if (!p) continue;
      v.pending.delete(j.id);
      if (j.error) p.reject(new Error(j.error)); else p.resolve(j);
    }
  });
  proc.stderr.on('data', (d) => { v.err = (v.err + d.toString()).slice(-2000); });
  const fail = (e) => { v.readyFail(e); for (const p of v.pending.values()) p.reject(e); v.pending.clear(); if (voice === v) voice = null; };
  proc.on('error', fail);
  proc.on('close', () => fail(new Error('распознавание остановилось: ' + (v.err.trim().split('\n').pop() || 'нет Python/Whisper'))));
  voice = v;
  v.idle = setTimeout(voiceStop, 10 * 60 * 1000); // free the memory when voice input is not used
  return v;
}
function voiceStop() { if (voice) { try { voice.proc.kill(); } catch (_) {} voice = null; } }
app.on('before-quit', voiceStop);
async function voiceAsk(req) {
  const v = voiceWorker();
  await v.ready;
  const id = ++v.seq;
  return new Promise((resolve, reject) => { v.pending.set(id, { resolve, reject }); v.proc.stdin.write(JSON.stringify({ id, ...req }) + '\n'); });
}
// opened the assistant panel: start loading the model so the first phrase is quick
ipcMain.handle('voice:warm', async (_e, model) => { await voiceAsk({ warm: true, model }); return true; });
ipcMain.handle('voice:transcribe', async (_e, { data, model, language, prompt }) => {
  const dir = path.join(TMP, 'voice');
  fs.mkdirSync(dir, { recursive: true });
  const src = path.join(dir, 'in_' + Date.now() + '.webm'), wav = src.replace(/\.webm$/, '.wav');
  fs.writeFileSync(src, Buffer.from(data));
  try {
    await run(FFMPEG, ['-y', '-v', 'error', '-i', src, '-ac', '1', '-ar', '16000', wav]);
    const r = await voiceAsk({ wav, model, language, prompt });
    return r.text || '';
  } finally { for (const f of [src, wav]) try { fs.unlinkSync(f); } catch (_) {} }
});

// ---------- AI assistant (Claude Code CLI) ----------
function findClaude() {
  try {
    const out = execFileSync('where', ['claude'], { encoding: 'utf8', windowsHide: true });
    const first = out.split(/\r?\n/).find((l) => /\.(exe|cmd)$/i.test(l));
    if (first) return first;
  } catch (_) {}
  const root = path.join(process.env.LOCALAPPDATA || '', 'Claude-Data');
  let best = null, bestT = 0;
  try {
    for (const a of fs.readdirSync(root)) {
      const cc = path.join(root, a, 'claude-code');
      if (!fs.existsSync(cc)) continue;
      for (const v of fs.readdirSync(cc)) for (const hsh of fs.readdirSync(path.join(cc, v))) {
        const p = path.join(cc, v, hsh, 'claude.exe');
        if (fs.existsSync(p)) { const t = fs.statSync(p).mtimeMs; if (t > bestT) { bestT = t; best = p; } }
      }
    }
  } catch (_) {}
  return best;
}
let aiProc = null;
const AI_DIR = path.join(TMP, 'ai');
ipcMain.handle('ai:available', () => !!findClaude());
// Single exact frame of a source file, raw RGBA (used for the assistant's storyboard)
ipcMain.handle('media:frameAt', async (_e, { file, t, w, h }) => {
  const buf = await run(FFMPEG, ['-v', 'error', '-ss', Math.max(0, t).toFixed(3), ...(/.webm$/i.test(file) ? ['-c:v', 'libvpx-vp9'] : []), '-i', file, '-frames:v', '1', '-an', '-vf', `scale=${w}:${h}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']);
  return buf.length === w * h * 4 ? buf : null;
});
// keepFull: the whole-video storyboard (full_*.jpg) survives between requests
ipcMain.handle('ai:reset', (_e, keepFull = true) => {
  fs.mkdirSync(AI_DIR, { recursive: true });
  for (const f of fs.readdirSync(AI_DIR)) {
    if (keepFull && /^full_/.test(f)) continue;
    try { fs.rmSync(path.join(AI_DIR, f), { recursive: true, force: true }); } catch (_) {}
  }
  return AI_DIR;
});
ipcMain.handle('ai:hasFiles', (_e, names) => names.every((n) => fs.existsSync(path.join(AI_DIR, path.basename(n)))));
ipcMain.handle('ai:saveFile', (_e, name, data) => {
  fs.mkdirSync(AI_DIR, { recursive: true });
  const p = path.join(AI_DIR, path.basename(name));
  fs.writeFileSync(p, Buffer.from(data));
  return p;
});
ipcMain.handle('ai:ask', async (e, { prompt, model }) => {
  const exe = findClaude();
  if (!exe) throw new Error('Claude Code не найден. Установите приложение Claude (claude.ai/download) и войдите в аккаунт.');
  const cwd = AI_DIR;
  fs.mkdirSync(cwd, { recursive: true });
  // Read is allowed so Claude can look at the storyboard images saved in its working folder.
  // stream-json reports every step (which image it opens, its thoughts) while it works;
  // the last line is the same result object the plain json format gives.
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', model || 'claude-sonnet-5-5', '--max-turns', '6', '--allowedTools', 'Read', '--disallowedTools', 'Bash,Edit,Write,Glob,Grep,WebFetch,WebSearch,Agent,NotebookEdit'];
  const send = (p) => { if (!e.sender.isDestroyed()) e.sender.send('ai:progress', p); };
  const onEvent = (ev) => {
    if (ev.type !== 'assistant' || !ev.message || !Array.isArray(ev.message.content)) return;
    for (const c of ev.message.content) {
      if (c.type === 'tool_use') send({ kind: 'read', file: path.basename(String((c.input && (c.input.file_path || c.input.path)) || c.name)) });
      else if (c.type === 'text' && c.text.trim()) send({ kind: 'text', text: c.text.trim() });
      else if (c.type === 'thinking') send({ kind: 'thinking' });
    }
  };
  return new Promise((resolve, reject) => {
    const p = spawn(exe, args, { cwd, windowsHide: true, env: { ...process.env } });
    aiProc = p;
    let out = '', err = '', buf = '';
    p.stdout.setEncoding('utf8'); // keeps Cyrillic letters split across chunks intact
    p.stdout.on('data', (d) => {
      const s = d.toString();
      out += s; buf += s;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) if (l.trim()) try { onEvent(JSON.parse(l)); } catch (_) {}
    });
    p.stderr.on('data', (d) => { err += d.toString('utf8'); });
    p.on('error', reject);
    p.on('close', () => {
      aiProc = null;
      try {
        // the result line is not always the last one (status lines may follow it)
        const lines = out.trim().split(/\r?\n/).filter(Boolean).reverse();
        const j = lines.map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).find((x) => x && x.type === 'result') || JSON.parse(lines[0]);
        if (j.is_error) reject(new Error(j.result || 'ошибка Claude'));
        else resolve(j.result || '');
      } catch (_) { reject(new Error((err || out).slice(-800) || 'нет ответа')); }
    });
    p.stdin.end(prompt, 'utf8');
  });
});
ipcMain.handle('ai:cancel', () => { if (aiProc) { try { aiProc.kill(); } catch (_) {} } });
// The assistant runs Claude Code with its own saved login; when that expires, open an
// interactive Claude Code window so the user can type /login.
ipcMain.handle('ai:login', () => {
  const exe = findClaude();
  if (!exe) throw new Error('Claude Code не найден');
  fs.mkdirSync(AI_DIR, { recursive: true });
  // verbatim arguments: Node must not re-quote the window title for cmd's "start"
  spawn('cmd.exe', ['/c', `start "Claude login" /D "${AI_DIR}" "${exe}"`], { detached: true, windowsHide: false, windowsVerbatimArguments: true }).unref();
  return true;
});

// ---------- Export ----------
// One export per window (the main window, or a hidden background-export window).
const jobs = new Map();

function atempoChain(speed) {
  const parts = [];
  let s = speed;
  while (s > 2.0) { parts.push('atempo=2.0'); s /= 2.0; }
  while (s < 0.5) { parts.push('atempo=0.5'); s /= 0.5; }
  if (Math.abs(s - 1) > 1e-4) parts.push('atempo=' + s.toFixed(5));
  return parts;
}
// video codec arguments: hardware encoder when asked/available, x264/x265 otherwise
async function videoCodecArgs(o) {
  const hevc = o.codec === 'hevc';
  let enc = o.encoder || 'cpu';
  if (enc === 'auto') {
    const list = await detectEncoders();
    enc = list.find((e) => e.startsWith(hevc ? 'hevc_' : 'h264_')) || 'cpu';
  }
  const q = Math.round(o.crf);
  if (enc.endsWith('_amf')) return ['-c:v', enc, '-quality', 'quality', '-rc', 'cqp', '-qp_i', String(q), '-qp_p', String(q + 2), ...(hevc ? ['-tag:v', 'hvc1'] : ['-qp_b', String(q + 4)])];
  if (enc.endsWith('_nvenc')) return ['-c:v', enc, '-preset', 'p5', '-rc', 'vbr', '-cq', String(q), '-b:v', '0', ...(hevc ? ['-tag:v', 'hvc1'] : [])];
  if (enc.endsWith('_qsv')) return ['-c:v', enc, '-global_quality', String(q), ...(hevc ? ['-tag:v', 'hvc1'] : [])];
  return [...(hevc ? ['-c:v', 'libx265', '-tag:v', 'hvc1'] : ['-c:v', 'libx264']), '-preset', o.speed || 'medium', '-crf', String(q)];
}

// Audio editor: the timeline's mix straight into a sound file
const AUDIO_CODECS = { mp3: ['-c:a', 'libmp3lame'], wav: ['-c:a', 'pcm_s16le'], flac: ['-c:a', 'flac'], ogg: ['-c:a', 'libvorbis'], m4a: ['-c:a', 'aac', '-movflags', '+faststart'] };
ipcMain.handle('audio:export', async (e, o) => {
  if (!FFMPEG) throw new Error('FFmpeg не найден. Установите: winget install Gyan.FFmpeg');
  const mix = await renderAudioMix(o.items, o.duration, (msg) => { try { e.sender.send('export:status', msg); } catch (_) {} });
  const args = ['-y', '-v', 'error', '-i', mix, '-t', o.duration.toFixed(4)];
  if (o.loudnorm) args.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000');
  args.push(...(AUDIO_CODECS[o.format] || AUDIO_CODECS.mp3));
  if (o.bitrate && ['mp3', 'ogg', 'm4a'].includes(o.format)) args.push('-b:a', o.bitrate + 'k');
  args.push(o.path);
  await new Promise((res, rej) => {
    const p = spawn(FFMPEG, args, { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-1500); });
    p.on('close', (code) => (code === 0 ? res() : rej(new Error(err || 'ffmpeg: код ' + code))));
  });
  return o.path;
});

ipcMain.handle('export:start', async (_e, o) => {
  if (!FFMPEG) throw new Error('FFmpeg не найден. Установите: winget install Gyan.FFmpeg');
  const sender = _e.sender;
  const isGif = /\.gif$/i.test(o.path);
  const args = ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${o.width}x${o.height}`, '-framerate', String(o.fps), '-i', '-'];
  if (isGif) {
    args.push('-vf', `fps=${Math.min(o.fps, 20)},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`, '-loop', '0');
  } else {
    const mix = await renderAudioMix(o.audio, o.duration, (msg) => { try { sender.send('export:status', msg); } catch (_) {} });
    args.push('-i', mix, '-map', '0:v', '-map', '1:a');
    args.push(...(await videoCodecArgs(o)));
    args.push('-pix_fmt', 'yuv420p', '-r', String(o.fps), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', o.duration.toFixed(4));
  }
  args.push(o.path);
  const p = spawn(FFMPEG, args, { windowsHide: true });
  let err = '';
  p.stderr.on('data', (d) => { err += d.toString(); if (err.length > 20000) err = err.slice(-20000); });
  const done = new Promise((resolve) => p.on('close', (code) => resolve({ code, err })));
  p.stdin.on('error', () => {});
  jobs.set(sender.id, { p, done, path: o.path });
  return true;
});

ipcMain.handle('export:frame', (_e, data) => {
  const job = jobs.get(_e.sender.id);
  if (!job) return false;
  const ok = job.p.stdin.write(Buffer.from(data));
  if (ok) return true;
  return new Promise((resolve) => job.p.stdin.once('drain', () => resolve(true)));
});

ipcMain.handle('export:finish', async (_e) => {
  const job = jobs.get(_e.sender.id);
  if (!job) return { ok: false, error: 'нет задачи' };
  job.p.stdin.end();
  const r = await job.done;
  jobs.delete(_e.sender.id);
  if (r.code !== 0) return { ok: false, error: r.err.slice(-1500) };
  return { ok: true, path: job.path };
});

ipcMain.handle('export:cancel', async (_e) => {
  const job = jobs.get(_e.sender.id);
  if (!job) return;
  try { job.p.stdin.destroy(); job.p.kill(); } catch (_) {}
  await job.done;
  jobs.delete(_e.sender.id);
  try { fs.unlinkSync(job.path); } catch (_) {}
});

// ---------- Background export: a hidden window renders the project while you keep editing ----------
const bgJobs = new Map();
let bgSeq = 0;
ipcMain.handle('bgexport:start', (_e, { project, opts }) => {
  const id = ++bgSeq;
  const w = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, webSecurity: false, backgroundThrottling: false } });
  bgJobs.set(id, { id, win: w, project, opts, p: 0 });
  w.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: { job: String(id) } });
  w.on('closed', () => {
    const j = bgJobs.get(id);
    if (j && !j.finished) { j.finished = true; if (win) win.webContents.send('bgexport:done', { id, ok: false, error: 'Окно экспорта закрыто' }); }
    bgJobs.delete(id);
    updateTaskbar();
  });
  return id;
});
ipcMain.handle('bgexport:get', (_e, id) => { const j = bgJobs.get(+id); return j ? { project: j.project, opts: j.opts } : null; });
ipcMain.on('bgexport:progress', (_e, { id, p, eta, msg }) => {
  const j = bgJobs.get(+id);
  if (!j) return;
  j.p = p;
  updateTaskbar();
  if (win) win.webContents.send('bgexport:progress', { id: +id, p, eta, msg });
});
ipcMain.on('bgexport:done', (_e, r) => {
  const j = bgJobs.get(+r.id);
  if (j) { j.finished = true; setTimeout(() => { try { j.win.destroy(); } catch (_) {} }, 300); }
  if (win) {
    win.webContents.send('bgexport:done', r);
    if (r.notify !== false) {
      try {
        const { Notification } = require('electron');
        const n = new Notification({ title: r.ok ? 'Экспорт готов' : 'Ошибка экспорта', body: r.ok ? path.basename(r.path) : String(r.error || '').slice(0, 200), icon: path.join(__dirname, 'icon.ico') });
        n.on('click', () => { if (r.ok) shell.showItemInFolder(r.path); win.show(); });
        n.show();
      } catch (_) {}
    }
    if (!win.isFocused()) win.flashFrame(true);
  }
  updateTaskbar();
});
ipcMain.handle('bgexport:cancel', (_e, id) => { const j = bgJobs.get(+id); if (j) j.win.webContents.send('bgexport:cancel'); });
function updateTaskbar() {
  if (!win) return;
  const active = [...bgJobs.values()].filter((j) => !j.finished);
  if (!active.length) win.setProgressBar(-1);
  else win.setProgressBar(active.reduce((a, j) => a + (j.p || 0), 0) / active.length);
}

// ---------- Send a file to an Android phone (USB debugging) ----------
function findAdb() {
  try {
    const out = execFileSync('where', ['adb'], { encoding: 'utf8', windowsHide: true });
    const f = out.split(/\r?\n/).find(Boolean);
    if (f) return f;
  } catch (_) {}
  const cands = [path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk', 'platform-tools', 'adb.exe'), 'C:\\Program Files\\SideQuest\\resources\\platform-tools\\adb.exe'];
  const wg = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  try { for (const d of fs.readdirSync(wg)) if (/PlatformTools/i.test(d)) cands.unshift(path.join(wg, d, 'platform-tools', 'adb.exe')); } catch (_) {}
  return cands.find((c) => fs.existsSync(c)) || null;
}
ipcMain.handle('phone:devices', async () => {
  const adb = findAdb();
  if (!adb) return { adb: false, devices: [] };
  const out = (await run(adb, ['devices', '-l'])).toString();
  const devices = out.split(/\r?\n/).slice(1).filter((l) => /\bdevice\b/.test(l)).map((l) => {
    const id = l.split(/\s+/)[0];
    const model = (l.match(/model:(\S+)/) || [])[1] || id;
    return { id, model };
  });
  return { adb: true, devices, unauthorized: /unauthorized/.test(out) };
});
ipcMain.handle('phone:send', async (_e, { file, device }) => {
  const adb = findAdb();
  if (!adb) throw new Error('adb не найден');
  const dev = device ? ['-s', device] : [];
  const name = path.basename(file);
  const remote = '/sdcard/DCIM/Camera/' + name;
  await run(adb, [...dev, 'push', file, remote]);
  // make it show up in the gallery right away
  const q = remote.replace(/'/g, "'\\''");
  try { await run(adb, [...dev, 'shell', `am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d 'file://${q}'`]); } catch (_) {}
  return remote;
});

