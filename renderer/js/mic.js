'use strict';
// ============ Microphone: device choice, noise suppression, monitoring ============
// Chain: device -> low-cut (hum) -> noise suppressor -> noise gate -> gain -> recorder / meter / headphones.
// The neural suppressors (RNNoise, GTCRN) and the Speex one come from @sapphi-red/web-noise-suppressor (MIT).
const MIC_LIB = new URL('../node_modules/@sapphi-red/web-noise-suppressor/dist/', location.href).href;
const MIC_NOISE = [
  ['off', 'Выключено'],
  ['browser', 'Встроенное (лёгкое)'],
  ['rnnoise', 'RNNoise — нейросеть, как в Discord'],
  ['gtcrn', 'GTCRN — нейросеть, сильнее'],
  ['speex', 'Speex — классическое'],
];
let micLibP = null;
const micWasm = {};
const micLib = () => (micLibP = micLibP || import(MIC_LIB + 'index.js'));

async function micDevices() {
  let list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  // names are hidden until the microphone has been opened once
  if (list.length && !list[0].label) {
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); } catch (_) {}
    list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  }
  return list.filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications');
}

async function micOpen() {
  const ns = SET.micNoise;
  // with all three WebRTC options off the browser hands over the microphone untouched (studio sound);
  // any of them turns on call-style processing that makes the voice sound like a phone
  const audio = { echoCancellation: !!SET.micEcho, noiseSuppression: ns === 'browser', autoGainControl: !!SET.micAgc, sampleRate: 48000 };
  let raw;
  try { raw = await navigator.mediaDevices.getUserMedia({ audio: SET.micId ? { ...audio, deviceId: { exact: SET.micId } } : audio }); }
  catch (e) {
    if (!SET.micId) throw e;
    // the chosen microphone was unplugged: fall back to the system default
    raw = await navigator.mediaDevices.getUserMedia({ audio });
    toast('Выбранный микрофон не найден — записываю с микрофона по умолчанию', 4000);
  }
  const ac = new AudioContext({ sampleRate: 48000 });
  const input = ac.createMediaStreamSource(raw);
  // To mono. Many USB mics and sound cards send "stereo" with the voice only in the left channel —
  // passed through as is, it is heard in one ear. Every half second: both channels live -> average,
  // only one live -> take just that one (no -6 dB loss).
  const split = ac.createChannelSplitter(2), gL = ac.createGain(), gR = ac.createGain();
  const src = ac.createGain();
  src.channelCount = 1; src.channelCountMode = 'explicit'; src.channelInterpretation = 'speakers';
  const aL = ac.createAnalyser(), aR = ac.createAnalyser();
  aL.fftSize = aR.fftSize = 1024;
  input.connect(split);
  split.connect(gL, 0); split.connect(gR, 1); split.connect(aL, 0); split.connect(aR, 1);
  gL.connect(src); gR.connect(src);
  gR.gain.value = 0;
  const chBuf = new Float32Array(1024);
  const rmsOf = (a) => { a.getFloatTimeDomainData(chBuf); let s = 0; for (const v of chBuf) s += v * v; return Math.sqrt(s / chBuf.length); };
  const chTimer = setInterval(() => {
    const l = rmsOf(aL), r = rmsOf(aR);
    if (l < 1e-4 && r < 1e-4) return; // silence: keep the last choice
    const both = l > r * 0.1 && r > l * 0.1;
    gL.gain.value = both ? 0.5 : l >= r ? 1 : 0;
    gR.gain.value = both ? 0.5 : l >= r ? 0 : 1;
  }, 500);
  const workers = [];
  let node = src;
  const add = (n) => { node.connect(n); node = n; };
  try {
    if (SET.micHighpass) { const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 90; add(f); }
    const neural = ['rnnoise', 'gtcrn', 'speex'].includes(ns);
    if (neural || SET.micGate < 0) {
      const lib = await micLib();
      if (neural) {
        await ac.audioWorklet.addModule(MIC_LIB + ns + '/workletProcessor.js');
        micWasm[ns] = micWasm[ns] || await (ns === 'rnnoise' ? lib.loadRnnoise({ url: MIC_LIB + 'rnnoise.wasm', simdUrl: MIC_LIB + 'rnnoise_simd.wasm' })
          : ns === 'gtcrn' ? lib.loadGtcrn({ url: MIC_LIB + 'gtcrn.wasm' }) : lib.loadSpeex({ url: MIC_LIB + 'speex.wasm' }));
        const Node = { rnnoise: lib.RnnoiseWorkletNode, gtcrn: lib.GtcrnWorkletNode, speex: lib.SpeexWorkletNode }[ns];
        const w = new Node(ac, { maxChannels: 1, wasmBinary: micWasm[ns] });
        workers.push(w); add(w);
      }
      if (SET.micGate < 0) {
        await ac.audioWorklet.addModule(MIC_LIB + 'noiseGate/workletProcessor.js');
        add(new lib.NoiseGateWorkletNode(ac, { openThreshold: SET.micGate, closeThreshold: SET.micGate - 6, holdMs: 250, maxChannels: 1 }));
      }
    }
  } catch (e) {
    console.warn('mic processing', e);
    toast('Шумоподавление не запустилось: ' + e.message, 5000);
  }
  const gain = ac.createGain();
  gain.gain.value = Math.pow(10, (+SET.micGain || 0) / 20);
  add(gain);
  const dest = ac.createMediaStreamDestination();
  node.connect(dest);
  const an = ac.createAnalyser(); an.fftSize = 1024; node.connect(an);
  const anRaw = ac.createAnalyser(); anRaw.fftSize = 1024; src.connect(anRaw);
  // monitoring in the headphones: processed sound or the raw microphone for comparison
  const monProc = ac.createGain(), monRaw = ac.createGain();
  monProc.gain.value = monRaw.gain.value = 0;
  node.connect(monProc); src.connect(monRaw);
  monProc.connect(ac.destination); monRaw.connect(ac.destination);
  const buf = new Float32Array(an.fftSize);
  const dB = (a) => { a.getFloatTimeDomainData(buf); let s = 0, pk = 0; for (const v of buf) { s += v * v; pk = Math.max(pk, Math.abs(v)); } return { rms: 20 * Math.log10(Math.sqrt(s / buf.length) + 1e-9), peak: 20 * Math.log10(pk + 1e-9) }; };
  return {
    stream: dest.stream,
    level: () => dB(an),
    levelRaw: () => dB(anRaw),
    label: raw.getAudioTracks()[0] ? raw.getAudioTracks()[0].label : '',
    monitor(on, rawSound) { monProc.gain.value = on && !rawSound ? 1 : 0; monRaw.gain.value = on && rawSound ? 1 : 0; },
    close() {
      clearInterval(chTimer);
      raw.getTracks().forEach((t) => t.stop());
      for (const w of workers) try { w.destroy(); } catch (_) {}
      ac.close().catch(() => {});
    },
  };
}

// Level meter: green/yellow/red bar from -60 to 0 dBFS with a mark at the noise-gate threshold
function micMeter() {
  const fill = h('i'), mark = h('b'), txt = h('span', { class: 'micDb' }, '— дБ');
  const el = h('div', { class: 'micMeter' }, h('div', { class: 'micBar' }, fill, mark), txt);
  const pos = (db) => clamp((db + 60) / 60, 0, 1) * 100;
  return {
    el,
    set(lv) {
      fill.style.width = pos(lv.peak).toFixed(1) + '%';
      fill.style.background = lv.peak > -3 ? '#e74c3c' : lv.peak > -12 ? '#f1c40f' : '#2ecc71';
      txt.textContent = lv.rms < -90 ? '— дБ' : `${lv.rms.toFixed(0)} дБ`;
      mark.style.display = SET.micGate < 0 ? '' : 'none';
      mark.style.left = pos(SET.micGate) + '%';
    },
  };
}
