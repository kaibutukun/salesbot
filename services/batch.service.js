/**
 * バッチ処理サービス
 * URL処理の実行、停止、進捗管理を担当
 */

// 共通モジュールのインポート
import { ExDB } from '../shared/database.js';
import {
    ACTION_STOP, ACTION_STOP_COMPLETED, ACTION_EXECUTE,
    PROGRESS_UPDATE_INTERVAL, SENDING_STATES, STORAGE_KEYS,
    isValidSendingState, isValidStateTransition
} from '../shared/constants.js';
import { ProgressMonitor } from '../modules/progress-monitor.js';

/**
 * バッチ処理サービスクラス
 */
export class BatchService {
    constructor(dependencies = {}) {
        // 依存性注入
        this.showToastFunction = dependencies.showToast || null;
        this.urlManager = dependencies.urlManager || null;
        this.dashboard = dependencies.dashboard || null;
        this.authService = dependencies.authService || null;
        this.refreshDashboardFunction = dependencies.refreshDashboard || null;

        // 内部状態（詳細化）
        this.currentState = SENDING_STATES.IDLE;

        // Chrome runtime listener reference
        this.stopStateListener = null;
        this.listenerAttached = false;

        // ProgressMonitorインスタンスを作成
        this.progressMonitor = new ProgressMonitor({
            showToast: this.showToastFunction,
            onProgressCompleted: this.handleProgressCompleted.bind(this),
            onProgressUpdate: this.handleProgressUpdate.bind(this)
        });

        // 初期化
        this.initialize();
    }

    /**
     * サービスを初期化
     */
    initialize() {
        this.setupStopStateListener();
        this.startProgressMonitoring();
    }

    /**
     * トーストメッセージを表示
     * @param {string} message - 表示メッセージ
     * @param {string} type - メッセージタイプ
     */
    showToast(message, type = 'info') {
        if (this.showToastFunction) {
            this.showToastFunction(message, type);
        }
    }

    /**
     * ダッシュボードをリフレッシュ
     */
    async refreshDashboard() {
        if (this.refreshDashboardFunction) {
            await this.refreshDashboardFunction();
        }
    }

    // ====================================
    // タブライフサイクル管理（新機能）
    // ====================================

    /**
     * 元のタブID（送信開始前のタブ）をストレージに記録
     * @param {number} tabId - 記録するタブID
     */
    async storeOriginalTabId(tabId) {
        try {
            await chrome.storage.local.set({ 
                'originalTabId': tabId,
                'originalTabTimestamp': Date.now()
            });
            console.log(`Original tab ID stored: ${tabId}`);
        } catch (error) {
            console.error('Failed to store original tab ID:', error);
        }
    }

    /**
     * 記録された元のタブIDを取得
     * @returns {Promise<number|null>} タブID（なければnull）
     */
    async getStoredOriginalTabId() {
        try {
            const data = await chrome.storage.local.get(['originalTabId', 'originalTabTimestamp']);
            
            // タブIDが記録されていない場合
            if (!data.originalTabId) {
                return null;
            }

            // 記録から2時間以上経過している場合は無効とする
            const twoHours = 2 * 60 * 60 * 1000;
            if (data.originalTabTimestamp && (Date.now() - data.originalTabTimestamp) > twoHours) {
                await this.clearOriginalTabId();
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
    async clearOriginalTabId() {
        try {
            await chrome.storage.local.remove(['originalTabId', 'originalTabTimestamp']);
            console.log('Original tab ID cleared');
        } catch (error) {
            console.error('Failed to clear original tab ID:', error);
        }
    }

    /**
     * 現在のタブIDを取得して記録する
     * @returns {Promise<number|null>} 取得・記録されたタブID
     */
    async getCurrentAndStoreTabId() {
        try {
            // chrome.tabs.getCurrent() で現在のタブIDを取得
            const currentTab = await new Promise((resolve, reject) => {
                chrome.tabs.getCurrent((tab) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (tab) {
                        resolve(tab);
                    } else {
                        // getCurrent() が null を返す場合のフォールバック
                        // アクティブなタブを取得
                        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                            if (chrome.runtime.lastError) {
                                reject(new Error(chrome.runtime.lastError.message));
                            } else if (tabs && tabs.length > 0) {
                                resolve(tabs[0]);
                            } else {
                                reject(new Error('No active tab found'));
                            }
                        });
                    }
                });
            });

            if (currentTab && currentTab.id) {
                // 元のタブIDを記録
                await this.storeOriginalTabId(currentTab.id);
                console.log(`Current tab ID captured and stored: ${currentTab.id}`);
                return currentTab.id;
            } else {
                console.warn('Failed to get current tab ID');
                return null;
            }

        } catch (error) {
            console.error('Failed to get and store current tab ID:', error);
            
            // フォールバック: main.html URLを持つタブを検索
            try {
                const mainUrl = chrome.runtime.getURL('ui/main.html');
                const tabs = await chrome.tabs.query({ url: mainUrl });
                
                if (tabs.length > 0) {
                    const fallbackTab = tabs[0];
                    await this.storeOriginalTabId(fallbackTab.id);
                    console.log(`Fallback: main.html tab ID stored: ${fallbackTab.id}`);
                    return fallbackTab.id;
                }
            } catch (fallbackError) {
                console.error('Fallback tab ID capture failed:', fallbackError);
            }
            
            return null;
        }
    }

    /**
     * process.htmlタブIDをストレージに記録
     * @param {number} tabId - 記録するタブID
     */
    async storeProcessTabId(tabId) {
        try {
            await chrome.storage.local.set({ 
                'processTabId': tabId,
                'processTabTimestamp': Date.now()
            });
            console.log(`Process tab ID stored: ${tabId}`);
        } catch (error) {
            console.error('Failed to store process tab ID:', error);
        }
    }

    /**
     * 記録されたprocess.htmlタブIDを取得
     * @returns {Promise<number|null>} タブID（なければnull）
     */
    async getStoredProcessTabId() {
        try {
            const data = await chrome.storage.local.get(['processTabId', 'processTabTimestamp']);
            
            // タブIDが記録されていない場合
            if (!data.processTabId) {
                return null;
            }

            // 記録から1時間以上経過している場合は無効とする
            const oneHour = 60 * 60 * 1000;
            if (data.processTabTimestamp && (Date.now() - data.processTabTimestamp) > oneHour) {
                await this.clearProcessTabId();
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
    async clearProcessTabId() {
        try {
            await chrome.storage.local.remove(['processTabId', 'processTabTimestamp']);
            console.log('Process tab ID cleared');
        } catch (error) {
            console.error('Failed to clear process tab ID:', error);
        }
    }

    /**
     * main.htmlタブの検索と切り替え、またはタブ新規作成
     * @returns {Promise<number>} main.htmlタブのID
     */
    async findOrCreateMainTab() {
        try {
            // 既存のmain.htmlタブを検索
            const mainUrl = chrome.runtime.getURL('ui/main.html');
            const tabs = await chrome.tabs.query({ url: mainUrl });

            if (tabs.length > 0) {
                // 既存のmain.htmlタブがある場合は切り替え
                const mainTab = tabs[0];
                await chrome.tabs.update(mainTab.id, { active: true });
                await chrome.windows.update(mainTab.windowId, { focused: true });
                console.log(`Switched to existing main tab: ${mainTab.id}`);
                return mainTab.id;
            } else {
                // main.htmlタブがない場合は新規作成
                const newTab = await chrome.tabs.create({ url: 'ui/main.html' });
                console.log(`Created new main tab: ${newTab.id}`);
                return newTab.id;
            }
        } catch (error) {
            console.error('Failed to find or create main tab:', error);
            // フォールバック：新しいタブを作成
            try {
                const newTab = await chrome.tabs.create({ url: 'ui/main.html' });
                return newTab.id;
            } catch (fallbackError) {
                console.error('Fallback tab creation failed:', fallbackError);
                return null;
            }
        }
    }

    // ====================================
    // 状態管理（詳細化）
    // ====================================

    /**
     * 送信状態を変更する
     * @param {string} newState - 新しい状態
     * @param {boolean} updateStorage - ストレージも更新するかどうか
     */
    async setSendingState(newState, updateStorage = true) {
        if (!isValidSendingState(newState)) {
            console.error(`Invalid sending state: ${newState}`);
            return false;
        }

        if (!isValidStateTransition(this.currentState, newState)) {
            console.warn(`Invalid state transition: ${this.currentState} -> ${newState}`);
        }

        const previousState = this.currentState;
        this.currentState = newState;

        if (updateStorage) {
            try {
                await chrome.storage.local.set({ 
                    [STORAGE_KEYS.SENDING_STATE]: newState,
                    // 後方互換性のためのフラグも更新
                    [STORAGE_KEYS.SENDING_IN_PROGRESS]: newState === SENDING_STATES.SENDING
                });
            } catch (error) {
                console.error('Failed to update sending state in storage:', error);
                // ストレージ更新に失敗した場合は状態を戻す
                this.currentState = previousState;
                return false;
            }
        }

        // 状態変更に応じてUIを更新
        this.updateUIBasedOnState(newState);
        return true;
    }

    /**
     * 現在の送信状態を取得する
     * @returns {string} 現在の状態
     */
    getCurrentState() {
        return this.currentState;
    }

    /**
     * ストレージから送信状態を読み込む
     * @returns {Promise<string>} 読み込まれた状態
     */
    async loadSendingStateFromStorage() {
        try {
            const data = await chrome.storage.local.get([
                STORAGE_KEYS.SENDING_STATE,
                STORAGE_KEYS.SENDING_IN_PROGRESS
            ]);

            // 新しい詳細状態があればそれを使用
            if (data[STORAGE_KEYS.SENDING_STATE] && isValidSendingState(data[STORAGE_KEYS.SENDING_STATE])) {
                return data[STORAGE_KEYS.SENDING_STATE];
            }

            // 後方互換性：古いフラグから状態を推測
            if (data[STORAGE_KEYS.SENDING_IN_PROGRESS]) {
                return SENDING_STATES.SENDING;
            }

            return SENDING_STATES.IDLE;
        } catch (error) {
            console.error('Failed to load sending state from storage:', error);
            return SENDING_STATES.IDLE;
        }
    }

    /**
     * 状態に基づいてUIを更新する
     * @param {string} state - 現在の状態
     */
    updateUIBasedOnState(state) {
        if (!this.urlManager) return;

        switch (state) {
            case SENDING_STATES.IDLE:
                this.urlManager.setButtonsToExecuteState(() => this.executeButtonHandler());
                if (this.dashboard) {
                    this.dashboard.updateSendingStatus('待機中', false);
                }
                break;

            case SENDING_STATES.SENDING:
                this.urlManager.setButtonsToSendingState(() => this.stopButtonHandler());
                if (this.dashboard) {
                    this.dashboard.updateSendingStatus('送信中...', true);
                }
                break;

            case SENDING_STATES.STOPPING:
                this.urlManager.setButtonsToStoppingState();
                if (this.dashboard) {
                    this.dashboard.updateSendingStatus('停止処理中...', false);
                }
                break;

            case SENDING_STATES.COMPLETED:
                this.urlManager.setButtonsToExecuteState(() => this.executeButtonHandler());
                if (this.dashboard) {
                    this.dashboard.updateSendingStatus('完了', false);
                }
                break;
        }
    }

    /**
     * 停止状態リスナーを設定する（修正版）
     */
    setupStopStateListener() {
        // 既存のリスナーを削除
        if (this.stopStateListener && this.listenerAttached) {
            try {
                chrome.runtime.onMessage.removeListener(this.stopStateListener);
                this.listenerAttached = false;
            } catch (error) {
                // リスナーが存在しない場合のエラーを無視
                console.warn('Failed to remove existing listener:', error.message);
            }
        }

        this.stopStateListener = (message, sender, sendResponse) => {
            if (message.action === ACTION_STOP_COMPLETED) {
                this.handleStopCompleted();

                try {
                    sendResponse({ success: true });
                } catch (error) {
                    // エラーを無視
                }
            }
        };

        try {
            chrome.runtime.onMessage.addListener(this.stopStateListener);
            this.listenerAttached = true;
        } catch (error) {
            console.error('Failed to add stop state listener:', error);
        }
    }

    /**
     * 停止完了時の処理
     */
    async handleStopCompleted() {
        // 状態を完了に変更
        await this.setSendingState(SENDING_STATES.COMPLETED);

        // ダッシュボードをリセット
        if (this.dashboard) {
            this.dashboard.resetProgress();
        }

        // 少し待ってから待機状態に戻す
        setTimeout(async () => {
            await this.setSendingState(SENDING_STATES.IDLE);
        }, 1000);
    }

    /**
     * 実行ボタンのイベントハンドラー（処理順序修正版 + 元タブID記録機能追加）
     */
    async executeButtonHandler() {
        try {
            // 現在の状態をチェック
            if (this.currentState !== SENDING_STATES.IDLE && this.currentState !== SENDING_STATES.COMPLETED) {
                this.showToast('送信処理が既に実行中です', 'warning');
                return;
            }

            // ====================================
            // Phase 1: 元タブID記録機能
            // ====================================
            
            console.log('Capturing and storing original tab ID before sending...');
            const originalTabId = await this.getCurrentAndStoreTabId();
            
            if (originalTabId) {
                this.showToast('送信準備完了：元のタブを記録しました', 'info');
            } else {
                // 元タブIDの取得に失敗しても処理を続行（警告のみ）
                console.warn('Failed to capture original tab ID, but continuing with execution');
                this.showToast('警告：元のタブの記録に失敗しましたが、処理を続行します', 'warning');
            }

            // ライセンス確認
            if (this.authService) {
                const isLicenseValid = await this.authService.isLicenseValid();
                if (!isLicenseValid) {
                    this.showToast('有効なライセンスが必要です', 'warning');
                    return;
                }
            } else {
                // fallback: 直接確認
                const licenseData = await chrome.storage.sync.get('validLicense');
                if (!licenseData.validLicense) {
                    this.showToast('有効なライセンスが必要です', 'warning');
                    return;
                }
            }

            // データベースの初期化と確認
            const db = new ExDB();
            try {
                await db.openDB();
            } catch (dbError) {
                this.showToast('データベースの初期化に失敗しました', 'error');
                return;
            }

            // ====================================
            // 修正された処理順序：自動保存 → バリデーション
            // ====================================

            let urlsToProcess = [];
            
            if (this.urlManager) {
                // Step 1: テキストエリアから現在のURLリストを取得
                urlsToProcess = this.urlManager.getCurrentUrls();
                
                // Step 2: URLがテキストエリアに入力されていれば自動保存
                if (urlsToProcess.length > 0) {
                    console.log(`Auto-saving ${urlsToProcess.length} URLs before validation`);
                    await this.urlManager.saveUrlList();
                    // 保存完了を確実に待機
                    await new Promise(resolve => setTimeout(resolve, 800));
                }
                
                // Step 3: 保存後にバリデーション実行
                const urlValidation = await this.urlManager.validateUrlList();
                if (!urlValidation.isValid) {
                    this.showToast(urlValidation.message, 'warning');
                    return;
                }
                
                console.log('URL validation passed:', urlValidation.message);
            }

            // 最新のTodoを取得
            let latestTodo = await db.getLatestTodo();

            // タスクが存在しない場合は手動で作成（フォールバック）
            if (!latestTodo) {
                if (urlsToProcess.length === 0) {
                    this.showToast('URLリストが設定されていません', 'warning');
                    return;
                }
                
                const now = new Date();
                const title = `手動作成 ${now.toLocaleString('ja-JP')}`;
                const description = urlsToProcess.map(url => ({
                    url: url.trim(),
                    result: '',
                    contact: '',
                    reason: ''
                }));
                
                const newTodoResult = await db.addTodo(title, description);
                latestTodo = await db.getTodoById(newTodoResult.id || newTodoResult);
            }

            if (!latestTodo || !latestTodo.description || latestTodo.description.length === 0) {
                this.showToast('有効なタスクが見つかりません', 'error');
                return;
            }

            if (!latestTodo.completed) {
                const processed = latestTodo.description.filter(item => item.result !== '').length;
                if (processed > 0) {
                    this.showToast('送信処理が進行中です', 'warning');
                    return;
                }
            }

            if (!confirm(`${latestTodo.description.length}件のURLに対して送信を開始しますか？`)) {
                return;
            }

            // 新しいタスクを作成（完了済みの場合）
            if (latestTodo.completed) {
                const now = new Date();
                const title = now.toLocaleString('ja-JP');
                const newDescription = latestTodo.description.map(item => ({
                    url: item.url,
                    result: '',
                    contact: '',
                    reason: ''
                }));
                
                await db.addTodo(title, newDescription);
                
                // 新しいタスクの書き込み完了を待機
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // 状態を送信中に変更
            await this.setSendingState(SENDING_STATES.SENDING);

            await this.refreshDashboard();

            // 処理用タブを作成
            const tab = await chrome.tabs.create({ url: 'ui/process.html' });
            
            // タブIDをストレージに記録（タブライフサイクル管理）
            await this.storeProcessTabId(tab.id);
            
            // 確実にタブが作成されるまで待機
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // バックグラウンドスクリプトに実行メッセージを送信
            chrome.runtime.sendMessage({ 
                action: ACTION_EXECUTE, 
                tabId: tab.id
            });

            this.showToast('送信を開始しました', 'success');
            console.log(`Execution started - Original tab: ${originalTabId}, Process tab: ${tab.id}`);
            
        } catch (error) {
            this.showToast('送信開始に失敗しました: ' + error.message, 'error');
            
            // エラー時は状態をリセット
            await this.setSendingState(SENDING_STATES.IDLE);
        }
    }

    /**
     * 停止ボタンのイベントハンドラー
     */
    async stopButtonHandler() {
        try {
            if (this.currentState !== SENDING_STATES.SENDING) {
                this.showToast('停止できる処理がありません', 'warning');
                return;
            }

            if (!confirm('送信処理を停止しますか？')) {
                return;
            }

            // 状態を停止処理中に変更
            await this.setSendingState(SENDING_STATES.STOPPING);

            chrome.runtime.sendMessage({ action: ACTION_STOP }, (response) => {
                if (chrome.runtime.lastError) {
                    // エラーを無視
                }
            });

            this.showToast('送信処理を停止しています...', 'info');

        } catch (error) {
            this.showToast('送信停止に失敗しました', 'error');
            // エラー時は送信中状態に戻す
            await this.setSendingState(SENDING_STATES.SENDING);
        }
    }

    /**
     * 送信状態を確認して復元する（詳細版）
     */
    async checkAndRestoreSendingState() {
        try {
            // ストレージから状態を読み込み
            const storedState = await this.loadSendingStateFromStorage();
            
            if (storedState === SENDING_STATES.IDLE) {
                // 待機状態の場合はそのまま設定
                await this.setSendingState(SENDING_STATES.IDLE, false);
                return;
            }

            // データベースの状態もチェック
            const db = new ExDB();
            const latestTodo = await db.getLatestTodo();
            
            if (!latestTodo || !latestTodo.description) {
                // タスクがない場合は待機状態に設定
                await this.setSendingState(SENDING_STATES.IDLE);
                return;
            }

            if (latestTodo.completed) {
                // タスクが完了済みの場合は待機状態に設定
                await this.setSendingState(SENDING_STATES.IDLE);
                return;
            }

            // 処理済みアイテムの状況を確認
            const hasProcessed = latestTodo.description.some(item => item.result !== '');
            const allProcessed = latestTodo.description.every(item => item.result !== '');

            if (allProcessed) {
                // 全て処理済みの場合は完了状態に設定
                await this.setSendingState(SENDING_STATES.COMPLETED);
                return;
            }

            // ストレージの状態に応じて復元
            switch (storedState) {
                case SENDING_STATES.SENDING:
                    // 送信中状態を復元
                    await this.setSendingState(SENDING_STATES.SENDING, false);
                    break;

                case SENDING_STATES.STOPPING:
                    // 停止処理中状態を復元
                    await this.setSendingState(SENDING_STATES.STOPPING, false);
                    break;

                case SENDING_STATES.COMPLETED:
                    if (hasProcessed) {
                        // 一部処理済みで完了状態の場合は、実際は停止された可能性
                        await this.setSendingState(SENDING_STATES.COMPLETED, false);
                    } else {
                        // 未処理の場合は待機状態に戻す
                        await this.setSendingState(SENDING_STATES.IDLE);
                    }
                    break;

                default:
                    // 不明な状態の場合は待機状態に設定
                    await this.setSendingState(SENDING_STATES.IDLE);
                    break;
            }

        } catch (error) {
            console.error('Failed to restore sending state:', error);
            // エラー時は安全に待機状態に設定
            await this.setSendingState(SENDING_STATES.IDLE);
        }
    }

    // ====================================
    // ProgressMonitorコールバック関数
    // ====================================

    /**
     * 進捗完了時のコールバック
     * @param {Object} progressInfo - 進捗情報
     */
    async handleProgressCompleted(progressInfo) {
        try {
            // 状態を完了に変更
            await this.setSendingState(SENDING_STATES.COMPLETED);

            // ダッシュボードを更新
            await this.refreshDashboard();

            // 少し待ってから待機状態に戻す
            setTimeout(async () => {
                await this.setSendingState(SENDING_STATES.IDLE);
            }, 2000);
        } catch (error) {
            console.error('Failed to handle progress completion:', error);
        }
    }

    /**
     * 進捗更新時のコールバック
     * @param {Object} progressInfo - 進捗情報
     */
    async handleProgressUpdate(progressInfo) {
        try {
            // ダッシュボードの定期更新
            if (this.dashboard) {
                await this.dashboard.refreshDashboard();
            }
        } catch (error) {
            // エラーが発生しても監視は継続
        }
    }

    // ====================================
    // 進捗監視制御（ProgressMonitor委譲）
    // ====================================

    /**
     * 進捗監視を開始する
     */
    startProgressMonitoring() {
        if (this.progressMonitor) {
            this.progressMonitor.startProgressMonitoring();
        }
    }

    /**
     * 進捗をチェックする（ProgressMonitor委譲）
     */
    async checkProgress() {
        if (this.progressMonitor) {
            await this.progressMonitor.checkProgress();
        }
    }

    /**
     * 進捗監視を停止する（ProgressMonitor委譲）
     */
    stopProgressMonitoring() {
        if (this.progressMonitor) {
            this.progressMonitor.stopProgressMonitoring();
        }
    }

    /**
     * 現在の実行状態を取得する
     * @returns {Object} 実行状態オブジェクト
     */
    getExecutionState() {
        return {
            currentState: this.currentState,
            isProgressMonitoring: this.progressMonitor ? this.progressMonitor.getMonitoringState().isMonitoring : false
        };
    }

    /**
     * バッチ処理が実行中かどうかを確認する
     * @returns {Promise<boolean>} 実行中の場合はtrue
     */
    async isExecuting() {
        return this.currentState === SENDING_STATES.SENDING;
    }

    /**
     * 現在のバッチ処理タスクの進捗情報を取得する（ProgressMonitor委譲）
     * @returns {Promise<Object>} 進捗情報オブジェクト
     */
    async getBatchProgress() {
        if (this.progressMonitor) {
            return await this.progressMonitor.getBatchProgress();
        }
        
        // フォールバック（空の進捗情報）
        return {
            total: 0,
            processed: 0,
            completed: 0,
            failed: 0,
            pending: 0,
            isCompleted: false,
            progress: 0,
            title: '',
            startTime: null
        };
    }

    /**
     * バッチ処理を手動で停止する（UI操作なし）
     * @returns {Promise<boolean>} 停止成功時はtrue
     */
    async stopBatch() {
        try {
            return new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: ACTION_STOP }, (response) => {
                    if (chrome.runtime.lastError) {
                        resolve(false);
                    } else {
                        resolve(true);
                    }
                });
            });
        } catch (error) {
            return false;
        }
    }

    /**
     * バッチ処理の状態をリセットする
     */
    async resetBatchState() {
        try {
            // 進捗監視を停止
            this.stopProgressMonitoring();

            // 状態を待機中に設定
            await this.setSendingState(SENDING_STATES.IDLE);

            // 進捗監視を再開
            this.startProgressMonitoring();

            this.showToast('バッチ処理状態をリセットしました', 'info');
        } catch (error) {
            this.showToast('状態リセットに失敗しました', 'error');
        }
    }

    /**
     * サービスを破棄する（クリーンアップ）
     */
    destroy() {
        // 進捗監視を停止
        this.stopProgressMonitoring();

        // Chrome runtime listenerを削除
        if (this.stopStateListener && this.listenerAttached) {
            try {
                chrome.runtime.onMessage.removeListener(this.stopStateListener);
                this.listenerAttached = false;
            } catch (error) {
                console.warn('Failed to remove listener during cleanup:', error.message);
            }
        }

        // 参照をクリア
        this.showToastFunction = null;
        this.urlManager = null;
        this.dashboard = null;
        this.authService = null;
        this.refreshDashboardFunction = null;
        this.stopStateListener = null;
    }

    /**
     * 実行ボタンハンドラーを取得する（外部アクセス用）
     * @returns {Function} 実行ボタンハンドラー関数
     */
    getExecuteButtonHandler() {
        return () => this.executeButtonHandler();
    }

    /**
     * 停止ボタンハンドラーを取得する（外部アクセス用）
     * @returns {Function} 停止ボタンハンドラー関数
     */
    getStopButtonHandler() {
        return () => this.stopButtonHandler();
    }
}

/**
 * バッチサービスインスタンスを作成
 * @param {Object} dependencies - 依存性オブジェクト
 * @returns {BatchService} バッチサービスインスタンス
 */
export function createBatchService(dependencies = {}) {
    return new BatchService(dependencies);
}