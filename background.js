// Service Workerç”¨ã®Supabaseèª­ã¿è¾¼ã¿
importScripts('supabase/supabase.js');

// Supabaseè¨­å®š
const SUPABASE_CONFIG = {
    url: 'https://mqibubhzyvlprhekdjvf.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xaWJ1Ymh6eXZscHJoZWtkanZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MTcyMDgsImV4cCI6MjA2MzQ5MzIwOH0.RsiLZLsbL2A8dbs2e7lmYMl0gzFuvSkq70pdABr2a_I'
};

// å®šæ•°å®šç¾©
const BATCH_SIZE = 100;
const BATCH_DELAY = 30000; // 30ç§’
const KEEPALIVE_INTERVAL = 20000; // 20ç§’
const URL_PROCESSING_TIMEOUT = 90000; // 90ç§’
const FORM_TIMEOUT = 5000; // 5ç§’
const SEND_TIMEOUT = 10000; // 10ç§’
const RECAPTCHA_TIMEOUT = 40000; // 40ç§’
const ACTION_EXPLORE = "explore";
const ACTION_SEND = "send";
const ACTION_STOP = "stop";
const ACTION_STOP_COMPLETED = "stopCompleted";
const ACTION_CONFIRM = "confirm";
const ACTION_RECHECK = "recheck";
const ACTION_EXECUTE = "execute";
const ERROR_STOP_REQUESTED = 'STOP_REQUESTED';
const TIMEOUT_MESSAGE_TEMPLATE = (seconds) => `å‡¦ç†ã‚¿ã‚¤ãƒ ã‚¢ã‚¦ãƒˆï¼ˆ${seconds}ç§’çµŒéŽï¼‰`;

// Supabaseã‚¯ãƒ©ã‚¤ã‚¢ãƒ³ãƒˆä½œæˆ
function createSupabaseClient() {
    if (typeof supabase === 'undefined') {
        throw new Error('Supabase library is not loaded.');
    }
    return supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
}

// IndexedDBæ“ä½œã‚¯ãƒ©ã‚¹
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

// Supabaseã‚¯ãƒ©ã‚¤ã‚¢ãƒ³ãƒˆåˆæœŸåŒ–
let supabaseClient = null;
try {
    supabaseClient = createSupabaseClient();
} catch (error) {
    console.error('Supabase initialization failed:', error);
}

// ã‚°ãƒ­ãƒ¼ãƒãƒ«çŠ¶æ…‹ç®¡ç†
let keepaliveInterval = null;
let isStopping = false;
let activePromiseRejects = new Set();

// åœæ­¢å‡¦ç†é–¢é€£
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
            // ã‚¨ãƒ©ãƒ¼ã‚’ç„¡è¦–
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
// ã‚¿ãƒ–ãƒ©ã‚¤ãƒ•ã‚µã‚¤ã‚¯ãƒ«ç®¡ç†æ©Ÿèƒ½ï¼ˆPhase 2: å…ƒã‚¿ãƒ–IDå¾©å¸°æ©Ÿèƒ½ï¼‰
// ====================================

/**
 * è¨˜éŒ²ã•ã‚ŒãŸå…ƒã®ã‚¿ãƒ–IDï¼ˆé€ä¿¡é–‹å§‹å‰ã®ã‚¿ãƒ–ï¼‰ã‚’å–å¾—
 * @returns {Promise<number|null>} ã‚¿ãƒ–IDï¼ˆãªã‘ã‚Œã°nullï¼‰
 */
async function getStoredOriginalTabId() {
    try {
        const data = await chrome.storage.local.get(['originalTabId', 'originalTabTimestamp']);
        
        // ã‚¿ãƒ–IDãŒè¨˜éŒ²ã•ã‚Œã¦ã„ãªã„å ´åˆ
        if (!data.originalTabId) {
            return null;
        }

        // è¨˜éŒ²ã‹ã‚‰2æ™‚é–“ä»¥ä¸ŠçµŒéŽã—ã¦ã„ã‚‹å ´åˆã¯ç„¡åŠ¹ã¨ã™ã‚‹
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
 * è¨˜éŒ²ã•ã‚ŒãŸå…ƒã®ã‚¿ãƒ–IDã‚’ã‚¯ãƒªã‚¢
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
 * è¨˜éŒ²ã•ã‚ŒãŸprocess.htmlã‚¿ãƒ–IDã‚’å–å¾—
 * @returns {Promise<number|null>} ã‚¿ãƒ–IDï¼ˆãªã‘ã‚Œã°nullï¼‰
 */
async function getStoredProcessTabId() {
    try {
        const data = await chrome.storage.local.get(['processTabId', 'processTabTimestamp']);
        
        // ã‚¿ãƒ–IDãŒè¨˜éŒ²ã•ã‚Œã¦ã„ãªã„å ´åˆ
        if (!data.processTabId) {
            return null;
        }

        // è¨˜éŒ²ã‹ã‚‰1æ™‚é–“ä»¥ä¸ŠçµŒéŽã—ã¦ã„ã‚‹å ´åˆã¯ç„¡åŠ¹ã¨ã™ã‚‹
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
 * è¨˜éŒ²ã•ã‚ŒãŸprocess.htmlã‚¿ãƒ–IDã‚’ã‚¯ãƒªã‚¢
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
 * process.htmlã‚¿ãƒ–ã‚’å®‰å…¨ã«é–‰ã˜ã‚‹
 * @param {number} tabId - é–‰ã˜ã‚‹ã‚¿ãƒ–ID
 * @returns {Promise<boolean>} æˆåŠŸæ™‚ã¯true
 */
async function closeProcessTab(tabId) {
    try {
        // ã‚¿ãƒ–ãŒå­˜åœ¨ã™ã‚‹ã‹ãƒã‚§ãƒƒã‚¯
        const tab = await chrome.tabs.get(tabId);
        if (tab && tab.url && tab.url.includes('ui/process.html')) {
            await chrome.tabs.remove(tabId);
            console.log(`Process tab closed: ${tabId}`);
            return true;
        }
    } catch (error) {
        // ã‚¿ãƒ–ãŒæ—¢ã«é–‰ã˜ã‚‰ã‚Œã¦ã„ã‚‹å ´åˆãªã©ã€ã‚¨ãƒ©ãƒ¼ã¯æ­£å¸¸
        console.log(`Process tab ${tabId} was already closed or not found`);
    }
    return false;
}

/**
 * å…ƒã®ã‚¿ãƒ–IDã‚’ä½¿ã£ã¦å…ƒã®ã‚¿ãƒ–ã«å¾©å¸°ã™ã‚‹ï¼ˆPhase 2ã®ãƒ¡ã‚¤ãƒ³æ©Ÿèƒ½ï¼‰
 * @returns {Promise<number|null>} å¾©å¸°å…ˆã‚¿ãƒ–ã®ID
 */
async function returnToOriginalTab() {
    try {
        console.log('returnToOriginalTab: Starting original tab restoration process');
        
        // ====================================
        // Priority 1: è¨˜éŒ²ã•ã‚ŒãŸå…ƒã®ã‚¿ãƒ–IDã«å¾©å¸°
        // ====================================
        
        const originalTabId = await getStoredOriginalTabId();
        if (originalTabId) {
            console.log(`returnToOriginalTab: Attempting to return to original tab ${originalTabId}`);
            
            try {
                // å…ƒã®ã‚¿ãƒ–ãŒå­˜åœ¨ã—ã€main.htmlã‚’è¡¨ç¤ºã—ã¦ã„ã‚‹ã‹ãƒã‚§ãƒƒã‚¯
                const originalTab = await chrome.tabs.get(originalTabId);
                
                if (originalTab) {
                    const mainUrl = chrome.runtime.getURL('ui/main.html');
                    
                    // URLãŒmain.htmlã‹ã©ã†ã‹ãƒã‚§ãƒƒã‚¯
                    if (originalTab.url === mainUrl) {
                        // å…ƒã®ã‚¿ãƒ–ã«åˆ‡ã‚Šæ›¿ãˆ
                        await chrome.tabs.update(originalTabId, { active: true });
                        await chrome.windows.update(originalTab.windowId, { focused: true });
                        console.log(`returnToOriginalTab: Successfully returned to original tab ${originalTabId}`);
                        
                        // å…ƒã®ã‚¿ãƒ–IDã‚’ã‚¯ãƒªã‚¢ï¼ˆä½¿ç”¨æ¸ˆã¿ï¼‰
                        await clearOriginalTabId();
                        return originalTabId;
                    } else {
                        console.log(`returnToOriginalTab: Original tab ${originalTabId} exists but shows different URL: ${originalTab.url}`);
                        // URLãŒé•ã†å ´åˆã¯main.htmlã«æ›´æ–°
                        await chrome.tabs.update(originalTabId, { url: 'ui/main.html', active: true });
                        await chrome.windows.update(originalTab.windowId, { focused: true });
                        console.log(`returnToOriginalTab: Updated original tab ${originalTabId} to main.html`);
                        
                        await clearOriginalTabId();
                        return originalTabId;
                    }
                }
            } catch (originalTabError) {
                console.log(`returnToOriginalTab: Original tab ${originalTabId} no longer exists: ${originalTabError.message}`);
                // å…ƒã®ã‚¿ãƒ–ãŒå­˜åœ¨ã—ãªã„å ´åˆã¯IDã‚’ã‚¯ãƒªã‚¢
                await clearOriginalTabId();
            }
        } else {
            console.log('returnToOriginalTab: No original tab ID found in storage');
        }

        // ====================================
        // Priority 2: æ—¢å­˜ã®main.htmlã‚¿ãƒ–ã‚’æ¤œç´¢
        // ====================================
        
        console.log('returnToOriginalTab: Searching for existing main.html tabs');
        const mainUrl = chrome.runtime.getURL('ui/main.html');
        const existingMainTabs = await chrome.tabs.query({ url: mainUrl });

        if (existingMainTabs.length > 0) {
            // æ—¢å­˜ã®main.htmlã‚¿ãƒ–ãŒã‚ã‚‹å ´åˆã¯åˆ‡ã‚Šæ›¿ãˆ
            const existingMainTab = existingMainTabs[0];
            await chrome.tabs.update(existingMainTab.id, { active: true });
            await chrome.windows.update(existingMainTab.windowId, { focused: true });
            console.log(`returnToOriginalTab: Switched to existing main tab ${existingMainTab.id}`);
            return existingMainTab.id;
        }

        // ====================================
        // Priority 3: æ–°è¦main.htmlã‚¿ãƒ–ã‚’ä½œæˆï¼ˆæœ€å¾Œã®æ‰‹æ®µï¼‰
        // ====================================
        
        console.log('returnToOriginalTab: No existing main tabs found, creating new one');
        const newTab = await chrome.tabs.create({ url: 'ui/main.html' });
        console.log(`returnToOriginalTab: Created new main tab ${newTab.id}`);
        return newTab.id;

    } catch (error) {
        console.error('returnToOriginalTab: Error during tab restoration:', error);
        
        // ====================================
        // Final Fallback: ã‚¨ãƒ©ãƒ¼æ™‚ã®å®‰å…¨ãªå‡¦ç†
        // ====================================
        
        try {
            console.log('returnToOriginalTab: Executing final fallback');
            const fallbackTab = await chrome.tabs.create({ url: 'ui/main.html' });
            console.log(`returnToOriginalTab: Fallback tab created ${fallbackTab.id}`);
            return fallbackTab.id;
        } catch (fallbackError) {
            console.error('returnToOriginalTab: Final fallback failed:', fallbackError);
            return null;
        }
    }
}

/**
 * main.htmlã‚¿ãƒ–ã®æ¤œç´¢ã¨åˆ‡ã‚Šæ›¿ãˆã€ã¾ãŸã¯ã‚¿ãƒ–æ–°è¦ä½œæˆï¼ˆæ—§ç‰ˆï¼šäº’æ›æ€§ã®ãŸã‚ä¿æŒï¼‰
 * @deprecated ã“ã®é–¢æ•°ã¯ returnToOriginalTab() ã«ç½®ãæ›ãˆã‚‰ã‚Œã¾ã—ãŸ
 * @returns {Promise<number|null>} main.htmlã‚¿ãƒ–ã®ID
 */
async function findOrCreateMainTab() {
    console.warn('findOrCreateMainTab: This function is deprecated. Use returnToOriginalTab() instead.');
    return await returnToOriginalTab();
}

// Chromeæ‹¡å¼µæ©Ÿèƒ½ã‚¤ãƒ™ãƒ³ãƒˆãƒªã‚¹ãƒŠãƒ¼
chrome.action.onClicked.addListener(async (tab) => {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        chrome.tabs.create({ url: 'ui/main.html' });
    } catch (error) {
        chrome.tabs.create({ url: 'ui/main.html' });
    }
});

// ãƒšãƒ¼ã‚¸èª­ã¿è¾¼ã¿å¾…æ©Ÿ
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

// URLå‡¦ç†ãƒ¡ã‚¤ãƒ³é–¢æ•°
async function navigateAndExecuteScript(tabId, url, sentUrlList, excludeDomains) {
    return Promise.race([
        executeUrlProcessing(tabId, url, sentUrlList, excludeDomains),
        new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    url: url,
                    result: "å¤±æ•—",
                    contact: "",
                    reason: TIMEOUT_MESSAGE_TEMPLATE(URL_PROCESSING_TIMEOUT / 1000)
                });
            }, URL_PROCESSING_TIMEOUT);
        })
    ]);
}

// URLå‡¦ç†å®Ÿè¡Œ
async function executeUrlProcessing(tabId, url, sentUrlList, excludeDomains) {
    if (isStopping) {
        return {
            url: url,
            result: "åœæ­¢",
            contact: "",
            reason: "ãƒ¦ãƒ¼ã‚¶ãƒ¼ã«ã‚ˆã£ã¦åœæ­¢ã•ã‚Œã¾ã—ãŸ"
        };
    }

    // URLã¨ã‚¿ã‚°ã‚’åˆ†é›¢
    let parts = url.split(',');
    url = parts[0];
    let tags = parts.slice(1);

    // é™¤å¤–ãƒ‰ãƒ¡ã‚¤ãƒ³ãƒã‚§ãƒƒã‚¯
    if (excludeDomains && excludeDomains.length > 0) {
        for (let i = 0; i < excludeDomains.length; i++) {
            if (excludeDomains[i] !== "" && url.includes(excludeDomains[i])) {
                return {
                    url: url,
                    result: "å¤±æ•—",
                    contact: "",
                    reason: "é™¤å¤–ãƒ‰ãƒ¡ã‚¤ãƒ³ã®ãŸã‚é€ä¿¡ã—ãªã„"
                };
            }
        }
    }

    // ãƒšãƒ¼ã‚¸ã«ç§»å‹•
    await chrome.tabs.update(tabId, { url: url });
    await waitForPageLoad(tabId);

    // æŽ¢ç´¢ã‚¹ã‚¯ãƒªãƒ—ãƒˆå®Ÿè¡Œ
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content-scripts/explore.js"]
    });

    // æŽ¢ç´¢çµæžœå¾…æ©Ÿ
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

    // ã‚³ãƒ³ã‚¿ã‚¯ãƒˆãƒªãƒ³ã‚¯ãŒè¦‹ã¤ã‹ã£ãŸå ´åˆã¯å†åº¦ãƒã‚§ãƒƒã‚¯
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

        // é™¤å¤–ãƒ‰ãƒ¡ã‚¤ãƒ³ãƒã‚§ãƒƒã‚¯ï¼ˆã‚³ãƒ³ã‚¿ã‚¯ãƒˆURLï¼‰
        if (excludeDomains && excludeDomains.length > 0) {
            for (let i = 0; i < excludeDomains.length; i++) {
                if (excludeDomains[i] !== "" && contactUrl.includes(excludeDomains[i])) {
                    return {
                        url: url,
                        result: "å¤±æ•—",
                        contact: contactUrl,
                        reason: "é™¤å¤–ãƒ‰ãƒ¡ã‚¤ãƒ³ã®ãŸã‚é€ä¿¡ã—ãªã„"
                    };
                }
            }
        }

        // é‡è¤‡é€ä¿¡ãƒã‚§ãƒƒã‚¯
        if (sentUrlList.includes(contactUrl)) {
            return {
                url: url,
                result: "å¤±æ•—",
                contact: contactUrl,
                reason: "é‡è¤‡é€ä¿¡ã®ãŸã‚é€ä¿¡ã—ãªã„"
            };
        }
    } else {
        return {
            url: url,
            result: "å¤±æ•—",
            contact: "",
            reason: "å•ã„åˆã‚ã›ãƒ•ã‚©ãƒ¼ãƒ ãŒè¦‹ã¤ã‹ã‚Šã¾ã›ã‚“ã§ã—ãŸ"
        };
    }

    // ãƒ•ã‚©ãƒ¼ãƒ é€ä¿¡å‡¦ç†
    if (exploreResult.currentForm) {
        return await processFormSubmission(tabId, url, currentUrl, tags);
    } else {
        await chrome.tabs.update(tabId, { url: exploreResult.contactLink });
        await waitForPageLoad(tabId);
        return await processFormSubmission(tabId, url, exploreResult.contactLink, tags);
    }
}

// ãƒ•ã‚©ãƒ¼ãƒ é€ä¿¡å‡¦ç†
async function processFormSubmission(tabId, originalUrl, contactUrl, tags) {
    // reCAPTCHAãƒã‚§ãƒƒã‚¯
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

    // é€ä¿¡ã‚¹ã‚¯ãƒªãƒ—ãƒˆå®Ÿè¡Œ
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
            result: "å¤±æ•—",
            contact: contactUrl,
            reason: sendResult.message
        };
    }

    // ç¢ºèªå‡¦ç†
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
        result: confirmResult.success ? "æˆåŠŸ" : "å¤±æ•—",
        contact: contactUrl,
        reason: confirmResult.success ? "æˆåŠŸ" : confirmResult.message
    };
}

// æ™‚é–“åˆ¶é™ãƒã‚§ãƒƒã‚¯
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

// ã‚­ãƒ¼ãƒ—ã‚¢ãƒ©ã‚¤ãƒ–å‡¦ç†
function startKeepalive() {
    if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
    }
    keepaliveInterval = setInterval(() => {
        // ç©ºã®å‡¦ç†ã§ãƒ—ãƒ­ã‚»ã‚¹ã‚’ç¶­æŒ
    }, KEEPALIVE_INTERVAL);
}

function stopKeepalive() {
    if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
        keepaliveInterval = null;
    }
}

// é€²æ—æ›´æ–°
async function updateProgress(todoId, urlIndex, result) {
    try {
        const db = new ExDB();
        const todo = await db.getTodoById(todoId);
        
        if (todo && todo.description && todo.description[urlIndex]) {
            todo.description[urlIndex] = result;
            await db.updateTodo(todoId, { description: todo.description });
        }
    } catch (error) {
        // ã‚¨ãƒ©ãƒ¼ã‚’ç„¡è¦–
    }
}

// ãƒãƒƒãƒä¼‘æ†©å‡¦ç†
async function batchBreak(batchNumber, totalBatches, tabId) {
    try {
        await chrome.tabs.update(tabId, {
            url: `data:text/html,<html><head><meta charset="UTF-8"><title>å‡¦ç†æœ€é©åŒ–ä¸­...</title><style>body{font-family:sans-serif;text-align:center;padding:50px;background:#f8f9fa;color:#202124;}h1{color:#4285f4;}p{margin:10px 0;}</style></head><body><h1>å‡¦ç†æœ€é©åŒ–ä¸­...</h1><p>ã‚µãƒ¼ãƒãƒ¼è² è·è»½æ¸›ã®ãŸã‚å°‘ã—å¾…æ©Ÿã—ã¦ã„ã¾ã™</p><p>ã“ã®ãƒšãƒ¼ã‚¸ã¯è‡ªå‹•çš„ã«é–‰ã˜ã‚‰ã‚Œã¾ã™</p><p>åœæ­¢ãƒœã‚¿ãƒ³ã§å‡¦ç†ã‚’ä¸­æ–­ã§ãã¾ã™</p></body></html>`
        });
    } catch (error) {
        // ã‚¨ãƒ©ãƒ¼ã‚’ç„¡è¦–
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
                    // ã‚¨ãƒ©ãƒ¼ã‚’ç„¡è¦–
                }

                currentIteration++;
            }

            activePromiseRejects.delete(wrappedReject);
            resolve();
        })();
    });
}

// ====================================
// å…¨ã‚¿ãƒ–å¯¾å¿œé€šçŸ¥ã‚·ã‚¹ãƒ†ãƒ ï¼ˆè§£æ±ºç­–Eï¼‰
// ====================================

/**
 * åœæ­¢å®Œäº†é€šçŸ¥ã‚’å…¨é–¢é€£ã‚¿ãƒ–ã«é€ä¿¡
 * main.htmlã¨process.htmlã®ä¸¡æ–¹ã®ã‚¿ãƒ–ã«é€šçŸ¥ã‚’é…ä¿¡
 */
async function notifyAllTabsStopCompleted() {
    try {
        console.log('notifyAllTabsStopCompleted: Starting comprehensive tab notification');
        
        // å¯¾è±¡ã¨ãªã‚‹URLãƒ‘ã‚¿ãƒ¼ãƒ³ã‚’å®šç¾©
        const targetUrls = [
            chrome.runtime.getURL('ui/main.html'),
            chrome.runtime.getURL('ui/process.html')
        ];

        // ã™ã¹ã¦ã®é–¢é€£ã‚¿ãƒ–ã‚’æ¤œç´¢
        const allTabs = await chrome.tabs.query({ url: targetUrls });
        console.log(`notifyAllTabsStopCompleted: Found ${allTabs.length} related tabs`);

        // å„ã‚¿ãƒ–ã«åœæ­¢å®Œäº†é€šçŸ¥ã‚’é€ä¿¡
        const notificationPromises = allTabs.map(async (tab) => {
            try {
                await chrome.tabs.sendMessage(tab.id, { 
                    action: ACTION_STOP_COMPLETED,
                    timestamp: Date.now()
                });
                console.log(`notifyAllTabsStopCompleted: Successfully notified tab ${tab.id} (${tab.url})`);
                return { tabId: tab.id, success: true };
            } catch (error) {
                // ã‚¿ãƒ–ãŒæ—¢ã«é–‰ã˜ã‚‰ã‚Œã¦ã„ã‚‹å ´åˆã‚„å¿œç­”ãŒãªã„å ´åˆã¯ã‚¨ãƒ©ãƒ¼ã‚’è¨˜éŒ²
                console.log(`notifyAllTabsStopCompleted: Failed to notify tab ${tab.id}: ${error.message}`);
                return { tabId: tab.id, success: false, error: error.message };
            }
        });

        // ã™ã¹ã¦ã®é€šçŸ¥å®Œäº†ã‚’å¾…ã¤
        const results = await Promise.all(notificationPromises);
        
        // çµæžœã‚’ãƒ­ã‚°å‡ºåŠ›
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

/**
 * åœæ­¢å®Œäº†é€šçŸ¥ï¼ˆã‚¿ãƒ–ãƒ©ã‚¤ãƒ•ã‚µã‚¤ã‚¯ãƒ«ç®¡ç† + å…¨ã‚¿ãƒ–é€šçŸ¥ã‚·ã‚¹ãƒ†ãƒ çµ±åˆç‰ˆï¼‰
 * Phase 2: returnToOriginalTab()ã‚’ä½¿ç”¨ã—ãŸå…ƒã‚¿ãƒ–å¾©å¸°æ©Ÿèƒ½ã‚’å®Ÿè£…
 */
async function notifyStopCompleted() {
    try {
        console.log('notifyStopCompleted: Starting integrated tab management and notification with original tab return');
        
        // ====================================
        // Phase 1: å…¨ã‚¿ãƒ–ã¸ã®åœæ­¢å®Œäº†é€šçŸ¥ï¼ˆè§£æ±ºç­–Eï¼‰
        // ====================================
        
        const notificationResult = await notifyAllTabsStopCompleted();
        console.log('notifyStopCompleted: Tab notification phase completed:', notificationResult);

        // ====================================
        // Phase 2: ã‚¿ãƒ–ãƒ©ã‚¤ãƒ•ã‚µã‚¤ã‚¯ãƒ«ç®¡ç†ï¼ˆè§£æ±ºç­–C + Phase 2æ©Ÿèƒ½ï¼‰
        // ====================================
        
        // è¨˜éŒ²ã•ã‚ŒãŸprocess.htmlã‚¿ãƒ–ã‚’å–å¾—ã—ã¦é–‰ã˜ã‚‹
        const processTabId = await getStoredProcessTabId();
        if (processTabId) {
            // å°‘ã—å¾…ã£ã¦ã‹ã‚‰ã‚¿ãƒ–ã‚’é–‰ã˜ã‚‹ï¼ˆé€šçŸ¥ãŒå±Šãæ™‚é–“ã‚’ç¢ºä¿ï¼‰
            setTimeout(async () => {
                const closed = await closeProcessTab(processTabId);
                if (closed) {
                    console.log(`notifyStopCompleted: Process tab ${processTabId} closed after notification`);
                }
                
                // ã‚¿ãƒ–IDã‚’ã‚¯ãƒªã‚¢
                await clearProcessTabId();
            }, 500);
        } else {
            console.log('notifyStopCompleted: No specific process tab ID found, relying on general notification');
        }

        // ====================================
        // Phase 2 ãƒ¡ã‚¤ãƒ³æ©Ÿèƒ½: å…ƒã®ã‚¿ãƒ–ã«å¾©å¸°
        // ====================================
        
        const returnedTabId = await returnToOriginalTab();
        if (returnedTabId) {
            console.log(`notifyStopCompleted: Successfully returned to tab ${returnedTabId}`);
        } else {
            console.log('notifyStopCompleted: Failed to return to original tab');
        }

        console.log('notifyStopCompleted: Integrated tab management with original tab return completed successfully');
        
        return {
            notificationResult,
            processTabClosed: !!processTabId,
            returnedTabId,
            originalTabReturn: !!returnedTabId
        };

    } catch (error) {
        console.error('notifyStopCompleted: Error during integrated tab management:', error);
        
        // ====================================
        // ã‚¨ãƒ©ãƒ¼æ™‚ã®ãƒ•ã‚©ãƒ¼ãƒ«ãƒãƒƒã‚¯å‡¦ç†
        // ====================================
        
        try {
            // æœ€ä½Žé™ã€main.htmlã‚¿ãƒ–ã‚’ä½œæˆï¼ˆæœ€å¾Œã®æ‰‹æ®µï¼‰
            const fallbackTab = await chrome.tabs.create({ url: 'ui/main.html' });
            console.log(`notifyStopCompleted: Fallback main tab created: ${fallbackTab.id}`);
            
            return {
                error: error.message,
                fallbackExecuted: true,
                fallbackTabId: fallbackTab.id
            };
        } catch (fallbackError) {
            console.error('notifyStopCompleted: Fallback tab creation failed:', fallbackError);
            
            return {
                error: error.message,
                fallbackError: fallbackError.message,
                fallbackExecuted: false
            };
        }
    }
}

// æœ€æ–°ã‚¿ã‚¹ã‚¯å–å¾—ï¼ˆãƒªãƒˆãƒ©ã‚¤æ©Ÿèƒ½ä»˜ãï¼‰
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

// Chromeæ‹¡å¼µæ©Ÿèƒ½ãƒ¡ãƒƒã‚»ãƒ¼ã‚¸ãƒªã‚¹ãƒŠãƒ¼
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // åœæ­¢å‡¦ç†
    if (message.action === ACTION_STOP) {
        executeStop();
        sendResponse({ success: true });
        return true;
    }

    // å®Ÿè¡Œå‡¦ç†
    if (message.action === ACTION_EXECUTE) {
        let tabId = message.tabId;

        (async () => {
            try {
                resetStopState();
                startKeepalive();

                // ãƒ‡ãƒ¼ã‚¿ãƒ™ãƒ¼ã‚¹åˆæœŸåŒ–
                const db = new ExDB();
                try {
                    await db.openDB();
                } catch (dbError) {
                    chrome.tabs.update(tabId, { url: "ui/error.html" });
                    stopKeepalive();
                    return;
                }

                // æ™‚é–“åˆ¶é™ãƒã‚§ãƒƒã‚¯
                if (await isTimeRestricted()) {
                    chrome.tabs.update(tabId, { url: "ui/time_restricted.html" });
                    stopKeepalive();
                    return;
                }

                // ãƒ©ã‚¤ã‚»ãƒ³ã‚¹ãƒã‚§ãƒƒã‚¯
                const licenseData = await chrome.storage.sync.get("validLicense");
                if (!licenseData.validLicense) {
                    chrome.tabs.update(tabId, { url: "ui/error.html" });
                    stopKeepalive();
                    return;
                }

                // é™¤å¤–ãƒ‰ãƒ¡ã‚¤ãƒ³å–å¾—
                let excludeData = await chrome.storage.local.get(["excludeDomain"]);
                let excludeDomain = excludeData.excludeDomain;

                // é‡è¤‡é€ä¿¡è¨­å®šå–å¾—
                let duplicateData = await chrome.storage.sync.get("DoNotDuplicateSend");
                let sentUrlList = [];

                if (duplicateData && duplicateData.DoNotDuplicateSend) {
                    let todos = await db.getAllTodos();
                    for (let i = 0; i < todos.length; i++) {
                        if (todos[i].completed) {
                            for (let j = 0; j < todos[i].description.length; j++) {
                                if (todos[i].description[j].result === "æˆåŠŸ") {
                                    sentUrlList.push(todos[i].description[j].contact);
                                }
                            }
                        }
                    }
                }

                // é‡è¤‡é™¤åŽ»
                sentUrlList = sentUrlList.filter((value, index, self) => 
                    self.indexOf(value) === index
                );

                // æœ€æ–°Todoå–å¾—
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

                // ãƒãƒƒãƒå‡¦ç†
                for (let batchStart = 0; batchStart < totalUrls; batchStart += BATCH_SIZE) {
                    checkStopped();
                    
                    const batchEnd = Math.min(batchStart + BATCH_SIZE, totalUrls);
                    const currentBatch = Math.floor(batchStart / BATCH_SIZE) + 1;
                    const totalBatches = Math.ceil(totalUrls / BATCH_SIZE);

                    // ãƒãƒƒãƒå†…URLå‡¦ç†
                    for (let i = batchStart; i < batchEnd; i++) {
                        checkStopped();
                        
                        let currentUrl = urlList[i].url;
                        let result;

                        if (currentUrl.startsWith('http')) {
                            result = await navigateAndExecuteScript(tabId, currentUrl, sentUrlList, excludeDomain);
                        } else {
                            result = {
                                url: currentUrl,
                                result: "å¤±æ•—",
                                contact: "",
                                reason: "URLãŒä¸æ­£ã§ã™"
                            };
                        }

                        await updateProgress(latestTodo.id, i, result);

                        // æˆåŠŸæ™‚ã¯é€ä¿¡æ¸ˆã¿ãƒªã‚¹ãƒˆã«è¿½åŠ 
                        if (duplicateData && duplicateData.DoNotDuplicateSend && result.result === "æˆåŠŸ") {
                            sentUrlList.push(result.contact);
                        }
                    }

                    // æœ€å¾Œã®ãƒãƒƒãƒã§ãªã„å ´åˆã¯ä¼‘æ†©
                    if (batchEnd < totalUrls) {
                        await batchBreak(currentBatch, totalBatches, tabId);
                    }
                }

                // å®Œäº†å‡¦ç†
                await db.updateTodo(latestTodo.id, { completed: true });
                await notifyStopCompleted();
                chrome.tabs.update(tabId, { url: "ui/done.html" });

            } catch (error) {
                if (error.message === ERROR_STOP_REQUESTED) {
                    try {
                        // åœæ­¢æ™‚å¾Œå‡¦ç†
                        const db = new ExDB();
                        let latestTodo;
                        
                        try {
                            latestTodo = await getLatestTodo();
                        } catch (getError) {
                            await notifyStopCompleted();
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
                                        result: "åœæ­¢",
                                        contact: "",
                                        reason: "ãƒ¦ãƒ¼ã‚¶ãƒ¼ã«ã‚ˆã£ã¦åœæ­¢ã•ã‚Œã¾ã—ãŸ"
                                    });
                                }
                            }

                            await db.updateTodo(latestTodo.id, { completed: true });
                        }
                    } catch (stopError) {
                        // ã‚¨ãƒ©ãƒ¼ã‚’ç„¡è¦–
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