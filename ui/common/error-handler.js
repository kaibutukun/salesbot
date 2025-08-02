/**
 * 共通エラーハンドリングモジュール
 * UI関連ファイルで共通的に使用されるエラー処理機能を統一化
 * 
 * このモジュールはエラーの統一的な処理、表示、ログ記録を提供します
 */

import { getElement, setElementText, setElementVisible, toggleElementClass } from './dom-helper.js';

// ====================================
// エラー表示管理
// ====================================

/**
 * トーストメッセージを表示する
 * @param {string} message - 表示メッセージ
 * @param {string} type - メッセージタイプ ('info'|'success'|'warning'|'error')
 * @param {number} duration - 表示時間（ミリ秒、デフォルト: 3000）
 */
export function showToast(message, type = 'info', duration = 3000) {
    try {
        const toast = getElement('toast', false);
        const toastContent = document.querySelector('.toast-content');
        
        if (!toast) {
            // フォールバック: alertで表示
            alert(`${type.toUpperCase()}: ${message}`);
            return;
        }

        if (toastContent) {
            toastContent.textContent = message;
        } else {
            toast.textContent = message;
        }
        
        // クラスをリセットして新しいタイプを適用
        toast.className = `toast ${type}`;
        toast.classList.add('show');

        // 指定時間後に非表示
        setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
        
    } catch (error) {
        console.error('Failed to show toast:', error);
        // 最終フォールバック
        alert(`${type.toUpperCase()}: ${message}`);
    }
}

/**
 * エラーメッセージを要素に表示する
 * @param {string} elementId - エラー表示要素のID
 * @param {string} message - エラーメッセージ
 * @param {boolean} show - 表示するかどうか（デフォルト: true）
 */
export function showErrorMessage(elementId, message, show = true) {
    try {
        const errorElement = getElement(elementId, false);
        
        if (!errorElement) {
            console.warn(`Error element '${elementId}' not found, using fallback`);
            if (show && message) {
                showToast(message, 'error');
            }
            return;
        }

        if (show && message) {
            setElementText(errorElement, message);
            setElementVisible(errorElement, true);
            toggleElementClass(errorElement, 'error-active', true);
        } else {
            setElementVisible(errorElement, false);
            toggleElementClass(errorElement, 'error-active', false);
        }
        
    } catch (error) {
        console.error('Failed to show error message:', error);
        // フォールバック
        if (show && message) {
            showToast(message, 'error');
        }
    }
}

/**
 * 成功メッセージを要素に表示する
 * @param {string} elementId - 成功表示要素のID
 * @param {string} message - 成功メッセージ
 * @param {boolean} show - 表示するかどうか（デフォルト: true）
 */
export function showSuccessMessage(elementId, message, show = true) {
    try {
        const successElement = getElement(elementId, false);
        
        if (!successElement) {
            console.warn(`Success element '${elementId}' not found, using fallback`);
            if (show && message) {
                showToast(message, 'success');
            }
            return;
        }

        if (show && message) {
            setElementText(successElement, message);
            setElementVisible(successElement, true);
            toggleElementClass(successElement, 'success-active', true);
        } else {
            setElementVisible(successElement, false);
            toggleElementClass(successElement, 'success-active', false);
        }
        
    } catch (error) {
        console.error('Failed to show success message:', error);
        // フォールバック
        if (show && message) {
            showToast(message, 'success');
        }
    }
}

/**
 * エラーと成功メッセージをクリアする
 * @param {Array<string>} elementIds - クリアする要素IDの配列
 */
export function clearMessages(...elementIds) {
    elementIds.forEach(id => {
        showErrorMessage(id, '', false);
        showSuccessMessage(id, '', false);
    });
}

// ====================================
// エラーハンドリング
// ====================================

/**
 * エラー情報を構造化する
 * @param {Error|string} error - エラーオブジェクトまたはメッセージ
 * @param {string} context - エラーのコンテキスト
 * @returns {Object} 構造化されたエラー情報
 */
export function createErrorInfo(error, context = 'Unknown') {
    const errorInfo = {
        timestamp: new Date().toISOString(),
        context: context,
        message: '',
        stack: null,
        type: 'unknown'
    };

    if (error instanceof Error) {
        errorInfo.message = error.message;
        errorInfo.stack = error.stack;
        errorInfo.type = error.constructor.name;
    } else if (typeof error === 'string') {
        errorInfo.message = error;
        errorInfo.type = 'string';
    } else {
        errorInfo.message = String(error);
        errorInfo.type = typeof error;
    }

    return errorInfo;
}

/**
 * エラーをログに記録する
 * @param {Error|string} error - エラーオブジェクトまたはメッセージ
 * @param {string} context - エラーのコンテキスト
 * @param {string} level - ログレベル ('error'|'warn'|'info')
 */
export function logError(error, context = 'Unknown', level = 'error') {
    const errorInfo = createErrorInfo(error, context);
    
    const logMessage = `[${errorInfo.context}] ${errorInfo.message}`;
    
    switch (level) {
        case 'error':
            console.error(logMessage, errorInfo);
            break;
        case 'warn':
            console.warn(logMessage, errorInfo);
            break;
        case 'info':
            console.info(logMessage, errorInfo);
            break;
        default:
            console.log(logMessage, errorInfo);
    }

    // 必要に応じて外部ログサービスに送信
    // await sendToExternalLogging(errorInfo);
}

/**
 * 非同期関数を安全に実行する
 * @param {Function} asyncFn - 非同期関数
 * @param {string} context - エラーのコンテキスト
 * @param {Object} options - オプション
 * @returns {Promise<any>} 実行結果またはundefined
 */
export async function safeAsyncExecution(asyncFn, context = 'Async Operation', options = {}) {
    const {
        showErrorToUser = true,
        logError: shouldLog = true,
        defaultValue = undefined,
        errorElementId = null
    } = options;

    try {
        return await asyncFn();
    } catch (error) {
        if (shouldLog) {
            logError(error, context);
        }

        if (showErrorToUser) {
            const userMessage = getUserFriendlyErrorMessage(error);
            
            if (errorElementId) {
                showErrorMessage(errorElementId, userMessage);
            } else {
                showToast(userMessage, 'error');
            }
        }

        return defaultValue;
    }
}

/**
 * 同期関数を安全に実行する
 * @param {Function} syncFn - 同期関数
 * @param {string} context - エラーのコンテキスト
 * @param {Object} options - オプション
 * @returns {any} 実行結果またはundefined
 */
export function safeSyncExecution(syncFn, context = 'Sync Operation', options = {}) {
    const {
        showErrorToUser = true,
        logError: shouldLog = true,
        defaultValue = undefined,
        errorElementId = null
    } = options;

    try {
        return syncFn();
    } catch (error) {
        if (shouldLog) {
            logError(error, context);
        }

        if (showErrorToUser) {
            const userMessage = getUserFriendlyErrorMessage(error);
            
            if (errorElementId) {
                showErrorMessage(errorElementId, userMessage);
            } else {
                showToast(userMessage, 'error');
            }
        }

        return defaultValue;
    }
}

// ====================================
// エラーメッセージ変換
// ====================================

/**
 * エラーをユーザーフレンドリーなメッセージに変換する
 * @param {Error|string} error - エラーオブジェクトまたはメッセージ
 * @returns {string} ユーザーフレンドリーなメッセージ
 */
export function getUserFriendlyErrorMessage(error) {
    const message = error instanceof Error ? error.message : String(error);
    
    // 一般的なエラーパターンをユーザーフレンドリーに変換
    const patterns = [
        {
            pattern: /network|fetch|connection/i,
            message: 'ネットワーク接続に問題があります。インターネット接続を確認してください。'
        },
        {
            pattern: /unauthorized|401/i,
            message: '認証に失敗しました。再度ログインしてください。'
        },
        {
            pattern: /forbidden|403/i,
            message: 'アクセス権限がありません。'
        },
        {
            pattern: /not found|404/i,
            message: '要求されたリソースが見つかりません。'
        },
        {
            pattern: /timeout/i,
            message: '処理がタイムアウトしました。しばらく待ってから再試行してください。'
        },
        {
            pattern: /rate limit|429/i,
            message: 'リクエストが多すぎます。しばらく待ってから再試行してください。'
        },
        {
            pattern: /server error|500/i,
            message: 'サーバーエラーが発生しました。しばらく待ってから再試行してください。'
        }
    ];

    for (const { pattern, message: friendlyMessage } of patterns) {
        if (pattern.test(message)) {
            return friendlyMessage;
        }
    }

    // パターンに一致しない場合は、エラーメッセージをそのまま返す（ただし、技術的すぎる部分は除去）
    return message.replace(/at\s+.*:\d+:\d+/g, '').trim() || '予期しないエラーが発生しました。';
}

// ====================================
// ボタン状態管理
// ====================================

/**
 * ボタンの状態を設定する（ローディング状態など）
 * @param {string|HTMLElement} buttonOrId - ボタン要素またはID
 * @param {boolean} disabled - 無効にするかどうか
 * @param {string} text - ボタンテキスト（省略可）
 * @returns {boolean} 成功したかどうか
 */
export function setButtonState(buttonOrId, disabled, text = null) {
    try {
        const button = typeof buttonOrId === 'string' 
            ? getElement(buttonOrId, false) 
            : buttonOrId;
            
        if (!button) return false;

        button.disabled = disabled;
        
        if (text !== null) {
            button.textContent = text;
        }

        // ローディング状態のクラス管理
        toggleElementClass(button, 'loading', disabled);
        
        return true;
    } catch (error) {
        logError(error, 'setButtonState');
        return false;
    }
}

// ====================================
// デバッグ用ユーティリティ
// ====================================

/**
 * デバッグ情報を表示する（開発環境のみ）
 * @param {any} data - デバッグデータ
 * @param {string} label - ラベル
 */
export function debugLog(data, label = 'Debug') {
    if (process?.env?.NODE_ENV === 'development') {
        console.log(`[${label}]`, data);
    }
}