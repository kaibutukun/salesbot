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
        
        // ====================================
        // パフォーマンス最適化用の状態管理
        // ====================================
        
        // 軽量化された状態同期システム
        this.setupOptimizedStateSync();
        
        // 重複処理防止
        this.lastSyncedState = null;
        this.syncDebounceTimer = null;
        this.syncDebounceDelay = 50; // 50msのDebounce
        
        // リスナー管理
        this.storageListener = null;
        this.isListenerRegistered = false;
    }

    /**
     * DOM要素を初期化
     */
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
        if (this.getElementFunction) {
            return this.getElementFunction(id);
        }
        return document.getElementById(id);
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
    // 基本URL管理機能（元の実装から復元）
    // ====================================

    /**
     * 最新の未完了Todoを削除
     */
    async deleteLatestIncompleteTodo() {
        const db = new ExDB();
        const latestTodo = await db.getLatestTodo();
        
        if (latestTodo && !latestTodo.completed) {
            await db.deleteTodo(latestTodo.id);
            return true;
        }
        return false;
    }

    /**
     * イベントリスナーを設定
     */
    setupEventListeners() {
        // URL保存ボタン
        if (this.elements.saveUrlListButton) {
            this.elements.saveUrlListButton.addEventListener('click', () => this.saveUrlList());
        }
        
        // URLクリアボタン
        if (this.elements.clearUrlListButton) {
            this.elements.clearUrlListButton.addEventListener('click', () => this.clearUrlList());
        }

        // URLリストのリアルタイム更新（URL数表示）
        if (this.elements.urlListTextarea) {
            this.elements.urlListTextarea.addEventListener('input', () => {
                this.updateUrlCount();
            });
        }
    }

    /**
     * URLリストをデータベースから読み込み
     */
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
                // 空の状態で初期化（空白文字問題の修正）
                this.elements.urlListTextarea.value = '';
            }
            
            // URL数を更新
            this.updateUrlCount();
            
        } catch (error) {
            console.error('URL読み込みエラー:', error);
            // エラー時は空で初期化
            if (this.elements.urlListTextarea) {
                this.elements.urlListTextarea.value = '';
            }
        }
    }

    /**
     * URLリストを保存
     */
    async saveUrlList() {
        if (!this.elements.urlListTextarea) return;

        try {
            const urls = this.elements.urlListTextarea.value.trim().split('\n').filter(url => url.trim() !== '');
            
            if (urls.length === 0) {
                this.showToast('URLを入力してください', 'warning');
                return;
            }

            // 重複排除と基本的な正規化
            const normalizedUrls = this.normalizeAndValidateUrls(urls);
            
            if (normalizedUrls.length === 0) {
                this.showToast('有効なURLがありません', 'warning');
                return;
            }

            // 既存の未完了タスクを削除
            await this.deleteLatestIncompleteTodo();

            // 新しいタスクを作成
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
            this.showToast(`URLリストを保存しました (${normalizedUrls.length}件)`, 'success');
            await this.refreshDashboard();
            
        } catch (error) {
            console.error('URL保存エラー:', error);
            this.showToast('URLの保存に失敗しました', 'error');
        }
    }

    /**
     * URLリストをクリア
     */
    async clearUrlList() {
        if (!this.elements.urlListTextarea) return;

        try {
            if (!confirm('URLリストをクリアしますか？')) {
                return;
            }

            // 未完了タスクを削除
            await this.deleteLatestIncompleteTodo();
            
            // テキストエリアをクリア
            this.elements.urlListTextarea.value = '';
            
            // URL数を更新
            this.updateUrlCount();
            
            await this.refreshDashboard();
            this.showToast('URLリストをクリアしました', 'info');
            
        } catch (error) {
            console.error('URLクリアエラー:', error);
            this.showToast('URLリストのクリアに失敗しました', 'error');
        }
    }

    /**
     * 現在のURLリストを取得
     * @returns {Array<string>} URLの配列
     */
    getCurrentUrls() {
        if (!this.elements.urlListTextarea) return [];
        
        const urlText = this.elements.urlListTextarea.value.trim();
        if (!urlText) return [];
        
        return urlText.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
    }

    /**
     * URLリストが空かどうかをチェック
     * @returns {boolean} 空の場合true
     */
    isUrlListEmpty() {
        return this.getCurrentUrls().length === 0;
    }

    /**
     * URL数を更新表示
     */
    updateUrlCount() {
        const urls = this.getCurrentUrls();
        if (this.elements.urlCount) {
            this.elements.urlCount.textContent = `${urls.length}件`;
        }
    }

    /**
     * URLの正規化とバリデーション
     * @param {Array<string>} urls - URL配列
     * @returns {Array<string>} 正規化されたURL配列
     */
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

    /**
     * URL形式の妥当性チェック
     * @param {string} url - チェックするURL
     * @returns {boolean} 有効なURLの場合true
     */
    isValidUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
        } catch (error) {
            return false;
        }
    }

    /**
     * URLリストのバリデーション（テキストエリア優先版）
     * @returns {Object} バリデーション結果
     */
    async validateUrlList() {
        try {
            // テキストエリアの内容を最優先でチェック
            if (this.elements.urlListTextarea) {
                const urls = this.getCurrentUrls();
                if (urls.length === 0) {
                    return {
                        isValid: false,
                        message: '送信先URLが入力されていません'
                    };
                }
                
                // テキストエリアに有効なURLがあれば、データベースの状態に関係なく有効とする
                const normalizedUrls = this.normalizeAndValidateUrls(urls);
                if (normalizedUrls.length > 0) {
                    return {
                        isValid: true,
                        message: `${normalizedUrls.length}件のURLが入力されています（送信前に自動保存されます）`
                    };
                } else {
                    return {
                        isValid: false,
                        message: '有効なURL形式で入力してください（http://またはhttps://で始まる形式）'
                    };
                }
            }

            // テキストエリアがない場合のフォールバック：データベースをチェック
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
            console.error('URL validation error:', error);
            return {
                isValid: false,
                message: 'URLリストの検証に失敗しました'
            };
        }
    }

    // ====================================
    // 最適化された状態同期システム（競合解消版）
    // ====================================

    /**
     * 軽量化されたリアルタイム状態同期を設定
     * main.jsとの競合を避ける最適化版
     */
    setupOptimizedStateSync() {
        // Chrome Storage APIが利用可能かチェック
        if (!chrome || !chrome.storage || !chrome.storage.onChanged) {
            console.warn('UrlManager: Chrome storage API not available for state sync');
            return;
        }

        // ====================================
        // 軽量化されたリスナー（競合回避機能付き）
        // ====================================
        
        this.storageListener = (changes, areaName) => {
            // 早期リターン: ローカルストレージ以外は無視
            if (areaName !== 'local') {
                return;
            }

            // ====================================
            // main.jsとの競合回避: 最小限の処理のみ
            // ====================================
            
            // 詳細状態変更の監視（最優先）
            if (changes[STORAGE_KEYS.SENDING_STATE]) {
                const newState = changes[STORAGE_KEYS.SENDING_STATE].newValue;
                
                // 有効な状態のみDebounce付きで同期
                if (isValidSendingState(newState)) {
                    this.debouncedButtonSync(newState);
                }
                return; // 他の処理をスキップして競合を回避
            }

            // ====================================
            // 後方互換性処理（条件を厳格化して軽量化）
            // ====================================
            
            // 詳細状態が存在しない場合のみフォールバック
            if (changes[STORAGE_KEYS.SENDING_IN_PROGRESS] && !changes[STORAGE_KEYS.SENDING_STATE]) {
                const isInProgress = changes[STORAGE_KEYS.SENDING_IN_PROGRESS].newValue;
                
                // 最小限の処理でレガシー状態を同期
                if (typeof isInProgress === 'boolean') {
                    const legacyState = isInProgress ? SENDING_STATES.SENDING : SENDING_STATES.IDLE;
                    console.log(`UrlManager: Minimal legacy sync to ${legacyState}`);
                    this.debouncedButtonSync(legacyState);
                }
                return;
            }
        };

        // リスナーを登録
        chrome.storage.onChanged.addListener(this.storageListener);
        this.isListenerRegistered = true;
        
        console.log('UrlManager: Optimized state sync listener registered (lightweight mode)');
    }

    /**
     * Debounce付きボタン状態同期（重複処理防止）
     * @param {string} newState - 新しい送信状態
     */
    debouncedButtonSync(newState) {
        // 同じ状態への変更は無視（重複処理防止）
        if (this.lastSyncedState === newState) {
            return;
        }

        // 既存のタイマーをクリア
        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
        }

        // Debounce処理で連続した状態変更を統合
        this.syncDebounceTimer = setTimeout(() => {
            try {
                this.syncButtonStatesFromStorage(newState);
                this.lastSyncedState = newState;
                console.log(`UrlManager: Debounced button sync completed for ${newState}`);
            } catch (error) {
                console.error('UrlManager: Debounced button sync failed:', error);
            }
            this.syncDebounceTimer = null;
        }, this.syncDebounceDelay);
    }

    /**
     * ストレージの状態に基づいてボタン状態を同期（軽量版）
     * @param {string} state - 同期する送信状態
     */
    syncButtonStatesFromStorage(state) {
        try {
            switch (state) {
                case SENDING_STATES.IDLE:
                    this.setButtonsToExecuteState(this.executeHandler);
                    break;

                case SENDING_STATES.SENDING:
                    this.setButtonsToSendingState(this.stopHandler);
                    break;

                case SENDING_STATES.STOPPING:
                    this.setButtonsToStoppingState();
                    break;

                case SENDING_STATES.COMPLETED:
                    this.setButtonsToExecuteState(this.executeHandler);
                    break;

                default:
                    console.warn(`UrlManager: Unknown state for sync: ${state}`);
                    // 不明な状態の場合は安全に待機状態に設定
                    this.setButtonsToExecuteState(this.executeHandler);
                    break;
            }
            
        } catch (error) {
            console.error('UrlManager: Error during lightweight button state sync:', error);
        }
    }

    // ====================================
    // 外部からの直接状態同期（main.js優先制御）
    // ====================================

    /**
     * 外部から直接ボタン状態を同期（main.jsからの呼び出し用）
     * chrome.storage.onChangedを経由しない直接同期
     * @param {string} state - 設定する送信状態
     */
    syncButtonStateDirect(state) {
        if (isValidSendingState(state)) {
            this.syncButtonStatesFromStorage(state);
            this.lastSyncedState = state;
            console.log(`UrlManager: Direct button sync to ${state}`);
        }
    }

    /**
     * 状態同期の優先制御を設定
     * main.jsからの制御を優先する場合に使用
     * @param {boolean} prioritizeExternal - 外部制御を優先するかどうか
     */
    setPrioritizeExternalControl(prioritizeExternal) {
        if (prioritizeExternal && this.isListenerRegistered) {
            // 外部制御優先時はリスナーを無効化
            chrome.storage.onChanged.removeListener(this.storageListener);
            this.isListenerRegistered = false;
            console.log('UrlManager: Storage listener disabled for external control priority');
        } else if (!prioritizeExternal && !this.isListenerRegistered && this.storageListener) {
            // 内部制御復帰時はリスナーを再有効化
            chrome.storage.onChanged.addListener(this.storageListener);
            this.isListenerRegistered = true;
            console.log('UrlManager: Storage listener re-enabled');
        }
    }

    // ====================================
    // ボタン状態管理（色固定版 + 基本機能復元）
    // ====================================

    /**
     * イベントハンドラーを安全に削除
     */
    removeEventHandlers() {
        if (this.executeHandler && this.elements.executeFromUrlTabButton) {
            this.elements.executeFromUrlTabButton.removeEventListener('click', this.executeHandler);
        }
        if (this.stopHandler && this.elements.stopFromUrlTabButton) {
            this.elements.stopFromUrlTabButton.removeEventListener('click', this.stopHandler);
        }
    }

    /**
     * 送信開始状態：開始ボタン有効、停止ボタン無効
     * @param {Function} executeHandler - 送信開始ハンドラー
     */
    setButtonsToExecuteState(executeHandler) {
        this.executeHandler = executeHandler; // ハンドラーを保存
        this.removeEventHandlers();

        // 送信開始ボタン：有効（常に青色）
        if (this.elements.executeFromUrlTabButton) {
            this.elements.executeFromUrlTabButton.textContent = '送信開始';
            this.elements.executeFromUrlTabButton.className = 'primary-button';
            this.elements.executeFromUrlTabButton.disabled = false;
            
            // イベントハンドラーを設定
            if (executeHandler) {
                this.elements.executeFromUrlTabButton.addEventListener('click', executeHandler);
            }
        }

        // 送信停止ボタン：無効（常に赤色）
        if (this.elements.stopFromUrlTabButton) {
            this.elements.stopFromUrlTabButton.textContent = '送信停止';
            this.elements.stopFromUrlTabButton.className = 'danger-button';
            this.elements.stopFromUrlTabButton.disabled = true;
        }
    }

    /**
     * 送信中状態：開始ボタン無効、停止ボタン有効
     * @param {Function} stopHandler - 送信停止ハンドラー
     */
    setButtonsToSendingState(stopHandler) {
        this.stopHandler = stopHandler; // ハンドラーを保存
        this.removeEventHandlers();

        // 送信開始ボタン：無効（常に青色）
        if (this.elements.executeFromUrlTabButton) {
            this.elements.executeFromUrlTabButton.textContent = '送信開始';
            this.elements.executeFromUrlTabButton.className = 'primary-button';
            this.elements.executeFromUrlTabButton.disabled = true;
        }

        // 送信停止ボタン：有効（常に赤色）
        if (this.elements.stopFromUrlTabButton) {
            this.elements.stopFromUrlTabButton.textContent = '送信停止';
            this.elements.stopFromUrlTabButton.className = 'danger-button';
            this.elements.stopFromUrlTabButton.disabled = false;
            
            // イベントハンドラーを設定
            if (stopHandler) {
                this.elements.stopFromUrlTabButton.addEventListener('click', stopHandler);
            }
        }
    }

    /**
     * 停止処理中状態：両方のボタンを無効
     */
    setButtonsToStoppingState() {
        this.removeEventHandlers();

        // 送信開始ボタン：無効（常に青色）
        if (this.elements.executeFromUrlTabButton) {
            this.elements.executeFromUrlTabButton.textContent = '送信開始';
            this.elements.executeFromUrlTabButton.className = 'primary-button';
            this.elements.executeFromUrlTabButton.disabled = true;
        }

        // 送信停止ボタン：無効（停止中表示、常に赤色）
        if (this.elements.stopFromUrlTabButton) {
            this.elements.stopFromUrlTabButton.textContent = '停止中...';
            this.elements.stopFromUrlTabButton.className = 'danger-button';
            this.elements.stopFromUrlTabButton.disabled = true;
        }
    }

    // ====================================
    // 状態復元機能（詳細状態対応）
    // ====================================

    /**
     * ストレージからボタン状態を復元
     * @param {Function} executeHandler - 実行ボタンのハンドラー
     * @param {Function} stopHandler - 停止ボタンのハンドラー
     * @returns {Promise<string>} 復元された状態
     */
    async restoreButtonStateFromStorage(executeHandler, stopHandler) {
        try {
            // ハンドラーを保存
            this.executeHandler = executeHandler;
            this.stopHandler = stopHandler;
            
            // ストレージから送信状態を取得
            const data = await chrome.storage.local.get([
                STORAGE_KEYS.SENDING_STATE,
                STORAGE_KEYS.SENDING_IN_PROGRESS
            ]);

            let currentState = SENDING_STATES.IDLE;

            // 詳細状態が利用可能な場合
            if (data[STORAGE_KEYS.SENDING_STATE] && isValidSendingState(data[STORAGE_KEYS.SENDING_STATE])) {
                currentState = data[STORAGE_KEYS.SENDING_STATE];
            } 
            // 後方互換性：古いフラグから状態を推測
            else if (data[STORAGE_KEYS.SENDING_IN_PROGRESS]) {
                currentState = SENDING_STATES.SENDING;
            }

            // 状態に応じてボタンを設定
            this.syncButtonStatesFromStorage(currentState);
            this.lastSyncedState = currentState;

            console.log(`UrlManager: Button state restored to ${currentState}`);
            return currentState;

        } catch (error) {
            console.error('UrlManager: Failed to restore button state:', error);
            // エラー時は安全に待機状態に設定
            this.setButtonsToExecuteState(executeHandler);
            return SENDING_STATES.IDLE;
        }
    }

    // ====================================
    // 後方互換性維持メソッド（元の実装から保持）
    // ====================================

    /**
     * 実行状態ボタンに設定（後方互換性）
     * @param {Function} executeHandler - 実行ハンドラー
     */
    setExecuteButtonToExecuteState(executeHandler) {
        this.setButtonsToExecuteState(executeHandler);
    }

    /**
     * 停止状態ボタンに設定（後方互換性）
     * @param {Function} stopHandler - 停止ハンドラー
     */
    setExecuteButtonToStopState(stopHandler) {
        this.setButtonsToSendingState(stopHandler);
    }

    /**
     * 無効状態ボタンに設定（後方互換性）
     */
    setExecuteButtonToDisabledState() {
        this.setButtonsToStoppingState();
    }

    /**
     * URL管理クラスの破棄（リスナークリーンアップ付き）
     */
    destroy() {
        // Debounceタイマーをクリア
        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
            this.syncDebounceTimer = null;
        }

        // ストレージリスナーを削除
        if (this.storageListener && this.isListenerRegistered) {
            try {
                chrome.storage.onChanged.removeListener(this.storageListener);
                console.log('UrlManager: Storage listener removed during cleanup');
            } catch (error) {
                console.warn('UrlManager: Failed to remove storage listener:', error);
            }
        }

        // イベントハンドラーを削除
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