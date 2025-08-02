/**
 * メイン画面統合処理
 * 各専門モジュールを統合してメイン機能を提供
 * 
 * このファイルは各専門モジュールを統合してメイン画面を構築します
 * 旧main.js(332行) → 新main.js(約100行) に大幅削減
 */

// 共通設定とモジュールのインポート
import { 
    ACTION_STOP,
    ACTION_STOP_COMPLETED,
    ACTION_EXECUTE,
    PROGRESS_UPDATE_INTERVAL,
    SHORT_DELAY
} from '../shared/constants.js';

// 専門モジュールのインポート
import { initializeTabManager } from './main/tab-manager.js';
import { 
    initializeApplication, 
    getModuleInstance,
    getAllModuleInstances,
    getApplicationStatus
} from './main/app-initializer.js';

// 共通モジュールのインポート
import { onDOMReady, getElement } from './common/dom-helper.js';
import { logError, showToast } from './common/error-handler.js';
import { addMessageListener } from './common/chrome-api-helper.js';

// ====================================
// グローバル変数（最小限）
// ====================================

let applicationInitialized = false;
let messageListener = null;

// ====================================
// メイン初期化処理
// ====================================

/**
 * メインアプリケーションの初期化
 */
async function initializeMainApp() {
    try {
        console.log('Starting main app initialization...');
        
        // 1. タブマネージャーの初期化
        initializeTabManager();
        
        // 2. アプリケーション本体の初期化
        await initializeApplication();
        
        // 3. メッセージリスナーの設定
        setupMessageListeners();
        
        // 4. 初期化完了フラグ
        applicationInitialized = true;
        
        // 5. 初期化完了の通知
        console.log('Main app initialization completed successfully');
        showToast('アプリケーションの準備が完了しました', 'success');
        
    } catch (error) {
        logError(error, 'initializeMainApp');
        showToast('アプリケーションの初期化に失敗しました', 'error');
        
        // 初期化に失敗した場合のフォールバック処理
        handleInitializationFailure(error);
    }
}

/**
 * 初期化失敗時の処理
 * @param {Error} error - 発生したエラー
 */
function handleInitializationFailure(error) {
    try {
        // エラー情報を表示
        const errorContainer = getElement('app-error-container', false);
        if (errorContainer) {
            errorContainer.innerHTML = `
                <div class="error-message">
                    <h3>アプリケーションの初期化に失敗しました</h3>
                    <p>ページを再読み込みしてください。問題が続く場合は、ブラウザのキャッシュをクリアしてください。</p>
                    <button onclick="location.reload()" class="primary-button">
                        ページを再読み込み
                    </button>
                </div>
            `;
            errorContainer.style.display = 'block';
        }
        
        // 基本的なタブ切り替えだけでも動作するようにする
        try {
            initializeTabManager();
        } catch (tabError) {
            logError(tabError, 'fallback tab initialization');
        }
        
    } catch (fallbackError) {
        logError(fallbackError, 'handleInitializationFailure');
    }
}

// ====================================
// メッセージリスナー
// ====================================

/**
 * バックグラウンドからのメッセージリスナーを設定
 */
function setupMessageListeners() {
    try {
        messageListener = addMessageListener((message, sender, sendResponse) => {
            // 停止完了メッセージの処理
            if (message.action === ACTION_STOP_COMPLETED) {
                handleStopCompleted();
                return false;
            }
            
            // その他のメッセージ処理
            return false;
        });
        
    } catch (error) {
        logError(error, 'setupMessageListeners');
    }
}

/**
 * 停止完了時の処理
 */
function handleStopCompleted() {
    try {
        // URLマネージャーに停止完了を通知
        const urlManager = getModuleInstance('urlManager');
        if (urlManager && typeof urlManager.handleStopCompleted === 'function') {
            urlManager.handleStopCompleted();
        }
        
        // ダッシュボードを更新
        const dashboard = getModuleInstance('dashboard');
        if (dashboard && typeof dashboard.refreshDashboard === 'function') {
            dashboard.refreshDashboard();
        }
        
        showToast('処理が停止されました', 'info');
        
    } catch (error) {
        logError(error, 'handleStopCompleted');
    }
}

// ====================================
// ユーティリティ関数
// ====================================

/**
 * ダッシュボードを手動で更新する
 */
async function refreshDashboard() {
    try {
        const dashboard = getModuleInstance('dashboard');
        if (dashboard && typeof dashboard.refreshDashboard === 'function') {
            await dashboard.refreshDashboard();
            showToast('ダッシュボードを更新しました', 'info');
        }
    } catch (error) {
        logError(error, 'refreshDashboard');
        showToast('ダッシュボードの更新に失敗しました', 'error');
    }
}

// ====================================
// アプリケーション開始
// ====================================

// DOMが読み込まれたら初期化を実行
onDOMReady(() => {
    initializeMainApp();
});

// ====================================
// グローバルエラーハンドリング
// ====================================

// 未処理のエラーをキャッチ
window.addEventListener('error', (event) => {
    logError(event.error, 'globalError');
    console.error('Global error:', event.error);
});

// 未処理のPromise拒否をキャッチ
window.addEventListener('unhandledrejection', (event) => {
    logError(event.reason, 'unhandledPromiseRejection');
    console.error('Unhandled promise rejection:', event.reason);
});

// ====================================
// ページアンロード時の処理
// ====================================

window.addEventListener('beforeunload', () => {
    try {
        // メッセージリスナーの削除
        if (messageListener) {
            // Chrome APIのリスナー削除は自動的に処理される
        }
        
        // 各モジュールのクリーンアップ
        const allModules = getAllModuleInstances();
        Object.values(allModules).forEach(module => {
            if (module && typeof module.destroy === 'function') {
                try {
                    module.destroy();
                } catch (error) {
                    // クリーンアップエラーは無視
                }
            }
        });
        
    } catch (error) {
        // ページアンロード時のエラーは無視
    }
});

// ====================================
// デバッグ用エクスポート（開発環境のみ）
// ====================================

if (process?.env?.NODE_ENV === 'development') {
    window.MainApp = {
        initializeMainApp,
        refreshDashboard,
        getModuleInstance,
        getAllModuleInstances,
        getApplicationStatus,
        // デバッグ用の関数をここに追加
    };
}