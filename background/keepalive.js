/**
 * 生存監視モジュール
 * Service Worker環境でのキープアライブ機能を管理
 * 
 * このモジュールはService Workerが停止しないように定期的にアクションを送信します
 */

// ====================================
// グローバル状態管理
// ====================================

/** キープアライブ用のインターバルID */
let keepaliveInterval = null;

// ====================================
// 定数（一時的にインライン定義）
// ====================================

/** キープアライブ間隔（ミリ秒） */
const KEEPALIVE_INTERVAL = 20000; // 20秒

// ====================================
// キープアライブ制御関数
// ====================================

/**
 * キープアライブを開始する
 */
function startKeepalive() {
    if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
    }
    
    keepaliveInterval = setInterval(() => {
        try {
            // Chrome拡張機能のアクションを送信してService Workerを生存させる
            chrome.action.setBadgeText({ text: '' });
        } catch (error) {
            console.warn('Keepalive action failed:', error);
        }
    }, KEEPALIVE_INTERVAL);
    
    console.log('Keepalive started with interval:', KEEPALIVE_INTERVAL);
}

/**
 * キープアライブを停止する
 */
function stopKeepalive() {
    if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
        keepaliveInterval = null;
        console.log('Keepalive stopped');
    }
}

/**
 * キープアライブの状態を取得する
 * @returns {boolean} キープアライブが動作中の場合true
 */
function isKeepaliveActive() {
    return keepaliveInterval !== null;
}

/**
 * キープアライブ間隔を取得する
 * @returns {number} キープアライブ間隔（ミリ秒）
 */
function getKeepaliveInterval() {
    return KEEPALIVE_INTERVAL;
}

/**
 * キープアライブを再開する（停止→開始）
 */
function restartKeepalive() {
    stopKeepalive();
    startKeepalive();
}

// ====================================
// Service Worker向けエクスポート
// ====================================

// Service Worker環境ではグローバルスコープに関数を配置
if (typeof globalThis !== 'undefined') {
    globalThis.Keepalive = {
        startKeepalive,
        stopKeepalive,
        isKeepaliveActive,
        getKeepaliveInterval,
        restartKeepalive
    };
}