// 共通データベースクラスと定数のインポート
import { ExDB } from '../shared/database.js';
import { ACTION_STOP_COMPLETED } from '../shared/constants.js';

// ====================================
// 進捗監視機能
// ====================================

/**
 * 進捗を監視してUIを更新する
 */
async function monitorProgress() {
    // DOM要素の取得
    const progressBar = document.getElementById('progressBar');
    const progressCount = document.getElementById('progressCount');
    const progressPercentage = document.getElementById('progressPercentage');
    const currentUrl = document.getElementById('currentUrl');
    const statusText = document.getElementById('statusText');

    // 状態管理変数
    let redirectTimeout = null;
    let lastProcessedCount = 0;
    let noProgressCounter = 0;
    let isStopping = false;
    let isStopNotificationReceived = false; // 停止完了通知受信フラグ

    /**
     * 進捗状況をチェックして表示を更新する
     */
    async function checkProgress() {
        try {
            const database = new ExDB();
            const latestTodo = await database.getLatestTodo();

            // Todoが存在しない場合
            if (!latestTodo || !latestTodo.description) {
                statusText.textContent = '処理待機中...';
                return;
            }

            const totalUrls = latestTodo.description.length;
            const processedCount = latestTodo.description.filter(item => item.result !== '').length;
            const stoppedCount = latestTodo.description.filter(item => item.result === '停止').length;

            // ====================================
            // 停止処理の検出と対応
            // ====================================
            
            if (stoppedCount > 0 && !isStopping) {
                isStopping = true;
                statusText.textContent = '送信停止中...';
                currentUrl.textContent = '処理が停止されました';
                
                if (redirectTimeout) clearTimeout(redirectTimeout);
                redirectTimeout = setTimeout(() => {
                    window.location.href = 'done.html';
                }, 2000);
                return;
            }

            // ====================================
            // 停止完了通知受信時の即座遷移
            // ====================================
            
            if (isStopNotificationReceived && !redirectTimeout) {
                statusText.textContent = '送信停止完了';
                currentUrl.textContent = '停止完了により終了します';
                
                redirectTimeout = setTimeout(() => {
                    window.location.href = 'main.html';
                }, 1000);
                return;
            }

            // ====================================
            // 進捗停滞の検出（エラー対応）
            // ====================================
            
            if (!isStopping && !isStopNotificationReceived) {
                if (processedCount === lastProcessedCount) {
                    noProgressCounter++;
                    // 30秒間進捗がない場合はエラーページへ
                    if (noProgressCounter > 30) {
                        window.location.href = 'error.html';
                        return;
                    }
                } else {
                    noProgressCounter = 0;
                    lastProcessedCount = processedCount;
                }
            }

            // ====================================
            // 進捗バーとカウンターの更新
            // ====================================
            
            progressBar.max = totalUrls;
            progressBar.value = processedCount;
            progressCount.textContent = `${processedCount}/${totalUrls}`;

            const percentage = totalUrls > 0 ? Math.round((processedCount / totalUrls) * 100) : 0;
            progressPercentage.textContent = `${percentage}%`;

            // ====================================
            // 完了状態の処理
            // ====================================
            
            if (latestTodo.completed) {
                if (stoppedCount > 0) {
                    currentUrl.textContent = '停止により完了';
                    statusText.textContent = '送信停止完了';
                } else {
                    currentUrl.textContent = '全て完了';
                    statusText.textContent = '送信完了';
                }

                if (redirectTimeout) clearTimeout(redirectTimeout);
                redirectTimeout = setTimeout(() => {
                    window.location.href = 'done.html';
                }, 2000);
            } else {
                // ====================================
                // 処理中状態の表示更新
                // ====================================
                
                const currentIndex = processedCount;
                if (currentIndex < totalUrls) {
                    const currentItem = latestTodo.description[currentIndex];
                    if (currentItem) {
                        currentUrl.textContent = currentItem.url;
                        
                        if (isStopping || isStopNotificationReceived) {
                            statusText.textContent = '停止処理中...';
                        } else {
                            statusText.textContent = `処理中... (${processedCount + 1}/${totalUrls})`;
                        }
                    }
                } else {
                    currentUrl.textContent = '完了処理中...';
                    statusText.textContent = '完了処理中...';
                }
            }

        } catch (error) {
            // エラーが発生した場合の処理
            statusText.textContent = 'エラーが発生しました';
            setTimeout(() => {
                window.location.href = 'error.html';
            }, 5000);
        }
    }

    // ====================================
    // 停止完了通知の受信処理（解決策E）
    // ====================================
    
    /**
     * 停止完了通知を受信したときの処理
     * @param {Object} message - 受信したメッセージ
     * @param {Object} sender - 送信者情報
     * @param {Function} sendResponse - 応答関数
     */
    function handleStopCompletedNotification(message, sender, sendResponse) {
        if (message.action === ACTION_STOP_COMPLETED) {
            console.log('process.js: Stop completion notification received', message);
            
            // 停止完了通知受信フラグを設定
            isStopNotificationReceived = true;
            
            // UIを即座に更新
            if (statusText) {
                statusText.textContent = '送信停止完了';
            }
            if (currentUrl) {
                currentUrl.textContent = 'メイン画面に戻ります...';
            }
            
            // 既存のタイムアウトをクリア
            if (redirectTimeout) {
                clearTimeout(redirectTimeout);
            }
            
            // 少し待ってからmain.htmlに遷移
            redirectTimeout = setTimeout(() => {
                console.log('process.js: Redirecting to main.html due to stop notification');
                window.location.href = 'main.html';
            }, 1500);
            
            // 応答を送信
            try {
                sendResponse({ received: true, timestamp: Date.now() });
            } catch (error) {
                console.log('process.js: Failed to send response:', error.message);
            }
            
            return true; // 非同期応答を示す
        }
    }

    // Chrome runtime message listenerを設定
    if (chrome && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener(handleStopCompletedNotification);
        console.log('process.js: Stop completion notification listener registered');
    } else {
        console.warn('process.js: Chrome runtime API not available');
    }

    // 初回実行
    await checkProgress();
    
    // 1秒間隔で定期実行
    setInterval(checkProgress, 1000);
    
    // 進捗監視の状態をログ出力
    console.log('process.js: Progress monitoring started');
}

// ====================================
// ページ終了時のクリーンアップ
// ====================================

/**
 * ページ離脱時のクリーンアップ処理
 */
function setupCleanupHandlers() {
    // ページ離脱時のイベントリスナー
    window.addEventListener('beforeunload', function(event) {
        console.log('process.js: Page is being unloaded');
        
        // 必要に応じてクリーンアップ処理を追加
        // 例：進行中の処理の状態保存など
    });
    
    // ページ非表示時のイベントリスナー（タブ切り替えなど）
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            console.log('process.js: Page became hidden');
        } else {
            console.log('process.js: Page became visible');
        }
    });
}

// ====================================
// エラーハンドリング
// ====================================

/**
 * グローバルエラーハンドラーを設定
 */
function setupErrorHandlers() {
    // 未処理のエラーをキャッチ
    window.addEventListener('error', function(event) {
        console.error('process.js: Unhandled error:', event.error);
        
        // 重要なエラーの場合はエラーページに遷移
        if (event.error && event.error.message) {
            const criticalErrors = [
                'Network error',
                'Database error',
                'Chrome extension error'
            ];
            
            const isCritical = criticalErrors.some(errorType => 
                event.error.message.includes(errorType)
            );
            
            if (isCritical) {
                setTimeout(() => {
                    window.location.href = 'error.html';
                }, 2000);
            }
        }
    });
    
    // Promiseの未処理の拒否をキャッチ
    window.addEventListener('unhandledrejection', function(event) {
        console.error('process.js: Unhandled promise rejection:', event.reason);
        
        // 必要に応じてエラーページに遷移
        // event.preventDefault(); // デフォルトの動作を防ぐ場合
    });
}

// ====================================
// 初期化処理
// ====================================

/**
 * DOM読み込み完了時の処理
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('process.js: DOM loaded, starting initialization');
    
    try {
        // エラーハンドラーの設定
        setupErrorHandlers();
        
        // クリーンアップハンドラーの設定
        setupCleanupHandlers();
        
        // 進捗監視の開始
        monitorProgress();
        
        console.log('process.js: Initialization completed successfully');
        
    } catch (error) {
        console.error('process.js: Initialization failed:', error);
        
        // 初期化に失敗した場合はエラーページに遷移
        setTimeout(() => {
            window.location.href = 'error.html';
        }, 3000);
    }
});