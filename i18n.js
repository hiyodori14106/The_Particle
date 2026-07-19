// =========================================================
// i18n.js
// 多言語対応（日本語 / English）。
// 静的なUI文言は data-i18n 系属性 + t() 関数で切り替える。
// 実績・チャレンジ・ニュース等のゲーム内コンテンツは
// { ja: "...", en: "..." } 形式で持たせ、tr() で言語に応じて取り出す。
//
// 依存関係:
//   - このファイルは他の全JSファイルより先に読み込むこと。
//   - game.settings.lang を言語設定として使う（script.js側で初期化）。
// =========================================================

const SUPPORTED_LANGS = ['ja', 'en'];
const LANG_STORAGE_KEY = 'theParticle_lang';

const I18N = {
  ja: {
    // --- ナビゲーション ---
    'nav.main': 'メイン',
    'nav.stats': '統計',
    'nav.achievements': '実績',
    'nav.shop': 'ショップ',
    'nav.timeflux': 'Time Flux',
    'nav.infinity': '∞ INFINITY',
    'nav.challenge': 'チャレンジ',
    'nav.automation': '自動化',
    'nav.settings': '設定',

    // --- メイン画面 ---
    'main.title': 'the-Particle',
    'main.linac': 'ライナック',
    'main.shift': 'シフト',
    'main.currentShiftMult': '現在のライナック倍率:',
    'main.shiftCount': '(シフト回数: {count})',
    'main.buyAmountLabel': '購入数:',
    'main.buyMax': '最大購入',
    'main.particlesSuffix': '粒子',
    'main.ipLabel': 'IP:',
    'main.infinityProgressLabel': 'Infinityまでの進捗',
    'main.particleDisplay': '{val} 粒子',
    'main.ppsDisplay': '(+{val} /秒)',
    'main.crunchTitle': 'BIG CRUNCH',
    'main.crunchMessage': '宇宙データを再構築中...',

    // --- 統計画面 ---
    'stats.basicHeader': '基本',
    'stats.elapsedTime': '経過時間(現在の宇宙)',
    'stats.totalPlaytime': '総プレイ時間(全リセット含む)',
    'stats.totalProduced': '総粒子生産量',
    'stats.currentPPS': '現在のPPS',
    'stats.highestPPS': '最高PPS',
    'stats.highestParticles': '最高粒子数',
    'stats.linacHeader': 'Linac',
    'stats.totalLinacs': '総Linac回数',
    'stats.shortestLinac': '最短Linac時間',
    'stats.bestLinacMult': 'Linac最高倍率',
    'stats.shiftHeader': 'Shift',
    'stats.totalShifts': '総Shift回数',
    'stats.acceleratorHeader': 'Accelerator',
    'stats.universeHeader': '宇宙統計',
    'stats.crunchCount': 'Big Crunch 回数',
    'stats.bestInfinity': 'Infinity到達(最短)',
    'stats.perSec': '/秒',
    'stats.timesSuffix': '回',
    'stats.totalMkPurchased': '総{mk}購入数',

    // --- 実績画面 ---
    'ach.header': '実績',
    'ach.unlockedCount': '解除済み: {count} / {total}',
    'ach.locked': '未解除',
    'ach.unlocked': '解除済み',

    // --- ショップ画面 ---
    'shop.header': 'ショップ',
    'shop.apLabel': '所持 AP:',
    'shop.comingSoon': 'Coming Soon...',
    'shop.themeHeader': 'テーマ',
    'shop.themeDesc': 'APを消費して画面のテーマカラーを変更できます',
    'shop.buy': '購入',
    'shop.owned': '所持済み',
    'shop.equip': '適用',
    'shop.equipped': '使用中',
    'shop.theme.default': 'デフォルト',
    'shop.theme.red': 'レッド',
    'shop.theme.orange': 'オレンジ',
    'shop.theme.yellow': 'イエロー',
    'shop.theme.lightgreen': 'ライトグリーン',
    'shop.theme.green': 'グリーン',
    'shop.theme.emerald': 'エメラルドグリーン',
    'shop.theme.lightblue': 'ライトブルー',
    'shop.theme.blue': 'ブルー',
    'shop.theme.purple': 'パープル',

    // --- Time Flux画面 ---
    'tf.header': 'Time Flux',
    'tf.warpHeader': 'Time Warp（TFを消費して倍速進行）',
    'tf.currentSpeed': '現在倍率:',
    'tf.warpDesc': '（倍率と同じ秒数のTFを毎秒消費します。TFが尽きると自動的に×1へ戻ります）',
    'tf.upgradeHeader': 'TFアップグレード',
    'tf.upgradeDesc': 'TFの最大所持量を2倍にします。コストは現在の最大値の2/3のTFです。',
    'tf.upgradeCost': '必要TF: {cost}',
    'tf.upgradeCurrentMax': '現在の上限: {max}',
    'tf.upgradeNextMax': '次の上限: {max}',
    'tf.upgradeBtn': '上限を強化',
    'tf.upgradeInsufficient': 'TFが足りません',

    // --- 自動化画面 ---
    'auto.header': 'Accelerator自動購入',
    'auto.on': '自動: ON',
    'auto.off': '自動: OFF',
    'auto.required': '必要: {val}',
    'auto.linacHeader': '自動ライナック',
    'auto.linacDesc': 'Challenge 3「初心に戻る」クリアの報酬です。Mk.8が必要数に達すると自動でライナックを実行します。',
    'auto.linacToggleLabel': '自動ライナックを有効にする',

    // --- 設定画面 ---
    'settings.displayHeader': '表示設定',
    'settings.notationSci': '科学的単位 (1e10)',
    'settings.notationEng': '英語単位 (10 B)',
    'settings.notationJp': '日本語単位 (100億)',
    'settings.notationRaw': '実数表示 (12,345,678)',
    'settings.particleSizeLabel': '粒子数の表示サイズ',
    'settings.particleSizeSmall': '小',
    'settings.particleSizeMedium': '中',
    'settings.particleSizeLarge': '大',
    'settings.languageLabel': '言語 / Language',
    'settings.glitchToggle': '画面演出（グリッチ効果）を有効にする',
    'settings.sfxToggle': 'SE（効果音）を有効にする',
    'settings.bgmToggle': 'BGM（背景音楽）を有効にする',
    'settings.skipHeader': '演出スキップ',
    'settings.skipLinac': 'ライナック演出をスキップ',
    'settings.skipShift': 'シフト演出をスキップ',
    'settings.skipCrunch': 'Big Crunch演出をスキップ',
    'settings.dataHeader': 'データ管理',
    'settings.saveBtn': 'データをセーブ',
    'settings.autosaveStatus': 'オートセーブ有効 (10秒毎)',
    'settings.quickSaveStatus': '★ クイックセーブ！ ★',
    'settings.savedStatus': '保存しました',
    'settings.exportBtn': 'セーブデータを書き出し',
    'settings.importBtn': 'セーブデータを読み込み',
    'settings.dataLabel': 'データ文字列:',
    'settings.dataPlaceholder': 'ここにセーブデータを貼り付け...',
    'settings.importActionBtn': '読み込む',
    'settings.dangerHeader': '危険ゾーン',
    'settings.dangerDesc': '全ての進捗を完全に削除します。',
    'settings.hardResetBtn': '完全初期化',

    // --- Infinity画面 ---
    'inf.subMain': 'Main',
    'inf.subBreak': 'Break Infinity',
    'inf.updateHeader': 'Infinityアップデート',
    'inf.ipLabel': '所持 IP:',
    'inf.upgradeHeader': '強化',
    'inf.currentEffect': '現在の効果: {val}',
    'inf.levelLine': 'Lv.{level}　現在：{cur}　次：{next}',
    'inf.bought': '購入済み',
    'inf.cost': 'コスト: {val} IP',

    // --- Break Infinity ---
    'bi.header': 'Break Infinity',
    'bi.desc': '粒子の上限(1.79e308)を解除し、さらに先へ進めるようになります。',
    'bi.currentIP': '所持 IP',
    'bi.unlockBtn': '上限を解除 (必要: {cost} IP)',
    'bi.unlockedMsg1': 'LIMIT BROKEN',
    'bi.unlockedMsg2': '上限解除済み・1.78e308を超えて進行できます',
    'bi.notImplementedTitle': '未実装',
    'bi.notImplementedBody': 'Break Infinityはまだ実装されていません。<br>今後のアップデートをお待ちください。',

    // --- チャレンジ画面 ---
    'challenge.header': 'チャレンジ',
    'challenge.rewardLabel': '報酬',
    'challenge.clear': '✓ CLEAR',
    'challenge.inProgress': 'チャレンジ中',
    'challenge.start': '開始',
    'challenge.number': 'Challenge {num}',
    'challenge.startConfirmBody': 'チャレンジを開始しますか？<br><br>ゲームはLinac・Shift・Infinity強化を含めて<br>現在の宇宙をリセットします。<br>（所持IPは失われません）',

    // --- オフライン進行 ---
    'offline.title': 'オフライン進行',
    'offline.timeLabel': 'オフライン時間',
    'offline.currentLabel': '現在',
    'offline.speedLabel': '速度',
    'offline.startBtn': '開始',
    'offline.skipBtn': 'スキップ',
    'offline.inProgress': '進行中...',

    // --- 汎用ボタン・モーダル ---
    'common.ok': 'OK',
    'common.cancel': 'キャンセル',
    'common.close': '閉じる',
    'common.error': 'エラー',
    'common.units': '個',
    'common.buyCount': '{count}個: {cost}',
    'common.buyUnavailable': '購入不可',
    'common.owned': '所持: {val}',

    // --- 通知 ---
    'notif.settingsSaved': '設定を保存しました',
    'notif.linacTitle': 'ライナックしました',
    'notif.linacMsg': '倍率 x{val}',
    'notif.linacConfirmTitle': 'ライナック',
    'notif.linacConfirmBody': 'ライナックを実行しますか？<br><br>倍率: <b>x{val}</b><br><br>粒子とAcceleratorがリセットされます。',
    'notif.linacDisabledTitle': 'Mk.8 が {req}個 必要',
    'notif.linacResetTitle': '倍率 x{val} でリセット',
    'notif.shiftTitle': 'シフトしました',
    'notif.shiftMsg': '倍率 x{val}',
    'notif.shiftConfirmTitle': 'ライナック・シフト',
    'notif.shiftConfirmBody': '【警告】シフトを実行しますか？<br><br>倍率: x{cur} → <b>x{next}</b><br><br>ライナックと全ての進捗がリセットされます。',
    'notif.shiftCompleteTitle': 'シフト完了',
    'notif.shiftCompleteBody': '現在の倍率: <b>x{val}</b>',
    'notif.shiftNextTitle': '次倍率 x{val}（全リセット）',
    'notif.crunchCompleteTitle': 'BIG CRUNCH 完了',
    'notif.crunchCompleteBody': '宇宙が生まれ変わりました。<br><br>獲得 IP: <b>+{gained}</b><br>所持 IP: <b>{total}</b>',
    'notif.challengeCompleteTitle': 'Challenge Complete!',
    'notif.challengeCompleteMsg': '{title}クリア！<br>永久効果: {reward}',
    'notif.challengeStartTitle': 'チャレンジ開始',
    'notif.savedTitle': 'セーブしました',
    'notif.loadedTitle': 'ロードしました',
    'notif.resetTitle': 'リセットしました',
    'notif.invalidData': 'データが無効です',
    'notif.hardResetTitle': '完全初期化',
    'notif.hardResetBody': '本当に全てのデータを消去しますか？<br><b>元に戻せません。</b>',
    'notif.hardResetConfirm': '消去',
    'notif.welcomeBack': 'おかえりなさい',
    'notif.offlineComplete': 'オフライン進行が完了しました（{time}）',
    'notif.achievementUnlocked': '実績解除！ {title}',
    'notif.tfUpgradeTitle': 'TFアップグレード',
    'notif.tfUpgradeMsg': 'TFの最大所持量が {max} になりました',
    'notif.themeBoughtTitle': 'テーマ購入',
    'notif.themeBoughtMsg': '「{name}」テーマを購入しました',
    'notif.themeEquippedTitle': 'テーマ変更',
    'notif.themeEquippedMsg': '「{name}」テーマに変更しました',

    // --- Infinity強化コンテンツ ---
    'infUpgrade.timeDilationTitle': '時間膨張',
    'infUpgrade.timeDilationDesc': '通算プレイ時間に応じて全生産倍率増加',
    'infUpgrade.mkTitle': 'Mk.{n} 強化',
    'infUpgrade.mkDesc': 'Mk.{n} の生産倍率を指数で強化',
    'infUpgrade.ipDoubleTitle': 'IP倍加',
    'infUpgrade.ipDoubleDesc': 'Big Crunchで獲得するIPを増加させる',

    // --- 実績コンテンツ ---
    'ach.firstStep.title': '初めての一歩',
    'ach.firstStep.desc': 'Accelerator Mk.1を初めて購入した',
    'ach.firstLinac.title': '初ライナック！',
    'ach.firstLinac.desc': '初めてライナック（Linac）を実行した',
    'ach.firstShift.title': '初シフト！',
    'ach.firstShift.desc': '初めてシフト（Shift）を実行した',
    'ach.infinity.title': 'Infinity',
    'ach.infinity.desc': '初めてBig Crunchを行った',
    'ach.doubleLinac.title': 'ダブルライナック',
    'ach.doubleLinac.desc': 'ライナックを二回する',
    'ach.tripleLinac.title': 'トリプルライナック',
    'ach.tripleLinac.desc': 'ライナックを三回する',
    'ach.linacIntermediate.title': 'ライナック中級者',
    'ach.linacIntermediate.desc': 'ライナックを10回する',
    'ach.linacAdvanced.title': 'ライナック上級者',
    'ach.linacAdvanced.desc': 'ライナックを30回する',
    'ach.linacMaster.title': 'ライナックマスター',
    'ach.linacMaster.desc': 'ライナックを50回する',
    'ach.doubleShift.title': 'ダブルシフト',
    'ach.doubleShift.desc': 'シフトを二回する',
    'ach.tripleShift.title': 'トリプルシフト',
    'ach.tripleShift.desc': 'シフトを三回する',
    'ach.moreShift.title': 'もっとシフト',
    'ach.moreShift.desc': 'シフトを5回する',
    'ach.shiftMaster.title': 'シフトマスター',
    'ach.shiftMaster.desc': 'シフトを10回する',
    'ach.mk2First.title': '二歩目',
    'ach.mk2First.desc': 'Accelerator Mk.2を初めて購入した',
    'ach.mk3First.title': 'トリプル加速器',
    'ach.mk3First.desc': 'Accelerator Mk.3を初めて購入した',
    'ach.mk4First.title': 'まだまだ加速器増やしましょ、',
    'ach.mk4First.desc': 'Accelerator Mk.4を初めて購入した',
    'ach.mk5First.title': '五歩目',
    'ach.mk5First.desc': 'Accelerator Mk.5を初めて購入した',
    'ach.mk6First.title': '６は不吉？',
    'ach.mk6First.desc': 'Accelerator Mk.6を初めて購入した',
    'ach.mk7First.title': 'ラッキーだよね',
    'ach.mk7First.desc': 'Accelerator Mk.7を初めて購入した',
    'ach.mk8First.title': '最後のAccelerator',
    'ach.mk8First.desc': 'AcceleratorMk.8を初めて購入した',
    'ach.particleDesc': '粒子が {label} に到達した',
    'ach.m0.title': 'はじまり',
    'ach.m1.title': '少し慣れてきた？',
    'ach.m2.title': '勢いに乗る',
    'ach.m3.title': 'ぐんぐん成長',
    'ach.m4.title': '加速開始',
    'ach.m5.title': '半世紀（指数）',
    'ach.m6.title': '止まらない',
    'ach.m7.title': '爆発的成長',
    'ach.m8.title': 'もう十分？',
    'ach.m9.title': 'まだまだ',
    'ach.m10.title': '中級者',
    'ach.m11.title': '上級者への道',
    'ach.m12.title': 'ベテラン',
    'ach.m13.title': '達人',
    'ach.m14.title': '熟練者',
    'ach.m15.title': '極めし者',
    'ach.m16.title': '超越',
    'ach.m17.title': '限界突破',
    'ach.m18.title': '次元越え',
    'ach.m19.title': '常識崩壊',
    'ach.m20.title': '数の支配者',
    'ach.m21.title': '宇宙規模',
    'ach.m22.title': '銀河を超えて',
    'ach.m23.title': '星々の彼方',
    'ach.m24.title': '無限への階段',
    'ach.m25.title': '時空を超える',
    'ach.m26.title': '数学の夢',
    'ach.m27.title': 'もはや概念',
    'ach.m28.title': '観測不能',
    'ach.m29.title': '最終領域',
    'ach.m30.title': 'Infinity目前',

    // --- チャレンジコンテンツ ---
    'ch.slowSpeed.title': 'スロースピード',
    'ch.slowSpeed.effectLabel': 'PPS ×0.9',
    'ch.slowSpeed.rewardLabel': 'PPS ×2',
    'ch.highCost.title': '高コスト',
    'ch.highCost.effectLabel': 'Acceleratorコスト ×2',
    'ch.highCost.rewardLabel': 'Acceleratorコスト ×0.95',
    'ch.backToBasics.title': '初心に戻る',
    'ch.backToBasics.effectLabel': '自動化とMキー（最大購入）が使用不可',
    'ch.backToBasics.rewardLabel': '自動ライナックを解放',

    // --- ジェネレーター倍率バッジ ---
    'badge.linacMult': '[ライナック: x{val}]',
    'badge.infMult': '[Infinity強化: x{val}]',
    'badge.challengeMult': '[Challenge: x{val}]',
    'common.buyOne': '1個購入',

    // --- ニュースティッカー ---
    'news.0': 'システム起動... 観測を開始します。',
    'news.1': '近所の猫が粒子まみれになっています。',
    'news.2': '電気代の請求書が怖くてポストを開けられません。',
    'news.3': '【TIPS】キーボードの \'M\' で最大購入、\'S\' でセーブ可能です。',
    'news.4': '研究室のコーヒーが勝手に沸騰し始めました。',
    'news.5': '微細な振動が床から伝わってきます。',
    'news.6': '「ただの光る点だ」と友人に笑われました。',
    'news.7': '近所のコンビニで「粒子払い」が可能になりました。',
    'news.8': 'あなたの指先から微弱なガンマ線が出ています。',
    'news.9': '部屋の照明が不要になりました。',
    'news.10': 'スマホのバッテリーが減らなくなりました。',
    'news.11': '科学雑誌「ムー」があなたの特集を組みました。',
    'news.12': '水道からプラズマが出るという苦情が殺到しています。',
    'news.13': '物理学者があなたの家の前でデモ行進をしています。',
    'news.14': '税務署が「粒子の課税区分」について頭を抱えています。',
    'news.15': '地元の天気予報: 「ところにより粒子、のち時空の歪みでしょう」',
    'news.16': '世界中のスパコンが計算に追いつけません。',
    'news.17': '月面から「コッチヲ見ルナ」という信号を受信しました。',
    'news.18': 'あなたのくしゃみで株価が乱高下しています。',
    'news.19': '空間に亀裂が見えますが、気にしてはいけません。',
    'news.20': '物理法則のアップデート待機中... (99%)',
    'news.21': '昨日の夕飯が何だったか、歴史から消滅しました。',
    'news.22': '銀河系の質量バランスが崩れ始めています。',
    'news.23': '「重力」のサブスクリプション期限が切れそうです。',
    'news.24': 'もう何も怖くない。',
    'news.25': 'シュレーディンガーの猫が、箱の中から餌を要求しています。',
    'news.26': '全宇宙のエントロピーが減少に転じました。',
    'news.27': '神様から「やりすぎ」という苦情メールが届きました。',
    'news.28': '宇宙のデータ容量が圧迫されています。',
    'news.29': '現実と虚構の境界線が溶けてバターになりました。',
    'news.30': '数学者が「1+1=粒子」であることを証明しました。',
    'news.31': 'ERROR: テキスト出力機能に異常が発生しています。',
    'news.32': 'あ　な　た　は　誰　で　す　か　？',
    'news.33': 'NULL POINTER EXCEPTION: UNIVERSE NOT FOUND.',
    'news.34': 'システム警告: ビッグ・クランチが接近しています。',
    'news.35': 'サヨウナラ。'
  },

  en: {
    // --- Navigation ---
    'nav.main': 'Main',
    'nav.stats': 'Stats',
    'nav.achievements': 'Achievements',
    'nav.shop': 'Shop',
    'nav.timeflux': 'Time Flux',
    'nav.infinity': '∞ INFINITY',
    'nav.challenge': 'Challenge',
    'nav.automation': 'Automation',
    'nav.settings': 'Settings',

    // --- Main screen ---
    'main.title': 'the-Particle',
    'main.linac': 'Linac',
    'main.shift': 'Shift',
    'main.currentShiftMult': 'Current Linac multiplier:',
    'main.shiftCount': '(Shift count: {count})',
    'main.buyAmountLabel': 'Buy amount:',
    'main.buyMax': 'Max',
    'main.particlesSuffix': 'particles',
    'main.ipLabel': 'IP:',
    'main.infinityProgressLabel': 'Progress to Infinity',
    'main.particleDisplay': '{val} particles',
    'main.ppsDisplay': '(+{val} /sec)',
    'main.crunchTitle': 'BIG CRUNCH',
    'main.crunchMessage': 'Reconstructing universe data...',

    // --- Stats screen ---
    'stats.basicHeader': 'Basic',
    'stats.elapsedTime': 'Elapsed time (current universe)',
    'stats.totalPlaytime': 'Total playtime (incl. all resets)',
    'stats.totalProduced': 'Total particles produced',
    'stats.currentPPS': 'Current PPS',
    'stats.highestPPS': 'Highest PPS',
    'stats.highestParticles': 'Highest particle count',
    'stats.linacHeader': 'Linac',
    'stats.totalLinacs': 'Total Linacs',
    'stats.shortestLinac': 'Shortest Linac time',
    'stats.bestLinacMult': 'Best Linac multiplier',
    'stats.shiftHeader': 'Shift',
    'stats.totalShifts': 'Total Shifts',
    'stats.acceleratorHeader': 'Accelerator',
    'stats.universeHeader': 'Universe Stats',
    'stats.crunchCount': 'Big Crunch count',
    'stats.bestInfinity': 'Fastest Infinity',
    'stats.perSec': '/sec',
    'stats.timesSuffix': '',
    'stats.totalMkPurchased': 'Total {mk} purchased',

    // --- Achievements screen ---
    'ach.header': 'Achievements',
    'ach.unlockedCount': 'Unlocked: {count} / {total}',
    'ach.locked': 'Locked',
    'ach.unlocked': 'Unlocked',

    // --- Shop screen ---
    'shop.header': 'Shop',
    'shop.apLabel': 'AP:',
    'shop.comingSoon': 'Coming Soon...',
    'shop.themeHeader': 'Themes',
    'shop.themeDesc': 'Spend AP to change the UI theme color',
    'shop.buy': 'Buy',
    'shop.owned': 'Owned',
    'shop.equip': 'Equip',
    'shop.equipped': 'Equipped',
    'shop.theme.default': 'Default',
    'shop.theme.red': 'Red',
    'shop.theme.orange': 'Orange',
    'shop.theme.yellow': 'Yellow',
    'shop.theme.lightgreen': 'Light Green',
    'shop.theme.green': 'Green',
    'shop.theme.emerald': 'Emerald Green',
    'shop.theme.lightblue': 'Light Blue',
    'shop.theme.blue': 'Blue',
    'shop.theme.purple': 'Purple',

    // --- Time Flux screen ---
    'tf.header': 'Time Flux',
    'tf.warpHeader': 'Time Warp (spend TF to speed up)',
    'tf.currentSpeed': 'Current speed:',
    'tf.warpDesc': '(Consumes TF equal to the multiplier every second. Automatically returns to ×1 when TF runs out.)',
    'tf.upgradeHeader': 'TF Upgrade',
    'tf.upgradeDesc': 'Doubles your maximum TF capacity. Costs 2/3 of your current maximum in TF.',
    'tf.upgradeCost': 'Required TF: {cost}',
    'tf.upgradeCurrentMax': 'Current max: {max}',
    'tf.upgradeNextMax': 'Next max: {max}',
    'tf.upgradeBtn': 'Upgrade Max',
    'tf.upgradeInsufficient': 'Not enough TF',

    // --- Automation screen ---
    'auto.header': 'Accelerator Auto-Buy',
    'auto.on': 'Auto: ON',
    'auto.off': 'Auto: OFF',
    'auto.required': 'Requires: {val}',
    'auto.linacHeader': 'Auto-Linac',
    'auto.linacDesc': 'Reward for clearing Challenge 3 "Back to Basics". Automatically triggers a Linac once Mk.8 reaches the required amount.',
    'auto.linacToggleLabel': 'Enable Auto-Linac',

    // --- Settings screen ---
    'settings.displayHeader': 'Display Settings',
    'settings.notationSci': 'Scientific (1e10)',
    'settings.notationEng': 'English units (10 B)',
    'settings.notationJp': 'Japanese units (100億)',
    'settings.notationRaw': 'Full number (12,345,678)',
    'settings.particleSizeLabel': 'Particle Count Display Size',
    'settings.particleSizeSmall': 'Small',
    'settings.particleSizeMedium': 'Medium',
    'settings.particleSizeLarge': 'Large',
    'settings.languageLabel': '言語 / Language',
    'settings.glitchToggle': 'Enable screen effects (glitch)',
    'settings.sfxToggle': 'Enable SFX',
    'settings.bgmToggle': 'Enable BGM',
    'settings.skipHeader': 'Skip Animations',
    'settings.skipLinac': 'Skip Linac animation',
    'settings.skipShift': 'Skip Shift animation',
    'settings.skipCrunch': 'Skip Big Crunch animation',
    'settings.dataHeader': 'Data Management',
    'settings.saveBtn': 'Save Data',
    'settings.autosaveStatus': 'Autosave enabled (every 10s)',
    'settings.quickSaveStatus': '★ Quick Save! ★',
    'settings.savedStatus': 'Saved',
    'settings.exportBtn': 'Export Save Data',
    'settings.importBtn': 'Import Save Data',
    'settings.dataLabel': 'Data string:',
    'settings.dataPlaceholder': 'Paste your save data here...',
    'settings.importActionBtn': 'Load',
    'settings.dangerHeader': 'Danger Zone',
    'settings.dangerDesc': 'Permanently erases all progress.',
    'settings.hardResetBtn': 'Full Reset',

    // --- Infinity screen ---
    'inf.subMain': 'Main',
    'inf.subBreak': 'Break Infinity',
    'inf.updateHeader': 'Infinity Upgrades',
    'inf.ipLabel': 'IP:',
    'inf.upgradeHeader': 'Upgrades',
    'inf.currentEffect': 'Current effect: {val}',
    'inf.levelLine': 'Lv.{level}　Current: {cur}　Next: {next}',
    'inf.bought': 'Purchased',
    'inf.cost': 'Cost: {val} IP',

    // --- Break Infinity ---
    'bi.header': 'Break Infinity',
    'bi.desc': 'Removes the particle cap (1.79e308), allowing you to progress even further.',
    'bi.currentIP': 'IP',
    'bi.unlockBtn': 'Break Limit (requires {cost} IP)',
    'bi.unlockedMsg1': 'LIMIT BROKEN',
    'bi.unlockedMsg2': 'Limit removed — you can now progress beyond 1.78e308',
    'bi.notImplementedTitle': 'Not Implemented',
    'bi.notImplementedBody': 'Break Infinity has not been implemented yet.<br>Please wait for a future update.',

    // --- Challenge screen ---
    'challenge.header': 'Challenge',
    'challenge.rewardLabel': 'Reward',
    'challenge.clear': '✓ CLEAR',
    'challenge.inProgress': 'In Progress',
    'challenge.start': 'Start',
    'challenge.number': 'Challenge {num}',
    'challenge.startConfirmBody': 'Start this challenge?<br><br>This resets your current universe, including<br>Linac, Shift, and Infinity upgrades.<br>(Your IP will not be lost)',

    // --- Offline progress ---
    'offline.title': 'Offline Progress',
    'offline.timeLabel': 'Offline time',
    'offline.currentLabel': 'Progress',
    'offline.speedLabel': 'Speed',
    'offline.startBtn': 'Start',
    'offline.skipBtn': 'Skip',
    'offline.inProgress': 'In progress...',

    // --- Common buttons / modals ---
    'common.ok': 'OK',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.error': 'Error',
    'common.units': '',
    'common.buyCount': 'Buy {count}: {cost}',
    'common.buyUnavailable': 'Cannot buy',
    'common.owned': 'Owned: {val}',

    // --- Notifications ---
    'notif.settingsSaved': 'Settings saved',
    'notif.linacTitle': 'Linac complete',
    'notif.linacMsg': 'Multiplier x{val}',
    'notif.linacConfirmTitle': 'Linac',
    'notif.linacConfirmBody': 'Perform Linac?<br><br>Multiplier: <b>x{val}</b><br><br>Particles and Accelerators will be reset.',
    'notif.linacDisabledTitle': 'Requires {req} Mk.8',
    'notif.linacResetTitle': 'Reset at x{val} multiplier',
    'notif.shiftTitle': 'Shift complete',
    'notif.shiftMsg': 'Multiplier x{val}',
    'notif.shiftConfirmTitle': 'Linac Shift',
    'notif.shiftConfirmBody': '[Warning] Perform Shift?<br><br>Multiplier: x{cur} → <b>x{next}</b><br><br>Linac and all progress will be reset.',
    'notif.shiftCompleteTitle': 'Shift Complete',
    'notif.shiftCompleteBody': 'Current multiplier: <b>x{val}</b>',
    'notif.shiftNextTitle': 'Next multiplier x{val} (full reset)',
    'notif.crunchCompleteTitle': 'BIG CRUNCH Complete',
    'notif.crunchCompleteBody': 'The universe has been reborn.<br><br>IP gained: <b>+{gained}</b><br>Total IP: <b>{total}</b>',
    'notif.challengeCompleteTitle': 'Challenge Complete!',
    'notif.challengeCompleteMsg': 'Cleared {title}!<br>Permanent effect: {reward}',
    'notif.challengeStartTitle': 'Challenge Started',
    'notif.savedTitle': 'Saved',
    'notif.loadedTitle': 'Loaded',
    'notif.resetTitle': 'Reset complete',
    'notif.invalidData': 'Invalid data',
    'notif.hardResetTitle': 'Full Reset',
    'notif.hardResetBody': 'Really erase all data?<br><b>This cannot be undone.</b>',
    'notif.hardResetConfirm': 'Erase',
    'notif.welcomeBack': 'Welcome back',
    'notif.offlineComplete': 'Offline progress complete ({time})',
    'notif.achievementUnlocked': 'Achievement unlocked! {title}',
    'notif.tfUpgradeTitle': 'TF Upgrade',
    'notif.tfUpgradeMsg': 'Max TF capacity is now {max}',
    'notif.themeBoughtTitle': 'Theme Purchased',
    'notif.themeBoughtMsg': 'Purchased the "{name}" theme',
    'notif.themeEquippedTitle': 'Theme Changed',
    'notif.themeEquippedMsg': 'Switched to the "{name}" theme',

    // --- Infinity upgrade content ---
    'infUpgrade.timeDilationTitle': 'Time Dilation',
    'infUpgrade.timeDilationDesc': 'Increases all production based on total playtime',
    'infUpgrade.mkTitle': 'Mk.{n} Boost',
    'infUpgrade.mkDesc': 'Exponentially boosts Mk.{n} production',
    'infUpgrade.ipDoubleTitle': 'IP Multiplier',
    'infUpgrade.ipDoubleDesc': 'Increases IP gained from Big Crunch',

    // --- Achievement content ---
    'ach.firstStep.title': 'First Step',
    'ach.firstStep.desc': 'Bought your first Accelerator Mk.1',
    'ach.firstLinac.title': 'First Linac!',
    'ach.firstLinac.desc': 'Performed your first Linac',
    'ach.firstShift.title': 'First Shift!',
    'ach.firstShift.desc': 'Performed your first Shift',
    'ach.infinity.title': 'Infinity',
    'ach.infinity.desc': 'Performed your first Big Crunch',
    'ach.doubleLinac.title': 'Double Linac',
    'ach.doubleLinac.desc': 'Perform Linac twice',
    'ach.tripleLinac.title': 'Triple Linac',
    'ach.tripleLinac.desc': 'Perform Linac three times',
    'ach.linacIntermediate.title': 'Linac Intermediate',
    'ach.linacIntermediate.desc': 'Perform Linac 10 times',
    'ach.linacAdvanced.title': 'Linac Advanced',
    'ach.linacAdvanced.desc': 'Perform Linac 30 times',
    'ach.linacMaster.title': 'Linac Master',
    'ach.linacMaster.desc': 'Perform Linac 50 times',
    'ach.doubleShift.title': 'Double Shift',
    'ach.doubleShift.desc': 'Perform Shift twice',
    'ach.tripleShift.title': 'Triple Shift',
    'ach.tripleShift.desc': 'Perform Shift three times',
    'ach.moreShift.title': 'More Shifts',
    'ach.moreShift.desc': 'Perform Shift 5 times',
    'ach.shiftMaster.title': 'Shift Master',
    'ach.shiftMaster.desc': 'Perform Shift 10 times',
    'ach.mk2First.title': 'Second Step',
    'ach.mk2First.desc': 'Bought your first Accelerator Mk.2',
    'ach.mk3First.title': 'Triple Accelerator',
    'ach.mk3First.desc': 'Bought your first Accelerator Mk.3',
    'ach.mk4First.title': 'Keep Adding Accelerators',
    'ach.mk4First.desc': 'Bought your first Accelerator Mk.4',
    'ach.mk5First.title': 'Fifth Step',
    'ach.mk5First.desc': 'Bought your first Accelerator Mk.5',
    'ach.mk6First.title': 'Is Six Unlucky?',
    'ach.mk6First.desc': 'Bought your first Accelerator Mk.6',
    'ach.mk7First.title': 'Lucky, Right?',
    'ach.mk7First.desc': 'Bought your first Accelerator Mk.7',
    'ach.mk8First.title': 'The Final Accelerator',
    'ach.mk8First.desc': 'Bought your first Accelerator Mk.8',
    'ach.particleDesc': 'Reached {label} particles',
    'ach.m0.title': 'The Beginning',
    'ach.m1.title': 'Getting the Hang of It?',
    'ach.m2.title': 'Gaining Momentum',
    'ach.m3.title': 'Growing Fast',
    'ach.m4.title': 'Acceleration Begins',
    'ach.m5.title': 'Half a Century (Exponent)',
    'ach.m6.title': 'Unstoppable',
    'ach.m7.title': 'Explosive Growth',
    'ach.m8.title': 'Enough Already?',
    'ach.m9.title': 'Still Going',
    'ach.m10.title': 'Intermediate',
    'ach.m11.title': 'Path to Expert',
    'ach.m12.title': 'Veteran',
    'ach.m13.title': 'Master',
    'ach.m14.title': 'Adept',
    'ach.m15.title': 'Perfected',
    'ach.m16.title': 'Transcendence',
    'ach.m17.title': 'Breaking Limits',
    'ach.m18.title': 'Beyond Dimensions',
    'ach.m19.title': 'Common Sense Broken',
    'ach.m20.title': 'Master of Numbers',
    'ach.m21.title': 'Cosmic Scale',
    'ach.m22.title': 'Beyond the Galaxy',
    'ach.m23.title': 'Beyond the Stars',
    'ach.m24.title': 'Stairway to Infinity',
    'ach.m25.title': 'Beyond Spacetime',
    'ach.m26.title': "Mathematician's Dream",
    'ach.m27.title': 'A Mere Concept Now',
    'ach.m28.title': 'Unobservable',
    'ach.m29.title': 'Final Frontier',
    'ach.m30.title': 'On the Verge of Infinity',

    // --- Challenge content ---
    'ch.slowSpeed.title': 'Slow Speed',
    'ch.slowSpeed.effectLabel': 'PPS ×0.9',
    'ch.slowSpeed.rewardLabel': 'PPS ×2',
    'ch.highCost.title': 'High Cost',
    'ch.highCost.effectLabel': 'Accelerator Cost ×2',
    'ch.highCost.rewardLabel': 'Accelerator Cost ×0.95',
    'ch.backToBasics.title': 'Back to Basics',
    'ch.backToBasics.effectLabel': 'Automation & Max-buy (M key) disabled',
    'ch.backToBasics.rewardLabel': 'Unlocks Auto-Linac',

    // --- Generator multiplier badges ---
    'badge.linacMult': '[Linac: x{val}]',
    'badge.infMult': '[Infinity Upgrade: x{val}]',
    'badge.challengeMult': '[Challenge: x{val}]',
    'common.buyOne': 'Buy 1',

    // --- News ticker ---
    'news.0': 'System booting... beginning observation.',
    'news.1': 'The neighborhood cat is covered in particles.',
    'news.2': "You're too scared of the electric bill to open the mailbox.",
    'news.3': "[TIP] Press 'M' to buy max, 'S' to save.",
    'news.4': "The lab's coffee has started boiling on its own.",
    'news.5': 'Faint vibrations are coming up through the floor.',
    'news.6': 'A friend laughed and called it "just a glowing dot."',
    'news.7': 'The local convenience store now accepts "particle payments."',
    'news.8': 'Faint gamma rays are emanating from your fingertips.',
    'news.9': 'Your room no longer needs lighting.',
    'news.10': "Your phone's battery has stopped draining.",
    'news.11': 'A science magazine ran a feature on you.',
    'news.12': 'Complaints are pouring in about plasma coming from the tap.',
    'news.13': 'Physicists are protesting outside your house.',
    'news.14': 'The tax office is struggling to classify "particle income."',
    'news.15': 'Local forecast: "Particles, with a chance of spacetime distortion."',
    'news.16': "Supercomputers worldwide can't keep up with the calculations.",
    'news.17': 'A signal was received from the moon: "STOP LOOKING AT US."',
    'news.18': 'Your sneezes are causing stock market volatility.',
    'news.19': "There's a crack in space, but try not to worry about it.",
    'news.20': 'Physical law update pending... (99%)',
    'news.21': "What you had for dinner yesterday has vanished from history.",
    'news.22': "The galaxy's mass balance is starting to collapse.",
    'news.23': "Gravity's subscription is about to expire.",
    'news.24': "Nothing scares you anymore.",
    'news.25': "Schrödinger's cat is demanding food from inside the box.",
    'news.26': "The entropy of the entire universe has started to decrease.",
    'news.27': 'God sent a complaint email saying "you overdid it."',
    'news.28': "The universe's data capacity is running low.",
    'news.29': 'The line between reality and fiction has melted into butter.',
    'news.30': 'A mathematician proved that "1+1 = particle."',
    'news.31': 'ERROR: A malfunction has occurred in the text output system.',
    'news.32': 'W H O　A R E　Y O U ?',
    'news.33': 'NULL POINTER EXCEPTION: UNIVERSE NOT FOUND.',
    'news.34': 'SYSTEM WARNING: Big Crunch approaching.',
    'news.35': 'Goodbye.'
  }
};

// --- 現在の言語を取得 ---
function getLang() {
  try {
    if (typeof game !== 'undefined' && game && game.settings && game.settings.lang && SUPPORTED_LANGS.includes(game.settings.lang)) {
      return game.settings.lang;
    }
  } catch (e) {
    // script.js側で `let game = getInitialState()` を評価している最中に
    // getLang()が呼ばれると、`game`はTDZ(初期化前)のため参照するとエラーになる。
    // その場合は下のフォールバック（localStorage/ブラウザ言語）を使う。
  }
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored && SUPPORTED_LANGS.includes(stored)) return stored;
  } catch (e) {}
  const nav = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language.toLowerCase() : '';
  if (nav.startsWith('ja')) return 'ja';
  if (nav) return 'en'; // 日本語以外のブラウザ言語はとりあえず英語にフォールバック
  return 'ja';
}

// --- 文言を1件取得（{key}形式のプレースホルダ置換に対応） ---
function t(key, vars) {
  const lang = getLang();
  let str = (I18N[lang] && I18N[lang][key] !== undefined) ? I18N[lang][key] : (I18N.ja[key] !== undefined ? I18N.ja[key] : key);
  if (vars) {
    Object.keys(vars).forEach(k => {
      str = str.split(`{${k}}`).join(vars[k]);
    });
  }
  return str;
}

// --- { ja: "...", en: "..." } 形式のコンテンツオブジェクトから現在言語の文言を取り出す ---
function tr(obj) {
  if (obj === null || obj === undefined) return '';
  if (typeof obj === 'string') return obj; // 移行漏れの保険
  const lang = getLang();
  return obj[lang] !== undefined ? obj[lang] : (obj.ja !== undefined ? obj.ja : obj.en);
}

// --- 言語を変更してUI全体を再描画する ---
function setLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  if (typeof game !== 'undefined' && game && game.settings) game.settings.lang = lang;
  try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch (e) {}
  document.documentElement.lang = lang;
  applyStaticTranslations();
  if (typeof rebuildDynamicUI === 'function') rebuildDynamicUI();
  if (typeof playSE === 'function') playSE('toggle');
  if (typeof saveGame === 'function') saveGame(true);
}

// --- data-i18n系属性を持つ静的要素をまとめて翻訳する ---
function applyStaticTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
  const langSelect = document.getElementById('lang-select');
  if (langSelect) langSelect.value = getLang();
}
