// =========================================================
// audio.js
// SE（効果音）はWeb Audio APIでその場で合成する。
// BGM（背景音楽）は同階層に置いた BGM.mp3 を <audio> でループ再生する。
//
// 依存関係:
//   - グローバル変数 `game`（script.js側）の game.settings を参照する。
//   - このファイルは script.js より先に読み込むこと。
//   - index.html と同じディレクトリに BGM.mp3 を配置すること。
// =========================================================

const BGM_SRC = 'BGM.mp3';
const BGM_VOLUME = 0.4; // BGMの最大音量（0〜1）

const AudioSystem = (() => {
  let ctx = null;
  let masterGain = null;
  let sfxGain = null;
  let bgmAudio = null;
  let bgmPlaying = false;

  function getSettings() {
    if (typeof game !== 'undefined' && game && game.settings) return game.settings;
    return {};
  }

  function ensureContext() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
      sfxGain = ctx.createGain();
      sfxGain.connect(masterGain);
      applyVolumes();
    } catch (e) { ctx = null; }
    return ctx;
  }

  function applyVolumes() {
    const s = getSettings();
    if (ctx) sfxGain.gain.value = (s.sfxEnabled === false) ? 0 : 0.35;
    if (bgmAudio) bgmAudio.volume = (s.bgmEnabled === false) ? 0 : BGM_VOLUME;
  }

  // 単純なビープ音（正弦波等）を1つ鳴らす
  function beep({ freq = 440, duration = 0.12, type = 'sine', gain = 0.3, delay = 0 } = {}) {
    const c = ensureContext();
    if (!c) return;
    const s = getSettings();
    if (s.sfxEnabled === false) return;
    applyVolumes();
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g);
    g.connect(sfxGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  // ノイズバースト（ガラスが割れるようなクラック/破砕音に使う）
  function noiseBurst({ duration = 0.2, filterFreq = 3000, filterQ = 1, filterType = 'bandpass', gain = 0.3, delay = 0 } = {}) {
    const c = ensureContext();
    if (!c) return;
    const s = getSettings();
    if (s.sfxEnabled === false) return;
    applyVolumes();
    const t0 = c.currentTime + delay;
    const bufferSize = Math.max(1, Math.floor(c.sampleRate * duration));
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource();
    noise.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, t0);
    filter.Q.value = filterQ;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    noise.connect(filter);
    filter.connect(g);
    g.connect(sfxGain);
    noise.start(t0);
    noise.stop(t0 + duration + 0.02);
  }

  // 効果音の種類ごとの定義（今後増やしやすいようオブジェクトで管理）
  const SFX = {
    click:       () => beep({ freq: 600, duration: 0.05, type: 'square', gain: 0.15 }),
    toggle:      () => beep({ freq: 480, duration: 0.05, type: 'square', gain: 0.12 }),
    buy:         () => beep({ freq: 520, duration: 0.08, type: 'triangle', gain: 0.2 }),
    error:       () => beep({ freq: 160, duration: 0.15, type: 'sawtooth', gain: 0.2 }),
    save:        () => beep({ freq: 700, duration: 0.06, type: 'sine', gain: 0.15 }),
    achievement: () => { beep({ freq: 660, duration: 0.12, gain: 0.25 }); beep({ freq: 880, duration: 0.18, gain: 0.25, delay: 0.1 }); },
    linac:       () => { beep({ freq: 300, duration: 0.2, gain: 0.25 }); beep({ freq: 500, duration: 0.25, gain: 0.2, delay: 0.08 }); },
    shift:       () => { beep({ freq: 200, duration: 0.3, gain: 0.25 }); beep({ freq: 700, duration: 0.35, gain: 0.2, delay: 0.1 }); },
    crunch:      () => { [0, 0.1, 0.2, 0.3].forEach((d, i) => beep({ freq: 110 - i * 10, duration: 0.4, type: 'sawtooth', gain: 0.22, delay: d })); },
    challenge:   () => { beep({ freq: 440, duration: 0.15, gain: 0.25 }); beep({ freq: 550, duration: 0.15, gain: 0.25, delay: 0.12 }); beep({ freq: 660, duration: 0.2, gain: 0.25, delay: 0.24 }); },
    unlock:      () => { beep({ freq: 392, duration: 0.15, gain: 0.25 }); beep({ freq: 587, duration: 0.25, gain: 0.25, delay: 0.13 }); },
    // Break Infinity解放: 無限マークが出現→緊張感の高まり→ひび割れ→破砕→きらめく余韻
    breakInfinity: () => {
      // 出現時の低い唸り（無限マークが形作られる)
      beep({ freq: 90,  duration: 1.5, type: 'sine',     gain: 0.18, delay: 0 });
      beep({ freq: 180, duration: 1.4, type: 'triangle', gain: 0.12, delay: 0.1 });
      // 緊張感の高まる上昇音（ひびが入り始める）
      beep({ freq: 220, duration: 0.7, type: 'sawtooth', gain: 0.14, delay: 1.1 });
      beep({ freq: 349, duration: 0.5, type: 'sawtooth', gain: 0.12, delay: 1.35 });
      // ひび割れる高音のクラック音（複数の短いノイズバースト）
      [1.6, 1.66, 1.72, 1.78, 1.84, 1.9].forEach((d, i) => {
        noiseBurst({ duration: 0.07, filterFreq: 3800 + i * 700, filterQ: 6, gain: 0.28, delay: d });
        beep({ freq: 1400 + i * 250, duration: 0.05, type: 'square', gain: 0.08, delay: d });
      });
      // 砕け散る瞬間: 低音の衝撃＋広帯域ノイズの爆発
      noiseBurst({ duration: 0.6, filterFreq: 1500, filterQ: 0.6, filterType: 'lowpass', gain: 0.4, delay: 1.95 });
      noiseBurst({ duration: 0.35, filterFreq: 6000, filterQ: 0.8, filterType: 'highpass', gain: 0.3, delay: 1.95 });
      beep({ freq: 55, duration: 1.1, type: 'sine', gain: 0.45, delay: 1.95 });
      beep({ freq: 38, duration: 1.3, type: 'sine', gain: 0.35, delay: 2.0 });
      // 解放後、きらめくアルペジオで余韻を残す
      [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => beep({ freq: f, duration: 0.45, type: 'sine', gain: 0.18, delay: 2.35 + i * 0.13 }));
    }
  };

  function playSE(name) {
    const s = getSettings();
    if (s.sfxEnabled === false) return;
    const fn = SFX[name];
    if (fn) { try { fn(); } catch (e) {} }
  }

  // BGM: BGM.mp3をループ再生する
  function ensureBGMAudio() {
    if (bgmAudio) return bgmAudio;
    bgmAudio = new Audio(BGM_SRC);
    bgmAudio.loop = true;
    bgmAudio.preload = 'auto';
    applyVolumes();
    return bgmAudio;
  }

  function startBGM() {
    const s = getSettings();
    if (s.bgmEnabled === false) return;
    const a = ensureBGMAudio();
    applyVolumes();
    if (bgmPlaying) return;
    a.play().then(() => { bgmPlaying = true; }).catch(() => { bgmPlaying = false; });
  }

  function stopBGM() {
    bgmPlaying = false;
    if (bgmAudio) bgmAudio.pause();
  }

  // 設定変更後に呼ぶ: ON/OFFに応じて再生/停止を切り替える
  function refreshBGMState() {
    const s = getSettings();
    if (s.bgmEnabled === false) stopBGM();
    else startBGM();
    applyVolumes();
  }

  // ブラウザの自動再生制限のため、初回のユーザー操作でAudioContextを起動する
  function initOnFirstInteraction() {
    const handler = () => {
      ensureContext();
      refreshBGMState();
      document.removeEventListener('click', handler);
      document.removeEventListener('keydown', handler);
    };
    document.addEventListener('click', handler);
    document.addEventListener('keydown', handler);
  }

  return { playSE, startBGM, stopBGM, refreshBGMState, initOnFirstInteraction, ensureContext };
})();
