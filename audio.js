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
    unlock:      () => { beep({ freq: 392, duration: 0.15, gain: 0.25 }); beep({ freq: 587, duration: 0.25, gain: 0.25, delay: 0.13 }); }
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
