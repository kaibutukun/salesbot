// background.js - Service Worker（タブ管理修正版）
// 修正: process.html→done.html遷移時の新しいタブ作成問題を解消

// Service WorkerでのSupabase読み込み
importScripts('supabase/supabase.js');

// ====================================
// 定数定義
// ====================================

const SUPABASE_CONFIG = {
    url: 'https://mqibubhzyvlprhekdjvf.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xaWJ1Ymh6eXZscHJoZWtkanZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MTcyMDgsImV4cCI6MjA2MzQ5MzIwOH0.RsiLZLsbL2A8dbs2e7lmYMl0gzFuvSkq70pdABr2a_I'
};

// バッチ処理設定
const BATCH_SIZE = 100;
const BATCH_DELAY = 30000; // 30秒
const KEEPALIVE_INTERVAL = 20000; // 20秒
const URL_PROCESSING_TIMEOUT = 90000; // 90秒
const FORM_TIMEOUT = 5000; // 5秒
const SEND_TIMEOUT = 10000; // 10秒
const RECAPTCHA_TIMEOUT = 40000; // 40秒

// アクション定数
const ACTION_EXPLORE = "explore";
const ACTION_SEND = "send";
const ACTION_STOP = "stop";
const ACTION_STOP_COMPLETED = "stopCompleted";
const ACTION_CONFIRM = "confirm";
const ACTION_RECHECK = "recheck";
const ACTION_EXECUTE = "execute";
const ERROR_STOP_REQUESTED = 'STOP_REQUESTED';
const TIMEOUT_MESSAGE_TEMPLATE = (seconds) => `処理タイムアウト（${seconds}秒経過）`;

// ====================================
// Supabaseクライアント初期化
// ====================================

function createSupabaseClient() {
    if (typeof supabase === 'undefined') {
        throw new Error('Supabase library is not loaded.');
    }
    return supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
}

let supabaseClient = null;
try {
    supabaseClient = createSupabaseClient();
} catch (error) {
    console.error('Supabase initialization failed:', error);
}

// ====================================
// IndexedDBクラス定義
// ====================================

class ExDB {
    constructor() {
        this.db = null;
        this.dbName = 'TodoDatabase';
        this.version = 1;
    }

    async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('todos')) {
                    const store = db.createObjectStore('todos', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('title', 'title', { unique: false });
                    store.createIndex('created', 'created', { unique: false });
                }
            };
        });
    }

    async addTodo(title, description) {
        if (!this.db) await this.openDB();
        
        const todo = {
            title,
            description,
            results: [],
            created: new Date(),
            completed: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['todos'], 'readwrite');
            const store = transaction.objectStore('todos');
            const request = store.add(todo);
            
            request.onsuccess = () => resolve({ id: request.result, ...todo });
            request.onerror = () => reject(request.error);
        });
    }

    async updateTodo(todoId, updateData) {
        if (!this.db) await this.openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['todos'], 'readwrite');
            const store = transaction.objectStore('todos');
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

    async getTodoById(todoId) {
        if (!this.db) await this.openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['todos'], 'readonly');
            const store = transaction.objectStore('todos');
            const request = store.get(todoId);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getLatestTodo() {
        if (!this.db) await this.openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['todos'], 'readonly');
            const store = transaction.objectStore('todos');
            const index = store.index('created');
            const request = index.openCursor(null, 'prev');
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                resolve(cursor ? cursor.value : null);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getAllTodos() {
        if (!this.db) await this.openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['todos'], 'readonly');
            const store = transaction.objectStore('todos');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteTodo(todoId) {
        if (!this.db) await this.openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['todos'], 'readwrite');
            const store = transaction.objectStore('todos');
            const request = store.delete(todoId);
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
}

// ====================================
// グローバル状態管理
// ====================================

let keepaliveInterval = null;
let isStopping = false;
let activePromiseRejects = new Set();

// 停止状態関連
function resetStopState() {
    isStopping = false;
    activePromiseRejects.clear();
}

function executeStop() {
    isStopping = true;
    activePromiseRejects.forEach(reject => {
        try {
            reject(new Error(ERROR_STOP_REQUESTED));
        } catch (e) {
            // エラーを無視
        }
    });
    activePromiseRejects.clear();
}

function checkStopped() {
    if (isStopping) {
        throw new Error(ERROR_STOP_REQUESTED);
    }
}

// ====================================
// 最適化されたタブ管理システム（修正版）
// ====================================

/**
 * 記録された元のタブID（送信開始前のタブ）を取得
 * @returns {Promise<number|null>} タブID（なければnull）
 */
async function getStoredOriginalTabId() {
    try {
        const data = await chrome.storage.local.get(['originalTabId', 'originalTabTimestamp']);
        
        if (!data.originalTabId) {
            return null;
        }

        // 記録から2時間以上経過している場合は無効とする
        const twoHours = 2 * 60 * 60 * 1000;
        if (data.originalTabTimestamp && (Date.now() - data.originalTabTimestamp) > twoHours) {
            await clearOriginalTabId();
            return null;
        }

        return data.originalTabId;
    } catch (error) {
        console.error('Failed to get stored original tab ID:', error);
        return null;
    }
}

/**
 * 記録された元のタブIDをクリア
 */
async function clearOriginalTabId() {
    try {
        await chrome.storage.local.remove(['originalTabId', 'originalTabTimestamp']);
        console.log('Original tab ID cleared from background');
    } catch (error) {
        console.error('Failed to clear original tab ID:', error);
    }
}

/**
 * 記録されたprocess.htmlタブIDを取得
 * @returns {Promise<number|null>} タブID（なければnull）
 */
async function getStoredProcessTabId() {
    try {
        const data = await chrome.storage.local.get(['processTabId', 'processTabTimestamp']);
        
        if (!data.processTabId) {
            return null;
        }

        // 記録から1時間以上経過している場合は無効とする
        const oneHour = 60 * 60 * 1000;
        if (data.processTabTimestamp && (Date.now() - data.processTabTimestamp) > oneHour) {
            await clearProcessTabId();
            return null;
        }

        return data.processTabId;
    } catch (error) {
        console.error('Failed to get stored process tab ID:', error);
        return null;
    }
}

/**
 * 記録されたprocess.htmlタブIDをクリア
 */
async function clearProcessTabId() {
    try {
        await chrome.storage.local.remove(['processTabId', 'processTabTimestamp']);
        console.log('Process tab ID cleared from background');
    } catch (error) {
        console.error('Failed to clear process tab ID:', error);
    }
}

/**
 * 停止完了通知を全関連タブに送信（最小限のタブ操作）
 * 修正：新しいタブ作成を行わず、通知のみを送信
 */
async function notifyAllTabsStopCompleted() {
    try {
        console.log('notifyAllTabsStopCompleted: Sending stop notification to related tabs');
        
        const targetUrls = [
            chrome.runtime.getURL('ui/main.html'),
            chrome.runtime.getURL('ui/process.html')
        ];

        const allTabs = await chrome.tabs.query({ url: targetUrls });
        console.log(`notifyAllTabsStopCompleted: Found ${allTabs.length} related tabs`);

        // 各タブに停止完了通知を送信（タブ操作は行わない）
        const notificationPromises = allTabs.map(async (tab) => {
            try {
                await chrome.tabs.sendMessage(tab.id, { 
                    action: ACTION_STOP_COMPLETED,
                    timestamp: Date.now()
                });
                console.log(`notifyAllTabsStopCompleted: Successfully notified tab ${tab.id}`);
                return { tabId: tab.id, success: true };
            } catch (error) {
                console.log(`notifyAllTabsStopCompleted: Failed to notify tab ${tab.id}: ${error.message}`);
                return { tabId: tab.id, success: false, error: error.message };
            }
        });

        const results = await Promise.all(notificationPromises);
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        console.log(`notifyAllTabsStopCompleted: Notification results - Success: ${successful}, Failed: ${failed}`);

        return {
            total: allTabs.length,
            successful,
            failed,
            results
        };

    } catch (error) {
        console.error('notifyAllTabsStopCompleted: Error during tab notification:', error);
        return {
            total: 0,
            successful: 0,
            failed: 0,
            error: error.message
        };
    }
}

// ====================================
// Chrome拡張機能イベントリスナー
// ====================================

chrome.action.onClicked.addListener(async (tab) => {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        chrome.tabs.create({ url: 'ui/main.html' });
    } catch (error) {
        chrome.tabs.create({ url: 'ui/main.html' });
    }
});

// ====================================
// ページ読み込み待機
// ====================================

async function waitForPageLoad(tabId) {
    return new Promise(resolve => {
        chrome.tabs.onUpdated.addListener(function listener(id, changeInfo) {
            if (id === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                setTimeout(resolve, 1000);
            }
        });
        
        setTimeout(() => resolve(), FORM_TIMEOUT);
    });
}

// ====================================
// URL処理メイン関数
// ====================================

async function navigateAndExecuteScript(tabId, url, sentUrlList, excludeDomains) {
    return Promise.race([
        executeUrlProcessing(tabId, url, sentUrlList, excludeDomains),
        new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    url: url,
                    result: "失敗",
                    contact: "",
                    reason: TIMEOUT_MESSAGE_TEMPLATE(URL_PROCESSING_TIMEOUT / 1000)
                });
            }, URL_PROCESSING_TIMEOUT);
        })
    ]);
}

async function executeUrlProcessing(tabId, url, sentUrlList, excludeDomains) {
    if (isStopping) {
        return {
            url: url,
            result: "停止",
            contact: "",
            reason: "ユーザーによって停止されました"
        };
    }

    // URLとタグを分離
    let parts = url.split(',');
    url = parts[0];
    let tags = parts.slice(1);

    // 除外ドメインチェック
    if (excludeDomains && excludeDomains.length > 0) {
        for (let i = 0; i < excludeDomains.length; i++) {
            if (excludeDomains[i] !== "" && url.includes(excludeDomains[i])) {
                return {
                    url: url,
                    result: "失敗",
                    contact: "",
                    reason: "除外ドメインのため送信しない"
                };
            }
        }
    }

    // ページに移動
    await chrome.tabs.update(tabId, { url: url });
    await waitForPageLoad(tabId);

    // 探索スクリプト実行
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content-scripts/explore.js"]
    });

    // 探索結果待機
    let exploreResult = await new Promise(resolve => {
        chrome.runtime.onMessage.addListener(function listener(message, sender) {
            if (sender.tab.id === tabId && message.action === ACTION_EXPLORE) {
                chrome.runtime.onMessage.removeListener(listener);
                resolve(message);
            }
        });

        setTimeout(() => {
            resolve({
                success: false,
                currentForm: false,
                contactLink: "",
                message: "Timeout"
            });
        }, FORM_TIMEOUT);
    });

    let originalResult = exploreResult;

    // コンタクトリンクが見つかった場合は移動
    if (exploreResult.success && !exploreResult.currentForm && exploreResult.contactLink) {
        await chrome.tabs.update(tabId, { url: exploreResult.contactLink });
        await waitForPageLoad(tabId);

        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ["content-scripts/explore.js"]
        });

        exploreResult = await new Promise(resolve => {
            chrome.runtime.onMessage.addListener(function listener(message, sender) {
                if (sender.tab.id === tabId && message.action === ACTION_EXPLORE) {
                    chrome.runtime.onMessage.removeListener(listener);
                    resolve(message);
                }
            });

            setTimeout(() => resolve(originalResult), FORM_TIMEOUT);
        });
    }

    let tab = await chrome.tabs.get(tabId);
    let currentUrl = tab.url;

    if (exploreResult.success) {
        let contactUrl = exploreResult.currentForm ? currentUrl : exploreResult.contactLink;

        // 除外ドメインチェック（コンタクトURL）
        if (excludeDomains && excludeDomains.length > 0) {
            for (let i = 0; i < excludeDomains.length; i++) {
                if (excludeDomains[i] !== "" && contactUrl.includes(excludeDomains[i])) {
                    return {
                        url: url,
                        result: "失敗",
                        contact: contactUrl,
                        reason: "除外ドメインのため送信しない"
                    };
                }
            }
        }

        // 重複送信チェック
        if (sentUrlList.includes(contactUrl)) {
            return {
                url: url,
                result: "失敗",
                contact: contactUrl,
                reason: "重複送信のため送信しない"
            };
        }
    } else {
        return {
            url: url,
            result: "失敗",
            contact: "",
            reason: "問い合わせフォームが見つかりませんでした"
        };
    }

    // フォーム送信処理
    if (exploreResult.currentForm) {
        return await processFormSubmission(tabId, url, currentUrl, tags);
    } else {
        await chrome.tabs.update(tabId, { url: exploreResult.contactLink });
        await waitForPageLoad(tabId);
        return await processFormSubmission(tabId, url, exploreResult.contactLink, tags);
    }
}

// ====================================
// フォーム送信処理
// ====================================

async function processFormSubmission(tabId, originalUrl, contactUrl, tags) {
    // reCAPTCHAチェック
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content-scripts/recheck.js"]
    });

    let recheckResult = await new Promise(resolve => {
        chrome.runtime.onMessage.addListener(function listener(message, sender) {
            if (sender.tab.id === tabId && message.action === "recheck") {
                chrome.runtime.onMessage.removeListener(listener);
                resolve(message);
            }
        });

        setTimeout(() => {
            resolve({
                isRecaptcha: false,
                message: "Timeout"
            });
        }, FORM_TIMEOUT);
    });

    // 送信スクリプト実行
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content-scripts/send.js"]
    }, () => {
        chrome.tabs.sendMessage(tabId, {
            action: "tags",
            tags: tags
        });
    });

    let sendResult = await new Promise(resolve => {
        chrome.runtime.onMessage.addListener(function listener(message, sender) {
            if (sender.tab.id === tabId && message.action === ACTION_SEND) {
                chrome.runtime.onMessage.removeListener(listener);
                resolve(message);
            }
        });

        let timeout = recheckResult.isRecaptcha ? RECAPTCHA_TIMEOUT : SEND_TIMEOUT;
        setTimeout(() => {
            resolve({
                success: true,
                message: ""
            });
        }, timeout);
    });

    if (!sendResult.success) {
        return {
            url: originalUrl,
            result: "失敗",
            contact: contactUrl,
            reason: sendResult.message
        };
    }

    // 確認処理
    await chrome.tabs.get(tabId);
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content-scripts/confirm.js"]
    });

    let confirmResult = await new Promise(resolve => {
        chrome.runtime.onMessage.addListener(function listener(message, sender) {
            if (sender.tab.id === tabId && message.action === "confirm") {
                chrome.runtime.onMessage.removeListener(listener);
                resolve(message);
            }
        });

        setTimeout(() => {
            resolve({
                success: true,
                message: ""
            });
        }, 10000);
    });

    return {
        url: originalUrl,
        result: confirmResult.success ? "成功" : "失敗",
        contact: contactUrl,
        reason: confirmResult.success ? "成功" : confirmResult.message
    };
}

// ====================================
// ユーティリティ関数
// ====================================

async function isTimeRestricted() {
    try {
        const timeSettingsData = await chrome.storage.sync.get([
            'enableTimeRestriction',
            'restrictionStartTime',
            'restrictionEndTime',
            'restrictionWeekdays'
        ]);

        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentDay = now.getDay();

        const restrictedWeekdays = timeSettingsData.restrictionWeekdays || [];
        if (restrictedWeekdays.includes(currentDay)) {
            return true;
        }

        if (!timeSettingsData.enableTimeRestriction) {
            return false;
        }

        const startTime = timeSettingsData.restrictionStartTime || '22:00';
        const endTime = timeSettingsData.restrictionEndTime || '08:00';

        const [startHour, startMinute] = startTime.split(':').map(Number);
        const [endHour, endMinute] = endTime.split(':').map(Number);

        const currentTimeInMinutes = currentHour * 60 + currentMinute;
        const startTimeInMinutes = startHour * 60 + startMinute;
        const endTimeInMinutes = endHour * 60 + endMinute;

        if (startTimeInMinutes < endTimeInMinutes) {
            return currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes <= endTimeInMinutes;
        } else {
            return currentTimeInMinutes >= startTimeInMinutes || currentTimeInMinutes <= endTimeInMinutes;
        }
    } catch (error) {
        return false;
    }
}

function startKeepalive() {
    if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
    }
    keepaliveInterval = setInterval(() => {
        // 空の処理でプロセスを継続
    }, KEEPALIVE_INTERVAL);
}

function stopKeepalive() {
    if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
        keepaliveInterval = null;
    }
}

async function updateProgress(todoId, urlIndex, result) {
    try {
        const db = new ExDB();
        const todo = await db.getTodoById(todoId);
        
        if (todo && todo.description && todo.description[urlIndex]) {
            todo.description[urlIndex] = result;
            await db.updateTodo(todoId, { description: todo.description });
        }
    } catch (error) {
        // エラーを無視
    }
}

async function batchBreak(batchNumber, totalBatches, tabId) {
    try {
        await chrome.tabs.update(tabId, {
            url: `data:text/html,<html><head><meta charset="UTF-8"><title>処理休憩中...</title><style>body{font-family:sans-serif;text-align:center;padding:50px;background:#f8f9fa;color:#202124;}h1{color:#4285f4;}p{margin:10px 0;}</style></head><body><h1>処理休憩中...</h1><p>サーバー負荷軽減のため少し待機しています</p><p>このページは自動的に閉じられます</p><p>停止ボタンで処理を中断できます</p></body></html>`
        });
    } catch (error) {
        // エラーを無視
    }

    return new Promise((resolve, reject) => {
        if (isStopping) {
            reject(new Error(ERROR_STOP_REQUESTED));
            return;
        }

        const iterations = 6;
        const interval = BATCH_DELAY / iterations;
        let wrappedReject;

        const originalReject = reject;
        wrappedReject = (error) => {
            isStoppedLoop = true;
            activePromiseRejects.delete(wrappedReject);
            originalReject(error);
        };

        activePromiseRejects.add(wrappedReject);
        let isStoppedLoop = false;
        let currentIteration = 0;

        (async () => {
            while (currentIteration < iterations) {
                if (isStopping) {
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
                    // エラーを無視
                }

                currentIteration++;
            }

            activePromiseRejects.delete(wrappedReject);
            resolve();
        })();
    });
}

async function getLatestTodo(maxRetries = 3) {
    const db = new ExDB();
    
    for (let retry = 0; retry < maxRetries; retry++) {
        try {
            await new Promise(resolve => setTimeout(resolve, 200));
            
            const latestTodo = await db.getLatestTodo();
            if (latestTodo && latestTodo.description && latestTodo.description.length > 0) {
                return latestTodo;
            }
            
            if (retry < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } catch (error) {
            if (retry === maxRetries - 1) {
                throw error;
            }
        }
    }
    
    return null;
}

// ====================================
// Chrome拡張機能メッセージリスナー
// ====================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 停止処理
    if (message.action === ACTION_STOP) {
        executeStop();
        sendResponse({ success: true });
        return true;
    }

    // 実行処理
    if (message.action === ACTION_EXECUTE) {
        let tabId = message.tabId;

        (async () => {
            try {
                resetStopState();
                startKeepalive();

                // データベース初期化
                const db = new ExDB();
                try {
                    await db.openDB();
                } catch (dbError) {
                    chrome.tabs.update(tabId, { url: "ui/error.html" });
                    stopKeepalive();
                    return;
                }

                // 時間制限チェック
                if (await isTimeRestricted()) {
                    chrome.tabs.update(tabId, { url: "ui/time_restricted.html" });
                    stopKeepalive();
                    return;
                }

                // ライセンスチェック
                const licenseData = await chrome.storage.sync.get("validLicense");
                if (!licenseData.validLicense) {
                    chrome.tabs.update(tabId, { url: "ui/error.html" });
                    stopKeepalive();
                    return;
                }

                // 除外ドメイン取得
                let excludeData = await chrome.storage.local.get(["excludeDomain"]);
                let excludeDomain = excludeData.excludeDomain;

                // 重複送信設定取得
                let duplicateData = await chrome.storage.sync.get("DoNotDuplicateSend");
                let sentUrlList = [];

                if (duplicateData && duplicateData.DoNotDuplicateSend) {
                    let todos = await db.getAllTodos();
                    for (let i = 0; i < todos.length; i++) {
                        if (todos[i].completed) {
                            for (let j = 0; j < todos[i].description.length; j++) {
                                if (todos[i].description[j].result === "成功") {
                                    sentUrlList.push(todos[i].description[j].contact);
                                }
                            }
                        }
                    }
                }

                // 重複除去
                sentUrlList = sentUrlList.filter((value, index, self) => 
                    self.indexOf(value) === index
                );

                // 最新Todo取得
                let latestTodo;
                try {
                    latestTodo = await getLatestTodo();
                } catch (error) {
                    chrome.tabs.update(tabId, { url: "ui/error.html" });
                    stopKeepalive();
                    return;
                }

                if (!latestTodo) {
                    chrome.tabs.update(tabId, { url: "ui/error.html" });
                    stopKeepalive();
                    return;
                }

                if (latestTodo.completed) {
                    chrome.tabs.update(tabId, { url: "ui/error.html" });
                    stopKeepalive();
                    return;
                }

                let urlList = latestTodo.description;
                const totalUrls = urlList.length;

                // バッチ処理
                for (let batchStart = 0; batchStart < totalUrls; batchStart += BATCH_SIZE) {
                    checkStopped();
                    
                    const batchEnd = Math.min(batchStart + BATCH_SIZE, totalUrls);
                    const currentBatch = Math.floor(batchStart / BATCH_SIZE) + 1;
                    const totalBatches = Math.ceil(totalUrls / BATCH_SIZE);

                    // バッチ内URL処理
                    for (let i = batchStart; i < batchEnd; i++) {
                        checkStopped();
                        
                        let currentUrl = urlList[i].url;
                        let result;

                        if (currentUrl.startsWith('http')) {
                            result = await navigateAndExecuteScript(tabId, currentUrl, sentUrlList, excludeDomain);
                        } else {
                            result = {
                                url: currentUrl,
                                result: "失敗",
                                contact: "",
                                reason: "URLが不正です"
                            };
                        }

                        await updateProgress(latestTodo.id, i, result);

                        // 成功時は送信済みリストに追加
                        if (duplicateData && duplicateData.DoNotDuplicateSend && result.result === "成功") {
                            sentUrlList.push(result.contact);
                        }
                    }

                    // 最後のバッチでない場合は休憩
                    if (batchEnd < totalUrls) {
                        await batchBreak(currentBatch, totalBatches, tabId);
                    }
                }

                // 完了処理（修正：新しいタブ作成を避け、既存タブ更新のみ）
                await db.updateTodo(latestTodo.id, { completed: true });
                
                // 停止完了通知のみ送信（タブ操作なし）
                await notifyAllTabsStopCompleted();
                
                // process.htmlタブをdone.htmlに更新（新しいタブ作成なし）
                chrome.tabs.update(tabId, { url: "ui/done.html" });
                console.log(`Execution completed: Updated tab ${tabId} to done.html`);

            } catch (error) {
                if (error.message === ERROR_STOP_REQUESTED) {
                    try {
                        // 停止時後処理
                        const db = new ExDB();
                        let latestTodo;
                        
                        try {
                            latestTodo = await getLatestTodo();
                        } catch (getError) {
                            await notifyAllTabsStopCompleted();
                            chrome.tabs.update(tabId, { url: "ui/done.html" });
                            return;
                        }
                        
                        if (latestTodo && !latestTodo.completed) {
                            const urlList = latestTodo.description;
                            const totalUrls = urlList.length;
                            let currentIndex = urlList.findIndex(item => item.result === '');

                            for (let i = currentIndex; i < totalUrls; i++) {
                                if (urlList[i].result === '') {
                                    await updateProgress(latestTodo.id, i, {
                                        url: urlList[i].url,
                                        result: "停止",
                                        contact: "",
                                        reason: "ユーザーによって停止されました"
                                    });
                                }
                            }

                            await db.updateTodo(latestTodo.id, { completed: true });
                        }
                    } catch (stopError) {
                        // エラーを無視
                    }

                    // 停止完了通知のみ送信（タブ操作なし）
                    await notifyAllTabsStopCompleted();
                    
                    // process.htmlタブをdone.htmlに更新（新しいタブ作成なし）
                    chrome.tabs.update(tabId, { url: "ui/done.html" });
                    console.log(`Stop completed: Updated tab ${tabId} to done.html`);
                } else {
                    chrome.tabs.update(tabId, { url: "ui/error.html" });
                }
            } finally {
                stopKeepalive();
                resetStopState();
            }
        })();
    }
});