/**
 * the-Particle v3.5.1 (Fix: Hard Reset & Unlock Persistence)
 */
const SAVE_KEY = 'theParticle_v3_5_1'; // キーを変更して確実に新規状態で始められるようにします
let INFINITY_LIMIT = 1.79e308;

// --- 単位定義 ---
const UNITS_ENG = [
 '', 'k', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 
 'Ud', 'Dd', 'Td', 'Qad', 'Qid', 'Sxd', 'Spd', 'Od', 'Nd', 'Vg', 
 'Uvg', 'Dvg', 'Tvg', 'Qavg', 'Qivg', 'Sxvg', 'Spvg', 'Ovg', 'Nvg', 'Tg', 
 'Utg', 'Dtg', 'Ttg', 'Qatg', 'Qitg', 'Sxtg', 'Sptg', 'Otg', 'Ntg'
];

const UNITS_JP = [
 '', '万', '億', '兆', '京', '垓', '𥝱', '穣', '溝', '澗', '正', '載', '極', 
 '恒河沙', '阿僧祇', '那由他', '不可思議', '無量大数', 
 '洛叉', '倶胝', '阿庾多', '那由他', '頻婆羅', '矜羯羅', '阿伽羅', '最勝', 
 '摩婆羅', '阿婆羅', '多婆羅', '界分', '普摩', '祢摩', '阿婆鈐', '弥伽婆', 
 '毘ラガ', '毘ガバ', '僧褐邏'
];

// --- Infinity Upgrades 定義 ---
const INF_UPGRADES = [
  {
    id: 0,
    title: "Time Dilation",
    desc: "通算プレイ時間に応じて全生産倍率増加",
    cost: 1,
    effect: (game) => {
      const totalSec = (game.stats.totalTimePlayed || 0);
      return Math.max(1, 1 + Math.log10(totalSec + 10) * 0.5);
    },
    formatEffect: (val) => `x${format(val)}`
  },
  { id: 1, targetGen: 0, title: "Mk.1 Infinite Boost", desc: "Infinity到達回数に応じて Mk.1 を強化", cost: 1, effect: (game) => 1 + ((game.infinity.crunchCount || 0) / 5), formatEffect: (val) => `x${format(val)}` },
  { id: 2, targetGen: 1, title: "Mk.2 Infinite Boost", desc: "Infinity到達回数に応じて Mk.2 を強化", cost: 1, effect: (game) => 1 + ((game.infinity.crunchCount || 0) / 5), formatEffect: (val) => `x${format(val)}` },
  { id: 3, targetGen: 2, title: "Mk.3 Infinite Boost", desc: "Infinity到達回数に応じて Mk.3 を強化", cost: 2, effect: (game) => 1 + ((game.infinity.crunchCount || 0) / 5), formatEffect: (val) => `x${format(val)}` },
  { id: 4, targetGen: 3, title: "Mk.4 Infinite Boost", desc: "Infinity到達回数に応じて Mk.4 を強化", cost: 3, effect: (game) => 1 + ((game.infinity.crunchCount || 0) / 5), formatEffect: (val) => `x${format(val)}` },
  { id: 5, targetGen: 4, title: "Mk.5 Infinite Boost", desc: "Infinity到達回数に応じて Mk.5 を強化", cost: 5, effect: (game) => 1 + ((game.infinity.crunchCount || 0) / 5), formatEffect: (val) => `x${format(val)}` },
  { id: 6, targetGen: 5, title: "Mk.6 Infinite Boost", desc: "Infinity到達回数に応じて Mk.6 を強化", cost: 10, effect: (game) => 1 + ((game.infinity.crunchCount || 0) / 5), formatEffect: (val) => `x${format(val)}` },
  { id: 7, targetGen: 6, title: "Mk.7 Infinite Boost", desc: "Infinity到達回数に応じて Mk.7 を強化", cost: 20, effect: (game) => 1 + ((game.infinity.crunchCount || 0) / 5), formatEffect: (val) => `x${format(val)}` },
  { id: 8, targetGen: 7, title: "Mk.8 Infinite Boost", desc: "Infinity到達回数に応じて Mk.8 を強化", cost: 50, effect: (game) => 1 + ((game.infinity.crunchCount || 0) / 5), formatEffect: (val) => `x${format(val)}` }
];

// --- 初期ジェネレーター生成 ---
function getInitialGenerators() {
  return [
    { id: 0, name: "Accelerator Mk.1", baseCost: 10,   costMult: 1.5, amount: 0, bought: 0, production: 1, autoUnlocked: false, autoActive: true },
    { id: 1, name: "Accelerator Mk.2", baseCost: 100,  costMult: 1.8, amount: 0, bought: 0, production: 1, autoUnlocked: false, autoActive: true },
    { id: 2, name: "Accelerator Mk.3", baseCost: 1e3,  costMult: 2.2, amount: 0, bought: 0, production: 1, autoUnlocked: false, autoActive: true },
    { id: 3, name: "Accelerator Mk.4", baseCost: 1e4,  costMult: 3.0, amount: 0, bought: 0, production: 1, autoUnlocked: false, autoActive: true },
    { id: 4, name: "Accelerator Mk.5", baseCost: 1e6,  costMult: 4.0, amount: 0, bought: 0, production: 1, autoUnlocked: false, autoActive: true },
    { id: 5, name: "Accelerator Mk.6", baseCost: 1e8,  costMult: 6.0, amount: 0, bought: 0, production: 1, autoUnlocked: false, autoActive: true },
    { id: 6, name: "Accelerator Mk.7", baseCost: 1e10, costMult: 10.0, amount: 0, bought: 0, production: 1, autoUnlocked: false, autoActive: true },
    { id: 7, name: "Accelerator Mk.8", baseCost: 1e12, costMult: 15.0, amount: 0, bought: 0, production: 1, autoUnlocked: false, autoActive: true }
  ];
}

// --- 初期データ構造 ---
function getInitialState() {
  return {
    particles: 10,
    linacs: 0, 
    shifts: 0, 
    unlocks: {
      linac: false, // 一度でも到達したらtrue
    },
    stats: {
      startTime: Date.now(),
      totalParticles: 10,
      totalLinacs: 0,
      totalTimePlayed: 0
    },
    infinity: {
      ip: 0,
      crunchCount: 0,
      bestTime: null,
      upgrades: [],
      broken: false
    },
    settings: {
      notation: 'sci',
      buyAmount: 1,
      skipLinacConf: false,
      skipShiftConf: false,
      skipCrunchAnim: false
    },
    lastTick: Date.now(),
    autobuyerTimer: 0,
    generators: getInitialGenerators()
  };
}

let game = getInitialState();
let isCrunching = false;

// --- ユーティリティ ---
function format(num) {
  if (num === undefined || num === null || isNaN(num)) return "0.00";
  if (!isFinite(num)) return "Infinity";
  if (num < 1000) return num.toFixed(2);
  
  const type = (game.settings && game.settings.notation) ? game.settings.notation : 'sci';
  
  if (type === 'sci') return formatScientific(num);
  if (type === 'eng') {
    let exponent = Math.floor(Math.log10(num));
    let unitIndex = Math.floor(exponent / 3);
    if (unitIndex >= UNITS_ENG.length) return formatScientific(num);
    let mantissa = num / Math.pow(1000, unitIndex);
    return mantissa.toFixed(2) + " " + UNITS_ENG[unitIndex];
  }
  if (type === 'jp') {
    let exponent = Math.floor(Math.log10(num));
    let unitIndex = Math.floor(exponent / 4);
    if (unitIndex >= UNITS_JP.length) return formatScientific(num);
    let mantissa = num / Math.pow(10000, unitIndex);
    return mantissa.toFixed(2) + " " + UNITS_JP[unitIndex];
  }
  return formatScientific(num);
}

function formatScientific(num) {
  if (!isFinite(num)) return "Infinity";
  let exponent = Math.floor(Math.log10(num));
  let mantissa = num / Math.pow(10, exponent);
  return mantissa.toFixed(2) + "e" + exponent;
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "--:--:--";
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// --- 計算ロジック ---
function getBulkCost(gen, count) {
  const r = gen.costMult;
  const currentCost = gen.baseCost * Math.pow(r, gen.bought);
  const multiplier = (Math.pow(r, count) - 1) / (r - 1);
  return currentCost * multiplier;
}

function getCost(gen) {
  return gen.baseCost * Math.pow(gen.costMult, gen.bought);
}

function getLinacBaseMult() {
  const s = game.shifts || 0;
  return 1.2 + (s * 0.2);
}

function hasUpgrade(id) {
  if (!game.infinity) return false;
  if (!Array.isArray(game.infinity.upgrades)) game.infinity.upgrades = [];
  return game.infinity.upgrades.includes(id);
}

function getLinacMultValue() {
  const base = getLinacBaseMult();
  const l = game.linacs || 0;
  return Math.pow(base, l);
}

function getGlobalInfinityMultValue() {
  let mult = 1;
  try {
    if (hasUpgrade(0)) mult *= INF_UPGRADES[0].effect(game);
  } catch(e) {}
  return mult;
}

function getPerGenInfMult(genIndex) {
  const upgradeId = genIndex + 1;
  if (hasUpgrade(upgradeId)) {
    try {
      const upObj = INF_UPGRADES.find(u => u.id === upgradeId);
      if(upObj) return upObj.effect(game);
    } catch(e) { console.error(e); }
  }
  return 1;
}

function getGlobalMultiplier() {
  return getLinacMultValue() * getGlobalInfinityMultValue();
}

function getLinacReq() {
  const l = game.linacs || 0;
  return 1 + (l * 10);
}

function getShiftReq() {
  const s = game.shifts || 0;
  return 5 + (s * 5);
}

// --- ゲームループ ---
function gameLoop() {
  requestAnimationFrame(gameLoop);
  if (isCrunching) return;

  const now = Date.now();
  let dt = (now - game.lastTick) / 1000;
  if (dt > 1) dt = 1; 
  game.lastTick = now;

  if (!game.stats.totalTimePlayed) game.stats.totalTimePlayed = 0;
  game.stats.totalTimePlayed += dt;

  if (isNaN(game.particles)) game.particles = 10;
  
  if (game.infinity && game.infinity.broken) {
    INFINITY_LIMIT = 1e999;
  } else {
    INFINITY_LIMIT = 1.79e308;
  }
  if (game.particles >= INFINITY_LIMIT && !(game.infinity && game.infinity.broken)) {
    triggerBigCrunch();
    return;
  }

  updateGlitchEffect();
  const globalMult = getGlobalMultiplier();
  
  game.generators.forEach((gen, i) => {
    let amountToAdd = 0;
    const genInfMult = getPerGenInfMult(i);
    
    if (i === 0) {
      let pps = gen.amount * gen.production * globalMult * genInfMult;
      if (!isFinite(pps) || pps > 1.79e308) pps = 1.79e308;
      const produced = pps * dt;
      if (!isNaN(produced)) {
        game.particles += produced;
        game.stats.totalParticles += produced;
      }
    } else {
      const target = game.generators[i - 1];
      amountToAdd = gen.amount * gen.production * globalMult * genInfMult * dt;
      if (!isNaN(amountToAdd) && isFinite(amountToAdd)) {
        target.amount += amountToAdd;
      }
    }
  });

  game.autobuyerTimer = (game.autobuyerTimer || 0) + dt;
  if (game.autobuyerTimer >= 0.5) {
    runAutobuyers();
    game.autobuyerTimer = 0;
  }
  
  // アンロック状態のチェック
  const linacReq = getLinacReq();
  if (!game.unlocks.linac) {
    // Mk.8が条件到達 OR 過去にライナック済み OR シフト済み OR Infinity済み
    if (game.generators[7].amount >= linacReq || game.stats.totalLinacs > 0 || game.shifts > 0 || game.infinity.crunchCount > 0) {
      game.unlocks.linac = true;
    }
  }

  // PPS再計算
  const g0 = game.generators[0];
  const g0Inf = getPerGenInfMult(0);
  let currentPPS = g0.amount * g0.production * globalMult * g0Inf;
  if(!isFinite(currentPPS) || currentPPS > 1.79e308) currentPPS = 1.79e308;

  updateUI(currentPPS);
  
  const wrapper = document.getElementById('app-wrapper');
  if (wrapper && !wrapper.classList.contains('closed')) {
    updateStats();
    updateInfinityTab();
  }
  
  if (now % 10000 < 20) saveGame(true);
}

// --- アクション ---
function runAutobuyers() {
  game.generators.forEach((gen, index) => {
    const threshold = Number('1e' + (50 + index * 10));
    if (!gen.autoUnlocked && game.particles >= threshold) {
      gen.autoUnlocked = true;
    }
    if (gen.autoUnlocked && gen.autoActive) {
      for(let k=0; k<10; k++) {
        const cost = getCost(gen);
        if (game.particles >= cost) {
          game.particles -= cost;
          gen.amount++;
          gen.bought++;
          gen.production *= 1.1;
        } else {
          break;
        }
      }
    }
  });
}

function toggleAutobuyer(index) {
  const gen = game.generators[index];
  if (!gen.autoUnlocked) return;
  gen.autoActive = !gen.autoActive;
  updateUI(0);
}

function setBuyAmount(amount) {
  game.settings.buyAmount = amount;
  document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
  const btn = document.getElementById(`buy-${amount}`);
  if(btn) btn.classList.add('active');
  updateUI(0);
}

function changeNotation(val) {
  game.settings.notation = val;
  updateUI(0);
}

function buyGenerator(index) {
  const gen = game.generators[index];
  const amountToBuy = game.settings.buyAmount;
  const cost = getBulkCost(gen, amountToBuy);
  if (game.particles >= cost) {
    game.particles -= cost;
    gen.amount += amountToBuy;
    gen.bought += amountToBuy;
    gen.production *= Math.pow(1.1, amountToBuy);
    updateUI(0);
  }
}

function buyMaxGenerator(index) {
  const gen = game.generators[index];
  const r = gen.costMult; 
  const currentCost = gen.baseCost * Math.pow(r, gen.bought);
  if (game.particles < currentCost) return;

  const numerator = (game.particles * (r - 1)) / currentCost + 1;
  let count = Math.floor(Math.log(numerator) / Math.log(r));

  if (count <= 0) return;

  const totalCost = currentCost * (Math.pow(r, count) - 1) / (r - 1);
  if (game.particles >= totalCost) {
    game.particles -= totalCost;
    gen.amount += count;
    gen.bought += count;
    gen.production *= Math.pow(1.1, count);
    updateUI(0);
  }
}

function doLinac() {
  const req = getLinacReq();
  if (game.generators[7].amount < req) return;
  const currentBase = getLinacBaseMult();

  if (!game.settings.skipLinacConf) {
    if (!confirm(`ライナックを実行しますか？\n倍率: ${format(currentBase)}倍\nライナック数: ${game.linacs} -> ${game.linacs+1}`)) return;
  }

  game.linacs = (game.linacs || 0) + 1;
  game.stats.totalLinacs = (game.stats.totalLinacs || 0) + 1;
  game.particles = 10;
  game.generators.forEach(gen => {
    gen.amount = 0;
    gen.bought = 0;
    gen.production = 1; 
  });
  
  // アンロックフラグ維持
  game.unlocks.linac = true; 

  saveGame();
  updateUI(0);
}

function doLinacShift() {
  const shiftReq = getShiftReq();
  if ((game.linacs || 0) < shiftReq) return;
  const currentBase = getLinacBaseMult();
  const nextBase = currentBase + 0.2;

  if (!game.settings.skipShiftConf) {
    if (!confirm(`【警告】シフトを実行しますか？\n倍率: ${format(currentBase)} -> ${format(nextBase)}`)) return;
  }

  game.shifts = (game.shifts || 0) + 1;
  game.linacs = 0;
  game.particles = 10;
  game.generators.forEach(gen => {
    gen.amount = 0;
    gen.bought = 0;
    gen.production = 1; 
  });
  
  game.unlocks.linac = true; 

  saveGame();
  updateUI(0);
  
  if (!game.settings.skipShiftConf) {
    alert(`シフト完了！現在の倍率: ${format(nextBase)}倍`);
  }
}

// --- Infinity Logic ---
function buyInfinityUpgrade(id) {
  if (hasUpgrade(id)) return;
  const upgrade = INF_UPGRADES.find(u => u.id === id);
  if (!upgrade) return;
  
  const currentIP = (game.infinity && game.infinity.ip) ? game.infinity.ip : 0;
  
  if (currentIP >= upgrade.cost) {
    game.infinity.ip -= upgrade.cost;
    if (!game.infinity.upgrades) game.infinity.upgrades = [];
    game.infinity.upgrades.push(id);
    saveGame();
    updateUI(0);
    updateInfinityTab();
  }
}

function unlockBreakInfinity() {
  const currentIP = (game.infinity && game.infinity.ip) ? game.infinity.ip : 0;
  if (currentIP >= 1e50 && !game.infinity.broken) {
    game.infinity.broken = true;
    alert("LIMIT BROKEN.\n粒子の上限が撤廃されました。");
    updateInfinityTab();
  }
}

// --- UI更新 ---
function updateUI(pps) {
  const pDisplay = document.getElementById('particle-display');
  if(pDisplay) pDisplay.textContent = `${format(game.particles)} 粒子`;
  
  const ppsDisplay = document.getElementById('pps-display');
  if(ppsDisplay) ppsDisplay.textContent = `(+${format(pps)} /秒)`;

  // Infinity表示
  const ipContainer = document.getElementById('ip-display-container');
  const infTabBtn = document.getElementById('tab-btn-infinity');
  const hasReachedInfinity = game.infinity && (game.infinity.crunchCount > 0 || game.infinity.ip > 0);

  if (hasReachedInfinity) {
    if (ipContainer) {
      ipContainer.style.display = 'inline-block';
      const ipVal = document.getElementById('ip-val');
      if(ipVal) ipVal.textContent = format(game.infinity.ip);
    }
    if (infTabBtn) infTabBtn.style.display = 'block';
  } else {
    if (ipContainer) ipContainer.style.display = 'none';
    if (infTabBtn) infTabBtn.style.display = 'none';
  }

  // シフトバー表示
  const shiftStatusBar = document.getElementById('shift-status');
  if (shiftStatusBar) {
    if ((game.shifts || 0) > 0) {
      shiftStatusBar.style.display = 'flex';
      const baseMult = getLinacBaseMult();
      document.getElementById('shift-mult-display').textContent = `x${format(baseMult)}`;
      document.getElementById('shift-count').textContent = game.shifts || 0;
    } else {
      shiftStatusBar.style.display = 'none';
    }
  }

  // ★ プレステージバナー表示制御 ★
  const pContainer = document.getElementById('prestige-container');
  const linacReq = getLinacReq();
  const shiftReq = getShiftReq();
  const baseMult = getLinacBaseMult();

  if (pContainer) {
    // unlocks.linacがtrueなら常時表示
    if (game.unlocks && game.unlocks.linac) {
      pContainer.style.display = 'block';
      
      const linacCountEl = document.getElementById('current-linac-count');
      if(linacCountEl) linacCountEl.textContent = game.linacs || 0;
      
      const nextShiftEl = document.getElementById('next-shift-req');
      if(nextShiftEl) nextShiftEl.textContent = shiftReq;

      const btnLinac = document.getElementById('btn-linac');
      if (btnLinac) {
        if (game.generators[7].amount >= linacReq) {
          btnLinac.classList.remove('disabled');
          btnLinac.innerHTML = `<strong>ライナックを実行</strong><br><span style="font-size:0.8em;">生産倍率 x${format(baseMult)} & リセット</span>`;
          btnLinac.onclick = doLinac;
        } else {
          btnLinac.classList.add('disabled');
          btnLinac.innerHTML = `<strong>ライナック未到達</strong><br><span style="font-size:0.8em;">Mk.8 が ${linacReq}個 必要</span>`;
          btnLinac.onclick = null;
        }
      }

      const btnShift = document.getElementById('btn-shift');
      if (btnShift) {
        if (game.linacs >= shiftReq) {
          btnShift.style.display = 'inline-block';
          const nextBase = baseMult + 0.2;
          btnShift.innerHTML = `<strong>ライナック・シフト</strong><br><span style="font-size:0.8em;">次倍率: ${format(nextBase)}</span>`;
        } else {
          btnShift.style.display = 'none';
        }
      }
    } else {
      pContainer.style.display = 'none';
    }
  }

  // ジェネレーター更新
  const currentLinacMult = getLinacMultValue();
  const globalInfMult = getGlobalInfinityMultValue();

  game.generators.forEach((gen, index) => {
    const btn = document.getElementById(`btn-${index}`);
    const btnMax = document.getElementById(`btn-max-${index}`);
    if (!btn) return; 

    const buyAmt = game.settings.buyAmount;
    const cost = getBulkCost(gen, buyAmt);

    const autoBadge = document.getElementById(`auto-badge-${index}`);
    if (autoBadge) {
      autoBadge.className = 'auto-badge'; 
      autoBadge.onclick = null;
      if (gen.autoUnlocked) {
        autoBadge.classList.add('clickable');
        autoBadge.onclick = () => toggleAutobuyer(index);
        if (gen.autoActive) {
          autoBadge.classList.add('active');
          autoBadge.textContent = "AUTO: ON";
        } else {
          autoBadge.classList.add('inactive');
          autoBadge.textContent = "AUTO: OFF";
        }
      } else {
        const th = Number('1e' + (50 + index * 10));
        autoBadge.textContent = `Req: ${format(th)}`;
      }
    }

    const amtEl = document.getElementById(`amount-${index}`);
    if(amtEl) amtEl.textContent = `所持: ${format(gen.amount)}`;

    const perGenMult = getPerGenInfMult(index);
    const totalInfMult = globalInfMult * perGenMult;
    const totalGenMult = gen.production * currentLinacMult * totalInfMult;
    
    const multEl = document.getElementById(`mult-${index}`);
    if(multEl) multEl.textContent = `x${format(totalGenMult)}`;

    const linacEl = document.getElementById(`mult-linac-${index}`);
    if (linacEl) {
        if (currentLinacMult > 1) {
            linacEl.style.display = 'block';
            linacEl.textContent = `[Linac: x${format(currentLinacMult)}]`;
        } else {
            linacEl.style.display = 'none';
        }
    }

    const infEl = document.getElementById(`mult-inf-${index}`);
    if (infEl) {
        if (totalInfMult > 1) {
            infEl.style.display = 'block'; 
            infEl.textContent = `[Inf: x${format(totalInfMult)}]`;
        } else {
            infEl.style.display = 'none';
        }
    }

    btn.textContent = `${buyAmt}個: ${format(cost)}`;
    if (game.particles >= cost) btn.classList.remove('disabled'); else btn.classList.add('disabled');
    if (game.particles >= getCost(gen)) btnMax.classList.remove('disabled'); else btnMax.classList.add('disabled');
  });
}

function updateStats() {
  const currentRunTime = (Date.now() - game.stats.startTime) / 1000;
  document.getElementById('stat-time').textContent = `${formatTime(currentRunTime)}`;
  document.getElementById('stat-total').textContent = format(game.stats.totalParticles);

  const statPrestige = document.getElementById('stat-prestige');
  const rowPrestige = document.getElementById('row-prestige');
  if (game.stats.totalLinacs > 0 && statPrestige && rowPrestige) {
    rowPrestige.style.display = 'flex';
    statPrestige.textContent = `${game.stats.totalLinacs} 回`;
  }
  const statShift = document.getElementById('stat-shift');
  const rowShift = document.getElementById('row-shift');
  if (game.shifts > 0 && statShift && rowShift) {
    rowShift.style.display = 'flex';
    statShift.textContent = `${game.shifts} 回`;
  }
  if (game.infinity && game.infinity.crunchCount > 0) {
    const infStats = document.getElementById('infinity-stats');
    if(infStats) infStats.style.display = 'block';
    document.getElementById('stat-crunch').textContent = `${game.infinity.crunchCount} 回`;
    const bestT = game.infinity.bestTime;
    document.getElementById('stat-best-inf').textContent = (bestT !== null) ? formatTime(bestT / 1000) : "--:--:--";
  }
}

function updateInfinityTab() {
  const el = document.getElementById('inf-tab-ip-display');
  if(el) el.textContent = format(game.infinity ? game.infinity.ip : 0);

  const container = document.getElementById('infinity-upgrades-container');
  if (container) {
    const upgradeIds = INF_UPGRADES.map(u => u.id).join(',');
    const currentIds = Array.from(container.children).map(c => c.id.replace('inf-btn-', '')).join(',');
    
    if (upgradeIds !== currentIds) {
      container.innerHTML = ''; 
      INF_UPGRADES.forEach(up => {
        const btn = document.createElement('div');
        btn.className = `inf-upgrade-btn`;
        btn.id = `inf-btn-${up.id}`;
        
        btn.innerHTML = `
          <div style="width:100%">
            <div class="inf-desc">${up.title}: ${up.desc}</div>
            <div class="inf-effect-val" style="font-size:0.8em; color:#00ff9d;"></div>
          </div>
          <div class="inf-cost"></div>
        `;
        
        btn.addEventListener('click', () => {
           buyInfinityUpgrade(up.id);
        });
        
        container.appendChild(btn);
      });
    }

    INF_UPGRADES.forEach(up => {
      const btn = document.getElementById(`inf-btn-${up.id}`);
      if(!btn) return;

      const bought = hasUpgrade(up.id);
      const currentIP = (game.infinity && game.infinity.ip) ? game.infinity.ip : 0;
      
      if (bought) {
        btn.classList.add('bought');
        btn.classList.remove('disabled');
      } else {
        btn.classList.remove('bought');
        if (currentIP < up.cost) {
          btn.classList.add('disabled');
        } else {
          btn.classList.remove('disabled');
        }
      }

      let currentEffect = 1;
      try { currentEffect = up.effect(game); } catch(e){}
      
      const effectEl = btn.querySelector('.inf-effect-val');
      if(effectEl) effectEl.textContent = `現在の効果: ${up.formatEffect(currentEffect)}`;

      const costEl = btn.querySelector('.inf-cost');
      if(costEl) costEl.textContent = bought ? 'BOUGHT' : 'COST: ' + format(up.cost) + ' IP';
    });
  }

  const breakSec = document.getElementById('break-infinity-section');
  const btnBreak = document.getElementById('btn-break-infinity');
  const msgBreak = document.getElementById('break-active-msg');
  
  const currentIP = (game.infinity && game.infinity.ip) ? game.infinity.ip : 0;
  
  if (currentIP >= 1e50 || (game.infinity && game.infinity.broken)) {
    breakSec.style.display = 'block';
    if (game.infinity.broken) {
      btnBreak.style.display = 'none';
      msgBreak.style.display = 'block';
    } else {
      btnBreak.style.display = 'block';
      msgBreak.style.display = 'none';
      if (currentIP < 1e50) btnBreak.classList.add('disabled');
      else btnBreak.classList.remove('disabled');
    }
  } else {
    breakSec.style.display = 'none';
  }
}

function updateGlitchEffect() {
  const overlay = document.getElementById('glitch-layer');
  if (!overlay) return;
  if (game.infinity && game.infinity.broken && game.particles < 1e250) {
    document.body.classList.remove('glitched');
    overlay.style.opacity = 0;
    return;
  }
  if (game.particles < 1e250) {
    document.body.classList.remove('glitched');
    overlay.style.opacity = 0;
    return;
  }
  const logP = Math.log10(game.particles);
  const intensity = (logP - 250) / (308 - 250); 
  if (intensity > 0) {
    document.body.classList.add('glitched');
    overlay.style.opacity = intensity * 0.8;
  }
}

// --- ビッグ・クランチ ---
function triggerBigCrunch() {
  if (isCrunching) return;
  const startTime = (game.stats && game.stats.startTime) ? game.stats.startTime : Date.now();
  const currentTime = Date.now() - startTime;
  
  if (!game.infinity) game.infinity = { ip:0, crunchCount:0, bestTime:null, upgrades:[], broken:false };
  
  let gainedIP = 1;
  game.infinity.ip = (game.infinity.ip || 0) + gainedIP;
  game.infinity.crunchCount = (game.infinity.crunchCount || 0) + 1;
  if (game.infinity.bestTime === null || currentTime < game.infinity.bestTime) {
    game.infinity.bestTime = currentTime;
  }
  
  if (game.settings.skipCrunchAnim) {
    performInfinityReset();
    return; 
  }

  isCrunching = true;
  saveGame();
  const overlay = document.getElementById('crunch-overlay');
  if(overlay) overlay.classList.add('active');
  
  setTimeout(() => { performInfinityReset(); }, 5000);
  setTimeout(() => {
    if(overlay) overlay.classList.remove('active');
    isCrunching = false;
  }, 8500);
}

function performInfinityReset() {
  game.particles = 10;
  game.linacs = 0;
  game.shifts = 0;
  game.generators = getInitialGenerators();
  // unlocksは維持する
  
  updateUI(0);
  updateStats();
  updateInfinityTab();
  document.body.classList.remove('glitched');
  saveGame();
  console.log("Universe Reborn.");
}

// --- セーブ・ロード ---
function saveGame(isAuto = false) {
  if(isCrunching && isAuto) return;
  game.lastTick = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game));
    if (!isAuto) {
      const s = document.getElementById('save-status');
      if(s) {
        s.textContent = "保存しました";
        setTimeout(() => s.textContent = "オートセーブ有効 (10秒毎)", 2000);
      }
    }
  } catch(e) { console.error(e); }
}

function loadGame() {
  const data = localStorage.getItem(SAVE_KEY);
  if (data) {
    try {
      const parsed = JSON.parse(data);
      const fresh = getInitialState();
      game = { ...fresh, ...parsed };
      game.stats = { ...fresh.stats, ...(parsed.stats || {}) };
      game.infinity = { ...fresh.infinity, ...(parsed.infinity || {}) };
      game.settings = { ...fresh.settings, ...(parsed.settings || {}) };
      game.unlocks = { ...fresh.unlocks, ...(parsed.unlocks || {}) };

      if (game.settings.skipLinacConf === undefined) game.settings.skipLinacConf = false;
      if (game.settings.skipShiftConf === undefined) game.settings.skipShiftConf = false;
      if (game.settings.skipCrunchAnim === undefined) game.settings.skipCrunchAnim = false;

      if (!game.stats.totalTimePlayed) game.stats.totalTimePlayed = 0;
      if (!Array.isArray(game.infinity.upgrades)) game.infinity.upgrades = [];
      if (game.infinity.ip === undefined) game.infinity.ip = 0;
      if (parsed.generators) {
        game.generators = parsed.generators.map((g, i) => {
          const freshGen = fresh.generators[i] || g;
          return { 
            ...freshGen, ...g,
            autoUnlocked: g.autoUnlocked !== undefined ? g.autoUnlocked : freshGen.autoUnlocked,
            autoActive: g.autoActive !== undefined ? g.autoActive : freshGen.autoActive
          };
        });
      } else { game.generators = fresh.generators; }
      
      const notSel = document.getElementById('notation-select');
      if(notSel) notSel.value = game.settings.notation;
      setBuyAmount(game.settings.buyAmount);

      // 安全装置: 初期状態でアンロックがtrueになってしまっていたらfalseに戻す
      // (ただし、過去の統計データがある場合は許可)
      if (game.unlocks.linac) {
         const hasProgress = game.stats.totalLinacs > 0 || game.shifts > 0 || game.infinity.crunchCount > 0;
         if (!hasProgress && game.generators[7].amount === 0) {
            game.unlocks.linac = false; // 強制修正
         }
      }

    } catch(e) { console.error("Save Load Error:", e); }
  }
}

function hardReset() {
  if(confirm("本当に全てのデータを消去しますか？（元に戻せません）")) {
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  }
}

function exportSave() {
  saveGame(true);
  const str = btoa(JSON.stringify(game));
  const area = document.getElementById('save-textarea');
  toggleImportArea(true); 
  area.value = str;
  area.select();
}

function toggleImportArea(forceOpen = false) {
  const area = document.getElementById('io-area');
  if (!area) return;
  if (forceOpen) area.style.display = 'block';
  else area.style.display = (area.style.display === 'none') ? 'block' : 'none';
}

function confirmImport() {
  const str = document.getElementById('save-textarea').value.trim();
  if (!str) return;
  try {
    const decoded = atob(str);
    JSON.parse(decoded); 
    localStorage.setItem(SAVE_KEY, decoded);
    location.reload();
  } catch(e) { alert("データが無効です"); }
}

// --- UI操作 ---
function toggleSidebar() { 
  const el = document.getElementById('app-wrapper');
  if(el) el.classList.toggle('closed');
}

function switchTab(name, btn) {
  document.querySelectorAll('.sidebar-content').forEach(c => c.classList.remove('active'));
  const targetContent = document.getElementById('tab-' + name);
  if (targetContent) targetContent.classList.add('active');
  
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  else {
    const btns = document.querySelectorAll('.tab-btn');
    btns.forEach(b => {
        if(b.getAttribute('onclick') && b.getAttribute('onclick').includes(name)) b.classList.add('active');
    });
  }
}

// 設定UI生成
function initSettingsUI() {
  const settingsTab = document.getElementById('tab-settings');
  if (!settingsTab) return;

  if (document.getElementById('setting-toggles-container')) return;

  const container = document.createElement('div');
  container.id = 'setting-toggles-container';
  container.style.marginTop = '20px';
  container.innerHTML = `<h3>AUTOMATION & SKIP</h3>`;
  
  const createToggle = (id, label, settingKey) => {
    const wrapper = document.createElement('div');
    wrapper.style.marginBottom = '10px';
    wrapper.innerHTML = `
      <label style="display:flex; align-items:center; cursor:pointer; color:#ccc; font-size:0.9rem;">
        <input type="checkbox" id="${id}" style="margin-right:10px; transform: scale(1.2);"> ${label}
      </label>
    `;
    const cb = wrapper.querySelector('input');
    cb.checked = (game.settings && game.settings[settingKey]) || false;
    cb.onchange = (e) => {
      if(!game.settings) game.settings = {};
      game.settings[settingKey] = e.target.checked;
      saveGame();
    };
    return wrapper;
  };

  container.appendChild(createToggle('chk-linac', 'ライナック確認をスキップ', 'skipLinacConf'));
  container.appendChild(createToggle('chk-shift', 'シフト確認をスキップ', 'skipShiftConf'));
  container.appendChild(createToggle('chk-crunch', 'Big Crunch演出をスキップ', 'skipCrunchAnim'));

  const headers = settingsTab.querySelectorAll('h3');
  let ref = null;
  for(let h of headers) {
    if(h.textContent.includes('DATA MANAGEMENT')) {
      ref = h;
      break;
    }
  }
  
  if(ref) settingsTab.insertBefore(container, ref);
  else settingsTab.appendChild(container);
}

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  const key = e.key.toLowerCase();
  if (key >= '1' && key <= '8') {
    const index = parseInt(key) - 1;
    buyGenerator(index);
    animateButton(index);
  }
  if (key === 'm') {
    game.generators.forEach((_, i) => buyMaxGenerator(i));
    for(let i=0; i<8; i++) animateButton(i);
  }
  if (key === 's') {
    e.preventDefault();
    saveGame();
    const s = document.getElementById('save-status');
    if(s) {
        s.textContent = "★ QUICK SAVE! ★";
        s.style.color = "#00ff9d";
        setTimeout(() => { 
            s.textContent = "オートセーブ有効 (10秒毎)"; 
            s.style.color = "";
        }, 2000);
    }
  }
});

function animateButton(index) {
  const btn = document.getElementById(`btn-${index}`);
  if (btn) {
    btn.classList.add('btn-pressed');
    setTimeout(() => btn.classList.remove('btn-pressed'), 150);
  }
}

// ニュースティッカー
const NEWS_DATA = [
  { req: 0, text: "システム起動... 観測を開始します。" },
  { req: 0, text: "近所の猫が粒子まみれになっています。" },
  { req: 0, text: "電気代の請求書が怖くてポストを開けられません。" },
  { req: 0, text: "【TIPS】キーボードの 'M' で最大購入、'S' でセーブ可能です。" },
  { req: 50, text: "研究室のコーヒーが勝手に沸騰し始めました。" },
  { req: 100, text: "微細な振動が床から伝わってきます。" },
  { req: 500, text: "「ただの光る点だ」と友人に笑われました。" },
  { req: 1000, text: "近所のコンビニで「粒子払い」が可能になりました。" },
  { req: 5000, text: "あなたの指先から微弱なガンマ線が出ています。" },
  { req: 1e4, text: "部屋の照明が不要になりました。" },
  { req: 5e4, text: "スマホのバッテリーが減らなくなりました。" },
  { req: 1e5, text: "科学雑誌「ムー」があなたの特集を組みました。" },
  { req: 5e5, text: "水道からプラズマが出るという苦情が殺到しています。" },
  { req: 1e6, text: "物理学者があなたの家の前でデモ行進をしています。" },
  { req: 1e7, text: "税務署が「粒子の課税区分」について頭を抱えています。" },
  { req: 1e8, text: "地元の天気予報: 「ところにより粒子、のち時空の歪みでしょう」" },
  { req: 1e9, text: "世界中のスパコンが計算に追いつけません。" },
  { req: 1e10, text: "月面から「コッチヲ見ルナ」という信号を受信しました。" },
  { req: 1e11, text: "あなたのくしゃみで株価が乱高下しています。" },
  { req: 1e12, text: "空間に亀裂が見えますが、気にしてはいけません。" },
  { req: 1e13, text: "物理法則のアップデート待機中... (99%)" },
  { req: 1e14, text: "昨日の夕飯が何だったか、歴史から消滅しました。" },
  { req: 1e15, text: "銀河系の質量バランスが崩れ始めています。" },
  { req: 1e18, text: "「重力」のサブスクリプション期限が切れそうです。" },
  { req: 1e20, text: "もう何も怖くない。" },
  { req: 1e22, text: "シュレーディンガーの猫が、箱の中から餌を要求しています。" },
  { req: 1e25, text: "全宇宙のエントロピーが減少に転じました。" },
  { req: 1e30, text: "神様から「やりすぎ」という苦情メールが届きました。" },
  { req: 1e50, text: "宇宙のデータ容量が圧迫されています。" },
  { req: 1e60, text: "現実と虚構の境界線が溶けてバターになりました。" },
  { req: 1e80, text: "数学者が「1+1=粒子」であることを証明しました。" },
  { req: 1e100, text: "ERROR: テキスト出力機能に異常が発生しています。" },
  { req: 1e150, text: "あ　な　た　は　誰　で　す　か　？" },
  { req: 1e200, text: "NULL POINTER EXCEPTION: UNIVERSE NOT FOUND." },
  { req: 1e250, text: "システム警告: ビッグ・クランチが接近しています。" },
  { req: 1e300, text: "サヨウナラ。" }
];

function updateNewsText() {
  const content = document.getElementById('news-content');
  if (!content) return;
  const availableNews = NEWS_DATA.filter(n => game.particles >= n.req);
  if (availableNews.length === 0) return;
  const randIndex = Math.floor(Math.random() * availableNews.length);
  content.textContent = availableNews[randIndex].text;
}

function initNews() {
  const track = document.querySelector('.news-track');
  if (track) {
    updateNewsText();
    track.addEventListener('animationiteration', updateNewsText);
  }
}

function init() {
  console.log("Game Initializing...");
  const container = document.getElementById('generator-container');
  if(container) {
    container.innerHTML = '';
    getInitialGenerators().forEach((gen, index) => {
      const row = document.createElement('div');
      row.className = 'generator-row';
      row.innerHTML = `
        <div class="gen-info">
          <div class="gen-name">
            ${gen.name} 
            <span id="auto-badge-${index}" class="auto-badge">Req: 1e${50 + index*10}</span>
          </div>
          <div class="gen-amount" id="amount-${index}">0</div>
          
          <div class="gen-multiplier" style="display:flex; flex-direction:column; align-items:flex-start;">
             <span id="mult-${index}" style="font-weight:bold;">x1.00</span>
             <div style="font-size:0.7em; margin-top:2px; line-height:1.2;">
               <span id="mult-linac-${index}" style="color:#ffb300; display:none; margin-right:5px;"></span>
               <span id="mult-inf-${index}" style="color:#d500f9; display:none;"></span>
             </div>
          </div>
        </div>
        <div class="btn-group">
          <button id="btn-${index}" class="buy-btn" onclick="buyGenerator(${index})">
            1個購入
          </button>
          <button id="btn-max-${index}" class="buy-btn max" onclick="buyMaxGenerator(${index})">
            Buy Max
          </button>
        </div>
      `;
      container.appendChild(row);
    });
  }
  loadGame();
  
  // ★重要: 初期化直後の強制非表示処理★
  const pContainer = document.getElementById('prestige-container');
  if (pContainer && (!game.unlocks || !game.unlocks.linac)) {
    pContainer.style.display = 'none';
  }

  initSettingsUI();
  initNews();
  switchTab('stats');
  gameLoop();
}

document.addEventListener('DOMContentLoaded', init);