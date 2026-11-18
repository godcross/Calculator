// Fully offline voice dictation using Vosk (WebAssembly). Audio never leaves the device.
// The speech model (~40 MB) is downloaded once, after you agree, and kept on the phone.
import * as store from './store.js';
import { wordsToExpression, MATH_VOCAB } from './engine/words.js';
import { h, toast, sheet, confirmBox } from './ui/common.js';

let model = null;
let loading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Vosk) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the voice engine'));
    document.head.append(s);
  });
}

async function ensureModel() {
  if (model) return model;
  if (loading) return loading;
  const st = store.settings();
  if (!st.voiceConsent) {
    const ok = await confirmBox('Set up offline voice',
      'Voice works fully offline, so your audio never leaves this phone. It needs a one-time download of the English speech model (about 40 MB) from the open-source Vosk project. After that, no internet is used. Download now?',
      { okLabel: 'Download model' });
    if (!ok) return null;
    await store.saveSettings({ voiceConsent: true });
  }
  const overlay = h('div', {}, h('p', {}, 'Preparing offline voice… The first time this downloads the speech model; later it loads from the phone.'), h('div', { class: 'progress' }, h('div', { style: 'width:100%;animation:pulse 1.2s infinite' })));
  const s = sheet('Offline voice', overlay);
  loading = (async () => {
    try {
      await loadScript(new URL('vendor/vosk.js', document.baseURI).href);
      const url = new URL(store.settings().voiceModelUrl, document.baseURI).href;
      model = await window.Vosk.createModel(url);
      return model;
    } catch (e) {
      toast(`Voice unavailable: ${e.message || e}`);
      model = null;
      return null;
    } finally {
      s.close();
      loading = null;
    }
  })();
  return loading;
}

// Listen once; resolves with recognised text (or '' if cancelled).
async function listen({ grammar = null, hint = '' } = {}) {
  const m = await ensureModel();
  if (!m) return '';
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  } catch {
    toast('Microphone permission is needed for voice');
    return '';
  }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const rec = grammar ? new m.KaldiRecognizer(ctx.sampleRate, JSON.stringify(grammar)) : new m.KaldiRecognizer(ctx.sampleRate);
  const overlay = document.getElementById('voice-overlay');
  const textEl = document.getElementById('voice-text');
  const hintEl = document.getElementById('voice-hint');
  textEl.textContent = 'Listening…';
  hintEl.textContent = hint;
  overlay.classList.remove('hidden');

  return new Promise((resolve) => {
    const finals = [];
    let partial = '';
    let done = false;
    let silenceTimer = null;
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = (ev) => { try { rec.acceptWaveform(ev.inputBuffer); } catch { /* ignore */ } };
    src.connect(proc);
    proc.connect(ctx.destination);
    const finish = () => {
      if (done) return;
      done = true;
      try { rec.retrieveFinalResult(); } catch { /* ignore */ }
      setTimeout(() => {
        try { proc.disconnect(); src.disconnect(); } catch { /* ignore */ }
        stream.getTracks().forEach((t) => t.stop());
        ctx.close();
        try { rec.remove(); } catch { /* ignore */ }
        overlay.classList.add('hidden');
        resolve([...finals, partial].filter(Boolean).join(' ').replace(/\[unk\]/g, '').trim());
      }, 250);
    };
    rec.on('result', (msg) => {
      const t = msg.result?.text;
      if (t) { finals.push(t); partial = ''; textEl.textContent = finals.join(' '); }
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(finish, 1800); // stop after a pause
    });
    rec.on('partialresult', (msg) => {
      partial = msg.result?.partial || '';
      if (partial) textEl.textContent = [...finals, partial].join(' ');
    });
    const stopBtn = document.getElementById('voice-stop');
    stopBtn.onclick = () => finish();
    setTimeout(finish, 20000); // hard limit
  });
}

export const voice = {
  // mode 'math' or 'dim' -> calculator expression text
  async listenExpression(mode = 'math') {
    const hint = mode === 'dim'
      ? 'Say e.g. "twelve feet six and three eighths inches times four"'
      : 'Say e.g. "square root of sixteen plus two point five"';
    const words = await listen({ grammar: MATH_VOCAB, hint });
    if (!words) return '';
    const expr = wordsToExpression(words, mode);
    if (!expr) toast(`Heard "${words}" but found no numbers`);
    return expr;
  },
  // free dictation into a text field (notes, names, labels)
  async dictateInto(el) {
    const words = await listen({ hint: 'Speak your note. Tap Done when finished.' });
    if (words) {
      el.value = (el.value ? el.value.replace(/\s*$/, ' ') : '') + words;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.focus();
    }
  },
  async forget() {
    model?.terminate?.();
    model = null;
    // Vosk caches the model in IndexedDB (Emscripten IDBFS)
    await new Promise((r) => { const q = indexedDB.deleteDatabase('/vosk'); q.onsuccess = q.onerror = q.onblocked = () => r(); });
    await store.saveSettings({ voiceConsent: false });
  },
};
