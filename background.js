// Service Worker用の外部ライブラリとモジュール読み込み
importScripts('supabase/supabase.js');

// 機能別モジュールの読み込み
importScripts('background/stop-control.js');
importScripts('background/keepalive.js');
importScripts('background/time-restriction.js');
importScripts('background/url-processor.js');
importScripts('background/form-processor.js');
importScripts('background/progress-manager.js');

// 共有モジュールのService Worker版読み込み
// TODO: ES6モジュールをService Worker環境で使用するための準備
// 現在は定数とクラスをインライン定義（後でモジュール化）

// 定数（shared/constants.jsから）
const BATCH_SIZE = 100;
const BATCH_DELAY = 30000;
// KEEPALIVE_INTERVAL はbackground/keepalive.jsに移動済み
const URL_PROCESSING_TIMEOUT = 90000;
const FORM_TIMEOUT = 5000;
const SEND_TIMEOUT = 10000;
const RECAPTCHA_TIMEOUT = 40000;
const ACTION_EXPLORE = "explore";
const ACTION_SEND = "send";
const ACTION_STOP = "stop";
const ACTION_STOP_COMPLETED = "stopCompleted";
const ACTION_CONFIRM = "confirm";
const ACTION_RECHECK = "recheck";
const ACTION_EXECUTE = "execute";
const ERROR_STOP_REQUESTED = 'STOP_REQUESTED';
const TIMEOUT_MESSAGE_TEMPLATE = (seconds) => `処理タイムアウト（${seconds}秒経過）`;

// Supabase設定（shared/config.jsから）
const SUPABASE_CONFIG = {
    url: 'https://mqibubhzyvlprhekdjvf.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xaWJ1Ymh6eXZscHJoZWtkanZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MTcyMDgsImV4cCI6MjA2MzQ5MzIwOH0.RsiLZLsbL2A8dbs2e7lmYMl0gzFuvSkq70pdABr2a_I'
};

// Supabaseクライアント作成関数（shared/config.jsから）
function createSupabaseClient() {
    if (typeof supabase === 'undefined') {
        throw new Error('Supabase library is not loaded. Make sure to include supabase.js before using this module.');
    }
    return supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
}

// IndexedDB操作クラス（shared/database.jsと互換性維持のためのService Worker版）
// TODO: Service Workerでimport対応後、shared/database.jsに統一する
class ExDB {
    constructor() {
        this.db = null;
        this.dbName = 'TodoDatabase';  // shared/database.jsと統一
        this.version = 1;
        this.storeName = 'todos';
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
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('title', 'title', { unique: false });
                    store.createIndex('created', 'created', { unique: false });  // shared/database.jsと統一
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
            created: new Date(),  // shared/database.jsと統一
            completed: false,     // shared/database.jsと統一
            createdAt: new Date().toISOString(),  // 下位互換性のため保持
            updatedAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.add(todo);
            
            request.onsuccess = () => resolve({ id: request.result, ...todo });
            request.onerror = () => reject(request.error);
        });
    }

    async updateTodo(todoId, updateData) {
        if (!this.db) await this.openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
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

// Supabaseクライアントの初期化
let supabaseClient = null;

try {
    supabaseClient = createSupabaseClient();
} catch (error) {
    console.error('Failed to initialize Supabase:', error);
}

// ====================================
// モジュール化された機能へのエイリアス
// ====================================

// 停止制御機能
const resetStopState = globalThis.StopControl.resetStopState;
const executeStop = globalThis.StopControl.executeStop;
const checkStopped = globalThis.StopControl.checkStopped;

// キープアライブ機能  
const startKeepalive = globalThis.Keepalive.startKeepalive;
const stopKeepalive = globalThis.Keepalive.stopKeepalive;

// 時間制限機能
const isTimeRestricted = globalThis.TimeRestriction.isTimeRestricted;

// URL処理機能
const waitForPageLoad = globalThis.UrlProcessor.waitForPageLoad;
const navigateAndExecuteScript = globalThis.UrlProcessor.navigateAndExecuteScript;
const executeUrlProcessing = globalThis.UrlProcessor.executeUrlProcessing;

// フォーム処理機能
const processFormSubmission = globalThis.FormProcessor.processFormSubmission;

// 進捗管理機能
const updateProgress = globalThis.ProgressManager.updateProgress;
const batchBreak = globalThis.ProgressManager.batchBreak;

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

// ExDBクラスは shared/database.js からインポート済み

// ====================================
// モジュール化完了 - 各機能は背景モジュールに移動済み
// ====================================
// URL処理: background/url-processor.js
// フォーム処理: background/form-processor.js  
// 進捗管理: background/progress-manager.js

// navigateAndExecuteScript関数はbackground/url-processor.jsに移動済み

// executeUrlProcessing関数はbackground/url-processor.jsに移動済み

// processFormSubmission関数はbackground/form-processor.jsに移動済み

// 重複機能はモジュール化により削除済み

// ====================================
// 進捗更新処理
// ====================================

// updateProgress関数はbackground/progress-manager.jsに移動済み

// ====================================
// バッチ処理の休憩
// ====================================

// batchBreak関数はbackground/progress-manager.jsに移動済み

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

                // 時間制限チェック
                if (await isTimeRestricted()) {
                    chrome.tabs.update(tabId, { url: "time_restricted.html" });
                    stopKeepalive();
                    return;
                }

                // ライセンスチェック
                const licenseData = await chrome.storage.sync.get("validLicense");
                if (!licenseData.validLicense) {
                    chrome.tabs.update(tabId, { url: "unauthorized.html" });
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
                    chrome.tabs.update(tabId, { url: "error.html" });
                    stopKeepalive();
                    return;
                }

                if (latestTodo.completed) {
                    chrome.tabs.update(tabId, { url: "error.html" });
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

                // 処理完了
                await (new ExDB()).updateTodo(latestTodo.id, { completed: true });
                await notifyStopCompleted();
                chrome.tabs.update(tabId, { url: "done.html" });

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
                    chrome.tabs.update(tabId, { url: "done.html" });
                } else {
                    chrome.tabs.update(tabId, { url: "error.html" });
                }
            } finally {
                stopKeepalive();
                resetStopState();
            }
        })();
    }
});