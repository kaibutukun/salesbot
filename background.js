// Service Worker用のSupabase読み込み
importScripts('supabase/supabase.js');

// Supabase設定
const SUPABASE_CONFIG = {
    url: 'https://mqibubhzyvlprhekdjvf.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xaWJ1Ymh6eXZscHJoZWtkanZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MTcyMDgsImV4cCI6MjA2MzQ5MzIwOH0.RsiLZLsbL2A8dbs2e7lmYMl0gzFuvSkq70pdABr2a_I'
};

// 定数定義
const BATCH_SIZE = 100;
const BATCH_DELAY = 30000; // 30秒
const KEEPALIVE_INTERVAL = 20000; // 20秒
const URL_PROCESSING_TIMEOUT = 90000; // 90秒
const FORM_TIMEOUT = 5000; // 5秒
const SEND_TIMEOUT = 10000; // 10秒
const RECAPTCHA_TIMEOUT = 40000; // 40秒
const ACTION_EXPLORE = "explore";
const ACTION_SEND = "send";
const ACTION_STOP = "stop";
const ACTION_STOP_COMPLETED = "stopCompleted";
const ACTION_CONFIRM = "confirm";
const ACTION_RECHECK = "recheck";
const ACTION_EXECUTE = "execute";
const ERROR_STOP_REQUESTED = 'STOP_REQUESTED';
const TIMEOUT_MESSAGE_TEMPLATE = (seconds) => `処理タイムアウト（${seconds}秒経過）`;

// Supabaseクライアント作成関数
function createSupabaseClient() {
    if (typeof supabase === 'undefined') {
        throw new Error('Supabase library is not loaded. Make sure to include supabase.js before using this module.');
    }
    return supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
}

// IndexedDB操作クラス（Service Worker用完全版）
class ExDB {
    constructor() {
        this.db = null;
        this.dbName = 'SalesBotDB';
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
                if (cursor) {
                    resolve(cursor.value);
                } else {
                    resolve(null);
                }
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

// Supabaseクライアントの初期化
let supabaseClient = null;

try {
    supabaseClient = createSupabaseClient();
} catch (error) {
    console.error('Failed to initialize Supabase:', error);
}

// グローバル状態管理
let keepaliveInterval = null;
let isStopping = false;
let activePromiseRejects = new Set();

// ====================================
// 停止処理関連の関数
// ====================================

/**
 * 停止状態をリセットする
 */
function resetStopState() {
    isStopping = false;
    activePromiseRejects.clear();
}

/**
 * 停止処理を実行する
 */
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

/**
 * 停止状態をチェックし、停止中の場合はエラーを投げる
 */
function checkStopped() {
    if (isStopping) {
        throw new Error(ERROR_STOP_REQUESTED);
    }
}

// ====================================
// Chrome拡張機能のイベントリスナー
// ====================================

/**
 * 拡張機能アイコンクリック時の処理
 */
chrome.action.onClicked.addListener(async (tab) => {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        chrome.tabs.create({ url: 'ui/main.html' });
    } catch (error) {
        chrome.tabs.create({ url: 'ui/main.html' });
    }
});

// ====================================
// ページ操作関連の関数
// ====================================

/**
 * ページの読み込み完了を待機する
 * @param {number} tabId - タブID
 * @returns {Promise<void>}
 */
async function waitForPageLoad(tabId) {
    return new Promise(resolve => {
        chrome.tabs.onUpdated.addListener(function listener(id, changeInfo) {
            if (id === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                setTimeout(resolve, 1000);
            }
        });
        
        // 5秒でタイムアウト
        setTimeout(() => {
            resolve();
        }, FORM_TIMEOUT);
    });
}

/**
 * URLに移動してスクリプトを実行する（タイムアウト付き）
 * @param {number} tabId - タブID
 * @param {string} url - URL
 * @param {Array} sentUrlList - 送信済みURLリスト
 * @param {Array} excludeDomains - 除外ドメインリスト
 * @returns {Promise<Object>} 処理結果
 */
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

/**
 * URL処理のメイン処理
 * @param {number} tabId - タブID
 * @param {string} url - URL
 * @param {Array} sentUrlList - 送信済みURLリスト
 * @param {Array} excludeDomains - 除外ドメインリスト
 * @returns {Promise<Object>} 処理結果
 */
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

    //探索スクリプトを実行
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content-scripts/explore.js"]
    });

    // 探索結果を待機
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

    // コンタクトリンクが見つかった場合は再度チェック
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

            setTimeout(() => {
                resolve(originalResult);
            }, FORM_TIMEOUT);
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

/**
 * フォーム送信処理
 * @param {number} tabId - タブID
 * @param {string} originalUrl - 元のURL
 * @param {string} contactUrl - コンタクトURL
 * @param {Array} tags - タグ
 * @returns {Promise<Object>} 処理結果
 */
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

    // 送信スクリプトを実行
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

        // reCAPTCHAがある場合とない場合のタイムアウト設定
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
// 時間制限チェック
// ====================================

/**
 * 時間制限がかかっているかチェックする
 * @returns {Promise<boolean>} 制限中の場合true
 */
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
            // 同じ日内（例：09:00-17:00）
            return currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes <= endTimeInMinutes;
        } else {
            // 日をまたぐ（例：22:00-08:00）
            return currentTimeInMinutes >= startTimeInMinutes || currentTimeInMinutes <= endTimeInMinutes;
        }
    } catch (error) {
        return false;
    }
}

// ====================================
// キープアライブ処理
// ====================================

/**
 * キープアライブを開始する
 */
function startKeepalive() {
    if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
    }
    keepaliveInterval = setInterval(() => {
        // 空の処理でプロセスを維持
    }, KEEPALIVE_INTERVAL);
}

/**
 * キープアライブを停止する
 */
function stopKeepalive() {
    if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
        keepaliveInterval = null;
    }
}

// ====================================
// 進捗更新処理
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
        // エラーを無視
    }
}

// ====================================
// バッチ処理の休憩
// ====================================

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
            url: `data:text/html,<html><head><meta charset="UTF-8"><title>処理最適化中...</title><style>body{font-family:sans-serif;text-align:center;padding:50px;background:#f8f9fa;color:#202124;}h1{color:#4285f4;}p{margin:10px 0;}</style></head><body><h1>処理最適化中...</h1><p>サーバー負荷軽減のため少し待機しています</p><p>このページは自動的に閉じられます</p><p>停止ボタンで処理を中断できます</p></body></html>`
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

/**
 * 停止完了を通知する
 */
async function notifyStopCompleted() {
    try {
        const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL('ui/main.html') });
        for (const tab of tabs) {
            try {
                await chrome.tabs.sendMessage(tab.id, { action: ACTION_STOP_COMPLETED });
            } catch (error) {
                // エラーを無視
            }
        }
    } catch (error) {
        // エラーを無視
    }
}

// ====================================
// メッセージリスナー
// ====================================

/**
 * Chrome拡張機能のメッセージリスナー
 */
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

                // 時間制限チェック（相対パス修正）
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

                // 除外ドメインの取得
                let excludeData = await chrome.storage.local.get(["excludeDomain"]);
                let excludeDomain = excludeData.excludeDomain;

                // 重複送信設定の取得
                let duplicateData = await chrome.storage.sync.get("DoNotDuplicateSend");
                let sentUrlList = [];

                if (duplicateData && duplicateData.DoNotDuplicateSend) {
                    let todos = await (new ExDB()).getAllTodos();
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

                // 重複を除去
                sentUrlList = sentUrlList.filter((value, index, self) => 
                    self.indexOf(value) === index
                );

                // 最新のTodoを取得
                let latestTodo = await (new ExDB()).getLatestTodo();
                
                if (!latestTodo || !latestTodo.description || latestTodo.description.length === 0) {
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

                    // バッチ内のURL処理
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

                        // 成功した場合は送信済みリストに追加
                        if (duplicateData && duplicateData.DoNotDuplicateSend && result.result === "成功") {
                            sentUrlList.push(result.contact);
                        }
                    }

                    // 最後のバッチでない場合は休憩
                    if (batchEnd < totalUrls) {
                        await batchBreak(currentBatch, totalBatches, tabId);
                    }
                }

                await (new ExDB()).updateTodo(latestTodo.id, { completed: true });
                await notifyStopCompleted();
                chrome.tabs.update(tabId, { url: "ui/done.html" });

            } catch (error) {
                if (error.message === ERROR_STOP_REQUESTED) {
                    try {
                        // 停止時の後処理
                        const db = new ExDB();
                        const latestTodo = await db.getLatestTodo();
                        
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

                    await notifyStopCompleted();
                    chrome.tabs.update(tabId, { url: "ui/done.html" });
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