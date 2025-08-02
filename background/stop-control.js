/**
 * 停止制御モジュール
 * Service Worker環境での停止処理を管理
 * 
 * このモジュールは拡張機能の実行停止機能を提供します
 */

// ====================================
// グローバル状態管理
// ====================================

/** 停止中フラグ */
let isStopping = false;

/** アクティブなPromiseのreject関数セット */
let activePromiseRejects = new Set();

// ====================================
// 停止制御関数
// ====================================

/**
 * 停止状態をリセットする
 */
function resetStopState() {
    isStopping = false;
    activePromiseRejects.clear();
}

/**
 * 停止処理を実行する
 */
function executeStop() {
    isStopping = true;
    
    // アクティブなPromiseをすべて停止する
    activePromiseRejects.forEach(reject => {
        try {
            reject(new Error('STOP_REQUESTED'));
        } catch (error) {
            // エラーは無視
        }
    });
    
    activePromiseRejects.clear();
}

/**
 * 停止状態をチェックし、停止中の場合はエラーを投げる
 * @throws {Error} 停止要求エラー
 */
function checkStopped() {
    if (isStopping) {
        throw new Error('STOP_REQUESTED');
    }
}

/**
 * Promiseのreject関数を登録する（停止時の制御用）
 * @param {Function} rejectFn - reject関数
 */
function registerPromiseReject(rejectFn) {
    activePromiseRejects.add(rejectFn);
}

/**
 * Promiseのreject関数を登録解除する
 * @param {Function} rejectFn - reject関数
 */
function unregisterPromiseReject(rejectFn) {
    activePromiseRejects.delete(rejectFn);
}

/**
 * 現在の停止状態を取得する
 * @returns {boolean} 停止中の場合true
 */
function isStoppingState() {
    return isStopping;
}

/**
 * アクティブなPromise数を取得する
 * @returns {number} アクティブなPromise数
 */
function getActivePromiseCount() {
    return activePromiseRejects.size;
}

// ====================================
// Service Worker向けエクスポート
// ====================================

// Service Worker環境ではグローバルスコープに関数を配置
if (typeof globalThis !== 'undefined') {
    globalThis.StopControl = {
        resetStopState,
        executeStop,
        checkStopped,
        registerPromiseReject,
        unregisterPromiseReject,
        isStoppingState,
        getActivePromiseCount
    };
}