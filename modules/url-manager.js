/**
 * URL管理モジュール
 * URLリストの読み込み、保存、クリア機能と実行ボタンの状態管理を担当
 * パフォーマンス最適化版: 状態同期重複処理解消、軽量化リスナー
 */

import { ExDB } from '../shared/database.js';
import { 
    SENDING_STATES, 
    STORAGE_KEYS,
    isValidSendingState 
} from '../shared/constants.js';

export class UrlManager {
    constructor(showToastFn = null, getElementFn = null, refreshDashboardFn = null) {
        this.showToastFunction = showToastFn;
        this.getElementFunction = getElementFn;
        this.refreshDashboardFunction = refreshDashboardFn;
        this.executeHandler = null;
        this.stopHandler = null;
        this.elements = this.initializeElements();
        this.setupEventListeners();
        
        // パフォーマンス最適化用の状態管理
        this.setupOptimizedStateSync();
        
        // 重複処理防止
        this.lastSyncedState = null;
        this.syncDebounceTimer = null;
        this.syncDebounceDelay = 50; // 50msのDebounce
        
        // リスナー管理
        this.storageListener = null;
        this.isListenerRegistered = false;
    }

    // ====================================
    // DOM要素を初期化
    // ====================================

    initializeElements() {
        return {
            urlListTextarea: this.getElement('urlListTextarea'),
            saveUrlListButton: this.getElement('saveUrlList'),
            clearUrlListButton: this.getElement('clearUrlList'),
            executeFromUrlTabButton: this.getElement('executeFromUrlTab'),
            stopFromUrlTabButton: this.getElement('stopFromUrlTab'),
            urlCount: this.getElement('urlCount')
        };
    }

    getElement(id) {
        return this.getElementFunction ? this.getElementFunction(id) : document.getElementById(id);
    }

    showToast(message, type = 'info') {
        if (this.showToastFunction) {
            this.showToastFunction(message, type);
        }
    }

    async refreshDashboard() {
        if (this.refreshDashboardFunction) {
            await this.refreshDashboardFunction();
        }
    }

    // ====================================
    // 基本URL管理機能
    // ====================================

    async deleteLatestIncompleteTodo() {
        const db = new ExDB();
        const latestTodo = await db.getLatestTodo();
        
        if (latestTodo && !latestTodo.completed) {
            await db.deleteTodo(latestTodo.id);
            return true;
        }
        return false;
    }

    setupEventListeners() {
        if (this.elements.saveUrlListButton) {
            this.elements.saveUrlListButton.addEventListener('click', () => this.saveUrlList());
        }
        
        if (this.elements.clearUrlListButton) {
            this.elements.clearUrlListButton.addEventListener('click', () => this.clearUrlList());
        }

        if (this.elements.urlListTextarea) {
            this.elements.urlListTextarea.addEventListener('input', () => this.updateUrlCount());
        }
    }

    async loadUrlList() {
        if (!this.elements.urlListTextarea) return;

        try {
            const db = new ExDB();
            await db.openDB();
            const latestTodo = await db.getLatestTodo();

            if (latestTodo && !latestTodo.completed && latestTodo.description) {
                const urls = latestTodo.description.map(item => item.url).join('\n');
                this.elements.urlListTextarea.value = urls;
            } else {
                this.elements.urlListTextarea.value = '';
            }
            
            this.updateUrlCount();
            
        } catch (error) {
            console.error('URL読み込みエラー:', error);
            if (this.elements.urlListTextarea) {
                this.elements.urlListTextarea.value = '';
            }
        }
    }

    /**
     * URLリストを保存（ポップアップメッセージ削除）
     */
    async saveUrlList() {
        if (!this.elements.urlListTextarea) return;

        try {
            const urls = this.elements.urlListTextarea.value.trim().split('\n').filter(url => url.trim() !== '');
            
            if (urls.length === 0) {
                this.showToast('URLを入力してください', 'warning');
                return;
            }

            const normalizedUrls = this.normalizeAndValidateUrls(urls);
            
            if (normalizedUrls.length === 0) {
                this.showToast('有効なURLがありません', 'warning');
                return;
            }

            await this.deleteLatestIncompleteTodo();

            const db = new ExDB();
            await db.openDB();
            const date = new Date();
            const title = date.toLocaleString('ja-JP');
            const description = normalizedUrls.map(url => ({
                url: url.trim(),
                result: '',
                contact: '',
                reason: ''
            }));

            await db.addTodo(title, description);
            // 削除: this.showToast(`URLリストを保存しました (${normalizedUrls.length}件)`, 'success');
            await this.refreshDashboard();
            
        } catch (error) {
            console.error('URL保存エラー:', error);
            this.showToast('URLの保存に失敗しました', 'error');
        }
    }

    async clearUrlList() {
        if (!this.elements.urlListTextarea) return;

        try {
            if (!confirm('URLリストをクリアしますか？')) {
                return;
            }

            await this.deleteLatestIncompleteTodo();
            this.elements.urlListTextarea.value = '';
            this.updateUrlCount();
            await this.refreshDashboard();
            this.showToast('URLリストをクリアしました', 'info');
            
        } catch (error) {
            console.error('URLクリアエラー:', error);
            this.showToast('URLリストのクリアに失敗しました', 'error');
        }
    }

    // ====================================
    // URL処理
    // ====================================

    getCurrentUrls() {
        if (!this.elements.urlListTextarea) return [];
        
        const urlText = this.elements.urlListTextarea.value.trim();
        if (!urlText) return [];
        
        return urlText.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
    }

    isUrlListEmpty() {
        return this.getCurrentUrls().length === 0;
    }

    updateUrlCount() {
        const urls = this.getCurrentUrls();
        if (this.elements.urlCount) {
            this.elements.urlCount.textContent = `${urls.length}件`;
        }
    }

    normalizeAndValidateUrls(urls) {
        const seen = new Set();
        const normalized = [];

        for (const url of urls) {
            const baseUrl = url.split(',')[0].trim();
            
            if (this.isValidUrl(baseUrl) && !seen.has(baseUrl)) {
                seen.add(baseUrl);
                normalized.push(url);
            }
        }

        return normalized;
    }

    isValidUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
        } catch (error) {
            return false;
        }
    }

    async validateUrlList() {
        try {
            if (this.elements.urlListTextarea) {
                const urls = this.getCurrentUrls();
                if (urls.length === 0) {
                    return {
                        isValid: false,
                        message: '送信先URLが入力されていません'
                    };
                }
                
                const normalizedUrls = this.normalizeAndValidateUrls(urls);
                if (normalizedUrls.length > 0) {
                    return {
                        isValid: true,
                        message: `${normalizedUrls.length}件のURLが準備されています（送信前に自動保存されます）`
                    };
                } else {
                    return {
                        isValid: false,
                        message: '有効なURL形式で入力してください（http://またはhttps://で始まる形式）'
                    };
                }
            }

            const db = new ExDB();
            await db.openDB();
            const latestTodo = await db.getLatestTodo();

            if (!latestTodo || !latestTodo.description || latestTodo.description.length === 0) {
                return {
                    isValid: false,
                    message: '送信先URLが設定されていません'
                };
            }

            return {
                isValid: true,
                message: `${latestTodo.description.length}件のURLが準備されています`
            };
            
        } catch (error) {
            console.error('URLリスト検証エラー:', error);
            return {
                isValid: false,
                message: 'URLリストの検証に失敗しました'
            };
        }
    }

    // ====================================
    // 最適化された状態同期システム
    // ====================================

    setupOptimizedStateSync() {
        if (!chrome || !chrome.storage || !chrome.storage.onChanged) {
            console.warn('UrlManager: Chrome storage APIが利用できません');
            return;
        }
        
        this.storageListener = (changes, areaName) => {
            if (areaName !== 'local') return;

            if (changes[STORAGE_KEYS.SENDING_STATE]) {
                const newState = changes[STORAGE_KEYS.SENDING_STATE].newValue;
                
                if (isValidSendingState(newState)) {
                    this.debouncedButtonSync(newState);
                }
                return;
            }

            // 後方互換性対応
            if (changes[STORAGE_KEYS.SENDING_IN_PROGRESS] && !changes[STORAGE_KEYS.SENDING_STATE]) {
                const isInProgress = changes[STORAGE_KEYS.SENDING_IN_PROGRESS].newValue;
                
                if (typeof isInProgress === 'boolean') {
                    const legacyState = isInProgress ? SENDING_STATES.SENDING : SENDING_STATES.IDLE;
                    this.debouncedButtonSync(legacyState);
                }
                return;
            }
        };

        chrome.storage.onChanged.addListener(this.storageListener);
        this.isListenerRegistered = true;
        
        console.log('UrlManager: 状態同期リスナーを登録しました');
    }

    debouncedButtonSync(newState) {
        if (this.lastSyncedState === newState) return;

        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
        }

        this.syncDebounceTimer = setTimeout(() => {
            try {
                this.syncButtonStatesFromStorage(newState);
                this.lastSyncedState = newState;
            } catch (error) {
                console.error('UrlManager: ボタン同期に失敗しました:', error);
            }
            this.syncDebounceTimer = null;
        }, this.syncDebounceDelay);
    }

    syncButtonStatesFromStorage(state) {
        try {
            switch (state) {
                case SENDING_STATES.IDLE:
                case SENDING_STATES.COMPLETED:
                    this.setButtonsToExecuteState(this.executeHandler);
                    break;
                case SENDING_STATES.SENDING:
                    this.setButtonsToSendingState(this.stopHandler);
                    break;
                case SENDING_STATES.STOPPING:
                    this.setButtonsToStoppingState();
                    break;
                default:
                    console.warn(`UrlManager: 未知の状態です: ${state}`);
                    this.setButtonsToExecuteState(this.executeHandler);
                    break;
            }
        } catch (error) {
            console.error('UrlManager: ボタン状態同期エラー:', error);
        }
    }

    // ====================================
    // ボタン状態管理
    // ====================================

    removeEventHandlers() {
        if (this.executeHandler && this.elements.executeFromUrlTabButton) {
            this.elements.executeFromUrlTabButton.removeEventListener('click', this.executeHandler);
        }
        if (this.stopHandler && this.elements.stopFromUrlTabButton) {
            this.elements.stopFromUrlTabButton.removeEventListener('click', this.stopHandler);
        }
    }

    setButtonsToExecuteState(executeHandler) {
        this.executeHandler = executeHandler;
        this.removeEventHandlers();

        if (this.elements.executeFromUrlTabButton) {
            this.elements.executeFromUrlTabButton.textContent = '送信開始';
            this.elements.executeFromUrlTabButton.className = 'primary-button';
            this.elements.executeFromUrlTabButton.disabled = false;
            
            if (executeHandler) {
                this.elements.executeFromUrlTabButton.addEventListener('click', executeHandler);
            }
        }

        if (this.elements.stopFromUrlTabButton) {
            this.elements.stopFromUrlTabButton.textContent = '送信停止';
            this.elements.stopFromUrlTabButton.className = 'danger-button';
            this.elements.stopFromUrlTabButton.disabled = true;
        }
    }

    setButtonsToSendingState(stopHandler) {
        this.stopHandler = stopHandler;
        this.removeEventHandlers();

        if (this.elements.executeFromUrlTabButton) {
            this.elements.executeFromUrlTabButton.textContent = '送信開始';
            this.elements.executeFromUrlTabButton.className = 'primary-button';
            this.elements.executeFromUrlTabButton.disabled = true;
        }

        if (this.elements.stopFromUrlTabButton) {
            this.elements.stopFromUrlTabButton.textContent = '送信停止';
            this.elements.stopFromUrlTabButton.className = 'danger-button';
            this.elements.stopFromUrlTabButton.disabled = false;
            
            if (stopHandler) {
                this.elements.stopFromUrlTabButton.addEventListener('click', stopHandler);
            }
        }
    }

    setButtonsToStoppingState() {
        this.removeEventHandlers();

        if (this.elements.executeFromUrlTabButton) {
            this.elements.executeFromUrlTabButton.textContent = '送信開始';
            this.elements.executeFromUrlTabButton.className = 'primary-button';
            this.elements.executeFromUrlTabButton.disabled = true;
        }

        if (this.elements.stopFromUrlTabButton) {
            this.elements.stopFromUrlTabButton.textContent = '停止中...';
            this.elements.stopFromUrlTabButton.className = 'danger-button';
            this.elements.stopFromUrlTabButton.disabled = true;
        }
    }

    // ====================================
    // 状態復元と管理
    // ====================================

    async restoreButtonStateFromStorage(executeHandler, stopHandler) {
        try {
            this.executeHandler = executeHandler;
            this.stopHandler = stopHandler;
            
            const data = await chrome.storage.local.get([
                STORAGE_KEYS.SENDING_STATE,
                STORAGE_KEYS.SENDING_IN_PROGRESS
            ]);

            let currentState = SENDING_STATES.IDLE;

            if (data[STORAGE_KEYS.SENDING_STATE] && isValidSendingState(data[STORAGE_KEYS.SENDING_STATE])) {
                currentState = data[STORAGE_KEYS.SENDING_STATE];
            } else if (data[STORAGE_KEYS.SENDING_IN_PROGRESS]) {
                currentState = SENDING_STATES.SENDING;
            }

            this.syncButtonStatesFromStorage(currentState);
            this.lastSyncedState = currentState;

            console.log(`UrlManager: ボタン状態を${currentState}に復元しました`);
            return currentState;

        } catch (error) {
            console.error('UrlManager: ボタン状態の復元に失敗しました:', error);
            this.setButtonsToExecuteState(executeHandler);
            return SENDING_STATES.IDLE;
        }
    }

    // ====================================
    // 後方互換性
    // ====================================

    setExecuteButtonToExecuteState(executeHandler) {
        this.setButtonsToExecuteState(executeHandler);
    }

    setExecuteButtonToStopState(stopHandler) {
        this.setButtonsToSendingState(stopHandler);
    }

    setExecuteButtonToDisabledState() {
        this.setButtonsToStoppingState();
    }

    syncButtonStateDirect(state) {
        if (isValidSendingState(state)) {
            this.syncButtonStatesFromStorage(state);
            this.lastSyncedState = state;
        }
    }

    setPrioritizeExternalControl(prioritizeExternal) {
        if (prioritizeExternal && this.isListenerRegistered) {
            chrome.storage.onChanged.removeListener(this.storageListener);
            this.isListenerRegistered = false;
        } else if (!prioritizeExternal && !this.isListenerRegistered && this.storageListener) {
            chrome.storage.onChanged.addListener(this.storageListener);
            this.isListenerRegistered = true;
        }
    }

    // ====================================
    // クリーンアップ
    // ====================================

    destroy() {
        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
            this.syncDebounceTimer = null;
        }

        if (this.storageListener && this.isListenerRegistered) {
            try {
                chrome.storage.onChanged.removeListener(this.storageListener);
                console.log('UrlManager: ストレージリスナーを削除しました');
            } catch (error) {
                console.warn('UrlManager: ストレージリスナーの削除に失敗しました:', error);
            }
        }

        this.removeEventHandlers();
        
        // 参照をクリア
        this.elements = null;
        this.executeHandler = null;
        this.stopHandler = null;
        this.showToastFunction = null;
        this.getElementFunction = null;
        this.refreshDashboardFunction = null;
        this.storageListener = null;
        this.isListenerRegistered = false;
    }
}

/**
 * URLManagerインスタンス作成関数
 * @param {Function} showToastFn - トースト表示関数
 * @param {Function} getElementFn - DOM要素取得関数
 * @param {Function} refreshDashboardFn - ダッシュボード更新関数
 * @returns {UrlManager} URLManagerインスタンス
 */
export function createUrlManager(showToastFn, getElementFn, refreshDashboardFn) {
    return new UrlManager(showToastFn, getElementFn, refreshDashboardFn);
}