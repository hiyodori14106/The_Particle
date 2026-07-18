/**
 * the-Particle v3.5.1 (Fix: Hard Reset & Unlock Persistence)
 */
const SAVE_KEY = 'theParticle_v3_5_1'; // キーを変更して確実に新規状態で始められるようにします
let INFINITY_LIMIT = 1.79e308;

// --- Decimal (break_infinity.js) ヘルパー ---
// game.particles / game.stats.totalParticles / game.stats.highestParticles は
// 常に Decimal インスタンスとして保持し、1.78e308 を超える桁数も扱えるようにする。
// Break Infinity解放後は、この仕組みにより実際に1.78e308を超えて進行できる。
function toDecimal(v) {
  if (typeof Decimal === 'undefined') return v; // ライブラリ未読込時のフォールバック（通常起こらない）
  if (v instanceof Decimal) return v;
  return new Decimal(v || 0);
}

// ジェネレーターamount等、number/Decimal どちらの可能性もある値を安全に比較するヘルパー
function amtGte(amount, value) { return (amount instanceof Decimal) ? amount.gte(value) : amount >= value; }
function amtGt(amount, value)  { return (amount instanceof Decimal) ? amount.gt(value)  : amount > value; }
function amtLt(amount, value)  { return (amount instanceof Decimal) ? amount.lt(value)  : amount < value; }

// number/Decimal どちらでも安全に加算する（大きくなりすぎたらDecimalへ昇格する）
const OVERFLOW_SAFE_THRESHOLD = 1e300;
function amtAdd(amount, add) {
  if (amount instanceof Decimal || add instanceof Decimal) {
    return toDecimal(amount).add(add);
  }
  const result = amount + add;
  // JSのnumber演算がオーバーフローする手前でDecimalへ昇格しておく
  // （オーバーフロー後に変換すると桁数が壊れて表示が飛んでしまうため）
  if (!isFinite(result) || result > OVERFLOW_SAFE_THRESHOLD) {
    return toDecimal(amount).add(add);
  }
  return result;
}

// game.infinity.ip を常にDecimalとして取得する（1.78e308を超えて蓄積できるようにする）
function getIP() {
  if (!game.infinity) return new Decimal(0);
  game.infinity.ip = toDecimal(game.infinity.ip);
  return game.infinity.ip;
}

// セーブデータ（数値 / 文字列 / {mantissa,exponent}）からDecimalへ復元する
// ※ Decimalクラスは toJSON() で toString() の文字列として保存されるため、文字列にも対応する。
function decimalFromSaved(v, fallback = 0) {
  if (v === undefined || v === null) return new Decimal(fallback);
  if (v instanceof Decimal) return v;
  if (typeof v === 'number') return new Decimal(v);
  if (typeof v === 'string') {
    try { return Decimal.fromString(v); } catch(e) { return new Decimal(fallback); }
  }
  if (typeof v === 'object' && typeof v.mantissa === 'number' && typeof v.exponent === 'number') {
    return Decimal.fromMantissaExponent(v.mantissa, v.exponent);
  }
  return new Decimal(fallback);
}

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

// --- Infinity強化 定義（Mk.1〜Mk.8 と IP倍加 はレベル制） ---
function makeMkPowerUpgrade(id, targetGen) {
  return {
    id, targetGen,
    title: `Mk.${targetGen + 1} 強化`,
    desc: `Mk.${targetGen + 1} の生産倍率を指数で強化`,
    baseCost: 1,
    leveled: true,
    effect: (game) => 1 + getUpgradeLevel(id) * 0.1,
    nextEffect: (game) => 1 + (getUpgradeLevel(id) + 1) * 0.1,
    formatEffect: (val) => `^${format(val)}`
  };
}

const INF_UPGRADES = [
  {
    id: 0,
    title: "時間膨張",
    desc: "通算プレイ時間に応じて全生産倍率増加",
    cost: 1,
    leveled: false,
    effect: (game) => {
      const totalSec = (game.stats.totalTimePlayed || 0);
      return Math.max(1, 1 + Math.log10(totalSec + 10) * 0.5);
    },
    formatEffect: (val) => `x${format(val)}`
  },
  makeMkPowerUpgrade(1, 0),
  makeMkPowerUpgrade(2, 1),
  makeMkPowerUpgrade(3, 2),
  makeMkPowerUpgrade(4, 3),
  makeMkPowerUpgrade(5, 4),
  makeMkPowerUpgrade(6, 5),
  makeMkPowerUpgrade(7, 6),
  makeMkPowerUpgrade(8, 7),
  {
    id: 9,
    title: "IP倍加",
    desc: "Big Crunchで獲得するIPを増加させる",
    baseCost: 2,
    leveled: true,
    effect: (game) => Math.pow(2, getUpgradeLevel(9)),
    nextEffect: (game) => Math.pow(2, getUpgradeLevel(9) + 1),
    formatEffect: (val) => `${format(val)} IP`
  }
];

// --- 実績定義（配列で管理・追加しやすい構造） ---
// points: 実績解除時にもらえるAP（実績ポイント）。省略時は10。
const ACHIEVEMENTS_BASE = [
  {
    id: 'firstStep',
    title: '初めての一歩',
    desc: 'Accelerator Mk.1を初めて購入した',
    icon: '🚀',
    points: 10,
    check: (game) => game.generators[0] && amtGte(game.generators[0].amount, 1)
  },
  {
    id: 'firstLinac',
    title: '初ライナック！',
    desc: '初めてライナック（Linac）を実行した',
    icon: '🌌',
    points: 10,
    check: (game) => (game.stats.totalLinacs || 0) >= 1
  },
  {
    id: 'firstShift',
    title: '初シフト！',
    desc: '初めてシフト（Shift）を実行した',
    icon: '🔄',
    points: 10,
    check: (game) => (game.shifts || 0) >= 1
  },
  {
    id: 'infinity',
    title: 'Infinity',
    desc: '初めてBig Crunchを行った',
    icon: '♾️',
    points: 100,
    check: (game) => (game.infinity && game.infinity.crunchCount > 0)
  }
];

// --- 粒子数マイルストーン実績 ---
// 表（しきい値・実績名）だけを追加すれば実績が増やせる構造。
const PARTICLE_MILESTONES = [
  { threshold: 1e1,     label: '1e1',     title: 'はじまり' },
  { threshold: 1e10,    label: '1e10',    title: '少し慣れてきた？' },
  { threshold: 1e20,    label: '1e20',    title: '勢いに乗る' },
  { threshold: 1e30,    label: '1e30',    title: 'ぐんぐん成長' },
  { threshold: 1e40,    label: '1e40',    title: '加速開始' },
  { threshold: 1e50,    label: '1e50',    title: '半世紀（指数）' },
  { threshold: 1e60,    label: '1e60',    title: '止まらない' },
  { threshold: 1e70,    label: '1e70',    title: '爆発的成長' },
  { threshold: 1e80,    label: '1e80',    title: 'もう十分？' },
  { threshold: 1e90,    label: '1e90',    title: 'まだまだ' },
  { threshold: 1e100,   label: '1e100',   title: '中級者' },
  { threshold: 1e110,   label: '1e110',   title: '上級者への道' },
  { threshold: 1e120,   label: '1e120',   title: 'ベテラン' },
  { threshold: 1e130,   label: '1e130',   title: '達人' },
  { threshold: 1e140,   label: '1e140',   title: '熟練者' },
  { threshold: 1e150,   label: '1e150',   title: '極めし者' },
  { threshold: 1e160,   label: '1e160',   title: '超越' },
  { threshold: 1e170,   label: '1e170',   title: '限界突破' },
  { threshold: 1e180,   label: '1e180',   title: '次元越え' },
  { threshold: 1e190,   label: '1e190',   title: '常識崩壊' },
  { threshold: 1e200,   label: '1e200',   title: '数の支配者' },
  { threshold: 1e210,   label: '1e210',   title: '宇宙規模' },
  { threshold: 1e220,   label: '1e220',   title: '銀河を超えて' },
  { threshold: 1e230,   label: '1e230',   title: '星々の彼方' },
  { threshold: 1e240,   label: '1e240',   title: '無限への階段' },
  { threshold: 1e250,   label: '1e250',   title: '時空を超える' },
  { threshold: 1e260,   label: '1e260',   title: '数学の夢' },
  { threshold: 1e270,   label: '1e270',   title: 'もはや概念' },
  { threshold: 1e280,   label: '1e280',   title: '観測不能' },
  { threshold: 1e290,   label: '1e290',   title: '最終領域' },
  { threshold: 1e300,   label: '1e300',   title: 'Infinity目前' }
];

const PARTICLE_ACHIEVEMENTS = PARTICLE_MILESTONES.map((m, i) => ({
  id: `particles_${i}_${m.label.replace(/\./g, 'p')}`,
  title: m.title,
  desc: `粒子が ${m.label} に到達した`,
  icon: '✨',
  points: 10,
  check: (game) => toDecimal(game.particles).gte(m.threshold)
}));

const ACHIEVEMENTS = [...ACHIEVEMENTS_BASE, ...PARTICLE_ACHIEVEMENTS];

function getDefaultAchievements() {
  const obj = {};
  ACHIEVEMENTS.forEach(a => { obj[a.id] = false; });
  return obj;
}

// --- チャレンジ定義（配列で管理・追加しやすい構造） ---
const CHALLENGES = [
  {
    id: 'slowSpeed',
    number: 1,
    title: 'スロースピード',
    effectLabel: 'PPS ×0.9',
    rewardLabel: 'PPS ×2',
    effectMult: 0.9,  // チャレンジ中のみ適用される生産倍率
    rewardMult: 2     // クリア後、永久に適用される生産倍率
  },
  {
    id: 'highCost',
    number: 2,
    title: '高コスト',
    effectLabel: 'Acceleratorコスト ×2',
    rewardLabel: 'Acceleratorコスト ×0.95',
    costMult: 2,        // チャレンジ中のみ適用されるコスト倍率（購入コストが上昇）
    costRewardMult: 0.95 // クリア後、永久に適用されるコスト倍率（購入コストが減少）
  }
];

function getDefaultChallengeState() {
  const completed = {};
  CHALLENGES.forEach(c => { completed[c.id] = false; });
  return { unlocked: false, active: null, completed };
}

// --- 初期ジェネレーター生成 ---
function getInitialGenerators() {
  return [
    { id: 0, name: "Accelerator Mk.1", baseCost: 10,   costMult: 2, amount: 0, bought: 0, production: 1, autoUnlocked: false, autoActive: true, unlocked: true },
    { id: 1, name: "Accelerator Mk.2", baseCost: 100,  costMult: 2, amount: 0, bought: 0, production: 1, autoUnlocked: false, autoActive: true, unlocked: false },
    { id: 2, name: "Accelerator Mk.3", baseCost: 1e3,  costMult: 2, amount: 0, bought: 0, production: 1, autoUnlocked: false, autoActive: true, unlocked: false },
    { id: 3, name: "Accelerator Mk.4", baseCost: 1e4,  costMult: 2, amount: 0, bought: 0, production: 1, autoUnlocked: false, autoActive: true, unlocked: false },
    { id: 4, name: "Accelerator Mk.5", baseCost: 1e6,  costMult: 2, amount: 0, bought: 0, production: 1, autoUnlocked: false, autoActive: true, unlocked: false },
    { id: 5, name: "Accelerator Mk.6", baseCost: 1e8,  costMult: 2, amount: 0, bought: 0, production: 1, autoUnlocked: false, autoActive: true, unlocked: false },
    { id: 6, name: "Accelerator Mk.7", baseCost: 1e10, costMult: 2, amount: 0, bought: 0, production: 1, autoUnlocked: false, autoActive: true, unlocked: false },
    { id: 7, name: "Accelerator Mk.8", baseCost: 1e12, costMult: 2, amount: 0, bought: 0, production: 1, autoUnlocked: false, autoActive: true, unlocked: false }
  ];
}

// --- 初期データ構造 ---
function getInitialState() {
  return {
    particles: new Decimal(10),
    linacs: 0, 
    shifts: 0, 
    unlocks: {
      linac: false, // 一度でも到達したらtrue
    },
    stats: {
      startTime: Date.now(),
      totalParticles: new Decimal(10),
      totalLinacs: 0,
      totalTimePlayed: 0,
      highestParticles: new Decimal(10),
      highestPPS: 0,
      totalMkPurchased: [0, 0, 0, 0, 0, 0, 0, 0],
      shortestLinacTime: null,
      bestLinacMultiplier: 0,
      lastLinacCycleStart: Date.now()
    },
    infinity: {
      ip: new Decimal(0),
      crunchCount: 0,
      bestTime: null,
      upgrades: [],
      levels: {},
      broken: false
    },
    settings: {
      notation: 'sci',
      buyAmount: 1,
      skipLinacConf: false,
      skipShiftConf: false,
      skipCrunchAnim: false,
      glitchEffect: true,
      sfxEnabled: true,
      bgmEnabled: true
    },
    achievements: getDefaultAchievements(),
    achievementPoints: 0,
    lastSaveTime: Date.now(),
    timeFlux: { time: 0, speed: 1, capLevel: 0 },
    challenge: getDefaultChallengeState(),
    breakInfinity: (typeof getDefaultBreakInfinityState === 'function') ? getDefaultBreakInfinityState() : { unlocked: false },
    lastTick: Date.now(),
    autobuyerTimer: 0,
    generators: getInitialGenerators()
  };
}

let game = getInitialState();
let isCrunching = false;
let currentPPSValue = 0; // 統計画面「現在のPPS」表示用キャッシュ
let offlineSimulating = false; // オフライン進行の一括シミュレーション中はtrue（通知・重いDOM更新を抑制する）

// 効果音再生の共通窓口（オフライン進行シミュレーション中は鳴らさない）
function playSE(name) {
  if (offlineSimulating) return;
  if (typeof AudioSystem !== 'undefined') AudioSystem.playSE(name);
}

// --- ユーティリティ ---
function format(num) {
  if (num === undefined || num === null) return "0.00";

  // Decimal（break_infinity.js）インスタンスの場合の専用処理
  if (typeof Decimal !== 'undefined' && num instanceof Decimal) {
    if (Number.isNaN(num.mantissa) || Number.isNaN(num.exponent)) return "0.00";
    if (num.exponent < 300) {
      // 通常範囲: numberに変換して以下の既存ロジックへ委譲
      num = num.toNumber();
    } else {
      // 1e300超: mantissa/exponentから直接、常に科学的記法で表示する
      return `${num.mantissa.toFixed(2)}e${num.exponent}`;
    }
  }

  if (isNaN(num)) return "0.00";
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

// Decimalライブラリには整数乗のpowが無いため、log10空間で計算するヘルパーを用意する
// （base自体は通常サイズのnumberでよい。nが非常に大きくてもオーバーフローしない）
function decimalPowInt(base, n) {
  if (n <= 0) return new Decimal(1);
  const totalLog = n * Math.log10(base);
  const exponent = Math.floor(totalLog);
  const mantissa = Math.pow(10, totalLog - exponent);
  return Decimal.fromMantissaExponent(mantissa, exponent);
}

// --- 計算ロジック ---

// コスト補正: 通常コスト → Infinityコスト補正 → Challengeコスト補正 の順で適用
function getInfinityCostMultiplier() {
  // 現状Infinity側のコスト補正アップグレードは無いが、将来の拡張用フック
  return 1;
}

function getChallengeCostMultiplier() {
  // チャレンジ中のみ適用される一時的なコスト倍率
  if (game.challenge && game.challenge.active) {
    const c = CHALLENGES.find(ch => ch.id === game.challenge.active);
    if (c && c.costMult) return c.costMult;
  }
  return 1;
}

function getChallengeCostRewardMultiplier() {
  // クリア済みチャレンジによる永久コスト倍率（チャレンジごとに乗算、重複取得不可）
  let mult = 1;
  if (game.challenge && game.challenge.completed) {
    CHALLENGES.forEach(c => {
      if (game.challenge.completed[c.id] && c.costRewardMult) mult *= c.costRewardMult;
    });
  }
  return mult;
}

function getTotalCostMultiplier() {
  return getInfinityCostMultiplier() * getChallengeCostMultiplier() * getChallengeCostRewardMultiplier();
}

// 単価計算: purchaseIndex(1始まり)番目の1個の価格。
// 1〜9個目ごとの上昇は costMult(通常×2)、10個目ごとの上昇だけ×100（×2は掛けない）。
// numberで安全に計算できるうちはnumberで返し、オーバーフローする規模になったら
// （買い過ぎて桁数が莫大になっても値段がInfinityになって買えなくならないよう）
// Decimalで計算して返す。
function getUnitCost(gen, purchaseIndex) {
  const m = purchaseIndex;
  const milestones = Math.floor(m / 10);           // これまでに跨いだ10の位の回数
  const totalSteps = m - 1;                          // 1個目から数えた合計の価格上昇回数
  const normalSteps = totalSteps - milestones;       // 通常倍率(×2)が適用される回数
  const milestoneMult = 100;

  // 2^900 ≈ 8.6e270、100^130 = 1e260。この範囲ならnumberでもオーバーフローしない。
  if (normalSteps < 900 && milestones < 130) {
    const cost = gen.baseCost * Math.pow(gen.costMult, normalSteps) * Math.pow(milestoneMult, milestones);
    if (isFinite(cost)) return cost;
  }
  // オーバーフローする規模: Decimalで計算する
  const normalPart = decimalPowInt(gen.costMult, normalSteps);
  const milestonePart = decimalPowInt(milestoneMult, milestones);
  return normalPart.mul(milestonePart).mul(gen.baseCost);
}

// 指定した個数(count)ちょうどを購入する場合の合計コスト（所持数に関係なく計算）
function getBulkCost(gen, count) {
  let total = 0;
  for (let i = 1; i <= count; i++) {
    const uc = getUnitCost(gen, gen.bought + i);
    total = amtAdd(total, uc);
  }
  const mult = getTotalCostMultiplier();
  return (total instanceof Decimal) ? total.mul(mult) : total * mult;
}

// 次の1個を購入する価格
function getCost(gen) {
  const uc = getUnitCost(gen, gen.bought + 1);
  const mult = getTotalCostMultiplier();
  return (uc instanceof Decimal) ? uc.mul(mult) : uc * mult;
}

// 所持粒子で実際に購入可能な数量とその合計コストを求める（maxCountを上限とする）
// 不足している場合は購入可能な分だけ返す。
function calculateAffordablePurchase(gen, maxCount) {
  const costMultiplier = getTotalCostMultiplier();
  const particles = toDecimal(game.particles);
  let count = 0;
  let totalCost = 0;
  while (count < maxCount) {
    let unitCost = getUnitCost(gen, gen.bought + count + 1);
    unitCost = (unitCost instanceof Decimal) ? unitCost.mul(costMultiplier) : unitCost * costMultiplier;

    const nextTotal = amtAdd(totalCost, unitCost);
    if (particles.lt(nextTotal)) break;
    totalCost = nextTotal;
    count++;
  }
  return { count, cost: totalCost };
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

function getUpgradeLevel(id) {
  if (!game.infinity) return 0;
  if (!game.infinity.levels) game.infinity.levels = {};
  return game.infinity.levels[id] || 0;
}

function getUpgradeCost(up) {
  if (!up.leveled) return up.cost;
  const level = getUpgradeLevel(up.id);
  return up.baseCost * Math.pow(2, level);
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
  const level = getUpgradeLevel(upgradeId);
  if (level <= 0) return 1;
  const gen = game.generators[genIndex];
  const prod = (gen && gen.production > 0) ? gen.production : 1;
  const exponent = 1 + level * 0.1;
  return Math.pow(prod, exponent - 1);
}

function getChallengeMultiplier() {
  // チャレンジ中のみ適用される一時的な倍率
  if (game.challenge && game.challenge.active) {
    const c = CHALLENGES.find(ch => ch.id === game.challenge.active);
    if (c && c.effectMult) return c.effectMult;
  }
  return 1;
}

function getChallengeRewardMultiplier() {
  // クリア済みチャレンジによる永久倍率（重複取得可、チャレンジごとに乗算）
  let mult = 1;
  if (game.challenge && game.challenge.completed) {
    CHALLENGES.forEach(c => {
      if (game.challenge.completed[c.id] && c.rewardMult) mult *= c.rewardMult;
    });
  }
  return mult;
}

function getGlobalMultiplier() {
  return getLinacMultValue() * getGlobalInfinityMultValue() * getChallengeMultiplier() * getChallengeRewardMultiplier();
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
// ゲームの1ティック分の計算のみを行う（DOM更新は含まない）。
// 通常のgameLoop・オフライン進行・Time Warpのすべてがこの関数を共有することで
// 計算コードの重複を避ける。
function simulateTick(dt) {
  if (!game.stats.totalTimePlayed) game.stats.totalTimePlayed = 0;
  game.stats.totalTimePlayed += dt;

  game.particles = toDecimal(game.particles);
  if (Number.isNaN(game.particles.mantissa) || Number.isNaN(game.particles.exponent)) game.particles = new Decimal(10);

  const breakActive = (typeof isBreakInfinityActive === 'function' && isBreakInfinityActive());
  INFINITY_LIMIT = breakActive ? 1e999 : 1.79e308;

  if (game.particles.gte(INFINITY_LIMIT) && !breakActive) {
    triggerBigCrunch();
    return;
  }

  if (!offlineSimulating) updateGlitchEffect();
  const globalMult = getGlobalMultiplier();
  
  game.generators.forEach((gen, i) => {
    const genInfMult = getPerGenInfMult(i);

    // amountが閾値を超えていたら、オーバーフローする前にDecimalへ昇格しておく。
    // （オーバーフロー後に変換すると桁数の情報が失われ、表示が1.78e308から
    // いきなり巨大な指数へ飛んでしまうため、必ず「壊れる前」に昇格させる）
    if (!(gen.amount instanceof Decimal) && typeof gen.amount === 'number' && gen.amount > OVERFLOW_SAFE_THRESHOLD) {
      gen.amount = new Decimal(gen.amount);
    }
    const amountIsDecimal = gen.amount instanceof Decimal;

    if (i === 0) {
      let produced;
      if (amountIsDecimal) {
        // Decimal同士の演算は指数を加算するだけなので、オーバーフローせず滑らかに成長する
        const dPps = toDecimal(gen.amount).mul(gen.production).mul(globalMult).mul(genInfMult);
        produced = dPps.mul(dt);
      } else {
        let pps = gen.amount * gen.production * globalMult * genInfMult;
        if (!isFinite(pps)) {
          // 通常のnumber演算がオーバーフローした場合（amount自体は閾値未満だが、
          // 掛け算の結果だけがオーバーフローしたレアケース）。
          // Break Infinity解放後はDecimalとして計算し直し、未解放時は頭打ちにする。
          produced = breakActive
            ? toDecimal(gen.amount).mul(gen.production).mul(globalMult).mul(genInfMult).mul(dt)
            : new Decimal(1.79e308 * dt);
        } else {
          produced = new Decimal(pps * dt);
        }
      }
      if (!Number.isNaN(produced.mantissa)) {
        game.particles = game.particles.add(produced);
        game.stats.totalParticles = toDecimal(game.stats.totalParticles).add(produced);
      }
    } else {
      const target = game.generators[i - 1];
      if (amountIsDecimal) {
        const dAdd = toDecimal(gen.amount).mul(gen.production).mul(globalMult).mul(genInfMult).mul(dt);
        target.amount = amtAdd(target.amount, dAdd);
      } else {
        const amountToAdd = gen.amount * gen.production * globalMult * genInfMult * dt;
        if (!isNaN(amountToAdd) && isFinite(amountToAdd)) {
          target.amount = amtAdd(target.amount, amountToAdd);
        } else if (breakActive) {
          // オーバーフロー発生時はDecimalで計算し直す
          const dAdd = toDecimal(gen.amount).mul(gen.production).mul(globalMult).mul(genInfMult).mul(dt);
          target.amount = amtAdd(target.amount, dAdd);
        }
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
    if (amtGte(game.generators[7].amount, linacReq) || game.stats.totalLinacs > 0 || game.shifts > 0 || game.infinity.crunchCount > 0) {
      game.unlocks.linac = true;
    }
  }

  // PPS再計算（表示用）
  const g0 = game.generators[0];
  const g0Inf = getPerGenInfMult(0);
  let currentPPS;
  if (g0.amount instanceof Decimal) {
    currentPPS = toDecimal(g0.amount).mul(g0.production).mul(globalMult).mul(g0Inf).toNumber();
  } else {
    currentPPS = g0.amount * g0.production * globalMult * g0Inf;
  }
  if(!isFinite(currentPPS) || currentPPS > 1.79e308) currentPPS = 1.79e308;
  currentPPSValue = currentPPS;

  // 統計: 最高PPS・最高粒子数（値が変化した瞬間に更新）
  game.stats.highestParticles = toDecimal(game.stats.highestParticles);
  if (game.particles.gt(game.stats.highestParticles)) game.stats.highestParticles = game.particles;
  if (currentPPS > (game.stats.highestPPS || 0)) game.stats.highestPPS = currentPPS;
}

function gameLoop() {
  requestAnimationFrame(gameLoop);
  if (isCrunching || offlineSimulating) return;

  const now = Date.now();
  let dt = (now - game.lastTick) / 1000;
  if (dt > 1) dt = 1; 
  game.lastTick = now;

  // Time Flux（TF）によるゲーム速度の加速。TFを消費している間だけ倍速になる。
  let effectiveDt = dt;
  if (typeof applyTimeFlux === 'function') {
    effectiveDt = applyTimeFlux(dt);
  }

  simulateTick(effectiveDt);

  const wrapper = document.getElementById('app-wrapper');
  if (wrapper && !wrapper.classList.contains('closed')) {
    updateUI(currentPPSValue);
    updateStats();
    updateInfinityTab();
    updateAutomationTab();
    updateSkipToggleVisibility();
    if (typeof updateBreakInfinityTab === 'function') updateBreakInfinityTab();
    if (typeof updateBreakInfinityUnlockSection === 'function') updateBreakInfinityUnlockSection();
    if (typeof updateTimeFluxTab === 'function') updateTimeFluxTab();
  } else {
    updateUI(currentPPSValue);
  }
  
  if (now % 10000 < 20) saveGame(true);
}

// --- アクション ---
function runAutobuyers() {
  game.generators.forEach((gen, index) => {
    if (!gen.unlocked) return; // 未解放のAcceleratorは自動購入もしない

    const threshold = Number('1e' + (50 + index * 10));
    if (!gen.autoUnlocked && game.particles.gte(threshold)) {
      gen.autoUnlocked = true;
    }
    if (gen.autoUnlocked && gen.autoActive) {
      for(let k=0; k<10; k++) {
        const cost = getCost(gen);
        if (game.particles.gte(cost)) {
          game.particles = toDecimal(game.particles).sub(cost);
          gen.amount = amtAdd(gen.amount, 1);
          gen.bought++;
          gen.production *= 1.1;
          if (!game.stats.totalMkPurchased) game.stats.totalMkPurchased = [0,0,0,0,0,0,0,0];
          game.stats.totalMkPurchased[index] = (game.stats.totalMkPurchased[index] || 0) + 1;
        } else {
          break;
        }
      }
      revealNextGenerator(index);
    }
  });
  checkAchievements();
}

function toggleAutobuyer(index) {
  const gen = game.generators[index];
  if (!gen.autoUnlocked) return;
  gen.autoActive = !gen.autoActive;
  updateUI(0);
}

const BUY_MAX_SAFETY_CAP = 10000; // 最大購入時の安全上限（コスト急上昇のため実質到達しない想定）

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
  saveGame(true);
  showNotification('設定を保存しました', '', '⚙️');
}

// 現在選択中の購入数(1/10/100/'max')に応じて、実際に購入可能な数量だけ購入する。
// 不足している場合は購入可能な分だけ購入する。
function buyGenerator(index) {
  const gen = game.generators[index];
  if (!gen.unlocked) return;

  const mode = game.settings.buyAmount;
  const cap = (mode === 'max') ? BUY_MAX_SAFETY_CAP : mode;
  const { count, cost } = calculateAffordablePurchase(gen, cap);
  if (count <= 0) return;

  game.particles = toDecimal(game.particles).sub(cost);
  gen.amount = amtAdd(gen.amount, count);
  gen.bought += count;
  gen.production *= Math.pow(1.1, count);
  if (!game.stats.totalMkPurchased) game.stats.totalMkPurchased = [0,0,0,0,0,0,0,0];
  game.stats.totalMkPurchased[index] = (game.stats.totalMkPurchased[index] || 0) + count;

  revealNextGenerator(index);

  playSE('buy');
  updateUI(0);
  checkAchievements();
}

// 購入数の選択に関わらず、常に購入可能な最大数を購入する（'M'キーボードショートカット用）
function buyMaxGenerator(index) {
  const gen = game.generators[index];
  if (!gen || !gen.unlocked) return;

  const { count, cost } = calculateAffordablePurchase(gen, BUY_MAX_SAFETY_CAP);
  if (count <= 0) return;

  game.particles = toDecimal(game.particles).sub(cost);
  gen.amount = amtAdd(gen.amount, count);
  gen.bought += count;
  gen.production *= Math.pow(1.1, count);
  if (!game.stats.totalMkPurchased) game.stats.totalMkPurchased = [0,0,0,0,0,0,0,0];
  game.stats.totalMkPurchased[index] = (game.stats.totalMkPurchased[index] || 0) + count;

  revealNextGenerator(index);

  playSE('buy');
  updateUI(0);
  checkAchievements();
}

// Mk.n を1個以上購入したら Mk.(n+1) を解放する
function revealNextGenerator(index) {
  const gen = game.generators[index];
  const next = game.generators[index + 1];
  if (gen && amtGte(gen.amount, 1) && next && !next.unlocked) {
    next.unlocked = true;
    renderGeneratorRow(index + 1);
  }
}

function doLinac() {
  const req = getLinacReq();
  if (amtLt(game.generators[7].amount, req)) return;
  const currentBase = getLinacBaseMult();

  if (!game.settings.skipLinacConf) {
    showModal({
      title: 'ライナック',
      body: `ライナックを実行しますか？<br><br>倍率: <b>x${format(currentBase)}</b><br><br>粒子とAcceleratorがリセットされます。`,
      buttons: [
        { label: 'キャンセル', onClick: closeModal },
        { label: 'OK', primary: true, onClick: () => { closeModal(); executeLinac(); } }
      ]
    });
    return;
  }
  executeLinac();
}

function executeLinac() {
  game.linacs = (game.linacs || 0) + 1;
  game.stats.totalLinacs = (game.stats.totalLinacs || 0) + 1;
  const newMult = getLinacBaseMult();

  // 統計: Linac最高倍率 / 最短Linac時間
  if (newMult > (game.stats.bestLinacMultiplier || 0)) {
    game.stats.bestLinacMultiplier = newMult;
  }
  const cycleStart = game.stats.lastLinacCycleStart || game.stats.startTime || Date.now();
  const cycleTime = Date.now() - cycleStart;
  if (game.stats.shortestLinacTime == null || cycleTime < game.stats.shortestLinacTime) {
    game.stats.shortestLinacTime = cycleTime;
  }
  game.stats.lastLinacCycleStart = Date.now();

  game.particles = new Decimal(10);
  game.generators.forEach(gen => {
    gen.amount = 0;
    gen.bought = 0;
    gen.production = 1; 
  });
  
  // アンロックフラグ維持
  game.unlocks.linac = true; 

  saveGame();
  updateUI(0);
  showNotification('ライナックしました', `倍率 x${format(newMult)}`, '🌌');
  playSE('linac');
  checkAchievements();
}

function doLinacShift() {
  const shiftReq = getShiftReq();
  if ((game.linacs || 0) < shiftReq) return;
  const currentBase = getLinacBaseMult();
  const nextBase = currentBase + 0.2;

  if (!game.settings.skipShiftConf) {
    showModal({
      title: 'ライナック・シフト',
      body: `【警告】シフトを実行しますか？<br><br>倍率: x${format(currentBase)} → <b>x${format(nextBase)}</b><br><br>ライナックと全ての進捗がリセットされます。`,
      buttons: [
        { label: 'キャンセル', onClick: closeModal },
        { label: 'OK', primary: true, danger: true, onClick: () => { closeModal(); executeLinacShift(nextBase); } }
      ]
    });
    return;
  }
  executeLinacShift(nextBase);
}

function executeLinacShift(nextBase) {
  game.shifts = (game.shifts || 0) + 1;
  game.linacs = 0;
  game.stats.lastLinacCycleStart = Date.now();
  game.particles = new Decimal(10);
  game.generators.forEach(gen => {
    gen.amount = 0;
    gen.bought = 0;
    gen.production = 1; 
  });
  
  game.unlocks.linac = true; 

  saveGame();
  updateUI(0);
  showNotification('シフトしました', `倍率 x${format(nextBase)}`, '🔄');
  playSE('shift');
  checkAchievements();
  
  if (!game.settings.skipShiftConf) {
    showModal({
      title: 'シフト完了',
      body: `現在の倍率: <b>x${format(nextBase)}</b>`,
      buttons: [ { label: 'OK', primary: true, onClick: closeModal } ]
    });
  }
}

// --- Infinity Logic ---
function buyInfinityUpgrade(id) {
  const upgrade = INF_UPGRADES.find(u => u.id === id);
  if (!upgrade) return;

  const currentIP = getIP();

  if (!upgrade.leveled) {
    // 単発購入（時間膨張など）
    if (hasUpgrade(id)) return;
    if (currentIP.gte(upgrade.cost)) {
      game.infinity.ip = currentIP.sub(upgrade.cost);
      if (!game.infinity.upgrades) game.infinity.upgrades = [];
      game.infinity.upgrades.push(id);
      saveGame();
      updateUI(0);
      updateInfinityTab();
    }
    return;
  }

  // レベル制購入（購入毎にコストが2倍）
  const cost = getUpgradeCost(upgrade);
  if (currentIP.gte(cost)) {
    game.infinity.ip = currentIP.sub(cost);
    if (!game.infinity.levels) game.infinity.levels = {};
    game.infinity.levels[id] = (game.infinity.levels[id] || 0) + 1;
    saveGame();
    updateUI(0);
    updateInfinityTab();
  }
}

// --- UI更新 ---
function updateUI(pps) {
  const pDisplay = document.getElementById('particle-display');
  if(pDisplay) pDisplay.textContent = `${format(game.particles)} 粒子`;
  
  const ppsDisplay = document.getElementById('pps-display');
  if(ppsDisplay) ppsDisplay.textContent = `(+${format(pps)} /秒)`;

  updateAutomationSectionVisibility();
  updateChallengeSectionVisibility();
  const ipContainer = document.getElementById('ip-display-container');
  const infTabBtn = document.getElementById('tab-btn-infinity');
  const hasReachedInfinity = game.infinity && (game.infinity.crunchCount > 0 || getIP().gt(0));

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

  // ★ ライナック・インラインコントロール表示制御 ★
  const pContainer = document.getElementById('prestige-container');
  const linacReq = getLinacReq();
  const shiftReq = getShiftReq();
  const baseMult = getLinacBaseMult();

  if (pContainer) {
    // unlocks.linacがtrueなら常時表示
    if (game.unlocks && game.unlocks.linac) {
      pContainer.style.display = 'flex';

      const multInlineEl = document.getElementById('linac-mult-inline');
      if (multInlineEl) multInlineEl.textContent = `x${format(baseMult)}`;

      const btnLinac = document.getElementById('btn-linac');
      if (btnLinac) {
        btnLinac.textContent = 'ライナック';
        if (amtGte(game.generators[7].amount, linacReq)) {
          btnLinac.classList.remove('disabled');
          btnLinac.title = `倍率 x${format(baseMult)} でリセット`;
          btnLinac.onclick = doLinac;
        } else {
          btnLinac.classList.add('disabled');
          btnLinac.title = `Mk.8 が ${linacReq}個 必要`;
          btnLinac.onclick = null;
        }
      }

      const btnShift = document.getElementById('btn-shift');
      if (btnShift) {
        if (game.linacs >= shiftReq) {
          btnShift.style.display = 'inline-block';
          const nextBase = baseMult + 0.2;
          btnShift.textContent = 'シフト';
          btnShift.title = `次倍率 x${format(nextBase)}（全リセット）`;
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
  const challengeMult = getChallengeMultiplier() * getChallengeRewardMultiplier();

  game.generators.forEach((gen, index) => {
    const btn = document.getElementById(`btn-${index}`);
    if (!btn) return; 

    const autoBadge = document.getElementById(`auto-badge-${index}`);
    if (autoBadge) {
      autoBadge.className = 'auto-badge'; 
      autoBadge.onclick = null;
      if (gen.autoUnlocked) {
        autoBadge.classList.add('clickable');
        autoBadge.onclick = () => toggleAutobuyer(index);
        if (gen.autoActive) {
          autoBadge.classList.add('active');
          autoBadge.textContent = "自動: ON";
        } else {
          autoBadge.classList.add('inactive');
          autoBadge.textContent = "自動: OFF";
        }
      } else {
        const th = Number('1e' + (50 + index * 10));
        autoBadge.textContent = `必要: ${format(th)}`;
      }
    }

    const amtEl = document.getElementById(`amount-${index}`);
    if(amtEl) amtEl.textContent = `所持: ${format(gen.amount)}`;

    const perGenMult = getPerGenInfMult(index);
    const totalInfMult = globalInfMult * perGenMult;
    const totalGenMult = gen.production * currentLinacMult * totalInfMult * challengeMult;
    
    const multEl = document.getElementById(`mult-${index}`);
    if(multEl) multEl.textContent = `x${format(totalGenMult)}`;

    const linacEl = document.getElementById(`mult-linac-${index}`);
    if (linacEl) {
        if (currentLinacMult > 1) {
            linacEl.style.display = 'block';
            linacEl.textContent = `[ライナック: x${format(currentLinacMult)}]`;
        } else {
            linacEl.style.display = 'none';
        }
    }

    const infEl = document.getElementById(`mult-inf-${index}`);
    if (infEl) {
        if (totalInfMult > 1) {
            infEl.style.display = 'block'; 
            infEl.textContent = `[Infinity強化: x${format(totalInfMult)}]`;
        } else {
            infEl.style.display = 'none';
        }
    }

    const challengeEl = document.getElementById(`mult-challenge-${index}`);
    if (challengeEl) {
        // チャレンジ中、またはいずれかのチャレンジを達成した後にのみ表示する
        const hasChallengeRelevance = !!(game.challenge && (
          game.challenge.active !== null ||
          (game.challenge.completed && Object.values(game.challenge.completed).some(v => v))
        ));
        if (hasChallengeRelevance) {
          challengeEl.style.display = 'block';
          challengeEl.textContent = `[Challenge: x${format(challengeMult)}]`;
        } else {
          challengeEl.style.display = 'none';
        }
    }

    // 購入ボタン: 選択中のモード(1/10/100/max)に応じたラベルと有効/無効状態
    const mode = game.settings.buyAmount;
    const cap = (mode === 'max') ? BUY_MAX_SAFETY_CAP : mode;
    const { count: affordableCount, cost: affordableCost } = calculateAffordablePurchase(gen, cap);

    if (mode === 'max') {
      if (affordableCount > 0) {
        btn.textContent = `${format(affordableCount)}個: ${format(affordableCost)}`;
        btn.classList.remove('disabled');
      } else {
        btn.textContent = '購入不可';
        btn.classList.add('disabled');
      }
    } else {
      // x1/x10/x100は常に目標数量分の価格を表示し、不足時はボタンのみ無効化する
      // （実際のクリック時は購入可能な分だけ購入される）
      const fullCost = getBulkCost(gen, mode);
      btn.textContent = `${mode}個: ${format(fullCost)}`;
      if (affordableCount > 0) btn.classList.remove('disabled'); else btn.classList.add('disabled');
    }
  });
}

function updateStats() {
  const currentRunTime = (Date.now() - game.stats.startTime) / 1000;
  document.getElementById('stat-time').textContent = `${formatTime(currentRunTime)}`;
  document.getElementById('stat-total-playtime').textContent = formatTime(game.stats.totalTimePlayed || 0);
  document.getElementById('stat-total').textContent = format(game.stats.totalParticles);
  document.getElementById('stat-current-pps').textContent = `${format(currentPPSValue)} /秒`;
  document.getElementById('stat-highest-pps').textContent = `${format(game.stats.highestPPS || 0)} /秒`;
  document.getElementById('stat-highest-particles').textContent = format(game.stats.highestParticles || 0);

  const statPrestige = document.getElementById('stat-prestige');
  const rowPrestige = document.getElementById('row-prestige');
  if (game.stats.totalLinacs > 0 && statPrestige && rowPrestige) {
    rowPrestige.style.display = 'flex';
    statPrestige.textContent = `${game.stats.totalLinacs} 回`;
  }

  const statShortestLinac = document.getElementById('stat-shortest-linac');
  const rowShortestLinac = document.getElementById('row-shortest-linac');
  if (game.stats.shortestLinacTime != null && statShortestLinac && rowShortestLinac) {
    rowShortestLinac.style.display = 'flex';
    statShortestLinac.textContent = formatTime(game.stats.shortestLinacTime / 1000);
  }

  const statBestLinacMult = document.getElementById('stat-best-linac-mult');
  const rowBestLinacMult = document.getElementById('row-best-linac-mult');
  if ((game.stats.bestLinacMultiplier || 0) > 0 && statBestLinacMult && rowBestLinacMult) {
    rowBestLinacMult.style.display = 'flex';
    statBestLinacMult.textContent = `x${format(game.stats.bestLinacMultiplier)}`;
  }

  const statShift = document.getElementById('stat-shift');
  const rowShift = document.getElementById('row-shift');
  if (game.shifts > 0 && statShift && rowShift) {
    rowShift.style.display = 'flex';
    statShift.textContent = `${game.shifts} 回`;
  }

  // Accelerator 累計購入数（初回に一覧を構築し、以降は値のみ更新）
  const accelList = document.getElementById('accel-stats-list');
  if (accelList) {
    if (!accelList.dataset.initialized) {
      accelList.dataset.initialized = '1';
      game.generators.forEach((gen, i) => {
        const row = document.createElement('div');
        row.className = 'stat-row';
        const mkLabel = gen.name.replace('Accelerator ', '');
        row.innerHTML = `<span class="stat-label">総${mkLabel}購入数</span><span id="stat-mk-${i}" class="stat-val">0</span>`;
        accelList.appendChild(row);
      });
    }
    const totals = game.stats.totalMkPurchased || [];
    game.generators.forEach((gen, i) => {
      const el = document.getElementById(`stat-mk-${i}`);
      if (el) el.textContent = format(totals[i] || 0);
    });
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
  if(el) el.textContent = format(getIP());

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
            <div class="inf-desc">${up.title}${up.leveled ? '' : `: ${up.desc}`}</div>
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

      const currentIP = getIP();
      const cost = getUpgradeCost(up);
      const effectEl = btn.querySelector('.inf-effect-val');
      const costEl = btn.querySelector('.inf-cost');

      if (!up.leveled) {
        // 単発購入（時間膨張など）
        const bought = hasUpgrade(up.id);
        if (bought) {
          btn.classList.add('bought');
          btn.classList.remove('disabled');
        } else {
          btn.classList.remove('bought');
          btn.classList.toggle('disabled', currentIP.lt(cost));
        }

        let currentEffect = 1;
        try { currentEffect = up.effect(game); } catch(e){}

        if (effectEl) effectEl.textContent = `現在の効果: ${up.formatEffect(currentEffect)}`;
        if (costEl) costEl.textContent = bought ? '購入済み' : 'コスト: ' + format(cost) + ' IP';
      } else {
        // レベル制購入（何度でも購入可能・コストは購入毎に2倍）
        const level = getUpgradeLevel(up.id);
        btn.classList.remove('bought');
        btn.classList.toggle('disabled', currentIP.lt(cost));

        let currentEffect = 1, nextEffect = 1;
        try { currentEffect = up.effect(game); } catch(e){}
        try { nextEffect = up.nextEffect(game); } catch(e){}

        if (effectEl) {
          effectEl.innerHTML = `Lv.${level}　現在：${up.formatEffect(currentEffect)}　次：${up.formatEffect(nextEffect)}`;
        }
        if (costEl) costEl.textContent = 'コスト: ' + format(cost) + ' IP';
      }
    });
  }
}

function updateGlitchEffect() {
  const overlay = document.getElementById('glitch-layer');
  if (!overlay) return;

  // 設定でOFFにされている場合は常に無効化する
  if (game.settings && game.settings.glitchEffect === false) {
    document.body.classList.remove('glitched');
    overlay.style.opacity = 0;
    return;
  }

  const particles = toDecimal(game.particles);
  if (particles.lt(1e250)) {
    document.body.classList.remove('glitched');
    overlay.style.opacity = 0;
    return;
  }
  const logP = particles.log10();
  const intensity = (logP - 250) / (308 - 250); 
  if (intensity > 0) {
    document.body.classList.add('glitched');
    overlay.style.opacity = Math.min(intensity, 1) * 0.8;
  }
}

// --- ビッグ・クランチ ---
function triggerBigCrunch() {
  if (isCrunching) return;
  const startTime = (game.stats && game.stats.startTime) ? game.stats.startTime : Date.now();
  const currentTime = Date.now() - startTime;
  
  if (!game.infinity) game.infinity = { ip: new Decimal(0), crunchCount:0, bestTime:null, upgrades:[], broken:false };
  
  let gainedIP = Math.pow(2, getUpgradeLevel(9));
  game.infinity.ip = getIP().add(gainedIP);
  game.infinity.crunchCount = (game.infinity.crunchCount || 0) + 1;
  if (game.infinity.bestTime === null || currentTime < game.infinity.bestTime) {
    game.infinity.bestTime = currentTime;
  }

  // チャレンジタブの解放判定（Big Crunch 5回以上）
  if (!game.challenge) game.challenge = getDefaultChallengeState();
  if (!game.challenge.unlocked && game.infinity.crunchCount >= 5) {
    game.challenge.unlocked = true;
  }

  // Big Crunchした瞬間にチャレンジクリア
  if (game.challenge.active) {
    const clearedId = game.challenge.active;
    const c = CHALLENGES.find(ch => ch.id === clearedId);
    if (c) {
      if (!game.challenge.completed) game.challenge.completed = {};
      game.challenge.completed[clearedId] = true;
      game.challenge.active = null;
      showNotification('Challenge Complete!', `${c.title}クリア！<br>永久効果: ${c.rewardLabel}`, '🏅', 'achievement');
      playSE('achievement');
      updateChallengeTab();
    } else {
      game.challenge.active = null;
    }
  }
  
  playSE('crunch');

  if (game.settings.skipCrunchAnim || offlineSimulating) {
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
    showModal({
      title: 'BIG CRUNCH 完了',
      body: `宇宙が生まれ変わりました。<br><br>獲得 IP: <b>+${format(gainedIP)}</b><br>所持 IP: <b>${format(game.infinity.ip)}</b>`,
      buttons: [ { label: 'OK', primary: true, onClick: closeModal } ]
    });
  }, 8500);
}

function performInfinityReset() {
  // Automation（オートバイヤーのON/OFF・解放状態）はBig Crunchでもリセットしない
  const preservedAuto = game.generators.map(g => ({
    autoUnlocked: g.autoUnlocked,
    autoActive: g.autoActive
  }));

  game.particles = new Decimal(10);
  game.linacs = 0;
  game.shifts = 0;
  game.stats.startTime = Date.now();
  game.stats.lastLinacCycleStart = Date.now();
  game.generators = getInitialGenerators().map((g, i) => ({
    ...g,
    autoUnlocked: preservedAuto[i] ? preservedAuto[i].autoUnlocked : g.autoUnlocked,
    autoActive: preservedAuto[i] ? preservedAuto[i].autoActive : g.autoActive
  }));
  // unlocksは維持する
  
  if (!offlineSimulating) {
    updateUI(0);
    updateStats();
    updateInfinityTab();
    updateAchievementsTab();
    document.body.classList.remove('glitched');
    saveGame();
  }
  checkAchievements();
  console.log("Universe Reborn.");
}

// --- セーブ・ロード ---
function saveGame(isAuto = false) {
  if(isCrunching && isAuto) return;
  game.lastTick = Date.now();
  game.lastSaveTime = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game));
    if (!isAuto) {
      const s = document.getElementById('save-status');
      if(s) {
        s.textContent = "保存しました";
        setTimeout(() => s.textContent = "オートセーブ有効 (10秒毎)", 2000);
      }
      showNotification('セーブしました', '', '💾');
      playSE('save');
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
      game.achievements = { ...getDefaultAchievements(), ...(parsed.achievements || {}) };
      game.achievementPoints = (typeof parsed.achievementPoints === 'number') ? parsed.achievementPoints : 0;
      game.lastSaveTime = (typeof parsed.lastSaveTime === 'number') ? parsed.lastSaveTime : Date.now();
      game.timeFlux = {
        time: (parsed.timeFlux && typeof parsed.timeFlux.time === 'number') ? parsed.timeFlux.time : 0,
        speed: (parsed.timeFlux && typeof parsed.timeFlux.speed === 'number') ? parsed.timeFlux.speed : 1,
        capLevel: (parsed.timeFlux && typeof parsed.timeFlux.capLevel === 'number') ? parsed.timeFlux.capLevel : 0
      };
      game.challenge = {
        ...getDefaultChallengeState(),
        ...(parsed.challenge || {}),
        completed: { ...getDefaultChallengeState().completed, ...((parsed.challenge && parsed.challenge.completed) || {}) }
      };
      game.breakInfinity = {
        ...getDefaultBreakInfinityState(),
        ...(parsed.breakInfinity || {})
      };
      // 旧システム（game.infinity.broken）からの移行: 突破済みなら新システムへ引き継ぐ
      if (parsed.infinity && parsed.infinity.broken) {
        game.breakInfinity.unlocked = true;
      }
      delete game.infinity.broken; // 旧フラグは廃止（Break Infinityはbreakinfinity.js側のみで管理する）

      // 粒子数はDecimal（break_infinity.js）で保持する。
      // 旧セーブ（数値）・新セーブ（{mantissa,exponent}）どちらからも復元できるようにする。
      game.particles = decimalFromSaved(parsed.particles, 10);
      game.stats.totalParticles = decimalFromSaved(parsed.stats && parsed.stats.totalParticles, 10);

      // Infinity Points（IP）もDecimalで保持し、1.78e308を超えて蓄積できるようにする
      game.infinity.ip = decimalFromSaved(parsed.infinity && parsed.infinity.ip, 0);

      if (game.settings.skipLinacConf === undefined) game.settings.skipLinacConf = false;
      if (game.settings.skipShiftConf === undefined) game.settings.skipShiftConf = false;
      if (game.settings.skipCrunchAnim === undefined) game.settings.skipCrunchAnim = false;
      if (game.settings.glitchEffect === undefined) game.settings.glitchEffect = true;
      if (game.settings.sfxEnabled === undefined) game.settings.sfxEnabled = true;
      if (game.settings.bgmEnabled === undefined) game.settings.bgmEnabled = true;

      if (!game.stats.totalTimePlayed) game.stats.totalTimePlayed = 0;
      // 既存セーブの不足データを自動補完（統計拡張）
      game.stats.highestParticles = decimalFromSaved(parsed.stats && parsed.stats.highestParticles, 0);
      if (game.stats.highestParticles.lt(game.particles)) {
        game.stats.highestParticles = game.particles;
      }
      if (game.stats.highestPPS === undefined) game.stats.highestPPS = 0;
      if (!Array.isArray(game.stats.totalMkPurchased) || game.stats.totalMkPurchased.length !== 8) {
        // 累計購入数が無い古いセーブは、現在の所持数を初期値として補完する
        game.stats.totalMkPurchased = game.generators
          ? game.generators.map(g => {
              const a = g.amount;
              if (a && typeof a === 'object') return toDecimal(a).toNumber();
              return a || 0;
            })
          : [0,0,0,0,0,0,0,0];
      }
      if (game.stats.shortestLinacTime === undefined) game.stats.shortestLinacTime = null;
      if (game.stats.bestLinacMultiplier === undefined) game.stats.bestLinacMultiplier = 0;
      if (!game.stats.lastLinacCycleStart) game.stats.lastLinacCycleStart = game.stats.startTime || Date.now();

      if (!Array.isArray(game.infinity.upgrades)) game.infinity.upgrades = [];
      if (parsed.generators) {
        game.generators = parsed.generators.map((g, i) => {
          const freshGen = fresh.generators[i] || g;
          return { 
            ...freshGen, ...g,
            autoUnlocked: g.autoUnlocked !== undefined ? g.autoUnlocked : freshGen.autoUnlocked,
            autoActive: g.autoActive !== undefined ? g.autoActive : freshGen.autoActive
          };
        });

        // Accelerator解放状態のマイグレーション: 既存セーブに unlocked が無い場合、
        // 所持数や直前のMkの解放状況から推定して補完する（進行済みプレイヤーが
        // 突然Mk.1しか見えなくなることを防ぐ）
        game.generators.forEach((gen, i) => {
          const hadUnlockedField = parsed.generators[i] && parsed.generators[i].unlocked !== undefined;
          if (!hadUnlockedField) {
            if (i === 0) {
              gen.unlocked = true;
            } else {
              const prev = game.generators[i - 1];
              gen.unlocked = amtGt(gen.amount, 0) || !!(prev && (amtGt(prev.amount, 0) || prev.unlocked));
            }
          }
        });
      } else { game.generators = fresh.generators; }
      
      const notSel = document.getElementById('notation-select');
      if(notSel) notSel.value = game.settings.notation;
      setBuyAmount(game.settings.buyAmount);

      // 安全装置: 初期状態でアンロックがtrueになってしまっていたらfalseに戻す
      // (ただし、過去の統計データがある場合は許可)
      if (game.unlocks.linac) {
         const hasProgress = game.stats.totalLinacs > 0 || game.shifts > 0 || game.infinity.crunchCount > 0;
         if (!hasProgress && !amtGt(game.generators[7].amount, 0)) {
            game.unlocks.linac = false; // 強制修正
         }
      }

    } catch(e) { console.error("Save Load Error:", e); }
  }
}

function hardReset() {
  showModal({
    title: '完全初期化',
    body: '本当に全てのデータを消去しますか？<br><b>元に戻せません。</b>',
    buttons: [
      { label: 'キャンセル', onClick: closeModal },
      { label: '消去', primary: true, danger: true, onClick: () => {
          closeModal();
          localStorage.removeItem(SAVE_KEY);
          showNotification('リセットしました', '', '♻️');
          setTimeout(() => location.reload(), 600);
        } }
    ]
  });
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
    showNotification('ロードしました', '', '📂');
    setTimeout(() => location.reload(), 600);
  } catch(e) {
    showModal({
      title: 'エラー',
      body: 'データが無効です',
      buttons: [ { label: 'OK', primary: true, onClick: closeModal } ]
    });
  }
}

// --- ゲーム内モーダル（alert/confirmの代替） ---
function showModal({ title = '', body = '', buttons = [] } = {}) {
  const overlay = document.getElementById('game-modal-overlay');
  if (!overlay) return;

  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  const actionsEl = document.getElementById('modal-actions');

  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.innerHTML = body;

  if (actionsEl) {
    actionsEl.innerHTML = '';
    buttons.forEach(btnConf => {
      const btn = document.createElement('button');
      btn.className = 'ui-btn' + (btnConf.primary ? ' primary' : '') + (btnConf.danger ? ' danger' : '');
      btn.textContent = btnConf.label;
      btn.onclick = () => {
        playSE('click');
        if (typeof btnConf.onClick === 'function') btnConf.onClick();
      };
      actionsEl.appendChild(btn);
    });
  }

  overlay.classList.add('active');
}

function closeModal() {
  const overlay = document.getElementById('game-modal-overlay');
  if (overlay) overlay.classList.remove('active');
}

// --- 共通トースト通知システム（ゲーム全体で再利用） ---
function showNotification(title, message = '', icon = '🔔', type = '') {
  if (offlineSimulating) return; // オフライン進行シミュレーション中は通知を出さない
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast' + (type ? ` ${type}` : '');
  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-message">${message}</div>` : ''}
    </div>
  `;
  container.appendChild(toast);

  // 効果音を鳴らす場合はここに差し込む（現状は無音でOK）
  playNotificationSound(type);

  // フェードイン
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));

  // 約3秒後にフェードアウトして削除
  setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// 効果音フック（audio.jsのAudioSystemへ委譲する）
function playNotificationSound(type) {
  const map = { achievement: 'achievement' };
  playSE(map[type] || 'toggle');
}

// --- 実績システム ---
// 値が変化したタイミングでのみ呼び出す軽量チェック（毎フレームは呼ばない）
function checkAchievements() {
  if (!game.achievements) game.achievements = getDefaultAchievements();
  if (typeof game.achievementPoints !== 'number') game.achievementPoints = 0;
  let anyUnlocked = false;

  ACHIEVEMENTS.forEach(a => {
    if (game.achievements[a.id]) return; // 解除済みは再チェックしない
    let result = false;
    try { result = !!a.check(game); } catch(e) {}
    if (result) {
      game.achievements[a.id] = true;
      const pts = (typeof a.points === 'number') ? a.points : 10;
      game.achievementPoints += pts;
      anyUnlocked = true;
      showNotification(`実績解除！ ${a.title}`, `${a.desc}<br>+${pts} AP`, '🏆', 'achievement');
    }
  });

  if (anyUnlocked && !offlineSimulating) {
    saveGame(true);
    updateAchievementsTab();
    if (typeof updateShopTab === 'function') updateShopTab();
  }
}

// 実績画面の描画（初回に一覧を構築し、以降は状態のみ更新）
function updateAchievementsTab() {
  const list = document.getElementById('achievements-list');
  if (!list) return;

  if (!list.dataset.initialized) {
    list.dataset.initialized = '1';
    ACHIEVEMENTS.forEach(a => {
      const card = document.createElement('div');
      card.className = 'ach-card locked';
      card.id = `ach-card-${a.id}`;
      card.innerHTML = `
        <div class="ach-card-icon">${a.icon || '🏆'}</div>
        <div>
          <div class="ach-card-title">${a.title}</div>
          <div class="ach-card-desc">${a.desc}</div>
          <div class="ach-card-points">+${(typeof a.points === 'number') ? a.points : 10} AP</div>
        </div>
        <div class="ach-card-status">未解除</div>
      `;
      list.appendChild(card);
    });
  }

  if (!game.achievements) game.achievements = getDefaultAchievements();
  let unlockedCount = 0;

  ACHIEVEMENTS.forEach(a => {
    const card = document.getElementById(`ach-card-${a.id}`);
    if (!card) return;
    const unlocked = !!game.achievements[a.id];
    if (unlocked) unlockedCount++;
    card.classList.toggle('unlocked', unlocked);
    card.classList.toggle('locked', !unlocked);

    const statusEl = card.querySelector('.ach-card-status');
    if (statusEl) statusEl.textContent = unlocked ? '解除済み' : '未解除';
  });

  const countEl = document.getElementById('ach-unlocked-count');
  if (countEl) countEl.textContent = unlockedCount;
  const totalEl = document.getElementById('ach-total-count');
  if (totalEl) totalEl.textContent = ACHIEVEMENTS.length;
}

// ショップ画面の描画（実績ポイント/APの表示。今後アイテムを追加する土台）
function updateShopTab() {
  const apEl = document.getElementById('shop-ap-display');
  if (apEl) apEl.textContent = format((typeof game.achievementPoints === 'number') ? game.achievementPoints : 0);
}

// --- チャレンジシステム ---
// Big Crunch 5回以上でチャレンジタブを解放
function updateChallengeSectionVisibility() {
  const tabBtn = document.getElementById('tab-btn-challenge');
  if (!tabBtn) return;
  if (!game.challenge) game.challenge = getDefaultChallengeState();
  tabBtn.style.display = game.challenge.unlocked ? 'block' : 'none';
}

// チャレンジ画面の描画（初回に一覧を構築し、以降は状態のみ更新）
function updateChallengeTab() {
  const list = document.getElementById('challenge-list');
  if (!list) return;
  if (!game.challenge) game.challenge = getDefaultChallengeState();

  if (!list.dataset.initialized) {
    list.dataset.initialized = '1';
    CHALLENGES.forEach((c, i) => {
      const card = document.createElement('div');
      card.className = 'challenge-card';
      card.id = `challenge-card-${c.id}`;
      card.innerHTML = `
        <div class="challenge-card-num">Challenge ${c.number || (i + 1)}</div>
        <div class="challenge-card-title">${c.title}</div>
        <div class="challenge-card-effect">${c.effectLabel}</div>
        <div class="challenge-card-reward-label">報酬</div>
        <div class="challenge-card-reward-value">${c.rewardLabel}</div>
        <button id="challenge-btn-${c.id}" class="ui-btn primary"></button>
      `;
      list.appendChild(card);
    });
  }

  CHALLENGES.forEach(c => {
    const card = document.getElementById(`challenge-card-${c.id}`);
    const btn = document.getElementById(`challenge-btn-${c.id}`);
    if (!card || !btn) return;

    const completed = !!(game.challenge.completed && game.challenge.completed[c.id]);
    const active = game.challenge.active === c.id;

    card.classList.toggle('completed', completed);
    card.classList.toggle('active', active);

    if (completed) {
      btn.textContent = '✓ CLEAR';
      btn.classList.add('disabled');
      btn.onclick = null;
    } else if (active) {
      btn.textContent = 'チャレンジ中';
      btn.classList.add('disabled');
      btn.onclick = null;
    } else {
      btn.textContent = '開始';
      btn.classList.remove('disabled');
      btn.onclick = () => startChallenge(c.id);
    }
  });
}

// チャレンジ開始（確認ダイアログ経由）
function startChallenge(id) {
  const c = CHALLENGES.find(ch => ch.id === id);
  if (!c) return;
  if (!game.challenge) game.challenge = getDefaultChallengeState();
  if (game.challenge.active) return; // 同時に複数開始しない
  if (game.challenge.completed && game.challenge.completed[id]) return; // クリア済みは再開始不可

  showModal({
    title: `Challenge ${c.number || ''}`,
    body: 'チャレンジを開始しますか？<br><br>ゲームはLinac・Shift・Infinity強化を含めて<br>現在の宇宙をリセットします。<br>（所持IPは失われません）',
    buttons: [
      { label: 'キャンセル', onClick: closeModal },
      { label: 'OK', primary: true, onClick: () => { closeModal(); executeStartChallenge(id); } }
    ]
  });
}

function executeStartChallenge(id) {
  const c = CHALLENGES.find(ch => ch.id === id);
  if (!c || !game.challenge) return;

  // 現在の宇宙をリセット（Big Crunchと同じ要領で、Automationの状態は維持する）
  const preservedAuto = game.generators.map(g => ({
    autoUnlocked: g.autoUnlocked,
    autoActive: g.autoActive
  }));

  game.particles = new Decimal(10);
  game.linacs = 0;
  game.shifts = 0;
  game.stats.startTime = Date.now();
  game.stats.lastLinacCycleStart = Date.now();
  game.generators = getInitialGenerators().map((g, i) => ({
    ...g,
    autoUnlocked: preservedAuto[i] ? preservedAuto[i].autoUnlocked : g.autoUnlocked,
    autoActive: preservedAuto[i] ? preservedAuto[i].autoActive : g.autoActive
  }));

  // Infinity強化はリセットする（現在の宇宙のリセットに準じる）が、
  // 所持IPそのものはチャレンジ開始で失われないようにする
  if (!game.infinity) game.infinity = { ip: 0, crunchCount: 0, bestTime: null, upgrades: [], levels: {}, broken: false };
  game.infinity.upgrades = [];
  game.infinity.levels = {};

  game.challenge.active = id;

  saveGame();
  updateUI(0);
  updateInfinityTab();
  updateChallengeTab();
  showNotification('チャレンジ開始', c.title, '🎯');
  playSE('challenge');
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

// Infinity画面内のサブタブ切り替え（Main / Break Infinity）
function switchInfinitySubTab(name, btn) {
  document.querySelectorAll('.inf-subtab-content').forEach(c => c.classList.remove('active'));
  const target = document.getElementById(`inf-subtab-${name}`);
  if (target) target.classList.add('active');

  document.querySelectorAll('.inf-subtab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else {
    document.querySelectorAll('.inf-subtab-btn').forEach(b => {
      if (b.getAttribute('onclick') && b.getAttribute('onclick').includes(name)) b.classList.add('active');
    });
  }
}

// 設定画面（演出スキップ）＆ Automation画面（自動化）の UI生成
function initSettingsUI() {
  const toggleContainer = document.getElementById('setting-toggles-container');
  const accelList = document.getElementById('auto-accel-list');
  const glitchContainer = document.getElementById('glitch-toggle-container');
  const audioContainer = document.getElementById('audio-toggle-container');
  if (!toggleContainer && !accelList && !glitchContainer && !audioContainer) return;

  const createToggle = (id, label, settingKey) => {
    const wrapper = document.createElement('div');
    wrapper.id = `toggle-row-${id}`;
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
      saveGame(true);
      showNotification('設定を保存しました', '', '⚙️');
      if (typeof AudioSystem !== 'undefined') {
        if (settingKey === 'bgmEnabled') AudioSystem.refreshBGMState();
        else playSE('toggle');
      }
    };
    return wrapper;
  };

  // 画面演出（グリッチ/ブルブル効果）のON/OFF切り替え
  if (glitchContainer && !glitchContainer.dataset.initialized) {
    glitchContainer.dataset.initialized = '1';
    glitchContainer.appendChild(createToggle('chk-glitch', '画面演出（グリッチ効果）を有効にする', 'glitchEffect'));
  }

  // SE・BGMのON/OFF切り替え
  if (audioContainer && !audioContainer.dataset.initialized) {
    audioContainer.dataset.initialized = '1';
    audioContainer.appendChild(createToggle('chk-sfx', 'SE（効果音）を有効にする', 'sfxEnabled'));
    audioContainer.appendChild(createToggle('chk-bgm', 'BGM（背景音楽）を有効にする', 'bgmEnabled'));
  }

  // 演出スキップ（設定画面）
  // それぞれ該当する演出を一度でも体験してから表示する（未体験の項目は表示しない）
  if (toggleContainer && !toggleContainer.dataset.initialized) {
    toggleContainer.dataset.initialized = '1';
    toggleContainer.appendChild(createToggle('chk-linac', 'ライナック演出をスキップ', 'skipLinacConf'));
    toggleContainer.appendChild(createToggle('chk-shift', 'シフト演出をスキップ', 'skipShiftConf'));
    toggleContainer.appendChild(createToggle('chk-crunch', 'Big Crunch演出をスキップ', 'skipCrunchAnim'));
    updateSkipToggleVisibility();
  }

  // Acceleratorの自動購入をまとめて管理（自動化画面）
  if (accelList && !accelList.dataset.initialized) {
    accelList.dataset.initialized = '1';
    game.generators.forEach((gen, index) => {
      const row = document.createElement('div');
      row.className = 'stat-row';
      row.innerHTML = `
        <span class="stat-label">${gen.name}</span>
        <span id="auto-accel-badge-${index}" class="auto-badge">必要: 1e${50 + index * 10}</span>
      `;
      accelList.appendChild(row);
    });
  }

  // 未解放時はタブ自体を非表示にする（Coming Soon等は表示しない・空白も作らない）
  updateAutomationSectionVisibility();
}

// 自動化画面の内容を毎フレーム更新（Accelerator一覧の状態表示）
function updateAutomationTab() {
  game.generators.forEach((gen, index) => {
    const badge = document.getElementById(`auto-accel-badge-${index}`);
    if (!badge) return;
    badge.className = 'auto-badge';
    badge.onclick = null;
    if (gen.autoUnlocked) {
      badge.classList.add('clickable');
      badge.onclick = () => toggleAutobuyer(index);
      if (gen.autoActive) {
        badge.classList.add('active');
        badge.textContent = "自動: ON";
      } else {
        badge.classList.add('inactive');
        badge.textContent = "自動: OFF";
      }
    } else {
      const th = Number('1e' + (50 + index * 10));
      badge.textContent = `必要: ${format(th)}`;
    }
  });
}

// 演出スキップ設定の表示/非表示: 該当する演出を一度でも体験してから表示する
function updateSkipToggleVisibility() {
  const linacRow = document.getElementById('toggle-row-chk-linac');
  if (linacRow) linacRow.style.display = ((game.stats && game.stats.totalLinacs) >= 1) ? 'block' : 'none';

  const shiftRow = document.getElementById('toggle-row-chk-shift');
  if (shiftRow) shiftRow.style.display = ((game.shifts || 0) >= 1) ? 'block' : 'none';

  const crunchRow = document.getElementById('toggle-row-chk-crunch');
  if (crunchRow) crunchRow.style.display = ((game.infinity && game.infinity.crunchCount) >= 1) ? 'block' : 'none';
}

// いずれかのAcceleratorでオートバイヤーが解放済みかどうか（自動化タブの表示条件）
function anyAutomationUnlocked() {
  return !!(game.generators && game.generators.some(g => g.autoUnlocked));
}

// Automationタブボタンの表示/非表示を更新
function updateAutomationSectionVisibility() {
  const tabBtn = document.getElementById('tab-btn-automation');
  if (tabBtn) tabBtn.style.display = anyAutomationUnlocked() ? 'block' : 'none';
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
        s.textContent = "★ クイックセーブ！ ★";
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
  const availableNews = NEWS_DATA.filter(n => toDecimal(game.particles).gte(n.req));
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

// 1つのAcceleratorの行をDOMに生成する（未解放、または既に生成済みの場合は何もしない）
function renderGeneratorRow(index) {
  const container = document.getElementById('generator-container');
  if (!container) return;
  if (document.getElementById(`gen-row-${index}`)) return; // 生成済み
  const gen = game.generators[index];
  if (!gen || !gen.unlocked) return;

  const row = document.createElement('div');
  row.className = 'generator-row';
  row.id = `gen-row-${index}`;
  row.innerHTML = `
    <div class="gen-info">
      <div class="gen-name">
        ${gen.name} 
        <span id="auto-badge-${index}" class="auto-badge">必要: 1e${50 + index*10}</span>
      </div>
      <div class="gen-amount" id="amount-${index}">0</div>
      
      <div class="gen-multiplier" style="display:flex; flex-direction:column; align-items:flex-start;">
         <span id="mult-${index}" style="font-weight:bold;">x1.00</span>
         <div style="font-size:0.7em; margin-top:2px; line-height:1.2;">
           <span id="mult-linac-${index}" style="color:#ffb300; display:none; margin-right:5px;"></span>
           <span id="mult-inf-${index}" style="color:#d500f9; display:none; margin-right:5px;"></span>
           <span id="mult-challenge-${index}" style="color:#d500f9;"></span>
         </div>
      </div>
    </div>
    <div class="btn-group">
      <button id="btn-${index}" class="buy-btn" onclick="buyGenerator(${index})">
        1個購入
      </button>
    </div>
  `;
  container.appendChild(row);
}

// 解放済みのAcceleratorすべての行を描画する
function renderUnlockedGeneratorRows() {
  game.generators.forEach((gen, index) => {
    if (gen.unlocked) renderGeneratorRow(index);
  });
}

function init() {
  console.log("Game Initializing...");

  // セーブデータの読込を先に行い、解放済みのAcceleratorだけを描画する
  loadGame();

  const container = document.getElementById('generator-container');
  if (container) container.innerHTML = '';
  renderUnlockedGeneratorRows();
  
  // ★重要: 初期化直後の強制非表示処理★
  const pContainer = document.getElementById('prestige-container');
  if (pContainer && (!game.unlocks || !game.unlocks.linac)) {
    pContainer.style.display = 'none';
  }

  initSettingsUI();
  initNews();
  updateAchievementsTab();
  checkAchievements();
  updateShopTab();
  updateChallengeTab();
  updateChallengeSectionVisibility();
  initBreakInfinity();
  if (typeof AudioSystem !== 'undefined') AudioSystem.initOnFirstInteraction();

  // オフライン進行のチェック（十分な経過時間があれば専用画面を表示し、
  // 「開始」または「スキップ」が完了してから通常のゲームループへ進む）
  if (typeof checkAndShowOfflineProgress === 'function') {
    checkAndShowOfflineProgress();
  } else {
    switchTab('main');
    gameLoop();
  }
}

document.addEventListener('DOMContentLoaded', init);

// ページを離れる際にできるだけ正確な終了時刻を保存する（オフライン進行の計算精度のため）
window.addEventListener('beforeunload', () => {
  try { saveGame(true); } catch(e) {}
});