/**
 * エラーページのJavaScript処理
 * CSP対応のため、インラインスクリプトから分離
 */

/**
 * メインタブに戻る
 */
async function returnToMainTab() {
    try {
        // 既存のメインタブを検索
        const tabs = await chrome.tabs.query({
            url: chrome.runtime.getURL('ui/main.html') + '*'
        });

        if (tabs.length > 0) {
            // 既存のメインタブがある場合
            const mainTab = tabs[0];
            await chrome.tabs.update(mainTab.id, { active: true });

            // 現在のタブを閉じる
            const currentTab = await chrome.tabs.getCurrent();
            if (currentTab) {
                chrome.tabs.remove(currentTab.id);
            }
        } else {
            // 既存のメインタブがない場合、新しく作成
            chrome.tabs.create({
                url: chrome.runtime.getURL('ui/main.html')
            });

            // 現在のタブを閉じる
            const currentTab = await chrome.tabs.getCurrent();
            if (currentTab) {
                chrome.tabs.remove(currentTab.id);
            }
        }
    } catch (error) {
        // エラー時は新しいタブを作成
        chrome.tabs.create({
            url: chrome.runtime.getURL('ui/main.html')
        });
    }
}

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
            returnToMainTab();
        });
    }
    
});