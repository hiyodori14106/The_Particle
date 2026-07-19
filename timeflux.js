// =========================================================
// timeflux.js
// オフライン進行とTime Flux（TF）システム。
// 既存の simulateTick(dt)（script.js）をそのまま再利用することで、
// 通常プレイ・オフライン進行・Time Warpのあいだで計算コードを
// 重複させない構造にしている。
//
// 依存関係:
//   - グローバル変数 `game` / `simulateTick` / `format` / `formatTime` /
//     `checkAchievements` / `updateUI` などscript.js側の関数を参照する。
//   - このファイルは script.js より先に読み込むこと
//     （script.js の getInitialState() は依存しないが、
//     init() から checkAndShowOfflineProgress() を呼ぶため）。
// =========================================================

const OFFLINE_MAX_SECONDS = 30 * 24 * 3600; // オフライン進行の最大時間（1か月）
const TF_BASE_MAX_SECONDS = 3600;           // Time Fluxの最大所持量の基礎値（1時間）。TFアップグレードで倍加していく
const TF_CAP_UPGRADE_COST_RATIO = 2 / 3;    // TFアップグレード1回の消費量＝その時点の上限の2/3
const OFFLINE_SPEED_STEPS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
const TF_SPEED_STEPS = Array.from({ length: 60 }, (_, i) => i + 1); // ×1〜×60
const OFFLINE_IGNORE_THRESHOLD = 10; // これ未満のオフライン時間は無視して通常起動する

let offlineTotalSeconds = 0;
let offlineSimulatedSeconds = 0;
let offlineSpeed = 1;
let offlineRunning = false;
let offlineAnimFrame = null;

function ensureTimeFluxState() {
  if (!game.timeFlux) game.timeFlux = { time: 0, speed: 1, capLevel: 0 };
  if (typeof game.timeFlux.time !== 'number' || isNaN(game.timeFlux.time)) game.timeFlux.time = 0;
  if (typeof game.timeFlux.speed !== 'number' || isNaN(game.timeFlux.speed)) game.timeFlux.speed = 1;
  if (typeof game.timeFlux.capLevel !== 'number' || isNaN(game.timeFlux.capLevel) || game.timeFlux.capLevel < 0) {
    game.timeFlux.capLevel = 0;
  }
  const max = TF_BASE_MAX_SECONDS * Math.pow(2, game.timeFlux.capLevel);
  if (game.timeFlux.time > max) game.timeFlux.time = max;
  if (game.timeFlux.time < 0) game.timeFlux.time = 0;
}

// TFアップグレードの回数に応じた現在の上限（秒）
function getTFMaxSeconds() {
  ensureTimeFluxState();
  return TF_BASE_MAX_SECONDS * Math.pow(2, game.timeFlux.capLevel);
}

// 次のTFアップグレードに必要な消費量（現在の上限の2/3）
function getTFCapUpgradeCost() {
  return getTFMaxSeconds() * TF_CAP_UPGRADE_COST_RATIO;
}

function canBuyTFCapUpgrade() {
  ensureTimeFluxState();
  return game.timeFlux.time >= getTFCapUpgradeCost();
}

// TFアップグレード購入: 現在の上限の2/3のTFを消費し、上限を2倍にする
function buyTFCapUpgrade() {
  ensureTimeFluxState();
  const cost = getTFCapUpgradeCost();
  if (game.timeFlux.time < cost) return;
  game.timeFlux.time -= cost;
  game.timeFlux.capLevel++;
  if (typeof playSE === 'function') playSE('buy');
  if (typeof saveGame === 'function') saveGame(true);
  updateTimeFluxTab();
  if (typeof showNotification === 'function') {
    showNotification(t('notif.tfUpgradeTitle'), t('notif.tfUpgradeMsg', { max: formatTime(getTFMaxSeconds()) }), '⏱️');
  }
}

// --- オフライン進行の起点: init()の最後から呼ばれる ---
function checkAndShowOfflineProgress() {
  ensureTimeFluxState();

  const last = (typeof game.lastSaveTime === 'number') ? game.lastSaveTime : Date.now();
  let elapsed = (Date.now() - last) / 1000;
  if (!isFinite(elapsed) || elapsed < 0) elapsed = 0;
  if (elapsed > OFFLINE_MAX_SECONDS) elapsed = OFFLINE_MAX_SECONDS;

  // Time Flux獲得: オフラインだった時間と同じだけ（上限1時間、超過分は切り捨て）
  if (elapsed > 0) {
    game.timeFlux.time = Math.min(getTFMaxSeconds(), game.timeFlux.time + elapsed);
  }

  if (elapsed < OFFLINE_IGNORE_THRESHOLD) {
    proceedToNormalGame();
    return;
  }

  offlineTotalSeconds = elapsed;
  offlineSimulatedSeconds = 0;
  offlineSpeed = 1;
  showOfflineOverlay();
}

function showOfflineOverlay() {
  const overlay = document.getElementById('offline-overlay');
  if (!overlay) { proceedToNormalGame(); return; }

  buildOfflineSpeedButtons();
  updateOfflineSpeedButtons();
  updateOfflineDisplay();

  const startBtn = document.getElementById('offline-start-btn');
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.textContent = t('offline.startBtn');
    startBtn.classList.remove('disabled');
  }
  overlay.classList.add('active');
}

function buildOfflineSpeedButtons() {
  const container = document.getElementById('offline-speed-buttons');
  if (!container || container.dataset.initialized) return;
  container.dataset.initialized = '1';
  OFFLINE_SPEED_STEPS.forEach(sp => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'speed-btn';
    btn.textContent = `×${sp}`;
    btn.id = `offline-speed-${sp}`;
    btn.onclick = () => setOfflineSpeed(sp);
    container.appendChild(btn);
  });
}

function updateOfflineSpeedButtons() {
  OFFLINE_SPEED_STEPS.forEach(sp => {
    const btn = document.getElementById(`offline-speed-${sp}`);
    if (btn) btn.classList.toggle('active', sp === offlineSpeed);
  });
}

function setOfflineSpeed(sp) {
  offlineSpeed = sp;
  updateOfflineSpeedButtons();
  if (typeof playSE === 'function') playSE('toggle');
}

function updateOfflineDisplay() {
  const timeEl = document.getElementById('offline-time-display');
  if (timeEl) timeEl.textContent = formatTime(offlineTotalSeconds);

  const pct = offlineTotalSeconds > 0 ? Math.min(100, (offlineSimulatedSeconds / offlineTotalSeconds) * 100) : 100;
  const progressEl = document.getElementById('offline-progress-display');
  if (progressEl) progressEl.textContent = `${pct.toFixed(0)}%`;
  const fill = document.getElementById('offline-progress-fill');
  if (fill) fill.style.width = `${pct}%`;
}

// --- 「開始」: アニメーション付きで進行状況を見せながらシミュレートする ---
function startOfflineSimulation() {
  if (offlineRunning) return;
  offlineRunning = true;
  offlineSimulating = true; // script.js側: 通知・重いDOM更新・SEを抑制するフラグ

  const startBtn = document.getElementById('offline-start-btn');
  if (startBtn) { startBtn.disabled = true; startBtn.textContent = t('offline.inProgress'); startBtn.classList.add('disabled'); }

  offlineStep();
}

function offlineStep() {
  if (offlineSimulatedSeconds >= offlineTotalSeconds) {
    finishOfflineSimulation();
    return;
  }
  // 速度が高いほど、1フレームで多くの秒数をまとめて処理する
  const ticksThisFrame = Math.min(Math.max(2 * offlineSpeed, 1), 20000);
  let processed = 0;
  while (processed < ticksThisFrame && offlineSimulatedSeconds < offlineTotalSeconds) {
    const dt = Math.min(1, offlineTotalSeconds - offlineSimulatedSeconds);
    simulateTick(dt);
    offlineSimulatedSeconds += dt;
    processed++;
  }
  updateOfflineDisplay();

  if (offlineSimulatedSeconds >= offlineTotalSeconds) {
    finishOfflineSimulation();
  } else {
    offlineAnimFrame = requestAnimationFrame(offlineStep);
  }
}

// --- 「スキップ」: 残りを瞬時に一括計算する ---
function skipOfflineSimulation() {
  if (!offlineRunning) {
    offlineSimulating = true;
    offlineRunning = true;
  }
  if (offlineAnimFrame) { cancelAnimationFrame(offlineAnimFrame); offlineAnimFrame = null; }

  while (offlineSimulatedSeconds < offlineTotalSeconds) {
    const dt = Math.min(300, offlineTotalSeconds - offlineSimulatedSeconds);
    simulateTick(dt);
    offlineSimulatedSeconds += dt;
  }
  updateOfflineDisplay();
  finishOfflineSimulation();
}

function finishOfflineSimulation() {
  offlineSimulating = false;
  offlineRunning = false;
  if (offlineAnimFrame) { cancelAnimationFrame(offlineAnimFrame); offlineAnimFrame = null; }

  const overlay = document.getElementById('offline-overlay');
  if (overlay) overlay.classList.remove('active');

  // シミュレーション終了後にまとめて1回だけ画面を更新・保存・通知する
  checkAchievements();
  updateUI(currentPPSValue);
  updateStats();
  updateInfinityTab();
  updateAchievementsTab();
  updateAutomationTab();
  updateChallengeTab();
  if (typeof updateShopTab === 'function') updateShopTab();
  if (typeof updateBreakInfinityTab === 'function') updateBreakInfinityTab();
  if (typeof updateBreakInfinityUnlockSection === 'function') updateBreakInfinityUnlockSection();
  updateTimeFluxTab();

  showNotification(t('notif.welcomeBack'), t('notif.offlineComplete', { time: formatTime(offlineTotalSeconds) }), '⏱️');
  saveGame();

  proceedToNormalGame();
}

function proceedToNormalGame() {
  game.lastTick = Date.now();
  if (typeof switchTab === 'function') switchTab('main');
  if (typeof gameLoop === 'function') gameLoop();
}

// --- Time Flux（TF） ---

// gameLoopから毎フレーム呼ばれる。TF使用中はdtを倍率分だけ加速して返す。
function applyTimeFlux(dt) {
  ensureTimeFluxState();
  if (game.timeFlux.speed > 1 && game.timeFlux.time > 0) {
    const consume = dt * game.timeFlux.speed;
    game.timeFlux.time = Math.max(0, game.timeFlux.time - consume);
    const effectiveDt = dt * game.timeFlux.speed;
    if (game.timeFlux.time <= 0) {
      game.timeFlux.speed = 1; // TFが尽きたら自動的に×1へ戻す
    }
    return effectiveDt;
  }
  return dt;
}

function updateTimeFluxTab() {
  ensureTimeFluxState();
  const max = getTFMaxSeconds();

  const timeEl = document.getElementById('tf-time-display');
  if (timeEl) timeEl.textContent = formatTime(game.timeFlux.time);
  const maxEl = document.getElementById('tf-max-display');
  if (maxEl) maxEl.textContent = formatTime(max);
  const fill = document.getElementById('tf-progress-fill');
  if (fill) fill.style.width = `${Math.min(100, (game.timeFlux.time / max) * 100)}%`;
  const curSpeedEl = document.getElementById('tf-current-speed');
  if (curSpeedEl) curSpeedEl.textContent = `×${game.timeFlux.speed}`;

  buildTimeFluxSpeedButtons();
  updateTimeFluxSpeedButtons();
  updateTFCapUpgradeUI();
}

// TFアップグレード（上限を2倍にする）のUI更新
function updateTFCapUpgradeUI() {
  ensureTimeFluxState();
  const levelEl = document.getElementById('tf-cap-level-display');
  if (levelEl) levelEl.textContent = game.timeFlux.capLevel || 0;

  const canBuy = canBuyTFCapUpgrade();
  const curEl = document.getElementById('tf-cap-current-display');
  if (curEl) curEl.textContent = t('tf.upgradeCurrentMax', { max: formatTime(getTFMaxSeconds()) });
  const nextEl = document.getElementById('tf-cap-next-display');
  if (nextEl) nextEl.textContent = t('tf.upgradeNextMax', { max: formatTime(getTFMaxSeconds() * 2) });
  const costEl = document.getElementById('tf-cap-cost-display');
  if (costEl) costEl.textContent = canBuy
    ? t('tf.upgradeCost', { cost: formatTime(getTFCapUpgradeCost()) })
    : `${t('tf.upgradeCost', { cost: formatTime(getTFCapUpgradeCost()) })}（${t('tf.upgradeInsufficient')}）`;
  const btn = document.getElementById('tf-cap-upgrade-btn');
  if (btn) btn.classList.toggle('disabled', !canBuy);
}

function buildTimeFluxSpeedButtons() {
  const container = document.getElementById('tf-speed-buttons');
  if (!container || container.dataset.initialized) return;
  container.dataset.initialized = '1';
  TF_SPEED_STEPS.forEach(sp => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'speed-btn';
    btn.textContent = `×${sp}`;
    btn.id = `tf-speed-${sp}`;
    btn.onclick = () => setTimeFluxSpeed(sp);
    container.appendChild(btn);
  });
}

function updateTimeFluxSpeedButtons() {
  TF_SPEED_STEPS.forEach(sp => {
    const btn = document.getElementById(`tf-speed-${sp}`);
    if (btn) btn.classList.toggle('active', sp === game.timeFlux.speed);
  });
}

function setTimeFluxSpeed(sp) {
  ensureTimeFluxState();
  if (sp > 1 && game.timeFlux.time <= 0) return; // TFが無ければ加速できない
  game.timeFlux.speed = sp;
  updateTimeFluxSpeedButtons();
  const curSpeedEl = document.getElementById('tf-current-speed');
  if (curSpeedEl) curSpeedEl.textContent = `×${sp}`;
  if (typeof playSE === 'function') playSE('toggle');
}
