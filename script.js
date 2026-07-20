/**
 * the-Particle v3.5.1 (Fix: Hard Reset & Unlock Persistence)
 */
const SAVE_KEY = 'theParticle_v3_5_1'; // キーを変更して確実に新規状態で始められるようにします
let INFINITY_LIMIT = 1.79e308;
// Big Crunchの基準倍率単位。Break Infinity解放後もこの値ごとにIP獲得倍率が1段階増える。
// （INFINITY_LIMITはBreak Infinity解放中に1e999へ変わるため、こちらは常に固定値として別に持つ）
const BREAK_INFINITY_CRUNCH_BASE = 1.79e308;

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

// number/Decimal どちらでも安全に「1個あたりの量」を倍率(factor)で増やす
// （Accelerator購入時の production *= 1.1^count に使用）。
// 大きくなりすぎたらDecimalへ昇格する。factor自体がDecimal（購入数が極端に多い場合）でも安全。
function amtMulFactor(value, factor) {
  if (value instanceof Decimal || factor instanceof Decimal) {
    return toDecimal(value).mul(factor);
  }
  const result = value * factor;
  if (!isFinite(result) || result > OVERFLOW_SAFE_THRESHOLD) {
    return toDecimal(value).mul(factor);
  }
  return result;
}

// 1.1^count を安全に計算する。countが非常に大きくnumberでオーバーフローする場合はDecimalを返す。
function safePow11(count) {
  const f = Math.pow(1.1, count);
  if (isFinite(f)) return f;
  return decimalPowInt(1.1, count);
}

// 複数のnumber/Decimal値を安全に掛け合わせる。
// すべてnumberでオーバーフローしなければnumberのまま返し、
// 桁が巨大になる場合はDecimalへ昇格して正確に計算する（表示・倍率合成の混在を避けるため）。
function mulSafe(...values) {
  const hasDecimal = values.some(v => v instanceof Decimal);
  if (!hasDecimal) {
    const result = values.reduce((a, b) => a * b, 1);
    if (isFinite(result) && Math.abs(result) <= OVERFLOW_SAFE_THRESHOLD) return result;
  }
  return values.reduce((acc, v) => toDecimal(acc).mul(v), new Decimal(1));
}

// セーブから復元したAccelerator等のフィールド（amount/production）を
// number/Decimalどちらでも正しい型に復元する。
// JSON化されたDecimalは文字列（例: "1.23e350"）または{mantissa,exponent}になっているため、
// 生の値をそのまま使うと精度が壊れる（Infinity化・文字列比較化）ので、必ずここを通して復元する。
function restoreBigField(v, fallback) {
  if (v instanceof Decimal) return v;
  if (typeof v === 'number' && isFinite(v)) return v;
  return decimalFromSaved(v, fallback);
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

// =========================================================
// --- 簡易チート対策: game.particles への直接代入をブロックする ---
// 「game.particles = 100」のようにコンソールから直に書き換えられる問題への対策。
// ゲーム内部の正規の更新経路（setParticles）以外からの代入はすべて無視する。
// ※ ブラウザのコンソールはページと同じ権限を持つため、これは完全な防止策では
//   なく「安易な書き換えを塞ぐ」ための簡易的な対策である。数値を変えたい場合は
//   秘密コマンド（Kaihatusha関数）で開くチートタブから正規に変更できるようにする。
// =========================================================
let __particlesWriteGate = false;

// game.particles を保護する（gameオブジェクトが新規作成・再構築されるたびに呼ぶ必要がある）
function protectParticlesField(g) {
  let backing = g.particles;
  Object.defineProperty(g, 'particles', {
    configurable: true,
    enumerable: true,
    get() { return backing; },
    set(v) {
      if (!__particlesWriteGate) {
        console.warn('%c不正な変更がブロックされました。', 'color:#ff3b3b; font-weight:bold;');
        return;
      }
      backing = v;
    }
  });
}

// ゲーム内部から正規にparticlesを更新するための唯一の経路
function setParticles(value) {
  __particlesWriteGate = true;
  try { game.particles = value; }
  finally { __particlesWriteGate = false; }
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
    titleKey: 'infUpgrade.mkTitle', titleVars: { n: targetGen + 1 },
    descKey: 'infUpgrade.mkDesc', descVars: { n: targetGen + 1 },
    baseCost: 1,
    leveled: true,
    effect: (game) => Math.pow(10, getUpgradeLevel(id)),
    nextEffect: (game) => Math.pow(10, getUpgradeLevel(id) + 1),
    formatEffect: (val) => `x${format(val)}`
  };
}

// インフィニティ回数（Big Crunch回数）に応じて、指定した2つのAccelerator(Mk.x/Mk.y)の
// 生産倍率を上げる強化（単発購入・レベルなし）
const CRUNCH_PAIR_MULT_PER_COUNT = 0.05; // インフィニティ回数1回あたりの倍率増加量
function makeCrunchPairUpgrade(id, targetGens, cost) {
  return {
    id, targetGens,
    titleKey: 'infUpgrade.crunchPairTitle', titleVars: { a: targetGens[0] + 1, b: targetGens[1] + 1 },
    descKey: 'infUpgrade.crunchPairDesc', descVars: { a: targetGens[0] + 1, b: targetGens[1] + 1 },
    cost,
    leveled: false,
    effect: (game) => {
      const crunchCount = (game.infinity && game.infinity.crunchCount) ? game.infinity.crunchCount : 0;
      return 1 + crunchCount * CRUNCH_PAIR_MULT_PER_COUNT;
    },
    formatEffect: (val) => `x${format(val)}`
  };
}

const INF_UPGRADE_MAX_LEVEL = 10; // レベル制Infinity強化（Mk.1〜Mk.8, IP倍加, シフト強化）の最大レベル
const SHIFT_INCREMENT_BASE = 0.2; // シフト強化Lv.0時点でのシフト1回あたりの倍率増加量
const SHIFT_INCREMENT_ID = 14;

const INF_UPGRADES = [
  {
    id: 0,
    titleKey: 'infUpgrade.timeDilationTitle',
    descKey: 'infUpgrade.timeDilationDesc',
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
    titleKey: 'infUpgrade.ipDoubleTitle',
    descKey: 'infUpgrade.ipDoubleDesc',
    baseCost: 2,
    leveled: true,
    effect: (game) => Math.pow(2, getUpgradeLevel(9)),
    nextEffect: (game) => Math.pow(2, getUpgradeLevel(9) + 1),
    formatEffect: (val) => `${format(val)} IP`
  },
  makeCrunchPairUpgrade(10, [3, 4], 2), // Mk.4 & Mk.5
  makeCrunchPairUpgrade(11, [2, 5], 3), // Mk.3 & Mk.6
  makeCrunchPairUpgrade(12, [1, 6], 5), // Mk.2 & Mk.7
  makeCrunchPairUpgrade(13, [0, 7], 8), // Mk.1 & Mk.8
  {
    id: SHIFT_INCREMENT_ID,
    titleKey: 'infUpgrade.shiftBoostTitle',
    descKey: 'infUpgrade.shiftBoostDesc',
    baseCost: 3,
    leveled: true,
    effect: (game) => SHIFT_INCREMENT_BASE + getUpgradeLevel(SHIFT_INCREMENT_ID) * 0.2,
    nextEffect: (game) => SHIFT_INCREMENT_BASE + (getUpgradeLevel(SHIFT_INCREMENT_ID) + 1) * 0.2,
    formatEffect: (val) => `+${format(val)}`
  }
];

// --- 実績定義（配列で管理・追加しやすい構造） ---
// points: 実績解除時にもらえるAP（実績ポイント）。省略時は10。
const ACHIEVEMENTS_BASE = [
  {
    id: 'firstStep',
    titleKey: 'ach.firstStep.title',
    descKey: 'ach.firstStep.desc',
    icon: '🚀',
    points: 10,
    check: (game) => game.generators[0] && amtGte(game.generators[0].amount, 1)
  },
  {
    id: 'firstLinac',
    titleKey: 'ach.firstLinac.title',
    descKey: 'ach.firstLinac.desc',
    icon: '🌌',
    points: 10,
    check: (game) => (game.stats.totalLinacs || 0) >= 1
  },
  {
    id: 'firstShift',
    titleKey: 'ach.firstShift.title',
    descKey: 'ach.firstShift.desc',
    icon: '🔄',
    points: 10,
    check: (game) => (game.shifts || 0) >= 1
  },
  {
    id: 'infinity',
    titleKey: 'ach.infinity.title',
    descKey: 'ach.infinity.desc',
    icon: '♾️',
    points: 100,
    check: (game) => (game.infinity && game.infinity.crunchCount > 0)
  },
  // --- ライナック回数実績 ---
  {
    id: 'doubleLinac',
    titleKey: 'ach.doubleLinac.title',
    descKey: 'ach.doubleLinac.desc',
    icon: '🌠',
    points: 10,
    check: (game) => (game.stats.totalLinacs || 0) >= 2
  },
  {
    id: 'tripleLinac',
    titleKey: 'ach.tripleLinac.title',
    descKey: 'ach.tripleLinac.desc',
    icon: '💫',
    points: 10,
    check: (game) => (game.stats.totalLinacs || 0) >= 3
  },
  {
    id: 'linacIntermediate',
    titleKey: 'ach.linacIntermediate.title',
    descKey: 'ach.linacIntermediate.desc',
    icon: '⚡',
    points: 10,
    check: (game) => (game.stats.totalLinacs || 0) >= 10
  },
  {
    id: 'linacAdvanced',
    titleKey: 'ach.linacAdvanced.title',
    descKey: 'ach.linacAdvanced.desc',
    icon: '🔥',
    points: 20,
    check: (game) => (game.stats.totalLinacs || 0) >= 30
  },
  {
    id: 'linacMaster',
    titleKey: 'ach.linacMaster.title',
    descKey: 'ach.linacMaster.desc',
    icon: '👑',
    points: 30,
    check: (game) => (game.stats.totalLinacs || 0) >= 50
  },
  // --- シフト回数実績 ---
  {
    id: 'doubleShift',
    titleKey: 'ach.doubleShift.title',
    descKey: 'ach.doubleShift.desc',
    icon: '🔁',
    points: 10,
    check: (game) => (game.shifts || 0) >= 2
  },
  {
    id: 'tripleShift',
    titleKey: 'ach.tripleShift.title',
    descKey: 'ach.tripleShift.desc',
    icon: '♻️',
    points: 20,
    check: (game) => (game.shifts || 0) >= 3
  },
  {
    id: 'moreShift',
    titleKey: 'ach.moreShift.title',
    descKey: 'ach.moreShift.desc',
    icon: '🌀',
    points: 10,
    check: (game) => (game.shifts || 0) >= 5
  },
  {
    id: 'shiftMaster',
    titleKey: 'ach.shiftMaster.title',
    descKey: 'ach.shiftMaster.desc',
    icon: '🏅',
    points: 50,
    check: (game) => (game.shifts || 0) >= 10
  },
  // --- Accelerator初購入実績（Mk.2〜Mk.8） ---
  {
    id: 'mk2First',
    titleKey: 'ach.mk2First.title',
    descKey: 'ach.mk2First.desc',
    icon: '🔋',
    points: 10,
    check: (game) => game.generators[1] && amtGte(game.generators[1].amount, 1)
  },
  {
    id: 'mk3First',
    titleKey: 'ach.mk3First.title',
    descKey: 'ach.mk3First.desc',
    icon: '🔌',
    points: 10,
    check: (game) => game.generators[2] && amtGte(game.generators[2].amount, 1)
  },
  {
    id: 'mk4First',
    titleKey: 'ach.mk4First.title',
    descKey: 'ach.mk4First.desc',
    icon: '⚙️',
    points: 10,
    check: (game) => game.generators[3] && amtGte(game.generators[3].amount, 1)
  },
  {
    id: 'mk5First',
    titleKey: 'ach.mk5First.title',
    descKey: 'ach.mk5First.desc',
    icon: '🛠️',
    points: 10,
    check: (game) => game.generators[4] && amtGte(game.generators[4].amount, 1)
  },
  {
    id: 'mk6First',
    titleKey: 'ach.mk6First.title',
    descKey: 'ach.mk6First.desc',
    icon: '😨',
    points: 10,
    check: (game) => game.generators[5] && amtGte(game.generators[5].amount, 1)
  },
  {
    id: 'mk7First',
    titleKey: 'ach.mk7First.title',
    descKey: 'ach.mk7First.desc',
    icon: '🍀',
    points: 10,
    check: (game) => game.generators[6] && amtGte(game.generators[6].amount, 1)
  },
  {
    id: 'mk8First',
    titleKey: 'ach.mk8First.title',
    descKey: 'ach.mk8First.desc',
    icon: '🏁',
    points: 10,
    check: (game) => game.generators[7] && amtGte(game.generators[7].amount, 1)
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
  titleKey: `ach.m${i}.title`,
  descKey: 'ach.particleDesc',
  descVars: { label: m.label },
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
    titleKey: 'ch.slowSpeed.title',
    effectLabelKey: 'ch.slowSpeed.effectLabel',
    rewardLabelKey: 'ch.slowSpeed.rewardLabel',
    effectMult: 0.9,  // チャレンジ中のみ適用される生産倍率
    rewardMult: 2     // クリア後、永久に適用される生産倍率
  },
  {
    id: 'highCost',
    number: 2,
    titleKey: 'ch.highCost.title',
    effectLabelKey: 'ch.highCost.effectLabel',
    rewardLabelKey: 'ch.highCost.rewardLabel',
    costMult: 2,        // チャレンジ中のみ適用されるコスト倍率（購入コストが上昇）
    costRewardMult: 0.95, // クリア後、永久に適用されるコスト倍率（購入コストが減少）
    // Mk.1のコストは baseCost(10) × costMult(2) = 20 になるため、
    // 通常の初期粒子数(10)のままだと1個も購入できず詰んでしまう。
    // このチャレンジのみ初期粒子数を20にして必ず1個目を買えるようにする。
    startParticles: 20
  },
  {
    id: 'backToBasics',
    number: 3,
    titleKey: 'ch.backToBasics.title',
    effectLabelKey: 'ch.backToBasics.effectLabel',
    rewardLabelKey: 'ch.backToBasics.rewardLabel',
    disableAutomation: true // チャレンジ中はオートバイヤーとMキー（最大購入）が使用不可
    // 報酬（自動ライナック）は数値倍率ではなく、game.challenge.completed.backToBasics を
    // isAutoLinacUnlocked() が参照することで機能する（getChallengeRewardMultiplier等では扱わない）
  }
];

function getDefaultChallengeState() {
  const completed = {};
  CHALLENGES.forEach(c => { completed[c.id] = false; });
  return { unlocked: false, active: null, completed };
}

// --- ショップ: テーマ定義 ---
// id: セーブデータ・DOM要素IDに使う識別子 / nameKey: i18nキー
// color: --color-main に設定するHEX値 / rgb: rgba(var(--color-main-rgb),x) 用の "r, g, b"
// cost: 購入に必要なAP（デフォルトテーマのみ0＝最初から所持）
// special: trueの場合、単色スワップではなく<body>にcssClassを付与し、
//          背景・フォント・複数の配色を一括で切り替える特殊テーマとして扱う
const THEMES = [
  { id: 'default',    nameKey: 'shop.theme.default',    color: '#00ff9d', rgb: '0, 255, 157',  cost: 0 },
  { id: 'red',        nameKey: 'shop.theme.red',        color: '#ff3b3b', rgb: '255, 59, 59',   cost: 50 },
  { id: 'orange',     nameKey: 'shop.theme.orange',     color: '#ff9100', rgb: '255, 145, 0',   cost: 50 },
  { id: 'yellow',     nameKey: 'shop.theme.yellow',     color: '#ffea00', rgb: '255, 234, 0',   cost: 50 },
  { id: 'lightgreen', nameKey: 'shop.theme.lightgreen', color: '#76ff03', rgb: '118, 255, 3',   cost: 50 },
  { id: 'green',      nameKey: 'shop.theme.green',      color: '#00e676', rgb: '0, 230, 118',   cost: 50 },
  { id: 'emerald',    nameKey: 'shop.theme.emerald',    color: '#00bfa5', rgb: '0, 191, 165',   cost: 50 },
  { id: 'lightblue',  nameKey: 'shop.theme.lightblue',  color: '#00b0ff', rgb: '0, 176, 255',   cost: 50 },
  { id: 'blue',       nameKey: 'shop.theme.blue',       color: '#2979ff', rgb: '41, 121, 255',  cost: 50 },
  { id: 'purple',     nameKey: 'shop.theme.purple',     color: '#b388ff', rgb: '179, 136, 255', cost: 50 },
  // --- 特殊テーマ（背景・フォント・複数配色を一括変更） ---
  { id: 'rainbow', nameKey: 'shop.theme.rainbow', color: '#ff2fd0', rgb: '255, 47, 208', cost: 130, special: true, cssClass: 'theme-rainbow' },
  { id: 'nature',  nameKey: 'shop.theme.nature',  color: '#7ed957', rgb: '126, 217, 87', cost: 200, special: true, cssClass: 'theme-nature' },
  { id: 'neon',    nameKey: 'shop.theme.neon',    color: '#ff2fd0', rgb: '255, 47, 208', cost: 200, special: true, cssClass: 'theme-neon' },
  { id: 'space',   nameKey: 'shop.theme.space',   color: '#8fd3ff', rgb: '143, 211, 255', cost: 200, special: true, cssClass: 'theme-space' }
];
function getThemeName(theme) { return t(theme.nameKey); }

// --- 多言語コンテンツ用ヘルパー: titleKey/descKey等から現在言語の文言を取得する ---
function getUpgradeTitle(up) { return t(up.titleKey, up.titleVars); }
function getUpgradeDesc(up) { return t(up.descKey, up.descVars); }
function getAchTitle(a) { return t(a.titleKey, a.titleVars); }
function getAchDesc(a) { return t(a.descKey, a.descVars); }
function getChallengeTitle(c) { return t(c.titleKey); }
function getChallengeEffectLabel(c) { return t(c.effectLabelKey); }
function getChallengeRewardLabel(c) { return t(c.rewardLabelKey); }

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
      bgmEnabled: true,
      autoLinacEnabled: true,
      particleDisplaySize: 'medium',
      lang: getLang()
    },
    achievements: getDefaultAchievements(),
    achievementPoints: 0,
    themes: { owned: ['default'], selected: 'default' },
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
protectParticlesField(game);
let isCrunching = false;
let currentPPSValue = 0; // 統計画面「現在のPPS」表示用キャッシュ
let offlineSimulating = false; // オフライン進行の一括シミュレーション中はtrue（通知・重いDOM更新を抑制する）
let suppressUnloadSave = false; // ハードリセット/インポート直後のreload時に、古いgameをbeforeunloadで再セーブしてしまうのを防ぐ

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
  if (type === 'raw') return formatRaw(num);
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

// 実数表示（桁区切り）: 1e21以上はnumberの精度が失われるため科学的記法にフォールバックする
function formatRaw(num) {
  if (!isFinite(num)) return "Infinity";
  if (num < 1e21) {
    return Math.floor(num).toLocaleString('en-US');
  }
  return formatScientific(num);
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

// シフト強化(Infinityアップグレード)によって上昇する、シフト1回あたりの倍率増加量
function getShiftIncrement() {
  try {
    const up = INF_UPGRADES.find(u => u.id === SHIFT_INCREMENT_ID);
    if (up) return up.effect(game);
  } catch (e) {}
  return SHIFT_INCREMENT_BASE;
}

function getLinacBaseMult() {
  const s = game.shifts || 0;
  return 1.2 + (s * getShiftIncrement());
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
  if (l <= 0) return 1;
  // Math.pow(base, l) はライナック回数(l)が多くなるとnumberの範囲を超えてInfinityになる。
  // その手前ならnumberで高速に、超える規模ならDecimalで正確に計算する。
  const approxExponent = l * Math.log10(base);
  if (approxExponent < 300) {
    const v = Math.pow(base, l);
    if (isFinite(v)) return v;
  }
  return decimalPowInt(base, l);
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
  let mult = 1;
  if (level > 0) {
    // Lv.1で×10, Lv.2で×100, Lv.3で×1000 ... (10^level の掛け算)
    const powVal = Math.pow(10, level);
    // レベルが非常に高くnumberがオーバーフローする場合のみDecimalで計算し直す
    mult = isFinite(powVal) ? mult * powVal : mulSafe(mult, decimalPowInt(10, level));
  }
  // インフィニティ回数に応じたペア強化（Mk.4&5 / Mk.3&6 / Mk.2&7 / Mk.1&8）
  INF_UPGRADES.forEach(up => {
    if (up.targetGens && up.targetGens.includes(genIndex) && hasUpgrade(up.id)) {
      try { mult = mulSafe(mult, up.effect(game)); } catch (e) {}
    }
  });
  return mult;
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
  return mulSafe(getLinacMultValue(), getGlobalInfinityMultValue(), getChallengeMultiplier(), getChallengeRewardMultiplier());
}

function getLinacReq() {
  const l = game.linacs || 0;
  return 1 + (l * 10);
}

function getShiftReq() {
  const s = game.shifts || 0;
  return 5 + (s * 5);
}

// Infinity（Big Crunch）までの進捗率を0〜1で返す。
// 桁数が非常に大きくなるため、線形比ではなく対数スケールで進捗を計算する。
function getInfinityProgressRatio() {
  const breakActive = (typeof isBreakInfinityActive === 'function' && isBreakInfinityActive());
  if (breakActive) return 1; // Break Infinity解放後は上限が実質無いため常に満タン扱い
  const p = toDecimal(game.particles);
  if (!p || p.lte(0)) return 0;
  const logP = p.log10();
  const logCap = Math.log10(1.79e308);
  if (!isFinite(logP) || logCap <= 0) return 0;
  return Math.max(0, Math.min(1, logP / logCap));
}

// Decimalを安全にfloorする。
// 指数が大きい(15以上)値はtoNumber()がInfinity化して壊れるため、その場合は
// 「この桁数ではもう端数に意味がない＝実質整数」とみなしてそのまま返す。
function decimalFloorSafe(d) {
  d = toDecimal(d);
  if (d.exponent < 15) return new Decimal(Math.floor(d.toNumber()));
  return d;
}

// Break Infinity解放後、粒子数の指数（桁数）に308が何個分含まれているかを
// 切り捨てで求める（例: 1e616 なら 616÷308=2 なので2倍）。Big Crunch1回あたりの
// IP獲得倍率として使う。まだ基準値(1.79e308)に到達していなければ0を返す。
function getBigCrunchMultiplier() {
  const p = toDecimal(game.particles);
  if (p.lt(BREAK_INFINITY_CRUNCH_BASE)) return new Decimal(0);
  const exponent = p.log10();
  if (!isFinite(exponent)) return new Decimal(1);
  const count = Math.floor(exponent / 308);
  return new Decimal(count < 1 ? 1 : count);
}

// Break Infinity解放後、プレイヤーが手動でBig Crunchを実行するためのエントリポイント
// （通常時は上限到達で自動発生するが、Break Infinity解放後は自動発生しないため、
// このボタン経由でのみBig Crunchできる）。
function doManualBigCrunch() {
  if (!(typeof isBreakInfinityActive === 'function' && isBreakInfinityActive())) return;
  if (toDecimal(game.particles).lt(BREAK_INFINITY_CRUNCH_BASE)) return;
  triggerBigCrunch();
}


// ゲームの1ティック分の計算のみを行う（DOM更新は含まない）。
// 通常のgameLoop・オフライン進行・Time Warpのすべてがこの関数を共有することで
// 計算コードの重複を避ける。
function simulateTick(dt) {
  if (!game.stats.totalTimePlayed) game.stats.totalTimePlayed = 0;
  game.stats.totalTimePlayed += dt;

  setParticles(toDecimal(game.particles));
  if (Number.isNaN(game.particles.mantissa) || Number.isNaN(game.particles.exponent)) setParticles(new Decimal(10));

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
    // amount以外(production/倍率)が巨大化してDecimal化している場合も含めて判定する
    // （そうしないと、rawな * 演算子でDecimalが文字列経由の不正確なnumberへ変換されてしまう）
    const amountIsDecimal = (gen.amount instanceof Decimal) || (gen.production instanceof Decimal) ||
      (globalMult instanceof Decimal) || (genInfMult instanceof Decimal);

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
          // 頭打ちの値にdtを掛けてしまうと、dtが大きい（オフライン進行・スキップ等）場合に
          // 上限(1.79e308)を大きく超えてしまうため、dtを掛けずに上限そのものを使う。
          produced = breakActive
            ? toDecimal(gen.amount).mul(gen.production).mul(globalMult).mul(genInfMult).mul(dt)
            : new Decimal(1.79e308);
        } else {
          produced = new Decimal(pps * dt);
        }
      }
      if (!Number.isNaN(produced.mantissa)) {
        setParticles(game.particles.add(produced));
        game.stats.totalParticles = toDecimal(game.stats.totalParticles).add(produced);
        // breakInfinity未解放時は、どんな計算経路であっても上限(1.79e308)を超えさせない
        // （超えた状態が次のtickまでの間、一瞬でも表示に出てしまうのを防ぐ）
        if (!breakActive && game.particles.gt(INFINITY_LIMIT)) {
          setParticles(new Decimal(INFINITY_LIMIT));
        }
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
    runAutoLinac();
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
  if ((g0.amount instanceof Decimal) || (g0.production instanceof Decimal) ||
      (globalMult instanceof Decimal) || (g0Inf instanceof Decimal)) {
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
// アクティブなチャレンジによってオートバイヤー・Mキーが無効化されているか
function isChallengeAutomationDisabled() {
  if (game.challenge && game.challenge.active) {
    const c = CHALLENGES.find(ch => ch.id === game.challenge.active);
    if (c && c.disableAutomation) return true;
  }
  return false;
}

// Challenge 3「初心に戻る」クリア後に解放される自動ライナックが使用可能か
function isAutoLinacUnlocked() {
  return !!(game.challenge && game.challenge.completed && game.challenge.completed['backToBasics']);
}

// 自動ライナック: Mk.8が必要数に達したら自動でライナックを実行する
function runAutoLinac() {
  if (!isAutoLinacUnlocked()) return;
  if (game.settings && game.settings.autoLinacEnabled === false) return;
  if (isChallengeAutomationDisabled()) return;
  if (!game.unlocks || !game.unlocks.linac) return;
  const gen8 = game.generators[7];
  if (!gen8) return;
  const req = getLinacReq();
  if (amtGte(gen8.amount, req)) {
    executeLinac();
  }
}

function runAutobuyers() {
  if (isChallengeAutomationDisabled()) return; // Challenge 3中はオートバイヤーを停止する
  game.generators.forEach((gen, index) => {
    if (!gen.unlocked) return; // 未解放のAcceleratorは自動購入もしない

    const threshold = Number('1e' + (50 + index * 10));
    if (!gen.autoUnlocked && game.particles.gte(threshold)) {
      gen.autoUnlocked = true;
    }
    if (gen.autoUnlocked && gen.autoActive) {
      // 「買えるだけ買う」ことで、オフライン進行やTime Warpなど1回のtickが
      // 長時間に相当する場合でも自動化が正しく機能するようにする
      // （固定回数のループだと、大きくジャンプしたdtに対して購入量が頭打ちになってしまう）
      const { count, cost } = calculateAffordablePurchase(gen, BUY_MAX_SAFETY_CAP);
      if (count > 0) {
        setParticles(toDecimal(game.particles).sub(cost));
        gen.amount = amtAdd(gen.amount, count);
        gen.bought += count;
        gen.production = amtMulFactor(gen.production, safePow11(count));
        if (!game.stats.totalMkPurchased) game.stats.totalMkPurchased = [0,0,0,0,0,0,0,0];
        game.stats.totalMkPurchased[index] = (game.stats.totalMkPurchased[index] || 0) + count;
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
  showNotification(t('notif.settingsSaved'), '', '⚙️');
}

const PARTICLE_DISPLAY_SIZES = ['small', 'medium', 'large'];

// 粒子数（Accelerator所持数含む）の表示文字サイズを反映する（body要素にクラスを付与）
function applyParticleDisplaySize(size) {
  if (!PARTICLE_DISPLAY_SIZES.includes(size)) size = 'medium';
  document.body.classList.remove(...PARTICLE_DISPLAY_SIZES.map(s => `particle-size-${s}`));
  document.body.classList.add(`particle-size-${size}`);
}

function changeParticleDisplaySize(val) {
  if (!PARTICLE_DISPLAY_SIZES.includes(val)) return;
  game.settings.particleDisplaySize = val;
  applyParticleDisplaySize(val);
  saveGame(true);
  showNotification(t('notif.settingsSaved'), '', '⚙️');
  playSE('toggle');
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

  setParticles(toDecimal(game.particles).sub(cost));
  gen.amount = amtAdd(gen.amount, count);
  gen.bought += count;
  gen.production = amtMulFactor(gen.production, safePow11(count));
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

  setParticles(toDecimal(game.particles).sub(cost));
  gen.amount = amtAdd(gen.amount, count);
  gen.bought += count;
  gen.production = amtMulFactor(gen.production, safePow11(count));
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
      title: t('notif.linacConfirmTitle'),
      body: t('notif.linacConfirmBody', { val: format(currentBase) }),
      buttons: [
        { label: t('common.cancel'), onClick: closeModal },
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

  // チャレンジ中は、そのチャレンジ専用の初期粒子数（例: highCostは20）から再開する
  let startParticles = 10;
  if (game.challenge && game.challenge.active) {
    const activeChallenge = CHALLENGES.find(ch => ch.id === game.challenge.active);
    if (activeChallenge) startParticles = activeChallenge.startParticles || 10;
  }
  setParticles(new Decimal(startParticles));
  game.generators.forEach(gen => {
    gen.amount = 0;
    gen.bought = 0;
    gen.production = 1; 
  });
  
  // アンロックフラグ維持
  game.unlocks.linac = true; 

  saveGame();
  updateUI(0);
  showNotification(t('notif.linacTitle'), t('notif.linacMsg', { val: format(newMult) }), '🌌');
  playSE('linac');
  checkAchievements();
}

function doLinacShift() {
  const shiftReq = getShiftReq();
  if ((game.linacs || 0) < shiftReq) return;
  const currentBase = getLinacBaseMult();
  const nextBase = currentBase + getShiftIncrement();

  if (!game.settings.skipShiftConf) {
    showModal({
      title: t('notif.shiftConfirmTitle'),
      body: t('notif.shiftConfirmBody', { cur: format(currentBase), next: format(nextBase) }),
      buttons: [
        { label: t('common.cancel'), onClick: closeModal },
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
  setParticles(new Decimal(20));
  game.generators.forEach(gen => {
    gen.amount = 0;
    gen.bought = 0;
    gen.production = 1; 
  });
  
  game.unlocks.linac = true; 

  saveGame();
  updateUI(0);
  showNotification(t('notif.shiftTitle'), t('notif.shiftMsg', { val: format(nextBase) }), '🔄');
  playSE('shift');
  checkAchievements();
  
  if (!game.settings.skipShiftConf) {
    showModal({
      title: t('notif.shiftCompleteTitle'),
      body: t('notif.shiftCompleteBody', { val: format(nextBase) }),
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

  // レベル制購入（購入毎にコストが2倍・最大レベルまで）
  if (getUpgradeLevel(id) >= INF_UPGRADE_MAX_LEVEL) return;
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
  if(pDisplay) pDisplay.textContent = t('main.particleDisplay', { val: format(game.particles) });
  
  const ppsDisplay = document.getElementById('pps-display');
  if(ppsDisplay) ppsDisplay.textContent = t('main.ppsDisplay', { val: format(pps) });

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

  // Infinityまでの進捗バー
  const infProgressContainer = document.getElementById('infinity-progress-container');
  if (infProgressContainer) {
    const breakActive = (typeof isBreakInfinityActive === 'function' && isBreakInfinityActive());
    if (breakActive) {
      infProgressContainer.style.display = 'none';
    } else {
      infProgressContainer.style.display = 'block';
      const ratio = getInfinityProgressRatio();
      const pct = ratio * 100;
      const fill = document.getElementById('infinity-progress-fill');
      if (fill) fill.style.width = `${pct}%`;
      const pctEl = document.getElementById('infinity-progress-percent');
      if (pctEl) pctEl.textContent = `${pct.toFixed(pct >= 100 ? 0 : 2)}%`;
    }
  }

  // シフトバー表示
  const shiftStatusBar = document.getElementById('shift-status');
  if (shiftStatusBar) {
    if ((game.shifts || 0) > 0) {
      shiftStatusBar.style.display = 'flex';
      const baseMult = getLinacBaseMult();
      const shiftMultEl = document.getElementById('shift-mult-display');
      if (shiftMultEl) shiftMultEl.textContent = `x${format(baseMult)}`;
      const shiftCountEl = document.getElementById('shift-count');
      if (shiftCountEl) shiftCountEl.textContent = game.shifts || 0;
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
        btnLinac.textContent = t('main.linac');
        if (amtGte(game.generators[7].amount, linacReq)) {
          btnLinac.classList.remove('disabled');
          btnLinac.title = t('notif.linacResetTitle', { val: format(baseMult) });
          btnLinac.onclick = doLinac;
        } else {
          btnLinac.classList.add('disabled');
          btnLinac.title = t('notif.linacDisabledTitle', { req: linacReq });
          btnLinac.onclick = null;
        }
      }

      const btnShift = document.getElementById('btn-shift');
      if (btnShift) {
        if (game.linacs >= shiftReq) {
          btnShift.style.display = 'inline-block';
          const nextBase = baseMult + getShiftIncrement();
          btnShift.textContent = t('main.shift');
          btnShift.title = t('notif.shiftNextTitle', { val: format(nextBase) });
        } else {
          btnShift.style.display = 'none';
        }
      }

      // ビッグクランチボタン（Break Infinity解放後、粒子数が1.79e308を超えたら表示）
      // 通常時は上限到達で自動的にBig Crunchするため、このボタンはBreak Infinity解放後にのみ現れる。
      const btnBigCrunch = document.getElementById('btn-bigcrunch');
      const bigCrunchMultEl = document.getElementById('bigcrunch-mult-inline');
      const breakActiveNow = (typeof isBreakInfinityActive === 'function' && isBreakInfinityActive());
      const overCrunchCap = breakActiveNow && toDecimal(game.particles).gte(BREAK_INFINITY_CRUNCH_BASE);
      if (btnBigCrunch) {
        if (overCrunchCap) {
          btnBigCrunch.style.display = 'inline-block';
          btnBigCrunch.textContent = t('main.bigCrunch');
          const mult = getBigCrunchMultiplier();
          btnBigCrunch.title = t('main.bigCrunchTitle', { mult: format(mult.lt(1) ? new Decimal(1) : mult) });
          if (bigCrunchMultEl) {
            bigCrunchMultEl.style.display = 'inline-block';
            bigCrunchMultEl.textContent = `x${format(mult.lt(1) ? new Decimal(1) : mult)}`;
          }
        } else {
          btnBigCrunch.style.display = 'none';
          if (bigCrunchMultEl) bigCrunchMultEl.style.display = 'none';
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
          autoBadge.textContent = t('auto.on');
        } else {
          autoBadge.classList.add('inactive');
          autoBadge.textContent = t('auto.off');
        }
      } else {
        const th = Number('1e' + (50 + index * 10));
        autoBadge.textContent = t('auto.required', { val: format(th) });
      }
    }

    const amtEl = document.getElementById(`amount-${index}`);
    if(amtEl) amtEl.textContent = t('common.owned', { val: format(gen.amount) });

    const perGenMult = getPerGenInfMult(index);
    const totalInfMult = mulSafe(globalInfMult, perGenMult);
    const totalGenMult = mulSafe(gen.production, currentLinacMult, totalInfMult, challengeMult);
    
    const multEl = document.getElementById(`mult-${index}`);
    if(multEl) multEl.textContent = `x${format(totalGenMult)}`;

    const linacEl = document.getElementById(`mult-linac-${index}`);
    if (linacEl) {
        if (amtGt(currentLinacMult, 1)) {
            linacEl.style.display = 'block';
            linacEl.textContent = t('badge.linacMult', { val: format(currentLinacMult) });
        } else {
            linacEl.style.display = 'none';
        }
    }

    const infEl = document.getElementById(`mult-inf-${index}`);
    if (infEl) {
        if (totalInfMult > 1) {
            infEl.style.display = 'block'; 
            infEl.textContent = t('badge.infMult', { val: format(totalInfMult) });
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
        btn.textContent = t('common.buyCount', { count: format(affordableCount), cost: format(affordableCost) });
        btn.classList.remove('disabled');
      } else {
        btn.textContent = t('common.buyUnavailable');
        btn.classList.add('disabled');
      }
    } else {
      // x1/x10/x100は常に目標数量分の価格を表示し、不足時はボタンのみ無効化する
      // （実際のクリック時は購入可能な分だけ購入される）
      const fullCost = getBulkCost(gen, mode);
      btn.textContent = t('common.buyCount', { count: mode, cost: format(fullCost) });
      if (affordableCount > 0) btn.classList.remove('disabled'); else btn.classList.add('disabled');
    }
  });
}

function updateStats() {
  const currentRunTime = (Date.now() - game.stats.startTime) / 1000;
  document.getElementById('stat-time').textContent = `${formatTime(currentRunTime)}`;
  document.getElementById('stat-total-playtime').textContent = formatTime(game.stats.totalTimePlayed || 0);
  document.getElementById('stat-total').textContent = format(game.stats.totalParticles);
  document.getElementById('stat-current-pps').textContent = `${format(currentPPSValue)} ${t('stats.perSec')}`;
  document.getElementById('stat-highest-pps').textContent = `${format(game.stats.highestPPS || 0)} ${t('stats.perSec')}`;
  document.getElementById('stat-highest-particles').textContent = format(game.stats.highestParticles || 0);

  const statPrestige = document.getElementById('stat-prestige');
  const rowPrestige = document.getElementById('row-prestige');
  if (game.stats.totalLinacs > 0 && statPrestige && rowPrestige) {
    rowPrestige.style.display = 'flex';
    statPrestige.textContent = `${game.stats.totalLinacs} ${t('stats.timesSuffix')}`;
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
    statShift.textContent = `${game.shifts} ${t('stats.timesSuffix')}`;
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
        row.innerHTML = `<span class="stat-label">${t('stats.totalMkPurchased', { mk: mkLabel })}</span><span id="stat-mk-${i}" class="stat-val">0</span>`;
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
    document.getElementById('stat-crunch').textContent = `${game.infinity.crunchCount} ${t('stats.timesSuffix')}`;
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
            <div class="inf-desc">${getUpgradeTitle(up)}${up.leveled ? '' : `: ${getUpgradeDesc(up)}`}</div>
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

        if (effectEl) effectEl.textContent = t('inf.currentEffect', { val: up.formatEffect(currentEffect) });
        if (costEl) costEl.textContent = bought ? t('inf.bought') : t('inf.cost', { val: format(cost) });
      } else {
        // レベル制購入（最大レベルまで購入可能・コストは購入毎に2倍）
        const level = getUpgradeLevel(up.id);
        const isMaxLevel = level >= INF_UPGRADE_MAX_LEVEL;
        btn.classList.remove('bought');
        btn.classList.toggle('disabled', isMaxLevel || currentIP.lt(cost));

        let currentEffect = 1, nextEffect = 1;
        try { currentEffect = up.effect(game); } catch(e){}
        try { nextEffect = up.nextEffect(game); } catch(e){}

        if (effectEl) {
          effectEl.innerHTML = isMaxLevel
            ? t('inf.levelLineMax', { level: level, cur: up.formatEffect(currentEffect) })
            : t('inf.levelLine', { level: level, cur: up.formatEffect(currentEffect), next: up.formatEffect(nextEffect) });
        }
        if (costEl) costEl.textContent = isMaxLevel ? t('inf.maxLevel') : t('inf.cost', { val: format(cost) });
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
  
  // 通常のIP獲得量に、Big Crunch倍率（1.79e308を何個分保持していたか・切り捨て）を掛ける。
  // Break Infinity未解放時や、ちょうど上限到達時点でのCrunchは倍率1のため、既存の挙動と変わらない。
  const baseGainedIP = Math.pow(2, getUpgradeLevel(9));
  let crunchMult = getBigCrunchMultiplier();
  if (crunchMult.lt(1)) crunchMult = new Decimal(1);
  let gainedIP = mulSafe(baseGainedIP, crunchMult);
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
      showNotification(t('notif.challengeCompleteTitle'), t('notif.challengeCompleteMsg', { title: getChallengeTitle(c), reward: getChallengeRewardLabel(c) }), '🏅', 'achievement');
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
      title: t('notif.crunchCompleteTitle'),
      body: t('notif.crunchCompleteBody', { gained: format(gainedIP), total: format(game.infinity.ip) }),
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

  setParticles(new Decimal(10));
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
  if (suppressUnloadSave) return; // リセット/インポート後のreload待ち中は、古いgameで上書き保存しない
  if(isCrunching && isAuto) return;
  game.lastTick = Date.now();
  game.lastSaveTime = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game));
    if (!isAuto) {
      const s = document.getElementById('save-status');
      if(s) {
        s.textContent = t('settings.savedStatus');
        setTimeout(() => s.textContent = t('settings.autosaveStatus'), 2000);
      }
      showNotification(t('notif.savedTitle'), '', '💾');
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
      game.themes = { ...fresh.themes, ...(parsed.themes || {}) };
      if (!Array.isArray(game.themes.owned)) game.themes.owned = ['default'];
      if (!game.themes.owned.includes('default')) game.themes.owned.unshift('default');
      if (!game.themes.selected || !THEMES.some(th => th.id === game.themes.selected) || !game.themes.owned.includes(game.themes.selected)) {
        game.themes.selected = 'default';
      }
      game.lastSaveTime = (typeof parsed.lastSaveTime === 'number') ? parsed.lastSaveTime : Date.now();
      game.timeFlux = {
        time: (parsed.timeFlux && typeof parsed.timeFlux.time === 'number') ? parsed.timeFlux.time : 0,
        speed: (parsed.timeFlux && typeof parsed.timeFlux.speed === 'number') ? parsed.timeFlux.speed : 1,
        capLevel: (parsed.timeFlux && typeof parsed.timeFlux.capLevel === 'number' && parsed.timeFlux.capLevel >= 0) ? parsed.timeFlux.capLevel : 0
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
      // gameはスプレッドで毎回新規オブジェクトとして作られるため、直接代入からの
      // 保護（get/setによるゲート制御）もロード完了後に必ずかけ直す
      protectParticlesField(game);

      // Infinity Points（IP）もDecimalで保持し、1.78e308を超えて蓄積できるようにする
      game.infinity.ip = decimalFromSaved(parsed.infinity && parsed.infinity.ip, 0);

      if (game.settings.skipLinacConf === undefined) game.settings.skipLinacConf = false;
      if (game.settings.skipShiftConf === undefined) game.settings.skipShiftConf = false;
      if (game.settings.skipCrunchAnim === undefined) game.settings.skipCrunchAnim = false;
      if (game.settings.glitchEffect === undefined) game.settings.glitchEffect = true;
      if (game.settings.sfxEnabled === undefined) game.settings.sfxEnabled = true;
      if (game.settings.bgmEnabled === undefined) game.settings.bgmEnabled = true;
      if (game.settings.autoLinacEnabled === undefined) game.settings.autoLinacEnabled = true;
      if (!['small', 'medium', 'large'].includes(game.settings.particleDisplaySize)) game.settings.particleDisplaySize = 'medium';
      if (!game.settings.lang || !SUPPORTED_LANGS.includes(game.settings.lang)) game.settings.lang = getLang();

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
            // amount/productionはDecimalとして保存されている場合、JSON化で文字列や
            // {mantissa,exponent}になっている。生のまま使うと以降の演算がInfinity化・
            // 文字列比較化して壊れるため、必ずDecimal/number正しい型へ復元する。
            amount: restoreBigField(g.amount, 0),
            production: restoreBigField(g.production, 1),
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
      const sizeSel = document.getElementById('particle-size-select');
      if(sizeSel) sizeSel.value = game.settings.particleDisplaySize;
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
    title: t('notif.hardResetTitle'),
    body: t('notif.hardResetBody'),
    buttons: [
      { label: t('common.cancel'), onClick: closeModal },
      { label: t('notif.hardResetConfirm'), primary: true, danger: true, onClick: () => {
          closeModal();
          suppressUnloadSave = true; // reload直前のbeforeunloadで古いgameが再セーブされないようにする
          localStorage.removeItem(SAVE_KEY);
          showNotification(t('notif.resetTitle'), '', '♻️');
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
    suppressUnloadSave = true; // reload直前のbeforeunloadで現在のgameがインポートデータを上書きしないようにする
    localStorage.setItem(SAVE_KEY, decoded);
    showNotification(t('notif.loadedTitle'), '', '📂');
    setTimeout(() => location.reload(), 600);
  } catch(e) {
    showModal({
      title: t('common.error'),
      body: t('notif.invalidData'),
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
      showNotification(t('notif.achievementUnlocked', { title: getAchTitle(a) }), `${getAchDesc(a)}<br>+${pts} AP`, '🏆', 'achievement');
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
          <div class="ach-card-title">${getAchTitle(a)}</div>
          <div class="ach-card-desc">${getAchDesc(a)}</div>
          <div class="ach-card-points">+${(typeof a.points === 'number') ? a.points : 10} AP</div>
        </div>
        <div class="ach-card-status">${t('ach.locked')}</div>
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
    if (statusEl) statusEl.textContent = unlocked ? t('ach.unlocked') : t('ach.locked');
  });

  const countTextEl = document.getElementById('ach-count-text');
  if (countTextEl) {
    countTextEl.innerHTML = t('ach.unlockedCount', { count: `<span id="ach-unlocked-count">${unlockedCount}</span>`, total: `<span id="ach-total-count">${ACHIEVEMENTS.length}</span>` });
  }
}

// ショップ画面の描画（実績ポイント/APの表示とテーマ一覧）
function updateShopTab() {
  const apEl = document.getElementById('shop-ap-display');
  if (apEl) apEl.textContent = format((typeof game.achievementPoints === 'number') ? game.achievementPoints : 0);
  updateThemeGrid();
}

// --- テーマ ---

// --- レインボーテーマ: --color-main / --color-main-rgb を継続的に更新して色を変化させる ---
// 単色テーマの切り替えと全く同じ「--color-mainを書き換える」だけの仕組みを使うことで、
// 背景色やgold/danger等の無関係な色が場所によってズレて見えることがないようにする
// （filter:hue-rotate()で画面全体を回すと、無関係な色までズレてしまうため使わない）。
let rainbowAnimTimer = null;
let rainbowHue = 0;

function hslToRgbComponents(h, s, l) {
  h = (h % 360) / 360;
  const hue2rgb = (p, q, tt) => {
    let t = tt;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, h + 1 / 3);
  const g = hue2rgb(p, q, h);
  const b = hue2rgb(p, q, h - 1 / 3);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function startRainbowAnimation() {
  if (rainbowAnimTimer) return; // 既に動作中なら何もしない
  const root = document.documentElement;
  rainbowAnimTimer = setInterval(() => {
    rainbowHue = (rainbowHue + 1) % 360;
    const [r, g, b] = hslToRgbComponents(rainbowHue, 1, 0.6);
    root.style.setProperty('--color-main', `rgb(${r}, ${g}, ${b})`);
    root.style.setProperty('--color-main-rgb', `${r}, ${g}, ${b}`);
  }, 80); // 360ステップ×80ms ≒ 約29秒で一周
}

function stopRainbowAnimation() {
  if (rainbowAnimTimer) { clearInterval(rainbowAnimTimer); rainbowAnimTimer = null; }
}

// --- 自然テーマ: 落ち葉のパーティクルを継続的に生成する ---
let natureLeafTimer = null;
let natureLeafLayer = null;

function ensureNatureLeafLayer() {
  if (natureLeafLayer && document.body.contains(natureLeafLayer)) return natureLeafLayer;
  const layer = document.createElement('div');
  layer.id = 'nature-leaves-layer';
  document.body.appendChild(layer);
  natureLeafLayer = layer;
  return layer;
}

function spawnNatureLeaf() {
  const layer = ensureNatureLeafLayer();
  const leaf = document.createElement('div');
  leaf.className = 'nature-leaf';
  leaf.textContent = Math.random() < 0.5 ? '🍂' : '🍃';
  const duration = 8 + Math.random() * 6; // 8〜14秒かけて落ちる
  const sway = 20 + Math.random() * 40;   // 揺れ幅(px)
  const size = 14 + Math.random() * 10;
  leaf.style.left = `${Math.random() * 100}vw`;
  leaf.style.fontSize = `${size}px`;
  leaf.style.setProperty('--leaf-sway', `${sway}px`);
  leaf.style.animationDuration = `${duration}s`;
  layer.appendChild(leaf);
  setTimeout(() => { if (leaf.parentNode) leaf.parentNode.removeChild(leaf); }, (duration + 0.5) * 1000);
}

function startNatureAnimation() {
  if (natureLeafTimer) return; // 既に動作中なら何もしない
  ensureNatureLeafLayer();
  spawnNatureLeaf();
  natureLeafTimer = setInterval(spawnNatureLeaf, 700);
}

function stopNatureAnimation() {
  if (natureLeafTimer) { clearInterval(natureLeafTimer); natureLeafTimer = null; }
  if (natureLeafLayer) {
    natureLeafLayer.remove();
    natureLeafLayer = null;
  }
}

// game.themes.selected の色を実際にCSS変数へ反映する
function applyTheme(id) {
  const theme = THEMES.find(th => th.id === id) || THEMES[0];
  const root = document.documentElement;

  // レインボー／自然以外に切り替えたら、それぞれのアニメーションを必ず停止する
  if (theme.id !== 'rainbow') stopRainbowAnimation();
  if (theme.id !== 'nature') stopNatureAnimation();

  // 特殊テーマ（背景・フォント一括変更）用のbodyクラスを管理する。
  // 単色テーマに切り替えたときは、以前の特殊テーマのクラスを必ず外す。
  const body = document.body;
  if (body) {
    THEMES.forEach(th => { if (th.cssClass) body.classList.remove(th.cssClass); });
    if (theme.special && theme.cssClass) body.classList.add(theme.cssClass);
  }

  if (theme.id === 'rainbow') {
    // レインボーは単色スワップと同じ--color-main/--color-main-rgbを、
    // JSで継続的に書き換えることで色を変化させる（他の色には一切触れない）
    startRainbowAnimation();
  } else {
    root.style.setProperty('--color-main', theme.color);
    root.style.setProperty('--color-main-rgb', theme.rgb);
  }

  if (theme.id === 'nature') startNatureAnimation();
}

function updateThemeGrid() {
  const grid = document.getElementById('theme-grid');
  if (!grid) return;
  if (!game.themes) game.themes = { owned: ['default'], selected: 'default' };

  if (!grid.dataset.initialized) {
    grid.dataset.initialized = '1';
    THEMES.forEach(theme => {
      const card = document.createElement('div');
      card.className = 'theme-card';
      card.id = `theme-card-${theme.id}`;
      card.style.setProperty('--theme-swatch-color', theme.color);
      card.innerHTML = `
        <div class="theme-swatch"></div>
        <div class="theme-card-name">${getThemeName(theme)}</div>
        <div class="theme-card-status" id="theme-status-${theme.id}"></div>
      `;
      card.onclick = () => onThemeCardClick(theme.id);
      grid.appendChild(card);
    });
  }

  const currentAP = (typeof game.achievementPoints === 'number') ? game.achievementPoints : 0;
  THEMES.forEach(theme => {
    const card = document.getElementById(`theme-card-${theme.id}`);
    const statusEl = document.getElementById(`theme-status-${theme.id}`);
    if (!card || !statusEl) return;
    const owned = game.themes.owned.includes(theme.id);
    const equipped = game.themes.selected === theme.id;
    const affordable = currentAP >= theme.cost;

    card.classList.toggle('owned', owned);
    card.classList.toggle('equipped', equipped);
    card.classList.toggle('affordable', affordable);

    if (equipped) statusEl.textContent = t('shop.equipped');
    else if (owned) statusEl.textContent = t('shop.equip');
    else statusEl.textContent = `${t('shop.buy')} (${theme.cost} AP)`;
  });
}

function onThemeCardClick(id) {
  if (!game.themes) game.themes = { owned: ['default'], selected: 'default' };
  if (game.themes.owned.includes(id)) {
    equipTheme(id);
  } else {
    buyTheme(id);
  }
}

function buyTheme(id) {
  const theme = THEMES.find(th => th.id === id);
  if (!theme || !game.themes) return;
  if (game.themes.owned.includes(id)) { equipTheme(id); return; }

  const currentAP = (typeof game.achievementPoints === 'number') ? game.achievementPoints : 0;
  if (currentAP < theme.cost) {
    if (typeof playSE === 'function') playSE('error');
    return;
  }

  game.achievementPoints = currentAP - theme.cost;
  game.themes.owned.push(id);
  game.themes.selected = id;
  applyTheme(id);
  if (typeof playSE === 'function') playSE('buy');
  if (typeof saveGame === 'function') saveGame(true);
  updateThemeGrid();
  const apEl = document.getElementById('shop-ap-display');
  if (apEl) apEl.textContent = format(game.achievementPoints);
  if (typeof showNotification === 'function') {
    showNotification(t('notif.themeBoughtTitle'), t('notif.themeBoughtMsg', { name: getThemeName(theme) }), '🎨');
  }
}

function equipTheme(id) {
  const theme = THEMES.find(th => th.id === id);
  if (!theme || !game.themes || !game.themes.owned.includes(id)) return;
  if (game.themes.selected === id) return;

  game.themes.selected = id;
  applyTheme(id);
  if (typeof playSE === 'function') playSE('toggle');
  if (typeof saveGame === 'function') saveGame(true);
  updateThemeGrid();
  if (typeof showNotification === 'function') {
    showNotification(t('notif.themeEquippedTitle'), t('notif.themeEquippedMsg', { name: getThemeName(theme) }), '🎨');
  }
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
        <div class="challenge-card-num">${t('challenge.number', { num: c.number || (i + 1) })}</div>
        <div class="challenge-card-title">${getChallengeTitle(c)}</div>
        <div class="challenge-card-effect">${getChallengeEffectLabel(c)}</div>
        <div class="challenge-card-reward-label">${t('challenge.rewardLabel')}</div>
        <div class="challenge-card-reward-value">${getChallengeRewardLabel(c)}</div>
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
      btn.textContent = t('challenge.clear');
      btn.classList.add('disabled');
      btn.onclick = null;
    } else if (active) {
      btn.textContent = t('challenge.exit');
      btn.classList.remove('disabled');
      btn.onclick = () => exitChallenge(c.id);
    } else {
      btn.textContent = t('challenge.start');
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
    title: t('challenge.number', { num: c.number || '' }),
    body: t('challenge.startConfirmBody'),
    buttons: [
      { label: t('common.cancel'), onClick: closeModal },
      { label: t('common.ok'), primary: true, onClick: () => { closeModal(); executeStartChallenge(id); } }
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

  setParticles(new Decimal(c.startParticles || 10));
  game.linacs = 0;
  game.shifts = 0;
  game.stats.startTime = Date.now();
  game.stats.lastLinacCycleStart = Date.now();
  game.generators = getInitialGenerators().map((g, i) => ({
    ...g,
    autoUnlocked: preservedAuto[i] ? preservedAuto[i].autoUnlocked : g.autoUnlocked,
    autoActive: preservedAuto[i] ? preservedAuto[i].autoActive : g.autoActive
  }));

  // Infinity強化・所持IPはチャレンジ開始で失われない（現在の宇宙のみリセットする）
  if (!game.infinity) game.infinity = { ip: 0, crunchCount: 0, bestTime: null, upgrades: [], levels: {}, broken: false };

  game.challenge.active = id;

  saveGame();
  updateUI(0);
  updateInfinityTab();
  updateChallengeTab();
  showNotification(t('notif.challengeStartTitle'), getChallengeTitle(c), '🎯');
  playSE('challenge');
}

// チャレンジを途中で中断する（確認ダイアログ経由）
function exitChallenge(id) {
  if (!game.challenge || game.challenge.active !== id) return;
  const c = CHALLENGES.find(ch => ch.id === id);
  if (!c) return;

  showModal({
    title: t('challenge.number', { num: c.number || '' }),
    body: t('challenge.exitConfirmBody'),
    buttons: [
      { label: t('common.cancel'), onClick: closeModal },
      { label: t('common.ok'), primary: true, danger: true, onClick: () => { closeModal(); executeExitChallenge(id); } }
    ]
  });
}

// チャレンジ中断の実処理: 現在の宇宙（粒子・Linac・Shift）をInfinity直後の状態にリセットする。
// クリア扱いにはならず、Infinity強化・所持IPも失われない。
function executeExitChallenge(id) {
  if (!game.challenge || game.challenge.active !== id) return;

  const preservedAuto = game.generators.map(g => ({
    autoUnlocked: g.autoUnlocked,
    autoActive: g.autoActive
  }));

  setParticles(new Decimal(10));
  game.linacs = 0;
  game.shifts = 0;
  game.stats.startTime = Date.now();
  game.stats.lastLinacCycleStart = Date.now();
  game.generators = getInitialGenerators().map((g, i) => ({
    ...g,
    autoUnlocked: preservedAuto[i] ? preservedAuto[i].autoUnlocked : g.autoUnlocked,
    autoActive: preservedAuto[i] ? preservedAuto[i].autoActive : g.autoActive
  }));

  game.challenge.active = null;

  saveGame();
  updateUI(0);
  updateInfinityTab();
  updateChallengeTab();
  showNotification(t('notif.challengeExitTitle'), t('notif.challengeExitMsg'), '🚪');
  playSE('toggle');
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

  if (name === 'shop' && typeof updateShopTab === 'function') updateShopTab();
  if (name === 'cheat' && typeof updateCheatTab === 'function') updateCheatTab();
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

// =========================================================
// --- チート機能 ---
// コンソールから Kaihatusha(2020302) を実行すると、正規の数値変更用
// チートタブ（CHEAT）が解放される。以後はこの画面から粒子数・IP・AP・
// ライナック/シフト回数・Time Flux所持量・各Acceleratorの所持数を
// 直接編集できる。
// particlesはコンソールからの直接代入（例: game.particles = 100）を
// setParticles経由のゲートでブロックしているため、粒子数を変更したい
// 場合もこの画面を使う。
// =========================================================
function unlockCheatTab() {
  const btn = document.getElementById('tab-btn-cheat');
  if (btn) btn.style.display = 'inline-block';
  console.log('%cチート機能を解放しました。「CHEAT」タブから数値を変更できます。', 'color:#ff0055; font-weight:bold;');
  if (typeof switchTab === 'function') switchTab('cheat');
}

window.Kaihatusha = function (code) {
  if (String(code) === '2020302') {
    unlockCheatTab();
    return 'チート機能を解放しました。';
  }
  console.log('%cコードが違います。', 'color:#888;');
  return undefined;
};

// Accelerator(Mk.1〜8)ごとの入力欄を初回だけ生成する
function buildCheatGenList() {
  const container = document.getElementById('cheat-gen-list');
  if (!container || container.dataset.initialized) return;
  container.dataset.initialized = '1';
  game.generators.forEach((g, i) => {
    const row = document.createElement('div');
    row.className = 'cheat-gen-row';
    row.innerHTML = `<label>Mk.${i + 1}</label><input type="text" class="cheat-input" id="cheat-gen-${i}" placeholder="例: 100">`;
    container.appendChild(row);
  });
}

// チートタブを開いたとき、現在の値を各入力欄に反映する
function updateCheatTab() {
  buildCheatGenList();

  const pEl = document.getElementById('cheat-particles');
  if (pEl) pEl.value = toDecimal(game.particles).toString();

  const ipEl = document.getElementById('cheat-ip');
  if (ipEl) ipEl.value = toDecimal(getIP()).toString();

  const apEl = document.getElementById('cheat-ap');
  if (apEl) apEl.value = (typeof game.achievementPoints === 'number') ? game.achievementPoints : 0;

  const linacsEl = document.getElementById('cheat-linacs');
  if (linacsEl) linacsEl.value = game.linacs || 0;

  const shiftsEl = document.getElementById('cheat-shifts');
  if (shiftsEl) shiftsEl.value = game.shifts || 0;

  const tfEl = document.getElementById('cheat-tf-time');
  if (tfEl) tfEl.value = (game.timeFlux && typeof game.timeFlux.time === 'number') ? Math.floor(game.timeFlux.time) : 0;

  game.generators.forEach((g, i) => {
    const el = document.getElementById(`cheat-gen-${i}`);
    if (el) el.value = toDecimal(g.amount).toString();
  });
}

// 「適用する」ボタン: 各入力欄の値を読み取り、ゲーム状態に書き戻す
function applyCheatValues() {
  const statusEl = document.getElementById('cheat-status');

  // 文字列("1e50"や"1234"等)をDecimalへ安全に変換するローカルヘルパー
  function parseInput(id, fallback) {
    const el = document.getElementById(id);
    if (!el || el.value.trim() === '') return null; // 未入力は変更しない
    try {
      const d = Decimal.fromString(el.value.trim());
      if (Number.isNaN(d.mantissa) || Number.isNaN(d.exponent)) return null;
      return d;
    } catch (e) { return null; }
  }

  const newParticles = parseInput('cheat-particles');
  if (newParticles) setParticles(newParticles);

  const newIP = parseInput('cheat-ip');
  if (newIP) {
    if (!game.infinity) game.infinity = { ip: new Decimal(0), crunchCount: 0, bestTime: null, upgrades: [], levels: {} };
    game.infinity.ip = newIP;
  }

  const apEl = document.getElementById('cheat-ap');
  if (apEl && apEl.value.trim() !== '') {
    const ap = Number(apEl.value);
    if (!Number.isNaN(ap) && isFinite(ap)) game.achievementPoints = Math.max(0, Math.floor(ap));
  }

  const linacsEl = document.getElementById('cheat-linacs');
  if (linacsEl && linacsEl.value.trim() !== '') {
    const l = Number(linacsEl.value);
    if (!Number.isNaN(l) && isFinite(l)) game.linacs = Math.max(0, Math.floor(l));
  }

  const shiftsEl = document.getElementById('cheat-shifts');
  if (shiftsEl && shiftsEl.value.trim() !== '') {
    const s = Number(shiftsEl.value);
    if (!Number.isNaN(s) && isFinite(s)) game.shifts = Math.max(0, Math.floor(s));
  }

  const tfEl = document.getElementById('cheat-tf-time');
  if (tfEl && tfEl.value.trim() !== '') {
    const tf = Number(tfEl.value);
    if (!Number.isNaN(tf) && isFinite(tf)) {
      if (typeof ensureTimeFluxState === 'function') ensureTimeFluxState();
      game.timeFlux.time = Math.max(0, tf);
    }
  }

  game.generators.forEach((g, i) => {
    const d = parseInput(`cheat-gen-${i}`);
    if (d) g.amount = d;
  });

  saveGame();
  updateUI(currentPPSValue || 0);
  updateStats();
  updateAchievementsTab();
  updateInfinityTab();
  updateTimeFluxTab();
  updateCheatTab();

  if (statusEl) {
    statusEl.textContent = `適用しました (${new Date().toLocaleTimeString()})`;
    statusEl.style.color = '#00ff9d';
  }
  if (typeof playSE === 'function') playSE('buy');
}

// 設定画面（演出スキップ）＆ Automation画面（自動化）の UI生成
function initSettingsUI() {
  const toggleContainer = document.getElementById('setting-toggles-container');
  const accelList = document.getElementById('auto-accel-list');
  const glitchContainer = document.getElementById('glitch-toggle-container');
  const audioContainer = document.getElementById('audio-toggle-container');
  const autoLinacContainer = document.getElementById('auto-linac-toggle-container');
  if (!toggleContainer && !accelList && !glitchContainer && !audioContainer && !autoLinacContainer) return;

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
      showNotification(t('notif.settingsSaved'), '', '⚙️');
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
    glitchContainer.appendChild(createToggle('chk-glitch', t('settings.glitchToggle'), 'glitchEffect'));
  }

  // SE・BGMのON/OFF切り替え
  if (audioContainer && !audioContainer.dataset.initialized) {
    audioContainer.dataset.initialized = '1';
    audioContainer.appendChild(createToggle('chk-sfx', t('settings.sfxToggle'), 'sfxEnabled'));
    audioContainer.appendChild(createToggle('chk-bgm', t('settings.bgmToggle'), 'bgmEnabled'));
  }

  // 演出スキップ（設定画面）
  // それぞれ該当する演出を一度でも体験してから表示する（未体験の項目は表示しない）
  if (toggleContainer && !toggleContainer.dataset.initialized) {
    toggleContainer.dataset.initialized = '1';
    toggleContainer.appendChild(createToggle('chk-linac', t('settings.skipLinac'), 'skipLinacConf'));
    toggleContainer.appendChild(createToggle('chk-shift', t('settings.skipShift'), 'skipShiftConf'));
    toggleContainer.appendChild(createToggle('chk-crunch', t('settings.skipCrunch'), 'skipCrunchAnim'));
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
        <span id="auto-accel-badge-${index}" class="auto-badge">${t('auto.required', { val: `1e${50 + index * 10}` })}</span>
      `;
      accelList.appendChild(row);
    });
  }

  // 自動ライナック（Challenge 3クリアで解放）のON/OFF切り替え
  if (autoLinacContainer && !autoLinacContainer.dataset.initialized) {
    autoLinacContainer.dataset.initialized = '1';
    autoLinacContainer.appendChild(createToggle('chk-auto-linac', t('auto.linacToggleLabel'), 'autoLinacEnabled'));
  }

  // 未解放時はタブ自体を非表示にする（Coming Soon等は表示しない・空白も作らない）
  updateAutomationSectionVisibility();
  updateAutoLinacVisibility();
}

// 自動ライナックUI（Automation画面）の表示/非表示を、Challenge 3クリア状況に応じて切り替える
function updateAutoLinacVisibility() {
  const container = document.getElementById('auto-linac-container');
  if (container) container.style.display = isAutoLinacUnlocked() ? 'block' : 'none';
}

// 自動化画面の内容を毎フレーム更新（Accelerator一覧の状態表示）
function updateAutomationTab() {
  updateAutoLinacVisibility();
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
        badge.textContent = t('auto.on');
      } else {
        badge.classList.add('inactive');
        badge.textContent = t('auto.off');
      }
    } else {
      const th = Number('1e' + (50 + index * 10));
      badge.textContent = t('auto.required', { val: format(th) });
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
  return !!(game.generators && game.generators.some(g => g.autoUnlocked)) || isAutoLinacUnlocked();
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
    if (isChallengeAutomationDisabled()) return; // Challenge 3中はMキーでの最大購入を無効化する
    game.generators.forEach((_, i) => buyMaxGenerator(i));
    for(let i=0; i<8; i++) animateButton(i);
  }
  if (key === 's') {
    e.preventDefault();
    saveGame();
    const s = document.getElementById('save-status');
    if(s) {
        s.textContent = t('settings.quickSaveStatus');
        s.style.color = "#00ff9d";
        setTimeout(() => { 
            s.textContent = t('settings.autosaveStatus'); 
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
  { req: 0, key: 'news.0' },
  { req: 0, key: 'news.1' },
  { req: 0, key: 'news.2' },
  { req: 0, key: 'news.3' },
  { req: 50, key: 'news.4' },
  { req: 100, key: 'news.5' },
  { req: 500, key: 'news.6' },
  { req: 1000, key: 'news.7' },
  { req: 5000, key: 'news.8' },
  { req: 1e4, key: 'news.9' },
  { req: 5e4, key: 'news.10' },
  { req: 1e5, key: 'news.11' },
  { req: 5e5, key: 'news.12' },
  { req: 1e6, key: 'news.13' },
  { req: 1e7, key: 'news.14' },
  { req: 1e8, key: 'news.15' },
  { req: 1e9, key: 'news.16' },
  { req: 1e10, key: 'news.17' },
  { req: 1e11, key: 'news.18' },
  { req: 1e12, key: 'news.19' },
  { req: 1e13, key: 'news.20' },
  { req: 1e14, key: 'news.21' },
  { req: 1e15, key: 'news.22' },
  { req: 1e18, key: 'news.23' },
  { req: 1e20, key: 'news.24' },
  { req: 1e22, key: 'news.25' },
  { req: 1e25, key: 'news.26' },
  { req: 1e30, key: 'news.27' },
  { req: 1e50, key: 'news.28' },
  { req: 1e60, key: 'news.29' },
  { req: 1e80, key: 'news.30' },
  { req: 1e100, key: 'news.31' },
  { req: 1e150, key: 'news.32' },
  { req: 1e200, key: 'news.33' },
  { req: 1e250, key: 'news.34' },
  { req: 1e300, key: 'news.35' },
];

function updateNewsText() {
  const content = document.getElementById('news-content');
  if (!content) return;
  const availableNews = NEWS_DATA.filter(n => toDecimal(game.particles).gte(n.req));
  if (availableNews.length === 0) return;
  const randIndex = Math.floor(Math.random() * availableNews.length);
  content.textContent = t(availableNews[randIndex].key);
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
        <span id="auto-badge-${index}" class="auto-badge">${t('auto.required', { val: `1e${50 + index*10}` })}</span>
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
        ${t('common.buyOne')}
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

// 言語切り替え時に、一度だけ生成される動的UI（実績・チャレンジ・強化・自動化など）を
// 作り直して新しい言語の文言で再描画する
function rebuildDynamicUI() {
  ['achievements-list', 'challenge-list', 'infinity-upgrades-container',
   'accel-stats-list', 'auto-accel-list', 'setting-toggles-container',
   'glitch-toggle-container', 'audio-toggle-container', 'theme-grid',
   'auto-linac-toggle-container'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.innerHTML = ''; el.dataset.initialized = ''; }
  });
  if (typeof initSettingsUI === 'function') initSettingsUI();
  if (typeof updateAchievementsTab === 'function') updateAchievementsTab();
  if (typeof updateChallengeTab === 'function') updateChallengeTab();
  if (typeof updateInfinityTab === 'function') updateInfinityTab();
  if (typeof updateStats === 'function') updateStats();
  if (typeof updateAutomationTab === 'function') updateAutomationTab();
  if (typeof updateShopTab === 'function') updateShopTab();
  if (typeof updateTimeFluxTab === 'function') updateTimeFluxTab();
  if (typeof updateBreakInfinityTab === 'function') updateBreakInfinityTab();
  if (typeof updateBreakInfinityUnlockSection === 'function') updateBreakInfinityUnlockSection();
  if (typeof updateUI === 'function') updateUI(currentPPSValue);
  if (typeof updateNewsText === 'function') updateNewsText();
}

function init() {
  console.log("Game Initializing...");

  // 起動演出の最中に判定しておく（loadGame()実行前＝セーブも言語設定も無ければ初回起動とみなす）
  const isFirstLaunch = !localStorage.getItem(SAVE_KEY) && !localStorage.getItem(LANG_STORAGE_KEY);

  // セーブデータの読込を先に行い、解放済みのAcceleratorだけを描画する
  loadGame();

  if (!game.themes) game.themes = { owned: ['default'], selected: 'default' };
  applyTheme(game.themes.selected);
  applyParticleDisplaySize(game.settings.particleDisplaySize);

  document.documentElement.lang = getLang();
  applyStaticTranslations();

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

  // 起動演出（ロゴ表示）が終わってから、初回起動なら言語選択、それ以外は通常通りゲームへ進む
  finishBootSequence(isFirstLaunch);
}

const BOOT_SPLASH_MIN_MS = 1900;  // ロゴ演出を最低これだけ見せてから消す
const BOOT_SPLASH_FADE_MS = 700;  // フェードアウトのtransition時間（CSS側と合わせる）

function finishBootSequence(isFirstLaunch) {
  setTimeout(() => {
    const splash = document.getElementById('boot-splash');
    if (splash) splash.classList.add('fade-out');
    setTimeout(() => {
      if (splash) splash.style.display = 'none';
      if (isFirstLaunch) {
        showInitialLangSelect();
      } else {
        proceedPastBoot();
      }
    }, BOOT_SPLASH_FADE_MS);
  }, BOOT_SPLASH_MIN_MS);
}

// 初回起動時のみ表示する言語選択オーバーレイ
function showInitialLangSelect() {
  const overlay = document.getElementById('lang-select-overlay');
  if (!overlay) { proceedPastBoot(); return; }
  overlay.classList.add('active');
}

// 言語選択ボタン（index.html）から呼ばれる
function selectInitialLang(lang) {
  const overlay = document.getElementById('lang-select-overlay');
  if (overlay) overlay.classList.remove('active');
  if (typeof setLang === 'function') setLang(lang);
  proceedPastBoot();
}

// 起動演出（＋初回言語選択）が完了した後、通常のゲーム開始処理へ進む
function proceedPastBoot() {
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