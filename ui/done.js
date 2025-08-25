// 共通データベースクラスのインポート
import { ExDB } from '../shared/database.js';

// ====================================
// タブ操作関数
// ====================================

/**
 * メインタブに戻る（自動ページ更新付き）
 * @param {string|null} tabParam - タブパラメータ（オプション）
 */
async function returnToMainTab(tabParam = null) {
    const mainUrl = chrome.runtime.getURL('ui/main.html') + (tabParam || '');
    
    try {
        // 既存のメインタブを検索
        const tabs = await chrome.tabs.query({
            url: chrome.runtime.getURL('ui/main.html') + '*'
        });

        if (tabs.length > 0) {
            // 既存のメインタブがある場合：URLを更新してページをリロード
            await chrome.tabs.update(tabs[0].id, {
                url: mainUrl,  // 常にURLを再設定してリロード
                active: true
            });
        } else {
            // 既存のメインタブがない場合：新しく作成
            await chrome.tabs.create({ url: mainUrl });
        }

        // 現在のタブを閉じる
        const currentTab = await chrome.tabs.getCurrent();
        if (currentTab) {
            chrome.tabs.remove(currentTab.id);
        }

    } catch (error) {
        console.error('Failed to return to main tab:', error);
        // エラー時は新しいタブを作成
        chrome.tabs.create({ url: mainUrl });
    }
}

// ====================================
// 結果表示関数
// ====================================

/**
 * 送信結果を表示する
 */
async function displayResults() {
    try {
        const db = new ExDB();
        const latestTodo = await db.getLatestTodo();

        if (!latestTodo || !latestTodo.description) {
            return; // データがない場合はデフォルト値のまま
        }

        // 統計計算
        const { total, success, failure, stopped } = calculateStatistics(latestTodo.description);

        // 統計をHTMLに反映
        updateStatisticsDisplay(total, success, failure, stopped);

        // 停止処理の場合は特別なUI表示
        if (stopped > 0) {
            updateStoppedProcessUI(failure, stopped);
        }

    } catch (error) {
        console.error('Failed to display results:', error);
        // エラー時はデフォルト値のまま表示継続
    }
}

/**
 * 統計データを計算
 * @param {Array} description - 処理結果配列
 * @returns {Object} 統計データ
 */
function calculateStatistics(description) {
    const total = description.length;
    const success = description.filter(item => item.result === '成功').length;
    const failure = description.filter(item => item.result === '失敗').length;
    const stopped = description.filter(item => 
        item.result === '停止' || item.result === '停止'
    ).length;

    return { total, success, failure, stopped };
}

/**
 * 統計表示を更新
 * @param {number} total - 総数
 * @param {number} success - 成功数
 * @param {number} failure - 失敗数
 * @param {number} stopped - 停止数
 */
function updateStatisticsDisplay(total, success, failure, stopped) {
    const totalElement = document.getElementById('totalCount');
    const successElement = document.getElementById('successCount');
    const failureElement = document.getElementById('failureCount');

    if (totalElement) totalElement.textContent = total;
    if (successElement) successElement.textContent = success;
    
    if (failureElement) {
        failureElement.textContent = stopped > 0 ? 
            `${failure} (停止: ${stopped})` : failure;
    }
}

/**
 * 停止処理時のUI更新
 * @param {number} failure - 失敗数
 * @param {number} stopped - 停止数
 */
function updateStoppedProcessUI(failure, stopped) {
    // タイトル変更
    const titleElement = document.querySelector('.done-title');
    if (titleElement) {
        titleElement.textContent = '送信処理が停止されました';
    }

    // アイコン変更
    const iconElement = document.querySelector('.done-icon');
    if (iconElement) {
        iconElement.textContent = '⏸';
        iconElement.style.backgroundColor = 'var(--warning-color)';
    }

    // 説明文変更
    const descElement = document.querySelector('.done-description');
    if (descElement) {
        descElement.innerHTML = `処理が途中で停止されました。<br>以下に処理完了分の結果概要を表示します。`;
    }
}

// ====================================
// イベントリスナーの設定
// ====================================

/**
 * DOM読み込み完了時の処理
 */
document.addEventListener('DOMContentLoaded', function() {
    // 結果表示
    displayResults();

    // 詳細表示ボタン
    const viewDetailsBtn = document.getElementById('viewDetails');
    if (viewDetailsBtn) {
        viewDetailsBtn.addEventListener('click', function() {
            returnToMainTab('?tab=results');
        });
    }

    // トップに戻るボタン（ページ自動更新機能付き）
    const backToMainBtn = document.getElementById('backToMain');
    if (backToMainBtn) {
        backToMainBtn.addEventListener('click', function() {
            returnToMainTab(); // URLリロードでmain.htmlを正常状態に復帰
        });
    }
});

/**
 * ウィンドウ読み込み完了時の処理
 */
window.addEventListener('load', function() {
    displayResults();
});