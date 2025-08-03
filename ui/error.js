/**
 * エラーページのJavaScript処理
 * CSP対応のため、インラインスクリプトから分離
 */

/**
 * DOM読み込み完了時の処理
 */
document.addEventListener('DOMContentLoaded', function() {
    
    // 再試行ボタンのイベントリスナー
    const retryButton = document.getElementById('retryButton');
    if (retryButton) {
        retryButton.addEventListener('click', function() {
            // 前のページに戻る
            history.back();
        });
    }

    // トップに戻るボタンのイベントリスナー
    const backToMainButton = document.getElementById('backToMain');
    if (backToMainButton) {
        backToMainButton.addEventListener('click', function() {
            // メインページに遷移（Chrome拡張機能内のページ遷移）
            window.location.href = 'main.html';
        });
    }
    
});