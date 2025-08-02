/**
 * 進捗管理モジュール
 * Service Worker環境での進捗更新とバッチ処理管理を行う
 * 
 * このモジュールは処理進捗の記録、バッチ間の休憩処理を管理します
 */

// ====================================
// 定数（一時的にインライン定義）
// ====================================

const BATCH_DELAY = 30000; // 30秒
const ERROR_STOP_REQUESTED = 'STOP_REQUESTED';

// ====================================
// ExDBクラス（Service Worker版）
// ====================================

// Service Worker環境用の簡易ExDB実装
class ExDB {
    constructor() {
        this.dbName = 'TodoDatabase';
        this.version = 1;
        this.storeName = 'todos';
    }

    async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('title', 'title', { unique: false });
                    store.createIndex('created', 'created', { unique: false });
                }
            };
        });
    }

    async getTodoById(todoId) {
        const db = await this.openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(todoId);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateTodo(todoId, updateData) {
        const db = await this.openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const getRequest = store.get(todoId);
            
            getRequest.onsuccess = () => {
                const todo = getRequest.result;
                if (todo) {
                    Object.assign(todo, updateData, { updatedAt: new Date().toISOString() });
                    const putRequest = store.put(todo);
                    putRequest.onsuccess = () => resolve(todo);
                    putRequest.onerror = () => reject(putRequest.error);
                } else {
                    reject(new Error('Todo not found'));
                }
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }
}

// ====================================
// 進捗管理関数
// ====================================

/**
 * 進捗を更新する
 * @param {string} todoId - TodoのID
 * @param {number} urlIndex - URLのインデックス
 * @param {Object} result - 結果オブジェクト
 */
async function updateProgress(todoId, urlIndex, result) {
    try {
        const db = new ExDB();
        const todo = await db.getTodoById(todoId);
        
        if (todo && todo.description && todo.description[urlIndex]) {
            todo.description[urlIndex] = result;
            await db.updateTodo(todoId, { description: todo.description });
        }
    } catch (error) {
        console.warn('Progress update failed:', error);
        // エラーを無視（処理継続）
    }
}

/**
 * バッチ間の休憩処理
 * @param {number} batchNumber - バッチ番号
 * @param {number} totalBatches - 総バッチ数
 * @param {number} tabId - タブID
 * @returns {Promise<void>}
 */
async function batchBreak(batchNumber, totalBatches, tabId) {
    try {
        await chrome.tabs.update(tabId, {
            url: `data:text/html,<html><head><meta charset="UTF-8"><title>処理最適化中...</title><style>body{font-family:sans-serif;text-align:center;padding:50px;background:#f8f9fa;color:#202124;}h1{color:#4285f4;}p{margin:10px 0;}</style></head><body><h1>処理最適化中...</h1><p>サーバー負荷軽減のため少し待機しています</p><p>このページは自動的に閉じられます</p><p>停止ボタンで処理を中断できます</p><p>バッチ ${batchNumber}/${totalBatches} 完了</p></body></html>`
        });
    } catch (error) {
        console.warn('Batch break page update failed:', error);
        // エラーを無視（処理継続）
    }

    return new Promise((resolve, reject) => {
        // 停止制御チェック
        if (globalThis.StopControl && globalThis.StopControl.isStoppingState()) {
            reject(new Error(ERROR_STOP_REQUESTED));
            return;
        }

        const iterations = 6;
        const interval = BATCH_DELAY / iterations;
        let wrappedReject;

        const originalReject = reject;
        wrappedReject = (error) => {
            isStoppedLoop = true;
            if (globalThis.StopControl) {
                globalThis.StopControl.unregisterPromiseReject(wrappedReject);
            }
            originalReject(error);
        };

        // 停止制御に登録
        if (globalThis.StopControl) {
            globalThis.StopControl.registerPromiseReject(wrappedReject);
        }
        
        let isStoppedLoop = false;
        let currentIteration = 0;

        (async () => {
            while (currentIteration < iterations) {
                // 停止チェック
                if (globalThis.StopControl && globalThis.StopControl.isStoppingState()) {
                    wrappedReject(new Error(ERROR_STOP_REQUESTED));
                    return;
                }

                await new Promise(r => setTimeout(r, interval));
                
                if (isStoppedLoop) return;

                try {
                    await chrome.storage.local.set({
                        batchProgress: `${batchNumber}_${currentIteration + 1}_${Date.now()}`
                    });
                } catch (keepAliveError) {
                    console.warn('Batch progress storage failed:', keepAliveError);
                    // エラーを無視（処理継続）
                }

                currentIteration++;
            }

            // 停止制御から登録解除
            if (globalThis.StopControl) {
                globalThis.StopControl.unregisterPromiseReject(wrappedReject);
            }
            resolve();
        })();
    });
}

/**
 * 処理の全体進捗を計算する
 * @param {number} completedUrls - 完了したURL数
 * @param {number} totalUrls - 総URL数
 * @returns {Object} 進捗情報
 */
function calculateProgress(completedUrls, totalUrls) {
    const percentage = totalUrls > 0 ? Math.round((completedUrls / totalUrls) * 100) : 0;
    
    return {
        completed: completedUrls,
        total: totalUrls,
        percentage: percentage,
        remaining: Math.max(0, totalUrls - completedUrls)
    };
}

/**
 * バッチ処理の進捗状況を取得する
 * @returns {Promise<Object>} バッチ進捗情報
 */
async function getBatchProgress() {
    try {
        const result = await chrome.storage.local.get(['batchProgress']);
        const progressData = result.batchProgress;
        
        if (progressData) {
            const [batchNumber, iteration, timestamp] = progressData.split('_');
            return {
                batchNumber: parseInt(batchNumber),
                iteration: parseInt(iteration),
                timestamp: parseInt(timestamp),
                lastUpdated: new Date(parseInt(timestamp))
            };
        }
        
        return {
            batchNumber: 0,
            iteration: 0,
            timestamp: Date.now(),
            lastUpdated: new Date()
        };
    } catch (error) {
        console.warn('Failed to get batch progress:', error);
        return {
            batchNumber: 0,
            iteration: 0,
            timestamp: Date.now(),
            lastUpdated: new Date()
        };
    }
}

/**
 * バッチ処理の進捗をクリアする
 * @returns {Promise<void>}
 */
async function clearBatchProgress() {
    try {
        await chrome.storage.local.remove(['batchProgress']);
    } catch (error) {
        console.warn('Failed to clear batch progress:', error);
    }
}

// ====================================
// Service Worker向けエクスポート
// ====================================

// Service Worker環境ではグローバルスコープに関数を配置
if (typeof globalThis !== 'undefined') {
    globalThis.ProgressManager = {
        updateProgress,
        batchBreak,
        calculateProgress,
        getBatchProgress,
        clearBatchProgress
    };
}