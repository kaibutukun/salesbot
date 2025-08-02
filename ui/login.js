/**
 * ログインページメイン処理
 * 統合されたログイン機能のエントリーポイント
 * 
 * このファイルは各専門モジュールを統合してログイン機能を提供します
 * 旧login.js(403行) → 新login.js(約80行) に大幅削減
 */

// 専門モジュールのインポート
import { 
    initializeSupabaseClient, 
    checkAuthState,
    subscribeToAuthChanges 
} from './login/auth-manager.js';
import { updateDeviceInfo } from './login/device-manager.js';
import { setupLoginEventListeners } from './login/login-handler.js';
import { onDOMReady } from './common/dom-helper.js';
import { logError, showToast } from './common/error-handler.js';

// ====================================
// アプリケーション初期化
// ====================================

/**
 * ログインアプリケーションの初期化
 */
async function initializeLoginApp() {
    try {
        // Supabaseクライアントの初期化
        initializeSupabaseClient();
        
        // イベントリスナーの設定
        setupLoginEventListeners();
        
        // 認証状態のチェック
        await checkAuthState(updateDeviceInfo);
        
        // 認証状態変更の監視
        const subscription = subscribeToAuthChanges(async (event, session) => {
            console.log('Auth state changed:', event, session);
            
            if (event === 'SIGNED_IN') {
                showToast('ログインしました', 'success');
                await checkAuthState(updateDeviceInfo);
            } else if (event === 'SIGNED_OUT') {
                showToast('ログアウトしました', 'info');
                await checkAuthState();
            }
        });
        
        // ページが閉じられる時にサブスクリプションを解除
        window.addEventListener('beforeunload', () => {
            if (subscription && typeof subscription.unsubscribe === 'function') {
                subscription.unsubscribe();
            }
        });
        
        console.log('Login app initialized successfully');
        
    } catch (error) {
        logError(error, 'initializeLoginApp');
        showToast('アプリケーションの初期化に失敗しました', 'error');
    }
}

// ====================================
// アプリケーション開始
// ====================================

// DOMが読み込まれたら初期化を実行
onDOMReady(() => {
    initializeLoginApp();
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
// デバッグ用エクスポート（開発環境のみ）
// ====================================

if (process?.env?.NODE_ENV === 'development') {
    window.LoginApp = {
        initializeLoginApp,
        // デバッグ用の関数をここに追加
    };
}