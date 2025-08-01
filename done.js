// ====================================
// IndexedDBデータベース操作クラス
// ====================================

/**
 * ExDBクラス - IndexedDBを使用したデータベース操作
 */
class ExDB {
    constructor() {
        this.dbName = "TodoDatabase";
        this.dbVersion = 1;
        this.storeName = "todos";
    }

    /**
     * データベースを開く
     * @returns {Promise<IDBDatabase>} データベースインスタンス
     */
    async openDB() {
        return new Promise((resolve, reject) => {
            let request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = event => {
                reject("DBオープンエラー: " + event.target.error);
            };

            request.onupgradeneeded = event => {
                let db = event.target.result;
                let store = db.createObjectStore(this.storeName, {
                    keyPath: "id",
                    autoIncrement: true
                });
                store.createIndex("created", "created", { unique: false });
            };

            request.onsuccess = event => {
                resolve(event.target.result);
            };
        });
    }

    /**
     * 最新のTodoを取得する
     * @returns {Promise<Object|null>} 最新のTodoオブジェクト
     */
    async getLatestTodo() {
        let db = await this.openDB();
        
        return new Promise((resolve, reject) => {
            let transaction = db.transaction([this.storeName], "readonly");
            let store = transaction.objectStore(this.storeName);
            let index = store.index("created");
            let request = index.openCursor(null, "prev");

            request.onsuccess = event => {
                let cursor = event.target.result;
                if (cursor) {
                    resolve(cursor.value);
                } else {
                    resolve(null);
                }
            };

            request.onerror = event => {
                reject("データ取得エラー: " + event.target.error);
            };
        });
    }
}

// ====================================
// タブ操作関数
// ====================================

/**
 * メインタブに戻る
 * @param {string|null} tabParam - タブパラメータ（オプション）
 */
async function returnToMainTab(tabParam = null) {
    try {
        // 既存のメインタブを検索
        const tabs = await chrome.tabs.query({
            url: chrome.runtime.getURL('main.html') + '*'
        });

        if (tabs.length > 0) {
            // 既存のメインタブがある場合
            const mainTab = tabs[0];
            
            if (tabParam) {
                await chrome.tabs.update(mainTab.id, {
                    url: chrome.runtime.getURL('main.html') + tabParam,
                    active: true
                });
            } else {
                await chrome.tabs.update(mainTab.id, { active: true });
            }

            // 現在のタブを閉じる
            const currentTab = await chrome.tabs.getCurrent();
            if (currentTab) {
                chrome.tabs.remove(currentTab.id);
            }
        } else {
            // 既存のメインタブがない場合、新しく作成
            if (tabParam) {
                chrome.tabs.create({
                    url: chrome.runtime.getURL('main.html') + tabParam
                });
            } else {
                chrome.tabs.create({
                    url: chrome.runtime.getURL('main.html')
                });
            }

            // 現在のタブを閉じる
            const currentTab = await chrome.tabs.getCurrent();
            if (currentTab) {
                chrome.tabs.remove(currentTab.id);
            }
        }
    } catch (error) {
        // エラー時は新しいタブを作成
        if (tabParam) {
            chrome.tabs.create({
                url: chrome.runtime.getURL('main.html') + tabParam
            });
        } else {
            chrome.tabs.create({
                url: chrome.runtime.getURL('main.html')
            });
        }
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

        if (latestTodo && latestTodo.description) {
            // 統計を計算
            const total = latestTodo.description.length;
            const success = latestTodo.description.filter(item => item.result === '成功').length;
            const failure = latestTodo.description.filter(item => item.result === '失敗').length;
            const stopped = latestTodo.description.filter(item => 
                item.result === '停止' || item.result === '停止'
            ).length;

            // 統計をHTMLに反映
            document.getElementById('totalCount').textContent = total;
            document.getElementById('successCount').textContent = success;

            // 停止された処理がある場合の特別処理
            if (stopped > 0) {
                document.getElementById('failureCount').textContent = `${failure} (停止: ${stopped})`;

                // タイトルを変更
                const titleElement = document.querySelector('.done-title');
                if (titleElement) {
                    titleElement.textContent = '送信処理が停止されました';
                }

                // アイコンを変更
                const iconElement = document.querySelector('.done-icon');
                if (iconElement) {
                    iconElement.textContent = '⏸';
                    iconElement.style.backgroundColor = 'var(--warning-color)';
                }

                // 説明文を変更
                const descElement = document.querySelector('.done-description');
                if (descElement) {
                    descElement.innerHTML = `処理が途中で停止されました。<br>以下に処理完了分の結果概要を表示します。`;
                }
            } else {
                // 通常の完了処理
                document.getElementById('failureCount').textContent = failure;
            }
        }
    } catch (error) {
        // エラーが発生した場合は何もしない（デフォルト値のまま）
    }
}

// ====================================
// イベントリスナーの設定
// ====================================

/**
 * DOM読み込み完了時の処理
 */
document.addEventListener('DOMContentLoaded', function() {
    // 500ms後に結果表示
    setTimeout(displayResults, 500);

    // 詳細表示ボタンのイベントリスナー
    document.getElementById('viewDetails').addEventListener('click', function() {
        returnToMainTab('?tab=results');
    });

    // トップに戻るボタンのイベントリスナー
    document.getElementById('backToMain').addEventListener('click', function() {
        returnToMainTab();
    });
});

/**
 * ウィンドウ読み込み完了時の処理
 */
window.onload = function() {
    displayResults();
};