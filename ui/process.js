// 共通データベースクラスのインポート
import { ExDB } from '../shared/database.js';

// ====================================
// データベースクラスは shared/database.js からインポート済み
// ====================================

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
            // 進捗停滞の検出（エラー対応）
            // ====================================
            
            if (!isStopping) {
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
                        
                        if (isStopping) {
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

    // 初回実行
    await checkProgress();
    
    // 1秒間隔で定期実行
    setInterval(checkProgress, 1000);
}

// ====================================
// 初期化処理
// ====================================

/**
 * DOM読み込み完了時の処理
 */
document.addEventListener('DOMContentLoaded', function() {
    monitorProgress();
});